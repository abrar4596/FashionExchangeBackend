const User = require('../models/User');
const Listing = require('../models/Listing');
const { generateToken } = require('../middleware/auth');
const { resolveCityInput } = require('../utils/location');
const { publishRealtimeEvent } = require('../utils/realtime');

// @desc    Register a new user
// @route   POST /api/auth/register
// @access  Public
const register = async (req, res) => {
  try {
    const { name, email, password, city, cityId, bio } = req.body;
    const location = resolveCityInput(city, cityId);

    if (!name || !email || !password || !location) {
      return res.status(400).json({ message: 'Please provide all required fields: name, email, password, and city' });
    }

    const userExists = await User.findOne({ email: email.toLowerCase().trim() });
    if (userExists) {
      return res.status(400).json({ message: 'A user with this email already exists' });
    }

    const user = await User.create({
      name: name.trim(),
      email: email.toLowerCase().trim(),
      password,
      city: location.city,
      cityId: location.cityId,
      bio: bio || undefined,
    });

    publishRealtimeEvent(req, 'user:registered', [user._id], {
      userId: user._id.toString(),
    });
    const token = generateToken(user._id, user.role);

    return res.status(201).json({
      token,
      user: {
        _id: user._id,
        name: user.name,
        email: user.email,
        city: user.city,
        cityId: user.cityId,
        bio: user.bio,
        avatarUrl: user.avatarUrl,
        role: user.role,
        completedSwapsCount: user.completedSwapsCount,
        activeListingsCount: user.activeListingsCount,
      },
    });
  } catch (error) {
    console.error('Registration error:', error);
    return res.status(error.statusCode || 500).json({ message: error.message || 'Server error during registration' });
  }
};

// @desc    Authenticate user & get token
// @route   POST /api/auth/login
// @access  Public
const login = async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ message: 'Please provide both email and password' });
    }

    const user = await User.findOne({ email: email.toLowerCase().trim() }).select('+password');
    if (!user || !(await user.matchPassword(password))) {
      return res.status(401).json({ message: 'Invalid email or password' });
    }

    if (user.status === 'suspended') {
      return res.status(403).json({ message: 'Account is suspended. Please contact administrator support.' });
    }

    // Refresh active listing count
    const activeCount = await Listing.countDocuments({ owner: user._id, status: 'available' });
    user.activeListingsCount = activeCount;
    await user.save();

    const token = generateToken(user._id, user.role);

    return res.json({
      token,
      user: {
        _id: user._id,
        name: user.name,
        email: user.email,
        city: user.city,
        cityId: user.cityId,
        bio: user.bio,
        avatarUrl: user.avatarUrl,
        role: user.role,
        completedSwapsCount: user.completedSwapsCount,
        activeListingsCount: user.activeListingsCount,
      },
    });
  } catch (error) {
    console.error('Login error:', error);
    return res.status(500).json({ message: error.message || 'Server error during login' });
  }
};

// @desc    Get current user profile
// @route   GET /api/auth/me
// @access  Private
const getMe = async (req, res) => {
  try {
    const user = await User.findById(req.user._id);
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    const activeListings = await Listing.countDocuments({ owner: user._id, status: 'available' });
    user.activeListingsCount = activeListings;
    await user.save();

    return res.json({
      _id: user._id,
      name: user.name,
      email: user.email,
      city: user.city,
      cityId: user.cityId,
      bio: user.bio,
      avatarUrl: user.avatarUrl,
      role: user.role,
      completedSwapsCount: user.completedSwapsCount,
      activeListingsCount: user.activeListingsCount,
      createdAt: user.createdAt,
    });
  } catch (error) {
    console.error('Get profile error:', error);
    return res.status(500).json({ message: error.message || 'Server error fetching profile' });
  }
};

// @desc    Update user profile
// @route   PUT /api/auth/profile
// @access  Private
const updateProfile = async (req, res) => {
  try {
    const user = await User.findById(req.user._id);
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    const { name, city, cityId, bio, avatarUrl } = req.body;
    if (name) user.name = name.trim();
    const location = resolveCityInput(city, cityId);
    if (location) {
      user.city = location.city;
      user.cityId = location.cityId;
    }
    if (bio !== undefined) user.bio = bio;
    if (avatarUrl !== undefined) user.avatarUrl = avatarUrl;

    const updatedUser = await user.save();

    publishRealtimeEvent(req, 'user:profileUpdated', [updatedUser._id], {
      userId: updatedUser._id.toString(),
    });
    return res.json({
      _id: updatedUser._id,
      name: updatedUser.name,
      email: updatedUser.email,
      city: updatedUser.city,
      cityId: updatedUser.cityId,
      bio: updatedUser.bio,
      avatarUrl: updatedUser.avatarUrl,
      role: updatedUser.role,
      completedSwapsCount: updatedUser.completedSwapsCount,
      activeListingsCount: updatedUser.activeListingsCount,
    });
  } catch (error) {
    console.error('Update profile error:', error);
    return res.status(error.statusCode || 500).json({ message: error.message || 'Server error updating profile' });
  }
};

module.exports = {
  register,
  login,
  getMe,
  updateProfile,
};
