const express = require('express');
const request = require('supertest');

jest.mock('../models/User', () => ({
  findOne: jest.fn()
}));

process.env.JWT_SECRET = 'test-login-secret';
process.env.JWT_EXPIRE = '1h';

const User = require('../models/User');
const app = express();
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

  test('returns the standard JSON rate-limit response after failed attempts', async () => {
    User.findOne.mockResolvedValue(null);
    let response;
    for (let attempt = 0; attempt < 105; attempt += 1) {
      response = await request(app)
        .post('/auth/login')
        .send({ email: 'unknown@example.com', password: 'valid-pass' });
    }

    expect(response.status).toBe(429);
    expect(response.body).toMatchObject({
      success: false,
      code: 'RATE_LIMITED'
    });
    expect(response.body.message).toMatch(/^Too many attempts\. Please try again in \d+ minutes\.$/);

    const currentUserResponse = await request(app).get('/auth/me');
    expect(currentUserResponse.status).toBe(401);
    expect(currentUserResponse.body.code).not.toBe('RATE_LIMITED');
  });
});
