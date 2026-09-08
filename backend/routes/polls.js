const express = require('express');
const router = express.Router();
const {
  getPolls,
  getPollById,
  createPoll,
  updatePoll,
  deletePoll,
  votePoll,
  getPollResults
} = require('../controllers/pollController');
const { protect, authorize } = require('../middleware/auth');
const { createPollValidation } = require('../middleware/validator');

router.use(protect);

// Public routes (all authenticated users)
router.get('/', getPolls);
router.get('/:id', getPollById);

// Voting (residents only)
router.post('/:id/vote', authorize('resident'), votePoll);

// Results (admin/staff only, or after voting)
router.get('/:id/results', authorize('admin', 'staff'), getPollResults);

// Admin/Staff only routes
router.post('/', authorize('admin', 'staff'), createPollValidation, createPoll);
router.put('/:id', authorize('admin', 'staff'), updatePoll);
router.delete('/:id', authorize('admin'), deletePoll);

module.exports = router;
