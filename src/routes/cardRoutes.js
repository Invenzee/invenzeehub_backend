const express = require('express');
const cardController = require('../controllers/cardController');
const commentController = require('../controllers/commentController');
const validate = require('../middleware/validate');
const { protect } = require('../middleware/auth');
const { apiLimiter } = require('../middleware/rateLimit');
const { cardAttachmentUpload } = require('../middleware/upload');
const kanbanValidators = require('../validators/kanbanValidators');

const router = express.Router();

router.use(apiLimiter);
router.use(protect);

router.get(
  '/:cardId/comments',
  kanbanValidators.objectId('cardId'),
  validate,
  commentController.list
);

router.post(
  '/:cardId/comments',
  kanbanValidators.createComment,
  validate,
  commentController.create
);

router.get('/:id/activity', kanbanValidators.objectId('id'), validate, cardController.activity);

router.get('/:id', kanbanValidators.objectId('id'), validate, cardController.getById);

router.patch('/:id', kanbanValidators.updateCard, validate, cardController.update);

router.delete('/:id', kanbanValidators.objectId('id'), validate, cardController.remove);

router.post('/:id/move', kanbanValidators.moveCard, validate, cardController.move);

router.post('/:id/copy', kanbanValidators.copyCard, validate, cardController.copy);

router.post('/:id/archive', kanbanValidators.objectId('id'), validate, cardController.archive);

router.post(
  '/:id/unarchive',
  kanbanValidators.objectId('id'),
  validate,
  cardController.unarchive
);

router.post('/:id/watch', kanbanValidators.objectId('id'), validate, cardController.watch);

router.delete('/:id/watch', kanbanValidators.objectId('id'), validate, cardController.unwatch);

router.post('/:id/share', kanbanValidators.shareCard, validate, cardController.share);

router.delete('/:id/cover', kanbanValidators.objectId('id'), validate, cardController.clearCover);

router.post(
  '/:id/attachments',
  kanbanValidators.objectId('id'),
  cardAttachmentUpload,
  cardController.uploadAttachment
);

router.post(
  '/:id/attachments/link',
  kanbanValidators.addLink,
  validate,
  cardController.addLink
);

router.delete(
  '/:id/attachments/:attachmentId',
  kanbanValidators.objectId('id'),
  kanbanValidators.objectId('attachmentId'),
  validate,
  cardController.removeAttachment
);

router.post(
  '/:id/attachments/:attachmentId/cover',
  kanbanValidators.objectId('id'),
  kanbanValidators.objectId('attachmentId'),
  validate,
  cardController.setCover
);

module.exports = router;
