const mongoose = require('mongoose');
const { Workspace, User, Board } = require('../models');
const AppError = require('../utils/AppError');
const { isAdminRole } = require('../constants/roles');
const {
  canAccessWorkspace,
  canManageWorkspace,
  canManageWorkspacePeople,
  canCreateWorkspace,
  canDeleteWorkspace,
  canSetWorkspaceStatus,
  canAssignWorkspaceOwners,
  isWorkspaceOwner,
  canBeWorkspaceOwner,
  canBeWorkspaceMember,
  canManagerAssignAsWorkspaceMember,
} = require('../utils/workspaceAccess');

const POPULATE_FIELDS = [
  { path: 'createdBy', select: 'name email avatarUrl role department' },
  { path: 'owners', select: 'name email avatarUrl role department' },
  { path: 'members', select: 'name email avatarUrl role department' },
];

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

async function memberHasBoardInWorkspace(userId, workspaceId) {
  const count = await Board.countDocuments({
    workspace: workspaceId,
    'members.user': userId,
  });
  return count > 0;
}

async function assertWorkspaceAccess(workspace, user) {
  if (canAccessWorkspace(workspace, user)) return;

  if (user.role === 'member' && (await memberHasBoardInWorkspace(user._id, workspace._id))) {
    return;
  }

  throw new AppError('You do not have access to this workspace', 403, { code: 'FORBIDDEN' });
}

async function assertWorkspaceManage(workspace, user) {
  if (!canManageWorkspace(workspace, user)) {
    throw new AppError('You cannot manage this workspace', 403, { code: 'FORBIDDEN' });
  }
}

async function assertWorkspacePeopleManage(workspace, user) {
  if (!canManageWorkspacePeople(workspace, user)) {
    throw new AppError('You cannot manage people on this workspace', 403, {
      code: 'FORBIDDEN',
    });
  }
}

/** Workspace members must be active managers or members. */
async function assertStaffUserIds(userIds, { membersOnly = false } = {}) {
  const users = await User.find({ _id: { $in: userIds } }).select('role status');
  if (users.length !== userIds.length) {
    throw new AppError('One or more users not found', 404, { code: 'USER_NOT_FOUND' });
  }

  for (const user of users) {
    if (membersOnly) {
      if (!canManagerAssignAsWorkspaceMember(user)) {
        throw new AppError('Managers can only add members to a workspace', 400, {
          code: 'INVALID_WORKSPACE_MEMBER',
        });
      }
      continue;
    }
    if (!canBeWorkspaceMember(user)) {
      throw new AppError('Only active managers and members can be workspace members', 400, {
        code: 'INVALID_WORKSPACE_MEMBER',
      });
    }
  }
}

async function assertWorkspaceOwnerUserIds(userIds) {
  const users = await User.find({ _id: { $in: userIds } }).select('role status');
  if (users.length !== userIds.length) {
    throw new AppError('One or more users not found', 404, { code: 'USER_NOT_FOUND' });
  }

  for (const user of users) {
    if (!canBeWorkspaceOwner(user)) {
      throw new AppError('Only active admins can be workspace owners', 400, {
        code: 'INVALID_WORKSPACE_OWNER',
      });
    }
  }
}

function uniqueObjectIds(ids) {
  return [...new Set(ids.map((id) => id.toString()))].map((id) => new mongoose.Types.ObjectId(id));
}

async function createWorkspace(actor, payload) {
  if (!canCreateWorkspace(actor)) {
    throw new AppError('Only admins can create workspaces', 403, { code: 'FORBIDDEN' });
  }

  let ownerIds = uniqueObjectIds(payload.ownerIds || []);
  if (ownerIds.length === 0) {
    if (!isAdminRole(actor.role)) {
      throw new AppError('At least one workspace owner is required', 400, {
        code: 'OWNERS_REQUIRED',
      });
    }
    ownerIds = [actor._id];
  }

  await assertWorkspaceOwnerUserIds(ownerIds);

  const memberIds = uniqueObjectIds(payload.memberIds || []);
  if (memberIds.length) {
    await assertStaffUserIds(memberIds);
  }

  const workspace = await Workspace.create({
    name: payload.name.trim(),
    description: payload.description?.trim() || '',
    status: 'active',
    owners: ownerIds,
    members: uniqueObjectIds([...memberIds]),
    createdBy: actor._id,
  });

  return Workspace.findById(workspace._id).populate(POPULATE_FIELDS).lean();
}

async function listWorkspaces(actor, query = {}) {
  const { page = 1, limit = 20, search, sort = '-createdAt' } = query;
  const pageNum = Math.max(1, Number(page) || 1);
  const limitNum = Math.min(100, Math.max(1, Number(limit) || 20));

  const filter = {};

  if (isAdminRole(actor.role)) {
    // admins see all
  } else if (actor.role === 'manager') {
    filter.$or = [{ owners: actor._id }, { members: actor._id }];
  } else if (actor.role === 'member') {
    const boardWorkspaceIds = await Board.distinct('workspace', {
      'members.user': actor._id,
    });
    filter.$or = [{ members: actor._id }, { _id: { $in: boardWorkspaceIds } }];
  } else {
    filter._id = { $in: [] };
  }

  if (search) {
    const safe = String(search).trim().slice(0, 100);
    filter.name = { $regex: safe, $options: 'i' };
  }

  const [workspaces, total] = await Promise.all([
    Workspace.find(filter)
      .populate(POPULATE_FIELDS)
      .sort(sort)
      .skip((pageNum - 1) * limitNum)
      .limit(limitNum)
      .lean(),
    Workspace.countDocuments(filter),
  ]);

  return {
    workspaces,
    meta: {
      page: pageNum,
      limit: limitNum,
      total,
      totalPages: Math.ceil(total / limitNum) || 1,
    },
  };
}

