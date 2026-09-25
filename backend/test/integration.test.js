const express = require('express');
const request = require('supertest');

jest.mock('../middleware/auth', () => ({
  protect: (req, res, next) => {
    const users = {
      '111111111111111111111111': { _id: '111111111111111111111111', role: 'resident', name: 'Resident A' },
      '222222222222222222222222': { _id: '222222222222222222222222', role: 'resident', name: 'Resident B' },
      '333333333333333333333333': { _id: '333333333333333333333333', role: 'staff', name: 'Staff' },
      '444444444444444444444444': { _id: '444444444444444444444444', role: 'admin', name: 'Admin' }
    };
    const user = users[(req.headers.authorization || '').replace('Bearer ', '')];
    if (!user) return res.status(401).json({ success: false, message: 'Not authorized' });
    req.user = user;
    next();
  },
  authorize: (...roles) => (req, res, next) => {
    if (!roles.includes(req.user.role)) return res.status(403).json({ success: false, message: 'Access denied' });
    next();
  }
}));

jest.mock('../models/User', () => ({ find: jest.fn(() => ({ select: jest.fn().mockResolvedValue([]) })) }));
jest.mock('../models/House', () => ({
  findOne: jest.fn().mockResolvedValue(null),
  find: jest.fn(() => ({ select: jest.fn().mockReturnValue({ lean: jest.fn().mockResolvedValue([]) }) }))
}));
jest.mock('../models/Complaint', () => ({ findById: jest.fn(), find: jest.fn(), countDocuments: jest.fn() }));
jest.mock('../models/Due', () => ({ findById: jest.fn(), findOneAndUpdate: jest.fn(), find: jest.fn(), countDocuments: jest.fn(), aggregate: jest.fn() }));
jest.mock('../models/Poll', () => ({ findById: jest.fn(), findOneAndUpdate: jest.fn() }));
jest.mock('../controllers/complaintController', () => {
  const actual = jest.requireActual('../controllers/complaintController');
  return {
    ...actual,
    getComplaintAttachment: jest.fn((req, res) => res.status(404).end()),
    authorizeComplaintUpdate: jest.fn((req, res, next) => next())
  };
});
jest.mock('../controllers/notificationController', () => ({
  createNotification: jest.fn().mockResolvedValue(undefined),
  createNotificationForMany: jest.fn().mockResolvedValue(undefined)
}));
jest.mock('../utils/autoAssign', () => ({ findBestStaffForCategory: jest.fn().mockResolvedValue(null) }));
jest.mock('../utils/auditLogger', () => ({ logAudit: jest.fn().mockResolvedValue(undefined) }));
jest.mock('../utils/residentHouses', () => ({ getResidentHouseIds: jest.fn().mockResolvedValue([]), getHouseResidentIds: jest.fn().mockResolvedValue([]) }));

const Complaint = require('../models/Complaint');
const Due = require('../models/Due');
const Poll = require('../models/Poll');
const errorHandler = require('../middleware/errorHandler');

function makeApp() {
  const app = express();
  app.use(express.json());
  app.use('/complaints', require('../routes/complaints'));
  app.use('/dues', require('../routes/dues'));
  app.use('/polls', require('../routes/polls'));
  app.use('/exports', require('../routes/exports'));
  app.use(errorHandler);
  return app;
}

const app = makeApp();

afterEach(() => {
  jest.clearAllMocks();
});

describe('authorization boundaries', () => {
  test('a resident cannot update another resident’s complaint', async () => {
    Complaint.findById.mockResolvedValue({
      _id: 'aaaaaaaaaaaaaaaaaaaaaaaa',
      submittedBy: { toString: () => '222222222222222222222222' },
      status: 'resolved',
      save: jest.fn()
    });

    const response = await request(app)
      .put('/complaints/aaaaaaaaaaaaaaaaaaaaaaaa')
      .set('Authorization', 'Bearer 111111111111111111111111')
      .send({ status: 'pending' });

    expect(response.status).toBe(403);
    expect(Complaint.findById).toHaveBeenCalledWith('aaaaaaaaaaaaaaaaaaaaaaaa');
  });

  test('staff cannot approve payments', async () => {
    const response = await request(app)
      .put('/dues/due-1/approve-payment')
      .set('Authorization', 'Bearer 333333333333333333333333');

    expect(response.status).toBe(403);
    expect(Due.findById).not.toHaveBeenCalled();
  });
});

