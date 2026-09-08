// routes/auth.js
const express = require('express');
const router = express.Router();
const rateLimit = require('express-rate-limit');
const { login, getMe } = require('../controllers/authController');
const { protect } = require('../middleware/auth');
const { loginValidation } = require('../middleware/validator');

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 10, // limit each IP to 10 login attempts per 15 minutes
  message: { success: false, message: 'Too many login attempts, please try again later.' }
});

router.post('/login', loginLimiter, loginValidation, login);
router.get('/me', protect, getMe);
module.exports = router;
