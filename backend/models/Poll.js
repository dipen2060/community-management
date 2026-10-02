const mongoose = require('mongoose');

const pollOptionSchema = new mongoose.Schema({
  text: { type: String, required: true, trim: true, minlength: 1, maxlength: 100 },
  votes: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }] // Array of user IDs who voted for this option
});

const pollSchema = new mongoose.Schema({
  title: { type: String, required: true, trim: true, minlength: 5, maxlength: 100 },
  description: { type: String },
  options: {
    type: [pollOptionSchema],
    required: true,
    validate: {
      validator: options => Array.isArray(options) && options.length >= 2 && options.length <= 10,
      message: 'Poll must have 2-10 options'
    }
  },
  type: { type: String, enum: ['anonymous', 'named'], default: 'anonymous' }, // anonymous = hide who voted, named = show voters
  status: { type: String, enum: ['active', 'closed', 'completed', 'tied'], default: 'active' },
  targetSections: { type: [String], default: [] }, // Empty = all sections can vote
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  endDate: { type: Date }, // Optional end date for poll
  totalVotes: { type: Number, default: 0 },
  outcome: { type: String, enum: ['open', 'winner', 'tie', 'no_votes'], default: 'open' },
  winnerOptionIndexes: { type: [Number], default: [] },
  closedAt: { type: Date },
  closedReason: { type: String, enum: ['expired', 'manual'] },
  round: { type: Number, default: 1, min: 1 },
  parentPoll: { type: mongoose.Schema.Types.ObjectId, ref: 'Poll' },
  runoffPoll: { type: mongoose.Schema.Types.ObjectId, ref: 'Poll' }
}, { timestamps: true, optimisticConcurrency: true });

// Index for efficient queries
pollSchema.index({ status: 1, createdAt: -1 });
pollSchema.index({ targetSections: 1 });
pollSchema.index({ status: 1, endDate: 1 });
pollSchema.index({ parentPoll: 1 }, { unique: true, sparse: true });

module.exports = mongoose.model('Poll', pollSchema);
