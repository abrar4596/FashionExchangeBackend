const express = require('express');
const router = express.Router();
const {
  getMetrics,
  getDashboard,
  getUsers,
  updateUserStatus,
  deleteListingAdmin,
  getAllSwapsAdmin,
} = require('../controllers/adminController');
const { verifyToken, verifyAdmin } = require('../middleware/auth');

router.use(verifyToken, verifyAdmin);

router.get('/metrics', getMetrics);
router.get('/dashboard', getDashboard);
router.get('/users', getUsers);
router.patch('/users/:id', updateUserStatus);
router.delete('/listings/:id', deleteListingAdmin);
router.get('/swaps', getAllSwapsAdmin);

module.exports = router;
