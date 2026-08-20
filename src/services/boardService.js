const mongoose = require('mongoose');
const {
  Board,
  List,
  Card,
  Comment,
  User,
  Notification,
  BoardDeleteRequest,
} = require('../models');
const AppError = require('../utils/AppError');
const { DEFAULT_BOARD_LISTS } = require('../constants/boards');
const { isAdminRole, isManagerRole } = require('../constants/roles');
const {
  resolveFromWorkspace,
  resolveFromBoard,
  nextPosition,
  sanitizeCardForUser,
} = require('../utils/kanbanContext');
const {
  canListWorkspaceBoards,
  canViewBoard,
  canManageBoards,
  canManageBoardMembers,
  canDeleteBoardDirectly,
  canRequestBoardDelete,
  canReviewBoardDelete,
  isBoardMember,
} = require('../utils/boardAccess');

const BOARD_POPULATE = [
  { path: 'members.user', select: 'name email avatarUrl role department' },
  { path: 'members.addedBy', select: 'name email avatarUrl' },
  { path: 'createdBy', select: 'name email avatarUrl' },
];

const DELETE_REQUEST_POPULATE = [
  { path: 'board', select: 'name workspace position' },
  { path: 'workspace', select: 'name status' },
  { path: 'requestedBy', select: 'name email avatarUrl role' },
  { path: 'reviewedBy', select: 'name email avatarUrl role' },
];

async function populateBoard(boardId) {
  return Board.findById(boardId).populate(BOARD_POPULATE).lean();
}

function uniqueObjectIds(ids) {
  return [...new Set(ids.map((id) => id.toString()))].map((id) => new mongoose.Types.ObjectId(id));
}

async function countBoardCards(boardId) {
  const lists = await List.find({ board: boardId }).select('_id').lean();
  if (!lists.length) return 0;
  return Card.countDocuments({ list: { $in: lists.map((l) => l._id) } });
}

async function cascadeDeleteBoard(board, { preserveDeleteRequestIds = [] } = {}) {
  const lists = await List.find({ board: board._id }).select('_id').lean();
  const listIds = lists.map((l) => l._id);
  const cards = await Card.find({ list: { $in: listIds } }).select('_id').lean();
  const cardIds = cards.map((c) => c._id);

  if (cardIds.length) {
    await Comment.deleteMany({ card: { $in: cardIds } });
  }
  await Card.deleteMany({ list: { $in: listIds } });
  await List.deleteMany({ board: board._id });

  const preserve = preserveDeleteRequestIds.map((id) => id.toString());
  const deleteFilter = { board: board._id };
  if (preserve.length) {
    deleteFilter._id = { $nin: preserve };
  }
  await BoardDeleteRequest.deleteMany(deleteFilter);

  await board.deleteOne();
}

async function notifyUsers(userIds, payload) {
  const { emitToUser } = require('../socket');
  const uniqueIds = [...new Set(userIds.map((id) => id.toString()))];

  for (const userId of uniqueIds) {
    const notification = await Notification.create({
      user: userId,
      type: payload.type,
      sourceType: payload.sourceType,
      sourceId: payload.sourceId,
      title: payload.title,
      body: payload.body || '',
      read: false,
      channelDelivered: ['inapp'],
    });
    const lean = await Notification.findById(notification._id).lean();
    emitToUser(userId, 'notification:new', lean);
  }
}

async function listBoards(actor, workspaceId) {
  const { workspace } = await resolveFromWorkspace(workspaceId);

  if (isAdminRole(actor.role) || (isManagerRole(actor.role) && canListWorkspaceBoards(workspace, actor))) {
    return Board.find({ workspace: workspace._id })
      .populate(BOARD_POPULATE)
      .sort({ position: 1 })
      .lean();
  }

  if (actor.role === 'member') {
    return Board.find({
      workspace: workspace._id,
      'members.user': actor._id,
    })
      .populate(BOARD_POPULATE)
      .sort({ position: 1 })
      .lean();
  }

  throw new AppError('You do not have access to this workspace', 403, { code: 'FORBIDDEN' });
}

