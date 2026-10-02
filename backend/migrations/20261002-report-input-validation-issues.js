require('../config/env');
const mongoose = require('mongoose');
const House = require('../models/House');
const User = require('../models/User');
const Poll = require('../models/Poll');
const {
  MAX_MONTHLY_DUE,
  isValidHouseNo,
  isValidUserName,
  normalizeHouseNo,
  normalizeWhitespace
} = require('../utils/inputValidation');

async function reportIssues() {
  await mongoose.connect(process.env.MONGO_URI);

  const [houses, users, polls] = await Promise.all([
    House.find({}).select('houseNo section floor monthlyDue').lean(),
    User.find({}).select('name email role').lean(),
    Poll.find({ status: 'active', $or: [{ endDate: null }, { endDate: { $exists: false } }] })
      .select('title createdAt')
      .lean()
  ]);

  const housesByNumber = new Map();
  for (const house of houses) {
    const normalizedHouseNo = normalizeHouseNo(house.houseNo || '');
    const matches = housesByNumber.get(normalizedHouseNo) || [];
    matches.push(house);
    housesByNumber.set(normalizedHouseNo, matches);
  }

  const duplicateHouseNumbers = [...housesByNumber.values()]
    .filter(matches => matches.length > 1)
    .flat()
    .map(({ _id, houseNo, section }) => ({ _id, houseNo, section }));
  const invalidHouseNumbers = houses
    .filter(house => !isValidHouseNo(normalizeHouseNo(house.houseNo || '')))
    .map(({ _id, houseNo, section }) => ({ _id, houseNo, section }));
  const dueAboveMaximum = houses
    .filter(house => Number(house.monthlyDue) > MAX_MONTHLY_DUE)
    .map(({ _id, houseNo, monthlyDue }) => ({ _id, houseNo, monthlyDue }));
  const invalidFloors = houses
    .filter(house => !Number.isInteger(house.floor) || house.floor < 0 || house.floor > 30)
    .map(({ _id, houseNo, floor }) => ({ _id, houseNo, floor }));
  const invalidNames = users
    .filter(user =>
      !isValidUserName(user.name) ||
      normalizeWhitespace(user.name || '') !== user.name
    )
    .map(({ _id, name, email, role }) => ({ _id, name, email, role }));

  console.log('Duplicate house numbers (case-insensitive):');
  console.table(duplicateHouseNumbers);
  console.log('Invalid house numbers:');
  console.table(invalidHouseNumbers);
  console.log(`Monthly dues above MAX_MONTHLY_DUE (${MAX_MONTHLY_DUE}):`);
  console.table(dueAboveMaximum);
  console.log('Non-integer or out-of-range house floors:');
  console.table(invalidFloors);
  console.log('Users with invalid names:');
  console.table(invalidNames);
  console.log('Active polls without an end date:');
  console.table(polls.map(({ _id, title, createdAt }) => ({ _id, title, createdAt })));
}

reportIssues()
  .then(() => mongoose.disconnect())
  .catch(error => {
    console.error('Input validation report failed:', error);
    mongoose.disconnect().finally(() => process.exitCode = 1);
  });
