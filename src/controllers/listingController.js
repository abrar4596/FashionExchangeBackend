const Listing = require('../models/Listing');
const User = require('../models/User');
const SwapRequest = require('../models/SwapRequest');
const {
  isCityNameUniqueAcrossStates,
  resolveCityInput,
} = require('../utils/location');
const { publishRealtimeEvent } = require('../utils/realtime');
const asyncHandler = require('../utils/asyncHandler');
const { uploadBuffer } = require('../utils/cloudinary');

const escapeRegex = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const MAX_LISTING_IMAGES = 8;

// Streams every in-memory upload to Cloudinary and returns the public HTTPS URLs that are
// persisted on the listing. Buffers never touch disk, so this is serverless-safe.
const uploadListingImages = async (files = []) => {
  const urls = [];
  for (const file of files) {
    const result = await uploadBuffer(file.buffer, {
      folder: 'fashion-exchange/listings',
    });
    if (result && result.secure_url) urls.push(result.secure_url);
  }
  return urls;
};

// Merges freshly uploaded Cloudinary URLs with any image URLs posted as plain text fields
// (the form lets a user paste an external URL instead of choosing a file).
const collectListingImages = async (req) => {
  const files = Array.isArray(req.files) ? req.files : [];
  const bodyImages = req.body.images
    ? (Array.isArray(req.body.images) ? req.body.images : [req.body.images])
    : [];

  const uploaded = files.length > 0 ? await uploadListingImages(files) : [];

  return [...uploaded, ...bodyImages]
    .filter((value) => typeof value === 'string' && value.trim())
    .map((value) => value.trim())
    .slice(0, MAX_LISTING_IMAGES);
};

const respondWithUploadError = (res, uploadError) =>
  res.status(uploadError.statusCode || 502).json({
    success: false,
    message: uploadError.message || 'Image upload failed. Please try again.',
    code: uploadError.apiCode || 'IMAGE_UPLOAD_FAILED',
  });

// @desc    Get all available listings with multi-dimensional filtering
// @route   GET /api/listings
// @access  Public
const getListings = async (req, res, next) => {
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
    return next(error);
  }
};

// @desc    Get single listing by ID
// @route   GET /api/listings/:id
// @access  Public
const getListingById = async (req, res, next) => {
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
    return next(error);
  }
};

// @desc    Create a new clothing listing
// @route   POST /api/listings
// @access  Private
const createListing = async (req, res, next) => {
  try {
    const { title, description, category, brand, size, condition, estimatedValue, city, cityId } = req.body;

    // Stream any uploaded files to Cloudinary, then merge with pasted image URLs
    let images = [];
    try {
      images = await collectListingImages(req);
    } catch (uploadError) {
      console.error(JSON.stringify({
        level: 'error',
        timestamp: new Date().toISOString(),
        scope: 'create-listing-upload',
        userId: req.user && req.user._id,
        code: uploadError.apiCode,
        message: uploadError.message,
      }));
      return respondWithUploadError(res, uploadError);
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
    // Surface the exact cause instead of a generic message so the client (and Vercel logs)
    // can pinpoint whether this was a validation rejection, a write failure, or bad upload input.
    console.error('Listing creation error details:', {
      timestamp: new Date().toISOString(),
      scope: 'create-listing',
      name: error.name,
      message: error.message,
      stack: error.stack,
      userId: req.user && req.user._id,
      fields: Object.keys(req.body || {}),
      fileCount: Array.isArray(req.files) ? req.files.length : 0,
    });

    if (error.name === 'ValidationError') {
      return res.status(400).json({
        success: false,
        message: error.message || 'Failed to create listing',
        details: Object.fromEntries(
          Object.entries(error.errors || {}).map(([field, detail]) => [field, detail.message])
        ),
      });
    }

    return res.status(500).json({
      success: false,
      message: error.message || 'Failed to create listing',
      details: error.errors || null,
    });
  }
};

// @desc    Update a clothing listing
// @route   PUT /api/listings/:id
// @access  Private
const updateListing = async (req, res, next) => {
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
      let newImages;
      try {
        newImages = await uploadListingImages(req.files);
      } catch (uploadError) {
        return respondWithUploadError(res, uploadError);
      }
      listing.images = [...listing.images, ...newImages].slice(0, MAX_LISTING_IMAGES);
    }

    const updated = await listing.save();
    publishRealtimeEvent(req, 'listing:updated', [listing.owner, req.user._id], {
      listingId: listing._id.toString(),
    });
    return res.json(updated);
  } catch (error) {
    return next(error);
  }
};

// @desc    Delete a clothing listing
// @route   DELETE /api/listings/:id
// @access  Private
const deleteListing = async (req, res, next) => {
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
    return next(error);
  }
};

// @desc    Get user's personal closet items
// @route   GET /api/listings/user/closet
// @access  Private
const getUserCloset = async (req, res, next) => {
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
    return next(error);
  }
};

module.exports = {
  getListings: asyncHandler(getListings),
  getListingById: asyncHandler(getListingById),
  createListing: asyncHandler(createListing),
  updateListing: asyncHandler(updateListing),
  deleteListing: asyncHandler(deleteListing),
  getUserCloset: asyncHandler(getUserCloset),
};
