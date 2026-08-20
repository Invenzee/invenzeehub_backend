const asyncHandler = require('../utils/asyncHandler');
const { success } = require('../utils/apiResponse');
const workspaceService = require('../services/workspaceService');

const create = asyncHandler(async (req, res) => {
  const workspace = await workspaceService.createWorkspace(req.user, req.body);
  return success(res, {
    statusCode: 201,
    message: 'Workspace created',
    data: workspace,
  });
});

const list = asyncHandler(async (req, res) => {
  const result = await workspaceService.listWorkspaces(req.user, req.query);
  return success(res, {
    message: 'Workspaces retrieved',
    data: result.workspaces,
    meta: result.meta,
  });
});

const getById = asyncHandler(async (req, res) => {
  const workspace = await workspaceService.getWorkspaceById(req.user, req.params.id);
  return success(res, { message: 'Workspace retrieved', data: workspace });
});

const update = asyncHandler(async (req, res) => {
  const workspace = await workspaceService.updateWorkspace(req.user, req.params.id, req.body);
  return success(res, { message: 'Workspace updated', data: workspace });
});

const remove = asyncHandler(async (req, res) => {
  const result = await workspaceService.deleteWorkspace(req.user, req.params.id);
  return success(res, { message: 'Workspace deleted', data: result });
});

const addMembers = asyncHandler(async (req, res) => {
  const workspace = await workspaceService.addMembers(
    req.user,
    req.params.id,
    req.body.userIds
  );
  return success(res, { message: 'Members added', data: workspace });
});

const removeMember = asyncHandler(async (req, res) => {
  const workspace = await workspaceService.removeMember(
    req.user,
    req.params.id,
    req.params.userId
  );
  return success(res, { message: 'Member removed', data: workspace });
});

const addOwners = asyncHandler(async (req, res) => {
  const workspace = await workspaceService.addOwners(
    req.user,
    req.params.id,
    req.body.userIds
  );
  return success(res, { message: 'Owners added', data: workspace });
});

const removeOwner = asyncHandler(async (req, res) => {
  const workspace = await workspaceService.removeOwner(
    req.user,
    req.params.id,
    req.params.userId
  );
  return success(res, { message: 'Owner removed', data: workspace });
});

const leave = asyncHandler(async (req, res) => {
  const result = await workspaceService.leaveWorkspace(req.user, req.params.id);
  return success(res, { message: 'Left workspace', data: result });
});

module.exports = {
  create,
  list,
  getById,
  update,
  remove,
  addMembers,
  removeMember,
  addOwners,
  removeOwner,
  leave,
};
