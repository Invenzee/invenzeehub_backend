const express = require('express');
const channelController = require('../controllers/channelController');
const messageController = require('../controllers/messageController');
const validate = require('../middleware/validate');
const { protect } = require('../middleware/auth');
const { apiLimiter } = require('../middleware/rateLimit');
const { chatAttachmentUpload } = require('../middleware/upload');
const chatValidators = require('../validators/chatValidators');

const router = express.Router();

router.use(apiLimiter);
router.use(protect);

router.get('/', channelController.list);
router.get('/unread-summary', channelController.unreadSummary);
router.post('/', chatValidators.createChannel, validate, channelController.create);
router.post('/dm', chatValidators.createDm, validate, channelController.createDm);

router.post(
  '/:id/join',
  chatValidators.objectId('id'),
  validate,
  channelController.join
);

router.post(
  '/:id/read',
  chatValidators.markRead,
  validate,
  channelController.markRead
);

router.post(
  '/:id/mute',
  chatValidators.objectId('id'),
  validate,
  channelController.mute
);

router.delete(
  '/:id/mute',
  chatValidators.objectId('id'),
  validate,
  channelController.unmute
);

router.get(
  '/:id/pins',
  chatValidators.objectId('id'),
  validate,
  channelController.listPins
);

router.post(
  '/:id/members',
  chatValidators.addMembers,
  validate,
  channelController.addMembers
);

router.delete(
  '/:id/members/:userId',
  chatValidators.removeMember,
  validate,
  channelController.removeMember
);

router.get(
  '/:id/messages',
  chatValidators.listMessages,
  validate,
  messageController.listByChannel
);

router.post(
  '/:id/messages',
  chatValidators.createMessage,
  validate,
  messageController.create
);

router.post(
  '/:id/messages/attachments',
  chatValidators.objectId('id'),
  validate,
  chatAttachmentUpload,
  messageController.uploadAttachment
);

router.get(
  '/:id/attachments/recent',
  chatValidators.recentAttachments,
  validate,
  messageController.recentAttachments
);

router.get('/:id', chatValidators.objectId('id'), validate, channelController.getById);
router.patch('/:id', chatValidators.updateChannel, validate, channelController.update);
router.delete('/:id', chatValidators.objectId('id'), validate, channelController.remove);

module.exports = router;
