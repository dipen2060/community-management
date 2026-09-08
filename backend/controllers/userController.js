const User = require('../models/User');
const House = require('../models/House');
const { generateUsername, generateDefaultPassword } = require('../utils/userCredentials');

// GET /api/users?role=staff — list users, optionally filtered by role
exports.getUsers = async (req, res) => {
  try {
    const filter = {};
    if (req.query.role) filter.role = req.query.role;
    if (req.user.role === 'resident') {
      filter.role = 'staff';
      filter.isActive = true;
    }
    const users = await User.find(filter).select('-password').sort({ createdAt: -1 });
    res.json({ success: true, count: users.length, data: users });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
};

// GET /api/users/:id — single user detail (admin only)
exports.getUserById = async (req, res) => {
  try {
    const user = await User.findById(req.params.id).select('-password');
    if (!user) return res.status(404).json({ success: false, message: 'User not found' });
    res.json({ success: true, data: user });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
};

// POST /api/users — Admin creates a new user.
// username = auto-generated "firstname.lastname"
// password = auto-generated "firstname@123"
// email = required (unique login identifier — avoids username collision with duplicate names)
exports.createUser = async (req, res) => {
  try {
    const { name, email, phone, role, specialization } = req.body;
    if (!name || !name.trim()) return res.status(400).json({ success: false, message: 'Name is required' });
    if (!email || !email.trim()) return res.status(400).json({ success: false, message: 'Email is required — used as login identifier' });
    if (role === 'staff' && !specialization) {
      return res.status(400).json({ success: false, message: 'Specialization is required for staff.' });
    }

    const emailExists = await User.findOne({ email: email.trim().toLowerCase() });
    if (emailExists) return res.status(400).json({ success: false, message: 'Email already in use' });

    const username = await generateUsername(name);
    const password = generateDefaultPassword(name);

    const user = await User.create({
      name: name.trim(),
      email: email.trim().toLowerCase(),
      username, password, phone,
      role: role || 'resident',
      specialization: role === 'staff' ? specialization : null
    });

    res.status(201).json({
      success: true,
      data: { id: user._id, name: user.name, username: user.username, email: user.email, role: user.role, specialization: user.specialization },
      credentials: { email: user.email, password }, // shown once to admin
      message: `User created! Login — Email: ${user.email} | Password: ${password}`
    });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
};

// PUT /api/users/:id — Admin-only update (name, phone, specialization, isActive).
// Self-edit is blocked at the route level — only admin can call this, and never on their own profile via this endpoint
// being used by residents/staff (frontend doesn't expose it to them).
exports.updateUser = async (req, res) => {
  try {
    const { name, phone, specialization, isActive, role } = req.body;
    const update = {};
    if (name)   update.name = name;
    if (phone !== undefined)  update.phone = phone;
    if (specialization !== undefined) update.specialization = specialization;
    if (isActive !== undefined) update.isActive = isActive;
    if (role) update.role = role;

    // Prevent deactivating the last active admin
    if (isActive === false || role !== 'admin') {
      const targetUser = await User.findById(req.params.id);
      if (targetUser && targetUser.role === 'admin' && targetUser.isActive) {
        const adminCount = await User.countDocuments({ role: 'admin', isActive: true });
        if (adminCount <= 1) {
          return res.status(400).json({ 
            success: false, 
            message: 'Cannot deactivate or change role of the last active admin. Create another admin first.' 
          });
        }
      }
    }

    const user = await User.findByIdAndUpdate(req.params.id, update, { new: true }).select('-password');
    if (!user) return res.status(404).json({ success: false, message: 'User not found' });
    res.json({ success: true, data: user });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
};

// PUT /api/users/:id/reset-password — Admin resets a user's password back to default "firstname@123"
exports.resetPassword = async (req, res) => {
  try {
    const user = await User.findById(req.params.id);
    if (!user) return res.status(404).json({ success: false, message: 'User not found' });
    const newPassword = generateDefaultPassword(user.name);
    user.password = newPassword; // pre-save hook will hash it
    await user.save();
    res.json({ success: true, message: `Password reset to default: ${newPassword}`, newPassword });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
};

// DELETE /api/users/:id — Admin deletes a user
exports.deleteUser = async (req, res) => {
  try {
    if (req.params.id === req.user._id.toString()) {
      return res.status(400).json({ success: false, message: 'You cannot delete your own admin account.' });
    }

    // Prevent deleting the last active admin
    const targetUser = await User.findById(req.params.id);
    if (targetUser && targetUser.role === 'admin' && targetUser.isActive) {
      const adminCount = await User.countDocuments({ role: 'admin', isActive: true });
      if (adminCount <= 1) {
        return res.status(400).json({ 
          success: false, 
          message: 'Cannot delete the last active admin. Create another admin first.' 
        });
      }
    }

    const user = await User.findByIdAndDelete(req.params.id);
    if (!user) return res.status(404).json({ success: false, message: 'User not found' });

    // Clean up house references to prevent orphaned user IDs
    await House.updateMany({ owner: req.params.id }, { $set: { owner: null } });
    await House.updateMany({ tenant: req.params.id }, { $set: { tenant: null } });

    res.json({ success: true, message: 'User deleted' });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
};

// PUT /api/users/me/profile — Self-edit profile (name, phone, password change)
// Residents and staff can edit their own profile
exports.updateMyProfile = async (req, res) => {
  try {
    const { name, phone, address, currentPassword, newPassword } = req.body;
    const user = await User.findById(req.user._id);
    
    if (!user) return res.status(404).json({ success: false, message: 'User not found' });

    // Update name if provided (only regenerate username if the name actually changed —
    // otherwise generateUsername() finds the user's own existing username "taken" and
    // needlessly appends a number every time the profile is saved)
    if (name && name.trim() && name.trim() !== user.name) {
      user.name = name.trim();
      user.username = await generateUsername(name.trim());
    }

    // Update phone if provided
    if (phone !== undefined) {
      user.phone = phone;
    }

    // Update address if provided
    if (address !== undefined) {
      user.address = address.trim ? address.trim() : address;
    }
    
    // Password change - requires current password verification
    if (newPassword) {
      if (!currentPassword) {
        return res.status(400).json({ success: false, message: 'Current password is required to change password' });
      }
      const isMatch = await user.matchPassword(currentPassword);
      if (!isMatch) {
        return res.status(400).json({ success: false, message: 'Current password is incorrect' });
      }
      if (newPassword.length < 6) {
        return res.status(400).json({ success: false, message: 'New password must be at least 6 characters' });
      }
      user.password = newPassword; // pre-save hook (below) hashes it — MUST use .save(), not findByIdAndUpdate,
                                    // since findByIdAndUpdate does NOT trigger the pre('save') bcrypt hook
    }

    await user.save();
    const updatedUser = await User.findById(req.user._id).select('-password');
    
    res.json({ 
      success: true, 
      data: updatedUser,
      message: 'Profile updated successfully'
    });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
};
