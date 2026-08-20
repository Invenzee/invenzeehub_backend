const { isAdminRole } = require('../constants/roles');

function memberIds(channel) {
  if (!channel?.members) return [];
  return channel.members.map((m) => {
    const id = m?._id || m;
    return id.toString();
  });
}

function isChannelMember(channel, userId) {
  if (!channel || !userId) return false;
  const uid = userId.toString();
  return memberIds(channel).includes(uid);
}

/** View channel content / messages — must be a member. */
function canViewChannel(channel, user) {
  if (!channel || !user) return false;
  return isChannelMember(channel, user._id);
}

/** Discover public channels without being a member. */
function canDiscoverChannel(channel, user) {
  if (!channel || !user) return false;
  if (channel.type === 'public') return true;
  return isChannelMember(channel, user._id);
}

function canPostInChannel(channel, user) {
  return canViewChannel(channel, user);
}

function canManageChannelMembers(channel, user) {
  if (!channel || !user) return false;
  if (channel.type === 'dm') return false;
  return isChannelMember(channel, user._id);
}

function canJoinChannel(channel, user) {
  if (!channel || !user) return false;
  if (channel.type !== 'public') return false;
  return !isChannelMember(channel, user._id);
}

function canManageChannel(channel, user) {
  if (!channel || !user) return false;
  if (channel.type === 'dm') return false;
  if (isAdminRole(user.role)) return true;
  const createdBy = channel.createdBy?._id || channel.createdBy;
  return createdBy && createdBy.toString() === user._id.toString();
}

function canDeleteMessage(message, user) {
  if (!message || !user) return false;
  if (isAdminRole(user.role)) return true;
  const sender = message.sender?._id || message.sender;
  return sender && sender.toString() === user._id.toString();
}

function canEditMessage(message, user) {
  if (!message || !user) return false;
  const sender = message.sender?._id || message.sender;
  return sender && sender.toString() === user._id.toString();
}

function buildDmKey(userIdA, userIdB) {
  return [userIdA.toString(), userIdB.toString()].sort().join(':');
}

module.exports = {
  memberIds,
  isChannelMember,
  canViewChannel,
  canDiscoverChannel,
  canPostInChannel,
  canManageChannelMembers,
  canJoinChannel,
  canManageChannel,
  canDeleteMessage,
  canEditMessage,
  buildDmKey,
};
