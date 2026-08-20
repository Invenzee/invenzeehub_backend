const mongoose = require('mongoose');

const BOARD_DELETE_REQUEST_STATUSES = Object.freeze([
  'pending',
  'approved',
  'rejected',
]);

const boardDeleteRequestSchema = new mongoose.Schema(
  {
    board: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Board',
      required: true,
    },
    workspace: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Workspace',
      required: true,
    },
    boardName: {
      type: String,
      required: true,
      trim: true,
    },
    requestedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    status: {
      type: String,
      enum: BOARD_DELETE_REQUEST_STATUSES,
      default: 'pending',
    },
    reviewedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
    reviewedAt: {
      type: Date,
      default: null,
    },
    reason: {
      type: String,
      default: '',
      trim: true,
    },
  },
  { timestamps: true }
);

boardDeleteRequestSchema.index({ workspace: 1, status: 1 });
boardDeleteRequestSchema.index({ board: 1, status: 1 });
boardDeleteRequestSchema.index({ requestedBy: 1 });

module.exports = mongoose.model('BoardDeleteRequest', boardDeleteRequestSchema);
module.exports.BOARD_DELETE_REQUEST_STATUSES = BOARD_DELETE_REQUEST_STATUSES;
