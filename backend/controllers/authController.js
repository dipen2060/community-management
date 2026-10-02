const jwt = require('jsonwebtoken');
const User = require('../models/User');
const { normalizeEmail } = require('validator');

const jwtExpire = process.env.JWT_EXPIRE;
const generateToken = (id) =>
  jwt.sign({ id }, process.env.JWT_SECRET, { expiresIn: jwtExpire });

// Login by EMAIL — unique per user, avoids duplicate-name collision with username
exports.login = async (req, res, next) => {
  try {
    const { email, password } = req.body;
    const lowercasedTrimmedEmail = email.trim().toLowerCase();
    const normalizedEmail = normalizeEmail(lowercasedTrimmedEmail) || lowercasedTrimmedEmail;
    const user = await User.findOne({
      email: { $in: [...new Set([lowercasedTrimmedEmail, normalizedEmail])] }
    });
    if (!user) {
      return res.status(401).json({
        success: false,
        message: 'No account found with this email.',
        code: 'USER_NOT_FOUND'
      });
    }
    if (user.isActive === false) {
      return res.status(403).json({
        success: false,
        message: 'This account is deactivated. Please contact the admin.',
        code: 'ACCOUNT_DISABLED'
      });
    }
    if (!(await user.matchPassword(password))) {
      return res.status(401).json({
        success: false,
        message: 'Incorrect password.',
        code: 'WRONG_PASSWORD'
      });
    }
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