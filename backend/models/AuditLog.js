const mongoose = require('mongoose');

const auditLogSchema = new mongoose.Schema({
  actor_id: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  actor_role: { type: String, enum: ['admin', 'staff', 'resident'], required: true },
  action: { type: String, required: true, trim: true, maxlength: 100 },
  target_type: { type: String, required: true, trim: true, maxlength: 50 },
  target_id: { type: mongoose.Schema.Types.ObjectId, required: true },
  details: { type: mongoose.Schema.Types.Mixed, default: {} }
}, {
  timestamps: { createdAt: 'created_at', updatedAt: false }
});

auditLogSchema.index({ created_at: -1 });
auditLogSchema.index({ actor_id: 1, created_at: -1 });
auditLogSchema.index({ action: 1, created_at: -1 });
auditLogSchema.index({ target_type: 1, target_id: 1, created_at: -1 });

auditLogSchema.virtual('id').get(function () {
  return this._id;
});

auditLogSchema.set('toJSON', { virtuals: true });

module.exports = mongoose.model('AuditLog', auditLogSchema);
