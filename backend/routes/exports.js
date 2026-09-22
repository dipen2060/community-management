const express = require('express');
const router = express.Router();
const { protect, authorize } = require('../middleware/auth');
const { exportPermission } = require('../middleware/exportPermissions');
const {
  exportDuesToExcel,
  exportComplaintsToExcel,
  exportDuesToPDF,
  exportComplaintsToPDF
} = require('../controllers/exportController');

router.use(protect);
router.use(authorize('admin', 'staff')); // Only admin and staff can export

// Dues exports
router.get('/dues/excel', exportPermission('dues'), exportDuesToExcel);
router.get('/dues/pdf', exportPermission('dues'), exportDuesToPDF);

// Complaints exports
router.get('/complaints/excel', exportPermission('complaints'), exportComplaintsToExcel);
router.get('/complaints/pdf', exportPermission('complaints'), exportComplaintsToPDF);

module.exports = router;
