const validateRuntimeEnvironment = () => {
  const missing = [];
  if (!process.env.JWT_SECRET) missing.push('JWT_SECRET');
  if (process.env.NODE_ENV === 'production' && !process.env.MONGODB_URI) {
    missing.push('MONGODB_URI');
  }

  if (missing.length > 0) {
    const error = new Error(`Missing required environment variables: ${missing.join(', ')}`);
    error.statusCode = 500;
    error.apiCode = 'CONFIGURATION_ERROR';
    throw error;
  }
};

const getJwtSecret = () => {
  if (!process.env.JWT_SECRET) {
    const error = new Error('JWT_SECRET is required');
    error.statusCode = 500;
    error.apiCode = 'CONFIGURATION_ERROR';
    throw error;
  }
  return process.env.JWT_SECRET;
};

module.exports = { validateRuntimeEnvironment, getJwtSecret };
