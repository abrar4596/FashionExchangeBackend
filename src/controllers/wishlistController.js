const mongoose = require('mongoose');
const User = require('../models/User');
const Listing = require('../models/Listing');
const asyncHandler = require('../utils/asyncHandler');

// @desc    Get the authenticated user's saved wishlist
// @route   GET /api/v1/wishlist
// @access  Private
const getWishlist = asyncHandler(async (req, res) => {
  const user = await User.findById(req.user._id).select('wishlist');
  const savedIds = (user && user.wishlist) || [];

  if (savedIds.length === 0) {
    return res.json({ listings: [], count: 0 });
  }

  const listings = await Listing.find({ _id: { $in: savedIds } })
    .populate('owner', 'name city avatarUrl completedSwapsCount activeListingsCount')
    .lean();

  // Saved order is newest-first, so map back onto it and silently drop any listings
  // that were deleted after being hearted.
  const byId = new Map(listings.map((listing) => [String(listing._id), listing]));
  const ordered = savedIds.map((id) => byId.get(String(id))).filter(Boolean);

  return res.json({ listings: ordered, count: ordered.length });
});

// @desc    Add or remove a listing from the authenticated user's wishlist
// @route   POST /api/v1/wishlist/toggle
// @access  Private
const toggleWishlist = asyncHandler(async (req, res) => {
  const { listingId } = req.body;

  if (!listingId || !mongoose.Types.ObjectId.isValid(listingId)) {
    return res.status(400).json({ success: false, message: 'A valid listingId is required' });
  }

  const listingExists = await Listing.exists({ _id: listingId });
  if (!listingExists) {
    return res.status(404).json({ success: false, message: 'Clothing listing not found' });
  }

  const userId = req.user._id;

  // Remove-first toggle is idempotent under double-clicks: if the listing was saved,
  // unsave it; otherwise prepend it so the newest save shows up first.
  const removal = await User.updateOne(
    { _id: userId, wishlist: listingId },
    { $pull: { wishlist: listingId } }
  );

  let wishlisted;
  if (removal.modifiedCount > 0) {
    wishlisted = false;
  } else {
    await User.updateOne(
      { _id: userId },
      { $push: { wishlist: { $each: [listingId], $position: 0 } } }
    );
    wishlisted = true;
  }

  const updated = await User.findById(userId).select('wishlist');

  return res.json({
    success: true,
    wishlisted,
    listingId: String(listingId),
    count: (updated && updated.wishlist && updated.wishlist.length) || 0,
  });
});

module.exports = { getWishlist, toggleWishlist };
