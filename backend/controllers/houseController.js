const House = require('../models/House');

async function validateAssignment({ owner, tenant, currentId = null }) {
  if (owner && tenant && String(owner) === String(tenant)) {
    const err = new Error('Owner and tenant must be different users');
    err.statusCode = 400;
    throw err;
  }
  for (const [field, label] of [['owner', 'Owner'], ['tenant', 'Tenant']]) {
    const value = field === 'owner' ? owner : tenant;
    if (!value) continue;
    const query = { [field]: value, isOccupied: true };
    if (currentId) query._id = { $ne: currentId };
    const existing = await House.findOne(query).select('houseNo');
    if (existing) {
      const err = new Error(`${label} is already assigned to house ${existing.houseNo}`);
      err.statusCode = 400;
      throw err;
    }
  }
}

exports.getHouses = async (req, res, next) => {
  try {
    const filter = req.user.role === 'resident' ? { $or: [{ owner: req.user._id }, { tenant: req.user._id }] } : {};
    const houses = await House.find(filter).populate('owner', 'name username phone email').populate('tenant', 'name username phone email').sort({ section: 1, houseNo: 1 });
    res.json({ success: true, count: houses.length, data: houses });
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
    res.json({ success: true, data: house });
  } catch (err) { next(err); }
};

exports.deleteHouse = async (req, res, next) => {
  try {
    const house = await House.findById(req.params.id);
    if (!house) return res.status(404).json({ success: false, message: 'House not found' });
    // Preserve dues, complaints, and payment history: archive instead of hard-delete.
    house.isOccupied = false; house.owner = null; house.tenant = null; await house.save();
    res.json({ success: true, message: 'House archived successfully' });
  } catch (err) { next(err); }
};
