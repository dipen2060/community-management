require('../config/env');
const mongoose = require('mongoose');
const User = require('../models/User');

async function migrate() {
  await mongoose.connect(process.env.MONGO_URI);
  const result = await User.updateMany(
    {},
    { $unset: { resetPasswordToken: '', resetPasswordExpire: '' } },
    { strict: false }
  );

  console.log(`Removed password reset token fields from ${result.modifiedCount} users.`);
}

migrate()
  .then(() => mongoose.disconnect())
  .catch(error => {
    console.error('Password reset token migration failed:', error);
    mongoose.disconnect().finally(() => process.exitCode = 1);
  });
