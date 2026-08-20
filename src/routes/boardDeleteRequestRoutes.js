const express = require('express');
const boardController = require('../controllers/boardController');
const validate = require('../middleware/validate');
const { protect } = require('../middleware/auth');
const { apiLimiter } = require('../middleware/rateLimit');
const kanbanValidators = require('../validators/kanbanValidators');

const router = express.Router();

router.use(apiLimiter);
router.use(protect);

router.get('/', kanbanValidators.listDeleteRequests, validate, boardController.listDeleteRequests);

router.post(
  '/:id/approve',
  kanbanValidators.objectId('id'),
  validate,
  boardController.approveDeleteRequest
);

router.post(
  '/:id/reject',
  kanbanValidators.objectId('id'),
  validate,
  boardController.rejectDeleteRequest
);

module.exports = router;
