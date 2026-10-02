// routes/auth.js
const express = require('express');
const router = express.Router();
const rateLimit = require('express-rate-limit');
const { login, getMe } = require('../controllers/authController');
const { protect } = require('../middleware/auth');
const { loginValidation } = require('../middleware/validator');

const disabledPasswordReset = (req, res) => res.status(404).json({
  message: 'Public password reset is disabled. Please contact your neighborhood admin to reset your password.'
});

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: {
    message: 'Too many login attempts from this IP. Please try again after 15 minutes.'
  },
  statusCode: 429,
  skipSuccessfulRequests: true,
});

router.post('/login', loginLimiter, loginValidation, login);
router.post('/forgot-password', disabledPasswordReset);
router.post('/reset-password-token', disabledPasswordReset);
router.get('/me', protect, getMe);
module.exports = router;