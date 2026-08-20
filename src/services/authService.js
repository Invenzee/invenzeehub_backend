const { User } = require('../models');
const AppError = require('../utils/AppError');
const {
  signAccessToken,
  signRefreshToken,
  verifyRefreshToken,
  hashToken,
  compareTokenHash,
} = require('../utils/tokens');
const {
  hashPassword,
  comparePassword,
  assertPasswordsMatch,
} = require('../utils/password');
const { generateLoginCode, sendLoginCodeEmail } = require('./emailService');
const { isResendMuted } = require('../utils/externalMute');

const CODE_EXPIRES_MS = () =>
  (Number(process.env.LOGIN_CODE_EXPIRES_MINUTES) || 10) * 60 * 1000;
const CODE_COOLDOWN_MS = () =>
  (Number(process.env.LOGIN_CODE_COOLDOWN_SECONDS) || 60) * 1000;
const CODE_MAX_ATTEMPTS = () => Number(process.env.LOGIN_CODE_MAX_ATTEMPTS) || 5;

const OTP_SELECT =
  '+loginCodeHash +loginCodeExpiresAt +loginCodeAttempts +loginCodeSentAt +loginCodePurpose +passwordHash +refreshTokenHash';

function toPublicUser(user) {
  if (!user) return null;
  const obj = user.toObject ? user.toObject() : { ...user };
  delete obj.refreshTokenHash;
  delete obj.passwordHash;
  delete obj.loginCodeHash;
  delete obj.loginCodeExpiresAt;
  delete obj.loginCodeAttempts;
  delete obj.loginCodeSentAt;
  delete obj.loginCodePurpose;
  delete obj.__v;
  obj.hasPassword = Boolean(user.passwordSetAt);
  return obj;
}

function clearLoginCodeFields(user) {
  user.loginCodeHash = null;
  user.loginCodeExpiresAt = null;
  user.loginCodeAttempts = 0;
  user.loginCodeSentAt = null;
  user.loginCodePurpose = null;
}

async function issueSession(user) {
  const accessToken = signAccessToken(user);
  const { token: refreshToken } = signRefreshToken(user);

  user.refreshTokenHash = await hashToken(refreshToken);
  clearLoginCodeFields(user);
  await user.save();

  return {
    accessToken,
    refreshToken,
    user: toPublicUser(user),
  };
}

function assertUserCanLogin(user) {
  if (!user) {
    throw new AppError(
      'No invite found for this email. Ask an admin to invite you.',
      403,
      { code: 'NOT_INVITED' }
    );
  }

  if (user.status === 'disabled') {
    throw new AppError('Account is disabled', 403, { code: 'ACCOUNT_DISABLED' });
  }

  if (user.accessExpiresAt && user.accessExpiresAt.getTime() < Date.now()) {
    throw new AppError('Access has expired', 403, { code: 'ACCESS_EXPIRED' });
  }
}

async function findUserByEmail(email, select = '') {
  return User.findOne({ email: String(email).toLowerCase().trim() }).select(select);
}

/**
 * Daily login with email + password.
 */
async function loginWithPassword(email, password) {
  const user = await findUserByEmail(email, '+passwordHash');

  if (!user) {
    throw new AppError('Invalid email or password', 401, { code: 'INVALID_CREDENTIALS' });
  }

  assertUserCanLogin(user);

  if (user.status === 'invited') {
    throw new AppError(
      'Account not activated. Use email verification code to sign in and set a password.',
      403,
      { code: 'ACCOUNT_INVITED' }
    );
  }

  if (!user.passwordHash) {
    throw new AppError(
      'Password not set. Sign in with email code first, then set your password.',
      403,
      { code: 'PASSWORD_NOT_SET' }
    );
  }

  const valid = await comparePassword(password, user.passwordHash);
  if (!valid) {
    throw new AppError('Invalid email or password', 401, { code: 'INVALID_CREDENTIALS' });
  }

  return issueSession(user);
}

/**
 * Send OTP for fallback login or password reset.
 * @param {string} email
 * @param {'login' | 'reset'} purpose
 */
async function requestLoginCode(email, purpose = 'login') {
  const normalized = String(email).toLowerCase().trim();
  const user = await findUserByEmail(normalized, OTP_SELECT);

  assertUserCanLogin(user);

  if (purpose === 'reset' && user.status === 'invited') {
    throw new AppError(
      'Activate your account with a login code before resetting password.',
      403,
      { code: 'ACCOUNT_INVITED' }
    );
  }

  if (user.loginCodeSentAt) {
    const elapsed = Date.now() - user.loginCodeSentAt.getTime();
    if (elapsed < CODE_COOLDOWN_MS()) {
      const retryAfterSec = Math.ceil((CODE_COOLDOWN_MS() - elapsed) / 1000);
      throw new AppError(`Please wait ${retryAfterSec}s before requesting another code`, 429, {
        code: 'CODE_COOLDOWN',
        details: { retryAfterSec },
      });
    }
  }

  const code = generateLoginCode(6);
  user.loginCodeHash = await hashToken(code);
  user.loginCodeExpiresAt = new Date(Date.now() + CODE_EXPIRES_MS());
  user.loginCodeAttempts = 0;
  user.loginCodeSentAt = new Date();
  user.loginCodePurpose = purpose;
  await user.save();

  await sendLoginCodeEmail({
    to: user.email,
    name: user.name,
    code,
    purpose,
  });

  const payload = {
    email: user.email,
    purpose,
    expiresInMinutes: Number(process.env.LOGIN_CODE_EXPIRES_MINUTES) || 10,
  };

  if (isResendMuted()) {
    payload.muted = true;
    payload.code = code;
  }

  return payload;
}

