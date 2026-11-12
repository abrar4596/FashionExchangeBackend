const mongoose = require('mongoose');

const cacheKey = Symbol.for('fashion-exchange.mongodb');
const cache = globalThis[cacheKey] || {
  promise: null,
  listenerAttached: false,
};
globalThis[cacheKey] = cache;

if (!cache.listenerAttached) {
  mongoose.connection.on('disconnected', () => {
    cache.promise = null;
  });
  cache.listenerAttached = true;
}

const connectDB = () => {
  if (mongoose.connection.readyState === 1) return Promise.resolve(mongoose);
  if (cache.promise) return cache.promise;

  const uri = process.env.MONGODB_URI ||
    (process.env.NODE_ENV === 'production' ? null : 'mongodb://127.0.0.1:27017/fashion_exchange');
  if (!uri) {
    const error = new Error('MONGODB_URI is required in production');
    error.statusCode = 500;
    error.apiCode = 'CONFIGURATION_ERROR';
    return Promise.reject(error);
  }

  // Fail fast (well inside the serverless function timeout) so an unreachable cluster returns 503
  // instead of hanging until the platform kills the invocation.
  cache.promise = mongoose.connect(uri, {
    serverSelectionTimeoutMS: Number(process.env.MONGODB_SERVER_SELECTION_TIMEOUT_MS) || 8000,
    maxPoolSize: 10,
  })
    .then((connection) => {
      console.info(`MongoDB connected: ${connection.connection.host}`);
      return connection;
    })
    .catch((error) => {
      cache.promise = null;
      error.statusCode = 503;
      error.apiCode = 'DATABASE_UNAVAILABLE';
      throw error;
    });

  return cache.promise;
};

module.exports = connectDB;
