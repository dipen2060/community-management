const ResidentHouse = require('../models/ResidentHouse');
const House = require('../models/House');
const User = require('../models/User');
const { getResidentHouseIds } = require('../utils/residentHouses');

exports.getResidentHouses = async (req, res) => {
  try {
    const filter = req.user.role === 'resident'
      ? { resident_id: req.user._id }
      : { resident_id: req.query.resident };

    if (!filter.resident_id) {
      return res.status(400).json({ success: false, message: 'Resident is required' });
    }

    let links = await ResidentHouse.find(filter)
      .populate('house_id')
      .populate('resident_id', 'name username role')
      .sort({ createdAt: 1 });

    if (req.user.role === 'resident' && !links.length) {
      const houseIds = await getResidentHouseIds(req.user._id);
      links = await Promise.all(houseIds.map(async houseId => ({
        resident_id: req.user._id,
        house_id: await House.findById(houseId),
        relationship_type: 'legacy'
      })));
    }

    res.json({ success: true, data: links });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

exports.createResidentHouse = async (req, res) => {
  try {
    const { resident_id, house_id, relationship_type } = req.body;
    if (!resident_id || !house_id || !['owner', 'tenant'].includes(relationship_type)) {
      return res.status(400).json({ success: false, message: 'Resident, house, and relationship type are required' });
    }

    const [resident, house] = await Promise.all([
      User.findOne({ _id: resident_id, role: 'resident' }).select('_id'),
      House.findById(house_id).select('_id')
    ]);
    if (!resident || !house) {
      return res.status(404).json({ success: false, message: 'Resident or house not found' });
    }

    const link = await ResidentHouse.findOneAndUpdate(
      { resident_id, house_id, relationship_type },
      { $setOnInsert: { resident_id, house_id, relationship_type } },
      { new: true, upsert: true, runValidators: true }
    );
    res.status(201).json({ success: true, data: link });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

exports.deleteResidentHouse = async (req, res) => {
  try {
    const link = await ResidentHouse.findByIdAndDelete(req.params.id);
    if (!link) return res.status(404).json({ success: false, message: 'House link not found' });
    res.json({ success: true, message: 'House link removed' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};
