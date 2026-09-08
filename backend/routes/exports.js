const express = require('express');
const router = express.Router();
const { protect, authorize } = require('../middleware/auth');
const {
  exportDuesToExcel,
  exportComplaintsToExcel,
  exportDuesToPDF,
  exportComplaintsToPDF
} = require('../controllers/exportController');

router.use(protect);
router.use(authorize('admin', 'staff')); // Only admin and staff can export

// Dues exports
router.get('/dues/excel', exportDuesToExcel);
router.get('/dues/pdf', exportDuesToPDF);

// Complaints exports
router.get('/complaints/excel', exportComplaintsToExcel);
router.get('/complaints/pdf', exportComplaintsToPDF);

module.exports = router;
