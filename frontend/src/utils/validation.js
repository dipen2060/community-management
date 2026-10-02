import { isValidNepalMobile } from './phone';

export const MAX_MONTHLY_DUE = Number(process.env.REACT_APP_MAX_MONTHLY_DUE || 10000);

export const normalizeSpaces = (value) => value.trim().replace(/\s+/g, ' ');

export const normalizeHouseNo = (value) =>
  normalizeSpaces(value).toUpperCase();

export const normalizeSection = normalizeSpaces;

export const validateHouseNo = (value) => {
  const normalized = normalizeHouseNo(value);
  if (!normalized) return 'House number is required';
  if (normalized.length > 20 || !/^[A-Z0-9][A-Z0-9\-\/ ]*$/.test(normalized)) {
    return 'Use 1-20 characters: letters, numbers, hyphens, slashes, or spaces';
  }
  return '';
};

export const validateHouseForm = (form, houses, editingHouseId) => {
  const errors = {
    houseNo: validateHouseNo(form.houseNo),
    section: validateSection(form.section),
    floor: validateFloor(form.floor),
    monthlyDue: form.monthlyDue === '' ? 'Monthly due is required' : validateMonthlyDue(form.monthlyDue)
  };
  const normalizedHouseNo = normalizeHouseNo(form.houseNo);
  if (!errors.houseNo && houses.some(house =>
    house._id !== editingHouseId &&
    normalizeHouseNo(house.houseNo) === normalizedHouseNo
  )) {
    errors.houseNo = 'This house number already exists';
  }
  return errors;
};

export const validateSection = (value) => {
  const normalized = normalizeSection(value);
  if (!normalized) return 'Section is required';
  if (normalized.length > 50 || !/^[A-Za-z0-9][A-Za-z0-9 \-]*$/.test(normalized)) {
    return 'Use 1-50 characters: letters, numbers, spaces, or hyphens';
  }
  return '';
};

export const validateFloor = (value) => {
  if (value === '' || value === null || value === undefined) return 'Floor is required';
  const floor = Number(value);
  return Number.isInteger(floor) && floor >= 0 && floor <= 30
    ? ''
    : 'Floor must be a whole number from 0 to 30';
};

export const validateMonthlyDue = (value) => {
  if (value === '' || value === null || value === undefined) return '';
  const amount = Number(value);
  return /^\d+(?:\.\d{1,2})?$/.test(String(value)) &&
    Number.isFinite(amount) &&
    amount > 0 &&
    amount <= MAX_MONTHLY_DUE
    ? ''
    : `Monthly due must be greater than 0 and no greater than ${MAX_MONTHLY_DUE} with at most 2 decimal places`;
};

export const normalizeUserName = normalizeSpaces;

export const validateUserName = (value) => {
  const name = normalizeUserName(value);
  return   name.length >= 2 && name.length <= 50 && /^[A-Za-z][A-Za-z ]*$/.test(name)
    ? ''
    : 'Name must be 2-50 characters using Latin letters and spaces only';
};

export const normalizeEmail = (value) => value.trim().toLowerCase();

export const validateEmail = (value) => {
  const email = normalizeEmail(value);
  if (email.length > 100) return 'Email must be 100 characters or fewer';
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? '' : 'Enter a valid email address';
};

export const validateStaffForm = (form) => ({
  name: validateUserName(form.name),
  email: validateEmail(form.email),
  phone: form.phone && !isValidNepalMobile(form.phone)
    ? 'Enter a valid Nepal mobile number'
    : ''
});

export const validateNewPassword = (password) =>
  password.length >= 8 && password.length <= 64 &&
  /[A-Z]/.test(password) && /[a-z]/.test(password) &&
  /\d/.test(password) && /[^A-Za-z0-9\s]/.test(password)
    ? ''
    : 'Password must be 8-64 characters and include an uppercase letter, a lowercase letter, a number, and a special character';

export const validateProfileForm = (form) => {
  const errors = {
    name: validateUserName(form.name),
    phone: form.phone && !isValidNepalMobile(form.phone)
      ? 'Enter a valid Nepal mobile number'
      : '',
    newPassword: form.newPassword ? validateNewPassword(form.newPassword) : '',
    confirmPassword: form.newPassword && form.newPassword !== form.confirmPassword
      ? 'New passwords do not match'
      : ''
  };
  return errors;
};

export const validatePollTitle = (value) =>
  value.trim().length >= 5 && value.trim().length <= 100
    ? ''
    : 'Title must be between 5 and 100 characters';

export const validatePollDescription = (value) =>
  value.length <= 500 ? '' : 'Description must be 500 characters or fewer';

export const validatePollOptions = (options) => {
  if (options.length < 2 || options.length > 10) {
    return 'Poll must have between 2 and 10 options';
  }
  const normalized = [];
  for (const option of options) {
    const trimmed = option.trim();
    if (!trimmed) return 'Each option is required';
    if (trimmed.length > 100) return 'Each option must be 100 characters or fewer';
    normalized.push(trimmed.toLowerCase());
  }
  return new Set(normalized).size === normalized.length
    ? ''
    : 'Options must be unique ignoring case';
};

export const validatePollEndDate = (value, now = new Date()) => {
  if (!value) return 'End date is required';
  const endDate = new Date(value);
  const latestAllowed = new Date(now);
  latestAllowed.setFullYear(latestAllowed.getFullYear() + 1);
  return Number.isFinite(endDate.getTime()) && endDate > now && endDate <= latestAllowed
    ? ''
    : 'End date must be in the future and no more than 1 year ahead';
};

export const validatePollForm = (poll) => ({
  title: validatePollTitle(poll.title),
  description: validatePollDescription(poll.description),
  options: validatePollOptions(poll.options),
  endDate: validatePollEndDate(poll.endDate)
});
