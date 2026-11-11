const mongoose = require('mongoose');

const SwapRequestSchema = new mongoose.Schema(
  {
    requester: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    receiver: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    requestedItem: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Listing',
      required: true,
    },
    offeredItem: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Listing',
      required: true,
    },
    status: {
      type: String,
      enum: ['pending', 'accepted', 'rejected', 'completed', 'cancelled'],
      default: 'pending',
    },
    initialMessage: {
      type: String,
      trim: true,
      default: '',
    },
    valueDifference: {
      type: Number,
      default: 0,
    },
  },
  {
    timestamps: true,
  }
);

// Compound indexes for user query and duplicate prevention
SwapRequestSchema.index({ requester: 1, status: 1 });
SwapRequestSchema.index({ receiver: 1, status: 1 });
SwapRequestSchema.index({ requestedItem: 1, offeredItem: 1 });

module.exports = mongoose.model('SwapRequest', SwapRequestSchema);
