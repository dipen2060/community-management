jest.mock('../models/Complaint', () => ({
  create: jest.fn(),
  find: jest.fn(),
  findById: jest.fn()
}));
jest.mock('../models/User', () => ({
  find: jest.fn(),
  findById: jest.fn()
}));
jest.mock('../models/House', () => ({
  findOne: jest.fn(),
  findById: jest.fn()
}));
jest.mock('../controllers/notificationController', () => ({
  createNotification: jest.fn().mockResolvedValue(undefined),
  createNotificationForMany: jest.fn().mockResolvedValue(undefined)
}));
jest.mock('../utils/categoryClassifier', () => ({
  detectCategory: jest.fn(() => ({ category: 'water', confidence: 1 }))
}));
jest.mock('../utils/priorityClassifier', () => ({
  detectPriority: jest.fn(() => ({ priority: null, confidence: 0 })),
  maxSeverity: jest.fn((requestedPriority) => requestedPriority)
}));
jest.mock('../utils/autoAssign', () => ({
  findBestStaffForCategory: jest.fn()
}));
jest.mock('../utils/auditLogger', () => ({
  logAudit: jest.fn().mockResolvedValue(undefined)
}));
jest.mock('../utils/residentHouses', () => ({
  getResidentHouseIds: jest.fn().mockResolvedValue([]),
  isResidentLinkedToHouse: jest.fn().mockResolvedValue(false)
}));

const Complaint = require('../models/Complaint');
const User = require('../models/User');
const House = require('../models/House');
const { findBestStaffForCategory } = require('../utils/autoAssign');
const { createComplaint, updateComplaint } = require('../controllers/complaintController');

function responseMock() {
  return {
    status: jest.fn().mockReturnThis(),
    json: jest.fn()
  };
}

beforeEach(() => {
  Complaint.find.mockReturnValue({
    sort: jest.fn().mockReturnThis(),
    limit: jest.fn().mockResolvedValue([])
  });
  User.find.mockReturnValue({
    select: jest.fn().mockResolvedValue([{ _id: 'admin-id' }])
  });
});

afterEach(() => jest.clearAllMocks());

describe('complaint timeline start timestamp', () => {
  test('sets startedAt when auto-assigned at creation', async () => {
    const staff = { _id: 'staff-id', name: 'Staff', specialization: 'water', phone: '123' };
    const now = Date.now();
    findBestStaffForCategory.mockResolvedValue(staff);
    House.findOne.mockResolvedValue({ _id: 'house-id', section: 'Section 1' });
    Complaint.create.mockImplementation(async fields => ({
      ...fields,
      _id: 'complaint-id',
      createdAt: new Date(),
      populate: jest.fn().mockResolvedValue(undefined),
      save: jest.fn().mockResolvedValue(undefined)
    }));

    const req = {
      body: { title: 'Water not available', description: 'Water supply is not available today.' },
      user: { _id: 'admin-id', role: 'admin', name: 'Admin' },
      files: []
    };
    const res = responseMock();
    const next = jest.fn();

    await createComplaint(req, res, next);

    const createdFields = Complaint.create.mock.calls[0][0];
    expect(createdFields.status).toBe('inprogress');
    expect(createdFields.startedAt).toBeInstanceOf(Date);
    expect(createdFields.startedAt.getTime()).toBeGreaterThanOrEqual(now);
    expect(res.status).toHaveBeenCalledWith(201);
    expect(next).not.toHaveBeenCalled();
  });

  test('sets startedAt when an existing complaint transitions to inprogress', async () => {
    const complaint = {
      _id: 'complaint-id',
      title: 'Water not available',
      status: 'pending',
      submittedBy: 'resident-id',
      assignedTo: 'staff-id',
      reopenCount: 0,
      save: jest.fn().mockResolvedValue(undefined),
      populate: jest.fn().mockResolvedValue(undefined)
    };
    Complaint.findById.mockResolvedValue(complaint);
    const req = {
      params: { id: 'complaint-id' },
      body: { status: 'inprogress' },
      user: { _id: 'admin-id', role: 'admin', name: 'Admin' }
    };
    const res = responseMock();
    const next = jest.fn();
    const before = Date.now();

    await updateComplaint(req, res, next);

    expect(complaint.startedAt).toBeInstanceOf(Date);
    expect(complaint.startedAt.getTime()).toBeGreaterThanOrEqual(before);
    expect(complaint.status).toBe('inprogress');
    expect(complaint.save).toHaveBeenCalled();
    expect(next).not.toHaveBeenCalled();
  });
});
