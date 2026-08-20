const asyncHandler = require('../utils/asyncHandler');
const { success } = require('../utils/apiResponse');
const cardService = require('../services/cardService');
const activityService = require('../services/activityService');

const list = asyncHandler(async (req, res) => {
  const cards = await cardService.listCards(req.user, req.params.listId);
  return success(res, { message: 'Cards retrieved', data: cards });
});

const create = asyncHandler(async (req, res) => {
  const card = await cardService.createCard(req.user, req.params.listId, req.body);
  return success(res, { statusCode: 201, message: 'Card created', data: card });
});

const getById = asyncHandler(async (req, res) => {
  const card = await cardService.getCardById(req.user, req.params.id);
  return success(res, { message: 'Card retrieved', data: card });
});

const update = asyncHandler(async (req, res) => {
  const card = await cardService.updateCard(req.user, req.params.id, req.body);
  return success(res, { message: 'Card updated', data: card });
});

const remove = asyncHandler(async (req, res) => {
  const result = await cardService.deleteCard(req.user, req.params.id);
  return success(res, { message: 'Card deleted', data: result });
});

const move = asyncHandler(async (req, res) => {
  const card = await cardService.moveCard(req.user, req.params.id, req.body);
  return success(res, { message: 'Card moved', data: card });
});

const copy = asyncHandler(async (req, res) => {
  const card = await cardService.copyCard(req.user, req.params.id, req.body);
  return success(res, { statusCode: 201, message: 'Card copied', data: card });
});

const archive = asyncHandler(async (req, res) => {
  const card = await cardService.archiveCard(req.user, req.params.id);
  return success(res, { message: 'Card archived', data: card });
});

const unarchive = asyncHandler(async (req, res) => {
  const card = await cardService.unarchiveCard(req.user, req.params.id);
  return success(res, { message: 'Card unarchived', data: card });
});

const watch = asyncHandler(async (req, res) => {
  const card = await cardService.watchCard(req.user, req.params.id);
  return success(res, { message: 'Watching card', data: card });
});

const unwatch = asyncHandler(async (req, res) => {
  const card = await cardService.unwatchCard(req.user, req.params.id);
  return success(res, { message: 'Unwatched card', data: card });
});

const share = asyncHandler(async (req, res) => {
  const result = await cardService.shareCard(req.user, req.params.id, req.body);
  return success(res, { message: 'Share link ready', data: result });
});

const clearCover = asyncHandler(async (req, res) => {
  const card = await cardService.clearCover(req.user, req.params.id);
  return success(res, { message: 'Cover removed', data: card });
});

const activity = asyncHandler(async (req, res) => {
  const result = await activityService.listCardActivity(req.user, req.params.id, req.query);
  return success(res, {
    message: 'Activity retrieved',
    data: result.items,
    meta: result.meta,
  });
});

const reorder = asyncHandler(async (req, res) => {
  const cards = await cardService.reorderCards(req.user, req.params.listId, req.body.items);
  return success(res, { message: 'Cards reordered', data: cards });
});

const uploadAttachment = asyncHandler(async (req, res) => {
  const card = await cardService.addAttachmentFile(req.user, req.params.id, req.file);
  return success(res, { statusCode: 201, message: 'Attachment uploaded', data: card });
});

const addLink = asyncHandler(async (req, res) => {
  const card = await cardService.addAttachmentLink(req.user, req.params.id, req.body);
  return success(res, { statusCode: 201, message: 'Link added', data: card });
});

const removeAttachment = asyncHandler(async (req, res) => {
  const card = await cardService.removeAttachment(
    req.user,
    req.params.id,
    req.params.attachmentId
  );
  return success(res, { message: 'Attachment removed', data: card });
});

const setCover = asyncHandler(async (req, res) => {
  const card = await cardService.setCardCover(req.user, req.params.id, req.params.attachmentId);
  return success(res, { message: 'Cover updated', data: card });
});

module.exports = {
  list,
  create,
  getById,
  update,
  remove,
  move,
  copy,
  archive,
  unarchive,
  watch,
  unwatch,
  share,
  clearCover,
  activity,
  reorder,
  uploadAttachment,
  addLink,
  removeAttachment,
  setCover,
};
