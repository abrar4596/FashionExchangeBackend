const Listing = require('../models/Listing');
const User = require('../models/User');
const SwapRequest = require('../models/SwapRequest');
const {
  isCityNameUniqueAcrossStates,
  resolveCityInput,
} = require('../utils/location');
const { publishRealtimeEvent } = require('../utils/realtime');

const escapeRegex = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// @desc    Get all available listings with multi-dimensional filtering
// @route   GET /api/listings
// @access  Public
const getListings = async (req, res) => {
  try {
    const {
      search,
      category,
      city,
      cityId,
      condition,
      size,
      minValue,
      maxValue,
      sort,
      page = 1,
      limit = 20,
    } = req.query;

    const query = { status: 'available' };

    // Text search on title, brand, description
    if (search && search.trim()) {
      query.$text = { $search: search.trim() };
    }

    // Category filter
    if (category && category !== 'All' && category !== 'all') {
      query.category = category;
    }

    // City / Location filter (PRD core requirement)
    if ((city && city !== 'All' && city !== 'all') || cityId) {
      const location = resolveCityInput(city, cityId);
      const [cityName, ...stateParts] = location.city.split(',');
      const stateName = stateParts.join(',').trim();
      let legacyCityPattern;
      if (location.cityId) {
        const legacyValues = [`${cityName.trim()}, ${stateName}`];
        if (isCityNameUniqueAcrossStates(cityName.trim())) {
          legacyValues.push(cityName.trim());
        }
        legacyCityPattern = `^(?:${legacyValues.map(escapeRegex).join('|')})$`;
      } else if (stateName) {
        legacyCityPattern = `^${escapeRegex(location.city)}$`;
      } else {
        legacyCityPattern = `^${escapeRegex(cityName.trim())}(?:\\s*,\\s*.+)?$`;
      }
      const legacyCityFilter = {
        city: { $regex: new RegExp(legacyCityPattern, 'i') },
      };
      if (location.cityId) legacyCityFilter.cityId = { $exists: false };
      query.$or = [
        ...(location.cityId ? [{ cityId: location.cityId }] : []),
        legacyCityFilter,
      ];
    }

    // Condition filter (supports multiple comma-separated)
    if (condition) {
      const conditions = condition.split(',').map((c) => c.trim());
      query.condition = { $in: conditions };
    }

    // Size filter (supports multiple comma-separated)
    if (size) {
      const sizes = size.split(',').map((s) => s.trim());
      query.size = { $in: sizes };
    }

    // Estimated swap value range
    if (minValue || maxValue) {
      query.estimatedValue = {};
      if (minValue) query.estimatedValue.$gte = Number(minValue);
      if (maxValue) query.estimatedValue.$lte = Number(maxValue);
    }

    // Sort order
    let sortOption = { createdAt: -1 }; // newest by default
    if (sort === 'value_asc') {
      sortOption = { estimatedValue: 1 };
    } else if (sort === 'value_desc') {
      sortOption = { estimatedValue: -1 };
    } else if (sort === 'oldest') {
      sortOption = { createdAt: 1 };
    }

    const pageNum = parseInt(page, 10);
    const limitNum = parseInt(limit, 10);
    const skip = (pageNum - 1) * limitNum;

    const total = await Listing.countDocuments(query);
    const listings = await Listing.find(query)
      .populate('owner', 'name city avatarUrl completedSwapsCount activeListingsCount')
      .sort(sortOption)
      .skip(skip)
      .limit(limitNum);

    return res.json({
      listings,
      pagination: {
        page: pageNum,
        limit: limitNum,
        total,
        pages: Math.ceil(total / limitNum) || 1,
      },
    });
  } catch (error) {
    console.error('Get listings error:', error);
    return res.status(error.statusCode || 500).json({ message: error.message || 'Server error fetching listings' });
  }
};

