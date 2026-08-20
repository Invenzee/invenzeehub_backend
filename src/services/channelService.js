const mongoose = require('mongoose');
const { Channel, User, Message, ChannelReadState } = require('../models');
const AppError = require('../utils/AppError');
const {
  isChannelMember,
  canViewChannel,
  canDiscoverChannel,
  canManageChannelMembers,
  canJoinChannel,
  canManageChannel,
  buildDmKey,
} = require('../utils/channelAccess');

const CHANNEL_POPULATE = [
  { path: 'members', select: 'name email avatarUrl role department status' },
  { path: 'createdBy', select: 'name email avatarUrl role department' },
];

function ensureObjectId(id, label = 'id') {
  if (!mongoose.Types.ObjectId.isValid(id)) {
    throw new AppError(`Invalid ${label}`, 400, { code: 'INVALID_ID' });
  }
}

async function getChannelOrThrow(id) {
  ensureObjectId(id, 'channel id');
  const channel = await Channel.findById(id);
  if (!channel) {
    throw new AppError('Channel not found', 404, { code: 'CHANNEL_NOT_FOUND' });
  }
  return channel;
}

async function populateChannel(id) {
  return Channel.findById(id).populate(CHANNEL_POPULATE).lean();
}

function mutedChannelIds(actor) {
  const muted = actor?.notificationPrefs?.mutedChannels || [];
  return new Set(muted.map((id) => id.toString()));
}

async function unreadCountsForChannels(userId, channelIds) {
  if (!channelIds.length) return new Map();

  const states = await ChannelReadState.find({
    user: userId,
    channel: { $in: channelIds },
  }).lean();

  const stateByChannel = new Map(
    states.map((s) => [s.channel.toString(), s])
  );

  const counts = await Promise.all(
    channelIds.map(async (channelId) => {
      const state = stateByChannel.get(channelId.toString());
      const filter = {
        channel: channelId,
        parentMessage: null,
        sender: { $ne: userId },
      };
      if (state?.lastReadAt) {
        filter.createdAt = { $gt: state.lastReadAt };
      }
      const count = await Message.countDocuments(filter);
      return [channelId.toString(), count];
    })
  );

  return new Map(counts);
}

/**
 * List channels the user belongs to, plus public channels for discovery.
 * Each item includes `isMember`, `unreadCount`, `hasUnread`, `isMuted`.
 */
async function listChannels(actor) {
  const memberChannels = await Channel.find({ members: actor._id })
    .populate(CHANNEL_POPULATE)
    .sort({ updatedAt: -1 })
    .lean();

  const memberIds = new Set(memberChannels.map((c) => c._id.toString()));

  const publicChannels = await Channel.find({
    type: 'public',
    _id: { $nin: [...memberIds] },
  })
    .populate(CHANNEL_POPULATE)
    .sort({ name: 1 })
    .lean();

  const unreadMap = await unreadCountsForChannels(
    actor._id,
    memberChannels.map((c) => c._id)
  );
  const muted = mutedChannelIds(actor);

  return [
    ...memberChannels.map((c) => {
      const unreadCount = unreadMap.get(c._id.toString()) || 0;
      return {
        ...c,
        isMember: true,
        unreadCount,
        hasUnread: unreadCount > 0,
        isMuted: muted.has(c._id.toString()),
      };
    }),
    ...publicChannels.map((c) => ({
      ...c,
      isMember: false,
      unreadCount: 0,
      hasUnread: false,
      isMuted: muted.has(c._id.toString()),
    })),
  ];
}

async function getUnreadSummary(actor) {
  const memberChannels = await Channel.find({ members: actor._id }).select('_id');
  const unreadMap = await unreadCountsForChannels(
    actor._id,
    memberChannels.map((c) => c._id)
  );
  let totalUnread = 0;
  let channelsWithUnread = 0;
  for (const count of unreadMap.values()) {
    if (count > 0) {
      totalUnread += count;
      channelsWithUnread += 1;
    }
  }
  return { totalUnread, channelsWithUnread };
}

async function getChannelById(actor, channelId) {
  const channel = await getChannelOrThrow(channelId);

  if (!canDiscoverChannel(channel, actor)) {
    throw new AppError('You do not have access to this channel', 403, { code: 'FORBIDDEN' });
  }

  const lean = await populateChannel(channelId);
  const isMember = isChannelMember(channel, actor._id);
  let unreadCount = 0;
  if (isMember) {
    const map = await unreadCountsForChannels(actor._id, [channel._id]);
    unreadCount = map.get(channel._id.toString()) || 0;
  }

  return {
    ...lean,
    isMember,
    unreadCount,
    hasUnread: unreadCount > 0,
    isMuted: mutedChannelIds(actor).has(channel._id.toString()),
  };
}

