const asyncHandler = require('../utils/asyncHandler');
const { success } = require('../utils/apiResponse');
const notificationService = require('../services/notificationService');

const create = asyncHandler(async (req, res) => {
  const notification = await notificationService.createNotification(req.user, req.body);
  return success(res, {
    statusCode: 201,
    message: 'Notification created',
    data: notification,
  });
});

const list = asyncHandler(async (req, res) => {
  const result = await notificationService.listNotifications(req.user, req.query);
  return success(res, {
    message: 'Notifications retrieved',
    data: result.notifications,
    meta: result.meta,
  });
});

const unreadCount = asyncHandler(async (req, res) => {
  const result = await notificationService.getUnreadCount(req.user);
  return success(res, { message: 'Unread count', data: result });
});

const getById = asyncHandler(async (req, res) => {
  const notification = await notificationService.getNotificationById(req.user, req.params.id);
  return success(res, { message: 'Notification retrieved', data: notification });
});

const markRead = asyncHandler(async (req, res) => {
  const notification = await notificationService.markAsRead(req.user, req.params.id);
  return success(res, { message: 'Notification marked as read', data: notification });
});

const markAllRead = asyncHandler(async (req, res) => {
  const result = await notificationService.markAllAsRead(req.user);
  return success(res, { message: 'All notifications marked as read', data: result });
});

const remove = asyncHandler(async (req, res) => {
  const result = await notificationService.deleteNotification(req.user, req.params.id);
  return success(res, { message: 'Notification deleted', data: result });
});

const removeAllRead = asyncHandler(async (req, res) => {
  const result = await notificationService.deleteAllRead(req.user);
  return success(res, { message: 'Read notifications cleared', data: result });
});

const removeAll = asyncHandler(async (req, res) => {
  const result = await notificationService.deleteAll(req.user);
  return success(res, { message: 'All notifications cleared', data: result });
});

module.exports = {
  create,
  list,
  unreadCount,
  getById,
  markRead,
  markAllRead,
  remove,
  removeAllRead,
  removeAll,
};
