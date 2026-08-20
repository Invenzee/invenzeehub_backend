const mongoose = require('mongoose');

const ACTIVITY_ACTIONS = [
  'created',
  'moved',
  'assigned',
  'unassigned',
  'commented',
  'due_date_changed',
  'priority_changed',
  'label_added',
  'label_removed',
  'checklist_updated',
  'attachment_added',
  'attachment_removed',
  'title_changed',
  'description_changed',
  'archived',
  'unarchived',
  'copied',
  'watcher_added',
  'watcher_removed',
  'shared',
];

const activityEntrySchema = new mongoose.Schema(
  {
    card: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Card',
      default: null,
    },
    workspace: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Workspace',
      required: true,
    },
    board: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Board',
      default: null,
    },
    action: {
      type: String,
      enum: ACTIVITY_ACTIONS,
      required: true,
    },
    actor: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    meta: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },
    timestamp: {
      type: Date,
      default: Date.now,
    },
  },
  { timestamps: false }
);

activityEntrySchema.index({ card: 1, timestamp: -1 });
activityEntrySchema.index({ workspace: 1, timestamp: -1 });
activityEntrySchema.index({ board: 1, timestamp: -1 });
activityEntrySchema.index({ actor: 1, timestamp: -1 });

module.exports = mongoose.model('ActivityEntry', activityEntrySchema);
module.exports.ACTIVITY_ACTIONS = ACTIVITY_ACTIONS;
