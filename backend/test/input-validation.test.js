const express = require('express');
const request = require('supertest');
const {
  MAX_MONTHLY_DUE,
  isValidHouseNo,
  isValidMonthlyDue,
  isValidNewPassword,
  isValidPollOptions,
  isValidSection,
  isValidUserName,
  isWithinOneYear,
  normalizeHouseNo,
  normalizeSection,
  normalizeWhitespace
} = require('../utils/inputValidation');
const {
  createHouseValidation,
  updateHouseValidation,
  createUserValidation,
  updateUserValidation,
  updateProfileValidation,
  loginValidation,
  createPollValidation,
  updatePollValidation
} = require('../middleware/validator');

const validationApp = (validation) => {
  const app = express();
  app.use(express.json());
  app.post('/', validation, (req, res) => res.json(req.body));
  return app;
};

const createPollBody = (overrides = {}) => ({
  title: 'Community preference?',
  options: ['Morning', 'Evening'],
  endDate: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
  ...overrides
});

describe('house input rules', () => {
  test('normalizes house numbers by collapsing spaces and uppercasing', () => {
    expect(normalizeHouseNo('  a-101   west ')).toBe('A-101 WEST');
    expect(isValidHouseNo('A')).toBe(true);
    expect(isValidHouseNo(normalizeHouseNo('a-101'))).toBe(true);
    expect(isValidHouseNo('A#101')).toBe(false);
    expect(isValidHouseNo('-A101')).toBe(false);
    expect(isValidHouseNo('A'.repeat(21))).toBe(false);
  });

  test('create and update validators pass normalized house numbers onward', async () => {
    const created = await request(validationApp(createHouseValidation))
      .post('/')
      .send({ houseNo: ' a-101 ', section: 'Section 1', floor: 0, monthlyDue: 500 });
    const updated = await request(validationApp(updateHouseValidation))
      .post('/')
      .send({ houseNo: ' a-102 ' });

    expect(created.status).toBe(200);
    expect(created.body.houseNo).toBe('A-101');
    expect(updated.status).toBe(200);
    expect(updated.body.houseNo).toBe('A-102');
  });

  test('rejects an existing house number differing only by case', async () => {
    jest.resetModules();
    jest.doMock('../models/House', () => ({
      exists: jest.fn().mockResolvedValue(true),
      findOne: jest.fn(),
      create: jest.fn(),
      findById: jest.fn()
    }));
    jest.doMock('../models/User', () => ({}));
    jest.doMock('../utils/residentHouses', () => ({
      ResidentHouse: {},
      syncHouseRelationship: jest.fn()
    }));

    const House = require('../models/House');
    const { createHouse } = require('../controllers/houseController');
    const res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn()
    };
    await createHouse({ body: { houseNo: 'a-101' } }, res, jest.fn());

    expect(House.exists).toHaveBeenCalledWith({ houseNo: /^A-101$/i });
    expect(res.status).toHaveBeenCalledWith(409);

    House.findById.mockResolvedValue({
      _id: 'current-house',
      owner: null,
      tenant: null
    });
    House.findOne.mockReturnValue({
      select: async () => ({ _id: 'other-house' })
    });
    const { updateHouse } = require('../controllers/houseController');
    const updateResponse = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn()
    };
    await updateHouse({
      params: { id: 'current-house' },
      body: { houseNo: 'a-101' }
    }, updateResponse, jest.fn());
    expect(House.findOne).toHaveBeenCalledWith({
      houseNo: /^A-101$/i,
      _id: { $ne: 'current-house' }
    });
    expect(updateResponse.status).toHaveBeenCalledWith(409);

    House.exists.mockResolvedValue(false);
    House.findOne.mockReturnValue({
      select: () => ({
        lean: async () => ({ section: 'Section 1' })
      })
    });
    let createdDocument;
    House.create.mockImplementation(async document => {
      createdDocument = document;
      return { _id: 'house-id' };
    });
    House.findById.mockReturnValue({
      populate: () => ({
        populate: async () => ({ _id: 'house-id' })
      })
    });
    const sectionResponse = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn()
    };
    await createHouse({
      body: { houseNo: 'A-102', section: ' section   1 ', floor: 0, monthlyDue: 500 }
    }, sectionResponse, jest.fn());
    expect(createdDocument.section).toBe('Section 1');
    expect(sectionResponse.status).toHaveBeenCalledWith(201);

    jest.dontMock('../models/House');
    jest.dontMock('../models/User');
    jest.dontMock('../utils/residentHouses');
    jest.resetModules();
  });

  test('normalizes sections and validates allowed section text', () => {
    expect(normalizeSection('  section   1  ')).toBe('section 1');
    expect(isValidSection('Section 1')).toBe(true);
    expect(isValidSection('Section_1')).toBe(false);
    expect(isValidSection('-Section')).toBe(false);
    expect(isValidSection('S'.repeat(51))).toBe(false);
  });

  test('requires house number, section, floor, and positive monthly due on create', async () => {
    for (const missingField of ['houseNo', 'section', 'floor', 'monthlyDue']) {
      const body = { houseNo: 'A-101', section: 'Section 1', floor: 0, monthlyDue: 500 };
      delete body[missingField];
      const response = await request(validationApp(createHouseValidation)).post('/').send(body);
      expect(response.status).toBe(400);
    }
  });
});

