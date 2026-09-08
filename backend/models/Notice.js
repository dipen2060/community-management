const mongoose = require('mongoose');

const noticeSchema = new mongoose.Schema({
  title:      { type: String, required: true },
  content:    { type: String, required: true },
  type:       { type: String, enum: ['general', 'emergency', 'event', 'maintenance'], default: 'general' },
  targetSections: { type: [String], default: [] }, // empty array = all sections
  createdBy:  { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  isActive:   { type: Boolean, default: true }
}, { timestamps: true });

// Database indexes for performance
noticeSchema.index({ isActive: 1, createdAt: -1 });
noticeSchema.index({ type: 1, isActive: 1 });
noticeSchema.index({ createdBy: 1, createdAt: -1 });

module.exports = mongoose.model('Notice', noticeSchema);
