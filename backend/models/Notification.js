const mongoose = require('mongoose');

const notificationSchema = new mongoose.Schema({
  user:    { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  title:   { type: String, required: true },
  message: { type: String, required: true },
  type:    { type: String, enum: ['due', 'overdue', 'complaint', 'notice', 'general'], default: 'general' },
  due:     { type: mongoose.Schema.Types.ObjectId, ref: 'Due' },
  notificationDate: { type: Date },
  link:    { type: String }, // frontend route to navigate to, e.g. '/dues'
  isRead:  { type: Boolean, default: false }
}, { timestamps: true });

notificationSchema.index({ user: 1, isRead: 1, createdAt: -1 });
notificationSchema.index({ type: 1, createdAt: -1 });
notificationSchema.index(
  { user: 1, due: 1, type: 1, notificationDate: 1 },
  { unique: true, partialFilterExpression: { type: 'overdue', due: { $exists: true }, notificationDate: { $exists: true } } }
);

module.exports = mongoose.model('Notification', notificationSchema);
