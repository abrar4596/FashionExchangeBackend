const mongoose = require('mongoose');
const dotenv = require('dotenv');
const User = require('../models/User');
const Listing = require('../models/Listing');
const { findCityIdForLegacyValue } = require('../utils/location');

dotenv.config();

const BATCH_SIZE = 500;

const migrateModel = async (Model) => {
  const cursor = Model.find({
    cityId: { $exists: false },
    city: { $type: 'string' },
  })
    .select('_id city')
    .lean()
    .cursor();
  let operations = [];
  let migrated = 0;

  for await (const record of cursor) {
    const cityId = findCityIdForLegacyValue(record.city);
    if (!cityId) continue;

    operations.push({
      updateOne: {
        filter: { _id: record._id, cityId: { $exists: false } },
        update: { $set: { cityId } },
      },
    });

    if (operations.length === BATCH_SIZE) {
      const result = await Model.bulkWrite(operations, { ordered: false });
      migrated += result.modifiedCount;
      operations = [];
    }
  }

  if (operations.length) {
    const result = await Model.bulkWrite(operations, { ordered: false });
    migrated += result.modifiedCount;
  }

  return migrated;
};

const migrateCityIds = async () => {
  const uri = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/fashion_exchange';
  await mongoose.connect(uri);

  try {
    const users = await migrateModel(User);
    const listings = await migrateModel(Listing);
    console.log(`Added city IDs to ${users} users and ${listings} listings.`);
  } finally {
    await mongoose.disconnect();
  }
};

migrateCityIds().catch((error) => {
  console.error('City ID migration failed:', error);
  process.exitCode = 1;
});
