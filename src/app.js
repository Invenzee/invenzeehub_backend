const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const cookieParser = require('cookie-parser');
const apiRoutes = require('./routes');
const { notFoundHandler, errorHandler } = require('./middleware/errorHandler');
const { configureCloudinary } = require('./config/cloudinary');
const { isResendMuted, isCloudinaryMuted } = require('./utils/externalMute');

function createApp() {
  const app = express();

  app.set('trust proxy', 1);

  app.use(
    helmet({
      crossOriginResourcePolicy: { policy: 'cross-origin' },
    })
  );

  const corsOrigin = process.env.CORS_ORIGIN || 'http://localhost:3000';
  app.use(
    cors({
      origin: corsOrigin.split(',').map((o) => o.trim()),
      credentials: true,
    })
  );

  app.use(express.json({ limit: '1mb' }));
  app.use(express.urlencoded({ extended: true }));
  app.use(cookieParser());

  configureCloudinary();

  if (isResendMuted() || isCloudinaryMuted()) {
    console.warn(
      `[MUTE_EXTERNAL] Testing mute active — Resend: ${isResendMuted() ? 'OFF' : 'ON'}, Cloudinary: ${isCloudinaryMuted() ? 'OFF' : 'ON'}`
    );
  }

  app.get('/health', (_req, res) => {
    res.json({ status: 'ok' });
  });

  app.use('/api', apiRoutes);

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}

module.exports = createApp;
