const jwt = require('jsonwebtoken');
const User = require('../models/User');

const generateToken = (userId, role) => {
  return jwt.sign(
    { id: userId, role },
    process.env.JWT_SECRET || 'fashion_exchange_fallback_secret_key',
    { expiresIn: '30d' }
  );
};

const verifyToken = async (req, res, next) => {
  let token;
  if (
    req.headers.authorization &&
    req.headers.authorization.startsWith('Bearer')
  ) {
    try {
      token = req.headers.authorization.split(' ')[1];
      const decoded = jwt.verify(
        token,
        process.env.JWT_SECRET || 'fashion_exchange_fallback_secret_key'
      );
      const user = await User.findById(decoded.id).select('-password');
      if (!user) {
        return res.status(401).json({ message: 'User not found or account removed' });
      }
      if (user.status === 'suspended') {
        return res.status(403).json({ message: 'Your account has been suspended by an administrator' });
      }
      req.user = user;
      next();
    } catch (error) {
      console.error('JWT Verification failed:', error.message);
      return res.status(401).json({ message: 'Not authorized, token invalid or expired' });
    }
  } else {
    return res.status(401).json({ message: 'Not authorized, no token provided' });
  }
};

const verifyAdmin = (req, res, next) => {
  if (req.user && req.user.role === 'admin') {
    next();
  } else {
    return res.status(403).json({ message: 'Forbidden: Administrator access required' });
  }
};

module.exports = {
  generateToken,
  verifyToken,
  verifyAdmin,
};
