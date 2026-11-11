const express = require('express');
const router = express.Router();
const { getMessages, sendMessage } = require('../controllers/messageController');
const { verifyToken } = require('../middleware/auth');

router.use(verifyToken);

router.get('/:swapId', getMessages);
router.post('/:swapId', sendMessage);

module.exports = router;
