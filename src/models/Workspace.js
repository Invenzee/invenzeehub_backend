const mongoose = require('mongoose');

const WORKSPACE_STATUSES = Object.freeze(['active', 'archived']);

const workspaceSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
    },
    description: {
      type: String,
      default: '',
      trim: true,
    },
    status: {
      type: String,
      enum: WORKSPACE_STATUSES,
      default: 'active',
    },
    owners: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
      },
    ],
    members: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
      },
    ],
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
  },
  { timestamps: true }
);

workspaceSchema.index({ name: 1 });
workspaceSchema.index({ owners: 1 });
workspaceSchema.index({ members: 1 });
workspaceSchema.index({ status: 1 });

module.exports = mongoose.model('Workspace', workspaceSchema);
module.exports.WORKSPACE_STATUSES = WORKSPACE_STATUSES;
