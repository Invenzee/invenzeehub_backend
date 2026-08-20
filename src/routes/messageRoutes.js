const express = require('express');
const messageController = require('../controllers/messageController');
const validate = require('../middleware/validate');
const { protect } = require('../middleware/auth');
const { apiLimiter } = require('../middleware/rateLimit');
const chatValidators = require('../validators/chatValidators');

const router = express.Router();

router.use(apiLimiter);
router.use(protect);

router.get('/search', chatValidators.searchMessages, validate, messageController.search);

router.post('/transcribe', messageController.transcribe);

router.get(
  '/:id/replies',
  chatValidators.objectId('id'),
  validate,
  messageController.listReplies
);

router.post(
  '/:id/reactions',
  chatValidators.toggleReaction,
  validate,
  messageController.toggleReaction
);

router.post(
  '/:id/pin',
  chatValidators.objectId('id'),
  validate,
  messageController.pin
);

router.delete(
  '/:id/pin',
  chatValidators.objectId('id'),
  validate,
  messageController.unpin
);

router.get('/:id', chatValidators.objectId('id'), validate, messageController.getById);
router.patch('/:id', chatValidators.updateMessage, validate, messageController.update);
router.delete('/:id', chatValidators.objectId('id'), validate, messageController.remove);

module.exports = router;
