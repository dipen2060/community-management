const mongoose = require('mongoose');
const House = require('../models/House');
const Poll = require('../models/Poll');
const User = require('../models/User');
const Complaint = require('../models/Complaint');

describe('Mongoose input constraints', () => {
  test('requires valid house details and positive monthly due', () => {
    const missingDetails = new House({}).validateSync();
    expect(Object.keys(missingDetails.errors)).toEqual(expect.arrayContaining([
      'houseNo',
      'section',
      'floor',
      'monthlyDue'
    ]));

    const invalidHouse = new House({
      houseNo: 'A-101',
      section: 'Section 1',
      floor: 2.5,
      monthlyDue: 0
    }).validateSync();
    expect(invalidHouse.errors.floor).toBeDefined();
    expect(invalidHouse.errors.monthlyDue).toBeDefined();

    const validHouse = new House({
      houseNo: 'A-101',
      section: 'Section 1',
      floor: 0,
      monthlyDue: 0.01
    });
    expect(validHouse.validateSync()).toBeUndefined();
  });

  test('rejects names outside the letters-and-spaces rule', () => {
    const invalidUser = new User({
      name: "Ram O'Neil",
      username: 'ram.oneil',
      email: 'ram@example.com',
      password: 'password'
    }).validateSync();

    expect(invalidUser.errors.name).toBeDefined();
  });

  test('requires at least two non-empty poll option strings', () => {
    const poll = new Poll({
      title: 'Community choice',
      createdBy: new mongoose.Types.ObjectId(),
      options: [{ text: 'Yes' }]
    }).validateSync();

    expect(poll.errors.options).toBeDefined();
  });

  test('defaults complaint startedAt to null until work begins', () => {
    const complaint = new Complaint({
      title: 'Water interruption',
      description: 'Water has been unavailable since this morning.',
      section: 'Section 1',
      submittedBy: new mongoose.Types.ObjectId()
    });

    expect(complaint.startedAt).toBeNull();
  });
});