async function createChannel(actor, payload) {
  const type = payload.type;
  if (type !== 'public' && type !== 'private') {
    throw new AppError('Channel type must be public or private', 400, { code: 'INVALID_TYPE' });
  }

  const name = String(payload.name || '').trim();
  if (!name) {
    throw new AppError('Channel name is required', 400, { code: 'NAME_REQUIRED' });
  }

  const memberSet = new Set([actor._id.toString()]);
  for (const id of payload.memberIds || []) {
    ensureObjectId(id, 'member id');
    memberSet.add(id.toString());
  }

  const users = await User.find({
    _id: { $in: [...memberSet] },
    status: 'active',
  }).select('_id');

  if (users.length !== memberSet.size) {
    throw new AppError('One or more members are invalid or inactive', 400, {
      code: 'INVALID_MEMBERS',
    });
  }

  const channel = await Channel.create({
    workspace: null,
    name,
    topic: String(payload.topic || '').trim().slice(0, 250),
    description: String(payload.description || '').trim().slice(0, 2000),
    type,
    members: users.map((u) => u._id),
    createdBy: actor._id,
    dmKey: null,
  });

  await ChannelReadState.findOneAndUpdate(
    { user: actor._id, channel: channel._id },
    { lastReadAt: new Date(), lastReadMessageId: null },
    { upsert: true, new: true }
  );

  return populateChannel(channel._id);
}

async function getOrCreateDm(actor, otherUserId) {
  ensureObjectId(otherUserId, 'user id');

  if (otherUserId.toString() === actor._id.toString()) {
    throw new AppError('Cannot create a DM with yourself', 400, { code: 'INVALID_DM' });
  }

  const other = await User.findById(otherUserId);
  if (!other || other.status !== 'active') {
    throw new AppError('User not found', 404, { code: 'USER_NOT_FOUND' });
  }

  const dmKey = buildDmKey(actor._id, otherUserId);
  let channel = await Channel.findOne({ type: 'dm', dmKey });

  if (!channel) {
    channel = await Channel.create({
      workspace: null,
      name: null,
      type: 'dm',
      members: [actor._id, other._id],
      createdBy: actor._id,
      dmKey,
    });
  }

  const lean = await populateChannel(channel._id);
  return { ...lean, isMember: true, isMuted: mutedChannelIds(actor).has(lean._id.toString()) };
}

async function updateChannel(actor, channelId, payload) {
  const channel = await getChannelOrThrow(channelId);

  if (!canManageChannel(channel, actor)) {
    throw new AppError('You cannot update this channel', 403, { code: 'FORBIDDEN' });
  }

  if (payload.name !== undefined) {
    const name = String(payload.name || '').trim();
    if (!name) {
      throw new AppError('Channel name is required', 400, { code: 'NAME_REQUIRED' });
    }
    channel.name = name;
  }

  if (payload.topic !== undefined) {
    channel.topic = String(payload.topic || '').trim().slice(0, 250);
  }

  if (payload.description !== undefined) {
    channel.description = String(payload.description || '').trim().slice(0, 2000);
  }

  await channel.save();
  return populateChannel(channelId);
}

async function deleteChannel(actor, channelId) {
  const channel = await getChannelOrThrow(channelId);

  if (channel.type === 'dm') {
    throw new AppError('DM channels cannot be deleted', 400, { code: 'DM_NO_DELETE' });
  }

  if (!canManageChannel(channel, actor)) {
    throw new AppError('You cannot delete this channel', 403, { code: 'FORBIDDEN' });
  }

  await Message.deleteMany({ channel: channel._id });
  await ChannelReadState.deleteMany({ channel: channel._id });
  await channel.deleteOne();

  return { deleted: true, id: channelId };
}

async function joinChannel(actor, channelId) {
  const channel = await getChannelOrThrow(channelId);

  if (!canJoinChannel(channel, actor)) {
    if (isChannelMember(channel, actor._id)) {
      return populateChannel(channelId);
    }
    throw new AppError('You cannot join this channel', 403, { code: 'FORBIDDEN' });
  }

  channel.members.push(actor._id);
  await channel.save();

  await ChannelReadState.findOneAndUpdate(
    { user: actor._id, channel: channel._id },
    { lastReadAt: new Date(), lastReadMessageId: null },
    { upsert: true, new: true }
  );

  return populateChannel(channelId);
}

async function addChannelMembers(actor, channelId, userIds) {
  const channel = await getChannelOrThrow(channelId);

  if (!canManageChannelMembers(channel, actor)) {
    throw new AppError('You cannot manage members of this channel', 403, { code: 'FORBIDDEN' });
  }

  const ids = [...new Set((userIds || []).map((id) => id.toString()))];
  if (!ids.length) {
    throw new AppError('userIds is required', 400, { code: 'USER_IDS_REQUIRED' });
  }

  for (const id of ids) ensureObjectId(id, 'user id');

  const users = await User.find({ _id: { $in: ids }, status: 'active' }).select('_id');
  if (users.length !== ids.length) {
    throw new AppError('One or more users are invalid or inactive', 400, {
      code: 'INVALID_MEMBERS',
    });
  }

  const existing = new Set(channel.members.map((m) => m.toString()));
  for (const u of users) {
    if (!existing.has(u._id.toString())) {
      channel.members.push(u._id);
    }
  }

  await channel.save();
  return populateChannel(channelId);
}