async function createBoard(actor, workspaceId, payload) {
  const { workspace } = await resolveFromWorkspace(workspaceId);

  if (!canManageBoards(workspace, actor)) {
    throw new AppError('You cannot create boards', 403, { code: 'FORBIDDEN' });
  }

  const existing = await Board.find({ workspace: workspace._id }).select('position').lean();
  const position = payload.position ?? nextPosition(existing);

  const members = [];
  if (isManagerRole(actor.role)) {
    members.push({
      user: actor._id,
      addedBy: actor._id,
      addedAt: new Date(),
    });
  }

  const board = await Board.create({
    workspace: workspace._id,
    name: payload.name?.trim() || 'Main Board',
    position,
    members,
    createdBy: actor._id,
  });

  const listDocs = DEFAULT_BOARD_LISTS.map((title, index) => ({
    board: board._id,
    title,
    position: index,
  }));
  await List.insertMany(listDocs);

  return populateBoard(board._id);
}

async function getBoardById(actor, boardId) {
  const { workspace, board } = await resolveFromBoard(boardId);

  if (!canViewBoard(workspace, board, actor)) {
    throw new AppError('You do not have access to this board', 403, { code: 'FORBIDDEN' });
  }

  const populated = await populateBoard(board._id);
  return {
    ...populated,
    workspace: {
      _id: workspace._id,
      name: workspace.name,
      status: workspace.status,
    },
  };
}

async function getBoardKanban(actor, boardId) {
  const { workspace, board } = await resolveFromBoard(boardId);

  if (!canViewBoard(workspace, board, actor)) {
    throw new AppError('You do not have access to this board', 403, { code: 'FORBIDDEN' });
  }

  const lists = await List.find({ board: board._id }).sort({ position: 1 }).lean();
  const listIds = lists.map((l) => l._id);

  const cards = await Card.find({ list: { $in: listIds }, isArchived: false })
    .populate('assignees', 'name email avatarUrl role department')
    .populate('watchers', 'name email avatarUrl role department')
    .populate('createdBy', 'name email avatarUrl')
    .populate('attachments.uploadedBy', 'name email avatarUrl')
    .sort({ position: 1 })
    .lean();

  const cardIds = cards.map((c) => c._id);
  const commentAgg = await Comment.aggregate([
    { $match: { card: { $in: cardIds } } },
    { $group: { _id: '$card', count: { $sum: 1 } } },
  ]);
  const commentCounts = Object.fromEntries(
    commentAgg.map((row) => [row._id.toString(), row.count])
  );

  function enrichCard(card) {
    const sanitized = sanitizeCardForUser(card);
    sanitized.commentCount = commentCounts[card._id.toString()] || 0;
    sanitized.attachmentCount = card.attachments?.length || 0;
    if (card.coverUrl) {
      sanitized.coverUrl = card.coverUrl;
    } else if (card.attachments?.length) {
      const coverAtt = card.attachments.find((a) => a.isCover);
      const imageAtt =
        coverAtt ||
        card.attachments.find(
          (a) =>
            a.mimeType?.startsWith('image/') ||
            /\.(jpg|jpeg|png|gif|webp)(\?|$)/i.test(a.url || '')
        );
      if (imageAtt) sanitized.coverUrl = imageAtt.url;
    }
    return sanitized;
  }

  const cardsByList = new Map(listIds.map((id) => [id.toString(), []]));
  for (const card of cards) {
    cardsByList.get(card.list.toString()).push(enrichCard(card));
  }

  const populatedBoard = await populateBoard(board._id);

  return {
    board: populatedBoard,
    lists: lists.map((list) => ({
      ...list,
      cards: cardsByList.get(list._id.toString()) || [],
    })),
    workspace: {
      _id: workspace._id,
      name: workspace.name,
      status: workspace.status,
    },
  };
}

async function updateBoard(actor, boardId, payload) {
  const { workspace, board } = await resolveFromBoard(boardId);

  if (!canManageBoards(workspace, actor)) {
    throw new AppError('You cannot update this board', 403, { code: 'FORBIDDEN' });
  }

  if (payload.name !== undefined) board.name = payload.name.trim();
  if (payload.position !== undefined) board.position = payload.position;

  await board.save();
  return populateBoard(board._id);
}

async function deleteBoard(actor, boardId) {
  const { workspace, board } = await resolveFromBoard(boardId);

  if (!canDeleteBoardDirectly(workspace, actor)) {
    throw new AppError('You cannot delete this board', 403, { code: 'FORBIDDEN' });
  }

  if (!isAdminRole(actor.role)) {
    if (!isManagerRole(actor.role)) {
      throw new AppError('You cannot delete this board', 403, { code: 'FORBIDDEN' });
    }

    const cardCount = await countBoardCards(board._id);
    if (cardCount > 0) {
      throw new AppError(
        'This board has cards. Request deletion for admin approval instead.',
        400,
        { code: 'BOARD_HAS_CARDS', details: { cardCount } }
      );
    }
  }

  const id = board._id.toString();
  await cascadeDeleteBoard(board);
  return { deleted: true, id };
}

