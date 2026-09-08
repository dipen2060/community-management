const mongoose = require('mongoose');

const paymentProofSchema = new mongoose.Schema({
  originalName: { type: String, required: true },
  fileName:     { type: String, required: true },
  url:          { type: String, required: true },
  mimeType:     { type: String, required: true },
  size:         { type: Number, required: true },
  uploadedAt:   { type: Date, default: Date.now }
}, { _id: false });

const paymentAttemptSchema = new mongoose.Schema({
  submittedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  paymentSubmittedAt: { type: Date, default: Date.now },
  paymentMethod: { type: String, enum: ['cash', 'bank_transfer', 'digital_wallet'] },
  paymentReference: { type: String, trim: true, maxlength: 120 },
  declaredAmount: { type: Number, min: 0 },
  paymentProof: { type: paymentProofSchema, required: true },
  status: { type: String, enum: ['verification_pending', 'approved', 'rejected'], default: 'verification_pending' },
  rejectionReason: { type: String, trim: true, maxlength: 500 },
  verifiedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  verifiedAt: { type: Date }
}, { _id: true });

const dueSchema = new mongoose.Schema({
  house:       { type: mongoose.Schema.Types.ObjectId, ref: 'House', required: true },
  month:       { type: Number, required: true, min: 1, max: 12 },
  year:        { type: Number, required: true, min: 2000 },
  amount:      { type: Number, required: true, min: 0 },
  fine:        { type: Number, default: 0, min: 0 },
  status:      {
    type: String,
    enum: ['pending', 'overdue', 'verification_pending', 'paid'],
    default: 'pending'
  },
  dueDate:     { type: Date },
  paidDate:    { type: Date },
  receiptNo:   { type: String, trim: true },
  paidBy:      { type: mongoose.Schema.Types.ObjectId, ref: 'User' },

  // Payment verification workflow
  submittedBy:      { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  paymentSubmittedAt: { type: Date },
  paymentMethod:    { type: String, enum: ['cash', 'bank_transfer', 'digital_wallet'] },
  paymentReference: { type: String, trim: true, maxlength: 120 },
  declaredAmount:   { type: Number, min: 0 },
  paymentProof:     { type: paymentProofSchema, default: null },
  rejectionReason:  { type: String, trim: true, maxlength: 500 },
  verifiedBy:       { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  verifiedAt:       { type: Date },
  paymentAttempts:  { type: [paymentAttemptSchema], default: [] }
}, { timestamps: true });

// A house can have only one due for a given month/year.
dueSchema.index({ house: 1, month: 1, year: 1 }, { unique: true });
dueSchema.index({ status: 1, month: 1, year: 1 });
dueSchema.index({ dueDate: 1, status: 1 });
dueSchema.index({ submittedBy: 1, paymentSubmittedAt: -1 });
dueSchema.index({ verifiedBy: 1, verifiedAt: -1 });

module.exports = mongoose.model('Due', dueSchema);