async function removeChannelMember(actor, channelId, userId) {
  const channel = await getChannelOrThrow(channelId);

  if (!canManageChannelMembers(channel, actor)) {
    throw new AppError('You cannot manage members of this channel', 403, { code: 'FORBIDDEN' });
  }

  ensureObjectId(userId, 'user id');

  if (!isChannelMember(channel, userId)) {
    throw new AppError('User is not a channel member', 404, { code: 'NOT_A_MEMBER' });
  }

  if (channel.members.length <= 1) {
    throw new AppError('Cannot remove the last channel member', 400, {
      code: 'LAST_MEMBER',
    });
  }

  channel.members = channel.members.filter((m) => m.toString() !== userId.toString());
  await channel.save();
  await ChannelReadState.deleteOne({ user: userId, channel: channel._id });
  return populateChannel(channelId);
}

async function markChannelRead(actor, channelId, payload = {}) {
  const channel = await getChannelOrThrow(channelId);
  if (!canViewChannel(channel, actor)) {
    throw new AppError('You do not have access to this channel', 403, { code: 'FORBIDDEN' });
  }

  let lastReadAt = new Date();
  let lastReadMessageId = null;

  if (payload.messageId) {
    ensureObjectId(payload.messageId, 'message id');
    const message = await Message.findById(payload.messageId);
    if (!message || message.channel.toString() !== channel._id.toString()) {
      throw new AppError('Message not found in this channel', 404, {
        code: 'MESSAGE_NOT_FOUND',
      });
    }
    lastReadAt = message.createdAt;
    lastReadMessageId = message._id;
  } else {
    const latest = await Message.findOne({ channel: channel._id, parentMessage: null })
      .sort({ createdAt: -1 })
      .select('_id createdAt');
    if (latest) {
      lastReadAt = latest.createdAt;
      lastReadMessageId = latest._id;
    }
  }

  await ChannelReadState.findOneAndUpdate(
    { user: actor._id, channel: channel._id },
    { lastReadAt, lastReadMessageId },
    { upsert: true, new: true }
  );

  return { channelId, lastReadAt, lastReadMessageId, unreadCount: 0, hasUnread: false };
}

async function setChannelMute(actor, channelId, muted) {
  const channel = await getChannelOrThrow(channelId);
  if (!isChannelMember(channel, actor._id)) {
    throw new AppError('You must be a channel member to mute it', 403, { code: 'FORBIDDEN' });
  }

  const user = await User.findById(actor._id);
  if (!user) {
    throw new AppError('User not found', 404, { code: 'USER_NOT_FOUND' });
  }

  const prefs = user.notificationPrefs || {};
  const current = [...(prefs.mutedChannels || [])].map((id) => id.toString());
  const id = channel._id.toString();

  let next;
  if (muted) {
    next = current.includes(id) ? current : [...current, id];
  } else {
    next = current.filter((x) => x !== id);
  }

  user.notificationPrefs = {
    ...(prefs.toObject?.() || prefs),
    mutedChannels: next,
  };
  await user.save();

  // Keep actor in-memory prefs in sync for subsequent calls in same request
  actor.notificationPrefs = user.notificationPrefs;

  return {
    channelId: id,
    isMuted: muted,
  };
}

async function listPinnedMessages(actor, channelId) {
  await assertCanViewChannel(actor, channelId);

  return Message.find({ channel: channelId, pinnedAt: { $ne: null } })
    .populate([
      { path: 'sender', select: 'name email avatarUrl role department' },
      { path: 'mentions', select: 'name email avatarUrl' },
      { path: 'pinnedBy', select: 'name email avatarUrl' },
      { path: 'reactions.users', select: 'name email avatarUrl' },
      { path: 'attachments.uploadedBy', select: 'name email avatarUrl' },
    ])
    .sort({ pinnedAt: -1 })
    .lean();
}

async function assertCanViewChannel(actor, channelId) {
  const channel = await getChannelOrThrow(channelId);
  if (!canViewChannel(channel, actor)) {
    throw new AppError('You do not have access to this channel', 403, { code: 'FORBIDDEN' });
  }
  return channel;
}

module.exports = {
  listChannels,
  getUnreadSummary,
  getChannelById,
  createChannel,
  getOrCreateDm,
  updateChannel,
  deleteChannel,
  joinChannel,
  addChannelMembers,
  removeChannelMember,
  markChannelRead,
  setChannelMute,
  listPinnedMessages,
  getChannelOrThrow,
  assertCanViewChannel,
  populateChannel,
};
