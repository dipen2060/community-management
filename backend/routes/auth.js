// routes/auth.js
const express = require('express');
const router = express.Router();
const rateLimit = require('express-rate-limit');
const { login, getMe, forgotPassword, resetPassword } = require('../controllers/authController');
const { protect } = require('../middleware/auth');
const { loginValidation, forgotPasswordValidation, resetPasswordValidation } = require('../middleware/validator');

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 10, // limit each IP to 10 login attempts per 15 minutes
  message: { success: false, message: 'Too many login attempts, please try again later.' }
});

// Separate, tighter limiter — sending reset emails is more expensive
// (and more abuse-prone) than a plain login check.
const forgotPasswordLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  message: { success: false, message: 'Too many password reset requests. Please try again later.' }
});

router.post('/login', loginLimiter, loginValidation, login);
router.get('/me', protect, getMe);
router.post('/forgot-password', forgotPasswordLimiter, forgotPasswordValidation, forgotPassword);
router.post('/reset-password/:token', resetPasswordValidation, resetPassword);
module.exports = router;