// @desc    Get single listing by ID
// @route   GET /api/listings/:id
// @access  Public
const getListingById = async (req, res) => {
  try {
    const listing = await Listing.findById(req.params.id).populate(
      'owner',
      'name email city bio avatarUrl completedSwapsCount activeListingsCount createdAt'
    );

    if (!listing) {
      return res.status(404).json({ message: 'Clothing listing not found' });
    }

    return res.json(listing);
  } catch (error) {
    console.error('Get listing by ID error:', error);
    return res.status(500).json({ message: error.message || 'Server error fetching listing' });
  }
};

// @desc    Create a new clothing listing
// @route   POST /api/listings
// @access  Private
const createListing = async (req, res) => {
  try {
    const { title, description, category, brand, size, condition, estimatedValue, city, cityId } = req.body;

    // Collect image paths from uploaded files or body
    let images = [];
    if (req.files && req.files.length > 0) {
      images = req.files.map((file) => `/uploads/${file.filename}`);
    } else if (req.body.images) {
      images = Array.isArray(req.body.images) ? req.body.images : [req.body.images];
    }

    if (images.length === 0) {
      return res.status(400).json({ message: 'Please provide at least one photo of the item' });
    }

    const location = city || cityId
      ? resolveCityInput(city, cityId)
      : resolveCityInput(req.user.city, req.user.cityId);
    const listing = await Listing.create({
      title: title.trim(),
      description: description.trim(),
      category,
      brand: brand ? brand.trim() : 'Unbranded',
      size,
      condition,
      estimatedValue: Number(estimatedValue),
      city: location.city,
      cityId: location.cityId,
      images,
      owner: req.user._id,
      status: 'available',
    });

    // Increment owner active listings count
    await User.findByIdAndUpdate(req.user._id, { $inc: { activeListingsCount: 1 } });

    const populated = await Listing.findById(listing._id).populate(
      'owner',
      'name city avatarUrl completedSwapsCount activeListingsCount'
    );

    publishRealtimeEvent(req, 'listing:created', [req.user._id], {
      listingId: listing._id.toString(),
    });
    return res.status(201).json(populated);
  } catch (error) {
    console.error('Create listing error:', error);
    return res.status(error.statusCode || 500).json({ message: error.message || 'Server error creating listing' });
  }
};

// @desc    Update a clothing listing
// @route   PUT /api/listings/:id
// @access  Private
const updateListing = async (req, res) => {
  try {
    const listing = await Listing.findById(req.params.id);
    if (!listing) {
      return res.status(404).json({ message: 'Listing not found' });
    }

    // Check ownership
    if (listing.owner.toString() !== req.user._id.toString() && req.user.role !== 'admin') {
      return res.status(403).json({ message: 'Not authorized to edit this listing' });
    }

    const { title, description, category, brand, size, condition, estimatedValue, city, cityId, status } = req.body;

    if (title) listing.title = title.trim();
    if (description) listing.description = description.trim();
    if (category) listing.category = category;
    if (brand !== undefined) listing.brand = brand.trim() || 'Unbranded';
    if (size) listing.size = size;
    if (condition) listing.condition = condition;
    if (estimatedValue) listing.estimatedValue = Number(estimatedValue);
    const location = resolveCityInput(city, cityId);
    if (location) {
      listing.city = location.city;
      listing.cityId = location.cityId;
    }
    if (status) listing.status = status;

    if (req.files && req.files.length > 0) {
      const newImages = req.files.map((file) => `/uploads/${file.filename}`);
      listing.images = [...listing.images, ...newImages].slice(0, 8);
    }

    const updated = await listing.save();
    publishRealtimeEvent(req, 'listing:updated', [listing.owner, req.user._id], {
      listingId: listing._id.toString(),
    });
    return res.json(updated);
  } catch (error) {
    console.error('Update listing error:', error);
    return res.status(error.statusCode || 500).json({ message: error.message || 'Server error updating listing' });
  }
};

