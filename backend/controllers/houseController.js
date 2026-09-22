const House = require('../models/House');
const { getPagination, applyPagination, buildMeta } = require('../utils/paginate'); 
const { ResidentHouse, syncHouseRelationship } = require('../utils/residentHouses');

async function validateAssignment({ owner, tenant, currentId = null }) {
  if (owner && tenant && String(owner) === String(tenant)) {
    const err = new Error('Owner and tenant must be different users');
    err.statusCode = 400;
    throw err;
  }
}

exports.getHouses = async (req, res, next) => {
  try {
    let filter = {};
    if (req.user.role === 'resident') {
      const links = await ResidentHouse.find({ resident_id: req.user._id }).select('house_id').lean();
      filter = links.length
        ? { _id: { $in: links.map(link => link.house_id) } }
        : { $or: [{ owner: req.user._id }, { tenant: req.user._id }] };
    }
    const total = await House.countDocuments(filter);
    const { page, limit } = getPagination(req);

    let query = House.find(filter)
      .populate('owner', 'name username phone email')
      .populate('tenant', 'name username phone email')
      .sort({ section: 1, houseNo: 1 });
    query = applyPagination(query, page, limit);
    const houses = await query;

    res.json({ success: true, ...buildMeta(total, page, limit, houses.length), data: houses });
  } catch (err) { next(err); }
};

exports.createHouse = async (req, res, next) => {
  try {
    const { houseNo, section, floor, type, owner, tenant, monthlyDue, isOccupied, address } = req.body;
    const no = String(houseNo || '').trim();
    if (!no) return res.status(400).json({ success: false, message: 'House number is required' });
    if (await House.exists({ houseNo: no })) return res.status(409).json({ success: false, message: 'House number already exists' });
    if (Number(monthlyDue ?? 500) < 0) return res.status(400).json({ success: false, message: 'Monthly due cannot be negative' });
    await validateAssignment({ owner: owner || null, tenant: tenant || null });
    const house = await House.create({ houseNo: no, section, floor, type, owner: owner || undefined, tenant: tenant || undefined, monthlyDue: Number(monthlyDue ?? 500), isOccupied: isOccupied !== false, address: String(address || '').trim() });
    await syncHouseRelationship(house._id, owner, 'owner', true);
    await syncHouseRelationship(house._id, tenant, 'tenant', true);
    res.status(201).json({ success: true, data: await House.findById(house._id).populate('owner', 'name username phone email').populate('tenant', 'name username phone email') });
  } catch (err) { next(err); }
};

exports.updateHouse = async (req, res, next) => {
  try {
    const current = await House.findById(req.params.id);
    if (!current) return res.status(404).json({ success: false, message: 'House not found' });
    const owner = req.body.owner === '' ? null : (req.body.owner ?? current.owner);
    const tenant = req.body.tenant === '' ? null : (req.body.tenant ?? current.tenant);
    if (req.body.houseNo !== undefined) {
      const no = String(req.body.houseNo).trim();
      if (!no) return res.status(400).json({ success: false, message: 'House number is required' });
      const duplicate = await House.findOne({ houseNo: no, _id: { $ne: current._id } }).select('_id');
      if (duplicate) return res.status(409).json({ success: false, message: 'House number already exists' });
    }
    if (req.body.monthlyDue !== undefined && Number(req.body.monthlyDue) < 0) return res.status(400).json({ success: false, message: 'Monthly due cannot be negative' });
    await validateAssignment({ owner, tenant, currentId: current._id });
    const allowed = ['houseNo','section','floor','type','owner','tenant','monthlyDue','isOccupied','address'];
    const update = {};
    for (const key of allowed) if (req.body[key] !== undefined) update[key] = req.body[key];
    if (update.houseNo !== undefined) update.houseNo = String(update.houseNo).trim();
    if (update.address !== undefined) update.address = String(update.address).trim();
    if (update.monthlyDue !== undefined) update.monthlyDue = Number(update.monthlyDue);
    if (req.body.owner === '') update.owner = null;
    if (req.body.tenant === '') update.tenant = null;
    const house = await House.findByIdAndUpdate(req.params.id, { $set: update }, { new: true, runValidators: true }).populate('owner', 'name username phone email').populate('tenant', 'name username phone email');
    if (req.body.owner !== undefined) {
      await syncHouseRelationship(current._id, current.owner, 'owner', false);
      await syncHouseRelationship(current._id, owner, 'owner', true);
    }
    if (req.body.tenant !== undefined) {
      await syncHouseRelationship(current._id, current.tenant, 'tenant', false);
      await syncHouseRelationship(current._id, tenant, 'tenant', true);
    }
    res.json({ success: true, data: house });
  } catch (err) { next(err); }
};

exports.deleteHouse = async (req, res, next) => {
  try {
    const house = await House.findById(req.params.id);
    if (!house) return res.status(404).json({ success: false, message: 'House not found' });
    // Preserve dues, complaints, and payment history: archive instead of hard-delete.
    house.isOccupied = false; house.owner = null; house.tenant = null; await house.save();
    await ResidentHouse.deleteMany({ house_id: house._id });
    res.json({ success: true, message: 'House archived successfully' });
  } catch (err) { next(err); }
};
