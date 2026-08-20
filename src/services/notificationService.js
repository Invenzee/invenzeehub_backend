const mongoose = require('mongoose');
const { Notification, User } = require('../models');
const AppError = require('../utils/AppError');
const { isAdminRole } = require('../constants/roles');
const {
  NOTIFICATION_TYPES,
  SOURCE_TYPES,
  DELIVERY_CHANNELS,
} = require('../constants/notifications');

const POPULATE_USER = { path: 'user', select: 'name email avatarUrl role' };

function ensureObjectId(id, label = 'id') {
  if (!mongoose.Types.ObjectId.isValid(id)) {
    throw new AppError(`Invalid ${label}`, 400, { code: 'INVALID_ID' });
  }
}

async function getNotificationOrThrow(id) {
  ensureObjectId(id, 'notification id');
  const notification = await Notification.findById(id);
  if (!notification) {
    throw new AppError('Notification not found', 404, { code: 'NOTIFICATION_NOT_FOUND' });
  }
  return notification;
}

function assertNotificationOwner(notification, user) {
  if (notification.user.toString() !== user._id.toString() && !isAdminRole(user.role)) {
    throw new AppError('You do not have access to this notification', 403, { code: 'FORBIDDEN' });
  }
}

/**
 * Admin/system helper — create a notification for a user (testing + future triggers).
 */
async function createNotification(actor, payload) {
  if (!isAdminRole(actor.role)) {
    throw new AppError('Admin access required', 403, { code: 'FORBIDDEN' });
  }

  ensureObjectId(payload.userId, 'user id');
  ensureObjectId(payload.sourceId, 'source id');

  const user = await User.findById(payload.userId);
  if (!user) {
    throw new AppError('User not found', 404, { code: 'USER_NOT_FOUND' });
  }

  const notification = await Notification.create({
    user: payload.userId,
    type: payload.type,
    sourceType: payload.sourceType,
    sourceId: payload.sourceId,
    title: payload.title?.trim() || '',
    body: payload.body?.trim() || '',
    read: false,
    channelDelivered: payload.channelDelivered || ['inapp'],
  });

  const lean = await Notification.findById(notification._id).populate(POPULATE_USER).lean();

  const { emitToUser } = require('../socket');
  emitToUser(payload.userId, 'notification:new', lean);

  return lean;
}

async function listNotifications(user, query = {}) {
  const { page = 1, limit = 20, read, type, sort = '-createdAt' } = query;
  const pageNum = Math.max(1, Number(page) || 1);
  const limitNum = Math.min(100, Math.max(1, Number(limit) || 20));

  const filter = { user: user._id };
  if (read === 'true') filter.read = true;
  if (read === 'false') filter.read = false;
  if (type) filter.type = type;

  const [notifications, total, unreadCount] = await Promise.all([
    Notification.find(filter)
      .sort(sort)
      .skip((pageNum - 1) * limitNum)
      .limit(limitNum)
      .lean(),
    Notification.countDocuments(filter),
    Notification.countDocuments({ user: user._id, read: false }),
  ]);

  return {
    notifications,
    meta: {
      page: pageNum,
      limit: limitNum,
      total,
      totalPages: Math.ceil(total / limitNum) || 1,
      unreadCount,
    },
  };
}

async function getUnreadCount(user) {
  const count = await Notification.countDocuments({ user: user._id, read: false });
  return { unreadCount: count };
}

async function getNotificationById(user, id) {
  const notification = await getNotificationOrThrow(id);
  assertNotificationOwner(notification, user);
  return Notification.findById(id).populate(POPULATE_USER).lean();
}

async function markAsRead(user, id) {
  const notification = await getNotificationOrThrow(id);
  assertNotificationOwner(notification, user);

  notification.read = true;
  await notification.save();

  return Notification.findById(id).populate(POPULATE_USER).lean();
}

async function markAllAsRead(user) {
  const result = await Notification.updateMany(
    { user: user._id, read: false },
    { $set: { read: true } }
  );

  return { modifiedCount: result.modifiedCount };
}

async function deleteNotification(user, id) {
  const notification = await getNotificationOrThrow(id);
  assertNotificationOwner(notification, user);

  await notification.deleteOne();
  return { deleted: true, id };
}

async function deleteAllRead(user) {
  const result = await Notification.deleteMany({ user: user._id, read: true });
  return { deletedCount: result.deletedCount };
}

async function deleteAll(user) {
  const result = await Notification.deleteMany({ user: user._id });
  return { deletedCount: result.deletedCount };
}

module.exports = {
  NOTIFICATION_TYPES,
  SOURCE_TYPES,
  DELIVERY_CHANNELS,
  createNotification,
  listNotifications,
  getUnreadCount,
  getNotificationById,
  markAsRead,
  markAllAsRead,
  deleteNotification,
  deleteAllRead,
  deleteAll,
};
