const mongoose = require('mongoose');

const NOTIFICATION_TYPES = [
  'mention',
  'assigned',
  'due_soon',
  'comment',
  'card_moved',
  'message',
  'board_invite',
  'board_delete_request',
  'board_delete_approved',
  'board_delete_rejected',
];

const SOURCE_TYPES = ['card', 'message', 'board', 'channel', 'board_delete_request'];

const DELIVERY_CHANNELS = ['inapp', 'email', 'push'];

const notificationSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    type: {
      type: String,
      enum: NOTIFICATION_TYPES,
      required: true,
    },
    sourceType: {
      type: String,
      enum: SOURCE_TYPES,
      required: true,
    },
    sourceId: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
    },
    title: {
      type: String,
      default: '',
      trim: true,
    },
    body: {
      type: String,
      default: '',
      trim: true,
    },
    read: {
      type: Boolean,
      default: false,
    },
    channelDelivered: [
      {
        type: String,
        enum: DELIVERY_CHANNELS,
      },
    ],
  },
  { timestamps: true }
);

notificationSchema.index({ user: 1, read: 1, createdAt: -1 });
notificationSchema.index({ user: 1, createdAt: -1 });
notificationSchema.index({ sourceType: 1, sourceId: 1 });

module.exports = mongoose.model('Notification', notificationSchema);
module.exports.NOTIFICATION_TYPES = NOTIFICATION_TYPES;
module.exports.SOURCE_TYPES = SOURCE_TYPES;
module.exports.DELIVERY_CHANNELS = DELIVERY_CHANNELS;
