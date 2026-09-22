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

module.exports = {
  ResidentHouse,
  getResidentHouseIds,
  isResidentLinkedToHouse,
  syncHouseRelationship,
  getHouseResidentIds
};
