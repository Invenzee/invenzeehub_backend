const asyncHandler = require('../utils/asyncHandler');
const { success } = require('../utils/apiResponse');
const commentService = require('../services/commentService');

const list = asyncHandler(async (req, res) => {
  const comments = await commentService.listComments(req.user, req.params.cardId);
  return success(res, { message: 'Comments retrieved', data: comments });
});

const create = asyncHandler(async (req, res) => {
  const comment = await commentService.createComment(req.user, req.params.cardId, req.body);
  return success(res, { statusCode: 201, message: 'Comment created', data: comment });
});

const getById = asyncHandler(async (req, res) => {
  const comment = await commentService.getCommentById(req.user, req.params.id);
  return success(res, { message: 'Comment retrieved', data: comment });
});

const update = asyncHandler(async (req, res) => {
  const comment = await commentService.updateComment(req.user, req.params.id, req.body);
  return success(res, { message: 'Comment updated', data: comment });
});

const remove = asyncHandler(async (req, res) => {
  const result = await commentService.deleteComment(req.user, req.params.id);
  return success(res, { message: 'Comment deleted', data: result });
});

const react = asyncHandler(async (req, res) => {
  const comment = await commentService.toggleReaction(
    req.user,
    req.params.id,
    req.body.emoji
  );
  return success(res, { message: 'Reaction updated', data: comment });
});

module.exports = { list, create, getById, update, remove, react };
