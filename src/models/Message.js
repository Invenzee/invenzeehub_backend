const mongoose = require('mongoose');

const messageAttachmentSchema = new mongoose.Schema(
  {
    url: {
      type: String,
      required: true,
    },
    filename: {
      type: String,
      required: true,
      trim: true,
    },
    uploadedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
    },
    size: {
      type: Number,
      default: 0,
    },
    mimeType: {
      type: String,
      default: '',
      trim: true,
    },
    publicId: {
      type: String,
      default: null,
    },
    resourceType: {
      type: String,
      default: 'image',
    },
  },
  { _id: true }
);

const reactionSchema = new mongoose.Schema(
  {
    emoji: {
      type: String,
      required: true,
      trim: true,
    },
    users: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
      },
    ],
  },
  { _id: false }
);

const messageSchema = new mongoose.Schema(
  {
    channel: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Channel',
      required: true,
    },
    sender: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    text: {
      type: String,
      default: '',
      trim: true,
    },
    contentFormat: {
      type: String,
      enum: ['plain', 'html'],
      default: 'plain',
    },
    searchText: {
      type: String,
      default: '',
      trim: true,
    },
    attachments: {
      type: [messageAttachmentSchema],
      default: [],
    },
    mentions: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
      },
    ],
    parentMessage: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Message',
      default: null,
    },
    reactions: {
      type: [reactionSchema],
      default: [],
    },
    editedAt: {
      type: Date,
      default: null,
    },
    pinnedAt: {
      type: Date,
      default: null,
    },
    pinnedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
  },
  { timestamps: true }
);

messageSchema.index({ channel: 1, createdAt: -1 });
messageSchema.index({ parentMessage: 1, createdAt: 1 });
messageSchema.index({ sender: 1 });
messageSchema.index({ channel: 1, pinnedAt: -1 });
messageSchema.index({ searchText: 'text' });

module.exports = mongoose.model('Message', messageSchema);
