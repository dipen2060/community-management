const express = require('express');
const router = express.Router();
const {
  getResidentHouses,
  createResidentHouse,
  deleteResidentHouse
} = require('../controllers/residentHouseController');
const { protect, authorize } = require('../middleware/auth');

router.use(protect);
router.get('/', getResidentHouses);
router.post('/', authorize('admin', 'staff'), createResidentHouse);
router.delete('/:id', authorize('admin', 'staff'), deleteResidentHouse);

module.exports = router;
