const asyncHandler = require('../utils/asyncHandler');
const { success } = require('../utils/apiResponse');
const listService = require('../services/listService');

const list = asyncHandler(async (req, res) => {
  const lists = await listService.listLists(req.user, req.params.boardId);
  return success(res, { message: 'Lists retrieved', data: lists });
});

const create = asyncHandler(async (req, res) => {
  const list = await listService.createList(req.user, req.params.boardId, req.body);
  return success(res, { statusCode: 201, message: 'List created', data: list });
});

const getById = asyncHandler(async (req, res) => {
  const list = await listService.getListById(req.user, req.params.id);
  return success(res, { message: 'List retrieved', data: list });
});

const update = asyncHandler(async (req, res) => {
  const list = await listService.updateList(req.user, req.params.id, req.body);
  return success(res, { message: 'List updated', data: list });
});

const remove = asyncHandler(async (req, res) => {
  const result = await listService.deleteList(req.user, req.params.id);
  return success(res, { message: 'List deleted', data: result });
});

const reorder = asyncHandler(async (req, res) => {
  const lists = await listService.reorderLists(req.user, req.params.boardId, req.body.items);
  return success(res, { message: 'Lists reordered', data: lists });
});

module.exports = { list, create, getById, update, remove, reorder };
