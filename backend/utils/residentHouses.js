const ResidentHouse = require('../models/ResidentHouse');
const House = require('../models/House');

async function getResidentHouseIds(residentId) {
  const links = await ResidentHouse.find({ resident_id: residentId }).select('house_id').lean();
  if (links.length) return links.map(link => link.house_id);

  const legacyHouses = await House.find({
    $or: [{ owner: residentId }, { tenant: residentId }]
  }).select('_id').lean();
  return legacyHouses.map(house => house._id);
}

async function isResidentLinkedToHouse(residentId, houseId) {
  const linked = await ResidentHouse.exists({
    resident_id: residentId,
    house_id: houseId
  });
  if (linked) return true;

  return House.exists({
    _id: houseId,
    $or: [{ owner: residentId }, { tenant: residentId }]
  });
}

async function syncHouseRelationship(houseId, residentId, relationshipType, enabled) {
  if (!residentId) return;
  if (enabled) {
    await ResidentHouse.updateOne(
      { resident_id: residentId, house_id: houseId, relationship_type: relationshipType },
      { $setOnInsert: { resident_id: residentId, house_id: houseId, relationship_type: relationshipType } },
      { upsert: true }
    );
  } else {
    await ResidentHouse.deleteOne({
      resident_id: residentId,
      house_id: houseId,
      relationship_type: relationshipType
    });
  }
}

async function getHouseResidentIds(house) {
  const links = await ResidentHouse.find({ house_id: house._id }).select('resident_id').lean();
  const ids = new Set(links.map(link => String(link.resident_id)));
  [house.owner, house.tenant].filter(Boolean).forEach(id => ids.add(String(id)));
  return Array.from(ids);
}

// Assigns (or clears) a resident's owner/tenant link on a house, used by both
// user-creation ("make this new resident the owner of house X") and by later
// edits ("this resident already exists, just move them to a different house").
// - Clears whichever house this resident currently holds that role on, first
//   (a resident can only be owner of one house, and tenant of one house, via
//   the legacy House.owner/tenant fields).
// - Pass houseId = null/'' to unlink only.
// - Throws an Error with .statusCode set (400/404/409) on invalid input or conflict.
async function setResidentHouseLink(residentId, houseId, relationshipType) {
  if (!['owner', 'tenant'].includes(relationshipType)) {
    const err = new Error('Relationship type must be owner or tenant');
    err.statusCode = 400;
    throw err;
  }

  const previous = await House.findOne({ [relationshipType]: residentId });
  if (previous && String(previous._id) !== String(houseId || '')) {
    previous[relationshipType] = null;
    await previous.save();
    await syncHouseRelationship(previous._id, residentId, relationshipType, false);
  }

  if (!houseId) return null; // unlink only, nothing more to do

  const house = await House.findById(houseId);
  if (!house) {
    const err = new Error('House not found');
    err.statusCode = 404;
    throw err;
  }
  if (house[relationshipType] && String(house[relationshipType]) !== String(residentId)) {
    const label = relationshipType === 'owner' ? 'an owner' : 'a tenant';
    const err = new Error(`This house already has ${label} assigned`);
    err.statusCode = 409;
    throw err;
  }

  house[relationshipType] = residentId;
  await house.save();
  await syncHouseRelationship(house._id, residentId, relationshipType, true);
  return house;
}

module.exports = {
  ResidentHouse,
  getResidentHouseIds,
  isResidentLinkedToHouse,
  syncHouseRelationship,
  getHouseResidentIds,
  setResidentHouseLink
};