async function requestDeleteBoard(actor, boardId, reason = '') {
  const { workspace, board } = await resolveFromBoard(boardId);

  if (!canRequestBoardDelete(workspace, actor)) {
    throw new AppError('Only managers can request board deletion', 403, { code: 'FORBIDDEN' });
  }

  const cardCount = await countBoardCards(board._id);
  if (cardCount === 0) {
    throw new AppError('Board has no cards — delete it directly instead', 400, {
      code: 'BOARD_EMPTY',
    });
  }

  const existing = await BoardDeleteRequest.findOne({ board: board._id, status: 'pending' });
  if (existing) {
    throw new AppError('A pending delete request already exists for this board', 409, {
      code: 'DELETE_REQUEST_EXISTS',
    });
  }

  const request = await BoardDeleteRequest.create({
    board: board._id,
    workspace: workspace._id,
    boardName: board.name,
    requestedBy: actor._id,
    status: 'pending',
    reason: String(reason || '').trim(),
  });

  const admins = await User.find({
    role: { $in: ['super_admin', 'admin'] },
    status: 'active',
  })
    .select('_id')
    .lean();

  await notifyUsers(
    admins.map((u) => u._id),
    {
      type: 'board_delete_request',
      sourceType: 'board_delete_request',
      sourceId: request._id,
      title: `Delete request: "${board.name}"`,
      body: reason
        ? `${actor.name} requested deletion. Reason: ${String(reason).trim().slice(0, 200)}`
        : `${actor.name} requested deletion of board "${board.name}" (${cardCount} cards).`,
    }
  );

  return BoardDeleteRequest.findById(request._id).populate(DELETE_REQUEST_POPULATE).lean();
}

async function listDeleteRequests(actor, query = {}) {
  if (!canReviewBoardDelete(actor)) {
    throw new AppError('Only admins can review board delete requests', 403, {
      code: 'FORBIDDEN',
    });
  }

  const filter = {};
  if (query.workspaceId) {
    if (!mongoose.Types.ObjectId.isValid(query.workspaceId)) {
      throw new AppError('Invalid workspace id', 400, { code: 'INVALID_ID' });
    }
    filter.workspace = query.workspaceId;
  }
  if (query.status) {
    filter.status = query.status;
  }

  return BoardDeleteRequest.find(filter)
    .populate(DELETE_REQUEST_POPULATE)
    .sort({ createdAt: -1 })
    .lean();
}

async function approveDeleteRequest(actor, requestId) {
  if (!canReviewBoardDelete(actor)) {
    throw new AppError('Only admins can approve board delete requests', 403, {
      code: 'FORBIDDEN',
    });
  }

  if (!mongoose.Types.ObjectId.isValid(requestId)) {
    throw new AppError('Invalid request id', 400, { code: 'INVALID_ID' });
  }

  const request = await BoardDeleteRequest.findById(requestId);
  if (!request) {
    throw new AppError('Delete request not found', 404, { code: 'DELETE_REQUEST_NOT_FOUND' });
  }
  if (request.status !== 'pending') {
    throw new AppError('Delete request is not pending', 400, { code: 'REQUEST_NOT_PENDING' });
  }

  const board = await Board.findById(request.board);
  const boardName = request.boardName;
  const requestedBy = request.requestedBy;

  // Mark approved before cascade so we keep an audit row (cascade skips this id).
  request.status = 'approved';
  request.reviewedBy = actor._id;
  request.reviewedAt = new Date();
  await request.save();

  // Close any other pending requests for the same board.
  await BoardDeleteRequest.updateMany(
    {
      board: request.board,
      status: 'pending',
      _id: { $ne: request._id },
    },
    {
      $set: {
        status: 'rejected',
        reviewedBy: actor._id,
        reviewedAt: new Date(),
      },
    }
  );

  if (board) {
    await cascadeDeleteBoard(board, { preserveDeleteRequestIds: [request._id] });
  }

  await notifyUsers([requestedBy], {
    type: 'board_delete_approved',
    sourceType: 'board_delete_request',
    sourceId: request._id,
    title: `Delete approved: "${boardName}"`,
    body: `${actor.name} approved deletion of board "${boardName}".`,
  });

  return BoardDeleteRequest.findById(request._id).populate(DELETE_REQUEST_POPULATE).lean();
}

