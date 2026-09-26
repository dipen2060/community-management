const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const User = require('../models/User');
const { sendEmail } = require('../utils/email');

const jwtExpire = process.env.JWT_EXPIRE;
const generateToken = (id) =>
  jwt.sign({ id }, process.env.JWT_SECRET, { expiresIn: jwtExpire });

// Login by EMAIL — unique per user, avoids duplicate-name collision with username
exports.login = async (req, res, next) => {
  try {
    const { email, password } = req.body;
    const user = await User.findOne({ email: email?.trim().toLowerCase() });
    if (!user || !user.isActive || !(await user.matchPassword(password)))
      return res.status(401).json({ success: false, message: 'Invalid email or password' });
    res.json({
      success: true,
      token: generateToken(user._id),
      user: {
        id: user._id,
        name: user.name,
        username: user.username,
        email: user.email,
        role: user.role,
        phone: user.phone,
        address: user.address,
        specialization: user.specialization,
        exportSection: user.exportSection || (user.role === 'admin' ? 'all' : null),
        mustChangePassword: user.mustChangePassword
      }
    });
  } catch (err) {
    next(err);
  }
};

exports.getMe = async (req, res) => {
  const u = req.user;
  res.json({
    success: true,
    user: {
      id: u._id,
      name: u.name,
      username: u.username,
      email: u.email,
      role: u.role,
      phone: u.phone,
      address: u.address,
      specialization: u.specialization,
      exportSection: u.exportSection || (u.role === 'admin' ? 'all' : null),
      mustChangePassword: u.mustChangePassword
    }
  });
};

// 🔑 Forgot password — residents/staff no longer need to ask an admin to
// reset their password for them. Always responds with the same generic
// message whether or not the email exists, so the endpoint can't be used to
// find out which emails are registered.
exports.forgotPassword = async (req, res, next) => {
  try {
    const email = req.body.email?.trim().toLowerCase();
    const genericMessage = 'If an account exists for that email, a password reset link has been sent.';
    if (!email) {
      return res.status(400).json({ success: false, message: 'Email is required' });
    }

    const user = await User.findOne({ email });
    if (!user || !user.isActive) {
      return res.json({ success: true, message: genericMessage });
    }

    const rawToken = crypto.randomBytes(32).toString('hex');
    user.resetPasswordToken = crypto.createHash('sha256').update(rawToken).digest('hex');
    user.resetPasswordExpire = Date.now() + 30 * 60 * 1000; // 30 minutes
    await user.save({ validateBeforeSave: false });

    const resetUrl = `${process.env.CLIENT_URL || 'http://localhost:3000'}/reset-password/${rawToken}`;
    try {
      await sendEmail({
        to: user.email,
        subject: 'Reset your Tole Community password',
        html: `
          <p>Hi ${user.name},</p>
          <p>We received a request to reset your password. This link expires in 30 minutes:</p>
          <p><a href="${resetUrl}">${resetUrl}</a></p>
          <p>If you didn't request this, you can safely ignore this email — your password will stay unchanged.</p>
        `
      });
    } catch (emailErr) {
      // Roll back the token so a broken email transport doesn't leave a
      // dangling, unusable reset request tied to this account.
      user.resetPasswordToken = undefined;
      user.resetPasswordExpire = undefined;
      await user.save({ validateBeforeSave: false });
      throw emailErr;
    }

    res.json({ success: true, message: genericMessage });
  } catch (err) {
    next(err);
  }
};

exports.resetPassword = async (req, res, next) => {
  try {
    const { token } = req.params;
    const { password } = req.body;
    if (!password || password.length < 6) {
      return res.status(400).json({ success: false, message: 'Password must be at least 6 characters' });
    }

    const hashedToken = crypto.createHash('sha256').update(token).digest('hex');
    const user = await User.findOne({
      resetPasswordToken: hashedToken,
      resetPasswordExpire: { $gt: Date.now() }
    }).select('+resetPasswordToken +resetPasswordExpire');

    if (!user) {
      return res.status(400).json({ success: false, message: 'This reset link is invalid or has expired. Please request a new one.' });
    }

    user.password = password; // hashed by the pre('save') hook
    user.mustChangePassword = false;
    user.resetPasswordToken = undefined;
    user.resetPasswordExpire = undefined;
    await user.save();

    res.json({ success: true, message: 'Password reset successfully. You can now log in with your new password.' });
  } catch (err) {
    next(err);
  }
};