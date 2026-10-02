// routes/auth.js
const express = require('express');
const router = express.Router();
const rateLimit = require('express-rate-limit');
const { login, getMe } = require('../controllers/authController');
const { protect } = require('../middleware/auth');
const { loginValidation } = require('../middleware/validator');
const { rateLimitResponse } = require('../middleware/rateLimitResponse');

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: process.env.NODE_ENV === 'production' ? 10 : 100,
  skipSuccessfulRequests: true,
  handler: rateLimitResponse
});

router.post('/login', loginLimiter, loginValidation, login);
router.get('/me', protect, getMe);
module.exports = router;