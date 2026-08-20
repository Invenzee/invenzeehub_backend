const USER_ROLES = Object.freeze([
  'super_admin',
  'admin',
  'manager',
  'member',
]);

const USER_DEPARTMENTS = Object.freeze([
  'dev',
  'design',
  'video',
  'marketing',
  'leadgen',
  'sales',
  'coldcall',
  'other',
]);

const USER_STATUSES = Object.freeze(['active', 'invited', 'disabled']);

/** Roles that can manage other users (invite, list, update role/status). */
const ADMIN_ROLES = Object.freeze(['super_admin', 'admin']);

/** Roles that may be added as workspace members (managers run boards; members are rostered). */
const WORKSPACE_MEMBER_ROLES = Object.freeze(['manager', 'member']);

const ROLE_RANK = Object.freeze({
  super_admin: 100,
  admin: 80,
  manager: 50,
  member: 40,
});

function isAdminRole(role) {
  return ADMIN_ROLES.includes(role);
}

function isManagerRole(role) {
  return role === 'manager';
}

function canManageRole(actorRole, targetRole) {
  if (actorRole === 'super_admin') return true;
  if (actorRole === 'admin') {
    return targetRole !== 'super_admin';
  }
  return false;
}

module.exports = {
  USER_ROLES,
  USER_DEPARTMENTS,
  USER_STATUSES,
  ADMIN_ROLES,
  WORKSPACE_MEMBER_ROLES,
  ROLE_RANK,
  isAdminRole,
  isManagerRole,
  canManageRole,
};
