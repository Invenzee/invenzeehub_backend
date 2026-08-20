const mongoose = require('mongoose');
const { User } = require('../models');
const AppError = require('../utils/AppError');
const { canManageRole, isAdminRole, USER_ROLES } = require('../constants/roles');
const { toPublicUser } = require('./authService');
const { uploadUserAvatar, destroyImage } = require('./cloudinaryService');

function ensureObjectId(id) {
  if (!mongoose.Types.ObjectId.isValid(id)) {
    throw new AppError('Invalid user id', 400, { code: 'INVALID_ID' });
  }
}

async function getUserById(id, viewer = null) {
  ensureObjectId(id);
  const user = await User.findById(id);
  if (!user) {
    throw new AppError('User not found', 404, { code: 'USER_NOT_FOUND' });
  }

  const isSelf = viewer && viewer._id.toString() === id;
  const admin = viewer && isAdminRole(viewer.role);

  if (isSelf || admin) {
    return toPublicUser(user);
  }

  if (user.status !== 'active') {
    throw new AppError('User not found', 404, { code: 'USER_NOT_FOUND' });
  }

  return {
    _id: user._id,
    name: user.name,
    email: user.email,
    avatarUrl: user.avatarUrl,
    role: user.role,
    department: user.department,
  };
}

async function listUsers(query = {}) {
  const {
    page = 1,
    limit = 20,
    role,
    status,
    department,
    search,
    sort = '-createdAt',
  } = query;

  const pageNum = Math.max(1, Number(page) || 1);
  const limitNum = Math.min(100, Math.max(1, Number(limit) || 20));
  const filter = {};

  if (role) filter.role = role;
  if (status) filter.status = status;
  if (department) filter.department = department;

  if (search) {
    const safe = String(search).trim().slice(0, 100);
    filter.$or = [
      { name: { $regex: safe, $options: 'i' } },
      { email: { $regex: safe, $options: 'i' } },
    ];
  }

  const [users, total] = await Promise.all([
    User.find(filter)
      .select('-refreshTokenHash')
      .sort(sort)
      .skip((pageNum - 1) * limitNum)
      .limit(limitNum)
      .lean(),
    User.countDocuments(filter),
  ]);

  return {
    users,
    meta: {
      page: pageNum,
      limit: limitNum,
      total,
      totalPages: Math.ceil(total / limitNum) || 1,
    },
  };
}

/** Staff directory for any authenticated user. */
async function listDirectory() {
  return User.find({
    status: 'active',
    role: { $in: ['super_admin', 'admin', 'manager', 'member'] },
  })
    .select('name email avatarUrl role department status')
    .sort('name')
    .lean();
}

/**
 * Invite / create a user (closed signup).
 * - Without password: status=invited (OTP set-password flow)
 * - With password: status=active and can log in immediately
 */
async function inviteUser(actor, payload) {
  const { hashPassword } = require('../utils/password');
  const email = String(payload.email).toLowerCase().trim();

  const existing = await User.findOne({ email });
  if (existing) {
    throw new AppError('A user with this email already exists', 409, { code: 'EMAIL_EXISTS' });
  }

  const role = payload.role || 'member';
  const INVITE_ROLES = ['admin', 'manager', 'member'];
  if (!INVITE_ROLES.includes(role)) {
    throw new AppError('Invite role must be admin, manager, or member', 400, {
      code: 'INVALID_ROLE',
    });
  }
  if (!canManageRole(actor.role, role)) {
    throw new AppError('You cannot invite a user with this role', 403, { code: 'FORBIDDEN' });
  }

  const password =
    typeof payload.password === 'string' && payload.password.trim()
      ? payload.password
      : null;

  const createPayload = {
    name: payload.name.trim(),
    email,
    role,
    department: payload.department || 'other',
    status: password ? 'active' : 'invited',
    accessExpiresAt: payload.accessExpiresAt || null,
  };

  if (password) {
    createPayload.passwordHash = await hashPassword(password);
    createPayload.passwordSetAt = new Date();
  }

  const user = await User.create(createPayload);

  return toPublicUser(user);
}

/**
 * Bootstrap the first super_admin when the database has zero users.
 */
async function bootstrapSuperAdmin({ name, email, secret }) {
  const expected = process.env.BOOTSTRAP_SECRET;
  if (!expected) {
    throw new AppError('BOOTSTRAP_SECRET is not configured', 500, { code: 'CONFIG_ERROR' });
  }
  if (secret !== expected) {
    throw new AppError('Invalid bootstrap secret', 403, { code: 'FORBIDDEN' });
  }

  const count = await User.countDocuments();
  if (count > 0) {
    throw new AppError('Bootstrap is only allowed when no users exist', 409, {
      code: 'BOOTSTRAP_CLOSED',
    });
  }

  const user = await User.create({
    name: name.trim(),
    email: String(email).toLowerCase().trim(),
    role: 'super_admin',
    department: 'other',
    status: 'invited',
  });

  return toPublicUser(user);
}

