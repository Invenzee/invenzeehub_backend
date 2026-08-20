const express = require('express');
const authController = require('../controllers/authController');
const validate = require('../middleware/validate');
const { protect, optionalAuth } = require('../middleware/auth');
const { authLimiter, loginCodeLimiter } = require('../middleware/rateLimit');
const authValidators = require('../validators/authValidators');

const router = express.Router();

/** Daily login — email + password */
router.post('/login', authLimiter, authValidators.login, validate, authController.login);

/** OTP: fallback login or password reset */
router.post(
  '/request-code',
  loginCodeLimiter,
  authValidators.requestCode,
  validate,
  authController.requestCode
);

/** OTP fallback login */
router.post(
  '/verify-code',
  authLimiter,
  authValidators.verifyCode,
  validate,
  authController.verifyCode
);

/** Reset password with OTP */
router.post(
  '/reset-password',
  authLimiter,
  authValidators.resetPassword,
  validate,
  authController.resetPassword
);

/** First-time password setup (after OTP login) */
router.post(
  '/set-password',
  protect,
  authValidators.setPassword,
  validate,
  authController.setPassword
);

/** Change password while logged in */
router.post(
  '/change-password',
  protect,
  authValidators.changePassword,
  validate,
  authController.changePassword
);

router.post('/refresh', authLimiter, authValidators.refresh, validate, authController.refresh);

router.post('/logout', optionalAuth, authController.logout);

router.get('/me', protect, authController.me);

module.exports = router;
