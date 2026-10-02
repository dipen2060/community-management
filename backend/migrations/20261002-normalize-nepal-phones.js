require('../config/env');
const mongoose = require('mongoose');
const User = require('../models/User');
const { isValidNepalMobile, normalizeNepalPhone } = require('../utils/phone');

async function migrate() {
  await mongoose.connect(process.env.MONGO_URI);

  const users = await User.find({
    phone: { $exists: true, $nin: [null, ''] }
  }).select('name email role phone');
  const invalidUsers = [];
  let normalizedCount = 0;

  for (const user of users) {
    const normalizedPhone = normalizeNepalPhone(user.phone);

    if (!normalizedPhone || !isValidNepalMobile(normalizedPhone)) {
      invalidUsers.push({
        name: user.name,
        email: user.email,
        role: user.role,
        phone: user.phone
      });
      continue;
    }

    if (normalizedPhone !== user.phone) {
      await User.updateOne(
        { _id: user._id },
        { $set: { phone: normalizedPhone } }
      );
      normalizedCount += 1;
    }
  }

  console.log(`Normalized ${normalizedCount} user phone number(s).`);
  if (invalidUsers.length > 0) {
    console.log('Users with invalid phone numbers (correct these manually):');
    console.table(invalidUsers);
  } else {
    console.log('No users have invalid phone numbers.');
  }
}

migrate()
  .then(() => mongoose.disconnect())
  .catch(error => {
    console.error('Nepal phone migration failed:', error);
    mongoose.disconnect().finally(() => process.exitCode = 1);
  });
