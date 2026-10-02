const MAX_MONTHLY_DUE = Number(process.env.MAX_MONTHLY_DUE || 10000);

const normalizeWhitespace = (value) => value.trim().replace(/\s+/g, ' ');

const normalizeHouseNo = (value) =>
  normalizeWhitespace(value).toUpperCase();

const normalizeSection = normalizeWhitespace;

const isValidHouseNo = (value) =>
  typeof value === 'string' &&
  value.length >= 1 &&
  value.length <= 20 &&
  /^[A-Z0-9][A-Z0-9\-\/ ]*$/.test(value);

const isValidSection = (value) =>
  typeof value === 'string' &&
  value.length >= 1 &&
  value.length <= 50 &&
  /^[A-Za-z0-9][A-Za-z0-9 \-]*$/.test(value);

const isValidUserName = (value) =>
  typeof value === 'string' &&
  value.length >= 2 &&
  value.length <= 50 &&
  /^[A-Za-z][A-Za-z ]*$/.test(value);

const isValidMonthlyDue = (value) => {
  if (typeof value !== 'number' && typeof value !== 'string') {
    return false;
  }

  const text = String(value);
  const amount = Number(text);
  return /^\d+(?:\.\d{1,2})?$/.test(text) &&
    Number.isFinite(amount) &&
    amount > 0 &&
    amount <= MAX_MONTHLY_DUE;
};

const isValidPollOptions = (options) => {
  if (!Array.isArray(options) || options.length < 2 || options.length > 10) {
    return false;
  }

  const normalizedOptions = [];
  for (const option of options) {
    if (typeof option !== 'string') {
      return false;
    }
    const normalizedOption = option.trim();
    if (normalizedOption.length < 1 || normalizedOption.length > 100) {
      return false;
    }
    normalizedOptions.push(normalizedOption.toLowerCase());
  }

  return new Set(normalizedOptions).size === normalizedOptions.length;
};

const isValidNewPassword = (password) =>
  typeof password === 'string' &&
  password.length >= 8 &&
  password.length <= 64 &&
  /[A-Z]/.test(password) &&
  /[a-z]/.test(password) &&
  /\d/.test(password) &&
  /[^A-Za-z0-9\s]/.test(password);

const isWithinOneYear = (date, now = new Date()) => {
  const latestAllowed = new Date(now);
  latestAllowed.setFullYear(latestAllowed.getFullYear() + 1);
  return date > now && date <= latestAllowed;
};

module.exports = {
  MAX_MONTHLY_DUE,
  normalizeWhitespace,
  normalizeHouseNo,
  normalizeSection,
  isValidHouseNo,
  isValidSection,
  isValidUserName,
  isValidMonthlyDue,
  isValidPollOptions,
  isValidNewPassword,
  isWithinOneYear
};
