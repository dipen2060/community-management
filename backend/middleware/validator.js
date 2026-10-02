const { body, query, param, validationResult } = require('express-validator');
const fs = require('fs');
const mongoose = require('mongoose');
const User = require('../models/User');
const { isValidNepalMobile, normalizeNepalPhone } = require('../utils/phone');
const {
  MAX_MONTHLY_DUE,
  isValidHouseNo,
  isValidSection,
  isValidUserName,
  isValidMonthlyDue,
  isValidPollOptions,
  isValidNewPassword,
  isWithinOneYear,
  normalizeHouseNo,
  normalizeSection,
  normalizeWhitespace
} = require('../utils/inputValidation');

const nepalPhoneValidationMessage =
  'Enter a valid 10-digit Nepal mobile number starting with 97 or 98 (e.g. 98XXXXXXXX)';

const phoneValidation = () => body('phone')
  .optional({ values: 'falsy' })
  .custom(isValidNepalMobile)
  .withMessage(nepalPhoneValidationMessage)
  .customSanitizer(value => normalizeNepalPhone(value) || value);

// Validation middleware factory
const cleanupUploadedFiles = async (req) => {
  const files = req.files || (req.file ? [req.file] : []);
  await Promise.all(files
    .filter(file => file.path)
    .map(file => fs.promises.unlink(file.path).catch(err => {
      if (err.code !== 'ENOENT') {
        console.error('Uploaded file cleanup failed:', err.message);
      }
    })));
};

const validate = async (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    await cleanupUploadedFiles(req);
    return res.status(400).json({
      success: false,
      message: 'Validation failed',
      errors: errors.array().map(err => ({
        field: err.path,
        message: err.msg
      }))
    });
  }
  next();
};

// Login validation
const loginValidation = [
  body('email')
    .trim()
    .toLowerCase()
    .notEmpty()
    .withMessage('Email is required')
    .isEmail()
    .withMessage('Invalid email format'),
  body('password')
    .notEmpty()
    .withMessage('Password is required')
    .isLength({ max: 128 })
    .withMessage('Password must be 128 characters or fewer'),
  validate
];

// User creation validation
const createUserValidation = [
  body('name')
    .isString()
    .bail()
    .trim()
    .customSanitizer(normalizeWhitespace)
    .notEmpty()
    .withMessage('Name is required')
    .custom(isValidUserName)
    .withMessage('Name must be 2-50 characters and contain only Latin letters and spaces'),
  body('email')
    .isString()
    .bail()
    .trim()
    .customSanitizer(value => value.toLowerCase())
    .notEmpty()
    .withMessage('Email is required')
    .isLength({ max: 100 })
    .withMessage('Email must be 100 characters or fewer')
    .isEmail()
    .withMessage('Invalid email format'),
    body('role')
    .optional()
    .isIn(['admin', 'staff', 'resident'])
    .withMessage('Invalid role'),
  body('specialization')
    .if(body('role').equals('staff'))
    .notEmpty()
    .withMessage('Specialization is required for staff')
    .isIn(['water', 'electric', 'lift', 'sanitation', 'security', 'general'])
    .withMessage('Invalid specialization'),
  body('exportSection')
    .optional({ values: 'null' })
    .isIn(['dues', 'complaints', 'residents', 'all'])
    .withMessage('Invalid export section'),
  phoneValidation(),
  body('houseId')
    .optional({ values: 'falsy' })
    .isMongoId()
    .withMessage('Invalid house'),
  body('relationshipType')
    .optional({ values: 'falsy' })
    .isIn(['owner', 'tenant'])
    .withMessage('Relationship type must be owner or tenant'),
  validate
];

const updateUserValidation = [
  body('name')
    .optional()
    .isString()
    .bail()
    .trim()
    .customSanitizer(normalizeWhitespace)
    .custom(isValidUserName)
    .withMessage('Name must be 2-50 characters and contain only Latin letters and spaces'),
  body('email')
    .optional()
    .isString()
    .bail()
    .trim()
    .customSanitizer(value => value.toLowerCase())
    .isLength({ max: 100 })
    .withMessage('Email must be 100 characters or fewer')
    .isEmail()
    .withMessage('Invalid email format'),
  body('role')
    .optional()
    .isIn(['admin', 'staff', 'resident'])
    .withMessage('Invalid role'),
  body('specialization')
    .if(body('role').equals('staff'))
    .notEmpty()
    .withMessage('Specialization is required when changing a user to staff')
    .isIn(['water', 'electric', 'lift', 'sanitation', 'security', 'general'])
    .withMessage('Invalid specialization'),
  phoneValidation(),
  body('isActive')
    .optional()
    .isBoolean()
    .withMessage('isActive must be a boolean'),
  validate
];

const houseNoValidation = (required = false) => {
  let validation = body('houseNo');
  if (required) {
    validation = validation
      .exists()
      .withMessage('House number is required')
      .bail();
  } else {
    validation = validation.optional();
  }

  return validation
    .isString()
    .bail()
    .customSanitizer(normalizeHouseNo)
    .custom(isValidHouseNo)
    .withMessage('House number must be 1-20 characters and start with a letter or number');
};

