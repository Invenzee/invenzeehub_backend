const mongoose = require('mongoose');
const { verifyAccessToken } = require('../utils/tokens');
const { User, Channel } = require('../models');
const { isChannelMember } = require('../utils/channelAccess');

let io = null;
/** @type {Map<string, Set<string>>} */
const onlineUsers = new Map();

function addPresence(userId, socketId) {
  if (!onlineUsers.has(userId)) onlineUsers.set(userId, new Set());
  onlineUsers.get(userId).add(socketId);
}

function removePresence(userId, socketId) {
  const set = onlineUsers.get(userId);
  if (!set) return false;
  set.delete(socketId);
  if (set.size === 0) {
    onlineUsers.delete(userId);
    return true;
  }
  return false;
}

function getOnlineUserIds() {
  return [...onlineUsers.keys()];
}

function init(socketServer) {
  io = socketServer;

  io.use(async (socket, next) => {
    try {
      const token =
        socket.handshake.auth?.token ||
        (socket.handshake.headers?.authorization?.startsWith('Bearer ')
          ? socket.handshake.headers.authorization.slice(7)
          : null);

      if (!token) {
        return next(new Error('Authentication required'));
      }

      const payload = verifyAccessToken(token);
      if (!mongoose.Types.ObjectId.isValid(payload.sub)) {
        return next(new Error('Invalid token'));
      }

      const user = await User.findById(payload.sub);
      if (!user || user.status !== 'active') {
        return next(new Error('User not allowed'));
      }

      socket.user = user;
      socket.userId = user._id.toString();
      next();
    } catch {
      next(new Error('Invalid token'));
    }
  });

  io.on('connection', (socket) => {
    socket.join(`user:${socket.userId}`);

    const wasOffline = !onlineUsers.has(socket.userId);
    addPresence(socket.userId, socket.id);
    if (wasOffline) {
      io.emit('presence:update', { userId: socket.userId, online: true });
    }
    socket.emit('presence:snapshot', { onlineUserIds: getOnlineUserIds() });

    socket.on('join:card', (cardId) => {
      if (mongoose.Types.ObjectId.isValid(cardId)) {
        socket.join(`card:${cardId}`);
      }
    });

    socket.on('leave:card', (cardId) => {
      socket.leave(`card:${cardId}`);
    });

    socket.on('join:channel', async (channelId, ack) => {
      try {
        if (!mongoose.Types.ObjectId.isValid(channelId)) {
          if (typeof ack === 'function') ack({ ok: false, error: 'Invalid channel' });
          return;
        }
        const channel = await Channel.findById(channelId).select('members');
        if (!channel || !isChannelMember(channel, socket.userId)) {
          if (typeof ack === 'function') ack({ ok: false, error: 'Forbidden' });
          return;
        }
        socket.join(`channel:${channelId}`);
        if (typeof ack === 'function') ack({ ok: true });
      } catch {
        if (typeof ack === 'function') ack({ ok: false, error: 'Failed' });
      }
    });

    socket.on('leave:channel', (channelId) => {
      if (mongoose.Types.ObjectId.isValid(channelId)) {
        socket.leave(`channel:${channelId}`);
      }
    });

    socket.on('typing:start', async (channelId) => {
      if (!mongoose.Types.ObjectId.isValid(channelId)) return;
      const channel = await Channel.findById(channelId).select('members');
      if (!channel || !isChannelMember(channel, socket.userId)) return;
      socket.to(`channel:${channelId}`).emit('typing:start', {
        channelId,
        userId: socket.userId,
        name: socket.user?.name || 'Someone',
      });
    });

    socket.on('typing:stop', async (channelId) => {
      if (!mongoose.Types.ObjectId.isValid(channelId)) return;
      socket.to(`channel:${channelId}`).emit('typing:stop', {
        channelId,
        userId: socket.userId,
      });
    });

    socket.on('disconnect', () => {
      const wentOffline = removePresence(socket.userId, socket.id);
      if (wentOffline) {
        io.emit('presence:update', { userId: socket.userId, online: false });
      }
    });
  });
}

function getIO() {
  return io;
}

function emitToUser(userId, event, data) {
  if (!io) return;
  io.to(`user:${userId.toString()}`).emit(event, data);
}

function emitToCard(cardId, event, data) {
  if (!io) return;
  io.to(`card:${cardId.toString()}`).emit(event, data);
}

function emitToChannel(channelId, event, data) {
  if (!io) return;
  io.to(`channel:${channelId.toString()}`).emit(event, data);
}

module.exports = {
  init,
  getIO,
  emitToUser,
  emitToCard,
  emitToChannel,
  getOnlineUserIds,
};
