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
const {
  createComplaint,
  updateComplaint,
  escalateOverdueComplaints
} = require('../controllers/complaintController');
const { createNotificationForMany } = require('../controllers/notificationController');

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

  test('sets startedAt when a staff member is assigned without an explicit status change', async () => {
    const complaint = {
      _id: 'complaint-id',
      status: 'pending',
      submittedBy: 'resident-id',
      assignedTo: null,
      reopenCount: 0,
      save: jest.fn().mockResolvedValue(undefined),
      populate: jest.fn().mockResolvedValue(undefined)
    };
    Complaint.findById.mockResolvedValue(complaint);
    const before = Date.now();

    await updateComplaint({
      params: { id: 'complaint-id' },
      body: { assignedTo: 'staff-id' },
      user: { _id: 'admin-id', role: 'admin', name: 'Admin' }
    }, responseMock(), jest.fn());

    expect(complaint.startedAt).toBeInstanceOf(Date);
    expect(complaint.startedAt.getTime()).toBeGreaterThanOrEqual(before);
    expect(complaint.assignedTo).toBe('staff-id');
  });

  test('does not replace an existing startedAt on subsequent updates', async () => {
    const originalStartedAt = new Date('2026-01-01T10:00:00Z');
    const complaint = {
      _id: 'complaint-id',
      status: 'pending',
      startedAt: originalStartedAt,
      submittedBy: 'resident-id',
      assignedTo: 'staff-id',
      reopenCount: 0,
      save: jest.fn().mockResolvedValue(undefined),
      populate: jest.fn().mockResolvedValue(undefined)
    };
    Complaint.findById.mockResolvedValue(complaint);

    await updateComplaint({
      params: { id: 'complaint-id' },
      body: { status: 'inprogress' },
      user: { _id: 'admin-id', role: 'admin', name: 'Admin' }
    }, responseMock(), jest.fn());

    expect(complaint.startedAt).toBe(originalStartedAt);
  });

  test('escalates breached open complaints once and notifies admins and assigned staff', async () => {
    const overdue = {
      _id: 'overdue-id',
      title: 'Water supply failure',
      priority: 'low',
      status: 'inprogress',
      createdAt: new Date(Date.now() - 74 * 60 * 60 * 1000),
      startedAt: new Date(Date.now() - 74 * 60 * 60 * 1000),
      assignedTo: 'staff-id',
      escalated: false,
      save: jest.fn().mockResolvedValue(undefined)
    };
    const onTrack = {
      _id: 'on-track-id',
      priority: 'low',
      status: 'pending',
      createdAt: new Date(Date.now() - 24 * 60 * 60 * 1000),
      escalated: false,
      save: jest.fn().mockResolvedValue(undefined)
    };
    Complaint.find.mockResolvedValueOnce([overdue, onTrack]);

    const result = await escalateOverdueComplaints();

    expect(result).toEqual({ checked: 2, escalated: 1 });
    expect(overdue.escalated).toBe(true);
    expect(overdue.escalatedAt).toBeInstanceOf(Date);
    expect(overdue.priority).toBe('medium');
    expect(overdue.status).toBe('inprogress');
    expect(overdue.save).toHaveBeenCalledTimes(1);
    expect(onTrack.save).not.toHaveBeenCalled();
    expect(createNotificationForMany).toHaveBeenCalledWith(
      ['admin-id'],
      expect.objectContaining({ title: 'Complaint SLA Breached ⏰' })
    );
  });
});
