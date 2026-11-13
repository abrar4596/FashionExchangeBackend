const multer = require('multer');
const path = require('path');
const { uploadDir, ensureUploadDir } = require('../config/uploads');

// Vercel rejects serverless request bodies larger than ~4.5 MB before Express runs,
// so keep each image comfortably below that ceiling; oversized uploads then fail with
// a clean JSON error instead of a raw platform 413 / generic 500.
const MAX_FILE_BYTES = 4 * 1024 * 1024;

// Never touch the filesystem at import time: a throw here kills the serverless cold start.
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    if (!ensureUploadDir()) {
      const error = new Error('Image storage is temporarily unavailable');
      error.statusCode = 503;
      error.apiCode = 'STORAGE_UNAVAILABLE';
      return cb(error);
    }
    return cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
    cb(null, `clothing-${uniqueSuffix}${ext}`);
  },
});

const fileFilter = (req, file, cb) => {
  const allowedTypes = /jpeg|jpg|png|webp/;
  const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
  const mimetype = allowedTypes.test(file.mimetype);

  if (extname && mimetype) {
    cb(null, true);
  } else {
    const error = new Error('Only JPEG, PNG, and WebP image files are allowed!');
    error.statusCode = 400;
    error.apiCode = 'INVALID_FILE_TYPE';
    cb(error, false);
  }
};

const upload = multer({
  storage,
  // Must stay below Vercel's ~4.5 MB serverless body cap, otherwise the platform
  // rejects the whole request with a raw 413 before this middleware can respond.
  limits: { fileSize: MAX_FILE_BYTES },
  fileFilter,
});

module.exports = upload;
module.exports.MAX_FILE_BYTES = MAX_FILE_BYTES;
