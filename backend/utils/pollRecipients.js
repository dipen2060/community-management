const User = require('../models/User');
const House = require('../models/House');
const { ResidentHouse } = require('./residentHouses');

async function getPollRecipientIds(targetSections = []) {
  let residentIds;
  if (targetSections.length) {
    const houses = await House.find({ section: { $in: targetSections } }).select('_id owner tenant').lean();
    const houseIds = houses.map(house => house._id);
    const links = houseIds.length
      ? await ResidentHouse.find({ house_id: { $in: houseIds } }).select('resident_id').lean()
      : [];
    const ids = new Set(links.map(link => String(link.resident_id)));
    houses.forEach(house => {
      if (house.owner) ids.add(String(house.owner));
      if (house.tenant) ids.add(String(house.tenant));
    });
    residentIds = [...ids];
  }

  const residents = await User.find({
    role: 'resident',
    isActive: true,
    ...(residentIds ? { _id: { $in: residentIds } } : {})
  }).select('_id').lean();
  return residents.map(user => user._id);
}

module.exports = { getPollRecipientIds };
