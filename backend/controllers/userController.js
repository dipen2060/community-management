const User = require('../models/User');
const House = require('../models/House');
const { generateUsername, generateTemporaryPassword } = require('../utils/userCredentials');
const { logAudit } = require('../utils/auditLogger');
const ResidentHouse = require('../models/ResidentHouse');
const Complaint = require('../models/Complaint');
const Due = require('../models/Due');
const Notification = require('../models/Notification');
const Poll = require('../models/Poll');
const Notice = require('../models/Notice');
const { allowedExportSections } = require('../middleware/exportPermissions');

// GET /api/users?role=staff — list users, optionally filtered by role
exports.getUsers = async (req, res) => {
  try {
    const filter = {};
    if (req.query.role) filter.role = req.query.role;
    if (req.user.role === 'resident') {
      filter.role = 'staff';
      filter.isActive = true;
    } else if (req.user.role === 'staff') {
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
// password = cryptographically random temporary password; user must change it on first login
// email = required (unique login identifier — avoids username collision with duplicate names)
exports.createUser = async (req, res) => {
  try {
    const { name, email, phone, role, specialization, exportSection } = req.body;
    const validRoles = ['admin', 'staff', 'resident'];
    const validSpecializations = ['water', 'electric', 'lift', 'sanitation', 'security', 'general'];
    if (role !== undefined && !validRoles.includes(role)) {
      return res.status(400).json({ success: false, message: 'Invalid role' });
    }
    if (specialization !== undefined && specialization !== null && !validSpecializations.includes(specialization)) {
      return res.status(400).json({ success: false, message: 'Invalid specialization' });
    }
    if (!name || !name.trim()) return res.status(400).json({ success: false, message: 'Name is required' });
    if (!email || !email.trim()) return res.status(400).json({ success: false, message: 'Email is required — used as login identifier' });
    if (role === 'staff' && !specialization) {
      return res.status(400).json({ success: false, message: 'Specialization is required for staff.' });
    }
    if (exportSection !== undefined && exportSection !== null && !allowedExportSections.has(exportSection)) {
      return res.status(400).json({ success: false, message: 'Invalid export section' });
    }

    const emailExists = await User.findOne({ email: email.trim().toLowerCase() });
    if (emailExists) return res.status(400).json({ success: false, message: 'Email already in use' });

    const username = await generateUsername(name);
    const password = generateTemporaryPassword();

    const user = await User.create({
      name: name.trim(),
      email: email.trim().toLowerCase(),
      username, password, mustChangePassword: true, phone,
      role: role || 'resident',
      specialization: role === 'staff' ? specialization : null,
      exportSection: role === 'admin' ? 'all' : role === 'staff' ? (exportSection || null) : null
    });

    await logAudit(req.user._id, req.user.role, 'user_created', 'user', user._id, {
      newValues: {
        name: user.name,
        username: user.username,
        email: user.email,
        phone: user.phone,
        role: user.role,
        specialization: user.specialization
      }
    });
    console.info(`Temporary password generated for ${user.email}; deliver it through a secure channel.`);

    res.status(201).json({
      success: true,
      data: { id: user._id, name: user.name, username: user.username, email: user.email, role: user.role, specialization: user.specialization, exportSection: user.exportSection },
      message: 'User created. Deliver the temporary password through a secure channel; it must be changed on first login.'
    });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
};

// PUT /api/users/:id — Admin-only update (name, phone, specialization, isActive).
// Self-edit is blocked at the route level — only admin can call this, and never on their own profile via this endpoint
// being used by residents/staff (frontend doesn't expose it to them).
exports.updateUser = async (req, res) => {
  try {
    const { name, phone, specialization, isActive, role, exportSection } = req.body;
    const update = {};
    if (name)   update.name = name;
    if (phone !== undefined)  update.phone = phone;
    const targetUser = await User.findById(req.params.id).select('-password');
    if (!targetUser) return res.status(404).json({ success: false, message: 'User not found' });
    const validRoles = ['admin', 'staff', 'resident'];
    const validSpecializations = ['water', 'electric', 'lift', 'sanitation', 'security', 'general'];
    if (role !== undefined && !validRoles.includes(role)) {
      return res.status(400).json({ success: false, message: 'Invalid role' });
    }
    if (specialization !== undefined && specialization !== null && !validSpecializations.includes(specialization)) {
      return res.status(400).json({ success: false, message: 'Invalid specialization' });
    }
    const resultingRole = role || targetUser.role;
    if (resultingRole === 'staff' && !(specialization || targetUser.specialization)) {
      return res.status(400).json({ success: false, message: 'Specialization is required for staff.' });
    }
    update.specialization = resultingRole === 'staff' ? (specialization || targetUser.specialization) : null;
    if (isActive !== undefined) update.isActive = isActive;
    if (role) update.role = role;

    if (exportSection !== undefined) {
      if (exportSection !== null && !allowedExportSections.has(exportSection)) {
        return res.status(400).json({ success: false, message: 'Invalid export section' });
      }
      update.exportSection = exportSection;
    } else if (resultingRole === 'admin') {
      update.exportSection = 'all';
    } else if (resultingRole !== 'admin') {
      update.exportSection = null;
    }

    // Prevent deactivating the last active admin
    if (isActive === false || role !== 'admin') {
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

    const user = await User.findByIdAndUpdate(
      req.params.id,
      update,
      { new: true, runValidators: true, context: 'query' }
    ).select('-password');
    if (!user) return res.status(404).json({ success: false, message: 'User not found' });
    if (user.role === 'admin' && user.exportSection !== 'all') {
      user.exportSection = 'all';
      await user.save();
    }
    await logAudit(req.user._id, req.user.role, 'user_edited', 'user', user._id, {
      changedFields: Object.keys(update),
      oldValues: {
        name: targetUser.name,
        phone: targetUser.phone,
        role: targetUser.role,
        specialization: targetUser.specialization,
        isActive: targetUser.isActive
      },
      newValues: {
        name: user.name,
        phone: user.phone,
        role: user.role,
        specialization: user.specialization,
        isActive: user.isActive
      }
    });
    res.json({ success: true, data: user });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
};

// PUT /api/users/:id/reset-password — Admin generates a temporary password that must be changed on first login
exports.resetPassword = async (req, res) => {
  try {
    const user = await User.findById(req.params.id);
    if (!user || !user.isActive) return res.status(404).json({ success: false, message: 'Active user not found' });
    const newPassword = generateTemporaryPassword();
    user.password = newPassword;
    user.mustChangePassword = true;
    await user.save();
    await logAudit(req.user._id, req.user.role, 'user_password_reset', 'user', user._id, {
      reason: 'default_password_reset'
    });
    res.json({ success: true, message: 'Password reset. Deliver the new temporary password through a secure channel; it must be changed on first login.' });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
};

// DELETE /api/users/:id — Admin soft-deletes a user to preserve historical references
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

    const user = await User.findByIdAndUpdate(
      req.params.id,
      { $set: { isActive: false } },
      { new: true, runValidators: true, context: 'query' }
    );
    if (!user) return res.status(404).json({ success: false, message: 'User not found' });

    await ResidentHouse.deleteMany({ resident_id: req.params.id });
    // Remove user references from dependent records so soft-deleted accounts
    // cannot become dangling populate references.
    await Promise.all([
      House.updateMany({ owner: req.params.id }, { $set: { owner: null } }),
      House.updateMany({ tenant: req.params.id }, { $set: { tenant: null } }),
      Complaint.updateMany(
        { $or: [{ submittedBy: req.params.id }, { assignedTo: req.params.id }, { resolvedBy: req.params.id }] },
        { $unset: { submittedBy: '', assignedTo: '', resolvedBy: '' } }
      ),
      Due.updateMany(
        { $or: [{ paidBy: req.params.id }, { submittedBy: req.params.id }, { verifiedBy: req.params.id }] },
        { $unset: { paidBy: '', submittedBy: '', verifiedBy: '' } }
      ),
      Notification.deleteMany({ user: req.params.id }),
      Poll.updateMany(
        { $or: [{ createdBy: req.params.id }, { 'options.votes': req.params.id }] },
        { $pull: { 'options.$[].votes': req.params.id }, $unset: { createdBy: '' } }
      ),
      Notice.updateMany({ createdBy: req.params.id }, { $unset: { createdBy: '' } })
    ]);

    await logAudit(req.user._id, req.user.role, 'user_deleted', 'user', user._id, {
      oldValues: {
        name: user.name,
        username: user.username,
        email: user.email,
        role: user.role,
        isActive: user.isActive
      }
    });

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
      user.mustChangePassword = false;
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
