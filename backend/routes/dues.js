const express = require('express');
const router = express.Router();
const {
  getDues,
  getDueById,
  submitPaymentProof,
  approvePayment,
  rejectPayment,
  payDue,
  generateMonthlyDues,
  getPaymentClusters,
  getPaymentProof,
  getDashboardStats,
  getOutstandingDues,
  getHouseOutstanding
} = require('../controllers/dueController');
const { protect, authorize } = require('../middleware/auth');
const { exportPermission } = require('../middleware/exportPermissions');
const {
  outstandingQueryValidation,
  outstandingHouseIdValidation
} = require('../middleware/validator');
const paymentUpload = require('../middleware/paymentUpload');

router.use(protect);
router.get('/', getDues);
router.get('/stats', getDashboardStats);
router.get('/outstanding', authorize('admin', 'staff'), exportPermission('dues'), outstandingQueryValidation, getOutstandingDues);
router.get(
  '/outstanding/:houseId',
  authorize('admin', 'staff', 'resident'),
  outstandingHouseIdValidation,
  (req, res, next) => req.user.role === 'resident' ? next() : exportPermission('dues')(req, res, next),
  getHouseOutstanding
);
router.get('/clusters', authorize('admin'), getPaymentClusters);
router.get('/:id/proof', getPaymentProof);
router.get('/:id', getDueById);
router.post('/generate', authorize('admin'), generateMonthlyDues);
router.put('/:id/submit-payment', authorize('resident'), paymentUpload.single('proof'), submitPaymentProof);
router.put('/:id/approve-payment', authorize('admin'), approvePayment);
router.put('/:id/reject-payment', authorize('admin'), rejectPayment);
// Legacy endpoint: no longer allowed to bypass the verification workflow.
router.put('/:id/pay', payDue);

module.exports = router;
