const { body, validationResult } = require('express-validator');
const fs = require('fs');
const User = require('../models/User');

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
    .notEmpty()
    .withMessage('Email is required')
    .isEmail()
    .withMessage('Invalid email format')
    .normalizeEmail(),
  body('password')
    .notEmpty()
    .withMessage('Password is required')
    .isLength({ min: 6 })
    .withMessage('Password must be at least 6 characters'),
  validate
];

// User creation validation
const createUserValidation = [
  body('name')
    .trim()
    .notEmpty()
    .withMessage('Name is required')
    .isLength({ min: 2, max: 50 })
    .withMessage('Name must be between 2 and 50 characters'),
  body('email')
    .trim()
    .notEmpty()
    .withMessage('Email is required')
    .isEmail()
    .withMessage('Invalid email format')
    .normalizeEmail(),
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
  body('phone')
    .optional({ values: 'falsy' })
    .isMobilePhone('any')
    .withMessage('Invalid phone number'),
  validate
];

const updateUserValidation = [
  body('name')
    .optional()
    .trim()
    .isLength({ min: 2, max: 50 })
    .withMessage('Name must be between 2 and 50 characters'),
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
  body('phone')
    .optional({ values: 'falsy' })
    .isMobilePhone('any')
    .withMessage('Invalid phone number'),
  body('isActive')
    .optional()
    .isBoolean()
    .withMessage('isActive must be a boolean'),
  validate
];

const houseFieldsValidation = [
  body('section')
    .optional()
    .trim()
    .notEmpty()
    .withMessage('Section cannot be empty')
    .isLength({ max: 100 })
    .withMessage('Section must be 100 characters or fewer'),
  body('floor')
    .optional()
    .isFloat({ min: 0 })
    .withMessage('Floor must be a non-negative number'),
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
  body('monthlyDue')
    .optional()
    .isFloat({ min: 0 })
    .withMessage('Monthly due must be a non-negative number'),
  validate
];

const createHouseValidation = [...houseFieldsValidation];
const updateHouseValidation = [...houseFieldsValidation];

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
    .isArray({ min: 2 })
    .withMessage('At least 2 options are required')
    .custom((options) => {
      if (!options.every(opt => typeof opt === 'string' && opt.trim().length > 0)) {
        throw new Error('All options must be non-empty strings');
      }
      return true;
    }),
  body('type')
    .optional()
    .isIn(['anonymous', 'named'])
    .withMessage('Invalid voting type'),
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

// Profile update validation
const updateProfileValidation = [
  body('name')
    .optional()
    .trim()
    .isLength({ min: 2, max: 50 })
    .withMessage('Name must be between 2 and 50 characters'),
  body('phone')
    .optional({ values: 'falsy' })
    .isMobilePhone('any')
    .withMessage('Invalid phone number'),
  body('address')
    .optional({ values: 'falsy' })
    .trim()
    .isLength({ max: 200 })
    .withMessage('Address must be under 200 characters'),
  body('newPassword')
    .optional({ values: 'falsy' })
    .isLength({ min: 6 })
    .withMessage('New password must be at least 6 characters'),
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
  createPollValidation,
  updatePollValidation,
  votePollValidation,
  updateProfileValidation
};
