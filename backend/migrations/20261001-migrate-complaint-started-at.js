require('../config/env');
const mongoose = require('mongoose');
const Complaint = require('../models/Complaint');

async function migrate() {
  await mongoose.connect(process.env.MONGO_URI);
  const result = await Complaint.updateMany(
    {
      status: { $in: ['inprogress', 'resolved', 'closed'] },
      startedAt: null
    },
    [{ $set: { startedAt: '$createdAt' } }]
  );

  console.log(`Backfilled startedAt on ${result.modifiedCount} complaints.`);
}

migrate()
  .then(() => mongoose.disconnect())
  .catch(error => {
    console.error('Complaint startedAt migration failed:', error);
    mongoose.disconnect().finally(() => process.exitCode = 1);
  });
