const User = require('../models/User');
const { publishRealtimeEvent } = require('../utils/realtime');
const asyncHandler = require('../utils/asyncHandler');

const updateMyBio = async (req, res, next) => {
  try {
    const bio = req.body.bio;
    if (typeof bio !== 'string') {
      return res.status(400).json({ message: 'Bio must be a string' });
    }

    const normalizedBio = bio.trim();
    if (normalizedBio.length > 300) {
      return res.status(400).json({ message: 'Bio must be 300 characters or fewer' });
    }

    const user = await User.findByIdAndUpdate(
      req.user._id,
      { $set: { bio: normalizedBio } },
      { new: true, runValidators: true }
    ).select('name email city cityId bio avatarUrl role completedSwapsCount activeListingsCount');

    if (!user) return res.status(404).json({ message: 'User not found' });
    publishRealtimeEvent(req, 'user:profileUpdated', [user._id], {
      userId: user._id.toString(),
    });
    return res.json(user);
  } catch (error) {
    return next(error);
  }
};

module.exports = { updateMyBio: asyncHandler(updateMyBio) };
