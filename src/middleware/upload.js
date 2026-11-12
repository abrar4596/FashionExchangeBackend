const multer = require('multer');
const path = require('path');
const { uploadDir, ensureUploadDir } = require('../config/uploads');

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
    cb(new Error('Only JPEG, PNG, and WebP image files are allowed!'), false);
  }
};

const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB limit
  fileFilter,
});

module.exports = upload;