describe('payment approval and rejection concurrency', () => {
  test('two simultaneous approval/rejection calls allow only one state transition', async () => {
    const state = { status: 'verification_pending' };
    const createDue = () => ({
      _id: 'bbbbbbbbbbbbbbbbbbbbbbbb',
      get status() { return state.status; },
      set status(value) { this.nextStatus = value; },
      paymentAttempts: [{ status: 'verification_pending' }],
      submittedBy: '111111111111111111111111',
      house: { houseNo: 'A-1', owner: '111111111111111111111111' },
      save: jest.fn(async function () {
        if (state.status !== 'verification_pending') throw new Error('stale payment state');
        state.status = this.nextStatus;
      }),
      populate: jest.fn().mockResolvedValue(undefined)
    });
    Due.findById.mockImplementation(() => ({ populate: jest.fn().mockResolvedValue(createDue()) }));
    Due.findOneAndUpdate.mockImplementation((filter) => {
      if (state.status !== filter.status) return { populate: jest.fn().mockResolvedValue(null) };
      state.status = filter.status === 'verification_pending' ? 'paid' : 'verification_pending';
      return { populate: jest.fn().mockResolvedValue(createDue()) };
    });

    const [approve, reject] = await Promise.all([
      request(app).put('/dues/bbbbbbbbbbbbbbbbbbbbbbbb/approve-payment').set('Authorization', 'Bearer 444444444444444444444444'),
      request(app).put('/dues/bbbbbbbbbbbbbbbbbbbbbbbb/reject-payment').set('Authorization', 'Bearer 444444444444444444444444').send({ reason: 'Unreadable proof' })
    ]);

    expect([approve.status, reject.status].filter(status => status >= 200 && status < 300)).toHaveLength(1);
  });
});

describe('concurrent poll voting', () => {
  test('a user cannot vote twice when requests arrive simultaneously', async () => {
    const voters = new Set();
    const createPoll = () => ({
      _id: 'cccccccccccccccccccccccc',
      status: 'active',
      targetSections: [],
      totalVotes: 0,
      options: [{ text: 'Yes', votes: [] }, { text: 'No', votes: [] }],
      populate: jest.fn().mockResolvedValue(undefined),
      toObject: jest.fn(function () { return this; }),
      save: jest.fn(async function () {
        if (voters.has('111111111111111111111111')) throw new Error('duplicate vote');
        voters.add('111111111111111111111111');
      })
    });
    Poll.findById.mockImplementation(() => Promise.resolve(createPoll()));
    Poll.findOneAndUpdate.mockImplementation(() => {
      if (voters.size) return { populate: jest.fn().mockResolvedValue(null) };
      voters.add('111111111111111111111111');
      return { populate: jest.fn().mockResolvedValue(createPoll()) };
    });

    const responses = await Promise.all([
      request(app).post('/polls/cccccccccccccccccccccccc/vote').set('Authorization', 'Bearer 111111111111111111111111').send({ optionIndex: 0 }),
      request(app).post('/polls/cccccccccccccccccccccccc/vote').set('Authorization', 'Bearer 111111111111111111111111').send({ optionIndex: 0 })
    ]);

    expect(responses.filter(response => response.status >= 200 && response.status < 300)).toHaveLength(1);
  });
});

describe('file upload rejection', () => {
  test.each([
    ['malware.exe', undefined],
    ['fake.png', 'application/octet-stream']
  ])('rejects disallowed file type or content type: %s', async (filename, contentType) => {
    const response = await request(app)
      .post('/complaints')
      .set('Authorization', 'Bearer 111111111111111111111111')
      .field('title', 'Broken street light')
      .field('description', 'The street light has stopped working')
      .attach('attachments', Buffer.from('not an image'), { filename, contentType });

    expect(response.status).toBe(400);
    expect(response.body.message).toMatch(/allowed|supported/i);
  });
});

describe('export query validation', () => {
  test.each([
    ['/exports/dues/excel?month=13', 'month'],
    ['/exports/dues/pdf?year=1999', 'year'],
    ['/exports/dues/excel?status=unknown', 'status'],
    ['/exports/complaints/excel?category=unknown', 'category']
  ])('rejects invalid %s query parameter', async (url) => {
    const response = await request(app)
      .get(url)
      .set('Authorization', 'Bearer 444444444444444444444444');

    expect(response.status).toBe(400);
  });
});
