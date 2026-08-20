const mongoose = require('mongoose');

/**
 * Connect to MongoDB using MONGODB_URI from environment.
 */
async function connectDB() {
  const uri = process.env.MONGODB_URI;

  if (!uri) {
    throw new Error('MONGODB_URI is not defined in environment variables');
  }

  mongoose.set('strictQuery', true);

  try {
    await mongoose.connect(uri, {
      serverSelectionTimeoutMS: 10000,
    });
    console.log(`MongoDB connected: ${mongoose.connection.host}`);
  } catch (err) {
    if (err.message?.includes('querySrv')) {
      throw new Error(
        'MongoDB DNS lookup failed (querySrv). Use the standard mongodb:// connection string from Atlas instead of mongodb+srv:// — see .env.example'
      );
    }

    const detail = err.reason?.message || err.cause?.message;
    if (detail) {
      throw new Error(`${err.message} (${detail})`);
    }
    throw err;
  }
}

module.exports = connectDB;
