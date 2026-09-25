const mongoose = require('mongoose');

const exportAuditSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  role: { type: String, enum: ['admin', 'staff'], required: true },
  endpoint: { type: String, required: true, maxlength: 100 },
  format: { type: String, enum: ['excel', 'pdf'], required: true },
  resource: { type: String, enum: ['dues', 'complaints'], required: true },
  parameters: { type: mongoose.Schema.Types.Mixed, default: {} },
  triggeredAt: { type: Date, default: Date.now, index: true }
}, { timestamps: false });

exportAuditSchema.index({ user: 1, triggeredAt: -1 });

module.exports = mongoose.model('ExportAudit', exportAuditSchema);
