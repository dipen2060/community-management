// routes/complaints.js
const express = require('express');
const router  = express.Router();
const { getComplaints, createComplaint, updateComplaint, getComplaintAttachment, authorizeComplaintUpdate } = require('../controllers/complaintController');
const { protect, authorize } = require('../middleware/auth');
const upload = require('../middleware/upload');
const { createComplaintValidation, updateComplaintValidation } = require('../middleware/validator');

router.use(protect);
router.get('/',       getComplaints);
// Multer must parse multipart fields before body validation; validation cleans up rejected uploads.
router.post('/',      upload.array('attachments', 5), createComplaintValidation, createComplaint); // Max 5 files
router.get('/:id/attachments/:filename', getComplaintAttachment);
router.put('/:id',    updateComplaintValidation, authorizeComplaintUpdate, updateComplaint);
module.exports = router;
