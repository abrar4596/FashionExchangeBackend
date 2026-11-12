// Simulates a Vercel serverless cold start locally: read-only bundle filesystem (only os.tmpdir() writable),
// no committed uploads/ directory, then boots the exported Express app and probes it over HTTP.
//   node src/scripts/verifyColdStart.js          -> unreachable DB, expects clean 503 JSON (no crash)
//   node src/scripts/verifyColdStart.js --live   -> uses MONGODB_URI from env/.env, expects 200
const fs = require('fs');
const os = require('os');
const path = require('path');
const http = require('http');

const live = process.argv.includes('--live');
const backendRoot = path.join(__dirname, '../..');
const bundledUploads = path.join(backendRoot, 'uploads');
const tmpRoot = os.tmpdir();

const readOnly = (target) => {
  const error = new Error(`EROFS: read-only file system, mkdir '${target}'`);
  error.code = 'EROFS';
  return error;
};

const originalExistsSync = fs.existsSync;
const originalMkdirSync = fs.mkdirSync;
fs.existsSync = (target, ...rest) =>
  String(target).startsWith(bundledUploads) ? false : originalExistsSync(target, ...rest);
fs.mkdirSync = (target, ...rest) => {
  if (!path.resolve(String(target)).startsWith(tmpRoot)) throw readOnly(target);
  return originalMkdirSync(target, ...rest);
};

process.env.VERCEL = '1';
process.env.NODE_ENV = process.env.NODE_ENV || 'production';
process.env.JWT_SECRET = process.env.JWT_SECRET || 'cold-start-verification-secret';
if (!live) {
  process.env.MONGODB_URI = 'mongodb://127.0.0.1:1/cold_start_probe';
  process.env.MONGODB_SERVER_SELECTION_TIMEOUT_MS = '1500';
}

const request = (port, urlPath) => new Promise((resolve, reject) => {
  http.get({ host: '127.0.0.1', port, path: urlPath }, (res) => {
    let body = '';
    res.on('data', (chunk) => { body += chunk; });
    res.on('end', () => resolve({ status: res.statusCode, body }));
  }).on('error', reject);
});

const run = async () => {
  let app;
  try {
    app = require('../server');
  } catch (error) {
    console.error('FAIL: module load crashed (this is FUNCTION_INVOCATION_FAILED on Vercel)');
    console.error(error.stack);
    process.exit(1);
  }
  console.log('PASS: server module loaded under simulated read-only serverless filesystem');

  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address();

  const checks = [
    { path: '/api/health', expect: [200] },
    { path: '/api/v1/locations/cities?q=mum', expect: live ? [200] : [503] },
    { path: '/api/listings', expect: live ? [200] : [503] },
  ];

  let failed = false;
  for (const check of checks) {
    const { status, body } = await request(port, check.path);
    let json = true;
    try { JSON.parse(body); } catch { json = false; }
    const ok = check.expect.includes(status) && json;
    if (!ok) failed = true;
    console.log(`${ok ? 'PASS' : 'FAIL'}: GET ${check.path} -> ${status} ${body.slice(0, 120)}`);
  }

  server.close();
  await require('mongoose').disconnect().catch(() => {});
  process.exit(failed ? 1 : 0);
};

run();
