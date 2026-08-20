const express = require('express');
const listController = require('../controllers/listController');
const cardController = require('../controllers/cardController');
const validate = require('../middleware/validate');
const { protect } = require('../middleware/auth');
const { apiLimiter } = require('../middleware/rateLimit');
const kanbanValidators = require('../validators/kanbanValidators');

const router = express.Router();

router.use(apiLimiter);
router.use(protect);

router.get(
  '/:listId/cards',
  kanbanValidators.objectId('listId'),
  validate,
  cardController.list
);

router.post(
  '/:listId/cards',
  kanbanValidators.createCard,
  validate,
  cardController.create
);

router.post(
  '/:listId/cards/reorder',
  kanbanValidators.objectId('listId'),
  kanbanValidators.reorderItems,
  validate,
  cardController.reorder
);

router.get('/:id', kanbanValidators.objectId('id'), validate, listController.getById);

router.patch('/:id', kanbanValidators.updateList, validate, listController.update);

router.delete('/:id', kanbanValidators.objectId('id'), validate, listController.remove);

module.exports = router;
