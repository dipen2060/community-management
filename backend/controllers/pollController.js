const Poll = require('../models/Poll');
const House = require('../models/House');
const { createNotificationForMany } = require('./notificationController');
const { getResidentHouseIds } = require('../utils/residentHouses');
const { getPagination, buildMeta } = require('../utils/paginate');
const { getPollRecipientIds } = require('../utils/pollRecipients');
const { finalizeExpiredPolls, finalizePoll } = require('../utils/pollFinalizer');
const { isValidPollOptions, isWithinOneYear } = require('../utils/inputValidation');

async function residentCanViewPoll(residentId, poll) {
  if (!poll.targetSections.length) return true;
  const houseIds = await getResidentHouseIds(residentId);
  const linkedHouses = await House.find({ _id: { $in: houseIds } }).select('section').lean();
  const sections = new Set(linkedHouses.map(house => house.section).filter(Boolean));
  return poll.targetSections.some(section => sections.has(section));
}

// Get all polls (with section filtering for residents)
exports.getPolls = async (req, res, next) => {
  try {
    await finalizeExpiredPolls();
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
        option.votes.some(voterId => String(voterId._id || voterId) === String(req.user._id))
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
    await finalizeExpiredPolls();
    const poll = await Poll.findById(req.params.id)
      .populate('createdBy', 'name')
      .populate('options.votes', 'name');

    if (!poll) return res.status(404).json({ success: false, message: 'Poll not found' });

    // Check if user can view this poll (section-based)
    if (req.user.role === 'resident' && !(await residentCanViewPoll(req.user._id, poll))) {
      return res.status(403).json({ success: false, message: 'You are not authorized to view this poll' });
    }

    // Check if user has voted
    const pollObj = poll.toObject();
    pollObj.hasVoted = poll.options.some(option =>
      option.votes.some(voterId => String(voterId._id || voterId) === String(req.user._id))
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

    if (!isValidPollOptions(options)) {
      return res.status(400).json({ success: false, message: 'Poll options must be 2-10 unique labels of 1-100 characters each' });
    }
    if (type !== undefined && !['anonymous', 'named'].includes(type)) {
      return res.status(400).json({ success: false, message: 'Invalid poll type' });
    }

    const sections = Array.isArray(targetSections) ? targetSections.filter(Boolean) : [];

    // Validate end date
    if (!endDate || !Number.isFinite(new Date(endDate).getTime()) || !isWithinOneYear(new Date(endDate))) {
      return res.status(400).json({ success: false, message: 'End date is required and must be in the future and no more than 1 year ahead' });
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

    // Notify only active residents eligible for the poll.
    const recipientIds = await getPollRecipientIds(sections);

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

    if (poll.status !== 'active') {
      return res.status(400).json({ success: false, message: 'Cannot modify a finalized poll' });
    }

    if (status === 'closed') {
      await finalizePoll(poll._id, 'manual');
      const closedPoll = await Poll.findById(req.params.id).populate('createdBy', 'name');
      return res.json({ success: true, data: closedPoll, message: 'Poll closed successfully' });
    }

    // Cannot modify options if there are already votes
    if (poll.totalVotes > 0 && req.body.options) {
      return res.status(400).json({ success: false, message: 'Cannot modify options after voting has started' });
    }
    if (req.body.options && !isValidPollOptions(req.body.options)) {
      return res.status(400).json({ success: false, message: 'Poll options must be 2-10 unique labels of 1-100 characters each' });
    }

    const update = {};
    if (title) update.title = title.trim();
    if (description !== undefined) update.description = description?.trim() || '';
    if (req.body.options) {
      update.options = req.body.options.map(text => ({ text, votes: [] }));
    }
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
    if (req.user.role !== 'resident') {
      return res.status(403).json({ success: false, message: 'Only residents may vote in polls' });
    }

    await finalizeExpiredPolls();
    const { optionIndex } = req.body;
    const poll = await Poll.findById(req.params.id);

    if (!poll) return res.status(404).json({ success: false, message: 'Poll not found' });

    if (poll.status !== 'active') {
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
    await finalizeExpiredPolls();
    const poll = await Poll.findById(req.params.id)
      .populate('createdBy', 'name')
      .populate('options.votes', 'name');

    if (!poll) return res.status(404).json({ success: false, message: 'Poll not found' });

    if (req.user.role === 'resident') {
      if (!(await residentCanViewPoll(req.user._id, poll))) {
        return res.status(403).json({ success: false, message: 'You are not authorized to view this poll' });
      }
      if (poll.status === 'active') {
        return res.status(403).json({ success: false, message: 'Poll results are available after the poll closes.' });
      }
    }

    // Calculate percentages
    const results = poll.options.map(option => ({
      text: option.text,
      votes: option.votes.length,
      percentage: poll.totalVotes > 0 ? ((option.votes.length / poll.totalVotes) * 100).toFixed(1) : 0,
      voters: poll.type === 'named'
        ? option.votes.map(voter => ({ name: voter.name }))
        : option.votes.map(() => ({ _id: 'anonymous', name: 'Anonymous' }))
    }));

    res.json({ 
      success: true, 
      data: {
        poll: {
          title: poll.title,
          description: poll.description,
          totalVotes: poll.totalVotes,
          status: poll.status,
          type: poll.type,
          outcome: poll.outcome,
          winnerOptionIndexes: poll.winnerOptionIndexes,
          closedAt: poll.closedAt,
          round: poll.round,
          parentPoll: poll.parentPoll,
          runoffPoll: poll.runoffPoll
        },
        results
      }
    });
  } catch (err) { next(err); }
};
