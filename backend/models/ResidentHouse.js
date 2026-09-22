const mongoose = require('mongoose');

const residentHouseSchema = new mongoose.Schema({
  resident_id: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  house_id: { type: mongoose.Schema.Types.ObjectId, ref: 'House', required: true },
  relationship_type: { type: String, enum: ['owner', 'tenant'], required: true }
}, { timestamps: true });

residentHouseSchema.index(
  { resident_id: 1, house_id: 1, relationship_type: 1 },
  { unique: true }
);
residentHouseSchema.index({ resident_id: 1, house_id: 1 });
residentHouseSchema.index({ house_id: 1, relationship_type: 1 });

module.exports = mongoose.model('ResidentHouse', residentHouseSchema, 'resident_houses');
