const express = require('express');
const request = require('supertest');

jest.mock('../middleware/auth', () => ({
  protect: (req, res, next) => {
    const users = {
      resident: { _id: '111111111111111111111111', role: 'resident' },
      staff: { _id: '333333333333333333333333', role: 'staff' },
      admin: { _id: '444444444444444444444444', role: 'admin' }
    };
    req.user = users[req.headers.authorization];
    next();
  },
  authorize: (...roles) => (req, res, next) => roles.includes(req.user.role)
    ? next()
    : res.status(403).json({ success: false, message: 'Access denied' })
}));

jest.mock('../models/Notice', () => ({
  find: jest.fn(),
  findById: jest.fn(),
  create: jest.fn()
}));
jest.mock('../models/House', () => ({ find: jest.fn(), distinct: jest.fn() }));
jest.mock('../models/User', () => ({ find: jest.fn() }));
jest.mock('../controllers/notificationController', () => ({
  createNotificationForMany: jest.fn().mockResolvedValue({ success: true })
}));
jest.mock('../utils/residentHouses', () => ({
  getResidentHouseIds: jest.fn().mockResolvedValue(['aaaaaaaaaaaaaaaaaaaaaaaa']),
  ResidentHouse: { find: jest.fn() }
}));

const Notice = require('../models/Notice');
const House = require('../models/House');
const User = require('../models/User');

const expiredNotice = {
  _id: 'eeeeeeeeeeeeeeeeeeeeeeee',
  title: 'Expired notice',
  content: 'This notice has expired.',
  type: 'general',
  targetSections: [],
  expiresAt: new Date('2020-01-01T00:00:00.000Z'),
  isActive: true,
  toObject() { return { ...this, toObject: undefined }; }
};
const neverExpiresNotice = {
  _id: 'ffffffffffffffffffffffff',
  title: 'Ongoing notice',
  content: 'This notice never expires.',
  type: 'general',
  targetSections: [],
  expiresAt: null,
  isActive: true,
  toObject() { return { ...this, toObject: undefined }; }
};

function makeApp() {
  const app = express();
  app.use(express.json());
  app.use('/notices', require('../routes/notices'));
  return app;
}

const app = makeApp();

beforeEach(() => {
  Notice.find.mockImplementation(filter => {
    const includeExpired = !filter.$and?.some(condition => condition.$or?.some(item => item.expiresAt));
    const notices = [expiredNotice, neverExpiresNotice].filter(notice => (
      includeExpired || notice.expiresAt === null || notice.expiresAt > new Date()
    ));
    return {
      populate: jest.fn().mockReturnThis(),
      sort: jest.fn().mockResolvedValue(notices)
    };
  });
  House.find.mockReturnValue({
    select: jest.fn().mockReturnValue({
      lean: jest.fn().mockResolvedValue([{ section: 'Section 1' }])
    })
  });
  House.distinct.mockResolvedValue([]);
  User.find.mockReturnValue({ select: jest.fn().mockResolvedValue([]) });
});

afterEach(() => jest.clearAllMocks());

