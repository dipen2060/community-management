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

// Fixed default password given to every newly created account (admin, staff, resident).
// Configurable via DEFAULT_USER_PASSWORD in backend/.env so each deployment can set its own;
// falls back to 'Tole@1234' if not set. Every account still gets mustChangePassword=true,
// so this value only ever works for the very first login before the user picks their own password.
function generateTemporaryPassword() {
  const configured = process.env.DEFAULT_USER_PASSWORD && process.env.DEFAULT_USER_PASSWORD.trim();
  return configured || 'Tole@1234';
}

// Kept for anywhere a truly random, single-use secret is still wanted (e.g. a future
// "generate random password instead" button) — not used for normal account creation anymore.
function generateRandomPassword() {
  return crypto.randomBytes(18).toString('base64url');
}

module.exports = { generateUsername, generateTemporaryPassword, generateRandomPassword };