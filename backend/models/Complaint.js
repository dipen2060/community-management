const mongoose = require('mongoose');

const complaintSchema = new mongoose.Schema({
  title:        { type: String, required: true },
  description:  { type: String, required: true },
  category:     { type: String, enum: ['water', 'electric', 'lift', 'sanitation', 'security', 'other'], default: 'other' },
  priority:     { type: String, enum: ['low', 'medium', 'high', 'urgent'], default: 'medium' },
  status:       { type: String, enum: ['pending', 'inprogress', 'resolved', 'closed'], default: 'pending' },
  section:      { type: String, required: true }, // auto-filled from submitter's house — where the problem is
  house:        { type: mongoose.Schema.Types.ObjectId, ref: 'House' },
  submittedBy:  { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  assignedTo:   { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  resolution:   { type: String },
  resolvedBy:   { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  resolvedAt:   { type: Date },
  reopenCount:  { type: Number, default: 0 },
  attachments:  [{ type: String }] // Array of file paths for uploaded images/PDFs
}, { timestamps: true });

// Database indexes for performance
complaintSchema.index({ status: 1, section: 1, createdAt: -1 });
complaintSchema.index({ submittedBy: 1, createdAt: -1 });
complaintSchema.index({ assignedTo: 1, status: 1 });
complaintSchema.index({ category: 1, status: 1 });

module.exports = mongoose.model('Complaint', complaintSchema);
