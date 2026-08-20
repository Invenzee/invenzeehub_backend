const asyncHandler = require('../utils/asyncHandler');
const { success } = require('../utils/apiResponse');
const userService = require('../services/userService');
const AppError = require('../utils/AppError');

const bootstrap = asyncHandler(async (req, res) => {
  const user = await userService.bootstrapSuperAdmin(req.body);
  return success(res, {
    statusCode: 201,
    message: 'Super admin invited. Complete login with the email verification code.',
    data: user,
  });
});

const invite = asyncHandler(async (req, res) => {
  const user = await userService.inviteUser(req.user, req.body);
  return success(res, {
    statusCode: 201,
    message: 'User invited successfully',
    data: user,
  });
});

const list = asyncHandler(async (req, res) => {
  const result = await userService.listUsers(req.query);
  return success(res, {
    message: 'Users retrieved',
    data: result.users,
    meta: result.meta,
  });
});

const directory = asyncHandler(async (_req, res) => {
  const users = await userService.listDirectory();
  return success(res, { message: 'Directory retrieved', data: users });
});

const getById = asyncHandler(async (req, res) => {
  const user = await userService.getUserById(req.params.id, req.user);
  return success(res, { message: 'User retrieved', data: user });
});

const updateMe = asyncHandler(async (req, res) => {
  const user = await userService.updateOwnProfile(req.user._id, req.body);
  return success(res, { message: 'Profile updated', data: user });
});

const updateById = asyncHandler(async (req, res) => {
  const user = await userService.updateUserByAdmin(req.user, req.params.id, req.body);
  return success(res, { message: 'User updated', data: user });
});

const updateStatus = asyncHandler(async (req, res) => {
  const user = await userService.setUserStatus(req.user, req.params.id, req.body.status);
  return success(res, { message: 'User status updated', data: user });
});

const uploadAvatar = asyncHandler(async (req, res) => {
  if (!req.file) {
    throw new AppError('Avatar file is required (field name: avatar)', 400, {
      code: 'FILE_REQUIRED',
    });
  }
  const user = await userService.updateAvatar(req.user._id, req.file);
  return success(res, { message: 'Avatar updated', data: user });
});

const deleteAvatar = asyncHandler(async (req, res) => {
  const user = await userService.removeAvatar(req.user._id);
  return success(res, { message: 'Avatar removed', data: user });
});

const remove = asyncHandler(async (req, res) => {
  const hard = req.query.hard === 'true' || req.query.hard === '1';
  const result = await userService.deleteUser(req.user, req.params.id, { hard });
  return success(res, {
    message: hard ? 'User permanently deleted' : 'User disabled',
    data: result,
  });
});

module.exports = {
  bootstrap,
  invite,
  list,
  directory,
  getById,
  updateMe,
  updateById,
  updateStatus,
  uploadAvatar,
  deleteAvatar,
  remove,
};
