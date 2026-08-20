const express = require('express');
const authRoutes = require('./authRoutes');
const userRoutes = require('./userRoutes');
const workspaceRoutes = require('./workspaceRoutes');
const boardRoutes = require('./boardRoutes');
const boardDeleteRequestRoutes = require('./boardDeleteRequestRoutes');
const listRoutes = require('./listRoutes');
const cardRoutes = require('./cardRoutes');
const commentRoutes = require('./commentRoutes');
const notificationRoutes = require('./notificationRoutes');
const channelRoutes = require('./channelRoutes');
const messageRoutes = require('./messageRoutes');

const router = express.Router();

router.use('/auth', authRoutes);
router.use('/users', userRoutes);
router.use('/workspaces', workspaceRoutes);
router.use('/boards', boardRoutes);
router.use('/board-delete-requests', boardDeleteRequestRoutes);
router.use('/lists', listRoutes);
router.use('/cards', cardRoutes);
router.use('/comments', commentRoutes);
router.use('/notifications', notificationRoutes);
router.use('/channels', channelRoutes);
router.use('/messages', messageRoutes);

module.exports = router;
