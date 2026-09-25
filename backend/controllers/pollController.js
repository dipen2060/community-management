const Poll = require('../models/Poll');
const User = require('../models/User');
const House = require('../models/House');
const { createNotificationForMany } = require('./notificationController');
const { getResidentHouseIds, ResidentHouse } = require('../utils/residentHouses');
const { getPagination, buildMeta } = require('../utils/paginate');

// Get all polls (with section filtering for residents)
exports.getPolls = async (req, res, next) => {
  try {
    const filter = {};
    if (req.query.status) filter.status = req.query.status;

    let polls = await Poll.find(filter)
      .populate('createdBy', 'name')
      .sort({ createdAt: -1 });

    // Residents only see polls targeted at their section (or sent to all = empty targetSections)
    if (req.user.role === 'resident') {
      const houseIds = await getResidentHouseIds(req.user._id);
      const linkedHouses = await House.find({ _id: { $in: houseIds } }).select('section').lean();
      const sections = new Set(linkedHouses.map(house => house.section).filter(Boolean));
      polls = polls.filter(p => p.targetSections.length === 0 || p.targetSections.some(section => sections.has(section)));
    }

    // For each poll, check if current user has voted
    polls = polls.map(poll => {
      const pollObj = poll.toObject();
      pollObj.hasVoted = poll.options.some(option => 
        option.votes.some(voterId => voterId.toString() === req.user._id.toString())
      );
      if (poll.type === 'anonymous') {
        pollObj.options = pollObj.options.map(option => ({
          ...option,
          votes: option.votes.map(() => ({ _id: 'anonymous', name: 'Anonymous' }))
        }));
      }
      return pollObj;
    });

    const { page, limit } = getPagination(req);
    const total = polls.length;
    const data = page ? polls.slice((page - 1) * limit, page * limit) : polls;
    res.json({ success: true, ...buildMeta(total, page, limit, data.length), data });
  } catch (err) { next(err); }
};

