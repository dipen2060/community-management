const Poll = require('../models/Poll');
const User = require('../models/User');
const House = require('../models/House');
const { createNotificationForMany } = require('./notificationController');

// Get all polls (with section filtering for residents)
exports.getPolls = async (req, res) => {
  try {
    const filter = {};
    if (req.query.status) filter.status = req.query.status;

    let polls = await Poll.find(filter)
      .populate('createdBy', 'name')
      .sort({ createdAt: -1 });

    // Residents only see polls targeted at their section (or sent to all = empty targetSections)
    if (req.user.role === 'resident') {
      const myHouse = await House.findOne({ $or: [{ owner: req.user._id }, { tenant: req.user._id }] });
      const mySection = myHouse?.section;
      polls = polls.filter(p => p.targetSections.length === 0 || (mySection && p.targetSections.includes(mySection)));
    }

    // For each poll, check if current user has voted
    polls = polls.map(poll => {
      const pollObj = poll.toObject();
      pollObj.hasVoted = poll.options.some(option => 
        option.votes.some(voterId => voterId.toString() === req.user._id.toString())
      );
      return pollObj;
    });

    res.json({ success: true, count: polls.length, data: polls });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
};

// Get single poll with details
exports.getPollById = async (req, res) => {
  try {
    const poll = await Poll.findById(req.params.id)
      .populate('createdBy', 'name')
      .populate('options.votes', 'name phone');

    if (!poll) return res.status(404).json({ success: false, message: 'Poll not found' });

    // Check if user can view this poll (section-based)
    if (req.user.role === 'resident') {
      const myHouse = await House.findOne({ $or: [{ owner: req.user._id }, { tenant: req.user._id }] });
      const mySection = myHouse?.section;
      if (poll.targetSections.length > 0 && !poll.targetSections.includes(mySection)) {
        return res.status(403).json({ success: false, message: 'You are not authorized to view this poll' });
      }
    }

    // Check if user has voted
    const pollObj = poll.toObject();
    pollObj.hasVoted = poll.options.some(option => 
      option.votes.some(voterId => voterId.toString() === req.user._id.toString())
    );

    // If anonymous voting, hide voter names
    if (poll.type === 'anonymous') {
      pollObj.options = pollObj.options.map(option => ({
        ...option,
        votes: option.votes.map(() => ({ _id: 'anonymous', name: 'Anonymous' }))
      }));
    }

    res.json({ success: true, data: pollObj });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
};

// Create new poll (admin/staff only)
exports.createPoll = async (req, res) => {
  try {
    const { title, description, options, type, targetSections, endDate } = req.body;

    if (!title || !title.trim()) {
      return res.status(400).json({ success: false, message: 'Title is required' });
    }

    if (!options || !Array.isArray(options) || options.length < 2) {
      return res.status(400).json({ success: false, message: 'At least 2 options are required' });
    }

    if (options.some(opt => !opt || !opt.trim())) {
      return res.status(400).json({ success: false, message: 'All options must have text' });
    }

    const sections = Array.isArray(targetSections) ? targetSections.filter(Boolean) : [];

    // Validate end date
    if (endDate && new Date(endDate) <= new Date()) {
      return res.status(400).json({ success: false, message: 'End date must be in the future' });
    }

    const poll = await Poll.create({
      title: title.trim(),
      description: description?.trim() || '',
      options: options.map(opt => ({ text: opt.trim(), votes: [] })),
      type: type || 'anonymous',
      targetSections: sections,
      createdBy: req.user._id,
      endDate: endDate ? new Date(endDate) : null
    });

    await poll.populate('createdBy', 'name');

    // 🔔 Notify residents about new poll
    let residentFilter = { role: 'resident' };
    let recipientIds;
    if (sections.length > 0) {
      const housesInSections = await House.find({ section: { $in: sections } });
      const userIds = new Set();
      housesInSections.forEach(h => {
        if (h.owner) userIds.add(h.owner.toString());
        if (h.tenant) userIds.add(h.tenant.toString());
      });
      recipientIds = Array.from(userIds);
    } else {
      const residents = await User.find(residentFilter).select('_id');
      recipientIds = residents.map(u => u._id);
    }

    const sectionLabel = sections.length > 0 ? ` (${sections.join(', ')})` : '';
    await createNotificationForMany(recipientIds, {
      title: `🗳️ New Poll${sectionLabel}: ${poll.title}`,
      message: poll.description || 'Please cast your vote.',
      type: 'general',
      link: '/polls'
    });

    res.status(201).json({ 
      success: true, 
      data: poll, 
      notifiedCount: recipientIds.length,
      message: 'Poll created successfully'
    });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
};

// Update poll (admin/staff only)
exports.updatePoll = async (req, res) => {
  try {
    const { title, description, status, endDate } = req.body;
    const poll = await Poll.findById(req.params.id);

    if (!poll) return res.status(404).json({ success: false, message: 'Poll not found' });

    // Cannot modify if poll is closed
    if (poll.status === 'closed') {
      return res.status(400).json({ success: false, message: 'Cannot modify a closed poll' });
    }

    // Cannot modify options if there are already votes
    if (poll.totalVotes > 0 && req.body.options) {
      return res.status(400).json({ success: false, message: 'Cannot modify options after voting has started' });
    }

    const update = {};
    if (title) update.title = title.trim();
    if (description !== undefined) update.description = description?.trim() || '';
    if (status) update.status = status;
    if (endDate) update.endDate = new Date(endDate);

    const updatedPoll = await Poll.findByIdAndUpdate(req.params.id, update, { new: true })
      .populate('createdBy', 'name');

    res.json({ success: true, data: updatedPoll, message: 'Poll updated successfully' });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
};

// Delete poll (admin only)
exports.deletePoll = async (req, res) => {
  try {
    const poll = await Poll.findById(req.params.id);
    if (!poll) return res.status(404).json({ success: false, message: 'Poll not found' });

    await Poll.findByIdAndDelete(req.params.id);
    res.json({ success: true, message: 'Poll deleted successfully' });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
};

// Vote on poll (residents only)
exports.votePoll = async (req, res) => {
  try {
    const { optionIndex } = req.body;
    const poll = await Poll.findById(req.params.id);

    if (!poll) return res.status(404).json({ success: false, message: 'Poll not found' });

    if (poll.status === 'closed') {
      return res.status(400).json({ success: false, message: 'This poll is closed for voting' });
    }

    if (poll.endDate && new Date(poll.endDate) < new Date()) {
      return res.status(400).json({ success: false, message: 'This poll has expired' });
    }

    // Check if user can vote (section-based)
    if (req.user.role === 'resident') {
      const myHouse = await House.findOne({ $or: [{ owner: req.user._id }, { tenant: req.user._id }] });
      const mySection = myHouse?.section;
      if (poll.targetSections.length > 0 && !poll.targetSections.includes(mySection)) {
        return res.status(403).json({ success: false, message: 'You are not eligible to vote in this poll' });
      }
    }

    // Check if user has already voted
    const hasVoted = poll.options.some(option => 
      option.votes.some(voterId => voterId.toString() === req.user._id.toString())
    );

    if (hasVoted) {
      return res.status(400).json({ success: false, message: 'You have already voted in this poll' });
    }

    // Validate option index
    if (optionIndex < 0 || optionIndex >= poll.options.length) {
      return res.status(400).json({ success: false, message: 'Invalid option index' });
    }

    // Add vote
    poll.options[optionIndex].votes.push(req.user._id);
    poll.totalVotes += 1;
    await poll.save();

    await poll.populate('createdBy', 'name');

    res.json({ success: true, data: poll, message: 'Vote recorded successfully' });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
};

// Get poll results (admin/staff only, or after voting)
exports.getPollResults = async (req, res) => {
  try {
    const poll = await Poll.findById(req.params.id)
      .populate('createdBy', 'name')
      .populate('options.votes', 'name phone');

    if (!poll) return res.status(404).json({ success: false, message: 'Poll not found' });

    // Calculate percentages
    const results = poll.options.map(option => ({
      text: option.text,
      votes: option.votes.length,
      percentage: poll.totalVotes > 0 ? ((option.votes.length / poll.totalVotes) * 100).toFixed(1) : 0,
      voters: poll.type === 'named' ? option.votes : option.votes.map(() => ({ _id: 'anonymous', name: 'Anonymous' }))
    }));

    res.json({ 
      success: true, 
      data: {
        poll: {
          title: poll.title,
          description: poll.description,
          totalVotes: poll.totalVotes,
          status: poll.status,
          type: poll.type
        },
        results
      }
    });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
};