async function rejectDeleteRequest(actor, requestId) {
  if (!canReviewBoardDelete(actor)) {
    throw new AppError('Only admins can reject board delete requests', 403, {
      code: 'FORBIDDEN',
    });
  }

  if (!mongoose.Types.ObjectId.isValid(requestId)) {
    throw new AppError('Invalid request id', 400, { code: 'INVALID_ID' });
  }

  const request = await BoardDeleteRequest.findById(requestId);
  if (!request) {
    throw new AppError('Delete request not found', 404, { code: 'DELETE_REQUEST_NOT_FOUND' });
  }
  if (request.status !== 'pending') {
    throw new AppError('Delete request is not pending', 400, { code: 'REQUEST_NOT_PENDING' });
  }

  request.status = 'rejected';
  request.reviewedBy = actor._id;
  request.reviewedAt = new Date();
  await request.save();

  await notifyUsers([request.requestedBy], {
    type: 'board_delete_rejected',
    sourceType: 'board_delete_request',
    sourceId: request._id,
    title: `Delete rejected: "${request.boardName}"`,
    body: `${actor.name} rejected deletion of board "${request.boardName}".`,
  });

  return BoardDeleteRequest.findById(request._id).populate(DELETE_REQUEST_POPULATE).lean();
}

async function reorderBoards(actor, workspaceId, items) {
  const { workspace } = await resolveFromWorkspace(workspaceId);

  if (!canManageBoards(workspace, actor)) {
    throw new AppError('You cannot reorder boards', 403, { code: 'FORBIDDEN' });
  }

  const updates = items.map((item) =>
    Board.updateOne(
      { _id: item.id, workspace: workspace._id },
      { $set: { position: item.position } }
    )
  );
  await Promise.all(updates);

  return listBoards(actor, workspaceId);
}

async function addBoardMembers(actor, boardId, userIds) {
  const { workspace, board } = await resolveFromBoard(boardId);

  if (!canManageBoardMembers(workspace, actor)) {
    throw new AppError('You cannot manage board members', 403, { code: 'FORBIDDEN' });
  }

  const ids = uniqueObjectIds(userIds);
  const users = await User.find({ _id: { $in: ids } }).select('role status name');
  if (users.length !== ids.length) {
    throw new AppError('One or more users not found', 404, { code: 'USER_NOT_FOUND' });
  }

  for (const user of users) {
    if (user.status !== 'active') {
      throw new AppError('Only active users can be added to a board', 400, {
        code: 'USER_INACTIVE',
      });
    }
    if (user.role !== 'member' && user.role !== 'manager') {
      throw new AppError('Only members and managers can be added to a board', 400, {
        code: 'INVALID_BOARD_MEMBER',
      });
    }
  }

  const existingIds = new Set(
    (board.members || []).map((m) => (m.user?._id || m.user).toString())
  );
  const added = [];

  for (const user of users) {
    const uid = user._id.toString();
    if (existingIds.has(uid)) continue;
    board.members.push({
      user: user._id,
      addedBy: actor._id,
      addedAt: new Date(),
    });
    added.push(user);
  }

  await board.save();

  if (added.length) {
    await notifyUsers(
      added.map((u) => u._id),
      {
        type: 'board_invite',
        sourceType: 'board',
        sourceId: board._id,
        title: `Added to board "${board.name}"`,
        body: `${actor.name} added you to "${board.name}".`,
      }
    );
  }

  return populateBoard(board._id);
}

async function removeBoardMember(actor, boardId, userId) {
  const { workspace, board } = await resolveFromBoard(boardId);

  if (!canManageBoardMembers(workspace, actor)) {
    throw new AppError('You cannot manage board members', 403, { code: 'FORBIDDEN' });
  }

  if (!mongoose.Types.ObjectId.isValid(userId)) {
    throw new AppError('Invalid user id', 400, { code: 'INVALID_ID' });
  }

  if (!isBoardMember(board, userId)) {
    throw new AppError('User is not a board member', 404, { code: 'MEMBER_NOT_FOUND' });
  }

  board.members = board.members.filter((m) => {
    const id = m.user?._id || m.user;
    return id.toString() !== userId.toString();
  });
  await board.save();

  return populateBoard(board._id);
}

module.exports = {
  listBoards,
  createBoard,
  getBoardById,
  getBoardKanban,
  updateBoard,
  deleteBoard,
  requestDeleteBoard,
  listDeleteRequests,
  approveDeleteRequest,
  rejectDeleteRequest,
  reorderBoards,
  addBoardMembers,
  removeBoardMember,
};
