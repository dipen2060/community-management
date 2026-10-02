jest.mock('../models/Poll', () => ({
  find: jest.fn(),
  findOneAndUpdate: jest.fn(),
  findByIdAndUpdate: jest.fn(),
  create: jest.fn()
}));
jest.mock('../models/User', () => ({ find: jest.fn() }));
jest.mock('../models/House', () => ({ find: jest.fn() }));
jest.mock('../models/ResidentHouse', () => ({ find: jest.fn() }));
jest.mock('../controllers/notificationController', () => ({
  createNotificationForMany: jest.fn().mockResolvedValue({ success: true })
}));

const Poll = require('../models/Poll');
const User = require('../models/User');
const { createNotificationForMany } = require('../controllers/notificationController');
const { finalizeExpiredPolls, finalizePoll } = require('../utils/pollFinalizer');
const { resetPollFinalizationConnectionWarning } = require('../utils/mongoConnectivity');

const originalId = 'aaaaaaaaaaaaaaaaaaaaaaaa';

function activePoll(overrides = {}) {
  return {
    _id: originalId,
    title: 'Community choice',
    description: 'Choose a plan',
    createdBy: 'bbbbbbbbbbbbbbbbbbbbbbbb',
    targetSections: [],
    type: 'named',
    status: 'active',
    round: 1,
    options: [
      { text: 'Option A', votes: ['voter-a'] },
      { text: 'Option B', votes: ['voter-b'] }
    ],
    ...overrides
  };
}

function selectLean(value) {
  return {
    select: jest.fn().mockReturnThis(),
    lean: jest.fn().mockResolvedValue(value),
    then: (resolve, reject) => Promise.resolve(value).then(resolve, reject)
  };
}

beforeEach(() => {
  const admins = [{ _id: 'admin-id' }];
  const residents = [{ _id: 'resident-a' }, { _id: 'resident-b' }];
  User.find.mockImplementation(filter => selectLean(filter.role === 'admin' ? admins : residents));
  let runoffSequence = 0;
  Poll.findOneAndUpdate.mockImplementation(async (filter, update) => {
    const poll = pollState.get(String(filter._id));
    if (!poll || poll.status !== filter.status) return null;
    Object.assign(poll, update.$set);
    return poll;
  });
  Poll.findByIdAndUpdate.mockImplementation(async (id, update) => {
    const poll = pollState.get(String(id));
    Object.assign(poll, update.$set || update);
    return poll;
  });
  Poll.create.mockImplementation(async fields => {
    runoffSequence++;
    const runoff = { _id: `runoff-${runoffSequence}`, ...fields };
    pollState.set(String(runoff._id), runoff);
    return runoff;
  });
  Poll.find.mockImplementation(filter => selectLean(
    [...pollState.values()].filter(poll => poll.status === filter.status && poll.endDate && poll.endDate <= filter.endDate.$lte)
  ));
});

const pollState = new Map();

beforeEach(() => pollState.clear());
afterEach(() => jest.clearAllMocks());

test('transient MongoDB errors during an individual poll finalization propagate to the cron handler', async () => {
  const poll = activePoll({ endDate: new Date(Date.now() - 1000) });
  Poll.find.mockReturnValue(selectLean([poll]));
  Poll.findOneAndUpdate.mockRejectedValue(
    Object.assign(new Error('connection timed out'), { name: 'MongoNetworkTimeoutError' })
  );

  await expect(finalizeExpiredPolls()).rejects.toMatchObject({
    name: 'MongoNetworkTimeoutError'
  });
});

test('repeated transient cron errors produce only one warning until a successful run', () => {
  const {
    reportPollFinalizationConnectionError
  } = require('../utils/mongoConnectivity');
  const warning = jest.spyOn(console, 'warn').mockImplementation(() => {});
  const error = Object.assign(new Error('connection timed out'), {
    name: 'MongoNetworkTimeoutError'
  });

  resetPollFinalizationConnectionWarning();
  expect(reportPollFinalizationConnectionError(error)).toBe(true);
  expect(reportPollFinalizationConnectionError(error)).toBe(true);
  expect(warning).toHaveBeenCalledTimes(1);

  resetPollFinalizationConnectionWarning();
  expect(reportPollFinalizationConnectionError(error)).toBe(true);
  expect(warning).toHaveBeenCalledTimes(2);
  warning.mockRestore();
});

