const { body, param, query } = require('express-validator');

const objectId = (field = 'id') =>
  param(field).isMongoId().withMessage(`Invalid ${field}`);

const createChannel = [
  body('name').isString().trim().notEmpty().isLength({ max: 80 }),
  body('type').isIn(['public', 'private']).withMessage('type must be public or private'),
  body('memberIds').optional().isArray(),
  body('memberIds.*').optional().isMongoId(),
  body('topic').optional().isString().trim().isLength({ max: 250 }),
  body('description').optional().isString().trim().isLength({ max: 2000 }),
];

const updateChannel = [
  objectId('id'),
  body('name').optional().isString().trim().notEmpty().isLength({ max: 80 }),
  body('topic').optional().isString().trim().isLength({ max: 250 }),
  body('description').optional().isString().trim().isLength({ max: 2000 }),
];

const createDm = [
  body('userId').isMongoId().withMessage('userId is required'),
];

const addMembers = [
  objectId('id'),
  body('userIds')
    .isArray({ min: 1 })
    .withMessage('userIds must be a non-empty array'),
  body('userIds.*').isMongoId().withMessage('Each userId must be valid'),
];

const removeMember = [objectId('id'), objectId('userId')];

const markRead = [
  objectId('id'),
  body('messageId').optional().isMongoId(),
];

const listMessages = [
  objectId('id'),
  query('before').optional().isMongoId(),
  query('limit').optional().isInt({ min: 1, max: 100 }),
];

const createMessage = [
  objectId('id'),
  body('text').optional().isString().trim().isLength({ max: 20000 }),
  body('contentFormat').optional().isIn(['plain', 'html']),
  body('mentions').optional().isArray(),
  body('mentions.*').optional().isMongoId(),
  body('parentMessage').optional({ nullable: true }).isMongoId(),
  body('attachments').optional().isArray({ max: 5 }),
  body('attachments.*.url').optional().isString().notEmpty(),
  body('attachments.*.filename').optional().isString().notEmpty(),
];

const updateMessage = [
  objectId('id'),
  body('text').isString().trim().isLength({ max: 20000 }),
  body('contentFormat').optional().isIn(['plain', 'html']),
  body('mentions').optional().isArray(),
  body('mentions.*').optional().isMongoId(),
];

const recentAttachments = [
  objectId('id'),
  query('limit').optional().isInt({ min: 1, max: 50 }),
];

const toggleReaction = [
  objectId('id'),
  body('emoji').isString().trim().notEmpty().isLength({ max: 32 }),
];

const searchMessages = [
  query('q').isString().trim().notEmpty().isLength({ min: 2, max: 200 }),
  query('channelId').optional().isMongoId(),
  query('fromUserId').optional().isMongoId(),
  query('after').optional().isISO8601(),
  query('before').optional().isISO8601(),
  query('limit').optional().isInt({ min: 1, max: 50 }),
];

module.exports = {
  objectId,
  createChannel,
  updateChannel,
  createDm,
  addMembers,
  removeMember,
  markRead,
  listMessages,
  createMessage,
  updateMessage,
  recentAttachments,
  toggleReaction,
  searchMessages,
};
