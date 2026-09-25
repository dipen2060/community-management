const User = require('../models/User');
const crypto = require('crypto');

// Generates "firstname.lastname" from full name, lowercase, no special chars
// Handles duplicates by appending a number: ram.bahadur, ram.bahadur2, ram.bahadur3...
async function generateUsername(fullName) {
  const parts = fullName.trim().toLowerCase().split(/\s+/).filter(Boolean);
  const firstName = parts[0] || 'user';
  const lastName  = parts.length > 1 ? parts[parts.length - 1] : '';

  const clean = (s) => s.replace(/[^a-z0-9]/g, '');
  let base = lastName ? `${clean(firstName)}.${clean(lastName)}` : clean(firstName);

  let username = base;
  let counter = 2;
  while (await User.findOne({ username })) {
    username = `${base}${counter}`;
    counter++;
  }
  return username;
}

function generateTemporaryPassword() {
  return crypto.randomBytes(18).toString('base64url');
}

module.exports = { generateUsername, generateTemporaryPassword };
