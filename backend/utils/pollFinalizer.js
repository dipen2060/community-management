const Poll = require('../models/Poll');
const User = require('../models/User');
const { createNotificationForMany } = require('../controllers/notificationController');
const { getPollRecipientIds } = require('./pollRecipients');
const { getPollConfig } = require('./pollConfig');
const { isTransientMongoConnectivityError } = require('./mongoConnectivity');

function idKey(id) {
  return String(id);
}

async function notifyAdminsAndCreator(poll, title, message) {
  const admins = await User.find({ role: 'admin', isActive: true }).select('_id').lean();
  const recipients = new Set(admins.map(admin => idKey(admin._id)));
  recipients.add(idKey(poll.createdBy));
  await createNotificationForMany([...recipients], { title, message, type: 'general', link: '/polls' });
}

async function finalizePoll(pollId, reason = 'expired') {
  if (!['expired', 'manual'].includes(reason)) throw new Error('Invalid poll closing reason');

  const closedAt = new Date();
  const poll = await Poll.findOneAndUpdate(
    { _id: pollId, status: 'active' },
    { $set: { status: 'closed', closedAt, closedReason: reason } },
    { new: true }
  );
  if (!poll) return null;

  const counts = poll.options.map(option => option.votes.length);
  const totalVotes = counts.reduce((sum, count) => sum + count, 0);
  const highest = counts.length ? Math.max(...counts) : 0;
  let outcome;
  let winnerOptionIndexes = [];

  if (!totalVotes) {
    outcome = 'no_votes';
  } else {
    winnerOptionIndexes = counts.flatMap((count, index) => count === highest ? [index] : []);
    outcome = winnerOptionIndexes.length === 1 ? 'winner' : 'tie';
  }

  const finalizedPoll = await Poll.findByIdAndUpdate(
    poll._id,
    { $set: { outcome, winnerOptionIndexes, totalVotes } },
    { new: true }
  );

  if (outcome === 'no_votes') {
    await notifyAdminsAndCreator(finalizedPoll, 'Poll closed with no votes', `No votes were cast in "${poll.title}".`);
    return finalizedPoll;
  }

  if (outcome === 'winner') {
    const winnerIndex = winnerOptionIndexes[0];
    const winner = poll.options[winnerIndex];
    const percentage = ((highest / totalVotes) * 100).toFixed(1);
    const recipients = await getPollRecipientIds(poll.targetSections);
    await createNotificationForMany(recipients, {
      title: 'Poll result',
      message: `Poll result: ${poll.title} — ${winner.text} won (${highest} votes, ${percentage}%)`,
      type: 'general',
      link: '/polls'
    });
    return finalizedPoll;
  }

  const { maxRounds, runoffHours } = getPollConfig();
  if (poll.round < maxRounds) {
    const runoff = await Poll.create({
      title: `Re-vote (Round ${poll.round + 1}): ${poll.title}`,
      description: poll.description,
      options: winnerOptionIndexes.map(index => ({ text: poll.options[index].text, votes: [] })),
      type: poll.type,
      targetSections: poll.targetSections,
      createdBy: poll.createdBy,
      endDate: new Date(closedAt.getTime() + runoffHours * 60 * 60 * 1000),
      totalVotes: 0,
      outcome: 'open',
      round: poll.round + 1,
      parentPoll: poll._id
    });
    await Poll.findByIdAndUpdate(poll._id, { $set: { runoffPoll: runoff._id } });
    const recipients = await getPollRecipientIds(poll.targetSections);
    await createNotificationForMany(recipients, {
      title: 'Poll tie — re-vote started',
      message: `Tie in ${poll.title} — re-voting started, vote before ${runoff.endDate.toLocaleString()}`,
      type: 'general',
      link: '/polls'
    });
    finalizedPoll.runoffPoll = runoff._id;
    return finalizedPoll;
  }

  const admins = await User.find({ role: 'admin', isActive: true }).select('_id').lean();
  await createNotificationForMany(admins.map(admin => admin._id), {
    title: 'Poll final tie — admin decision needed',
    message: `Final tie after ${poll.round} rounds — admin decision needed for "${poll.title}".`,
    type: 'general',
    link: '/polls'
  });
  return finalizedPoll;
}

async function finalizeExpiredPolls(now = new Date()) {
  const polls = await Poll.find({
    status: 'active',
    endDate: { $ne: null, $lte: now }
  }).select('_id');
  const results = [];
  for (const poll of polls) {
    try {
      const result = await finalizePoll(poll._id, 'expired');
      if (result) results.push(result);
    } catch (error) {
      if (isTransientMongoConnectivityError(error)) {
        throw error;
      }
      console.error(`Failed to finalize expired poll ${poll._id}:`, error);
    }
  }
  return { checked: polls.length, finalized: results.length };
}

module.exports = { finalizePoll, finalizeExpiredPolls };
