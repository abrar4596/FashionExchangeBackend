const fs = require('fs');
const os = require('os');
const path = require('path');

// Serverless bundles (e.g. Vercel's /var/task) are read-only; only the OS temp dir is writable there.
const isServerless = Boolean(process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_NAME);

const uploadDir = process.env.UPLOAD_DIR ||
  (isServerless ? path.join(os.tmpdir(), 'uploads') : path.join(__dirname, '../../uploads'));

const ensureUploadDir = () => {
  try {
    fs.mkdirSync(uploadDir, { recursive: true });
    return true;
  } catch (error) {
    console.error(JSON.stringify({
      level: 'error',
      timestamp: new Date().toISOString(),
      scope: 'upload-directory',
      message: `Upload directory is not writable: ${uploadDir}`,
      error: error.message,
      code: error.code,
    }));
    return false;
  }
};

module.exports = { uploadDir, ensureUploadDir, isServerless };
