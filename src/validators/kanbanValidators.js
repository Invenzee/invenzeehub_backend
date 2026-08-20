const { body, param, query } = require('express-validator');
const { CARD_PRIORITIES } = require('../constants/cards');

const objectId = (field = 'id') =>
  param(field).isMongoId().withMessage(`Invalid ${field}`);

const reorderItems = [
  body('items')
    .isArray({ min: 1 })
    .withMessage('items must be a non-empty array'),
  body('items.*.id').isMongoId(),
  body('items.*.position').isNumeric(),
];

const createBoard = [
  objectId('workspaceId'),
  body('name').optional().isString().trim().notEmpty().isLength({ max: 120 }),
  body('position').optional().isNumeric(),
];

const updateBoard = [
  objectId('id'),
  body('name').optional().isString().trim().notEmpty().isLength({ max: 120 }),
  body('position').optional().isNumeric(),
];

const addBoardMembers = [
  objectId('id'),
  body('userIds')
    .isArray({ min: 1 })
    .withMessage('userIds must be a non-empty array'),
  body('userIds.*').isMongoId().withMessage('Each userId must be valid'),
];

const removeBoardMember = [objectId('id'), objectId('userId')];

const requestBoardDelete = [
  objectId('id'),
  body('reason').optional().isString().trim().isLength({ max: 500 }),
];

const listDeleteRequests = [
  query('workspaceId').optional().isMongoId(),
  query('status').optional().isIn(['pending', 'approved', 'rejected']),
];

const createList = [
  objectId('boardId'),
  body('title').isString().trim().notEmpty().isLength({ max: 120 }),
  body('position').optional().isNumeric(),
];

const updateList = [
  objectId('id'),
  body('title').optional().isString().trim().notEmpty().isLength({ max: 120 }),
  body('position').optional().isNumeric(),
];

const createCard = [
  objectId('listId'),
  body('title').isString().trim().notEmpty().isLength({ max: 200 }),
  body('description').optional().isString().isLength({ max: 20000 }),
  body('dueDate').optional({ nullable: true }).isISO8601().toDate(),
  body('startDate').optional({ nullable: true }).isISO8601().toDate(),
  body('dueComplete').optional().isBoolean(),
  body('priority').optional().isIn(CARD_PRIORITIES),
  body('position').optional().isNumeric(),
  body('assignees').optional().isArray(),
  body('assignees.*').optional().isMongoId(),
  body('labels').optional().isArray(),
  body('labels.*.name').optional().isString().trim().notEmpty(),
  body('labels.*.color').optional().isString().trim().notEmpty(),
  body('checklist').optional().isArray(),
  body('checklist.*.text').optional().isString().trim().notEmpty(),
  body('checklist.*.done').optional().isBoolean(),
];

const updateCard = [
  objectId('id'),
  body('title').optional().isString().trim().notEmpty().isLength({ max: 200 }),
  body('description').optional().isString().isLength({ max: 20000 }),
  body('dueDate').optional({ nullable: true }).isISO8601().toDate(),
  body('startDate').optional({ nullable: true }).isISO8601().toDate(),
  body('dueComplete').optional().isBoolean(),
  body('priority').optional().isIn(CARD_PRIORITIES),
  body('position').optional().isNumeric(),
  body('assignees').optional().isArray(),
  body('assignees.*').optional().isMongoId(),
  body('labels').optional().isArray(),
  body('checklist').optional().isArray(),
];

const moveCard = [
  objectId('id'),
  body('listId').isMongoId().withMessage('listId is required'),
  body('position').optional().isNumeric(),
];

const copyCard = [
  objectId('id'),
  body('listId').optional().isMongoId(),
  body('title').optional().isString().trim().notEmpty().isLength({ max: 200 }),
];

const shareCard = [
  objectId('id'),
  body('url').optional().isString().trim().isLength({ max: 2000 }),
  body('notify').optional().isBoolean(),
];

const addLink = [
  objectId('id'),
  body('url').isString().trim().notEmpty().isURL().withMessage('Valid URL required'),
  body('filename').optional().isString().trim().isLength({ max: 200 }),
];

const createComment = [
  objectId('cardId'),
  body('text').isString().trim().notEmpty().isLength({ max: 20000 }),
  body('mentions').optional().isArray(),
  body('mentions.*').optional().isMongoId(),
  body('attachments').optional().isArray(),
];

const updateComment = [
  objectId('id'),
  body('text').optional().isString().trim().notEmpty().isLength({ max: 20000 }),
  body('mentions').optional().isArray(),
  body('mentions.*').optional().isMongoId(),
  body('attachments').optional().isArray(),
];

const reactComment = [
  objectId('id'),
  body('emoji').isString().trim().notEmpty().isLength({ max: 32 }),
];

module.exports = {
  objectId,
  reorderItems,
  createBoard,
  updateBoard,
  addBoardMembers,
  removeBoardMember,
  requestBoardDelete,
  listDeleteRequests,
  createList,
  updateList,
  createCard,
  updateCard,
  moveCard,
  copyCard,
  shareCard,
  addLink,
  createComment,
  updateComment,
  reactComment,
};
