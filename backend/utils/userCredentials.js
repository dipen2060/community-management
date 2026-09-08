const User = require('../models/User');

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

// Generates default password "firstname@123" (lowercase first name)
function generateDefaultPassword(fullName) {
  const firstName = fullName.trim().toLowerCase().split(/\s+/)[0] || 'user';
  const clean = firstName.replace(/[^a-z0-9]/g, '');
  return `${clean}@123`;
}

module.exports = { generateUsername, generateDefaultPassword };
