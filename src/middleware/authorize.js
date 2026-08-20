const AppError = require('../utils/AppError');
const { isAdminRole } = require('../constants/roles');

/**
 * Restrict route to one or more roles.
 * @param {...string} roles
 */
function authorize(...roles) {
  const allowed = roles.flat();

  return (req, _res, next) => {
    if (!req.user) {
      return next(new AppError('Authentication required', 401, { code: 'UNAUTHORIZED' }));
    }

    if (!allowed.includes(req.user.role)) {
      return next(new AppError('You do not have permission for this action', 403, { code: 'FORBIDDEN' }));
    }

    return next();
  };
}

/** Shortcut: super_admin or admin. */
function requireAdmin(req, _res, next) {
  if (!req.user) {
    return next(new AppError('Authentication required', 401, { code: 'UNAUTHORIZED' }));
  }

  if (!isAdminRole(req.user.role)) {
    return next(new AppError('Admin access required', 403, { code: 'FORBIDDEN' }));
  }

  return next();
}

/**
 * Allow if requester is the target user OR an admin.
 * Expects req.params.id (or opts.param).
 */
function selfOrAdmin(param = 'id') {
  return (req, _res, next) => {
    if (!req.user) {
      return next(new AppError('Authentication required', 401, { code: 'UNAUTHORIZED' }));
    }

    const targetId = req.params[param];
    const isSelf = req.user._id.toString() === targetId;

    if (isSelf || isAdminRole(req.user.role)) {
      return next();
    }

    return next(new AppError('You do not have permission for this action', 403, { code: 'FORBIDDEN' }));
  };
}

module.exports = { authorize, requireAdmin, selfOrAdmin };
