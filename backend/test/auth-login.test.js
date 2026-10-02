const express = require('express');
const request = require('supertest');

jest.mock('../models/User', () => ({
  findOne: jest.fn()
}));

process.env.JWT_SECRET = 'test-login-secret';
process.env.JWT_EXPIRE = '1h';

const User = require('../models/User');
const app = express();
app.set('trust proxy', 1);
app.use(express.json());
app.use('/auth', require('../routes/auth'));

const activeUser = (matchPassword = jest.fn().mockResolvedValue(true)) => ({
  _id: 'user-id',
  name: 'Resident',
  username: 'resident',
  email: 'resident@gmail.com',
  role: 'resident',
  isActive: true,
  mustChangePassword: true,
  matchPassword
});

describe('login errors and rate limiting', () => {
  beforeEach(() => {
    User.findOne.mockReset();
  });

  test('returns a distinct error when no account matches the email', async () => {
    User.findOne.mockResolvedValue(null);

    const response = await request(app)
      .post('/auth/login')
      .send({ email: 'unknown@example.com', password: 'valid-pass' });

    expect(response.status).toBe(401);
    expect(response.body).toEqual({
      success: false,
      message: 'No account found with this email.',
      code: 'USER_NOT_FOUND'
    });
  });

  test('returns a distinct error for a deactivated account', async () => {
    User.findOne.mockResolvedValue({ ...activeUser(), isActive: false });

    const response = await request(app)
      .post('/auth/login')
      .send({ email: 'disabled@example.com', password: 'valid-pass' });

    expect(response.status).toBe(403);
    expect(response.body).toEqual({
      success: false,
      message: 'This account is deactivated. Please contact the admin.',
      code: 'ACCOUNT_DISABLED'
    });
  });

  test('returns a distinct error for an incorrect password', async () => {
    User.findOne.mockResolvedValue(activeUser(jest.fn().mockResolvedValue(false)));

    const response = await request(app)
      .post('/auth/login')
      .send({ email: 'resident@gmail.com', password: 'wrong-pass' });

    expect(response.status).toBe(401);
    expect(response.body).toEqual({
      success: false,
      message: 'Incorrect password.',
      code: 'WRONG_PASSWORD'
    });
  });

  test('continues to accept a short legacy password at login', async () => {
    User.findOne.mockResolvedValue(activeUser());

    const response = await request(app)
      .post('/auth/login')
      .send({ email: 'resident@example.com', password: 'x' });

    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
  });

  test.each(['/auth/forgot-password', '/auth/reset-password-token'])(
    'disables public password reset at %s',
    async path => {
      const response = await request(app).post(path).send({ email: 'resident@example.com' });

      expect(response.status).toBe(404);
      expect(response.body).toEqual({
        message: 'Public password reset is disabled. Please contact your neighborhood admin to reset your password.'
      });
    }
  );

  test('finds a Gmail-dot-normalized account while retaining the submitted address', async () => {
    const user = activeUser();
    User.findOne.mockImplementation(async filter => {
      expect(filter.email.$in).toEqual(expect.arrayContaining([
        'first.last+tag@gmail.com',
        'firstlast@gmail.com'
      ]));
      return user;
    });

    const response = await request(app)
      .post('/auth/login')
      .send({ email: ' First.Last+Tag@Gmail.com ', password: 'valid-pass' });

    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
    expect(response.body.user.mustChangePassword).toBe(true);
  });

  test('returns the dedicated JSON rate-limit response after 10 failed attempts', async () => {
    User.findOne.mockResolvedValue(null);
    const responses = [];
    for (let attempt = 0; attempt < 11; attempt += 1) {
      responses.push(await request(app)
        .post('/auth/login')
        .set('X-Forwarded-For', '203.0.113.10')
        .send({ email: 'unknown@example.com', password: 'valid-pass' }));
    }

    expect(responses.slice(0, 10).every(response => response.status === 401)).toBe(true);
    const response = responses[10];
    expect(response.status).toBe(429);
    expect(response.body).toEqual({
      message: 'Too many login attempts from this IP. Please try again after 15 minutes.'
    });

    const currentUserResponse = await request(app).get('/auth/me');
    expect(currentUserResponse.status).toBe(401);
    expect(currentUserResponse.body.code).not.toBe('RATE_LIMITED');
  });
});