const houseFieldsValidation = (required = false) => [
  houseNoValidation(required),
  (required
    ? body('section').exists().withMessage('Section is required').bail()
    : body('section').optional())
    .isString()
    .bail()
    .trim()
    .customSanitizer(normalizeSection)
    .notEmpty()
    .withMessage('Section cannot be empty')
    .custom(isValidSection)
    .withMessage('Section must be 1-50 characters and contain only letters, numbers, spaces, or hyphens'),
  (required
    ? body('floor').exists().withMessage('Floor is required').bail()
    : body('floor').optional())
    .isInt({ min: 0, max: 30 })
    .withMessage('Floor must be a non-negative integer')
    .toInt(),
  body('type')
    .optional()
    .isIn(['apartment', 'house', 'shop'])
    .withMessage('Invalid house type'),
  body('owner')
    .optional()
    .custom((value) => value === '' || mongoose.isValidObjectId(value))
    .withMessage('Owner must be a valid user ID or empty'),
  body('tenant')
    .optional()
    .custom((value) => value === '' || mongoose.isValidObjectId(value))
    .withMessage('Tenant must be a valid user ID or empty'),
  body('isOccupied')
    .optional()
    .isBoolean()
    .withMessage('isOccupied must be a boolean')
    .toBoolean(),
  body('address')
    .optional()
    .trim()
    .isLength({ max: 200 })
    .withMessage('Address must be 200 characters or fewer'),
  (required
    ? body('monthlyDue').exists().withMessage('Monthly due is required').bail()
    : body('monthlyDue').optional())
    .custom(isValidMonthlyDue)
    .withMessage(`Monthly due must be a positive number no greater than ${MAX_MONTHLY_DUE} with at most 2 decimal places`)
    .toFloat(),
  validate
];

const createHouseValidation = houseFieldsValidation(true);
const updateHouseValidation = houseFieldsValidation();

// Complaint creation validation
const createComplaintValidation = [
  body('title')
    .trim()
    .notEmpty()
    .withMessage('Title is required')
    .isLength({ min: 5, max: 100 })
    .withMessage('Title must be between 5 and 100 characters'),
  body('description')
    .trim()
    .notEmpty()
    .withMessage('Description is required')
    .isLength({ min: 10, max: 500 })
    .withMessage('Description must be between 10 and 500 characters'),
  body('priority')
    .optional()
    .isIn(['low', 'medium', 'high', 'urgent'])
    .withMessage('Invalid priority'),
  validate
];

// Complaint update validation
const updateComplaintValidation = [
  body('status')
    .optional()
    .isIn(['pending', 'inprogress', 'resolved', 'closed'])
    .withMessage('Invalid status'),
  body('assignedTo')
    .customSanitizer((value, { req }) => (
      ['admin', 'staff'].includes(req.user?.role) ? value : undefined
    ))
    .optional()
    .isMongoId()
    .withMessage('Invalid staff ID')
    .bail()
    .custom(async (value) => {
      const staff = await User.findOne({ _id: value, role: 'staff', isActive: true }).select('_id');
      if (!staff) throw new Error('assignedTo must reference an active staff user');
      return true;
    }),
  body('resolution')
    .if(body('status').equals('resolved'))
    .notEmpty()
    .withMessage('Resolution description is required when resolving')
    .isLength({ min: 10, max: 500 })
    .withMessage('Resolution must be between 10 and 500 characters'),
  validate
];

// Notice creation validation
const createNoticeValidation = [
  body('title')
    .trim()
    .notEmpty()
    .withMessage('Title is required')
    .isLength({ min: 5, max: 100 })
    .withMessage('Title must be between 5 and 100 characters'),
  body('content')
    .trim()
    .notEmpty()
    .withMessage('Content is required')
    .isLength({ min: 10, max: 1000 })
    .withMessage('Content must be between 10 and 1000 characters'),
  body('type')
    .optional()
    .isIn(['general', 'emergency', 'event', 'maintenance'])
    .withMessage('Invalid notice type'),
  body('targetSections')
    .optional()
    .isArray()
    .withMessage('Target sections must be an array')
    .bail()
    .custom((sections) => {
      if (sections.some(section => typeof section !== 'string' || !section.trim() || section.length > 100)) {
        throw new Error('Target sections must contain non-empty strings of 100 characters or fewer');
      }
      return true;
    }),
  body('expiresAt')
    .optional({ values: 'falsy' })
    .isISO8601({ strict: true })
    .withMessage('Expiration date must be a valid date')
    .bail()
    .custom(value => {
      if (new Date(value) <= new Date()) throw new Error('Expiration date must be in the future');
      return true;
    }),
  validate
];

const includeExpiredQueryValidation = [
  query('includeExpired')
    .optional()
    .isIn(['true', 'false'])
    .withMessage('includeExpired must be true or false'),
  validate
];

