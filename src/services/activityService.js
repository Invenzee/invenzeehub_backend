const { ActivityEntry } = require('../models');
const { ACTIVITY_ACTIONS } = require('../models/ActivityEntry');
const AppError = require('../utils/AppError');
const { resolveFromCard } = require('../utils/kanbanContext');
const { canViewBoard } = require('../utils/boardAccess');

const ACTIVITY_POPULATE = [{ path: 'actor', select: 'name email avatarUrl' }];

/**
 * Best-effort activity log — never throws to callers of card/comment flows.
 */
async function logActivity({ card, workspace, board, action, actor, meta = {} }) {
  if (!ACTIVITY_ACTIONS.includes(action)) {
    console.warn(`[activity] unknown action: ${action}`);
    return null;
  }

  try {
    const entry = await ActivityEntry.create({
      card: card || null,
      workspace,
      board: board || null,
      action,
      actor: actor._id || actor,
      meta,
      timestamp: new Date(),
    });
    return entry;
  } catch (err) {
    console.warn('[activity] failed to log:', err.message);
    return null;
  }
}

async function listCardActivity(actor, cardId, query = {}) {
  const { workspace, board, card } = await resolveFromCard(cardId);

  if (!canViewBoard(workspace, board, actor)) {
    throw new AppError('You do not have access to this card', 403, { code: 'FORBIDDEN' });
  }

  const page = Math.max(1, Number(query.page) || 1);
  const limit = Math.min(100, Math.max(1, Number(query.limit) || 50));
  const skip = (page - 1) * limit;

  const filter = { card: card._id };

  const [items, total] = await Promise.all([
    ActivityEntry.find(filter)
      .populate(ACTIVITY_POPULATE)
      .sort({ timestamp: -1 })
      .skip(skip)
      .limit(limit)
      .lean(),
    ActivityEntry.countDocuments(filter),
  ]);

  return {
    items,
    meta: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit) || 1,
    },
  };
}

module.exports = { logActivity, listCardActivity };
