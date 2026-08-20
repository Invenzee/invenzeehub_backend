const asyncHandler = require('../utils/asyncHandler');
const { success } = require('../utils/apiResponse');
const authService = require('../services/authService');
const {
  setRefreshCookie,
  clearRefreshCookie,
  getRefreshTokenFromRequest,
} = require('../utils/cookies');
const AppError = require('../utils/AppError');

function authSuccess(res, session, message) {
  setRefreshCookie(res, session.refreshToken);
  return success(res, {
    message,
    data: {
      accessToken: session.accessToken,
      user: session.user,
      requiresPasswordSetup: session.user?.requiresPasswordSetup || false,
    },
  });
}

const login = asyncHandler(async (req, res) => {
  const session = await authService.loginWithPassword(req.body.email, req.body.password);
  return authSuccess(res, session, 'Logged in successfully');
});

const requestCode = asyncHandler(async (req, res) => {
  const purpose = req.body.purpose || 'login';
  const result = await authService.requestLoginCode(req.body.email, purpose);

  const message =
    purpose === 'reset'
      ? 'Password reset code sent to your email'
      : 'Verification code sent to your email';

  return success(res, { message, data: result });
});

const verifyCode = asyncHandler(async (req, res) => {
  const session = await authService.verifyLoginCode(req.body.email, req.body.code);
  return authSuccess(res, session, 'Logged in with verification code');
});

const resetPassword = asyncHandler(async (req, res) => {
  const session = await authService.resetPasswordWithCode(
    req.body.email,
    req.body.code,
    req.body.password,
    req.body.confirmPassword
  );
  return authSuccess(res, session, 'Password reset successfully');
});

const setPassword = asyncHandler(async (req, res) => {
  const user = await authService.setPassword(
    req.user._id,
    req.body.password,
    req.body.confirmPassword
  );
  return success(res, { message: 'Password set successfully', data: user });
});

const changePassword = asyncHandler(async (req, res) => {
  const user = await authService.changePassword(
    req.user._id,
    req.body.currentPassword,
    req.body.newPassword,
    req.body.confirmPassword
  );
  return success(res, { message: 'Password changed successfully', data: user });
});

const refresh = asyncHandler(async (req, res) => {
  const raw = getRefreshTokenFromRequest(req);
  if (!raw) {
    throw new AppError('Refresh token required', 401, { code: 'UNAUTHORIZED' });
  }

  const session = await authService.refreshSession(raw);
  return authSuccess(res, session, 'Token refreshed');
});

const logout = asyncHandler(async (req, res) => {
  if (req.user?._id) {
    await authService.logout(req.user._id);
  }
  clearRefreshCookie(res);
  return success(res, { message: 'Logged out successfully', data: null });
});

const me = asyncHandler(async (req, res) => {
  return success(res, {
    message: 'Current user',
    data: authService.toPublicUser(req.user),
  });
});

module.exports = {
  login,
  requestCode,
  verifyCode,
  resetPassword,
  setPassword,
  changePassword,
  refresh,
  logout,
  me,
};
