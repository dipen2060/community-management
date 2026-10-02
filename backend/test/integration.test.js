const express = require('express');
const request = require('supertest');

jest.mock('file-type', () => ({ fromBuffer: jest.fn() }));

jest.mock('../middleware/auth', () => ({
  protect: (req, res, next) => {
    const users = {
      '111111111111111111111111': { _id: '111111111111111111111111', role: 'resident', name: 'Resident A' },
      '222222222222222222222222': { _id: '222222222222222222222222', role: 'resident', name: 'Resident B' },
      '333333333333333333333333': { _id: '333333333333333333333333', role: 'staff', name: 'Staff', exportSection: 'dues' },
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
jest.mock('../models/ResidentHouse', () => ({
  find: jest.fn(() => ({
    select: jest.fn().mockReturnValue({
      lean: jest.fn().mockResolvedValue([])
    })
  }))
}));
jest.mock('../models/Complaint', () => ({ findById: jest.fn(), find: jest.fn(), countDocuments: jest.fn() }));
jest.mock('../models/Due', () => ({
  findById: jest.fn(),
  findOneAndUpdate: jest.fn(),
  findOne: jest.fn(),
  find: jest.fn(),
  updateOne: jest.fn(),
  countDocuments: jest.fn(),
  aggregate: jest.fn()
}));
jest.mock('../models/ExportAudit', () => ({ create: jest.fn().mockResolvedValue(undefined) }));
jest.mock('../models/Poll', () => ({ findById: jest.fn(), findOneAndUpdate: jest.fn() }));
jest.mock('../utils/pollFinalizer', () => ({
  finalizeExpiredPolls: jest.fn().mockResolvedValue({ checked: 0, finalized: 0 }),
  finalizePoll: jest.fn()
}));
jest.mock('../controllers/complaintController', () => {
  const actual = jest.requireActual('../controllers/complaintController');
  return {
    ...actual,
    getComplaintAttachment: jest.fn((req, res) => res.status(404).end()),
    authorizeComplaintUpdate: jest.fn((req, res, next) => next())
  };
});
jest.mock('../controllers/notificationController', () => ({
  createNotification: jest.fn().mockResolvedValue({ success: true }),
  createNotificationForMany: jest.fn().mockResolvedValue({ success: true })
}));
jest.mock('../utils/autoAssign', () => ({ findBestStaffForCategory: jest.fn().mockResolvedValue(null) }));
jest.mock('../utils/auditLogger', () => ({ logAudit: jest.fn().mockResolvedValue(undefined) }));
jest.mock('../utils/residentHouses', () => ({
  getResidentHouseIds: jest.fn().mockResolvedValue([]),
  isResidentLinkedToHouse: jest.fn().mockResolvedValue(false),
  getHouseResidentIds: jest.fn().mockResolvedValue([])
}));

const Complaint = require('../models/Complaint');
const Due = require('../models/Due');
const House = require('../models/House');
const User = require('../models/User');
const ResidentHouse = require('../models/ResidentHouse');
const ExportAudit = require('../models/ExportAudit');
const Poll = require('../models/Poll');
const errorHandler = require('../middleware/errorHandler');
const { getOutstandingByHouse } = require('../utils/outstanding');
const { generateMonthlyDuesForCron } = require('../controllers/dueController');
const { createNotification } = require('../controllers/notificationController');
const activeHouseId = 'aaaaaaaaaaaaaaaaaaaaaaaa';
const activeResidentId = 'bbbbbbbbbbbbbbbbbbbbbbbb';
function mockOccupiedHouse(house = {}) {
  const activeHouse = {
    _id: activeHouseId,
    houseNo: 'A-1',
    section: 'Section 1',
    monthlyDue: 500,
    owner: activeResidentId,
    tenant: null,
    isOccupied: true,
    status: 'active',
    ...house
  };
  House.find.mockReturnValue({
    select: jest.fn().mockReturnValue({
      lean: jest.fn().mockResolvedValue([activeHouse])
    })
  });
  ResidentHouse.find.mockReturnValue({
    select: jest.fn().mockReturnValue({
      lean: jest.fn().mockResolvedValue([])
    })
  });
  User.find.mockReturnValue({
    select: jest.fn().mockResolvedValue([{
      _id: activeResidentId,
      name: 'Resident',
      phone: '9841234567'
    }])
  });
  return activeHouse;
}

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

  describe('occupied-house due visibility', () => {
    test('does not allow an admin houseId filter to bypass active occupancy scoping', async () => {
      mockOccupiedHouse();
      Due.countDocuments.mockResolvedValue(0);
      const emptyDueQuery = {
        populate: jest.fn(function () { return this; }),
        sort: jest.fn(function () { return this; }),
        select: jest.fn(function () { return this; }),
        lean: jest.fn().mockResolvedValue([]),
        then: resolve => Promise.resolve([]).then(resolve)
      };
      Due.find.mockReturnValue(emptyDueQuery);

      const response = await request(app)
        .get('/dues?houseId=cccccccccccccccccccccccc')
        .set('Authorization', '444444444444444444444444');

      expect(response.status).toBe(200);
      expect(Due.countDocuments).toHaveBeenCalledWith({
        house: { $in: [] }
      });
    });
  });

  describe('outstanding balances', () => {
    const houseId = 'aaaaaaaaaaaaaaaaaaaaaaaa';

    test('carries three unpaid months forward and flags a verification-pending row', async () => {
      const now = new Date(2026, 2, 15);
      mockOccupiedHouse();
      Due.aggregate.mockResolvedValue([{
        _id: houseId,
        houseNo: 'A-1',
        section: 'Section 1',
        dues: [
          { _id: '1', month: 1, year: 2026, amount: 500, fine: 0, status: 'overdue', dueDate: new Date(2026, 0, 10) },
          { _id: '2', month: 2, year: 2026, amount: 500, fine: 0, status: 'verification_pending', dueDate: new Date(2026, 1, 10) },
          { _id: '3', month: 3, year: 2026, amount: 500, fine: 0, status: 'pending', dueDate: new Date(2026, 2, 10) }
        ]
      }]);

      const [summary] = await getOutstandingByHouse({ now });

      expect(summary.monthsUnpaid).toBe(3);
      expect(summary.dueSince).toEqual({ month: 1, year: 2026 });
      expect(summary.currentMonthAmount).toBe(500);
      expect(summary.previousBalance).toBe(1000);
      expect(summary.totalFine).toBe(880);
      expect(summary.totalPayable).toBe(2380);
      expect(summary.totalOutstanding).toBe(2380);
      expect(summary.residentName).toBe('Resident');
      expect(summary.contactNumber).toBe('9841234567');
      expect(summary.baseMonthlyDue).toBe(500);
      expect(summary.hasVerificationPending).toBe(true);
      expect(summary.breakdown[1].status).toBe('verification_pending');
    });

    test('caps each row fine independently', async () => {
      const now = new Date(2026, 2, 15);
      mockOccupiedHouse();
      Due.aggregate.mockResolvedValue([{
        _id: houseId,
        houseNo: 'A-1',
        section: 'Section 1',
        dues: [
          { _id: '1', month: 1, year: 2025, amount: 500, fine: 0, status: 'overdue', dueDate: new Date(2025, 0, 1) },
          { _id: '2', month: 2, year: 2025, amount: 500, fine: 0, status: 'overdue', dueDate: new Date(2025, 1, 1) }
        ]
      }]);

      const [summary] = await getOutstandingByHouse({ now });

      expect(summary.breakdown.map(due => due.fine)).toEqual([500, 500]);
      expect(summary.totalFine).toBe(1000);
    });

    test('resident cannot read another house breakdown', async () => {
      const response = await request(app)
        .get(`/dues/outstanding/${houseId}`)
        .set('Authorization', '222222222222222222222222');

      expect(response.status).toBe(403);
      expect(Due.aggregate).not.toHaveBeenCalled();
    });

    test('staff section filter is included in the aggregation', async () => {
      mockOccupiedHouse();
      Due.aggregate.mockResolvedValue([]);
      const response = await request(app)
        .get('/dues/outstanding?section=Section%202')
        .set('Authorization', '333333333333333333333333');

      expect(response.status).toBe(200);
      expect(Due.aggregate.mock.calls[0][0]).toEqual(expect.arrayContaining([
        expect.objectContaining({ $match: expect.objectContaining({ 'houseInfo.section': 'Section 2' }) })
      ]));
    });

    test('monthly backfill is idempotent and excludes archived houses', async () => {
      const activeHouse = { _id: houseId, monthlyDue: 500, houseNo: 'A-1' };
      mockOccupiedHouse(activeHouse);
      const inserted = new Set([`${houseId}:1:2026`]);
      Due.findOne.mockImplementation(() => ({
        sort: jest.fn().mockReturnThis(),
        select: jest.fn().mockReturnThis(),
        lean: jest.fn().mockResolvedValue({ month: 1, year: 2026 })
      }));
      Due.updateOne.mockImplementation(async filter => {
        const key = `${filter.house}:${filter.month}:${filter.year}`;
        if (inserted.has(key)) return { upsertedCount: 0 };
        inserted.add(key);
        return { upsertedCount: 1 };
      });

      const first = await generateMonthlyDuesForCron(new Date(2026, 2, 15));
      const second = await generateMonthlyDuesForCron(new Date(2026, 2, 15));

      expect(first).toMatchObject({ created: 1, backfilled: 1, month: 3, year: 2026 });
      expect(second).toMatchObject({ created: 0, backfilled: 0 });
      expect(House.find).toHaveBeenCalledWith({ isOccupied: true, status: { $ne: 'archived' } });
      expect([...inserted]).toEqual(expect.arrayContaining([`${houseId}:2:2026`, `${houseId}:3:2026`]));
      expect(createNotification).toHaveBeenCalledTimes(1);
    });

    test('does not generate monthly dues for vacant houses or houses without an active resident', async () => {
      mockOccupiedHouse({ owner: null, tenant: null });

      const result = await generateMonthlyDuesForCron(new Date(2026, 2, 15));

      expect(result).toMatchObject({ created: 0, backfilled: 0 });
      expect(Due.updateOne).not.toHaveBeenCalled();
      expect(User.find).not.toHaveBeenCalled();
    });

    test('does not generate dues for a house linked only to inactive residents', async () => {
      mockOccupiedHouse();
      User.find.mockReturnValue({ select: jest.fn().mockResolvedValue([]) });

      const result = await generateMonthlyDuesForCron(new Date(2026, 2, 15));

      expect(result).toMatchObject({ created: 0, backfilled: 0 });
      expect(Due.updateOne).not.toHaveBeenCalled();
    });

    test('includes this month base fee when an occupied house has no due record yet', async () => {
      mockOccupiedHouse();
      Due.aggregate.mockResolvedValue([]);

      const [summary] = await getOutstandingByHouse({ now: new Date(2026, 2, 5) });

      expect(summary.currentMonthAmount).toBe(500);
      expect(summary.previousBalance).toBe(0);
      expect(summary.totalOutstanding).toBe(500);
    });

    test('recognizes active resident-house links when legacy owner fields are empty', async () => {
      mockOccupiedHouse({ owner: null, tenant: null });
      ResidentHouse.find.mockReturnValue({
        select: jest.fn().mockReturnValue({
          lean: jest.fn().mockResolvedValue([{
            house_id: activeHouseId,
            resident_id: activeResidentId
          }])
        })
      });
      Due.aggregate.mockResolvedValue([]);

      const [summary] = await getOutstandingByHouse({ now: new Date(2026, 2, 5) });

      expect(summary.residentName).toBe('Resident');
      expect(summary.totalOutstanding).toBe(500);
    });

    test('sends reminders only for outstanding balances on occupied houses', async () => {
      mockOccupiedHouse();
      Due.aggregate.mockResolvedValue([]);

      const response = await request(app)
        .post(`/dues/outstanding/${activeHouseId}/remind`)
        .set('Authorization', '444444444444444444444444');

      expect(response.status).toBe(200);
      expect(response.body.remindedCount).toBe(1);
      expect(createNotification).toHaveBeenCalledWith(expect.objectContaining({
        user: activeResidentId,
        title: 'Outstanding Dues Reminder'
      }));
    });

    test.each([
      ['excel', /spreadsheetml/],
      ['pdf', /application\/pdf/]
    ])('outstanding %s export streams the correct content type', async (format, contentType) => {
      Due.aggregate.mockResolvedValue([]);
      const response = await request(app)
        .get(`/exports/outstanding/${format}`)
        .set('Authorization', '444444444444444444444444');

      expect(response.status).toBe(200);
      expect(response.headers['content-type']).toMatch(contentType);
      expect(ExportAudit.create).toHaveBeenCalledWith(expect.objectContaining({ resource: 'outstanding', format }));
    });
  });
});
