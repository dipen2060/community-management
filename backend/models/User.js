const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const userSchema = new mongoose.Schema({
  name:     { type: String, required: true },
  username: { type: String, required: true, unique: true }, // display identifier e.g. ram.bahadur
  email:    { type: String, required: true, unique: true }, // login identifier — must be unique
  password: { type: String, required: true },
  phone:    { type: String },
  address:  { type: String },
  role:     { type: String, enum: ['admin', 'staff', 'resident'], default: 'resident' },
  specialization: { type: String, enum: ['water', 'electric', 'lift', 'sanitation', 'security', 'general', null], default: null },
  isActive: { type: Boolean, default: true }
}, { timestamps: true });

userSchema.pre('save', async function (next) {
  if (!this.isModified('password')) return next();
  this.password = await bcrypt.hash(this.password, 10);
  next();
});

userSchema.methods.matchPassword = async function (enteredPassword) {
  return await bcrypt.compare(enteredPassword, this.password);
};

module.exports = mongoose.model('User', userSchema);
