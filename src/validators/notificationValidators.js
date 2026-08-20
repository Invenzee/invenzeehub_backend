const { body, param, query } = require('express-validator');
const {
  NOTIFICATION_TYPES,
  SOURCE_TYPES,
  DELIVERY_CHANNELS,
} = require('../constants/notifications');

const objectId = (field = 'id') =>
  param(field).isMongoId().withMessage(`Invalid ${field}`);

const listNotifications = [
  query('page').optional().isInt({ min: 1 }).toInt(),
  query('limit').optional().isInt({ min: 1, max: 100 }).toInt(),
  query('read').optional().isIn(['true', 'false']),
  query('type').optional().isIn(NOTIFICATION_TYPES),
  query('sort').optional().isString().trim().isLength({ max: 50 }),
];

const createNotification = [
  body('userId').isMongoId().withMessage('Valid userId is required'),
  body('type').isIn(NOTIFICATION_TYPES).withMessage('Valid type is required'),
  body('sourceType').isIn(SOURCE_TYPES).withMessage('Valid sourceType is required'),
  body('sourceId').isMongoId().withMessage('Valid sourceId is required'),
  body('title').optional().isString().trim().isLength({ max: 200 }),
  body('body').optional().isString().trim().isLength({ max: 1000 }),
  body('channelDelivered')
    .optional()
    .isArray()
    .custom((arr) => arr.every((c) => DELIVERY_CHANNELS.includes(c)))
    .withMessage(`channelDelivered values must be one of: ${DELIVERY_CHANNELS.join(', ')}`),
];

const getById = [objectId('id')];

const markRead = [objectId('id')];

const deleteNotification = [objectId('id')];

module.exports = {
  listNotifications,
  createNotification,
  getById,
  markRead,
  deleteNotification,
};
