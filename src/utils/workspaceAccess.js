const { isAdminRole, isManagerRole } = require('../constants/roles');

function ownerIds(workspace) {
  return (workspace.owners || []).map((id) => id.toString());
}

function memberIds(workspace) {
  return (workspace.members || []).map((id) => id.toString());
}

function isWorkspaceOwner(workspace, userId) {
  return ownerIds(workspace).includes(userId.toString());
}

function isWorkspaceMember(workspace, userId) {
  return memberIds(workspace).includes(userId.toString());
}

function isWorkspaceArchived(workspace) {
  return workspace?.status === 'archived';
}

/**
 * Admins always.
 * Managers / members only if listed on the workspace (or manager as owner).
 * Board content for members still requires Board.members.
 */
function canAccessWorkspace(workspace, user) {
  if (!workspace || !user) return false;
  if (isAdminRole(user.role)) return true;
  if (isManagerRole(user.role)) {
    return isWorkspaceMember(workspace, user._id) || isWorkspaceOwner(workspace, user._id);
  }
  if (user.role === 'member') {
    return isWorkspaceMember(workspace, user._id);
  }
  return false;
}

/** Create workspace — org admins only. */
function canCreateWorkspace(user) {
  return user && isAdminRole(user.role);
}

/** Hard-delete workspace — org admins only. */
function canDeleteWorkspace(user) {
  return user && isAdminRole(user.role);
}

/** Archive / restore workspace — org admins only. */
function canSetWorkspaceStatus(user) {
  return user && isAdminRole(user.role);
}

/** Assign or remove workspace owners — org admins only. */
function canAssignWorkspaceOwners(user) {
  return user && isAdminRole(user.role);
}

/** Edit name/description — org admins only. */
function canManageWorkspace(workspace, user) {
  if (!workspace || !user) return false;
  if (!isAdminRole(user.role)) return false;
  if (isWorkspaceArchived(workspace) && !isAdminRole(user.role)) return false;
  return true;
}

/**
 * Add/remove workspace people:
 * - admins: managers and members
 * - managers on the workspace: members only
 */
function canManageWorkspacePeople(workspace, user) {
  if (!workspace || !user) return false;
  if (isWorkspaceArchived(workspace) && !isAdminRole(user.role)) return false;
  if (isAdminRole(user.role)) return true;
  if (isManagerRole(user.role)) {
    return isWorkspaceMember(workspace, user._id) || isWorkspaceOwner(workspace, user._id);
  }
  return false;
}

/** Active managers and members may be workspace members; admins may be owners. */
function canBeWorkspaceMember(user) {
  if (!user || user.status !== 'active') return false;
  return isManagerRole(user.role) || user.role === 'member';
}

/** Role a manager is allowed to add/remove on a workspace. */
function canManagerAssignAsWorkspaceMember(user) {
  return user && user.status === 'active' && user.role === 'member';
}

function canBeWorkspaceOwner(user) {
  return user && user.status === 'active' && isAdminRole(user.role);
}

module.exports = {
  isWorkspaceOwner,
  isWorkspaceMember,
  isWorkspaceArchived,
  canAccessWorkspace,
  canCreateWorkspace,
  canDeleteWorkspace,
  canSetWorkspaceStatus,
  canAssignWorkspaceOwners,
  canManageWorkspace,
  canManageWorkspacePeople,
  canBeWorkspaceMember,
  canManagerAssignAsWorkspaceMember,
  canBeWorkspaceOwner,
};
