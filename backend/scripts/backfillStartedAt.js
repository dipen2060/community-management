require('../config/env');
const mongoose = require('mongoose');
const Complaint = require('../models/Complaint');

async function backfillStartedAt() {
  await mongoose.connect(process.env.MONGO_URI);
  const result = await Complaint.updateMany(
    {
      status: { $in: ['in_progress', 'inprogress', 'resolved', 'closed'] },
      startedAt: null
    },
    [{ $set: { startedAt: '$createdAt' } }]
  );

  console.log(`Backfilled startedAt on ${result.modifiedCount} complaints.`);
}

backfillStartedAt()
  .then(() => mongoose.disconnect())
  .catch(error => {
    console.error('Complaint startedAt backfill failed:', error);
    mongoose.disconnect().finally(() => { process.exitCode = 1; });
  });