describe('notice expiry', () => {
  test('expired notices are hidden from residents while never-expiring notices remain visible', async () => {
    const response = await request(app)
      .get('/notices')
      .set('Authorization', 'resident');

    expect(response.status).toBe(200);
    expect(response.body.data.map(notice => notice.title)).toEqual(['Ongoing notice']);
    expect(response.body.data[0].expired).toBe(false);
  });

  test('admin can include expired notices and they are marked expired', async () => {
    const response = await request(app)
      .get('/notices?includeExpired=true')
      .set('Authorization', 'admin');

    expect(response.status).toBe(200);
    expect(response.body.data.map(notice => notice.expired)).toEqual([true, false]);
  });

  test('staff can include both active and expired notices', async () => {
    const response = await request(app)
      .get('/notices?includeExpired=true')
      .set('Authorization', 'staff');

    expect(response.status).toBe(200);
    expect(response.body.data.map(notice => notice.expired)).toEqual([true, false]);
  });

  test('unchecked includeExpired filter explicitly keeps expired notices excluded', async () => {
    const response = await request(app)
      .get('/notices?includeExpired=false')
      .set('Authorization', 'admin');

    expect(response.status).toBe(200);
    expect(Notice.find).toHaveBeenCalledWith(expect.objectContaining({
      isActive: true,
      $and: [
        { $or: [{ expiresAt: null }, { expiresAt: { $gt: expect.any(Date) } }] }
      ]
    }));
    expect(response.body.data.map(notice => notice.title)).toEqual(['Ongoing notice']);
  });

  test('null expiresAt is never considered expired', async () => {
    const response = await request(app)
      .get('/notices?includeExpired=true')
      .set('Authorization', 'admin');

    const notice = response.body.data.find(item => item.title === 'Ongoing notice');
    expect(notice.expiresAt).toBeNull();
    expect(notice.expired).toBe(false);
  });

  test('past expiry date is rejected when creating a notice', async () => {
    const response = await request(app)
      .post('/notices')
      .set('Authorization', 'admin')
      .send({
        title: 'Past dated notice',
        content: 'This notice should not be created.',
        expiresAt: '2020-01-01'
      });

    expect(response.status).toBe(400);
    expect(Notice.create).not.toHaveBeenCalled();
  });

  test('omitted expiry defaults to seven days after creation', async () => {
    const now = Date.now();
    Notice.create.mockImplementation(async fields => ({
      ...fields,
      _id: 'dddddddddddddddddddddddd',
      createdAt: new Date(now),
      toObject() { return { ...this, toObject: undefined }; }
    }));

    const response = await request(app)
      .post('/notices')
      .set('Authorization', 'admin')
      .send({
        title: 'Community meeting',
        content: 'The community meeting will be held in the common hall.'
      });

    expect(response.status).toBe(201);
    const createdFields = Notice.create.mock.calls[0][0];
    expect(createdFields.expiresAt).toBeInstanceOf(Date);
    expect(createdFields.expiresAt.getTime()).toBeGreaterThanOrEqual(now + 7 * 24 * 60 * 60 * 1000);
    expect(createdFields.expiresAt.getTime()).toBeLessThanOrEqual(Date.now() + 7 * 24 * 60 * 60 * 1000);
  });

  test.each(['admin', 'staff'])('%s can manually expire a notice', async role => {
    const notice = {
      _id: 'eeeeeeeeeeeeeeeeeeeeeeee',
      expiresAt: new Date('2026-12-31T00:00:00.000Z'),
      save: jest.fn().mockResolvedValue(undefined)
    };
    Notice.findById.mockResolvedValue(notice);

    const before = Date.now();
    const response = await request(app)
      .put(`/notices/${notice._id}/expire`)
      .set('Authorization', role);

    expect(response.status).toBe(200);
    expect(response.body.message).toBe('Notice expired successfully');
    expect(response.body.data.expiresAt).toBeDefined();
    expect(new Date(response.body.data.expiresAt).getTime()).toBeGreaterThanOrEqual(before);
    expect(notice.save).toHaveBeenCalledTimes(1);
  });

  test('residents cannot manually expire a notice', async () => {
    const response = await request(app)
      .put('/notices/eeeeeeeeeeeeeeeeeeeeeeee/expire')
      .set('Authorization', 'resident');

    expect(response.status).toBe(403);
    expect(Notice.findById).not.toHaveBeenCalled();
  });

  test('manual expiry returns 404 for an unknown notice', async () => {
    Notice.findById.mockResolvedValue(null);

    const response = await request(app)
      .put('/notices/eeeeeeeeeeeeeeeeeeeeeeee/expire')
      .set('Authorization', 'admin');

    expect(response.status).toBe(404);
  });
});
