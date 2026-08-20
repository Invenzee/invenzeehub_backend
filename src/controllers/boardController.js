const asyncHandler = require('../utils/asyncHandler');
const { success } = require('../utils/apiResponse');
const boardService = require('../services/boardService');

const list = asyncHandler(async (req, res) => {
  const boards = await boardService.listBoards(req.user, req.params.workspaceId);
  return success(res, { message: 'Boards retrieved', data: boards });
});

const create = asyncHandler(async (req, res) => {
  const board = await boardService.createBoard(req.user, req.params.workspaceId, req.body);
  return success(res, { statusCode: 201, message: 'Board created', data: board });
});

const getById = asyncHandler(async (req, res) => {
  const board = await boardService.getBoardById(req.user, req.params.id);
  return success(res, { message: 'Board retrieved', data: board });
});

const kanban = asyncHandler(async (req, res) => {
  const data = await boardService.getBoardKanban(req.user, req.params.id);
  return success(res, { message: 'Board kanban retrieved', data });
});

const update = asyncHandler(async (req, res) => {
  const board = await boardService.updateBoard(req.user, req.params.id, req.body);
  return success(res, { message: 'Board updated', data: board });
});

const remove = asyncHandler(async (req, res) => {
  const result = await boardService.deleteBoard(req.user, req.params.id);
  return success(res, { message: 'Board deleted', data: result });
});

const reorder = asyncHandler(async (req, res) => {
  const boards = await boardService.reorderBoards(
    req.user,
    req.params.workspaceId,
    req.body.items
  );
  return success(res, { message: 'Boards reordered', data: boards });
});

const addMembers = asyncHandler(async (req, res) => {
  const board = await boardService.addBoardMembers(req.user, req.params.id, req.body.userIds);
  return success(res, { message: 'Board members added', data: board });
});

const removeMember = asyncHandler(async (req, res) => {
  const board = await boardService.removeBoardMember(
    req.user,
    req.params.id,
    req.params.userId
  );
  return success(res, { message: 'Board member removed', data: board });
});

const requestDelete = asyncHandler(async (req, res) => {
  const request = await boardService.requestDeleteBoard(
    req.user,
    req.params.id,
    req.body.reason
  );
  return success(res, {
    statusCode: 201,
    message: 'Board delete request submitted',
    data: request,
  });
});

const listDeleteRequests = asyncHandler(async (req, res) => {
  const requests = await boardService.listDeleteRequests(req.user, {
    workspaceId: req.query.workspaceId,
    status: req.query.status,
  });
  return success(res, { message: 'Board delete requests retrieved', data: requests });
});

const approveDeleteRequest = asyncHandler(async (req, res) => {
  const request = await boardService.approveDeleteRequest(req.user, req.params.id);
  return success(res, { message: 'Board delete request approved', data: request });
});

const rejectDeleteRequest = asyncHandler(async (req, res) => {
  const request = await boardService.rejectDeleteRequest(req.user, req.params.id);
  return success(res, { message: 'Board delete request rejected', data: request });
});

module.exports = {
  list,
  create,
  getById,
  kanban,
  update,
  remove,
  reorder,
  addMembers,
  removeMember,
  requestDelete,
  listDeleteRequests,
  approveDeleteRequest,
  rejectDeleteRequest,
};
