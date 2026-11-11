const mongoose = require('mongoose');

const MessageSchema = new mongoose.Schema(
  {
    swapRequest: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'SwapRequest',
      required: true,
      index: true,
    },
    sender: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    text: {
      type: String,
      required: true,
      trim: true,
    },
    type: {
      type: String,
      enum: ['text', 'swap_proposal', 'agreement_confirmed', 'status_change'],
      default: 'text',
    },
  },
  {
    timestamps: true,
  }
);

MessageSchema.index({ swapRequest: 1, createdAt: 1 });

module.exports = mongoose.model('Message', MessageSchema);
