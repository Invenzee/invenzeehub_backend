const express = require('express');
const boardController = require('../controllers/boardController');
const listController = require('../controllers/listController');
const validate = require('../middleware/validate');
const { protect } = require('../middleware/auth');
const { apiLimiter } = require('../middleware/rateLimit');
const kanbanValidators = require('../validators/kanbanValidators');

const router = express.Router();

router.use(apiLimiter);
router.use(protect);

router.get(
  '/:boardId/lists',
  kanbanValidators.objectId('boardId'),
  validate,
  listController.list
);

router.post(
  '/:boardId/lists',
  kanbanValidators.createList,
  validate,
  listController.create
);

router.post(
  '/:boardId/lists/reorder',
  kanbanValidators.objectId('boardId'),
  kanbanValidators.reorderItems,
  validate,
  listController.reorder
);

router.post(
  '/:id/members',
  kanbanValidators.addBoardMembers,
  validate,
  boardController.addMembers
);

router.delete(
  '/:id/members/:userId',
  kanbanValidators.removeBoardMember,
  validate,
  boardController.removeMember
);

router.post(
  '/:id/delete-request',
  kanbanValidators.requestBoardDelete,
  validate,
  boardController.requestDelete
);

router.get('/:id/kanban', kanbanValidators.objectId('id'), validate, boardController.kanban);

router.get('/:id', kanbanValidators.objectId('id'), validate, boardController.getById);

router.patch('/:id', kanbanValidators.updateBoard, validate, boardController.update);

router.delete('/:id', kanbanValidators.objectId('id'), validate, boardController.remove);

module.exports = router;