// @desc    Delete a clothing listing
// @route   DELETE /api/listings/:id
// @access  Private
const deleteListing = async (req, res) => {
  try {
    const listing = await Listing.findById(req.params.id);
    if (!listing) {
      return res.status(404).json({ message: 'Listing not found' });
    }

    // Check ownership or admin role
    if (listing.owner.toString() !== req.user._id.toString() && req.user.role !== 'admin') {
      return res.status(403).json({ message: 'Not authorized to delete this listing' });
    }

    const shouldDecrementActiveCount = listing.status !== 'swapped';
    await Listing.findByIdAndDelete(req.params.id);

    if (shouldDecrementActiveCount) {
      await User.findByIdAndUpdate(listing.owner, { $inc: { activeListingsCount: -1 } });
    }

    const affectedSwaps = await SwapRequest.find({
      $or: [{ requestedItem: listing._id }, { offeredItem: listing._id }],
      status: { $in: ['pending', 'accepted'] },
    }).select('requester receiver requestedItem offeredItem');
    await SwapRequest.updateMany(
      { _id: { $in: affectedSwaps.map((swap) => swap._id) } },
      { $set: { status: 'cancelled' } }
    );
    const counterpartIds = affectedSwaps.map((swap) =>
      swap.requestedItem.equals(listing._id) ? swap.offeredItem : swap.requestedItem
    );
    const restoredListings = await Listing.find({
      _id: { $in: counterpartIds },
      status: 'pending_swap',
    }).select('_id owner');
    await Listing.updateMany(
      { _id: { $in: restoredListings.map((item) => item._id) } },
      { $set: { status: 'available' } }
    );
    for (const restored of restoredListings) {
      publishRealtimeEvent(req, 'listing:updated', [restored.owner], {
        listingId: restored._id.toString(),
      });
    }
    publishRealtimeEvent(req, 'listing:deleted', [listing.owner, req.user._id], {
      listingId: listing._id.toString(),
    });
    for (const swap of affectedSwaps) {
      publishRealtimeEvent(req, 'swap:statusChanged', [swap.requester, swap.receiver], {
        swapId: swap._id.toString(),
        status: 'cancelled',
      });
    }
    return res.json({ message: 'Listing removed successfully', id: req.params.id });
  } catch (error) {
    console.error('Delete listing error:', error);
    return res.status(500).json({ message: error.message || 'Server error deleting listing' });
  }
};

// @desc    Get user's personal closet items
// @route   GET /api/listings/user/closet
// @access  Private
const getUserCloset = async (req, res) => {
  try {
    const userId = req.user._id;
    const [listings, completedSwaps, pendingSwapRequests] = await Promise.all([
      Listing.find({ owner: userId }).sort({ createdAt: -1 }),
      SwapRequest.countDocuments({
        $or: [{ requester: userId }, { receiver: userId }],
        status: 'completed',
      }),
      SwapRequest.find({
        $or: [{ requester: userId }, { receiver: userId }],
        status: 'pending',
      }).select('requestedItem offeredItem'),
    ]);

    const pendingRequestListingIds = new Set(
      pendingSwapRequests.flatMap((swap) => [
        swap.requestedItem.toString(),
        swap.offeredItem.toString(),
      ])
    );
    const available = listings.filter(
      (item) => item.status === 'available' && !pendingRequestListingIds.has(item._id.toString())
    );
    const pending = listings.filter(
      (item) =>
        item.status === 'pending_swap' ||
        pendingRequestListingIds.has(item._id.toString())
    );
    const swapped = listings.filter((item) => item.status === 'swapped');
    const profile = {
      _id: req.user._id,
      name: req.user.name,
      email: req.user.email,
      city: req.user.city,
      cityId: req.user.cityId,
      bio: req.user.bio,
      avatarUrl: req.user.avatarUrl,
      role: req.user.role,
    };

    return res.json({
      profile,
      all: listings,
      available,
      pending,
      swapped,
      history: swapped,
      totalCount: listings.length,
      stats: {
        activeClothes: available.length,
        availableToSwap: available.length,
        pendingSwaps: pending.length,
        pendingRequests: pendingSwapRequests.length,
        swappedHistory: swapped.length,
        completedSwaps,
      },
    });
  } catch (error) {
    console.error('Get user closet error:', error);
    return res.status(500).json({ message: error.message || 'Server error fetching user closet' });
  }
};

module.exports = {
  getListings,
  getListingById,
  createListing,
  updateListing,
  deleteListing,
  getUserCloset,
};
