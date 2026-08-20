const mongoose = require('mongoose');
const { Card } = require('../models');
const AppError = require('../utils/AppError');
const { CARD_PRIORITIES } = require('../constants/cards');
const {
  resolveFromList,
  resolveFromCard,
  nextPosition,
  sanitizeCardForUser,
} = require('../utils/kanbanContext');
const {
  canViewBoard,
  canEditBoardContent,
} = require('../utils/boardAccess');
const { logActivity } = require('./activityService');

const CARD_POPULATE = [
  { path: 'assignees', select: 'name email avatarUrl role department' },
  { path: 'watchers', select: 'name email avatarUrl role department' },
  { path: 'createdBy', select: 'name email avatarUrl' },
  { path: 'attachments.uploadedBy', select: 'name email avatarUrl' },
];

async function populateCard(card) {
  return Card.findById(card._id).populate(CARD_POPULATE).lean();
}

function stripHtml(html = '') {
  return String(html)
    .replace(/<[^>]*>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function activityContext(workspace, board, card) {
  return {
    card: card._id,
    workspace: workspace._id,
    board: board._id,
  };
}

async function listCards(actor, listId) {
  const { workspace, board, list } = await resolveFromList(listId);

  if (!canViewBoard(workspace, board, actor)) {
    throw new AppError('You do not have access to this list', 403, { code: 'FORBIDDEN' });
  }

  const cards = await Card.find({ list: list._id, isArchived: false })
    .populate(CARD_POPULATE)
    .sort({ position: 1 })
    .lean();

  return cards.map((c) => sanitizeCardForUser(c));
}

async function createCard(actor, listId, payload) {
  const { workspace, board, list } = await resolveFromList(listId);

  if (!canEditBoardContent(workspace, board, actor)) {
    throw new AppError('You cannot create cards', 403, { code: 'FORBIDDEN' });
  }

  const existing = await Card.find({ list: list._id, isArchived: false })
    .select('position')
    .lean();
  const position = payload.position ?? nextPosition(existing);

  const assignees = payload.assignees
    ? [...new Set(payload.assignees.map((id) => id.toString()))]
    : [];
  if (!assignees.includes(actor._id.toString())) {
    assignees.unshift(actor._id.toString());
  }

  const card = await Card.create({
    list: list._id,
    workspace: workspace._id,
    title: payload.title.trim(),
    description: payload.description || '',
    assignees: assignees.map((id) => new mongoose.Types.ObjectId(id)),
    labels: payload.labels || [],
    checklist: payload.checklist || [],
    dueDate: payload.dueDate ? new Date(payload.dueDate) : null,
    startDate: payload.startDate ? new Date(payload.startDate) : null,
    dueComplete: Boolean(payload.dueComplete),
    priority: payload.priority || 'medium',
    position,
    createdBy: actor._id,
    watchers: [actor._id],
  });

  await logActivity({
    ...activityContext(workspace, board, card),
    action: 'created',
    actor,
    meta: { title: card.title },
  });

  const populated = await populateCard(card);
  return sanitizeCardForUser(populated);
}

async function getCardById(actor, cardId) {
  const { workspace, board, card } = await resolveFromCard(cardId);

  if (!canViewBoard(workspace, board, actor)) {
    throw new AppError('You do not have access to this card', 403, { code: 'FORBIDDEN' });
  }

  const populated = await populateCard(card);
  return sanitizeCardForUser(populated);
}

async function updateCard(actor, cardId, payload) {
  const { workspace, board, card } = await resolveFromCard(cardId);

  if (!canEditBoardContent(workspace, board, actor)) {
    throw new AppError('You cannot update this card', 403, { code: 'FORBIDDEN' });
  }

  const ctx = activityContext(workspace, board, card);

  if (payload.title !== undefined && payload.title.trim() !== card.title) {
    const prev = card.title;
    card.title = payload.title.trim();
    await logActivity({
      ...ctx,
      action: 'title_changed',
      actor,
      meta: { from: prev, to: card.title },
    });
  }

  if (payload.description !== undefined && payload.description !== card.description) {
    card.description = payload.description;
    await logActivity({
      ...ctx,
      action: 'description_changed',
      actor,
      meta: {},
    });
  }

  if (payload.dueDate !== undefined) {
    const next = payload.dueDate ? new Date(payload.dueDate) : null;
    const prev = card.dueDate;
    card.dueDate = next;
    if (String(prev) !== String(next)) {
      await logActivity({
        ...ctx,
        action: 'due_date_changed',
        actor,
        meta: { from: prev, to: next },
      });
    }
  }

  if (payload.startDate !== undefined) {
    card.startDate = payload.startDate ? new Date(payload.startDate) : null;
  }

  if (payload.dueComplete !== undefined) {
    card.dueComplete = Boolean(payload.dueComplete);
  }

  if (payload.priority !== undefined) {
    if (!CARD_PRIORITIES.includes(payload.priority)) {
      throw new AppError('Invalid priority', 400, { code: 'INVALID_PRIORITY' });
    }
    if (payload.priority !== card.priority) {
      const prev = card.priority;
      card.priority = payload.priority;
      await logActivity({
        ...ctx,
        action: 'priority_changed',
        actor,
        meta: { from: prev, to: card.priority },
      });
    }
  }

  if (payload.assignees !== undefined) {
    const nextIds = [...new Set(payload.assignees.map((id) => id.toString()))];
    const prevIds = card.assignees.map((id) => id.toString());
    card.assignees = nextIds.map((id) => new mongoose.Types.ObjectId(id));

    const added = nextIds.filter((id) => !prevIds.includes(id));
    const removed = prevIds.filter((id) => !nextIds.includes(id));
    for (const id of added) {
      await logActivity({
        ...ctx,
        action: 'assigned',
        actor,
        meta: { userId: id },
      });
    }
    for (const id of removed) {
      await logActivity({
        ...ctx,
        action: 'unassigned',
        actor,
        meta: { userId: id },
      });
    }
  }

  if (payload.labels !== undefined) {
    const prev = JSON.stringify(card.labels || []);
    card.labels = payload.labels;
    const next = JSON.stringify(payload.labels || []);
    if (prev !== next) {
      await logActivity({
        ...ctx,
        action: 'label_added',
        actor,
        meta: { labels: payload.labels },
      });
    }
  }

  if (payload.checklist !== undefined) {
    card.checklist = payload.checklist;
    await logActivity({
      ...ctx,
      action: 'checklist_updated',
      actor,
      meta: { count: payload.checklist.length },
    });
  }

  if (payload.position !== undefined) card.position = payload.position;

  await card.save();
  const populated = await populateCard(card);
  return sanitizeCardForUser(populated);
}

async function deleteCard(actor, cardId) {
  const { Comment } = require('../models');
  const { workspace, board, card } = await resolveFromCard(cardId);

  if (!canEditBoardContent(workspace, board, actor)) {
    throw new AppError('You cannot delete this card', 403, { code: 'FORBIDDEN' });
  }

  await Comment.deleteMany({ card: card._id });
  await card.deleteOne();

  return { deleted: true, id: cardId };
}

async function moveCard(actor, cardId, payload) {
  const { workspace, board, card } = await resolveFromCard(cardId);

  if (!canEditBoardContent(workspace, board, actor)) {
    throw new AppError('You cannot move this card', 403, { code: 'FORBIDDEN' });
  }

  const targetListId = payload.listId;
  const { board: targetBoard, list: targetList } = await resolveFromList(targetListId);

  if (targetBoard.workspace.toString() !== workspace._id.toString()) {
    throw new AppError('Target list must belong to the same workspace', 400, {
      code: 'INVALID_LIST',
    });
  }

  const fromList = card.list.toString();
  card.list = targetList._id;
  if (payload.position !== undefined) {
    card.position = payload.position;
  } else {
    const existing = await Card.find({ list: targetList._id, isArchived: false })
      .select('position')
      .lean();
    card.position = nextPosition(existing);
  }

  await card.save();
  await logActivity({
    ...activityContext(workspace, board, card),
    action: 'moved',
    actor,
    meta: { fromList, toList: targetList._id.toString(), listTitle: targetList.title },
  });

  const populated = await populateCard(card);
  return sanitizeCardForUser(populated);
}

async function copyCard(actor, cardId, payload = {}) {
  const { workspace, board, card } = await resolveFromCard(cardId);

  if (!canEditBoardContent(workspace, board, actor)) {
    throw new AppError('You cannot copy this card', 403, { code: 'FORBIDDEN' });
  }

  const targetListId = payload.listId || card.list.toString();
  const { board: targetBoard, list: targetList } = await resolveFromList(targetListId);

  if (targetBoard.workspace.toString() !== workspace._id.toString()) {
    throw new AppError('Target list must belong to the same workspace', 400, {
      code: 'INVALID_LIST',
    });
  }

  const existing = await Card.find({ list: targetList._id, isArchived: false })
    .select('position')
    .lean();

  const copy = await Card.create({
    list: targetList._id,
    workspace: workspace._id,
    title: payload.title?.trim() || `${card.title} (copy)`,
    description: card.description || '',
    assignees: [...card.assignees],
    labels: card.labels.map((l) => ({ name: l.name, color: l.color })),
    checklist: card.checklist.map((item) => ({ text: item.text, done: item.done })),
    dueDate: card.dueDate,
    startDate: card.startDate,
    dueComplete: false,
    priority: card.priority,
    attachments: [],
    position: nextPosition(existing),
    coverUrl: null,
    coverAttachmentId: null,
    createdBy: actor._id,
    watchers: [actor._id],
    isArchived: false,
  });

  await logActivity({
    ...activityContext(workspace, board, copy),
    action: 'copied',
    actor,
    meta: { sourceCardId: card._id.toString(), title: copy.title },
  });

  const populated = await populateCard(copy);
  return sanitizeCardForUser(populated);
}

async function archiveCard(actor, cardId) {
  const { workspace, board, card } = await resolveFromCard(cardId);

  if (!canEditBoardContent(workspace, board, actor)) {
    throw new AppError('You cannot archive this card', 403, { code: 'FORBIDDEN' });
  }

  card.isArchived = true;
  await card.save();
  await logActivity({
    ...activityContext(workspace, board, card),
    action: 'archived',
    actor,
    meta: {},
  });

  const populated = await populateCard(card);
  return sanitizeCardForUser(populated);
}

async function unarchiveCard(actor, cardId) {
  const { workspace, board, card } = await resolveFromCard(cardId);

  if (!canEditBoardContent(workspace, board, actor)) {
    throw new AppError('You cannot unarchive this card', 403, { code: 'FORBIDDEN' });
  }

  card.isArchived = false;
  await card.save();
  await logActivity({
    ...activityContext(workspace, board, card),
    action: 'unarchived',
    actor,
    meta: {},
  });

  const populated = await populateCard(card);
  return sanitizeCardForUser(populated);
}

async function watchCard(actor, cardId) {
  const { workspace, board, card } = await resolveFromCard(cardId);

  if (!canViewBoard(workspace, board, actor)) {
    throw new AppError('You do not have access to this card', 403, { code: 'FORBIDDEN' });
  }

  const already = card.watchers.some((id) => id.toString() === actor._id.toString());
  if (!already) {
    card.watchers.push(actor._id);
    await card.save();
    await logActivity({
      ...activityContext(workspace, board, card),
      action: 'watcher_added',
      actor,
      meta: { userId: actor._id.toString() },
    });
  }

  const populated = await populateCard(card);
  return sanitizeCardForUser(populated);
}

async function unwatchCard(actor, cardId) {
  const { workspace, board, card } = await resolveFromCard(cardId);

  if (!canViewBoard(workspace, board, actor)) {
    throw new AppError('You do not have access to this card', 403, { code: 'FORBIDDEN' });
  }

  const before = card.watchers.length;
  card.watchers = card.watchers.filter((id) => id.toString() !== actor._id.toString());
  if (card.watchers.length !== before) {
    await card.save();
    await logActivity({
      ...activityContext(workspace, board, card),
      action: 'watcher_removed',
      actor,
      meta: { userId: actor._id.toString() },
    });
  }

  const populated = await populateCard(card);
  return sanitizeCardForUser(populated);
}

async function shareCard(actor, cardId, payload = {}) {
  const { workspace, board, card } = await resolveFromCard(cardId);

  if (!canViewBoard(workspace, board, actor)) {
    throw new AppError('You do not have access to this card', 403, { code: 'FORBIDDEN' });
  }

  const frontendOrigin = (process.env.CORS_ORIGIN || 'http://localhost:3000')
    .split(',')[0]
    .trim();

  const url =
    payload.url ||
    `${frontendOrigin}/workspaces/${workspace._id}/boards/${board._id}?card=${card._id}`;

  await logActivity({
    ...activityContext(workspace, board, card),
    action: 'shared',
    actor,
    meta: { url },
  });

  if (payload.notify) {
    const { Notification } = require('../models');
    const { emitToUser } = require('../socket');
    const recipients = new Set([
      ...card.assignees.map((id) => id.toString()),
      ...card.watchers.map((id) => id.toString()),
    ]);
    recipients.delete(actor._id.toString());

    for (const userId of recipients) {
      const notification = await Notification.create({
        user: userId,
        type: 'mention',
        sourceType: 'card',
        sourceId: card._id,
        title: `${actor.name} shared "${card.title}"`,
        body: url,
        read: false,
        channelDelivered: ['inapp'],
      });
      const lean = await Notification.findById(notification._id).lean();
      emitToUser(userId, 'notification:new', lean);
    }
  }

  return { url, cardId: card._id.toString(), title: card.title };
}

async function clearCover(actor, cardId) {
  const { workspace, board, card } = await resolveFromCard(cardId);

  if (!canEditBoardContent(workspace, board, actor)) {
    throw new AppError('You cannot clear cover', 403, { code: 'FORBIDDEN' });
  }

  card.attachments.forEach((a) => {
    a.isCover = false;
  });
  card.coverUrl = null;
  card.coverAttachmentId = null;
  await card.save();

  const populated = await populateCard(card);
  return sanitizeCardForUser(populated);
}

async function reorderCards(actor, listId, items) {
  const { workspace, board, list } = await resolveFromList(listId);

  if (!canEditBoardContent(workspace, board, actor)) {
    throw new AppError('You cannot reorder cards', 403, { code: 'FORBIDDEN' });
  }

  const updates = items.map((item) =>
    Card.updateOne({ _id: item.id, list: list._id }, { $set: { position: item.position } })
  );
  await Promise.all(updates);

  return listCards(actor, listId);
}

async function addAttachmentFile(actor, cardId, file) {
  const { uploadCardFile } = require('./cloudinaryService');
  const { workspace, board, card } = await resolveFromCard(cardId);

  if (!canEditBoardContent(workspace, board, actor)) {
    throw new AppError('You cannot add attachments', 403, { code: 'FORBIDDEN' });
  }

  const uploaded = await uploadCardFile(file, cardId, actor._id);
  const isImage = file.mimetype?.startsWith('image/');

  const attachment = {
    url: uploaded.url,
    filename: file.originalname || 'attachment',
    uploadedBy: actor._id,
    size: uploaded.bytes || file.size || 0,
    mimeType: file.mimetype,
    publicId: uploaded.publicId,
    resourceType: uploaded.resourceType || (isImage ? 'image' : 'raw'),
    isCover: false,
  };

  card.attachments.push(attachment);
  const newAtt = card.attachments[card.attachments.length - 1];

  if (isImage && !card.coverUrl) {
    card.coverUrl = uploaded.url;
    card.coverAttachmentId = newAtt._id;
    newAtt.isCover = true;
  }

  await card.save();
  await logActivity({
    ...activityContext(workspace, board, card),
    action: 'attachment_added',
    actor,
    meta: { filename: attachment.filename, mimeType: attachment.mimeType },
  });

  const populated = await populateCard(card);
  return sanitizeCardForUser(populated);
}

async function addAttachmentLink(actor, cardId, payload) {
  const { workspace, board, card } = await resolveFromCard(cardId);

  if (!canEditBoardContent(workspace, board, actor)) {
    throw new AppError('You cannot add attachments', 403, { code: 'FORBIDDEN' });
  }

  const url = String(payload.url || '').trim();
  if (!url) {
    throw new AppError('URL is required', 400, { code: 'URL_REQUIRED' });
  }

  card.attachments.push({
    url,
    filename: payload.filename?.trim() || url,
    uploadedBy: actor._id,
    size: 0,
    mimeType: 'link',
    isCover: false,
  });

  await card.save();
  await logActivity({
    ...activityContext(workspace, board, card),
    action: 'attachment_added',
    actor,
    meta: { filename: payload.filename || url, mimeType: 'link' },
  });

  const populated = await populateCard(card);
  return sanitizeCardForUser(populated);
}

async function removeAttachment(actor, cardId, attachmentId) {
  const { destroyImage } = require('./cloudinaryService');
  const { workspace, board, card } = await resolveFromCard(cardId);

  if (!canEditBoardContent(workspace, board, actor)) {
    throw new AppError('You cannot remove attachments', 403, { code: 'FORBIDDEN' });
  }

  const att = card.attachments.find((a) => a._id.toString() === attachmentId.toString());
  if (!att) {
    throw new AppError('Attachment not found', 404, { code: 'ATTACHMENT_NOT_FOUND' });
  }

  if (att.publicId) {
    await destroyImage(att.publicId, att.resourceType || 'image');
  }

  if (card.coverAttachmentId?.toString() === attachmentId.toString()) {
    card.coverUrl = null;
    card.coverAttachmentId = null;
  }

  const filename = att.filename;
  card.attachments = card.attachments.filter((a) => a._id.toString() !== attachmentId.toString());
  await card.save();

  await logActivity({
    ...activityContext(workspace, board, card),
    action: 'attachment_removed',
    actor,
    meta: { filename },
  });

  const populated = await populateCard(card);
  return sanitizeCardForUser(populated);
}

async function setCardCover(actor, cardId, attachmentId) {
  const { workspace, board, card } = await resolveFromCard(cardId);

  if (!canEditBoardContent(workspace, board, actor)) {
    throw new AppError('You cannot set cover', 403, { code: 'FORBIDDEN' });
  }

  card.attachments.forEach((a) => {
    a.isCover = a._id.toString() === attachmentId.toString();
  });

  const att = card.attachments.find((a) => a._id.toString() === attachmentId.toString());
  if (!att) {
    throw new AppError('Attachment not found', 404, { code: 'ATTACHMENT_NOT_FOUND' });
  }

  card.coverUrl = att.url;
  card.coverAttachmentId = att._id;
  att.isCover = true;

  await card.save();
  const populated = await populateCard(card);
  return sanitizeCardForUser(populated);
}

module.exports = {
  listCards,
  createCard,
  getCardById,
  updateCard,
  deleteCard,
  moveCard,
  copyCard,
  archiveCard,
  unarchiveCard,
  watchCard,
  unwatchCard,
  shareCard,
  clearCover,
  reorderCards,
  addAttachmentFile,
  addAttachmentLink,
  removeAttachment,
  setCardCover,
  stripHtml,
};
