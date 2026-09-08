// routes/complaints.js
const express = require('express');
const router  = express.Router();
const { getComplaints, createComplaint, updateComplaint } = require('../controllers/complaintController');
const { protect, authorize } = require('../middleware/auth');
const upload = require('../middleware/upload');
const { createComplaintValidation, updateComplaintValidation } = require('../middleware/validator');

router.use(protect);
router.get('/',       getComplaints);
router.post('/',      upload.array('attachments', 5), createComplaintValidation, createComplaint); // Max 5 files
router.put('/:id',    updateComplaintValidation, updateComplaint);
module.exports = router;
