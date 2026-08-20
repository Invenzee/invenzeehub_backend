const mongoose = require('mongoose');
const { Comment } = require('../models');
const AppError = require('../utils/AppError');
const { resolveFromCard } = require('../utils/kanbanContext');
const {
  canViewBoard,
  canCommentOnCards,
  canEditBoardContent,
} = require('../utils/boardAccess');
const { logActivity } = require('./activityService');

const COMMENT_POPULATE = [
  { path: 'author', select: 'name email avatarUrl role department' },
  { path: 'mentions', select: 'name email avatarUrl' },
  { path: 'attachments.uploadedBy', select: 'name email avatarUrl' },
];

function stripHtml(html = '') {
  return String(html)
    .replace(/<[^>]*>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

async function listComments(actor, cardId) {
  const { workspace, board } = await resolveFromCard(cardId);

  if (!canViewBoard(workspace, board, actor)) {
    throw new AppError('You do not have access to this card', 403, { code: 'FORBIDDEN' });
  }

  return Comment.find({ card: cardId })
    .populate(COMMENT_POPULATE)
    .sort({ createdAt: 1 })
    .lean();
}

async function createComment(actor, cardId, payload) {
  const { workspace, board } = await resolveFromCard(cardId);

  if (!canCommentOnCards(workspace, board, actor)) {
    throw new AppError('You cannot comment on this card', 403, { code: 'FORBIDDEN' });
  }

  const mentions = payload.mentions
    ? [...new Set(payload.mentions.map((id) => id.toString()))].map(
        (id) => new mongoose.Types.ObjectId(id)
      )
    : [];

  const text = payload.text.trim();
  if (!stripHtml(text) && !payload.attachments?.length) {
    throw new AppError('Comment text is required', 400, { code: 'TEXT_REQUIRED' });
  }

  const comment = await Comment.create({
    card: cardId,
    author: actor._id,
    text,
    mentions,
    attachments: payload.attachments || [],
  });

  const populated = await Comment.findById(comment._id).populate(COMMENT_POPULATE).lean();

  const { emitToCard, emitToUser } = require('../socket');
  const { Notification, Card } = require('../models');

  emitToCard(cardId, 'comment:new', populated);

  await logActivity({
    card: cardId,
    workspace: workspace._id,
    board: board._id,
    action: 'commented',
    actor,
    meta: { commentId: comment._id.toString() },
  });

  const fullCard = await Card.findById(cardId).select('assignees watchers title').lean();
  const recipientIds = new Set();

  for (const assigneeId of fullCard?.assignees || []) {
    if (assigneeId.toString() !== actor._id.toString()) {
      recipientIds.add(assigneeId.toString());
    }
  }
  for (const watcherId of fullCard?.watchers || []) {
    if (watcherId.toString() !== actor._id.toString()) {
      recipientIds.add(watcherId.toString());
    }
  }
  for (const mentionId of mentions) {
    if (mentionId.toString() !== actor._id.toString()) {
      recipientIds.add(mentionId.toString());
    }
  }

  for (const userId of recipientIds) {
    const notification = await Notification.create({
      user: userId,
      type: 'comment',
      sourceType: 'card',
      sourceId: cardId,
      title: `${actor.name} commented on "${fullCard?.title || 'a card'}"`,
      body: stripHtml(text).slice(0, 200),
      read: false,
      channelDelivered: ['inapp'],
    });
    const notifLean = await Notification.findById(notification._id).lean();
    emitToUser(userId, 'notification:new', notifLean);
  }

  return populated;
}

async function getCommentById(actor, commentId) {
  const comment = await Comment.findById(commentId);
  if (!comment) {
    throw new AppError('Comment not found', 404, { code: 'COMMENT_NOT_FOUND' });
  }

  const { workspace, board } = await resolveFromCard(comment.card);

  if (!canViewBoard(workspace, board, actor)) {
    throw new AppError('You do not have access to this comment', 403, { code: 'FORBIDDEN' });
  }

  return Comment.findById(commentId).populate(COMMENT_POPULATE).lean();
}

async function updateComment(actor, commentId, payload) {
  const comment = await Comment.findById(commentId);
  if (!comment) {
    throw new AppError('Comment not found', 404, { code: 'COMMENT_NOT_FOUND' });
  }

  const { workspace, board } = await resolveFromCard(comment.card);

  const isAuthor = comment.author.toString() === actor._id.toString();
  const canManage = canEditBoardContent(workspace, board, actor);

  if (!isAuthor && !canManage) {
    throw new AppError('You cannot edit this comment', 403, { code: 'FORBIDDEN' });
  }

  if (payload.text !== undefined) comment.text = payload.text.trim();
  if (payload.mentions !== undefined) {
    comment.mentions = [...new Set(payload.mentions.map((id) => id.toString()))].map(
      (id) => new mongoose.Types.ObjectId(id)
    );
  }
  if (payload.attachments !== undefined) {
    comment.attachments = payload.attachments;
  }

  await comment.save();
  return Comment.findById(commentId).populate(COMMENT_POPULATE).lean();
}

async function toggleReaction(actor, commentId, emoji) {
  const comment = await Comment.findById(commentId);
  if (!comment) {
    throw new AppError('Comment not found', 404, { code: 'COMMENT_NOT_FOUND' });
  }

  const { workspace, board } = await resolveFromCard(comment.card);

  if (!canCommentOnCards(workspace, board, actor)) {
    throw new AppError('You cannot react to this comment', 403, { code: 'FORBIDDEN' });
  }

  const cleanEmoji = String(emoji || '').trim();
  if (!cleanEmoji) {
    throw new AppError('Emoji is required', 400, { code: 'EMOJI_REQUIRED' });
  }

  const userId = actor._id.toString();
  let reaction = comment.reactions.find((r) => r.emoji === cleanEmoji);

  if (!reaction) {
    comment.reactions.push({ emoji: cleanEmoji, userIds: [actor._id] });
  } else {
    const idx = reaction.userIds.findIndex((id) => id.toString() === userId);
    if (idx >= 0) {
      reaction.userIds.splice(idx, 1);
      if (reaction.userIds.length === 0) {
        comment.reactions = comment.reactions.filter((r) => r.emoji !== cleanEmoji);
      }
    } else {
      reaction.userIds.push(actor._id);
    }
  }

  await comment.save();
  return Comment.findById(commentId).populate(COMMENT_POPULATE).lean();
}

async function deleteComment(actor, commentId) {
  const comment = await Comment.findById(commentId);
  if (!comment) {
    throw new AppError('Comment not found', 404, { code: 'COMMENT_NOT_FOUND' });
  }

  const { workspace, board } = await resolveFromCard(comment.card);

  const isAuthor = comment.author.toString() === actor._id.toString();
  const canManage = canEditBoardContent(workspace, board, actor);

  if (!isAuthor && !canManage) {
    throw new AppError('You cannot delete this comment', 403, { code: 'FORBIDDEN' });
  }

  await comment.deleteOne();
  return { deleted: true, id: commentId };
}

module.exports = {
  listComments,
  createComment,
  getCommentById,
  updateComment,
  toggleReaction,
  deleteComment,
};
