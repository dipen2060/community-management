const mongoose = require('mongoose');

const houseSchema = new mongoose.Schema({
  houseNo:     { type: String, required: true, unique: true },
  section:     { type: String, required: true, default: 'Section 1', maxlength: 100 },
  floor:       { type: Number, default: 0, min: 0 },
  type:        { type: String, enum: ['apartment', 'house', 'shop'], default: 'apartment' },
  // Legacy denormalized links retained during migration. New multi-house
  // relationships are stored in resident_houses.
  owner:       { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  tenant:      { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  monthlyDue:  { type: Number, default: 500, min: 0 },
  isOccupied:  { type: Boolean, default: true },
  status:      { type: String, enum: ['active', 'archived'], default: 'active', index: true },
  address:     { type: String, maxlength: 200 }
}, { timestamps: true });

houseSchema.index(
  { owner: 1 },
  { unique: true, partialFilterExpression: { owner: { $type: 'objectId' } } }
);
houseSchema.index(
  { tenant: 1 },
  { unique: true, partialFilterExpression: { tenant: { $type: 'objectId' } } }
);

houseSchema.statics.getActiveResidentIds = async function (houses) {
  const referencedIds = [...new Set(houses.flatMap(h => [h.owner, h.tenant]
    .filter(Boolean)
    .map(userId => userId.toString())))];
  if (!referencedIds.length) return [];

  const User = require('./User');
  const residents = await User.find({
    _id: { $in: referencedIds },
    role: 'resident',
    isActive: true
  }).select('_id').lean();
  const validIds = new Set(residents.map(user => user._id.toString()));
  const staleIds = referencedIds.filter(userId => !validIds.has(userId));
  if (staleIds.length) {
    console.warn('Stale house resident references found:', staleIds);
  }
  return residents.map(user => user._id);
};

module.exports = mongoose.model('House', houseSchema);
