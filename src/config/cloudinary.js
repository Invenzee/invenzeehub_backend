const { v2: cloudinary } = require('cloudinary');
const { isCloudinaryMuted } = require('../utils/externalMute');

let configured = false;

function isCloudinaryConfigured() {
  if (isCloudinaryMuted()) return false;
  const { CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, CLOUDINARY_API_SECRET } = process.env;
  return Boolean(
    CLOUDINARY_CLOUD_NAME?.trim() &&
      CLOUDINARY_API_KEY?.trim() &&
      CLOUDINARY_API_SECRET?.trim()
  );
}

function configureCloudinary() {
  if (configured) return cloudinary;
  if (!isCloudinaryConfigured()) return null;

  const { CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, CLOUDINARY_API_SECRET } = process.env;

  cloudinary.config({
    cloud_name: CLOUDINARY_CLOUD_NAME,
    api_key: CLOUDINARY_API_KEY,
    api_secret: CLOUDINARY_API_SECRET,
    secure: true,
  });

  configured = true;
  return cloudinary;
}

function getCloudinary() {
  const client = configureCloudinary();
  if (!client) {
    const err = new Error(
      'Cloudinary is not configured. Set CLOUDINARY_* or leave MUTE_EXTERNAL=true for testing.'
    );
    err.code = 'CLOUDINARY_NOT_CONFIGURED';
    throw err;
  }
  return client;
}

module.exports = { configureCloudinary, getCloudinary, isCloudinaryConfigured };
