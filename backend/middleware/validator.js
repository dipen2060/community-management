const { body, validationResult } = require('express-validator');

// Validation middleware factory
const validate = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
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
  body('phone')
    .optional({ values: 'falsy' })
    .isMobilePhone('any')
    .withMessage('Invalid phone number'),
  validate
];

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
    .optional()
    .isMongoId()
    .withMessage('Invalid staff ID'),
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
    .withMessage('Target sections must be an array'),
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
  createComplaintValidation,
  updateComplaintValidation,
  createNoticeValidation,
  createPollValidation,
  updateProfileValidation
};
