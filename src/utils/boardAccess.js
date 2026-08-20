const { isAdminRole, isManagerRole } = require('../constants/roles');
const {
  canAccessWorkspace,
  isWorkspaceArchived,
  isWorkspaceMember,
} = require('./workspaceAccess');

function getBoardMember(board, userId) {
  if (!board?.members) return null;
  return board.members.find((m) => {
    const id = m.user?._id || m.user;
    return id.toString() === userId.toString();
  });
}

function isBoardMember(board, userId) {
  return Boolean(getBoardMember(board, userId));
}

/** View boards list in a workspace (admins + workspace managers). */
function canListWorkspaceBoards(workspace, user) {
  return canAccessWorkspace(workspace, user);
}

/**
 * View a board:
 * - admin: yes
 * - manager in workspace: yes
 * - member: only if on board.members
 */
function canViewBoard(workspace, board, user) {
  if (!workspace || !board || !user) return false;
  if (isAdminRole(user.role)) return true;
  if (isManagerRole(user.role) && canAccessWorkspace(workspace, user)) return true;
  if (user.role === 'member') return isBoardMember(board, user._id);
  return false;
}

/** Create / rename / reorder boards — workspace managers + admins. */
function canManageBoards(workspace, user) {
  if (!workspace || !user) return false;
  if (isWorkspaceArchived(workspace) && !isAdminRole(user.role)) return false;
  if (isAdminRole(user.role)) return true;
  return isManagerRole(user.role) && canAccessWorkspace(workspace, user);
}

/** Invite/remove board members — managers of the workspace + admins. */
function canManageBoardMembers(workspace, user) {
  return canManageBoards(workspace, user);
}

/**
 * Delete board immediately:
 * - admin: always
 * - manager: only when board has zero cards (caller enforces card count)
 */
function canDeleteBoardDirectly(workspace, user) {
  return canManageBoards(workspace, user);
}

/** Request delete when board has cards — managers only (admins just delete). */
function canRequestBoardDelete(workspace, user) {
  if (!workspace || !user) return false;
  if (isAdminRole(user.role)) return false;
  return isManagerRole(user.role) && canAccessWorkspace(workspace, user);
}

/** Approve/reject delete requests — admins only. */
function canReviewBoardDelete(user) {
  return user && isAdminRole(user.role);
}

/** Lists + cards CRUD on a board. */
function canEditBoardContent(workspace, board, user) {
  if (!canViewBoard(workspace, board, user)) return false;
  if (isWorkspaceArchived(workspace) && !isAdminRole(user.role)) return false;
  if (isAdminRole(user.role)) return true;
  if (isManagerRole(user.role) && canAccessWorkspace(workspace, user)) return true;
  if (user.role === 'member') return isBoardMember(board, user._id);
  return false;
}

function canCommentOnCards(workspace, board, user) {
  return canEditBoardContent(workspace, board, user);
}

module.exports = {
  getBoardMember,
  isBoardMember,
  canListWorkspaceBoards,
  canViewBoard,
  canManageBoards,
  canManageBoardMembers,
  canDeleteBoardDirectly,
  canRequestBoardDelete,
  canReviewBoardDelete,
  canEditBoardContent,
  canCommentOnCards,
  // aliases used while migrating services
  canViewKanban: canViewBoard,
  canManageBoardStructure: canManageBoards,
  canEditCards: canEditBoardContent,
};
