const mongoose = require('mongoose');

const paymentProofAuditSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  due: { type: mongoose.Schema.Types.ObjectId, ref: 'Due', required: true },
  accessedAt: { type: Date, default: Date.now, required: true }
}, { timestamps: false });

paymentProofAuditSchema.index({ due: 1, accessedAt: -1 });
paymentProofAuditSchema.index({ user: 1, accessedAt: -1 });

module.exports = mongoose.model('PaymentProofAudit', paymentProofAuditSchema);
