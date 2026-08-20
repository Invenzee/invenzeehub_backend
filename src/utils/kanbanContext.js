const mongoose = require('mongoose');
const { Board, List, Card, Workspace } = require('../models');
const AppError = require('../utils/AppError');

function ensureObjectId(id, label = 'id') {
  if (!mongoose.Types.ObjectId.isValid(id)) {
    throw new AppError(`Invalid ${label}`, 400, { code: 'INVALID_ID' });
  }
}

async function getWorkspaceOrThrow(id) {
  ensureObjectId(id, 'workspace id');
  const workspace = await Workspace.findById(id);
  if (!workspace) {
    throw new AppError('Workspace not found', 404, { code: 'WORKSPACE_NOT_FOUND' });
  }
  return workspace;
}

async function getBoardOrThrow(id) {
  ensureObjectId(id, 'board id');
  const board = await Board.findById(id);
  if (!board) {
    throw new AppError('Board not found', 404, { code: 'BOARD_NOT_FOUND' });
  }
  return board;
}

async function getListOrThrow(id) {
  ensureObjectId(id, 'list id');
  const list = await List.findById(id);
  if (!list) {
    throw new AppError('List not found', 404, { code: 'LIST_NOT_FOUND' });
  }
  return list;
}

async function getCardOrThrow(id) {
  ensureObjectId(id, 'card id');
  const card = await Card.findById(id);
  if (!card) {
    throw new AppError('Card not found', 404, { code: 'CARD_NOT_FOUND' });
  }
  return card;
}

async function resolveFromWorkspace(workspaceId) {
  const workspace = await getWorkspaceOrThrow(workspaceId);
  return { workspace };
}

async function resolveFromBoard(boardId) {
  const board = await getBoardOrThrow(boardId);
  const workspace = await getWorkspaceOrThrow(board.workspace);
  return { workspace, board };
}

async function resolveFromList(listId) {
  const list = await getListOrThrow(listId);
  const board = await getBoardOrThrow(list.board);
  const workspace = await getWorkspaceOrThrow(board.workspace);
  return { workspace, board, list };
}

async function resolveFromCard(cardId) {
  const card = await getCardOrThrow(cardId);
  const list = await getListOrThrow(card.list);
  const board = await getBoardOrThrow(list.board);
  const workspace = await getWorkspaceOrThrow(card.workspace || board.workspace);
  return { workspace, board, list, card };
}

function nextPosition(items) {
  if (!items.length) return 0;
  return Math.max(...items.map((i) => i.position ?? 0)) + 1;
}

function sanitizeCardForUser(card) {
  return typeof card.toObject === 'function' ? card.toObject() : { ...card };
}

module.exports = {
  ensureObjectId,
  getWorkspaceOrThrow,
  getBoardOrThrow,
  getListOrThrow,
  getCardOrThrow,
  resolveFromWorkspace,
  resolveFromBoard,
  resolveFromList,
  resolveFromCard,
  nextPosition,
  sanitizeCardForUser,
};
