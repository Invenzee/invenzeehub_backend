const asyncHandler = require('../utils/asyncHandler');
const { success } = require('../utils/apiResponse');
const channelService = require('../services/channelService');

const list = asyncHandler(async (req, res) => {
  const channels = await channelService.listChannels(req.user);
  return success(res, { message: 'Channels retrieved', data: channels });
});

const unreadSummary = asyncHandler(async (req, res) => {
  const data = await channelService.getUnreadSummary(req.user);
  return success(res, { message: 'Unread summary', data });
});

const create = asyncHandler(async (req, res) => {
  const channel = await channelService.createChannel(req.user, req.body);
  return success(res, { statusCode: 201, message: 'Channel created', data: channel });
});

const createDm = asyncHandler(async (req, res) => {
  const channel = await channelService.getOrCreateDm(req.user, req.body.userId);
  return success(res, { message: 'DM channel ready', data: channel });
});

const getById = asyncHandler(async (req, res) => {
  const channel = await channelService.getChannelById(req.user, req.params.id);
  return success(res, { message: 'Channel retrieved', data: channel });
});

const update = asyncHandler(async (req, res) => {
  const channel = await channelService.updateChannel(req.user, req.params.id, req.body);
  return success(res, { message: 'Channel updated', data: channel });
});

const remove = asyncHandler(async (req, res) => {
  const result = await channelService.deleteChannel(req.user, req.params.id);
  return success(res, { message: 'Channel deleted', data: result });
});

const join = asyncHandler(async (req, res) => {
  const channel = await channelService.joinChannel(req.user, req.params.id);
  return success(res, { message: 'Joined channel', data: channel });
});

const addMembers = asyncHandler(async (req, res) => {
  const channel = await channelService.addChannelMembers(
    req.user,
    req.params.id,
    req.body.userIds
  );
  return success(res, { message: 'Members added', data: channel });
});

const removeMember = asyncHandler(async (req, res) => {
  const channel = await channelService.removeChannelMember(
    req.user,
    req.params.id,
    req.params.userId
  );
  return success(res, { message: 'Member removed', data: channel });
});

const markRead = asyncHandler(async (req, res) => {
  const data = await channelService.markChannelRead(req.user, req.params.id, req.body);
  return success(res, { message: 'Channel marked read', data });
});

const mute = asyncHandler(async (req, res) => {
  const data = await channelService.setChannelMute(req.user, req.params.id, true);
  return success(res, { message: 'Channel muted', data });
});

const unmute = asyncHandler(async (req, res) => {
  const data = await channelService.setChannelMute(req.user, req.params.id, false);
  return success(res, { message: 'Channel unmuted', data });
});

const listPins = asyncHandler(async (req, res) => {
  const pins = await channelService.listPinnedMessages(req.user, req.params.id);
  return success(res, { message: 'Pinned messages retrieved', data: pins });
});

module.exports = {
  list,
  unreadSummary,
  create,
  createDm,
  getById,
  update,
  remove,
  join,
  addMembers,
  removeMember,
  markRead,
  mute,
  unmute,
  listPins,
};
