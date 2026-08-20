const multer = require('multer');
const AppError = require('../utils/AppError');

const IMAGE_MIME = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif']);
const FILE_MIME = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'text/plain',
]);

const CHAT_MIME = new Set([
  ...FILE_MIME,
  'audio/webm',
  'audio/mp4',
  'audio/mpeg',
  'audio/ogg',
  'audio/wav',
  'video/webm',
  'video/mp4',
  'video/quicktime',
]);

const CHAT_MEDIA_MAX = 50 * 1024 * 1024;
const DEFAULT_FILE_MAX = 10 * 1024 * 1024;

const storage = multer.memoryStorage();

/**
 * Strip codec params and repair busboy-corrupted webm uploads
 * (e.g. "video/webm;codecs=vp9,opus" → text/plain when comma breaks parsing).
 */
function normalizeChatMime(file) {
  if (!file) return;
  let mime = String(file.mimetype || '')
    .split(';')[0]
    .trim()
    .toLowerCase();
  const name = String(file.originalname || '').toLowerCase();
  const ext = name.includes('.') ? name.slice(name.lastIndexOf('.')) : '';

  if (
    (!mime || mime === 'text/plain' || mime === 'application/octet-stream') &&
    (ext === '.webm' || ext === '.mp4' || ext === '.mov')
  ) {
    if (name.startsWith('voice-') || name.includes('audio')) {
      mime = ext === '.mp4' ? 'audio/mp4' : 'audio/webm';
    } else {
      mime = ext === '.mp4' || ext === '.mov' ? 'video/mp4' : 'video/webm';
    }
  }

  // Also strip codecs if somehow preserved with semicolon
  if (mime.includes('video/webm')) mime = 'video/webm';
  if (mime.includes('audio/webm')) mime = 'audio/webm';
  if (mime.includes('video/mp4')) mime = 'video/mp4';
  if (mime.includes('audio/mp4')) mime = 'audio/mp4';

  file.mimetype = mime;
}

const uploadAvatar = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024, files: 1 },
  fileFilter(_req, file, cb) {
    normalizeChatMime(file);
    if (!IMAGE_MIME.has(file.mimetype)) {
      return cb(
        new AppError('Only JPEG, PNG, WebP, or GIF images are allowed', 400, {
          code: 'INVALID_FILE_TYPE',
        })
      );
    }
    return cb(null, true);
  },
}).single('avatar');

const uploadCardAttachment = multer({
  storage,
  limits: { fileSize: DEFAULT_FILE_MAX, files: 1 },
  fileFilter(_req, file, cb) {
    normalizeChatMime(file);
    if (!FILE_MIME.has(file.mimetype)) {
      return cb(
        new AppError('Unsupported file type', 400, { code: 'INVALID_FILE_TYPE' })
      );
    }
    return cb(null, true);
  },
}).single('file');

const uploadChatAttachment = multer({
  storage,
  limits: { fileSize: CHAT_MEDIA_MAX, files: 1 },
  fileFilter(_req, file, cb) {
    normalizeChatMime(file);
    if (!CHAT_MIME.has(file.mimetype)) {
      return cb(
        new AppError(
          'Unsupported file type. Images, documents, audio, and video are allowed.',
          400,
          { code: 'INVALID_FILE_TYPE' }
        )
      );
    }
    return cb(null, true);
  },
}).single('file');

function wrapMulter(uploadFn, { maxLabel = '10MB', normalize = false } = {}) {
  return (req, res, next) => {
    uploadFn(req, res, (err) => {
      if (!err) {
        if (req.file && normalize) {
          normalizeChatMime(req.file);
        }
        if (req.file) {
          const isMedia =
            req.file.mimetype?.startsWith('video/') ||
            req.file.mimetype?.startsWith('audio/');
          if (!isMedia && req.file.size > DEFAULT_FILE_MAX) {
            return next(
              new AppError('File must be 10MB or smaller', 400, {
                code: 'FILE_TOO_LARGE',
              })
            );
          }
        }
        return next();
      }
      if (err instanceof multer.MulterError) {
        if (err.code === 'LIMIT_FILE_SIZE') {
          return next(
            new AppError(`File must be ${maxLabel} or smaller`, 400, {
              code: 'FILE_TOO_LARGE',
            })
          );
        }
        return next(new AppError(err.message, 400, { code: 'UPLOAD_ERROR' }));
      }
      return next(err);
    });
  };
}

function avatarUpload(req, res, next) {
  return wrapMulter(uploadAvatar)(req, res, next);
}

function cardAttachmentUpload(req, res, next) {
  return wrapMulter(uploadCardAttachment)(req, res, next);
}

function chatAttachmentUpload(req, res, next) {
  return wrapMulter(uploadChatAttachment, { maxLabel: '50MB', normalize: true })(
    req,
    res,
    next
  );
}

module.exports = {
  avatarUpload,
  cardAttachmentUpload,
  chatAttachmentUpload,
  normalizeChatMime,
};
