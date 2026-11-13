const cloudinary = require('cloudinary').v2;
const streamifier = require('streamifier');

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

const REQUIRED_KEYS = [
  'CLOUDINARY_CLOUD_NAME',
  'CLOUDINARY_API_KEY',
  'CLOUDINARY_API_SECRET',
];

// Resolved lazily (never cached at import time): serverless workers are reused across
// invocations and the env vars may only be injected by the platform per request.
const isCloudinaryConfigured = () => REQUIRED_KEYS.every((key) => Boolean(process.env[key]));

// Carries a machine-readable code + status so callers can return a descriptive JSON
// payload instead of letting the request hang or crash on a raw SDK rejection.
class ImageUploadError extends Error {
  constructor(message, statusCode = 502, apiCode = 'IMAGE_UPLOAD_FAILED') {
    super(message);
    this.name = 'ImageUploadError';
    this.statusCode = statusCode;
    this.apiCode = apiCode;
  }
}

// Pipes an in-memory Multer buffer straight into Cloudinary. No temp files are touched,
// which is what keeps this working on Vercel's read-only serverless filesystem.
const uploadBuffer = (buffer, options = {}) =>
  new Promise((resolve, reject) => {
    if (!buffer || !buffer.length) {
      return reject(new ImageUploadError('Cannot upload an empty image buffer', 400, 'EMPTY_IMAGE'));
    }

    if (!isCloudinaryConfigured()) {
      return reject(
        new ImageUploadError(
          'Image storage is not configured on the server. Please contact support.',
          503,
          'CLOUDINARY_NOT_CONFIGURED'
        )
      );
    }

    const uploadStream = cloudinary.uploader.upload_stream(
      { folder: 'fashion-exchange/listings', resource_type: 'image', ...options },
      (error, result) => {
        if (error) {
          return reject(new ImageUploadError(error.message || 'Cloudinary upload failed'));
        }
        return resolve(result);
      }
    );

    // Surface stream-level failures (connection reset, bad credentials) as a rejection too.
    uploadStream.on('error', (error) => {
      reject(new ImageUploadError(error.message || 'Cloudinary stream failed'));
    });

    streamifier.createReadStream(buffer).pipe(uploadStream);
  });

// Export shape mirrors middleware/upload.js so helpers can be attached to the instance.
module.exports = cloudinary;
module.exports.isCloudinaryConfigured = isCloudinaryConfigured;
module.exports.uploadBuffer = uploadBuffer;
module.exports.ImageUploadError = ImageUploadError;
