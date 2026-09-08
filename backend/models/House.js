const mongoose = require('mongoose');

const houseSchema = new mongoose.Schema({
  houseNo:     { type: String, required: true, unique: true },
  section:     { type: String, required: true, default: 'Section 1' },
  floor:       { type: Number, default: 0 },
  type:        { type: String, enum: ['apartment', 'house', 'shop'], default: 'apartment' },
  owner:       { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  tenant:      { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  monthlyDue:  { type: Number, default: 500 },
  isOccupied:  { type: Boolean, default: true },
  address:     { type: String }
}, { timestamps: true });

module.exports = mongoose.model('House', houseSchema);
