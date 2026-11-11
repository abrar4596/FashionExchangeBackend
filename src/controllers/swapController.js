const SwapRequest = require('../models/SwapRequest');
const Listing = require('../models/Listing');
const User = require('../models/User');
const Message = require('../models/Message');
const { publishRealtimeEvent } = require('../utils/realtime');

// @desc    Initiate a new barter swap request
// @route   POST /api/swaps
// @access  Private
const createSwapRequest = async (req, res) => {
  try {
    const { requestedItemId, offeredItemId, initialMessage } = req.body;

    if (!requestedItemId || !offeredItemId) {
      return res.status(400).json({ message: 'Both requested item and offered item are required' });
    }

    if (requestedItemId === offeredItemId) {
      return res.status(400).json({ message: 'Cannot swap an item with itself' });
    }

    const requestedItem = await Listing.findById(requestedItemId);
    const offeredItem = await Listing.findById(offeredItemId);

    if (!requestedItem || !offeredItem) {
      return res.status(404).json({ message: 'One or both clothing items could not be found' });
    }

    if (requestedItem.status !== 'available') {
      return res.status(400).json({ message: 'Requested item is no longer available for swapping' });
    }

    if (offeredItem.status !== 'available') {
      return res.status(400).json({ message: 'Your offered item is not marked as available' });
    }

    // Verify ownership
    if (offeredItem.owner.toString() !== req.user._id.toString()) {
      return res.status(403).json({ message: 'You can only offer items from your own closet' });
    }

    if (requestedItem.owner.toString() === req.user._id.toString()) {
      return res.status(400).json({ message: 'You cannot request a swap on your own item' });
    }

    // Check for existing pending request between these two items
    const existing = await SwapRequest.findOne({
      requestedItem: requestedItemId,
      offeredItem: offeredItemId,
      status: { $in: ['pending', 'accepted'] },
    });

    if (existing) {
      return res.status(400).json({ message: 'An active swap request already exists for these items' });
    }

    const valueDiff = (offeredItem.estimatedValue || 0) - (requestedItem.estimatedValue || 0);

    const swap = await SwapRequest.create({
      requester: req.user._id,
      receiver: requestedItem.owner,
      requestedItem: requestedItemId,
      offeredItem: offeredItemId,
      status: 'pending',
      initialMessage: initialMessage ? initialMessage.trim() : 'Hi! I would love to swap my item for yours.',
      valueDifference: valueDiff,
    });

    // Create initial message in chat thread
    await Message.create({
      swapRequest: swap._id,
      sender: req.user._id,
      text: initialMessage ? initialMessage.trim() : `Proposed a swap: Offering "${offeredItem.title}" for "${requestedItem.title}"`,
      type: 'swap_proposal',
    });

    const populated = await SwapRequest.findById(swap._id)
      .populate('requester', 'name city avatarUrl completedSwapsCount')
      .populate('receiver', 'name city avatarUrl completedSwapsCount')
      .populate('requestedItem')
      .populate('offeredItem');

    publishRealtimeEvent(req, 'swap:requested', [swap.requester, swap.receiver], {
      swapId: swap._id.toString(),
      status: swap.status,
    });
    return res.status(201).json(populated);
  } catch (error) {
    console.error('Create swap request error:', error);
    return res.status(500).json({ message: error.message || 'Server error creating swap request' });
  }
};

// @desc    Get all swap requests for current user (incoming & outgoing)
// @route   GET /api/swaps/my-swaps
// @access  Private
const getMySwaps = async (req, res) => {
  try {
    const userId = req.user._id;

    const swaps = await SwapRequest.find({
      $or: [{ requester: userId }, { receiver: userId }],
    })
      .populate('requester', 'name email city avatarUrl completedSwapsCount')
      .populate('receiver', 'name email city avatarUrl completedSwapsCount')
      .populate('requestedItem')
      .populate('offeredItem')
      .sort({ updatedAt: -1 });

    const incoming = swaps.filter((s) => s.receiver._id.toString() === userId.toString());
    const outgoing = swaps.filter((s) => s.requester._id.toString() === userId.toString());

    return res.json({
      all: swaps,
      incoming,
      outgoing,
      totalCount: swaps.length,
      pendingCount: swaps.filter((s) => s.status === 'pending').length,
    });
  } catch (error) {
    console.error('Get my swaps error:', error);
    return res.status(500).json({ message: error.message || 'Server error fetching swaps' });
  }
};

