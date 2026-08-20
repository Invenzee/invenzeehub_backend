const AppError = require('../utils/AppError');
const { fail } = require('../utils/apiResponse');

function notFoundHandler(req, _res, next) {
  next(
    new AppError(`Cannot ${req.method} ${req.originalUrl}`, 404, {
      code: 'NOT_FOUND',
    })
  );
}

// eslint-disable-next-line no-unused-vars
function errorHandler(err, _req, res, _next) {
  let statusCode = err.statusCode || 500;
  let message = err.message || 'Internal server error';
  let code = err.code || 'INTERNAL_ERROR';
  let details = err.details;

  if (err.name === 'CastError') {
    statusCode = 400;
    message = 'Invalid resource id';
    code = 'INVALID_ID';
  }

  if (err.name === 'ValidationError') {
    statusCode = 422;
    code = 'MONGOOSE_VALIDATION';
    details = Object.values(err.errors || {}).map((e) => ({
      field: e.path,
      message: e.message,
    }));
    message = 'Validation failed';
  }

  if (err.code === 11000) {
    statusCode = 409;
    code = 'DUPLICATE_KEY';
    const field = Object.keys(err.keyPattern || {})[0] || 'field';
    message = `${field} already exists`;
    details = { field };
  }

  if (err.code === 'CLOUDINARY_NOT_CONFIGURED') {
    statusCode = 503;
    code = 'CLOUDINARY_NOT_CONFIGURED';
  }

  if (process.env.NODE_ENV !== 'production' && statusCode >= 500 && !err.isOperational) {
    details = details || { stack: err.stack };
  }

  if (statusCode >= 500 && process.env.NODE_ENV === 'production') {
    message = 'Internal server error';
    details = undefined;
  }

  return fail(res, { statusCode, message, code, details });
}

module.exports = { notFoundHandler, errorHandler };