// Get single poll with details
exports.getPollById = async (req, res, next) => {
  try {
    const poll = await Poll.findById(req.params.id)
      .populate('createdBy', 'name')
      .populate('options.votes', 'name phone');

    if (!poll) return res.status(404).json({ success: false, message: 'Poll not found' });

    // Check if user can view this poll (section-based)
    if (req.user.role === 'resident') {
      const houseIds = await getResidentHouseIds(req.user._id);
      const linkedHouses = await House.find({ _id: { $in: houseIds } }).select('section').lean();
      const sections = new Set(linkedHouses.map(house => house.section).filter(Boolean));
      if (poll.targetSections.length > 0 && !poll.targetSections.some(section => sections.has(section))) {
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
  } catch (err) { next(err); }
};

// Create new poll (admin/staff only)
exports.createPoll = async (req, res, next) => {
  try {
    const { title, description, options, type, targetSections, endDate } = req.body;

    if (!title || !title.trim()) {
      return res.status(400).json({ success: false, message: 'Title is required' });
    }

    if (!options || !Array.isArray(options) || options.length < 2) {
      return res.status(400).json({ success: false, message: 'At least 2 options are required' });
    }

    if (options.some(opt => typeof opt !== 'string' || !opt.trim())) {
      return res.status(400).json({ success: false, message: 'All options must have text' });
    }
    if (type !== undefined && !['anonymous', 'named'].includes(type)) {
      return res.status(400).json({ success: false, message: 'Invalid poll type' });
    }

    const sections = Array.isArray(targetSections) ? targetSections.filter(Boolean) : [];

    // Validate end date
    if (endDate && (!Number.isFinite(new Date(endDate).getTime()) || new Date(endDate) <= new Date())) {
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
      const houseIds = housesInSections.map(house => house._id);
      const links = await ResidentHouse.find({ house_id: { $in: houseIds } }).select('resident_id').lean();
      const userIds = new Set(links.map(link => link.resident_id.toString()));
      housesInSections.forEach(h => {
        if (h.owner) userIds.add(h.owner.toString());
        if (h.tenant) userIds.add(h.tenant.toString());
      });
      recipientIds = Array.from(userIds);
    } else {
      const residents = await User.find({ ...residentFilter, isActive: true }).select('_id');
      recipientIds = residents.map(u => u._id);
    }

    const sectionLabel = sections.length > 0 ? ` (${sections.join(', ')})` : '';
    const notificationResult = await createNotificationForMany(recipientIds, {
      title: `🗳️ New Poll${sectionLabel}: ${poll.title}`,
      message: poll.description || 'Please cast your vote.',
      type: 'general',
      link: '/polls'
    });

    res.status(201).json({ 
      success: true, 
      data: poll, 
      notifiedCount: recipientIds.length,
      notificationDelivered: notificationResult.success,
      warning: notificationResult.success ? undefined : 'Poll was saved, but notifications could not be delivered.',
      message: 'Poll created successfully'
    });
  } catch (err) { next(err); }
};

// Update poll (admin/staff only)
exports.updatePoll = async (req, res, next) => {
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
    if (status !== undefined) {
      if (!['active', 'closed'].includes(status)) {
        return res.status(400).json({ success: false, message: 'Invalid poll status' });
      }
      update.status = status;
    }
    if (endDate !== undefined) {
      const parsedEndDate = new Date(endDate);
      if (!Number.isFinite(parsedEndDate.getTime()) || parsedEndDate <= new Date()) {
        return res.status(400).json({ success: false, message: 'End date must be in the future' });
      }
      update.endDate = parsedEndDate;
    }

    const updatedPoll = await Poll.findByIdAndUpdate(req.params.id, update, { new: true, runValidators: true })
      .populate('createdBy', 'name');

    res.json({ success: true, data: updatedPoll, message: 'Poll updated successfully' });
  } catch (err) { next(err); }
};

// Delete poll (admin only)
exports.deletePoll = async (req, res, next) => {
  try {
    const poll = await Poll.findById(req.params.id);
    if (!poll) return res.status(404).json({ success: false, message: 'Poll not found' });

    await Poll.findByIdAndDelete(req.params.id);
    res.json({ success: true, message: 'Poll deleted successfully' });
  } catch (err) { next(err); }
};

// Vote on poll (residents only)
exports.votePoll = async (req, res, next) => {
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
      const houseIds = await getResidentHouseIds(req.user._id);
      const linkedHouses = await House.find({ _id: { $in: houseIds } }).select('section').lean();
      const sections = new Set(linkedHouses.map(house => house.section).filter(Boolean));
      if (poll.targetSections.length > 0 && !poll.targetSections.some(section => sections.has(section))) {
        return res.status(403).json({ success: false, message: 'You are not eligible to vote in this poll' });
      }
    }

    // Validate option index
    if (optionIndex < 0 || optionIndex >= poll.options.length) {
      return res.status(400).json({ success: false, message: 'Invalid option index' });
    }

    const updatedPoll = await Poll.findOneAndUpdate(
      {
        _id: req.params.id,
        status: 'active',
        $or: [{ endDate: null }, { endDate: { $gt: new Date() } }],
        'options.votes': { $ne: req.user._id }
      },
      {
        $push: { [`options.${optionIndex}.votes`]: req.user._id },
        $inc: { totalVotes: 1 }
      },
      { new: true, runValidators: true }
    ).populate('createdBy', 'name');
    if (!updatedPoll) {
      return res.status(409).json({ success: false, message: 'You have already voted or this poll is no longer available.' });
    }

    const pollResponse = updatedPoll.toObject();
    if (updatedPoll.type === 'anonymous') {
      pollResponse.options = pollResponse.options.map(option => ({
        ...option,
        votes: option.votes.map(() => ({ _id: 'anonymous', name: 'Anonymous' }))
      }));
    }
    res.json({ success: true, data: pollResponse, message: 'Vote recorded successfully' });
  } catch (err) { next(err); }
};

// Get poll results (admin/staff only, or after voting)
exports.getPollResults = async (req, res, next) => {
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
  } catch (err) { next(err); }
};
