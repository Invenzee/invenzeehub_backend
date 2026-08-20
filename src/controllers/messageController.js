const asyncHandler = require('../utils/asyncHandler');
const { success } = require('../utils/apiResponse');
const messageService = require('../services/messageService');
const transcriptionService = require('../services/transcriptionService');

const listByChannel = asyncHandler(async (req, res) => {
  const result = await messageService.listMessages(req.user, req.params.id, req.query);
  return success(res, {
    message: 'Messages retrieved',
    data: result.messages,
    meta: result.meta,
  });
});

const create = asyncHandler(async (req, res) => {
  const message = await messageService.createMessage(req.user, req.params.id, req.body);
  return success(res, { statusCode: 201, message: 'Message sent', data: message });
});

const uploadAttachment = asyncHandler(async (req, res) => {
  const attachment = await messageService.uploadMessageAttachment(
    req.user,
    req.params.id,
    req.file
  );
  return success(res, {
    statusCode: 201,
    message: 'Attachment uploaded',
    data: attachment,
  });
});

const getById = asyncHandler(async (req, res) => {
  const message = await messageService.getMessageById(req.user, req.params.id);
  return success(res, { message: 'Message retrieved', data: message });
});

const update = asyncHandler(async (req, res) => {
  const message = await messageService.updateMessage(req.user, req.params.id, req.body);
  return success(res, { message: 'Message updated', data: message });
});

const remove = asyncHandler(async (req, res) => {
  const result = await messageService.deleteMessage(req.user, req.params.id);
  return success(res, { message: 'Message deleted', data: result });
});

const listReplies = asyncHandler(async (req, res) => {
  const result = await messageService.listReplies(req.user, req.params.id);
  return success(res, { message: 'Thread retrieved', data: result });
});

const toggleReaction = asyncHandler(async (req, res) => {
  const message = await messageService.toggleReaction(req.user, req.params.id, req.body.emoji);
  return success(res, { message: 'Reaction updated', data: message });
});

const pin = asyncHandler(async (req, res) => {
  const message = await messageService.setMessagePinned(req.user, req.params.id, true);
  return success(res, { message: 'Message pinned', data: message });
});

const unpin = asyncHandler(async (req, res) => {
  const message = await messageService.setMessagePinned(req.user, req.params.id, false);
  return success(res, { message: 'Message unpinned', data: message });
});

const search = asyncHandler(async (req, res) => {
  const result = await messageService.searchMessages(req.user, req.query);
  return success(res, {
    message: 'Search results',
    data: result.messages,
    meta: result.meta,
  });
});

const recentAttachments = asyncHandler(async (req, res) => {
  const attachments = await messageService.listRecentAttachments(
    req.user,
    req.params.id,
    req.query
  );
  return success(res, {
    message: 'Recent attachments retrieved',
    data: attachments,
  });
});

const transcribe = asyncHandler(async (req, res) => {
  const result = await transcriptionService.transcribeAudioUrl(req.body.url);
  return success(res, {
    message: 'Transcript generated',
    data: result,
  });
});

module.exports = {
  listByChannel,
  create,
  uploadAttachment,
  recentAttachments,
  getById,
  update,
  remove,
  listReplies,
  toggleReaction,
  pin,
  unpin,
  search,
  transcribe,
};
