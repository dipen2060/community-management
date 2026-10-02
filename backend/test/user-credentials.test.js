const { generateRandomPassword } = require('../utils/userCredentials');

test('generates an 8-12 character password with every required character class', () => {
  const password = generateRandomPassword();

  expect(password.length).toBeGreaterThanOrEqual(8);
  expect(password.length).toBeLessThanOrEqual(12);
  expect(password).toMatch(/[A-Z]/);
  expect(password).toMatch(/[a-z]/);
  expect(password).toMatch(/[0-9]/);
  expect(password).toMatch(/[!@#$%^&*()\-_=+]/);
});