async function verifyOtpCode(user, code, expectedPurpose) {
  if (!user.loginCodeHash || !user.loginCodeExpiresAt) {
    throw new AppError('No verification code requested. Request a new code.', 400, {
      code: 'CODE_NOT_REQUESTED',
    });
  }

  if (user.loginCodePurpose !== expectedPurpose) {
    throw new AppError(
      `This code was requested for ${user.loginCodePurpose}, not ${expectedPurpose}. Request a new code.`,
      400,
      { code: 'CODE_PURPOSE_MISMATCH' }
    );
  }

  if (user.loginCodeExpiresAt.getTime() < Date.now()) {
    clearLoginCodeFields(user);
    await user.save();
    throw new AppError('Verification code has expired. Request a new code.', 400, {
      code: 'CODE_EXPIRED',
    });
  }

  if (user.loginCodeAttempts >= CODE_MAX_ATTEMPTS()) {
    clearLoginCodeFields(user);
    await user.save();
    throw new AppError('Too many invalid attempts. Request a new code.', 429, {
      code: 'CODE_LOCKED',
    });
  }

  const valid = await compareTokenHash(String(code).trim(), user.loginCodeHash);
  if (!valid) {
    user.loginCodeAttempts += 1;
    await user.save();
    const remaining = CODE_MAX_ATTEMPTS() - user.loginCodeAttempts;
    throw new AppError('Invalid verification code', 401, {
      code: 'INVALID_CODE',
      details: { attemptsRemaining: Math.max(0, remaining) },
    });
  }

  return true;
}

/**
 * OTP fallback login — activates invited users.
 */
async function verifyLoginCode(email, code) {
  const user = await findUserByEmail(email, OTP_SELECT);
  assertUserCanLogin(user);
  await verifyOtpCode(user, code, 'login');

  if (user.status === 'invited') {
    user.status = 'active';
  }

  const session = await issueSession(user);
  session.user.requiresPasswordSetup = !user.passwordSetAt;
  return session;
}

/**
 * Reset password using OTP (does not require current password).
 */
async function resetPasswordWithCode(email, code, password, confirmPassword) {
  assertPasswordsMatch(password, confirmPassword);

  const user = await findUserByEmail(email, OTP_SELECT);
  assertUserCanLogin(user);
  await verifyOtpCode(user, code, 'reset');

  user.passwordHash = await hashPassword(password);
  user.passwordSetAt = new Date();
  if (user.status === 'invited') {
    user.status = 'active';
  }

  clearLoginCodeFields(user);
  user.refreshTokenHash = null;
  await user.save();

  return issueSession(user);
}

/**
 * First-time password setup after OTP fallback login.
 */
async function setPassword(userId, password, confirmPassword) {
  assertPasswordsMatch(password, confirmPassword);

  const user = await User.findById(userId).select('+passwordHash');
  if (!user) {
    throw new AppError('User not found', 404, { code: 'USER_NOT_FOUND' });
  }

  if (user.passwordSetAt) {
    throw new AppError('Password already set. Use change password instead.', 409, {
      code: 'PASSWORD_ALREADY_SET',
    });
  }

  user.passwordHash = await hashPassword(password);
  user.passwordSetAt = new Date();
  await user.save();

  return toPublicUser(user);
}

/**
 * Change password while logged in.
 */
async function changePassword(userId, currentPassword, newPassword, confirmPassword) {
  assertPasswordsMatch(newPassword, confirmPassword);

  const user = await User.findById(userId).select('+passwordHash +refreshTokenHash');
  if (!user) {
    throw new AppError('User not found', 404, { code: 'USER_NOT_FOUND' });
  }

  if (!user.passwordHash) {
    throw new AppError('Set a password first', 400, { code: 'PASSWORD_NOT_SET' });
  }

  const valid = await comparePassword(currentPassword, user.passwordHash);
  if (!valid) {
    throw new AppError('Current password is incorrect', 401, { code: 'INVALID_PASSWORD' });
  }

  user.passwordHash = await hashPassword(newPassword);
  user.passwordSetAt = new Date();
  await user.save();

  return toPublicUser(user);
}

async function refreshSession(rawRefreshToken) {
  const payload = verifyRefreshToken(rawRefreshToken);
  const user = await User.findById(payload.sub).select('+refreshTokenHash');

  if (!user) {
    throw new AppError('User no longer exists', 401, { code: 'USER_NOT_FOUND' });
  }

  if (user.status !== 'active') {
    throw new AppError('Account is not active', 403, { code: 'ACCOUNT_INACTIVE' });
  }

  const valid = await compareTokenHash(rawRefreshToken, user.refreshTokenHash);
  if (!valid) {
    user.refreshTokenHash = null;
    await user.save();
    throw new AppError('Refresh token revoked or reused', 401, { code: 'TOKEN_REUSE' });
  }

  return issueSession(user);
}

async function logout(userId) {
  await User.findByIdAndUpdate(userId, {
    $set: {
      refreshTokenHash: null,
      loginCodeHash: null,
      loginCodeExpiresAt: null,
      loginCodeAttempts: 0,
      loginCodeSentAt: null,
      loginCodePurpose: null,
    },
  });
}

module.exports = {
  loginWithPassword,
  requestLoginCode,
  verifyLoginCode,
  resetPasswordWithCode,
  setPassword,
  changePassword,
  refreshSession,
  logout,
  toPublicUser,
  issueSession,
};
