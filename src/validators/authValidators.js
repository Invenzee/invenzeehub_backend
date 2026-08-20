const { body } = require('express-validator');
const { MIN_LENGTH } = require('../utils/password');

const passwordRules = (field = 'password') =>
  body(field)
    .isString()
    .isLength({ min: MIN_LENGTH })
    .withMessage(`Password must be at least ${MIN_LENGTH} characters`)
    .matches(/^(?=.*[A-Za-z])(?=.*\d).+$/)
    .withMessage('Password must include at least one letter and one number');

const login = [
  body('email').isEmail().withMessage('Valid email is required').normalizeEmail(),
  body('password').isString().notEmpty().withMessage('Password is required'),
];

const requestCode = [
  body('email').isEmail().withMessage('Valid email is required').normalizeEmail(),
  body('purpose')
    .optional()
    .isIn(['login', 'reset'])
    .withMessage('purpose must be login or reset'),
];

const verifyCode = [
  body('email').isEmail().withMessage('Valid email is required').normalizeEmail(),
  body('code')
    .isString()
    .trim()
    .matches(/^\d{6}$/)
    .withMessage('Code must be a 6-digit number'),
];

const resetPassword = [
  body('email').isEmail().withMessage('Valid email is required').normalizeEmail(),
  body('code')
    .isString()
    .trim()
    .matches(/^\d{6}$/)
    .withMessage('Code must be a 6-digit number'),
  passwordRules('password'),
  body('confirmPassword')
    .isString()
    .notEmpty()
    .withMessage('confirmPassword is required'),
];

const setPassword = [
  passwordRules('password'),
  body('confirmPassword')
    .isString()
    .notEmpty()
    .withMessage('confirmPassword is required'),
];

const changePassword = [
  body('currentPassword').isString().notEmpty().withMessage('currentPassword is required'),
  passwordRules('newPassword'),
  body('confirmPassword')
    .isString()
    .notEmpty()
    .withMessage('confirmPassword is required'),
];

const refresh = [
  body('refreshToken').optional().isString().withMessage('refreshToken must be a string'),
];

module.exports = {
  login,
  requestCode,
  verifyCode,
  resetPassword,
  setPassword,
  changePassword,
  refresh,
};
