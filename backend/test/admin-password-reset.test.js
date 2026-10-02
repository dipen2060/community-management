jest.mock('../models/User', () => ({
  findById: jest.fn()
}));
jest.mock('../utils/userCredentials', () => ({
  generateUsername: jest.fn(),
  generateTemporaryPassword: jest.fn(),
  generateRandomPassword: jest.fn(() => 'random-one-time-password')
}));
jest.mock('../utils/auditLogger', () => ({
  logAudit: jest.fn().mockResolvedValue(undefined)
}));

const User = require('../models/User');
const { generateRandomPassword, generateTemporaryPassword } = require('../utils/userCredentials');
const { logAudit } = require('../utils/auditLogger');
const { resetPassword } = require('../controllers/userController');

test('admin reset returns a random password once and requires changing it', async () => {
  const user = {
    _id: 'user-id',
    name: 'Resident',
    username: 'resident',
    email: 'resident@example.com',
    isActive: true,
    save: jest.fn().mockResolvedValue(undefined)
  };
  User.findById.mockResolvedValue(user);
  const req = {
    params: { id: 'user-id' },
    user: { _id: 'admin-id', role: 'admin' }
  };
  const res = {
    json: jest.fn(),
    status: jest.fn().mockReturnThis()
  };

  await resetPassword(req, res);

  expect(generateRandomPassword).toHaveBeenCalledTimes(1);
  expect(generateTemporaryPassword).not.toHaveBeenCalled();
  expect(user.password).toBe('random-one-time-password');
  expect(user.mustChangePassword).toBe(true);
  expect(user.save).toHaveBeenCalledTimes(1);
  expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
    success: true,
    temporaryPassword: 'random-one-time-password'
  }));
  const auditDetails = logAudit.mock.calls[0][5];
  expect(JSON.stringify(auditDetails)).not.toContain('random-one-time-password');
  expect(JSON.stringify(res.json.mock.calls[0][0].data)).not.toContain('random-one-time-password');
});
