const { Readable } = require('stream');
const { getCloudinary, isCloudinaryConfigured } = require('../config/cloudinary');
const AppError = require('../utils/AppError');
const { isCloudinaryMuted } = require('../utils/externalMute');

const AVATAR_FOLDER = process.env.CLOUDINARY_AVATAR_FOLDER || 'invenzeehub/avatars';
const CARD_FILES_FOLDER = process.env.CLOUDINARY_CARD_FOLDER || 'invenzeehub/cards';
const CHAT_FILES_FOLDER = process.env.CLOUDINARY_CHAT_FOLDER || 'invenzeehub/chat';

/**
 * Upload a user avatar buffer to Cloudinary (or mock URL when muted).
 * @param {{ buffer: Buffer, mimetype: string }} file
 * @param {string} userId
 */
async function uploadUserAvatar(file, userId) {
  if (!file?.buffer) {
    throw new AppError('Avatar file is required', 400, { code: 'FILE_REQUIRED' });
  }

  if (isCloudinaryMuted() || !isCloudinaryConfigured()) {
    const publicId = `muted/user_${userId}`;
    const url = `https://placehold.co/512x512/png?text=${encodeURIComponent(userId.slice(-4))}`;
    console.warn(`[MUTE_EXTERNAL] Cloudinary muted — using placeholder avatar for user ${userId}`);
    return { url, publicId, muted: true };
  }

  const cloudinary = getCloudinary();

  try {
    const result = await new Promise((resolve, reject) => {
      const upload = cloudinary.uploader.upload_stream(
        {
          folder: AVATAR_FOLDER,
          public_id: `user_${userId}`,
          overwrite: true,
          resource_type: 'image',
          transformation: [
            { width: 512, height: 512, crop: 'fill', gravity: 'face' },
            { quality: 'auto', fetch_format: 'auto' },
          ],
        },
        (error, uploaded) => {
          if (error) reject(error);
          else resolve(uploaded);
        }
      );

      Readable.from(file.buffer).pipe(upload);
    });

    return {
      url: result.secure_url,
      publicId: result.public_id,
      muted: false,
    };
  } catch (err) {
    if (err instanceof AppError) throw err;
    throw new AppError('Failed to upload avatar', 502, {
      code: 'CLOUDINARY_UPLOAD_FAILED',
      details: process.env.NODE_ENV !== 'production' ? err.message : undefined,
    });
  }
}

async function destroyImage(publicId, resourceType = 'image') {
  if (!publicId) return;
  if (publicId.startsWith('muted/')) return;
  if (isCloudinaryMuted() || !isCloudinaryConfigured()) return;

  try {
    const cloudinary = getCloudinary();
    await cloudinary.uploader.destroy(publicId, { resource_type: resourceType });
  } catch {
    // Best-effort cleanup
  }
}

/**
 * Upload card attachment (image or raw file) to Cloudinary.
 */
async function uploadCardFile(file, cardId, userId) {
  if (!file?.buffer) {
    throw new AppError('File is required', 400, { code: 'FILE_REQUIRED' });
  }

  const isImage = file.mimetype?.startsWith('image/');
  const muted = isCloudinaryMuted() || !isCloudinaryConfigured();

  if (muted) {
    const url = isImage
      ? `https://placehold.co/600x400/png?text=Card`
      : `https://placehold.co/120x120/png?text=FILE`;
    console.warn(`[MUTE_EXTERNAL] Cloudinary muted — placeholder attachment for card ${cardId}`);
    return {
      url,
      publicId: `muted/card_${cardId}_${Date.now()}`,
      muted: true,
      resourceType: isImage ? 'image' : 'raw',
    };
  }

  const cloudinary = getCloudinary();
  const resourceType = isImage ? 'image' : 'raw';

  try {
    const result = await new Promise((resolve, reject) => {
      const upload = cloudinary.uploader.upload_stream(
        {
          folder: `${CARD_FILES_FOLDER}/${cardId}`,
          resource_type: resourceType,
          public_id: `${userId}_${Date.now()}`,
        },
        (error, uploaded) => {
          if (error) reject(error);
          else resolve(uploaded);
        }
      );

      Readable.from(file.buffer).pipe(upload);
    });

    return {
      url: result.secure_url,
      publicId: result.public_id,
      muted: false,
      resourceType,
      bytes: result.bytes,
    };
  } catch (err) {
    if (err instanceof AppError) throw err;
    throw new AppError('Failed to upload file', 502, {
      code: 'CLOUDINARY_UPLOAD_FAILED',
      details: process.env.NODE_ENV !== 'production' ? err.message : undefined,
    });
  }
}

/**
 * Upload chat attachment (image, raw, audio, or video) to Cloudinary.
 */
async function uploadChatFile(file, channelId, userId) {
  if (!file?.buffer) {
    throw new AppError('File is required', 400, { code: 'FILE_REQUIRED' });
  }

  const mime = file.mimetype || '';
  const isImage = mime.startsWith('image/');
  const isVideoOrAudio = mime.startsWith('video/') || mime.startsWith('audio/');
  const resourceType = isImage ? 'image' : isVideoOrAudio ? 'video' : 'raw';
  const muted = isCloudinaryMuted() || !isCloudinaryConfigured();

  if (muted) {
    let url = `https://placehold.co/120x120/png?text=FILE`;
    if (isImage) url = `https://placehold.co/600x400/png?text=Chat`;
    else if (mime.startsWith('video/')) url = `https://placehold.co/640x360/png?text=Video`;
    else if (mime.startsWith('audio/')) url = `https://placehold.co/320x80/png?text=Audio`;
    console.warn(`[MUTE_EXTERNAL] Cloudinary muted — placeholder attachment for channel ${channelId}`);
    return {
      url,
      publicId: `muted/chat_${channelId}_${Date.now()}`,
      muted: true,
      resourceType,
      bytes: file.size || 0,
    };
  }

  const cloudinary = getCloudinary();

  try {
    const result = await new Promise((resolve, reject) => {
      const upload = cloudinary.uploader.upload_stream(
        {
          folder: `${CHAT_FILES_FOLDER}/${channelId}`,
          resource_type: resourceType,
          public_id: `${userId}_${Date.now()}`,
        },
        (error, uploaded) => {
          if (error) reject(error);
          else resolve(uploaded);
        }
      );

      Readable.from(file.buffer).pipe(upload);
    });

    return {
      url: result.secure_url,
      publicId: result.public_id,
      muted: false,
      resourceType,
      bytes: result.bytes,
    };
  } catch (err) {
    if (err instanceof AppError) throw err;
    throw new AppError('Failed to upload file', 502, {
      code: 'CLOUDINARY_UPLOAD_FAILED',
      details: process.env.NODE_ENV !== 'production' ? err.message : undefined,
    });
  }
}

module.exports = { uploadUserAvatar, uploadCardFile, uploadChatFile, destroyImage, AVATAR_FOLDER, CARD_FILES_FOLDER, CHAT_FILES_FOLDER };
