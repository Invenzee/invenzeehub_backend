const { validationResult } = require('express-validator');
const AppError = require('../utils/AppError');

function validate(req, _res, next) {
  const result = validationResult(req);
  if (result.isEmpty()) return next();

  const details = result.array().map((e) => ({
    field: e.path,
    message: e.msg,
    value: e.value,
  }));

  return next(
    new AppError('Validation failed', 422, {
      code: 'VALIDATION_ERROR',
      details,
    })
  );
}

module.exports = validate;
