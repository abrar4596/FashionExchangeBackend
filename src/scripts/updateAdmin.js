/**
 * updateAdmin.js
 *
 * Idempotent script that upserts the platform admin account with new credentials.
 * Password is set via model.save() so the User schema's pre('save') bcrypt hook
 * fires correctly — no plain-text password ever touches the database.
 *
 * Usage:
 *   node src/scripts/updateAdmin.js
 */

const path = require('path');
const dotenv = require('dotenv');

// Load .env from the project root (backend/.env)
dotenv.config({ path: path.join(__dirname, '../../.env') });

const mongoose = require('mongoose');
const User = require('../models/User');

const NEW_EMAIL    = 'feadmin@gmail.com';
const NEW_PASSWORD = 'admin4596';
const ADMIN_NAME   = 'FashionExchange Admin';
const ADMIN_CITY   = 'Mumbai';

async function run() {
  const uri =
    process.env.MONGODB_URI ||
    'mongodb://127.0.0.1:27017/fashion_exchange';

  console.log('Connecting to MongoDB…');
  await mongoose.connect(uri, { serverSelectionTimeoutMS: 10000 });
  console.log(`Connected: ${mongoose.connection.host}`);

  // Look for any existing admin — first by role, then by the target email
  // (covers the case where a previous run already updated the email).
  let admin = await User.findOne({ role: 'admin' }).select('+password');

  if (admin) {
    console.log(`Found existing admin → email: "${admin.email}", id: ${admin._id}`);
    console.log('Updating email and password…');

    admin.email    = NEW_EMAIL;
    admin.password = NEW_PASSWORD; // pre('save') hook will hash this
    await admin.save();

    console.log('Admin credentials updated successfully.');
  } else {
    console.log('No admin user found — creating a new one…');

    admin = new User({
      name:     ADMIN_NAME,
      email:    NEW_EMAIL,
      password: NEW_PASSWORD, // pre('save') hook will hash this
      city:     ADMIN_CITY,
      role:     'admin',
      status:   'active',
    });
    await admin.save();

    console.log('New admin user created successfully.');
  }

  // Verification: re-fetch and confirm the hash looks valid
  const saved = await User.findById(admin._id).select('+password');
  const hashPreview = saved.password.slice(0, 7); // e.g. "$2b$10$"
  const looksHashed = saved.password.startsWith('$2');

  console.log('\n--- Verification ---');
  console.log(`  _id          : ${saved._id}`);
  console.log(`  email        : ${saved.email}`);
  console.log(`  role         : ${saved.role}`);
  console.log(`  status       : ${saved.status}`);
  console.log(`  passwordHash : ${hashPreview}… (bcrypt: ${looksHashed ? 'YES ✓' : 'NO ✗'})`);

  if (!looksHashed) {
    console.error('ERROR: Password does not appear to be hashed. Check the pre-save hook.');
    process.exitCode = 1;
  } else {
    console.log('\nAdmin account is ready. Login with:');
    console.log(`  Email    : ${NEW_EMAIL}`);
    console.log(`  Password : ${NEW_PASSWORD}`);
  }

  await mongoose.disconnect();
  console.log('Database connection closed.');
}

run().catch((err) => {
  console.error('Script failed:', err.message);
  process.exitCode = 1;
  mongoose.disconnect();
});
