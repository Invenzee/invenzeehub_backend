const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const AppError = require('./AppError');

function getAccessSecret() {
  const secret = process.env.JWT_ACCESS_SECRET;
  if (!secret) {
    throw new AppError('JWT_ACCESS_SECRET is not configured', 500, { code: 'CONFIG_ERROR' });
  }
  return secret;
}

function getRefreshSecret() {
  const secret = process.env.JWT_REFRESH_SECRET;
  if (!secret) {
    throw new AppError('JWT_REFRESH_SECRET is not configured', 500, { code: 'CONFIG_ERROR' });
  }
  return secret;
}

function signAccessToken(user) {
  return jwt.sign(
    {
      sub: user._id.toString(),
      role: user.role,
      email: user.email,
      type: 'access',
    },
    getAccessSecret(),
    {
      expiresIn: process.env.JWT_ACCESS_EXPIRES_IN || '7d',
      issuer: 'invenzeehub',
    }
  );
}

function signRefreshToken(user) {
  const jti = crypto.randomBytes(16).toString('hex');
  const token = jwt.sign(
    {
      sub: user._id.toString(),
      type: 'refresh',
      jti,
    },
    getRefreshSecret(),
    {
      expiresIn: process.env.JWT_REFRESH_EXPIRES_IN || '7d',
      issuer: 'invenzeehub',
    }
  );
  return { token, jti };
}

function verifyAccessToken(token) {
  try {
    const payload = jwt.verify(token, getAccessSecret(), { issuer: 'invenzeehub' });
    if (payload.type !== 'access') {
      throw new AppError('Invalid access token', 401, { code: 'INVALID_TOKEN' });
    }
    return payload;
  } catch (err) {
    if (err instanceof AppError) throw err;
    throw new AppError('Invalid or expired access token', 401, { code: 'INVALID_TOKEN' });
  }
}

function verifyRefreshToken(token) {
  try {
    const payload = jwt.verify(token, getRefreshSecret(), { issuer: 'invenzeehub' });
    if (payload.type !== 'refresh') {
      throw new AppError('Invalid refresh token', 401, { code: 'INVALID_TOKEN' });
    }
    return payload;
  } catch (err) {
    if (err instanceof AppError) throw err;
    throw new AppError('Invalid or expired refresh token', 401, { code: 'INVALID_TOKEN' });
  }
}

async function hashToken(raw) {
  return bcrypt.hash(raw, 10);
}

async function compareTokenHash(raw, hash) {
  if (!raw || !hash) return false;
  return bcrypt.compare(raw, hash);
}

module.exports = {
  signAccessToken,
  signRefreshToken,
  verifyAccessToken,
  verifyRefreshToken,
  hashToken,
  compareTokenHash,
};
