const mongoose = require('mongoose');

const channelPrefSchema = new mongoose.Schema(
  {
    inApp: { type: Boolean, default: true },
    email: { type: Boolean, default: true },
    push: { type: Boolean, default: false },
  },
  { _id: false }
);

const notificationPrefsSchema = new mongoose.Schema(
  {
    taskAssigned: { type: channelPrefSchema, default: () => ({}) },
    mentioned: { type: channelPrefSchema, default: () => ({ inApp: true, email: true, push: true }) },
    dueDateReminder: { type: channelPrefSchema, default: () => ({ inApp: true, email: true, push: true }) },
    chatMessage: { type: channelPrefSchema, default: () => ({ inApp: true, email: false, push: false }) },
    cardMoved: { type: channelPrefSchema, default: () => ({}) },
    comment: { type: channelPrefSchema, default: () => ({}) },
    mutedChannels: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Channel' }],
    mutedBoards: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Board' }],
  },
  { _id: false }
);

const userSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
    },
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
    },
    avatarUrl: {
      type: String,
      default: null,
    },
    avatarPublicId: {
      type: String,
      default: null,
    },
    googleId: {
      type: String,
      default: null,
      sparse: true,
    },
    role: {
      type: String,
      enum: ['super_admin', 'admin', 'manager', 'member'],
      required: true,
      default: 'member',
    },
    department: {
      type: String,
      enum: ['dev', 'design', 'video', 'marketing', 'leadgen', 'sales', 'coldcall', 'other'],
      default: 'other',
    },
    status: {
      type: String,
      enum: ['active', 'invited', 'disabled'],
      default: 'invited',
    },
    notificationPrefs: {
      type: notificationPrefsSchema,
      default: () => ({}),
    },
    uiPrefs: {
      type: new mongoose.Schema(
        {
          theme: {
            type: String,
            enum: ['light', 'dark'],
            default: 'light',
          },
        },
        { _id: false }
      ),
      default: () => ({ theme: 'light' }),
    },
    accessExpiresAt: {
      type: Date,
      default: null,
    },
    passwordHash: {
      type: String,
      default: null,
      select: false,
    },
    passwordSetAt: {
      type: Date,
      default: null,
    },
    refreshTokenHash: {
      type: String,
      default: null,
      select: false,
    },
    loginCodeHash: {
      type: String,
      default: null,
      select: false,
    },
    loginCodeExpiresAt: {
      type: Date,
      default: null,
      select: false,
    },
    loginCodeAttempts: {
      type: Number,
      default: 0,
      select: false,
    },
    loginCodeSentAt: {
      type: Date,
      default: null,
      select: false,
    },
    loginCodePurpose: {
      type: String,
      enum: ['login', 'reset'],
      default: null,
      select: false,
    },
  },
  { timestamps: true }
);

userSchema.index({ role: 1, status: 1 });

module.exports = mongoose.model('User', userSchema);