describe('monthly due and floor rules', () => {
  test.each([0.01, 500, 500.25, MAX_MONTHLY_DUE])('accepts monthly due %s', amount => {
    expect(isValidMonthlyDue(amount)).toBe(true);
  });

  test.each([0, '0', '50000', '1.234', '-1', '10001', 'abc'])('rejects monthly due %s', amount => {
    expect(isValidMonthlyDue(amount)).toBe(false);
  });

  test('rejects monthly due 50000 and accepts a two-decimal due through house validation', async () => {
    const invalid = await request(validationApp(createHouseValidation))
      .post('/')
      .send({ houseNo: 'A-101', monthlyDue: 50000 });
    const valid = await request(validationApp(createHouseValidation))
      .post('/')
      .send({ houseNo: 'A-102', section: 'Section 1', floor: 0, monthlyDue: 500.25 });

    expect(invalid.status).toBe(400);
    expect(valid.status).toBe(200);
    expect(valid.body.monthlyDue).toBe(500.25);
  });

  test('rejects fractional or out-of-range floors and accepts an integer', async () => {
    const fractional = await request(validationApp(createHouseValidation))
      .post('/')
      .send({ houseNo: 'A-101', floor: 2.5 });
    const outOfRange = await request(validationApp(updateHouseValidation))
      .post('/')
      .send({ floor: 31 });
    const belowRange = await request(validationApp(updateHouseValidation))
      .post('/')
      .send({ floor: -1 });
    const valid = await request(validationApp(createHouseValidation))
      .post('/')
      .send({ houseNo: 'A-102', section: 'Section 1', floor: 30, monthlyDue: 500 });

    expect(fractional.status).toBe(400);
    expect(outOfRange.status).toBe(400);
    expect(belowRange.status).toBe(400);
    expect(valid.status).toBe(200);
    expect(valid.body.floor).toBe(30);
  });
});

describe('user identity and password rules', () => {
  test('normalizes names and allows only Latin letters and spaces', () => {
    expect(normalizeWhitespace('  Ram   Bahadur  ')).toBe('Ram Bahadur');
    expect(isValidUserName('Ram Bahadur')).toBe(true);
    expect(isValidUserName("Ram O'Neil")).toBe(false);
    expect(isValidUserName('Ram-Bahadur')).toBe(false);
    expect(isValidUserName('Ram.Bahadur')).toBe(false);
    expect(isValidUserName(`A${'b'.repeat(49)}`)).toBe(true);
    expect(isValidUserName('राम बहादुर')).toBe(false);
    expect(isValidUserName('Ram 123')).toBe(false);
    expect(isValidUserName('R')).toBe(false);
    expect(isValidUserName(`A${'b'.repeat(50)}`)).toBe(false);
  });

  test('create, update, and profile name validation normalizes spaces', async () => {
    const create = await request(validationApp(createUserValidation))
      .post('/')
      .send({ name: '  Ram   Bahadur ', email: ' RAM@EXAMPLE.COM ' });
    const update = await request(validationApp(updateUserValidation))
      .post('/')
      .send({ name: '  Sita   Devi ' });
    const profile = await request(validationApp(updateProfileValidation))
      .post('/')
      .send({ name: '  Hari   Prasad ' });
    const updateEmail = await request(validationApp(updateUserValidation))
      .post('/')
      .send({ email: ' ADMIN@EXAMPLE.COM ' });

    expect(create.status).toBe(200);
    expect(create.body.name).toBe('Ram Bahadur');
    expect(create.body.email).toBe('ram@example.com');
    expect(update.body.name).toBe('Sita Devi');
    expect(profile.body.name).toBe('Hari Prasad');
    expect(updateEmail.body.email).toBe('admin@example.com');
  });

  test('rejects invalid user names and email longer than 100 characters', async () => {
    const invalidName = await request(validationApp(createUserValidation))
      .post('/')
      .send({ name: 'राम बहादुर', email: 'valid@example.com' });
    const longEmail = await request(validationApp(createUserValidation))
      .post('/')
      .send({ name: 'Ram Bahadur', email: `${'a'.repeat(90)}@example.com` });
    const malformedEmail = await request(validationApp(updateUserValidation))
      .post('/')
      .send({ email: 'not-an-email' });

    expect(invalidName.status).toBe(400);
    expect(longEmail.status).toBe(400);
    expect(malformedEmail.status).toBe(400);
  });

  test('requires strong passwords only for password changes, not login', async () => {
    expect(isValidNewPassword('Nepal123!')).toBe(true);
    expect(isValidNewPassword(`Aa1!${'x'.repeat(60)}`)).toBe(true);
    expect(isValidNewPassword('Nepal123')).toBe(false);
    expect(isValidNewPassword('Short!1')).toBe(false);
    expect(isValidNewPassword('onlyletters!')).toBe(false);
    expect(isValidNewPassword('12345678')).toBe(false);
    expect(isValidNewPassword('UPPER123!')).toBe(false);
    expect(isValidNewPassword('Lowercase!')).toBe(false);
    expect(isValidNewPassword(`Aa1!${'x'.repeat(61)}`)).toBe(false);

    const weakChange = await request(validationApp(updateProfileValidation))
      .post('/')
      .send({ newPassword: 'short1', currentPassword: 'legacy' });
    const shortLogin = await request(validationApp(loginValidation))
      .post('/')
      .send({ email: 'legacy@example.com', password: 'x' });

    expect(weakChange.status).toBe(400);
    expect(shortLogin.status).toBe(200);
  });
});

