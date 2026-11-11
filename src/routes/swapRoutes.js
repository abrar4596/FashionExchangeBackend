const express = require('express');
const router = express.Router();
const {
  createSwapRequest,
  getMySwaps,
  updateSwapStatus,
} = require('../controllers/swapController');
const { verifyToken } = require('../middleware/auth');

router.use(verifyToken);

router.post('/', createSwapRequest);
router.get('/my-swaps', getMySwaps);
router.patch('/:id/status', updateSwapStatus);

module.exports = router;
