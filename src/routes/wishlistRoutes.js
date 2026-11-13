const express = require('express');
const router = express.Router();
const { getWishlist, toggleWishlist } = require('../controllers/wishlistController');
const { verifyToken } = require('../middleware/auth');

// The wishlist is always user-specific, so every route requires a valid JWT.
router.use(verifyToken);

router.get('/', getWishlist);
router.post('/toggle', toggleWishlist);

module.exports = router;
