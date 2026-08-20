function success(res, { statusCode = 200, message = 'OK', data = null, meta } = {}) {
  const body = {
    success: true,
    message,
    data,
  };

  if (meta !== undefined) {
    body.meta = meta;
  }

  return res.status(statusCode).json(body);
}

function fail(res, { statusCode = 400, message = 'Request failed', code = 'BAD_REQUEST', details } = {}) {
  const body = {
    success: false,
    message,
    code,
  };

  if (details !== undefined) {
    body.details = details;
  }

  return res.status(statusCode).json(body);
}

module.exports = { success, fail };