describe('poll rules', () => {
  test('trims options and accepts 2-10 unique labels of at most 100 characters', async () => {
    const response = await request(validationApp(createPollValidation))
      .post('/')
      .send(createPollBody({ options: [' Morning ', 'Evening'] }));

    expect(response.status).toBe(200);
    expect(response.body.options).toEqual(['Morning', 'Evening']);

    const tenOptions = await request(validationApp(createPollValidation))
      .post('/')
      .send(createPollBody({ options: Array.from({ length: 10 }, (_, index) => `Option ${index + 1}`) }));
    expect(tenOptions.status).toBe(200);
  });

  test('rejects duplicate options ignoring case and labels longer than 100 characters', async () => {
    const duplicates = await request(validationApp(createPollValidation))
      .post('/')
      .send(createPollBody({ options: ['Morning', ' morning '] }));
    const tooLong = await request(validationApp(createPollValidation))
      .post('/')
      .send(createPollBody({ options: ['a'.repeat(101), 'Evening'] }));
    const tooMany = await request(validationApp(createPollValidation))
      .post('/')
      .send(createPollBody({ options: Array.from({ length: 11 }, (_, index) => `Option ${index + 1}`) }));

    expect(duplicates.status).toBe(400);
    expect(tooLong.status).toBe(400);
    expect(tooMany.status).toBe(400);
    expect(isValidPollOptions(['', 'Valid'])).toBe(false);
  });

  test('requires a future end date no more than one year ahead on create', async () => {
    const missing = await request(validationApp(createPollValidation))
      .post('/')
      .send(createPollBody({ endDate: undefined }));
    const past = await request(validationApp(createPollValidation))
      .post('/')
      .send(createPollBody({ endDate: new Date(Date.now() - 1000).toISOString() }));
    const tooFar = new Date();
    tooFar.setFullYear(tooFar.getFullYear() + 2);
    const future = await request(validationApp(createPollValidation))
      .post('/')
      .send(createPollBody());
    const tooFarRequest = await request(validationApp(createPollValidation))
      .post('/')
      .send(createPollBody({ endDate: tooFar.toISOString() }));

    expect(missing.status).toBe(400);
    expect(past.status).toBe(400);
    expect(isWithinOneYear(tooFar)).toBe(false);
    expect(future.status).toBe(200);
    expect(tooFarRequest.status).toBe(400);
  });

  test('preserves optional end date behavior on updates while validating supplied options', async () => {
    const noEndDate = await request(validationApp(updatePollValidation))
      .post('/')
      .send({ title: 'Updated title' });
    const duplicateOptions = await request(validationApp(updatePollValidation))
      .post('/')
      .send({ options: ['Yes', ' yes '] });
    const endDateBeyondYear = new Date();
    endDateBeyondYear.setFullYear(endDateBeyondYear.getFullYear() + 2);
    const farUpdate = await request(validationApp(updatePollValidation))
      .post('/')
      .send({ endDate: endDateBeyondYear.toISOString() });

    expect(noEndDate.status).toBe(200);
    expect(duplicateOptions.status).toBe(400);
    expect(farUpdate.status).toBe(200);
  });
});
