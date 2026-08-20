const express = require('express');
const userController = require('../controllers/userController');
const validate = require('../middleware/validate');
const { protect } = require('../middleware/auth');
const { requireAdmin } = require('../middleware/authorize');
const { avatarUpload } = require('../middleware/upload');
const { apiLimiter } = require('../middleware/rateLimit');
const userValidators = require('../validators/userValidators');

const router = express.Router();

router.use(apiLimiter);

/** One-time first super_admin when DB is empty (no auth). */
router.post('/bootstrap', userValidators.bootstrap, validate, userController.bootstrap);

router.use(protect);

router.get('/', requireAdmin, userValidators.listUsers, validate, userController.list);

router.get('/directory', userController.directory);

router.post('/invite', requireAdmin, userValidators.inviteUser, validate, userController.invite);

router.patch('/me', userValidators.updateMe, validate, userController.updateMe);

router.post('/me/avatar', avatarUpload, userController.uploadAvatar);

router.delete('/me/avatar', userController.deleteAvatar);

router.get('/:id', userValidators.getById, validate, userController.getById);

router.patch('/:id', requireAdmin, userValidators.updateUser, validate, userController.updateById);

router.patch(
  '/:id/status',
  requireAdmin,
  userValidators.updateStatus,
  validate,
  userController.updateStatus
);

router.delete('/:id', requireAdmin, userValidators.deleteUser, validate, userController.remove);

module.exports = router;
