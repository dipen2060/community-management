require('../config/env');
const mongoose = require('mongoose');
const House = require('../models/House');
const ResidentHouse = require('../models/ResidentHouse');

async function migrate() {
  await mongoose.connect(process.env.MONGO_URI);
  const houses = await House.find({
    $or: [{ owner: { $ne: null } }, { tenant: { $ne: null } }]
  }).select('_id owner tenant').lean();

  const operations = [];
  houses.forEach(house => {
    if (house.owner) {
      operations.push({
        updateOne: {
          filter: { resident_id: house.owner, house_id: house._id, relationship_type: 'owner' },
          update: { $setOnInsert: { resident_id: house.owner, house_id: house._id, relationship_type: 'owner' } },
          upsert: true
        }
      });
    }
    if (house.tenant) {
      operations.push({
        updateOne: {
          filter: { resident_id: house.tenant, house_id: house._id, relationship_type: 'tenant' },
          update: { $setOnInsert: { resident_id: house.tenant, house_id: house._id, relationship_type: 'tenant' } },
          upsert: true
        }
      });
    }
  });

  if (operations.length) await ResidentHouse.bulkWrite(operations, { ordered: false });
  console.log(`Migrated ${operations.length} resident-house relationships.`);
}

migrate()
  .then(() => mongoose.disconnect())
  .catch(error => {
    console.error('Resident-house migration failed:', error);
    mongoose.disconnect().finally(() => process.exitCode = 1);
  });
