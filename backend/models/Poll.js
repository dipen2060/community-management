const mongoose = require('mongoose');

const pollOptionSchema = new mongoose.Schema({
  text: { type: String, required: true },
  votes: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }] // Array of user IDs who voted for this option
});

const pollSchema = new mongoose.Schema({
  title: { type: String, required: true },
  description: { type: String },
  options: [pollOptionSchema],
  type: { type: String, enum: ['anonymous', 'named'], default: 'anonymous' }, // anonymous = hide who voted, named = show voters
  status: { type: String, enum: ['active', 'closed'], default: 'active' },
  targetSections: { type: [String], default: [] }, // Empty = all sections can vote
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  endDate: { type: Date }, // Optional end date for poll
  totalVotes: { type: Number, default: 0 }
}, { timestamps: true });

// Index for efficient queries
pollSchema.index({ status: 1, createdAt: -1 });
pollSchema.index({ targetSections: 1 });

module.exports = mongoose.model('Poll', pollSchema);
