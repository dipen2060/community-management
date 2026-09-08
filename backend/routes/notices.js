const express = require('express');
const router  = express.Router();
const { getNotices, createNotice, deleteNotice } = require('../controllers/noticeController');
const { protect, authorize } = require('../middleware/auth');
const { createNoticeValidation } = require('../middleware/validator');

router.use(protect);
router.get('/',       getNotices);
router.post('/',      authorize('admin', 'staff'), createNoticeValidation, createNotice);
router.delete('/:id', authorize('admin'),           deleteNotice);
module.exports = router;
