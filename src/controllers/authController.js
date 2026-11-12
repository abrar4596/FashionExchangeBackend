const User = require('../models/User');
const Listing = require('../models/Listing');
const { generateToken } = require('../middleware/auth');
const { resolveCityInput } = require('../utils/location');
const { publishRealtimeEvent } = require('../utils/realtime');

// Public 1-click demo profiles shown on the login screen. If a production database
// was never seeded (or a demo row was removed) these accounts are recreated on
// demand at login time. This is non-destructive: it only ever creates the accounts
// below and never overwrites an existing user document.
const DEMO_PASSWORD = 'password123';
const DEMO_ACCOUNTS = {
  'elena@example.com': { name: 'Elena Vance', city: 'Bengaluru', role: 'user' },
  'marcus@example.com': { name: 'Marcus Chen', city: 'Mumbai', role: 'user' },
  'maya@example.com': { name: 'Maya Patel', city: 'Hyderabad', role: 'user' },
  'leo@example.com': { name: 'Leo Rossi', city: 'Delhi', role: 'user' },
  'admin@fashionexchange.com': { name: 'Admin Supervisor', city: 'Mumbai', role: 'admin' },
};

const ensureDemoAccount = async (email) => {
  const demo = DEMO_ACCOUNTS[email];
  if (!demo) return null;

  const existing = await User.findOne({ email }).select('+password');
  if (existing) return existing;

  try {
    // Password is hashed by the User schema's pre-save hook.
    const created = await User.create({ ...demo, email, password: DEMO_PASSWORD });
    return User.findById(created._id).select('+password');
  } catch (error) {
    // Lost a race with a concurrent request that created the same account.
    if (error.code === 11000) {
      return User.findOne({ email }).select('+password');
    }
    throw error;
  }
};

// @desc    Register a new user
// @route   POST /api/auth/register
// @access  Public
const register = async (req, res, next) => {
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
    return next(error);
  }
};

// @desc    Authenticate user & get token
// @route   POST /api/auth/login
// @access  Public
const login = async (req, res, next) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ message: 'Please provide both email and password' });
    }

    const normalizedEmail = email.toLowerCase().trim();
    let user = await User.findOne({ email: normalizedEmail }).select('+password');

    // Self-heal the public demo accounts so the 1-click demo logins keep working
    // even when the production database was never seeded.
    if (!user) {
      user = await ensureDemoAccount(normalizedEmail);
    }

    if (!user) {
      // Telemetry: distinguishes "database returned no user" from "db not connected".
      console.warn(JSON.stringify({
        level: 'warn',
        timestamp: new Date().toISOString(),
        scope: 'auth.login',
        reason: 'user_not_found',
        email: normalizedEmail,
      }));
      return res.status(401).json({ message: 'Invalid email or password' });
    }

    const passwordMatches = await user.matchPassword(password);
    if (!passwordMatches) {
      // Telemetry: the user exists but bcrypt.compare() rejected the password.
      console.warn(JSON.stringify({
        level: 'warn',
        timestamp: new Date().toISOString(),
        scope: 'auth.login',
        reason: 'bcrypt_compare_failed',
        userId: String(user._id),
        email: normalizedEmail,
      }));
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
    // Telemetry: surfaces database/connection failures that would otherwise be a generic 500.
    console.error(JSON.stringify({
      level: 'error',
      timestamp: new Date().toISOString(),
      scope: 'auth.login',
      reason: 'unhandled_exception',
      message: error.message,
      apiCode: error.apiCode,
      statusCode: error.statusCode,
    }));
    return next(error);
  }
};

// @desc    Get current user profile
// @route   GET /api/auth/me
// @access  Private
const getMe = async (req, res, next) => {
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
    return next(error);
  }
};

// @desc    Update user profile
// @route   PUT /api/auth/profile
// @access  Private
const updateProfile = async (req, res, next) => {
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
    return next(error);
  }
};

const asyncHandler = require('../utils/asyncHandler');

module.exports = {
  register: asyncHandler(register),
  login: asyncHandler(login),
  getMe: asyncHandler(getMe),
  updateProfile: asyncHandler(updateProfile),
};