// @desc    Update swap request status (accept, reject, cancel, complete)
// @route   PATCH /api/swaps/:id/status
// @access  Private
const updateSwapStatus = async (req, res) => {
  try {
    const { status } = req.body;
    const swap = await SwapRequest.findById(req.params.id)
      .populate('requestedItem')
      .populate('offeredItem');

    if (!swap) {
      return res.status(404).json({ message: 'Swap request not found' });
    }

    const userId = req.user._id.toString();
    const isReceiver = swap.receiver.toString() === userId;
    const isRequester = swap.requester.toString() === userId;
    const isAdmin = req.user.role === 'admin';

    if (!isReceiver && !isRequester && !isAdmin) {
      return res.status(403).json({ message: 'Not authorized to modify this swap request' });
    }

    if (swap.status === status) {
      const current = await SwapRequest.findById(swap._id)
        .populate('requester', 'name city avatarUrl completedSwapsCount')
        .populate('receiver', 'name city avatarUrl completedSwapsCount')
        .populate('requestedItem')
        .populate('offeredItem');
      return res.json(current);
    }

    let statusPersisted = false;
    const persistTransition = async (nextStatus) => {
      const result = await SwapRequest.updateOne(
        { _id: swap._id, status: swap.status },
        { $set: { status: nextStatus } }
      );
      if (result.modifiedCount !== 1) {
        return false;
      }
      swap.status = nextStatus;
      statusPersisted = true;
      return true;
    };

    if (status === 'accepted') {
      if (!isReceiver && !isAdmin) {
        return res.status(403).json({ message: 'Only the item owner can accept a swap request' });
      }
      if (swap.status !== 'pending') {
        return res.status(400).json({ message: 'Only pending swaps can be accepted' });
      }
      if (!(await persistTransition('accepted'))) {
        return res.status(409).json({ message: 'Swap status changed; refresh and try again' });
      }
      // Mark listings as pending swap
      await Listing.findByIdAndUpdate(swap.requestedItem._id, { status: 'pending_swap' });
      await Listing.findByIdAndUpdate(swap.offeredItem._id, { status: 'pending_swap' });

      await Message.create({
        swapRequest: swap._id,
        sender: req.user._id,
        text: 'Swap proposal accepted! Use this chat to coordinate exchange logistics or shipping terms.',
        type: 'agreement_confirmed',
      });
    } else if (status === 'rejected') {
      if (!isReceiver && !isAdmin) {
        return res.status(403).json({ message: 'Only the item owner can reject a swap request' });
      }
      if (swap.status !== 'pending') {
        return res.status(400).json({ message: 'Only pending swaps can be rejected' });
      }
      if (!(await persistTransition('rejected'))) {
        return res.status(409).json({ message: 'Swap status changed; refresh and try again' });
      }

      await Message.create({
        swapRequest: swap._id,
        sender: req.user._id,
        text: 'Swap proposal was declined.',
        type: 'status_change',
      });
    } else if (status === 'cancelled') {
      if (!isRequester && !isAdmin) {
        return res.status(403).json({ message: 'Only the requester can cancel this swap' });
      }
      if (!['pending', 'accepted'].includes(swap.status)) {
        return res.status(400).json({ message: 'Only active swaps can be cancelled' });
      }
      if (!(await persistTransition('cancelled'))) {
        return res.status(409).json({ message: 'Swap status changed; refresh and try again' });
      }
      // Revert listings if they were pending
      await Listing.findByIdAndUpdate(swap.requestedItem._id, { status: 'available' });
      await Listing.findByIdAndUpdate(swap.offeredItem._id, { status: 'available' });

      await Message.create({
        swapRequest: swap._id,
        sender: req.user._id,
        text: 'Swap proposal was cancelled.',
        type: 'status_change',
      });
    } else if (status === 'completed') {
      if (swap.status !== 'accepted') {
        return res.status(400).json({ message: 'Swap must be accepted before being marked as completed' });
      }

      if (!(await persistTransition('completed'))) {
        return res.status(409).json({ message: 'Swap status changed; refresh and try again' });
      }

      // Mark both clothing items as permanently swapped
      await Listing.findByIdAndUpdate(swap.requestedItem._id, { status: 'swapped' });
      await Listing.findByIdAndUpdate(swap.offeredItem._id, { status: 'swapped' });

      // Increment completed swap count for both users
      await User.findByIdAndUpdate(swap.requester, {
        $inc: { completedSwapsCount: 1, activeListingsCount: -1 },
      });
      await User.findByIdAndUpdate(swap.receiver, {
        $inc: { completedSwapsCount: 1, activeListingsCount: -1 },
      });

      await Message.create({
        swapRequest: swap._id,
        sender: req.user._id,
        text: 'Agreement finalized and swap marked as completed! Both wardrobes successfully refreshed.',
        type: 'agreement_confirmed',
      });
    } else {
      return res.status(400).json({ message: 'Invalid status transition' });
    }

    if (!statusPersisted) {
      return res.status(400).json({ message: 'Invalid status transition' });
    }
    const populated = await SwapRequest.findById(swap._id)
      .populate('requester', 'name city avatarUrl completedSwapsCount')
      .populate('receiver', 'name city avatarUrl completedSwapsCount')
      .populate('requestedItem')
      .populate('offeredItem');

    publishRealtimeEvent(req, 'swap:statusChanged', [swap.requester, swap.receiver], {
      swapId: swap._id.toString(),
      status: swap.status,
    });
    return res.json(populated);
  } catch (error) {
    console.error('Update swap status error:', error);
    return res.status(500).json({ message: error.message || 'Server error updating swap status' });
  }
};

module.exports = {
  createSwapRequest,
  getMySwaps,
  updateSwapStatus,
};
