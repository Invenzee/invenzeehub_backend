const mongoose = require('mongoose');
const { Message, Channel, User, Notification } = require('../models');
const AppError = require('../utils/AppError');
const {
  canViewChannel,
  canPostInChannel,
  canEditMessage,
  canDeleteMessage,
} = require('../utils/channelAccess');
const channelService = require('./channelService');

const MESSAGE_POPULATE = [
  { path: 'sender', select: 'name email avatarUrl role department' },
  { path: 'mentions', select: 'name email avatarUrl' },
  { path: 'reactions.users', select: 'name email avatarUrl' },
  { path: 'attachments.uploadedBy', select: 'name email avatarUrl' },
  { path: 'pinnedBy', select: 'name email avatarUrl' },
];

const MAX_PINS_PER_CHANNEL = 50;

function stripHtml(html = '') {
  return String(html)
    .replace(/<[^>]*>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function ensureObjectId(id, label = 'id') {
  if (!mongoose.Types.ObjectId.isValid(id)) {
    throw new AppError(`Invalid ${label}`, 400, { code: 'INVALID_ID' });
  }
}

function normalizeMentions(mentions) {
  if (!mentions) return [];
  return [...new Set(mentions.map((id) => id.toString()))].map(
    (id) => new mongoose.Types.ObjectId(id)
  );
}

function normalizeAttachments(attachments) {
  if (!Array.isArray(attachments)) return [];
  return attachments
    .filter((a) => a && a.url && a.filename)
    .map((a) => ({
      url: a.url,
      filename: a.filename,
      uploadedBy: a.uploadedBy,
      size: a.size || 0,
      mimeType: a.mimeType || '',
      publicId: a.publicId || null,
      resourceType: a.resourceType || 'image',
    }));
}

async function getMessageOrThrow(id) {
  ensureObjectId(id, 'message id');
  const message = await Message.findById(id);
  if (!message) {
    throw new AppError('Message not found', 404, { code: 'MESSAGE_NOT_FOUND' });
  }
  return message;
}

async function populateMessage(id) {
  return Message.findById(id).populate(MESSAGE_POPULATE).lean();
}

async function loadChannelForActor(actor, channelId, { mustPost = false } = {}) {
  const channel = await channelService.getChannelOrThrow(channelId);
  if (mustPost) {
    if (!canPostInChannel(channel, actor)) {
      throw new AppError('You cannot post in this channel', 403, { code: 'FORBIDDEN' });
    }
  } else if (!canViewChannel(channel, actor)) {
    throw new AppError('You do not have access to this channel', 403, { code: 'FORBIDDEN' });
  }
  return channel;
}

function isChannelMuted(user, channelId) {
  const muted = user?.notificationPrefs?.mutedChannels || [];
  return muted.some((id) => id.toString() === channelId.toString());
}

function wantsInApp(user, prefKey) {
  const pref = user?.notificationPrefs?.[prefKey];
  if (!pref) return true;
  return pref.inApp !== false;
}

async function notifyChatEvent({
  actor,
  channel,
  message,
  recipientIds,
  type,
  title,
  body,
}) {
  const unique = [...new Set(recipientIds.map((id) => id.toString()))].filter(
    (id) => id !== actor._id.toString()
  );

  if (!unique.length) return;

  const users = await User.find({ _id: { $in: unique }, status: 'active' }).select(
    'notificationPrefs'
  );

  const { emitToUser } = require('../socket');

  for (const user of users) {
    if (isChannelMuted(user, channel._id)) continue;

    const prefKey = type === 'mention' ? 'mentioned' : 'chatMessage';
    if (!wantsInApp(user, prefKey)) continue;

    const notification = await Notification.create({
      user: user._id,
      type,
      sourceType: 'message',
      sourceId: message._id,
      title,
      body,
      read: false,
      channelDelivered: ['inapp'],
    });
    const lean = await Notification.findById(notification._id).lean();
    emitToUser(user._id, 'notification:new', lean);
  }
}

async function listMessages(actor, channelId, query = {}) {
  await loadChannelForActor(actor, channelId);

  const limit = Math.min(100, Math.max(1, Number(query.limit) || 50));
  const filter = { channel: channelId, parentMessage: null };

  if (query.before) {
    ensureObjectId(query.before, 'before');
    const cursor = await Message.findById(query.before).select('createdAt');
    if (cursor) {
      filter.createdAt = { $lt: cursor.createdAt };
    }
  }

  const messages = await Message.find(filter)
    .populate(MESSAGE_POPULATE)
    .sort({ createdAt: -1 })
    .limit(limit + 1)
    .lean();

  const hasMore = messages.length > limit;
  const page = hasMore ? messages.slice(0, limit) : messages;

  return {
    messages: page.reverse(),
    meta: {
      hasMore,
      nextCursor: page.length ? page[0]._id.toString() : null,
    },
  };
}

async function createMessage(actor, channelId, payload) {
  const channel = await loadChannelForActor(actor, channelId, { mustPost: true });

  const text = String(payload.text || '').trim();
  const attachments = normalizeAttachments(payload.attachments).map((a) => ({
    ...a,
    uploadedBy: a.uploadedBy || actor._id,
  }));

  if (!stripHtml(text) && !attachments.length) {
    throw new AppError('Message text or attachment is required', 400, {
      code: 'TEXT_REQUIRED',
    });
  }

  let parentMessage = null;
  if (payload.parentMessage) {
    ensureObjectId(payload.parentMessage, 'parent message');
    parentMessage = await Message.findById(payload.parentMessage);
    if (!parentMessage || parentMessage.channel.toString() !== channel._id.toString()) {
      throw new AppError('Parent message not found in this channel', 404, {
        code: 'PARENT_NOT_FOUND',
      });
    }
    if (parentMessage.parentMessage) {
      throw new AppError('Cannot reply to a thread reply', 400, { code: 'NESTED_THREAD' });
    }
  }

  const mentions = normalizeMentions(payload.mentions);
  const contentFormat =
    payload.contentFormat === 'html' || payload.contentFormat === 'plain'
      ? payload.contentFormat
      : text.includes('<') && text.includes('>')
        ? 'html'
        : 'plain';
  const searchText = stripHtml(text);

  const message = await Message.create({
    channel: channel._id,
    sender: actor._id,
    text,
    contentFormat,
    searchText,
    mentions,
    parentMessage: parentMessage ? parentMessage._id : null,
    attachments,
    reactions: [],
  });

  const populated = await populateMessage(message._id);
  const { emitToChannel, emitToUser } = require('../socket');
  emitToChannel(channel._id, 'message:new', populated);

  // Notify members not in the channel room via user channel list refresh
  for (const memberId of channel.members) {
    if (memberId.toString() === actor._id.toString()) continue;
    emitToUser(memberId, 'channel:unread', {
      channelId: channel._id.toString(),
      messageId: message._id.toString(),
    });
  }

  const channelLabel =
    channel.type === 'dm'
      ? 'a direct message'
      : `#${channel.name || 'channel'}`;

  const preview = stripHtml(text).slice(0, 200) || (attachments.length ? 'Sent an attachment' : '');

  await notifyChatEvent({
    actor,
    channel,
    message,
    recipientIds: mentions,
    type: 'mention',
    title: `${actor.name} mentioned you in ${channelLabel}`,
    body: preview,
  });

  if (channel.type === 'dm') {
    const otherIds = channel.members
      .map((m) => m.toString())
      .filter((id) => id !== actor._id.toString());
    await notifyChatEvent({
      actor,
      channel,
      message,
      recipientIds: otherIds,
      type: 'message',
      title: `${actor.name} sent you a message`,
      body: preview,
    });
  }

  await Channel.findByIdAndUpdate(channel._id, { updatedAt: new Date() });

  return populated;
}

async function uploadMessageAttachment(actor, channelId, file) {
  await loadChannelForActor(actor, channelId, { mustPost: true });

  if (!file) {
    throw new AppError('File is required', 400, { code: 'FILE_REQUIRED' });
  }

  // Repair MIME if busboy/multer left a corrupted type
  const { normalizeChatMime } = require('../middleware/upload');
  normalizeChatMime(file);

  const { uploadChatFile } = require('./cloudinaryService');
  const uploaded = await uploadChatFile(file, channelId, actor._id);
  const mime = file.mimetype || '';
  const isImage = mime.startsWith('image/');
  const isVideoOrAudio = mime.startsWith('video/') || mime.startsWith('audio/');

  return {
    url: uploaded.url,
    filename: file.originalname || 'file',
    uploadedBy: actor._id,
    size: uploaded.bytes || file.size || 0,
    mimeType: mime,
    publicId: uploaded.publicId,
    resourceType:
      uploaded.resourceType ||
      (isImage ? 'image' : isVideoOrAudio ? 'video' : 'raw'),
  };
}

async function getMessageById(actor, messageId) {
  const message = await getMessageOrThrow(messageId);
  await loadChannelForActor(actor, message.channel);
  return populateMessage(messageId);
}

async function updateMessage(actor, messageId, payload) {
  const message = await getMessageOrThrow(messageId);
  await loadChannelForActor(actor, message.channel);

  if (!canEditMessage(message, actor)) {
    throw new AppError('You cannot edit this message', 403, { code: 'FORBIDDEN' });
  }

  const text = String(payload.text || '').trim();
  if (!stripHtml(text) && !(message.attachments || []).length) {
    throw new AppError('Message text is required', 400, { code: 'TEXT_REQUIRED' });
  }

  message.text = text;
  message.searchText = stripHtml(text);
  if (payload.contentFormat === 'html' || payload.contentFormat === 'plain') {
    message.contentFormat = payload.contentFormat;
  } else if (text.includes('<') && text.includes('>')) {
    message.contentFormat = 'html';
  }
  message.editedAt = new Date();
  if (payload.mentions !== undefined) {
    message.mentions = normalizeMentions(payload.mentions);
  }

  await message.save();
  const populated = await populateMessage(messageId);

  const { emitToChannel } = require('../socket');
  emitToChannel(message.channel, 'message:updated', populated);

  return populated;
}

async function deleteMessage(actor, messageId) {
  const message = await getMessageOrThrow(messageId);
  await loadChannelForActor(actor, message.channel);

  if (!canDeleteMessage(message, actor)) {
    throw new AppError('You cannot delete this message', 403, { code: 'FORBIDDEN' });
  }

  const channelId = message.channel.toString();
  const id = message._id.toString();
  const parentMessage = message.parentMessage ? message.parentMessage.toString() : null;

  const { destroyImage } = require('./cloudinaryService');
  for (const att of message.attachments || []) {
    if (att.publicId) {
      await destroyImage(att.publicId, att.resourceType || 'image');
    }
  }

  await Message.deleteMany({ parentMessage: message._id });
  await message.deleteOne();

  const { emitToChannel } = require('../socket');
  emitToChannel(channelId, 'message:deleted', { id, channelId, parentMessage });

  return { deleted: true, id };
}

async function listReplies(actor, messageId) {
  const parent = await getMessageOrThrow(messageId);
  await loadChannelForActor(actor, parent.channel);

  const replies = await Message.find({ parentMessage: parent._id })
    .populate(MESSAGE_POPULATE)
    .sort({ createdAt: 1 })
    .lean();

  return {
    parent: await populateMessage(messageId),
    replies,
  };
}

async function toggleReaction(actor, messageId, emoji) {
  const message = await getMessageOrThrow(messageId);
  await loadChannelForActor(actor, message.channel, { mustPost: true });

  const cleanEmoji = String(emoji || '').trim();
  if (!cleanEmoji) {
    throw new AppError('Emoji is required', 400, { code: 'EMOJI_REQUIRED' });
  }

  const userId = actor._id.toString();
  let reaction = message.reactions.find((r) => r.emoji === cleanEmoji);

  if (!reaction) {
    message.reactions.push({ emoji: cleanEmoji, users: [actor._id] });
  } else {
    const idx = reaction.users.findIndex((id) => id.toString() === userId);
    if (idx >= 0) {
      reaction.users.splice(idx, 1);
      if (reaction.users.length === 0) {
        message.reactions = message.reactions.filter((r) => r.emoji !== cleanEmoji);
      }
    } else {
      reaction.users.push(actor._id);
    }
  }

  await message.save();
  const populated = await populateMessage(messageId);

  const { emitToChannel } = require('../socket');
  emitToChannel(message.channel, 'reaction:updated', populated);

  return populated;
}

async function setMessagePinned(actor, messageId, pinned) {
  const message = await getMessageOrThrow(messageId);
  await loadChannelForActor(actor, message.channel, { mustPost: true });

  if (message.parentMessage) {
    throw new AppError('Cannot pin thread replies', 400, { code: 'PIN_THREAD_REPLY' });
  }

  if (pinned) {
    if (message.pinnedAt) {
      return populateMessage(messageId);
    }
    const pinCount = await Message.countDocuments({
      channel: message.channel,
      pinnedAt: { $ne: null },
    });
    if (pinCount >= MAX_PINS_PER_CHANNEL) {
      throw new AppError('Pin limit reached for this channel', 400, { code: 'PIN_LIMIT' });
    }
    message.pinnedAt = new Date();
    message.pinnedBy = actor._id;
  } else {
    message.pinnedAt = null;
    message.pinnedBy = null;
  }

  await message.save();
  const populated = await populateMessage(messageId);
  const { emitToChannel } = require('../socket');
  emitToChannel(
    message.channel,
    pinned ? 'message:pinned' : 'message:unpinned',
    populated
  );
  return populated;
}

async function searchMessages(actor, query = {}) {
  const q = String(query.q || '').trim();
  if (!q || q.length < 2) {
    throw new AppError('Search query must be at least 2 characters', 400, {
      code: 'QUERY_REQUIRED',
    });
  }

  const limit = Math.min(50, Math.max(1, Number(query.limit) || 20));
  const memberChannels = await Channel.find({ members: actor._id }).select('_id');
  const channelIds = memberChannels.map((c) => c._id);

  if (!channelIds.length) {
    return { messages: [], meta: { total: 0 } };
  }

  const escaped = q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const filter = {
    channel: { $in: channelIds },
    $or: [
      { searchText: { $regex: escaped, $options: 'i' } },
      { text: { $regex: escaped, $options: 'i' } },
    ],
  };

  if (query.channelId) {
    ensureObjectId(query.channelId, 'channel id');
    if (!channelIds.some((id) => id.toString() === query.channelId.toString())) {
      throw new AppError('You do not have access to this channel', 403, { code: 'FORBIDDEN' });
    }
    filter.channel = query.channelId;
  }

  if (query.fromUserId) {
    ensureObjectId(query.fromUserId, 'from user id');
    filter.sender = query.fromUserId;
  }

  if (query.after || query.before) {
    filter.createdAt = {};
    if (query.after) {
      const after = new Date(query.after);
      if (Number.isNaN(after.getTime())) {
        throw new AppError('Invalid after date', 400, { code: 'INVALID_DATE' });
      }
      filter.createdAt.$gte = after;
    }
    if (query.before) {
      const before = new Date(query.before);
      if (Number.isNaN(before.getTime())) {
        throw new AppError('Invalid before date', 400, { code: 'INVALID_DATE' });
      }
      filter.createdAt.$lte = before;
    }
  }

  const messages = await Message.find(filter)
    .populate(MESSAGE_POPULATE)
    .populate({ path: 'channel', select: 'name type members' })
    .sort({ createdAt: -1 })
    .limit(limit)
    .lean();

  return {
    messages,
    meta: { total: messages.length },
  };
}

async function listRecentAttachments(actor, channelId, query = {}) {
  await loadChannelForActor(actor, channelId);
  const limit = Math.min(50, Math.max(1, Number(query.limit) || 20));

  const rows = await Message.aggregate([
    {
      $match: {
        channel: new mongoose.Types.ObjectId(channelId),
        'attachments.0': { $exists: true },
      },
    },
    { $unwind: '$attachments' },
    { $sort: { createdAt: -1 } },
    {
      $group: {
        _id: '$attachments.url',
        url: { $first: '$attachments.url' },
        filename: { $first: '$attachments.filename' },
        size: { $first: '$attachments.size' },
        mimeType: { $first: '$attachments.mimeType' },
        publicId: { $first: '$attachments.publicId' },
        resourceType: { $first: '$attachments.resourceType' },
        uploadedBy: { $first: '$attachments.uploadedBy' },
        createdAt: { $first: '$createdAt' },
      },
    },
    { $sort: { createdAt: -1 } },
    { $limit: limit },
    {
      $project: {
        _id: 0,
        url: 1,
        filename: 1,
        size: 1,
        mimeType: 1,
        publicId: 1,
        resourceType: 1,
        uploadedBy: 1,
      },
    },
  ]);

  return rows;
}

module.exports = {
  listMessages,
  createMessage,
  uploadMessageAttachment,
  getMessageById,
  updateMessage,
  deleteMessage,
  listReplies,
  toggleReaction,
  setMessagePinned,
  searchMessages,
  listRecentAttachments,
};