describe('poll finalization', () => {
  test('expired polls are automatically closed with an expired reason', async () => {
    const poll = activePoll({ endDate: new Date(Date.now() - 1000), options: [
      { text: 'Winner', votes: ['voter-a'] },
      { text: 'Other', votes: [] }
    ] });
    pollState.set(originalId, poll);

    const result = await finalizeExpiredPolls();

    expect(result).toEqual({ checked: 1, finalized: 1 });
    expect(poll.status).toBe('completed');
    expect(poll.closedReason).toBe('expired');
    expect(poll.outcome).toBe('winner');
  });

  test('a unique highest vote count publishes the winner and percentage', async () => {
    const poll = activePoll({ options: [
      { text: 'Option A', votes: ['a', 'b'] },
      { text: 'Option B', votes: ['c'] }
    ] });
    pollState.set(originalId, poll);

    await finalizePoll(originalId, 'manual');

    expect(poll.outcome).toBe('winner');
    expect(poll.winnerOptionIndexes).toEqual([0]);
    expect(createNotificationForMany).toHaveBeenCalledWith(
      expect.any(Array),
      expect.objectContaining({ message: expect.stringContaining('Option A won (2 votes, 66.7%)') })
    );
  });

  test('a two-way tie creates one runoff with only tied options', async () => {
    const poll = activePoll({ options: [
      { text: 'Option A', votes: ['a'] },
      { text: 'Option B', votes: ['b'] },
      { text: 'Option C', votes: [] }
    ] });
    pollState.set(originalId, poll);

    await finalizePoll(originalId, 'expired');

    const runoff = pollState.get(String(poll.runoffPoll));
    expect(Poll.create).toHaveBeenCalledTimes(1);
    expect(poll.outcome).toBe('tie');
    expect(poll.status).toBe('tied');
    expect(poll.winnerOptionIndexes).toEqual([0, 1]);
    expect(runoff.options.map(option => option.text)).toEqual(['Option A', 'Option B']);
    expect(runoff.options.every(option => option.votes.length === 0)).toBe(true);
    expect(runoff.round).toBe(2);
    expect(runoff.parentPoll).toBe(originalId);
    expect(runoff.title).toBe('[Runoff] Community choice');
    expect(runoff.endDate.getTime() - poll.closedAt.getTime()).toBe(48 * 60 * 60 * 1000);
  });

  test('repeated concurrent finalization creates one runoff and notifies only once', async () => {
    const poll = activePoll();
    pollState.set(originalId, poll);

    await Promise.all([finalizePoll(originalId, 'expired'), finalizePoll(originalId, 'expired')]);

    expect(Poll.create).toHaveBeenCalledTimes(1);
    expect(createNotificationForMany).toHaveBeenCalledTimes(1);
  });

  test('a tie on a later round also creates a runoff', async () => {
    const poll = activePoll({ round: 2 });
    pollState.set(originalId, poll);

    await finalizePoll(originalId, 'expired');

    expect(poll.outcome).toBe('tie');
    expect(poll.status).toBe('tied');
    expect(poll.runoffPoll).toBeDefined();
    expect(Poll.create).toHaveBeenCalledTimes(1);
    expect(pollState.get(String(poll.runoffPoll)).round).toBe(3);
  });

  test('a poll with no votes is finalized as no_votes and notifies its creator and admins', async () => {
    const poll = activePoll({ options: [
      { text: 'Option A', votes: [] },
      { text: 'Option B', votes: [] }
    ] });
    pollState.set(originalId, poll);

    await finalizePoll(originalId, 'manual');

    expect(poll.outcome).toBe('no_votes');
    expect(poll.status).toBe('closed');
    expect(createNotificationForMany).toHaveBeenCalledWith(
      expect.arrayContaining(['admin-id', poll.createdBy]),
      expect.objectContaining({ title: 'Poll closed with no votes' })
    );
  });
});
