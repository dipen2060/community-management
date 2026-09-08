const jwt = require('jsonwebtoken');
const User = require('../models/User');

const generateToken = (id) =>
  jwt.sign({ id }, process.env.JWT_SECRET, { expiresIn: process.env.JWT_EXPIRE });

// Login by EMAIL — unique per user, avoids duplicate-name collision with username
exports.login = async (req, res) => {
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
        specialization: user.specialization
      }
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
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
      specialization: u.specialization
    }
  });
};
