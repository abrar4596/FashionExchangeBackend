const express = require('express');
const cors = require('cors');
const path = require('path');
const dotenv = require('dotenv');
const http = require('http');
dotenv.config({ path: path.join(__dirname, '../.env') });

const connectDB = require('./config/db');
const { validateRuntimeEnvironment } = require('./config/env');
const { uploadDir, isServerless } = require('./config/uploads');
const asyncHandler = require('./utils/asyncHandler');
const attachSocketServer = require('./socket');

const logFatal = (scope, error) => {
  console.error(JSON.stringify({
    level: 'fatal',
    timestamp: new Date().toISOString(),
    scope,
    name: error && error.name,
    message: error && error.message,
    stack: error && error.stack,
  }));
};

const processGuardKey = Symbol.for('fashion-exchange.process-guards');
if (!globalThis[processGuardKey]) {
  process.on('unhandledRejection', (reason) => {
    logFatal('unhandledRejection', reason instanceof Error ? reason : new Error(String(reason)));
  });
  process.on('uncaughtException', (error) => {
    logFatal('uncaughtException', error);
    // A long-running server must restart from a clean state; serverless instances are recycled by the platform.
    if (!isServerless) process.exit(1);
  });
  globalThis[processGuardKey] = true;
}

const app = express();
const PORT = process.env.PORT || 5000;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Serve static image uploads
app.use('/uploads', express.static(uploadDir));

// Health Check
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    app: 'FashionExchange API',
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV || 'development',
  });
});

app.use('/api', asyncHandler(async (req, res, next) => {
  validateRuntimeEnvironment();
  await connectDB();
  return next();
}));

// Mount Routes
app.use('/api/auth', require('./routes/authRoutes'));
app.use('/api/listings', require('./routes/listingRoutes'));
app.use('/api/swaps', require('./routes/swapRoutes'));
app.use('/api/messages', require('./routes/messageRoutes'));
app.use('/api/admin', require('./routes/adminRoutes'));
app.use('/api/v1/locations', require('./routes/locationRoutes'));
app.use('/api/users', require('./routes/userRoutes'));

// 404 Handler
app.use((req, res, next) => {
  res.status(404).json({ message: `API route not found: ${req.originalUrl}` });
});

// Global Error Handler
app.use((err, req, res, next) => {
  if (res.headersSent) return next(err);

  const timestamp = new Date().toISOString();
  const statusCode = Number.isInteger(err.statusCode) && err.statusCode >= 400 && err.statusCode < 600
    ? err.statusCode
    : 500;
  console.error(JSON.stringify({
    level: 'error',
    timestamp,
    method: req.method,
    path: req.originalUrl,
    message: err.message,
    stack: err.stack,
    cause: err.cause && {
      message: err.cause.message,
      stack: err.cause.stack,
    },
  }));

  return res.status(statusCode).json({
    message: statusCode >= 500
      ? statusCode === 503 ? 'Service temporarily unavailable' : 'Internal server error'
      : err.message || 'Request failed',
    code: err.apiCode || (statusCode === 503 ? 'SERVICE_UNAVAILABLE' : 'INTERNAL_SERVER_ERROR'),
    timestamp,
  });
});

const startServer = async () => {
  validateRuntimeEnvironment();
  await connectDB();

  const httpServer = http.createServer(app);
  const io = attachSocketServer(httpServer);
  app.set('io', io);

  await new Promise((resolve, reject) => {
    httpServer.once('error', reject);
    httpServer.listen(PORT, resolve);
  });
  console.log(`FashionExchange Server listening on http://localhost:${PORT}`);
};

if (require.main === module) {
  startServer().catch((error) => {
    console.error(JSON.stringify({
      level: 'error',
      timestamp: new Date().toISOString(),
      message: 'Backend startup failed',
      error: error.message,
      stack: error.stack,
    }));
    process.exitCode = 1;
  });
}

module.exports = app;
