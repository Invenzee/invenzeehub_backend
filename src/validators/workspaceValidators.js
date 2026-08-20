const { body, param, query } = require('express-validator');

const objectId = (field = 'id') =>
  param(field).isMongoId().withMessage(`Invalid ${field}`);

const listWorkspaces = [
  query('page').optional().isInt({ min: 1 }).toInt(),
  query('limit').optional().isInt({ min: 1, max: 100 }).toInt(),
  query('search').optional().isString().trim().isLength({ max: 100 }),
  query('sort').optional().isString().trim().isLength({ max: 50 }),
];

const createWorkspace = [
  body('name').isString().trim().notEmpty().isLength({ max: 120 }),
  body('description').optional().isString().trim().isLength({ max: 500 }),
  body('ownerIds').optional().isArray(),
  body('ownerIds.*').optional().isMongoId().withMessage('Each ownerId must be valid'),
  body('memberIds').optional().isArray(),
  body('memberIds.*').optional().isMongoId().withMessage('Each memberId must be valid'),
];

const updateWorkspace = [
  objectId('id'),
  body('name').optional().isString().trim().notEmpty().isLength({ max: 120 }),
  body('description').optional().isString().trim().isLength({ max: 500 }),
  body('status').optional().isIn(['active', 'archived']),
];

const getById = [objectId('id')];

const deleteWorkspace = [objectId('id')];

const memberIdsBody = [
  objectId('id'),
  body('userIds')
    .isArray({ min: 1 })
    .withMessage('userIds must be a non-empty array'),
  body('userIds.*').isMongoId().withMessage('Each userId must be valid'),
];

const removeMember = [objectId('id'), objectId('userId')];

const removeOwner = [objectId('id'), objectId('userId')];

const leaveWorkspace = [objectId('id')];

module.exports = {
  listWorkspaces,
  createWorkspace,
  updateWorkspace,
  getById,
  deleteWorkspace,
  memberIdsBody,
  removeMember,
  removeOwner,
  leaveWorkspace,
};
