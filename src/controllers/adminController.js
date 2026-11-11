const User = require('../models/User');
const Listing = require('../models/Listing');
const SwapRequest = require('../models/SwapRequest');
const { publishRealtimeEvent } = require('../utils/realtime');

const getDashboard = async (req, res) => {
  try {
    const [
      totalUsers,
      activeListings,
      pendingListings,
      swappedListings,
      totalListings,
      totalSwaps,
      completedSwaps,
      acceptedSwaps,
      pendingSwaps,
      regionalBreakdown,
      categoryBreakdown,
      users,
      listings,
      swaps,
      activeSwaps,
      recentUsers,
      recentListings,
      recentSwaps,
    ] = await Promise.all([
      User.countDocuments(),
      Listing.countDocuments({ status: 'available' }),
      Listing.countDocuments({ status: 'pending_swap' }),
      Listing.countDocuments({ status: 'swapped' }),
      Listing.countDocuments(),
      SwapRequest.countDocuments(),
      SwapRequest.countDocuments({ status: 'completed' }),
      SwapRequest.countDocuments({ status: 'accepted' }),
      SwapRequest.countDocuments({ status: 'pending' }),
      Listing.aggregate([
        { $match: { status: 'available' } },
        { $group: { _id: '$city', count: { $sum: 1 } } },
        { $sort: { count: -1 } },
        { $limit: 10 },
      ]),
      Listing.aggregate([
        { $match: { status: 'available' } },
        { $group: { _id: '$category', count: { $sum: 1 } } },
        { $sort: { count: -1 } },
      ]),
      User.find().select('-password').sort({ createdAt: -1 }).limit(100).lean(),
      Listing.find().populate('owner', 'name email city').sort({ createdAt: -1 }).limit(100).lean(),
      SwapRequest.find()
        .populate('requester', 'name email city')
        .populate('receiver', 'name email city')
        .populate('requestedItem', 'title brand images estimatedValue')
        .populate('offeredItem', 'title brand images estimatedValue')
        .sort({ updatedAt: -1 })
        .limit(100)
        .lean(),
      SwapRequest.find({ status: { $in: ['pending', 'accepted'] } })
        .populate('requester', 'name email city')
        .populate('receiver', 'name email city')
        .populate('requestedItem', 'title brand images estimatedValue')
        .populate('offeredItem', 'title brand images estimatedValue')
        .sort({ updatedAt: -1 })
        .limit(100)
        .lean(),
      User.find().select('name createdAt').sort({ createdAt: -1 }).limit(10).lean(),
      Listing.find().select('title createdAt owner').sort({ createdAt: -1 }).limit(10).lean(),
      SwapRequest.find()
        .select('status createdAt updatedAt requester receiver')
        .sort({ updatedAt: -1 })
        .limit(10)
        .lean(),
    ]);

    const recentActivity = [
      ...recentUsers.map((user) => ({
        type: 'user:registered',
        entityId: user._id,
        label: `${user.name} joined`,
        occurredAt: user.createdAt,
      })),
      ...recentListings.map((listing) => ({
        type: 'listing:created',
        entityId: listing._id,
        label: `${listing.title} was listed`,
        occurredAt: listing.createdAt,
      })),
      ...recentSwaps.map((swap) => ({
        type: 'swap:statusChanged',
        entityId: swap._id,
        label: `Swap ${swap.status}`,
        occurredAt: swap.updatedAt,
      })),
    ]
      .sort((left, right) => new Date(right.occurredAt) - new Date(left.occurredAt))
      .slice(0, 20);

    return res.json({
      metrics: {
        totalUsers,
        activeListings,
        pendingListings,
        swappedListings,
        totalListings,
        totalSwaps,
        completedSwaps,
        acceptedSwaps,
        pendingSwaps,
        swapConversionRate: totalSwaps
          ? Number(((completedSwaps / totalSwaps) * 100).toFixed(1))
          : 0,
        listingDensity: totalUsers
          ? Number((activeListings / totalUsers).toFixed(2))
          : 0,
        flaggedContent: null,
        disputes: null,
      },
      regionalBreakdown,
      categoryBreakdown,
      users,
      listings,
      swaps,
      activeSwaps,
      disputedSwaps: [],
      recentActivity,
      capabilities: {
        flaggedContent: false,
        disputeTracking: false,
      },
      pagination: {
        usersReturned: users.length,
        listingsReturned: listings.length,
        swapsReturned: swaps.length,
        usersLimit: 100,
        listingsLimit: 100,
        swapsLimit: 100,
        totalUsers,
        totalListings,
        totalSwaps,
      },
    });
  } catch (error) {
    console.error('Admin dashboard error:', error);
    return res.status(500).json({ message: error.message || 'Server error loading dashboard' });
  }
};