async function getWorkspaceById(actor, id) {
  const workspace = await getWorkspaceOrThrow(id);
  await assertWorkspaceAccess(workspace, actor);
  return Workspace.findById(id).populate(POPULATE_FIELDS).lean();
}

async function updateWorkspace(actor, id, payload) {
  const workspace = await getWorkspaceOrThrow(id);
  await assertWorkspaceAccess(workspace, actor);

  if (payload.status !== undefined) {
    if (!canSetWorkspaceStatus(actor)) {
      throw new AppError('Only admins can archive or restore workspaces', 403, { code: 'FORBIDDEN' });
    }
    workspace.status = payload.status;
  }

  const updatesNameOrDescription =
    payload.name !== undefined || payload.description !== undefined;

  if (updatesNameOrDescription) {
    await assertWorkspaceManage(workspace, actor);
    if (payload.name !== undefined) workspace.name = payload.name.trim();
    if (payload.description !== undefined) workspace.description = payload.description.trim();
  }

  await workspace.save();
  return Workspace.findById(id).populate(POPULATE_FIELDS).lean();
}

async function deleteWorkspace(actor, id) {
  if (!canDeleteWorkspace(actor)) {
    throw new AppError('Only admins can delete workspaces', 403, { code: 'FORBIDDEN' });
  }

  const workspace = await getWorkspaceOrThrow(id);
  await workspace.deleteOne();
  return { deleted: true, id };
}

async function addMembers(actor, id, userIds) {
  const workspace = await getWorkspaceOrThrow(id);
  await assertWorkspacePeopleManage(workspace, actor);

  const ids = uniqueObjectIds(userIds);
  const membersOnly = !isAdminRole(actor.role);
  await assertStaffUserIds(ids, { membersOnly });

  workspace.members = uniqueObjectIds([...workspace.members, ...ids]);
  await workspace.save();

  return Workspace.findById(id).populate(POPULATE_FIELDS).lean();
}

async function removeMember(actor, id, userId) {
  const workspace = await getWorkspaceOrThrow(id);
  await assertWorkspacePeopleManage(workspace, actor);
  ensureObjectId(userId, 'user id');

  if (isWorkspaceOwner(workspace, userId)) {
    throw new AppError('Remove owner role before removing them as a member', 400, {
      code: 'OWNER_IS_MEMBER',
    });
  }

  if (!isAdminRole(actor.role)) {
    const target = await User.findById(userId).select('role status');
    if (!target || target.role !== 'member') {
      throw new AppError('Managers can only remove members from a workspace', 403, {
        code: 'FORBIDDEN',
      });
    }
  }

  workspace.members = workspace.members.filter((m) => m.toString() !== userId.toString());
  await workspace.save();

  return Workspace.findById(id).populate(POPULATE_FIELDS).lean();
}

async function addOwners(actor, id, userIds) {
  if (!canAssignWorkspaceOwners(actor)) {
    throw new AppError('Only admins can assign workspace owners', 403, { code: 'FORBIDDEN' });
  }

  const workspace = await getWorkspaceOrThrow(id);
  const ids = uniqueObjectIds(userIds);
  await assertWorkspaceOwnerUserIds(ids);

  workspace.owners = uniqueObjectIds([...workspace.owners, ...ids]);
  await workspace.save();

  return Workspace.findById(id).populate(POPULATE_FIELDS).lean();
}

async function removeOwner(actor, id, userId) {
  if (!canAssignWorkspaceOwners(actor)) {
    throw new AppError('Only admins can change workspace owners', 403, { code: 'FORBIDDEN' });
  }

  const workspace = await getWorkspaceOrThrow(id);
  ensureObjectId(userId, 'user id');

  if (workspace.owners.length <= 1) {
    throw new AppError('Workspace must have at least one owner', 400, {
      code: 'LAST_OWNER',
    });
  }

  workspace.owners = workspace.owners.filter((o) => o.toString() !== userId.toString());
  await workspace.save();

  return Workspace.findById(id).populate(POPULATE_FIELDS).lean();
}

async function leaveWorkspace(actor, id) {
  const workspace = await getWorkspaceOrThrow(id);
  await assertWorkspaceAccess(workspace, actor);

  if (isWorkspaceOwner(workspace, actor._id) && workspace.owners.length <= 1) {
    throw new AppError(
      'Transfer ownership before leaving. Workspace must keep at least one owner.',
      400,
      { code: 'LAST_OWNER' }
    );
  }

  workspace.owners = workspace.owners.filter((o) => o.toString() !== actor._id.toString());
  workspace.members = workspace.members.filter((m) => m.toString() !== actor._id.toString());
  await workspace.save();

  return { left: true, workspaceId: id };
}

module.exports = {
  createWorkspace,
  listWorkspaces,
  getWorkspaceById,
  updateWorkspace,
  deleteWorkspace,
  addMembers,
  removeMember,
  addOwners,
  removeOwner,
  leaveWorkspace,
};
