const express = require('express');
const router = express.Router();
const { protect, authorize } = require('../middleware/auth');
const { exportPermission } = require('../middleware/exportPermissions');
const {
  exportDuesToExcel,
  exportComplaintsToExcel,
  exportDuesToPDF,
  exportComplaintsToPDF,
  exportOutstandingToExcel,
  exportOutstandingToPDF,
  validateExportPagination,
  validateExportFilters,
  auditExport
} = require('../controllers/exportController');
const { outstandingExportQueryValidation } = require('../middleware/validator');

router.use(protect);
router.use(authorize('admin', 'staff')); // Only admin and staff can export
router.use(validateExportPagination);
router.use(validateExportFilters);

// Dues exports
router.get('/dues/excel', auditExport, exportPermission('dues'), exportDuesToExcel);
router.get('/dues/pdf', auditExport, exportPermission('dues'), exportDuesToPDF);
router.get('/outstanding/excel', outstandingExportQueryValidation, auditExport, exportPermission('outstanding'), exportOutstandingToExcel);
router.get('/outstanding/pdf', outstandingExportQueryValidation, auditExport, exportPermission('outstanding'), exportOutstandingToPDF);

// Complaints exports
router.get('/complaints/excel', auditExport, exportPermission('complaints'), exportComplaintsToExcel);
router.get('/complaints/pdf', auditExport, exportPermission('complaints'), exportComplaintsToPDF);

module.exports = router;
