const express = require('express');
const request = require('supertest');
const {
  NEPAL_MOBILE_PREFIXES,
  isValidNepalMobile,
  normalizeNepalPhone
} = require('../utils/phone');
const {
  createUserValidation,
  updateUserValidation,
  updateProfileValidation
} = require('../middleware/validator');

const validationApp = (validation) => {
  const app = express();
  app.use(express.json());
  app.post('/', validation, (req, res) => res.json({ phone: req.body.phone }));
  return app;
};

describe('Nepal mobile phone validation', () => {
  test.each(NEPAL_MOBILE_PREFIXES)('accepts prefix %s', (prefix) => {
    expect(isValidNepalMobile(`${prefix}1234567`)).toBe(true);
  });

  test.each([
    '983',
    '987',
    '988',
    '989',
    '972',
    '973',
    '977',
    '978',
    '979',
    ...Array.from({ length: 10 }, (_, digit) => `96${digit}`),
    ...Array.from({ length: 10 }, (_, digit) => `99${digit}`)
  ])(
    'rejects prefix %s',
    (prefix) => {
      expect(isValidNepalMobile(`${prefix}1234567`)).toBe(false);
    }
  );

  test.each([
    '984123456',
    '98412345678',
    '98412abc67',
    '+977 984-123-4567x'
  ])('rejects malformed phone %s', (phone) => {
    expect(isValidNepalMobile(phone)).toBe(false);
  });

  test('normalizes a country-prefixed, formatted phone number', () => {
    expect(normalizeNepalPhone('+977 984-123-4567')).toBe('9841234567');
    expect(normalizeNepalPhone('977 984-123-4567')).toBe('9841234567');
    expect(isValidNepalMobile('+977 984-123-4567')).toBe(true);
  });

  test.each([
    ['create user', createUserValidation, { name: 'Test User', email: 'test@example.com' }],
    ['update user', updateUserValidation, {}],
    ['update profile', updateProfileValidation, {}]
  ])('allows an empty phone on %s', async (_label, validation, body) => {
    const response = await request(validationApp(validation))
      .post('/')
      .send({ ...body, phone: '' });

    expect(response.status).toBe(200);
    expect(response.body.phone).toBe('');
  });

  test.each([
    ['create user', createUserValidation, { name: 'Test User', email: 'test@example.com' }],
    ['update user', updateUserValidation, {}],
    ['update profile', updateProfileValidation, {}]
  ])('normalizes valid phone input before it reaches the %s controller', async (_label, validation, body) => {
    const response = await request(validationApp(validation))
      .post('/')
      .send({
        ...body,
        phone: '+977 984-123-4567'
      });

    expect(response.status).toBe(200);
    expect(response.body.phone).toBe('9841234567');
  });

  test('returns the Nepal mobile validation message for invalid input', async () => {
    const response = await request(validationApp(createUserValidation))
      .post('/')
      .send({
        name: 'Test User',
        email: 'test@example.com',
        phone: '9831234567'
      });

    expect(response.status).toBe(400);
    expect(response.body.errors).toContainEqual({
      field: 'phone',
      message: 'Enter a valid 10-digit Nepal mobile number starting with 97 or 98 (e.g. 98XXXXXXXX)'
    });
  });
});