async function updateOwnProfile(userId, payload) {
  ensureObjectId(userId);
  const user = await User.findById(userId);
  if (!user) throw new AppError('User not found', 404, { code: 'USER_NOT_FOUND' });

  if (payload.role !== undefined || payload.department !== undefined || payload.status !== undefined) {
    throw new AppError('You cannot change your own role, department, or status', 403, {
      code: 'FORBIDDEN',
    });
  }

  if (payload.name !== undefined) user.name = payload.name.trim();
  if (payload.notificationPrefs !== undefined) {
    user.notificationPrefs = {
      ...user.notificationPrefs?.toObject?.() || user.notificationPrefs || {},
      ...payload.notificationPrefs,
    };
  }
  if (payload.uiPrefs !== undefined) {
    const current = user.uiPrefs?.toObject?.() || user.uiPrefs || {};
    user.uiPrefs = {
      ...current,
      ...payload.uiPrefs,
    };
  }

  await user.save();
  return toPublicUser(user);
}

async function updateUserByAdmin(actor, targetId, payload) {
  ensureObjectId(targetId);
  const user = await User.findById(targetId);
  if (!user) throw new AppError('User not found', 404, { code: 'USER_NOT_FOUND' });

  if (!canManageRole(actor.role, user.role)) {
    throw new AppError('You cannot manage this user', 403, { code: 'FORBIDDEN' });
  }

  const isSelf = actor._id.toString() === user._id.toString();
  if (isSelf && (payload.role !== undefined || payload.department !== undefined || payload.status !== undefined)) {
    throw new AppError('You cannot change your own role, department, or status', 403, {
      code: 'FORBIDDEN',
    });
  }

  if (payload.role !== undefined) {
    if (!USER_ROLES.includes(payload.role)) {
      throw new AppError('Invalid role', 400, { code: 'INVALID_ROLE' });
    }
    if (!canManageRole(actor.role, payload.role)) {
      throw new AppError('You cannot assign this role', 403, { code: 'FORBIDDEN' });
    }
    // Prevent demoting yourself out of the only super_admin accidentally via role change checks in controller if needed
    user.role = payload.role;
  }

  if (payload.name !== undefined) user.name = payload.name.trim();
  if (payload.department !== undefined) user.department = payload.department;
  if (payload.status !== undefined) {
    user.status = payload.status;
    if (payload.status === 'disabled') {
      user.refreshTokenHash = null;
    }
  }
  if (payload.accessExpiresAt !== undefined) {
    user.accessExpiresAt = payload.accessExpiresAt ? new Date(payload.accessExpiresAt) : null;
  }
  if (payload.notificationPrefs !== undefined) {
    user.notificationPrefs = {
      ...user.notificationPrefs?.toObject?.() || user.notificationPrefs || {},
      ...payload.notificationPrefs,
    };
  }

  await user.save();
  return toPublicUser(user);
}

async function setUserStatus(actor, targetId, status) {
  return updateUserByAdmin(actor, targetId, { status });
}

async function updateAvatar(userId, file) {
  ensureObjectId(userId);
  const user = await User.findById(userId);
  if (!user) throw new AppError('User not found', 404, { code: 'USER_NOT_FOUND' });

  const previousPublicId = user.avatarPublicId;
  const uploaded = await uploadUserAvatar(file, userId.toString());

  user.avatarUrl = uploaded.url;
  user.avatarPublicId = uploaded.publicId;
  await user.save();

  if (previousPublicId && previousPublicId !== uploaded.publicId) {
    await destroyImage(previousPublicId);
  }

  return toPublicUser(user);
}

async function removeAvatar(userId) {
  ensureObjectId(userId);
  const user = await User.findById(userId);
  if (!user) throw new AppError('User not found', 404, { code: 'USER_NOT_FOUND' });

  if (user.avatarPublicId) {
    await destroyImage(user.avatarPublicId);
  }

  user.avatarUrl = null;
  user.avatarPublicId = null;
  await user.save();
  return toPublicUser(user);
}

/**
 * Soft-delete: disable account and clear sessions. Hard delete only for admins on non-self.
 */
async function deleteUser(actor, targetId, { hard = false } = {}) {
  ensureObjectId(targetId);

  if (actor._id.toString() === targetId) {
    throw new AppError('You cannot delete your own account', 400, { code: 'SELF_DELETE' });
  }

  const user = await User.findById(targetId);
  if (!user) throw new AppError('User not found', 404, { code: 'USER_NOT_FOUND' });

  if (!canManageRole(actor.role, user.role)) {
    throw new AppError('You cannot delete this user', 403, { code: 'FORBIDDEN' });
  }

  if (hard) {
    if (!isAdminRole(actor.role)) {
      throw new AppError('Admin access required to hard-delete users', 403, {
        code: 'FORBIDDEN',
      });
    }
    if (user.avatarPublicId) await destroyImage(user.avatarPublicId);
    await user.deleteOne();
    return { deleted: true, hard: true, id: targetId };
  }

  user.status = 'disabled';
  user.refreshTokenHash = null;
  await user.save();
  return toPublicUser(user);
}

function assertAdmin(actor) {
  if (!isAdminRole(actor.role)) {
    throw new AppError('Admin access required', 403, { code: 'FORBIDDEN' });
  }
}

module.exports = {
  getUserById,
  listUsers,
  listDirectory,
  inviteUser,
  bootstrapSuperAdmin,
  updateOwnProfile,
  updateUserByAdmin,
  setUserStatus,
  updateAvatar,
  removeAvatar,
  deleteUser,
  assertAdmin,
  toPublicUser,
};