// @desc    Get administrative analytics & success metrics (PRD Section 5)
// @route   GET /api/admin/metrics
// @access  Admin only
const getMetrics = async (req, res) => {
  try {
    const totalUsers = await User.countDocuments();
    const activeListings = await Listing.countDocuments({ status: 'available' });
    const pendingListings = await Listing.countDocuments({ status: 'pending_swap' });
    const swappedListings = await Listing.countDocuments({ status: 'swapped' });
    const totalListings = await Listing.countDocuments();

    const totalSwaps = await SwapRequest.countDocuments();
    const completedSwaps = await SwapRequest.countDocuments({ status: 'completed' });
    const acceptedSwaps = await SwapRequest.countDocuments({ status: 'accepted' });
    const pendingSwaps = await SwapRequest.countDocuments({ status: 'pending' });

    // Success Metrics from PRD:
    // 1. Swap Conversion Rate: Percentage of initiated swap requests that transitioned into confirmed/completed agreement
    const swapConversionRate = totalSwaps > 0
      ? Number(((completedSwaps / totalSwaps) * 100).toFixed(1))
      : 0;

    // 2. Listing Density: Average number of active clothing listings per registered user
    const listingDensity = totalUsers > 0
      ? Number((activeListings / totalUsers).toFixed(2))
      : 0;

    // Regional breakdown
    const regionalBreakdown = await Listing.aggregate([
      { $match: { status: 'available' } },
      { $group: { _id: '$city', count: { $sum: 1 } } },
      { $sort: { count: -1 } },
      { $limit: 10 },
    ]);

    // Category breakdown
    const categoryBreakdown = await Listing.aggregate([
      { $match: { status: 'available' } },
      { $group: { _id: '$category', count: { $sum: 1 } } },
      { $sort: { count: -1 } },
    ]);

    return res.json({
      metrics: {
        totalUsers,
        activeListings,
        pendingListings,
        swappedListings,
        totalListings,
        totalSwaps,
        completedSwaps,
        acceptedSwaps,
        pendingSwaps,
        swapConversionRate, // Percentage
        listingDensity,     // Average active listings per user
      },
      regionalBreakdown,
      categoryBreakdown,
    });
  } catch (error) {
    console.error('Admin metrics error:', error);
    return res.status(500).json({ message: error.message || 'Server error generating metrics' });
  }
};

// @desc    List all platform users with management controls
// @route   GET /api/admin/users
// @access  Admin only
const getUsers = async (req, res) => {
  try {
    const users = await User.find()
      .select('-password')
      .sort({ createdAt: -1 });

    return res.json(users);
  } catch (error) {
    console.error('Admin get users error:', error);
    return res.status(500).json({ message: error.message || 'Server error fetching users' });
  }
};

// @desc    Update user status (suspend, activate) or toggle role
// @route   PATCH /api/admin/users/:id
// @access  Admin only
const updateUserStatus = async (req, res) => {
  try {
    const { status, role } = req.body;
    if (status !== undefined && !['active', 'suspended'].includes(status)) {
      return res.status(400).json({ message: 'Status must be active or suspended' });
    }
    if (role !== undefined && !['user', 'admin'].includes(role)) {
      return res.status(400).json({ message: 'Role must be user or admin' });
    }

    const user = await User.findById(req.params.id);

    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    if (status) user.status = status;
    if (role) user.role = role;

    await user.save();
    const result = {
      _id: user._id,
      name: user.name,
      email: user.email,
      status: user.status,
      role: user.role,
      city: user.city,
    };
    publishRealtimeEvent(req, 'admin:action', [user._id], {
      action: 'user:updated',
      userId: user._id.toString(),
      status: user.status,
      role: user.role,
    });
    const io = req.app.get('io');
    if (io && (status === 'suspended' || role !== undefined)) {
      io.in(`user_${user._id}`).disconnectSockets(true);
    }
    return res.json(result);
  } catch (error) {
    console.error('Admin update user error:', error);
    return res.status(500).json({ message: error.message || 'Server error updating user status' });
  }
};

// @desc    Moderate/Remove inappropriate clothing listing
// @route   DELETE /api/admin/listings/:id
// @access  Admin only
const deleteListingAdmin = async (req, res) => {
  try {
    const listing = await Listing.findById(req.params.id);
    if (!listing) {
      return res.status(404).json({ message: 'Listing not found' });
    }

    const affectedSwaps = await SwapRequest.find({
      $or: [{ requestedItem: listing._id }, { offeredItem: listing._id }],
      status: { $in: ['pending', 'accepted'] },
    }).select('requester receiver requestedItem offeredItem');

    await Listing.findByIdAndDelete(req.params.id);
    if (listing.status !== 'swapped') {
      await User.findByIdAndUpdate(listing.owner, { $inc: { activeListingsCount: -1 } });
    }

    await SwapRequest.updateMany(
      {
        _id: { $in: affectedSwaps.map((swap) => swap._id) },
      },
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

    publishRealtimeEvent(req, 'listing:deleted', [listing.owner], {
      listingId: listing._id.toString(),
      moderated: true,
    });
    for (const restored of restoredListings) {
      publishRealtimeEvent(req, 'listing:updated', [restored.owner], {
        listingId: restored._id.toString(),
      });
    }
    for (const swap of affectedSwaps) {
      publishRealtimeEvent(req, 'swap:statusChanged', [swap.requester, swap.receiver], {
        swapId: swap._id.toString(),
        status: 'cancelled',
      });
    }
    publishRealtimeEvent(req, 'admin:action', [listing.owner], {
      action: 'listing:moderated',
      listingId: listing._id.toString(),
    });
    return res.json({ message: 'Listing successfully moderated and deleted by administrator' });
  } catch (error) {
    console.error('Admin delete listing error:', error);
    return res.status(500).json({ message: error.message || 'Server error deleting listing' });
  }
};

// @desc    Get all swap requests across the platform for dispute oversight
// @route   GET /api/admin/swaps
// @access  Admin only
const getAllSwapsAdmin = async (req, res) => {
  try {
    const swaps = await SwapRequest.find()
      .populate('requester', 'name email city')
      .populate('receiver', 'name email city')
      .populate('requestedItem', 'title brand images estimatedValue')
      .populate('offeredItem', 'title brand images estimatedValue')
      .sort({ updatedAt: -1 });

    return res.json(swaps);
  } catch (error) {
    console.error('Admin get swaps error:', error);
    return res.status(500).json({ message: error.message || 'Server error fetching swaps' });
  }
};

module.exports = {
  getDashboard,
  getMetrics,
  getUsers,
  updateUserStatus,
  deleteListingAdmin,
  getAllSwapsAdmin,
};
