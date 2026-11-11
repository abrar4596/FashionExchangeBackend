const express = require('express');
const { getUserCloset } = require('../controllers/listingController');
const { updateMyBio } = require('../controllers/userController');
const { verifyToken } = require('../middleware/auth');

const router = express.Router();

router.use(verifyToken);
router.get('/me/closet', getUserCloset);
router.patch('/me/bio', updateMyBio);

module.exports = router;
