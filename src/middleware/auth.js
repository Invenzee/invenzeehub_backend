const mongoose = require('mongoose');
const { User } = require('../models');
const AppError = require('../utils/AppError');
const asyncHandler = require('../utils/asyncHandler');
const { verifyAccessToken } = require('../utils/tokens');

/**
 * Requires Bearer access JWT. Attaches req.user (full User doc).
 */
const protect = asyncHandler(async (req, _res, next) => {
  const header = req.headers.authorization;
  let token;

  if (header && header.startsWith('Bearer ')) {
    token = header.slice(7).trim();
  }

  if (!token) {
    throw new AppError('Authentication required', 401, { code: 'UNAUTHORIZED' });
  }

  const payload = verifyAccessToken(token);

  if (!mongoose.Types.ObjectId.isValid(payload.sub)) {
    throw new AppError('Invalid token subject', 401, { code: 'INVALID_TOKEN' });
  }

  const user = await User.findById(payload.sub);

  if (!user) {
    throw new AppError('User no longer exists', 401, { code: 'USER_NOT_FOUND' });
  }

  if (user.status === 'disabled') {
    throw new AppError('Account is disabled', 403, { code: 'ACCOUNT_DISABLED' });
  }

  if (user.status === 'invited') {
    throw new AppError('Account is not activated yet', 403, { code: 'ACCOUNT_INVITED' });
  }

  if (user.accessExpiresAt && user.accessExpiresAt.getTime() < Date.now()) {
    throw new AppError('Access has expired', 403, { code: 'ACCESS_EXPIRED' });
  }

  req.user = user;
  req.auth = payload;
  next();
});

/**
 * Optional auth — sets req.user when a valid token is present.
 */
const optionalAuth = asyncHandler(async (req, _res, next) => {
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) {
    return next();
  }

  try {
    const payload = verifyAccessToken(header.slice(7).trim());
    const user = await User.findById(payload.sub);
    if (
      user &&
      user.status === 'active' &&
      !(user.accessExpiresAt && user.accessExpiresAt.getTime() < Date.now())
    ) {
      req.user = user;
      req.auth = payload;
    }
  } catch {
    // ignore invalid optional tokens
  }

  next();
});

module.exports = { protect, optionalAuth };
