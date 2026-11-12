const express = require('express');
const cors = require('cors');
const path = require('path');
const dotenv = require('dotenv');
const http = require('http');
// override:false means platform-injected env vars (e.g. Vercel dashboard) always win over the local .env file.
// This prevents a committed .env from silently overriding production secrets.
dotenv.config({ path: path.join(__dirname, '../.env'), override: false });

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
// Restrict CORS to known origins.
// FRONTEND_URL must be set as a Vercel environment variable on the backend project
// (e.g. https://fashion-exchange.vercel.app). Without it, only the two localhost
// origins below are permitted.
const allowedOrigins = [
  'http://localhost:5173',  // Vite dev server
  'http://localhost:4173',  // Vite preview
  process.env.FRONTEND_URL,
].filter(Boolean);

app.use(cors({
  origin: (origin, callback) => {
    // Allow server-to-server requests (no origin header) and listed origins
    if (!origin || allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error(`CORS: origin ${origin} not allowed`));
    }
  },
  credentials: true,
}));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Serve static image uploads
app.use('/uploads', express.static(uploadDir));

// Root Health Check (exact match only; does not touch /api or /uploads)
app.get('/', (req, res) => {
  res.status(200).json({
    success: true,
    message: 'Clothing Exchange & Swap Marketplace API is running',
    version: '1.0.0',
    timestamp: new Date().toISOString(),
  });
});

// Health Check
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    app: 'FashionExchange API',
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV || 'development',
  });
});

// City/location search is pure in-memory JSON -- no database needed.
// Mount it BEFORE the DB guard so it never blocks on a cold-start connection.
app.use('/api/v1/locations', require('./routes/locationRoutes'));

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
