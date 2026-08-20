const rateLimit = require('express-rate-limit');

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    message: 'Too many auth attempts. Try again later.',
    code: 'RATE_LIMITED',
  },
});

/** Stricter limit for sending login emails. */
const loginCodeLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 8,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    message: 'Too many code requests. Try again later.',
    code: 'RATE_LIMITED',
  },
});

const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 300,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    message: 'Too many requests. Try again later.',
    code: 'RATE_LIMITED',
  },
});

module.exports = { authLimiter, loginCodeLimiter, apiLimiter };
