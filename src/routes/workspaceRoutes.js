const express = require('express');
const workspaceController = require('../controllers/workspaceController');
const boardController = require('../controllers/boardController');
const validate = require('../middleware/validate');
const { protect } = require('../middleware/auth');
const { apiLimiter } = require('../middleware/rateLimit');
const workspaceValidators = require('../validators/workspaceValidators');
const kanbanValidators = require('../validators/kanbanValidators');

const router = express.Router();

router.use(apiLimiter);
router.use(protect);

router.get('/', workspaceValidators.listWorkspaces, validate, workspaceController.list);

router.post('/', workspaceValidators.createWorkspace, validate, workspaceController.create);

router.get('/:id', workspaceValidators.getById, validate, workspaceController.getById);

router.patch('/:id', workspaceValidators.updateWorkspace, validate, workspaceController.update);

router.delete('/:id', workspaceValidators.deleteWorkspace, validate, workspaceController.remove);

router.post(
  '/:id/members',
  workspaceValidators.memberIdsBody,
  validate,
  workspaceController.addMembers
);

router.delete(
  '/:id/members/:userId',
  workspaceValidators.removeMember,
  validate,
  workspaceController.removeMember
);

router.post(
  '/:id/owners',
  workspaceValidators.memberIdsBody,
  validate,
  workspaceController.addOwners
);

router.delete(
  '/:id/owners/:userId',
  workspaceValidators.removeOwner,
  validate,
  workspaceController.removeOwner
);

router.post('/:id/leave', workspaceValidators.leaveWorkspace, validate, workspaceController.leave);

router.get(
  '/:workspaceId/boards',
  kanbanValidators.objectId('workspaceId'),
  validate,
  boardController.list
);

router.post(
  '/:workspaceId/boards',
  kanbanValidators.createBoard,
  validate,
  boardController.create
);

router.post(
  '/:workspaceId/boards/reorder',
  kanbanValidators.objectId('workspaceId'),
  kanbanValidators.reorderItems,
  validate,
  boardController.reorder
);

module.exports = router;
