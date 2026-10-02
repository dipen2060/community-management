const House = require('../models/House');
const User = require('../models/User');
const mongoose = require('mongoose');
const { getPagination, applyPagination, buildMeta } = require('../utils/paginate'); 
const { ResidentHouse, syncHouseRelationship } = require('../utils/residentHouses');
const {
  normalizeHouseNo,
  normalizeSection,
  isValidHouseNo,
  isValidSection,
  isValidMonthlyDue,
  MAX_MONTHLY_DUE
} = require('../utils/inputValidation');

const escapeRegExp = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

async function findSectionSpelling(section) {
  if (section === undefined) return undefined;

  const normalizedSection = normalizeSection(String(section));
  if (!isValidSection(normalizedSection)) return normalizedSection;

  const existing = await House.findOne({
    section: new RegExp(`^${escapeRegExp(normalizedSection)}$`, 'i')
  }).select('section').lean();
  return existing?.section || normalizedSection;
}

async function validateAssignment({ owner, tenant, currentId = null }) {
  if (owner && tenant && String(owner) === String(tenant)) {
    const err = new Error('Owner and tenant must be different users');
    err.statusCode = 400;
    throw err;
  }
  const ids = [owner, tenant].filter(Boolean);
  if (!ids.length) return;
  if (ids.some(id => !mongoose.isValidObjectId(id))) {
    const err = new Error('Owner and tenant must be valid users');
    err.statusCode = 400;
    throw err;
  }
  const users = await User.find({ _id: { $in: ids }, role: 'resident', isActive: true }).select('_id').lean();
  if (users.length !== ids.length) {
    const err = new Error('Owner and tenant must be active resident users');
    err.statusCode = 400;
    throw err;
  }
}

function handleAssignmentConflict(err, next) {
  if (err?.statusCode) return next(err);
  if (err?.code !== 11000) return next(err);
  const duplicateField = Object.keys(err.keyPattern || {})[0];
  if (duplicateField === 'houseNo') {
    const conflict = new Error('House number already exists');
    conflict.statusCode = 409;
    return next(conflict);
  }
  const label = duplicateField === 'tenant' ? 'Tenant' : 'Owner';
  const conflict = new Error(`${label} is already assigned to another house`);
  conflict.statusCode = 409;
  return next(conflict);
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
    const no = normalizeHouseNo(String(houseNo || ''));
    if (!isValidHouseNo(no)) return res.status(400).json({ success: false, message: 'Invalid house number' });
    if (await House.exists({ houseNo: new RegExp(`^${escapeRegExp(no)}$`, 'i') })) {
      return res.status(409).json({ success: false, message: 'House number already exists' });
    }
    const amount = Number(monthlyDue ?? 500);
    if (!isValidMonthlyDue(amount)) {
      return res.status(400).json({ success: false, message: `Monthly due must be between 0 and ${MAX_MONTHLY_DUE} with at most 2 decimal places` });
    }
    if (floor !== undefined && (!Number.isInteger(Number(floor)) || Number(floor) < 0 || Number(floor) > 30)) {
      return res.status(400).json({ success: false, message: 'Floor must be an integer between 0 and 30' });
    }
    const normalizedSection = await findSectionSpelling(section);
    if (normalizedSection !== undefined && !isValidSection(normalizedSection)) {
      return res.status(400).json({ success: false, message: 'Invalid section' });
    }
    await validateAssignment({ owner: owner || null, tenant: tenant || null });
    const house = await House.create({ houseNo: no, section: normalizedSection, floor, type, owner: owner || undefined, tenant: tenant || undefined, monthlyDue: amount, isOccupied: isOccupied !== false, address: String(address || '').trim() });
    await syncHouseRelationship(house._id, owner, 'owner', true);
    await syncHouseRelationship(house._id, tenant, 'tenant', true);
    res.status(201).json({ success: true, data: await House.findById(house._id).populate('owner', 'name username phone email').populate('tenant', 'name username phone email') });
  } catch (err) {
    handleAssignmentConflict(err, next);
  }
};

exports.updateHouse = async (req, res, next) => {
  try {
    const current = await House.findById(req.params.id);
    if (!current) return res.status(404).json({ success: false, message: 'House not found' });
    const owner = req.body.owner === '' ? null : (req.body.owner ?? current.owner);
    const tenant = req.body.tenant === '' ? null : (req.body.tenant ?? current.tenant);
    if (req.body.houseNo !== undefined) {
      const no = normalizeHouseNo(String(req.body.houseNo));
      if (!isValidHouseNo(no)) return res.status(400).json({ success: false, message: 'Invalid house number' });
      const duplicate = await House.findOne({
        houseNo: new RegExp(`^${escapeRegExp(no)}$`, 'i'),
        _id: { $ne: current._id }
      }).select('_id');
      if (duplicate) return res.status(409).json({ success: false, message: 'House number already exists' });
    }
    if (req.body.monthlyDue !== undefined && !isValidMonthlyDue(req.body.monthlyDue)) {
      return res.status(400).json({ success: false, message: `Monthly due must be between 0 and ${MAX_MONTHLY_DUE} with at most 2 decimal places` });
    }
    if (req.body.floor !== undefined && (!Number.isInteger(Number(req.body.floor)) || Number(req.body.floor) < 0 || Number(req.body.floor) > 30)) {
      return res.status(400).json({ success: false, message: 'Floor must be an integer between 0 and 30' });
    }
    if (req.body.section !== undefined) {
      req.body.section = await findSectionSpelling(req.body.section);
      if (!isValidSection(req.body.section)) return res.status(400).json({ success: false, message: 'Invalid section' });
    }
    await validateAssignment({ owner, tenant, currentId: current._id });
    const allowed = ['houseNo','section','floor','type','owner','tenant','monthlyDue','isOccupied','address'];
    const update = {};
    for (const key of allowed) if (req.body[key] !== undefined) update[key] = req.body[key];
    if (update.houseNo !== undefined) update.houseNo = normalizeHouseNo(String(update.houseNo));
    if (update.address !== undefined) update.address = String(update.address).trim();
    if (update.monthlyDue !== undefined) update.monthlyDue = Number(update.monthlyDue);
    if (req.body.owner === '') update.owner = null;
    if (req.body.tenant === '') update.tenant = null;
    const house = await House.findOneAndUpdate(
      { _id: req.params.id },
      { $set: update },
      { new: true, runValidators: true }
    ).populate('owner', 'name username phone email').populate('tenant', 'name username phone email');
    if (req.body.owner !== undefined) {
      await syncHouseRelationship(current._id, current.owner, 'owner', false);
      await syncHouseRelationship(current._id, owner, 'owner', true);
    }
    if (req.body.tenant !== undefined) {
      await syncHouseRelationship(current._id, current.tenant, 'tenant', false);
      await syncHouseRelationship(current._id, tenant, 'tenant', true);
    }
    res.json({ success: true, data: house });
  } catch (err) {
    handleAssignmentConflict(err, next);
  }
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
