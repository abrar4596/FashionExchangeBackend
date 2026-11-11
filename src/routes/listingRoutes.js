const express = require('express');
const router = express.Router();
const {
  getListings,
  getListingById,
  createListing,
  updateListing,
  deleteListing,
  getUserCloset,
} = require('../controllers/listingController');
const { verifyToken } = require('../middleware/auth');
const upload = require('../middleware/upload');

// Public search & view
router.get('/', getListings);
router.get('/user/closet', verifyToken, getUserCloset);
router.get('/:id', getListingById);

// Protected actions
router.post('/', verifyToken, upload.array('images', 8), createListing);
router.put('/:id', verifyToken, upload.array('images', 8), updateListing);
router.delete('/:id', verifyToken, deleteListing);

module.exports = router;
