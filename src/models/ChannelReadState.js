const mongoose = require('mongoose');

const channelReadStateSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    channel: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Channel',
      required: true,
    },
    lastReadAt: {
      type: Date,
      default: Date.now,
    },
    lastReadMessageId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Message',
      default: null,
    },
  },
  { timestamps: true }
);

channelReadStateSchema.index({ user: 1, channel: 1 }, { unique: true });
channelReadStateSchema.index({ channel: 1 });

module.exports = mongoose.model('ChannelReadState', channelReadStateSchema);
