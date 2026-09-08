const express = require('express');
const router  = express.Router();
const { getUsers, getUserById, createUser, updateUser, resetPassword, deleteUser, updateMyProfile } = require('../controllers/userController');
const { protect, authorize } = require('../middleware/auth');
const { createUserValidation, updateProfileValidation } = require('../middleware/validator');

const allowStaffDirectoryOrManagement = (req, res, next) => {
  if (['admin', 'staff'].includes(req.user.role)) return next();
  if (req.user.role === 'resident' && req.query.role === 'staff') return next();
  return res.status(403).json({ success: false, message: 'Access denied' });
};

router.use(protect);
router.get('/',                 allowStaffDirectoryOrManagement, getUsers);
router.get('/:id',               authorize('admin'), getUserById);
router.post('/',                 authorize('admin'), createUserValidation, createUser);
router.put('/me/profile',        updateProfileValidation, updateMyProfile); // Self-edit for residents/staff
router.put('/:id',               authorize('admin'), updateUser);
router.put('/:id/reset-password',authorize('admin'), resetPassword);
router.delete('/:id',            authorize('admin'), deleteUser);

module.exports = router;
