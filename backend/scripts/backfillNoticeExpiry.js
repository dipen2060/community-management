require('../config/env');
const mongoose = require('mongoose');
const Notice = require('../models/Notice');

const DEFAULT_EXPIRY_DAYS = 7;

async function backfillNoticeExpiry() {
  await mongoose.connect(process.env.MONGO_URI);
  const result = await Notice.updateMany(
    {
      expiresAt: null,
      createdAt: { $type: 'date' }
    },
    [{
      $set: {
        expiresAt: {
          $add: ['$createdAt', DEFAULT_EXPIRY_DAYS * 24 * 60 * 60 * 1000]
        }
      }
    }]
  );

  console.log(`Backfilled expiresAt on ${result.modifiedCount} notices (${DEFAULT_EXPIRY_DAYS} days after creation).`);
}

backfillNoticeExpiry()
  .then(() => mongoose.disconnect())
  .catch(error => {
    console.error('Notice expiry backfill failed:', error);
    mongoose.disconnect().finally(() => { process.exitCode = 1; });
  });
