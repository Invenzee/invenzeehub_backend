const bcrypt = require('bcryptjs');
const AppError = require('./AppError');

const SALT_ROUNDS = 12;
const MIN_LENGTH = 8;

function validatePassword(password) {
  if (typeof password !== 'string' || password.length < MIN_LENGTH) {
    throw new AppError(`Password must be at least ${MIN_LENGTH} characters`, 422, {
      code: 'WEAK_PASSWORD',
    });
  }

  if (!/[a-zA-Z]/.test(password) || !/\d/.test(password)) {
    throw new AppError('Password must include at least one letter and one number', 422, {
      code: 'WEAK_PASSWORD',
    });
  }
}

function assertPasswordsMatch(password, confirmPassword) {
  if (password !== confirmPassword) {
    throw new AppError('Passwords do not match', 422, { code: 'PASSWORD_MISMATCH' });
  }
}

async function hashPassword(plain) {
  validatePassword(plain);
  return bcrypt.hash(plain, SALT_ROUNDS);
}

async function comparePassword(plain, hash) {
  if (!plain || !hash) return false;
  return bcrypt.compare(plain, hash);
}

module.exports = {
  validatePassword,
  assertPasswordsMatch,
  hashPassword,
  comparePassword,
  MIN_LENGTH,
};
