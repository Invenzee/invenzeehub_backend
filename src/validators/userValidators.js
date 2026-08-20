const { body, param, query } = require('express-validator');
const { USER_ROLES, USER_DEPARTMENTS, USER_STATUSES } = require('../constants/roles');

const objectId = (field = 'id') =>
  param(field).isMongoId().withMessage('Invalid user id');

const listUsers = [
  query('page').optional().isInt({ min: 1 }).toInt(),
  query('limit').optional().isInt({ min: 1, max: 100 }).toInt(),
  query('role').optional().isIn(USER_ROLES),
  query('status').optional().isIn(USER_STATUSES),
  query('department').optional().isIn(USER_DEPARTMENTS),
  query('search').optional().isString().trim().isLength({ max: 100 }),
  query('sort').optional().isString().trim().isLength({ max: 50 }),
];

const inviteUser = [
  body('email').isEmail().withMessage('Valid email is required').normalizeEmail(),
  body('name').isString().trim().notEmpty().isLength({ max: 120 }),
  body('role').optional().isIn(['admin', 'manager', 'member']),
  body('department').optional().isIn(USER_DEPARTMENTS),
  body('password')
    .optional({ values: 'falsy' })
    .isString()
    .isLength({ min: 8 })
    .withMessage('Password must be at least 8 characters'),
  body('accessExpiresAt')
    .optional({ nullable: true })
    .isISO8601()
    .withMessage('accessExpiresAt must be an ISO date'),
];

const bootstrap = [
  body('email').isEmail().normalizeEmail(),
  body('name').isString().trim().notEmpty().isLength({ max: 120 }),
  body('secret').isString().notEmpty().withMessage('Bootstrap secret is required'),
];

const updateMe = [
  body('name').optional().isString().trim().notEmpty().isLength({ max: 120 }),
  body('notificationPrefs').optional().isObject(),
  body('uiPrefs').optional().isObject(),
  body('uiPrefs.theme').optional().isIn(['light', 'dark']),
];

const updateUser = [
  objectId('id'),
  body('name').optional().isString().trim().notEmpty().isLength({ max: 120 }),
  body('role').optional().isIn(USER_ROLES),
  body('department').optional().isIn(USER_DEPARTMENTS),
  body('status').optional().isIn(USER_STATUSES),
  body('accessExpiresAt')
    .optional({ nullable: true })
    .custom((value) => value === null || !Number.isNaN(Date.parse(value)))
    .withMessage('accessExpiresAt must be null or an ISO date'),
  body('notificationPrefs').optional().isObject(),
];

const updateStatus = [
  objectId('id'),
  body('status').isIn(USER_STATUSES).withMessage('Valid status is required'),
];

const getById = [objectId('id')];

const deleteUser = [
  objectId('id'),
  query('hard').optional().isIn(['true', 'false', '1', '0']),
];

module.exports = {
  listUsers,
  inviteUser,
  bootstrap,
  updateMe,
  updateUser,
  updateStatus,
  getById,
  deleteUser,
};
