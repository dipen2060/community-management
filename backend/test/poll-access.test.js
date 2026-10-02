const express = require('express');
const request = require('supertest');

jest.mock('../middleware/auth', () => ({
  protect: (req, res, next) => {
    req.user = {
      _id: '111111111111111111111111',
      role: (req.headers.authorization || 'resident')
    };
    next();
  },
  authorize: (...roles) => (req, res, next) => roles.includes(req.user.role)
    ? next()
    : res.status(403).json({ success: false, message: 'Access denied' })
}));
jest.mock('../models/Poll', () => ({
  findById: jest.fn(),
  findByIdAndUpdate: jest.fn()
}));
jest.mock('../models/House', () => ({
  find: jest.fn()
}));
jest.mock('../models/User', () => ({ find: jest.fn() }));
jest.mock('../utils/residentHouses', () => ({
  getResidentHouseIds: jest.fn().mockResolvedValue(['aaaaaaaaaaaaaaaaaaaaaaaa'])
}));
jest.mock('../utils/pollFinalizer', () => ({
  finalizeExpiredPolls: jest.fn().mockResolvedValue({ checked: 0, finalized: 0 }),
  finalizePoll: jest.fn().mockResolvedValue(null)
}));

const Poll = require('../models/Poll');
const House = require('../models/House');
const { finalizeExpiredPolls, finalizePoll } = require('../utils/pollFinalizer');
const { updatePoll } = require('../controllers/pollController');

function queryFor(value) {
  const query = {
    populate: jest.fn().mockReturnThis(),
    then: (resolve, reject) => Promise.resolve(value).then(resolve, reject)
  };
  return query;
}

function makeApp() {
  const app = express();
  app.use(express.json());
  app.use('/polls', require('../routes/polls'));
  return app;
}

const app = makeApp();

beforeEach(() => {
  House.find.mockReturnValue({
    select: jest.fn().mockReturnValue({
      lean: jest.fn().mockResolvedValue([{ section: 'Section 2' }])
    })
  });
});

afterEach(() => jest.clearAllMocks());

describe('poll result access and manual closure', () => {
  test('resident outside the target section receives 403 for results', async () => {
    Poll.findById.mockReturnValue(queryFor({
      targetSections: ['Section 1'],
      status: 'closed'
    }));

    const response = await request(app)
      .get('/polls/aaaaaaaaaaaaaaaaaaaaaaaa/results')
      .set('Authorization', 'resident');

    expect(response.status).toBe(403);
    expect(finalizeExpiredPolls).toHaveBeenCalled();
  });

  test('resident cannot view results of an active poll, even when section-eligible', async () => {
    Poll.findById.mockReturnValue(queryFor({
      targetSections: ['Section 2'],
      status: 'active'
    }));

    const response = await request(app)
      .get('/polls/aaaaaaaaaaaaaaaaaaaaaaaa/results')
      .set('Authorization', 'resident');

    expect(response.status).toBe(403);
    expect(response.body.message).toMatch(/after the poll closes/i);
  });

  test('manual close uses the same poll finalizer with manual reason', async () => {
    const activePoll = { _id: 'aaaaaaaaaaaaaaaaaaaaaaaa', status: 'active', totalVotes: 1 };
    const closedPoll = { ...activePoll, status: 'closed', outcome: 'winner' };
    Poll.findById
      .mockResolvedValueOnce(activePoll)
      .mockReturnValueOnce({ populate: jest.fn().mockResolvedValue(closedPoll) });
    finalizePoll.mockResolvedValueOnce(closedPoll);

    const response = await request(app)
      .put('/polls/aaaaaaaaaaaaaaaaaaaaaaaa')
      .set('Authorization', 'admin')
      .send({ status: 'closed' });

    expect(response.status).toBe(200);
    expect(finalizePoll).toHaveBeenCalledWith(activePoll._id, 'manual');
    expect(response.body.data.outcome).toBe('winner');
  });

  test('named result voters contain names only and include finalization metadata', async () => {
    const poll = {
      title: 'Choice',
      description: '',
      totalVotes: 1,
      status: 'closed',
      type: 'named',
      outcome: 'winner',
      winnerOptionIndexes: [0],
      closedAt: new Date(),
      round: 1,
      parentPoll: null,
      runoffPoll: null,
      options: [{ text: 'Yes', votes: [{ _id: 'voter-id', name: 'Resident Name', phone: '555-1234' }] }]
    };
    Poll.findById.mockReturnValue(queryFor(poll));

    const response = await request(app)
      .get('/polls/aaaaaaaaaaaaaaaaaaaaaaaa/results')
      .set('Authorization', 'admin');

    expect(response.status).toBe(200);
    expect(response.body.data.poll).toMatchObject({
      outcome: 'winner',
      winnerOptionIndexes: [0],
      round: 1,
      parentPoll: null,
      runoffPoll: null
    });
    expect(response.body.data.results[0].voters).toEqual([{ name: 'Resident Name' }]);
    expect(JSON.stringify(response.body)).not.toContain('555-1234');
  });

  test('poll detail does not populate phone numbers', async () => {
    const poll = {
      targetSections: [],
      options: [{ votes: [] }],
      type: 'anonymous',
      toObject: () => ({ targetSections: [], options: [{ votes: [] }], type: 'anonymous' })
    };
    const query = queryFor(poll);
    Poll.findById.mockReturnValue(query);

    const response = await request(app)
      .get('/polls/aaaaaaaaaaaaaaaaaaaaaaaa')
      .set('Authorization', 'resident');

    expect(response.status).toBe(200);
    expect(query.populate).toHaveBeenCalledWith('options.votes', 'name');
  });
});
