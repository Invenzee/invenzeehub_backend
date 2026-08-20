const express = require('express');
const notificationController = require('../controllers/notificationController');
const validate = require('../middleware/validate');
const { protect } = require('../middleware/auth');
const { requireAdmin } = require('../middleware/authorize');
const { apiLimiter } = require('../middleware/rateLimit');
const notificationValidators = require('../validators/notificationValidators');

const router = express.Router();

router.use(apiLimiter);
router.use(protect);

router.get(
  '/unread-count',
  notificationController.unreadCount
);

router.get(
  '/',
  notificationValidators.listNotifications,
  validate,
  notificationController.list
);

router.post(
  '/',
  requireAdmin,
  notificationValidators.createNotification,
  validate,
  notificationController.create
);

router.patch('/read-all', notificationController.markAllRead);

router.delete('/read', notificationController.removeAllRead);

router.delete('/all', notificationController.removeAll);

router.get('/:id', notificationValidators.getById, validate, notificationController.getById);

router.patch('/:id/read', notificationValidators.markRead, validate, notificationController.markRead);

router.delete('/:id', notificationValidators.deleteNotification, validate, notificationController.remove);

module.exports = router;
