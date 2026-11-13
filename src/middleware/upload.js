const multer = require('multer');
const path = require('path');

// Vercel rejects serverless request bodies larger than ~4.5 MB before Express runs,
// so keep each image comfortably below that ceiling; oversized uploads then fail with
// a clean JSON error instead of a raw platform 413 / generic 500.
const MAX_FILE_BYTES = 4 * 1024 * 1024;

// Memory storage keeps every upload in a Buffer so the controller can stream it straight
// to Cloudinary. Nothing is written to disk, which is what makes this safe on Vercel:
// serverless bundle filesystems (e.g. /var/task) are read-only and their /tmp is ephemeral.
const storage = multer.memoryStorage();

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
