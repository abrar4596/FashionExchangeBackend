const Message = require('../models/Message');
const SwapRequest = require('../models/SwapRequest');

// @desc    Get all messages for a specific swap request thread
// @route   GET /api/messages/:swapId
// @access  Private
const getMessages = async (req, res) => {
  try {
    const swap = await SwapRequest.findById(req.params.swapId);
    if (!swap) {
      return res.status(404).json({ message: 'Swap request thread not found' });
    }

    const userId = req.user._id.toString();
    const isParticipant =
      swap.requester.toString() === userId ||
      swap.receiver.toString() === userId ||
      req.user.role === 'admin';

    if (!isParticipant) {
      return res.status(403).json({ message: 'Not authorized to view this negotiation thread' });
    }

    const messages = await Message.find({ swapRequest: req.params.swapId })
      .populate('sender', 'name avatarUrl city role')
      .sort({ createdAt: 1 });

    return res.json(messages);
  } catch (error) {
    console.error('Get messages error:', error);
    return res.status(500).json({ message: error.message || 'Server error fetching messages' });
  }
};

// @desc    Send a message in a swap request thread
// @route   POST /api/messages/:swapId
// @access  Private
const sendMessage = async (req, res) => {
  try {
    const { text } = req.body;
    if (!text || !text.trim()) {
      return res.status(400).json({ message: 'Message text cannot be empty' });
    }

    const swap = await SwapRequest.findById(req.params.swapId);
    if (!swap) {
      return res.status(404).json({ message: 'Swap request thread not found' });
    }

    const userId = req.user._id.toString();
    const isParticipant =
      swap.requester.toString() === userId ||
      swap.receiver.toString() === userId ||
      req.user.role === 'admin';

    if (!isParticipant) {
      return res.status(403).json({ message: 'Not authorized to send messages in this thread' });
    }

    const message = await Message.create({
      swapRequest: req.params.swapId,
      sender: req.user._id,
      text: text.trim(),
      type: 'text',
    });

    const populated = await Message.findById(message._id).populate(
      'sender',
      'name avatarUrl city role'
    );

    return res.status(201).json(populated);
  } catch (error) {
    console.error('Send message error:', error);
    return res.status(500).json({ message: error.message || 'Server error sending message' });
  }
};

module.exports = {
  getMessages,
  sendMessage,
};
