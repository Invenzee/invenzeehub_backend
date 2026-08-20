const express = require('express');
const commentController = require('../controllers/commentController');
const validate = require('../middleware/validate');
const { protect } = require('../middleware/auth');
const { apiLimiter } = require('../middleware/rateLimit');
const kanbanValidators = require('../validators/kanbanValidators');

const router = express.Router();

router.use(apiLimiter);
router.use(protect);

router.get('/:id', kanbanValidators.objectId('id'), validate, commentController.getById);

router.patch('/:id', kanbanValidators.updateComment, validate, commentController.update);

router.post(
  '/:id/reactions',
  kanbanValidators.reactComment,
  validate,
  commentController.react
);

router.delete('/:id', kanbanValidators.objectId('id'), validate, commentController.remove);

module.exports = router;
