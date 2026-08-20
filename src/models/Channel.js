const mongoose = require('mongoose');

const channelSchema = new mongoose.Schema(
  {
    workspace: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Workspace',
      default: null,
    },
    name: {
      type: String,
      trim: true,
      default: null,
    },
    topic: {
      type: String,
      trim: true,
      default: '',
      maxlength: 250,
    },
    description: {
      type: String,
      trim: true,
      default: '',
      maxlength: 2000,
    },
    type: {
      type: String,
      enum: ['public', 'private', 'dm'],
      required: true,
    },
    members: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true,
      },
    ],
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    // Sorted member IDs joined as string — unique DM pair lookup (set by service layer)
    dmKey: {
      type: String,
      default: null,
    },
  },
  { timestamps: true }
);

channelSchema.index({ workspace: 1, type: 1 });
channelSchema.index({ members: 1 });
channelSchema.index(
  { dmKey: 1 },
  {
    unique: true,
    partialFilterExpression: { type: 'dm', dmKey: { $type: 'string' } },
  }
);

module.exports = mongoose.model('Channel', channelSchema);
