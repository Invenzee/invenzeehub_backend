const { List } = require('../models');
const AppError = require('../utils/AppError');
const {
  resolveFromBoard,
  resolveFromList,
  nextPosition,
} = require('../utils/kanbanContext');
const {
  canViewBoard,
  canManageBoards,
} = require('../utils/boardAccess');

async function listLists(actor, boardId) {
  const { workspace, board } = await resolveFromBoard(boardId);

  if (!canViewBoard(workspace, board, actor)) {
    throw new AppError('You do not have access to this board', 403, { code: 'FORBIDDEN' });
  }

  return List.find({ board: boardId }).sort({ position: 1 }).lean();
}

async function createList(actor, boardId, payload) {
  const { workspace, board } = await resolveFromBoard(boardId);

  if (!canManageBoards(workspace, actor)) {
    throw new AppError('You cannot create lists', 403, { code: 'FORBIDDEN' });
  }

  const existing = await List.find({ board: board._id }).select('position').lean();
  const position = payload.position ?? nextPosition(existing);

  const list = await List.create({
    board: board._id,
    title: payload.title.trim(),
    position,
  });

  return list.toObject();
}

async function getListById(actor, listId) {
  const { workspace, board, list } = await resolveFromList(listId);

  if (!canViewBoard(workspace, board, actor)) {
    throw new AppError('You do not have access to this list', 403, { code: 'FORBIDDEN' });
  }

  return list.toObject();
}

async function updateList(actor, listId, payload) {
  const { workspace, list } = await resolveFromList(listId);

  if (!canManageBoards(workspace, actor)) {
    throw new AppError('You cannot update this list', 403, { code: 'FORBIDDEN' });
  }

  if (payload.title !== undefined) list.title = payload.title.trim();
  if (payload.position !== undefined) list.position = payload.position;

  await list.save();
  return list.toObject();
}

async function deleteList(actor, listId) {
  const { Card } = require('../models');
  const { workspace, list } = await resolveFromList(listId);

  if (!canManageBoards(workspace, actor)) {
    throw new AppError('You cannot delete this list', 403, { code: 'FORBIDDEN' });
  }

  await Card.deleteMany({ list: list._id });
  await list.deleteOne();

  return { deleted: true, id: listId };
}

async function reorderLists(actor, boardId, items) {
  const { workspace, board } = await resolveFromBoard(boardId);

  if (!canManageBoards(workspace, actor)) {
    throw new AppError('You cannot reorder lists', 403, { code: 'FORBIDDEN' });
  }

  const updates = items.map((item) =>
    List.updateOne({ _id: item.id, board: board._id }, { $set: { position: item.position } })
  );
  await Promise.all(updates);

  return listLists(actor, boardId);
}

module.exports = {
  listLists,
  createList,
  getListById,
  updateList,
  deleteList,
  reorderLists,
};