// Poll creation validation
const createPollValidation = [
  body('title')
    .trim()
    .notEmpty()
    .withMessage('Title is required')
    .isLength({ min: 5, max: 100 })
    .withMessage('Title must be between 5 and 100 characters'),
  body('description')
    .optional()
    .trim()
    .isLength({ max: 500 })
    .withMessage('Description must not exceed 500 characters'),
  body('options')
    .isArray({ min: 2, max: 10 })
    .withMessage('Poll must have between 2 and 10 options')
    .bail()
    .customSanitizer(options => options.map(option =>
      typeof option === 'string' ? option.trim() : option
    ))
    .custom(isValidPollOptions)
    .withMessage('Options must be 1-100 characters and unique ignoring case'),
  body('type')
    .optional()
    .isIn(['anonymous', 'named'])
    .withMessage('Invalid voting type'),
  body('endDate')
    .exists()
    .withMessage('End date is required')
    .bail()
    .notEmpty()
    .withMessage('End date is required')
    .bail()
    .isISO8601()
    .withMessage('Invalid end date format')
    .custom((date) => {
      if (!isWithinOneYear(new Date(date))) {
        throw new Error('End date must be in the future and no more than 1 year ahead');
      }
      return true;
    }),
  validate
];

const updatePollValidation = [
  body('title')
    .optional()
    .trim()
    .isLength({ min: 5, max: 100 })
    .withMessage('Title must be between 5 and 100 characters'),
  body('description')
    .optional()
    .trim()
    .isLength({ max: 500 })
    .withMessage('Description must not exceed 500 characters'),
  body('options')
    .optional()
    .isArray({ min: 2, max: 10 })
    .withMessage('Poll must have between 2 and 10 options')
    .bail()
    .customSanitizer(options => options.map(option =>
      typeof option === 'string' ? option.trim() : option
    ))
    .custom(isValidPollOptions)
    .withMessage('Options must be 1-100 characters and unique ignoring case'),
  body('status')
    .optional()
    .isIn(['active', 'closed'])
    .withMessage('Invalid poll status'),
  body('endDate')
    .optional({ values: 'falsy' })
    .isISO8601()
    .withMessage('Invalid end date format')
    .custom((date) => {
      if (new Date(date) <= new Date()) {
        throw new Error('End date must be in the future');
      }
      return true;
    }),
  validate
];

const votePollValidation = [
  body('optionIndex')
    .exists()
    .withMessage('Option index is required')
    .isInt({ min: 0 })
    .withMessage('Option index must be a non-negative integer')
    .toInt(),
  validate
];

const outstandingQueryValidation = [
  query('section')
    .optional()
    .isString()
    .trim()
    .notEmpty()
    .withMessage('Section must be a non-empty string'),
  query('houseId')
    .optional()
    .isMongoId()
    .withMessage('Invalid house ID'),
  query('page')
    .optional()
    .isInt({ min: 1 })
    .withMessage('Page must be a positive integer')
    .toInt(),
  query('limit')
    .optional()
    .isInt({ min: 1, max: 100 })
    .withMessage('Limit must be an integer between 1 and 100')
    .toInt(),
  validate
];

const outstandingHouseIdValidation = [
  param('houseId')
    .isMongoId()
    .withMessage('Invalid house ID'),
  validate
];

const outstandingExportQueryValidation = [
  query('section')
    .optional()
    .isString()
    .trim()
    .notEmpty()
    .withMessage('Section must be a non-empty string'),
  query('houseId')
    .optional()
    .isMongoId()
    .withMessage('Invalid house ID'),
  query('page')
    .optional()
    .isInt({ min: 1 })
    .withMessage('Page must be a positive integer'),
  query('limit')
    .optional()
    .isInt({ min: 1, max: 1000 })
    .withMessage('Limit must be a positive integer within the export maximum'),
  validate
];

// Profile update validation
const updateProfileValidation = [
  body('name')
    .optional()
    .isString()
    .bail()
    .trim()
    .customSanitizer(normalizeWhitespace)
    .custom(isValidUserName)
    .withMessage('Name must be 2-50 characters and contain only Latin letters and spaces'),
  phoneValidation(),
  body('address')
    .optional({ values: 'falsy' })
    .trim()
    .isLength({ max: 200 })
    .withMessage('Address must be under 200 characters'),
  body('newPassword')
    .optional({ values: 'falsy' })
    .custom(isValidNewPassword)
    .withMessage('New password must be 8-64 characters and include uppercase, lowercase, a number, and a special character'),
  body('currentPassword')
    .if(body('newPassword').notEmpty())
    .notEmpty()
    .withMessage('Current password is required to change password'),
  validate
];

module.exports = {
  validate,
  loginValidation,
  createUserValidation,
  updateUserValidation,
  createHouseValidation,
  updateHouseValidation,
  createComplaintValidation,
  updateComplaintValidation,
  createNoticeValidation,
  includeExpiredQueryValidation,
  createPollValidation,
  updatePollValidation,
  votePollValidation,
  outstandingQueryValidation,
  outstandingHouseIdValidation,
  outstandingExportQueryValidation,
  updateProfileValidation
};