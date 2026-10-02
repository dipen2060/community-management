const express = require('express');
const router  = express.Router();
const { getNotices, createNotice, deleteNotice, expireNotice } = require('../controllers/noticeController');
const { protect, authorize } = require('../middleware/auth');
const { createNoticeValidation, includeExpiredQueryValidation } = require('../middleware/validator');

router.use(protect);
router.get('/',       includeExpiredQueryValidation, getNotices);
router.post('/',      authorize('admin', 'staff'), createNoticeValidation, createNotice);
router.put('/:id/expire', authorize('admin', 'staff'), expireNotice);
router.delete('/:id', authorize('admin'),           deleteNotice);
module.exports = router;
