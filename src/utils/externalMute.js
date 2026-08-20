/**
 * Testing-stage mute for Resend + Cloudinary.
 * Enabled when MUTE_EXTERNAL=true, or when credentials are missing.
 */

function envFlag(name) {
  const v = process.env[name];
  return v === 'true' || v === '1' || v === 'yes';
}

function isExternalMuted() {
  return envFlag('MUTE_EXTERNAL');
}

function isResendMuted() {
  if (isExternalMuted()) return true;
  return !process.env.RESEND_API_KEY?.trim();
}

function isCloudinaryMuted() {
  if (isExternalMuted()) return true;
  const { CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, CLOUDINARY_API_SECRET } = process.env;
  return !(
    CLOUDINARY_CLOUD_NAME?.trim() &&
    CLOUDINARY_API_KEY?.trim() &&
    CLOUDINARY_API_SECRET?.trim()
  );
}

module.exports = {
  isExternalMuted,
  isResendMuted,
  isCloudinaryMuted,
};
