// docs/components/schemas.js
//
// Reusable OpenAPI component schemas for the Tole Community Management API.
//
// Every schema here is derived from the actual Mongoose models in
// backend/models/ and the exact response shapes produced by the controllers in
// backend/controllers/. Field names use snake_case or camelCase exactly as the
// API emits them — Mongo's `_id` is preserved (and aliased as `id` on
// AuditLog, which sets `toJSON.virtuals`).
//
// Two response shapes exist for users and are modelled separately:
//   - User          -> raw Mongoose document (`_id`, used by list/detail routes)
//   - UserProfile   -> explicit `id` object assembled by authController
//   - UserSummary   -> populated projection (only selected fields are returned)

/* ------------------------------------------------------------------ *
 * Enumerations — must stay in sync with the model `enum` arrays
 * ------------------------------------------------------------------ */

const UserRole = {
  type: 'string',
  enum: ['admin', 'staff', 'resident'],
  description: 'Access level. `admin` has full control, `staff` handles assigned work, `resident` is a community member.'
};

const Specialization = {
  type: 'string',
  nullable: true,
  enum: ['water', 'electric', 'lift', 'sanitation', 'security', 'general', null],
  description: 'Trade specialisation. Required when a user has the `staff` role; used for automatic complaint assignment.'
};

const ExportSection = {
  type: 'string',
  nullable: true,
  enum: ['dues', 'complaints', 'residents', 'all', null],
  description:
    'Which dataset a staff member is permitted to export. Always `all` for admins and `null` for residents. ' +
    'Admins are forced to `all` server-side.'
};

const HouseType = {
  type: 'string',
  enum: ['apartment', 'house', 'shop'],
  description: 'Kind of dwelling.'
};

const HouseStatus = {
  type: 'string',
  enum: ['active', 'archived'],
  description: '`archived` houses are excluded from dues and complaint lists unless `history=true` is requested.'
};

const DueStatus = {
  type: 'string',
  enum: ['pending', 'overdue', 'verification_pending', 'paid'],
  description:
    'Payment lifecycle. `pending` -> (resident submits proof) -> `verification_pending` -> (admin approves) -> `paid`, ' +
    'or (admin rejects) -> back to `pending`/`overdue`. A daily cron flips `pending` -> `overdue` and accrues fines.'
};

const PaymentMethod = {
  type: 'string',
  enum: ['cash', 'bank_transfer', 'digital_wallet'],
  description: 'How the resident settled the due.'
};

const PaymentAttemptStatus = {
  type: 'string',
  enum: ['verification_pending', 'approved', 'rejected'],
  description: 'Per-attempt outcome inside a due\'s `paymentAttempts` history.'
};

const ComplaintStatus = {
  type: 'string',
  enum: ['pending', 'inprogress', 'resolved', 'closed'],
  description:
    'Complaint lifecycle. `closed` is final and locked. A complaint is auto-closed after it has been reopened twice.'
};

const ComplaintCategory = {
  type: 'string',
  enum: ['water', 'electric', 'lift', 'sanitation', 'security', 'other'],
  description: 'Auto-detected from the title/description text by keyword scoring. Drives staff auto-assignment.'
};

const ComplaintPriority = {
  type: 'string',
  enum: ['low', 'medium', 'high', 'urgent'],
  description: 'Residents may only submit `low` or `medium`. Staff and admins may submit any priority.'
};

const NoticeType = {
  type: 'string',
  enum: ['general', 'emergency', 'event', 'maintenance'],
  description: 'Notice classification; also selects the emoji prefix on the pushed notification.'
};

const PollType = {
  type: 'string',
  enum: ['anonymous', 'named'],
  description: '`anonymous` masks every voter as `{ _id: "anonymous", name: "Anonymous" }` in all responses.'
};

const PollStatus = {
  type: 'string',
  enum: ['active', 'closed'],
  description: 'Closed polls reject votes and refuse option edits.'
};

const NotificationType = {
  type: 'string',
  enum: ['due', 'overdue', 'complaint', 'notice', 'general'],
  description: 'Category of the in-app notification.'
};

const RelationshipType = {
  type: 'string',
  enum: ['owner', 'tenant'],
  description: 'How a resident relates to a house.'
};

/* ------------------------------------------------------------------ *
 * Pagination
 * ------------------------------------------------------------------ */

const PaginationMeta = {
  type: 'object',
  description:
    'Pagination counters emitted by `buildMeta()` in backend/utils/paginate.js. ' +
    'Pagination is OPT-IN: these fields are only meaningful when a `page` query parameter was sent. ' +
    'Omitting `page` returns the full result set (deliberate, so frontend dropdowns keep working).',
  properties: {
    count: { type: 'integer', example: 20, description: 'Number of items in the current `data` array.' },
    total: { type: 'integer', example: 137, description: 'Total number of matching records across all pages.' },
    page: { type: 'integer', example: 1, description: 'Current page number. Always `1` when unpaginated.' },
    pages: {
      type: 'integer',
      example: 7,
      description: 'Total number of pages. Always `1` when unpaginated, because the full list was returned.'
    }
  }
};

/* ------------------------------------------------------------------ *
 * Users
 * ------------------------------------------------------------------ */

const UserSummary = {
  type: 'object',
  description: 'Trimmed user object as returned by Mongoose `populate()` projections.',
  properties: {
    _id: { type: 'string', example: '65f1a2b3c4d5e6f7a8b9c0d1' },
    name: { type: 'string', example: 'Ram Bahadur' },
    username: { type: 'string', example: 'ram.bahadur' },
    phone: { type: 'string', example: '9800000000' },
    email: { type: 'string', format: 'email', example: 'ram.bahadur@example.com' },
    specialization: { ...Specialization, description: 'Only populated in projections that select it.' }
  }
};

const User = {
  type: 'object',
  description:
    'A user account as stored (the bcrypt `password` hash is never serialised — controllers use `.select(\'-password\')`). ' +
    'Accounts are soft-deleted: `isActive=false` instead of removal.',
  properties: {
    _id: { type: 'string', example: '65f1a2b3c4d5e6f7a8b9c0d1' },
    name: { type: 'string', example: 'Ram Bahadur' },
    username: {
      type: 'string',
      example: 'ram.bahadur',
      description: 'Auto-generated from the name at creation time (`firstname.lastname`, de-duplicated with a numeric suffix). Display identifier only — login is by email.'
    },
    email: { type: 'string', format: 'email', example: 'ram.bahadur@example.com', description: 'The login identifier. Must be unique.' },
    phone: { type: 'string', example: '9800000000' },
    address: { type: 'string', example: 'Lalitpur, Nepal' },
    role: UserRole,
    exportSection: ExportSection,
    specialization: Specialization,
    mustChangePassword: {
      type: 'boolean',
      example: true,
      description:
        'Set to `true` when an admin creates the account or resets the password. The user must change it via ' +
        '`PUT /users/me/profile` before it stops being flagged. Frontends typically force a change-password screen.'
    },
    isActive: { type: 'boolean', example: true, description: '`false` means soft-deleted / deactivated. Inactive users cannot authenticate.' },
    createdAt: { type: 'string', format: 'date-time' },
    updatedAt: { type: 'string', format: 'date-time' }
  }
};

const UserProfile = {
  type: 'object',
  description:
    'The authenticated user profile returned by `POST /auth/login` and `GET /auth/me`. ' +
    'Assembled field-by-field by the controller, so it uses `id` (not `_id`) and always includes every key.',
  properties: {
    id: { type: 'string', example: '65f1a2b3c4d5e6f7a8b9c0d1' },
    name: { type: 'string', example: 'Ram Bahadur' },
    username: { type: 'string', example: 'ram.bahadur' },
    email: { type: 'string', format: 'email', example: 'ram.bahadur@example.com' },
    role: UserRole,
    phone: { type: 'string', example: '9800000000' },
    address: { type: 'string', example: 'Lalitpur, Nepal' },
    specialization: Specialization,
    exportSection: {
      ...ExportSection,
      description: 'Mirrors the stored value, but falls back to `all` for admins and `null` otherwise.'
    },
    mustChangePassword: { type: 'boolean', example: false }
  }
};

const LoginRequest = {
  type: 'object',
  required: ['email', 'password'],
  properties: {
    email: { type: 'string', format: 'email', example: 'admin@example.com', description: 'Case-insensitive.' },
    password: { type: 'string', format: 'password', minLength: 6, example: 'sup3rSecret' }
  }
};

const LoginResponse = {
  type: 'object',
  properties: {
    success: { type: 'boolean', example: true },
    token: {
      type: 'string',
      example: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpZCI6Ii4uLiJ9.signature',
      description: 'JWT. Send it as `Authorization: Bearer <token>` on every subsequent request. Lifetime comes from `JWT_EXPIRE` (default 7d).'
    },
    user: UserProfile
  }
};

const CreateUserRequest = {
  type: 'object',
  required: ['name', 'email'],
  properties: {
    name: { type: 'string', minLength: 2, maxLength: 50, example: 'Ram Bahadur' },
    email: { type: 'string', format: 'email', example: 'ram.bahadur@example.com' },
    phone: { type: 'string', example: '9800000000', description: 'Optional. Validated as a mobile number when present.' },
    role: { ...UserRole, default: 'resident' },
    specialization: { ...Specialization, description: 'Mandatory when `role` is `staff`.' },
    exportSection: ExportSection
  }
};

const UpdateUserRequest = {
  type: 'object',
  description: 'All fields optional — only supplied keys are applied.',
  properties: {
    name: { type: 'string', minLength: 2, maxLength: 50, example: 'Ram Bahadur Thapa' },
    phone: { type: 'string', example: '9800000001' },
    role: UserRole,
    specialization: Specialization,
    isActive: { type: 'boolean', example: true, description: 'Setting to `false` deactivates the account (soft delete).' },
    exportSection: ExportSection
  }
};

const UpdateMyProfileRequest = {
  type: 'object',
  description: 'Self-service profile edit. Omit every field to leave the profile unchanged.',
  properties: {
    name: {
      type: 'string',
      minLength: 2,
      maxLength: 50,
      example: 'Ram Bahadur Thapa',
      description: 'Changing the name also regenerates `username`.'
    },
    phone: { type: 'string', example: '9800000001' },
    address: { type: 'string', maxLength: 200, example: 'Lalitpur, Nepal' },
    currentPassword: {
      type: 'string',
      format: 'password',
      example: 'sup3rSecret',
      description: 'Required whenever `newPassword` is supplied. This is the only way to change your own password.'
    },
    newPassword: {
      type: 'string',
      format: 'password',
      minLength: 6,
      example: 'evenBetterSecret',
      description: 'Supplying this clears `mustChangePassword`.'
    }
  }
};

/* ------------------------------------------------------------------ *
 * Houses
 * ------------------------------------------------------------------ */

const House = {
  type: 'object',
  properties: {
    _id: { type: 'string', example: '65f1a2b3c4d5e6f7a8b9c0d2' },
    houseNo: { type: 'string', example: 'A-101', description: 'Unique across the community.' },
    section: { type: 'string', maxLength: 100, example: 'Section 1', description: 'Used to target notices and polls to specific sections.' },
    floor: { type: 'number', format: 'float', example: 1 },
    type: HouseType,
    owner: {
      ...UserSummary,
      nullable: true,
      description: 'Populated resident. `null` when unassigned. A resident may own at most one house.'
    },
    tenant: {
      ...UserSummary,
      nullable: true,
      description: 'Populated resident. `null` when unassigned. A resident may tenant at most one house.'
    },
    monthlyDue: { type: 'number', example: 500, description: 'Default monthly charge in NPR used when generating dues.' },
    isOccupied: { type: 'boolean', example: true, description: 'Only occupied, non-archived houses get dues generated.' },
    status: HouseStatus,
    address: { type: 'string', maxLength: 200, example: 'Lalitpur, Ward 4' },
    createdAt: { type: 'string', format: 'date-time' },
    updatedAt: { type: 'string', format: 'date-time' }
  }
};

const CreateHouseRequest = {
  type: 'object',
  required: ['houseNo'],
  properties: {
    houseNo: { type: 'string', example: 'A-101' },
    section: { type: 'string', maxLength: 100, example: 'Section 1' },
    floor: { type: 'number', minimum: 0, example: 1 },
    type: HouseType,
    owner: { type: 'string', description: 'User ID of an active resident. Omit or pass an empty string for none.', example: '65f1a2b3c4d5e6f7a8b9c0d1' },
    tenant: { type: 'string', description: 'User ID of an active resident. Omit or pass an empty string for none.', example: '65f1a2b3c4d5e6f7a8b9c0d3' },
    monthlyDue: { type: 'number', minimum: 0, default: 500, example: 500 },
    isOccupied: { type: 'boolean', default: true },
    address: { type: 'string', maxLength: 200, example: 'Lalitpur, Ward 4' }
  }
};

const UpdateHouseRequest = {
  type: 'object',
  description:
    'Partial update. To unassign an owner or tenant send an empty string (`""`) for that key — omitting the key leaves it untouched.',
  properties: {
    houseNo: { type: 'string', example: 'A-102' },
    section: { type: 'string', maxLength: 100, example: 'Section 2' },
    floor: { type: 'number', minimum: 0, example: 2 },
    type: HouseType,
    owner: { type: 'string', example: '' },
    tenant: { type: 'string', example: '' },
    monthlyDue: { type: 'number', minimum: 0, example: 750 },
    isOccupied: { type: 'boolean', example: true },
    address: { type: 'string', maxLength: 200, example: 'Lalitpur, Ward 4' }
  }
};

/* ------------------------------------------------------------------ *
 * Dues
 * ------------------------------------------------------------------ */

const PaymentProof = {
  type: 'object',
  properties: {
    originalName: { type: 'string', example: 'receipt.jpg' },
    fileName: { type: 'string', example: '1735680000000-48291355.jpg', description: 'Generated on-disk name. Never trust client input here.' },
    url: { type: 'string', example: '/api/dues/65f1a2b3c4d5e6f7a8b9c0d4/proof', description: 'Fetch it through `GET /dues/{id}/proof` so access control is applied.' },
    mimeType: { type: 'string', example: 'image/jpeg' },
    size: { type: 'integer', example: 184320, description: 'Bytes. Uploads are capped at 5 MB.' },
    uploadedAt: { type: 'string', format: 'date-time' }
  }
};

const PaymentAttempt = {
  type: 'object',
  description: 'One entry in a due\'s immutable payment history. Every submission appends; rejections are kept for audit.',
  properties: {
    _id: { type: 'string', example: '65f1a2b3c4d5e6f7a8b9c0e0' },
    submittedBy: UserSummary,
    paymentSubmittedAt: { type: 'string', format: 'date-time' },
    paymentMethod: PaymentMethod,
    paymentReference: { type: 'string', maxLength: 120, example: 'TXN-8891', description: 'Bank/wallet reference. Redacted as `[REDACTED]` in audit logs.' },
    declaredAmount: { type: 'number', example: 510, description: 'What the resident claimed to have paid.' },
    paymentProof: PaymentProof,
    status: PaymentAttemptStatus,
    rejectionReason: { type: 'string', nullable: true, example: 'Blurry image, amount unreadable.' },
    verifiedBy: UserSummary,
    verifiedAt: { type: 'string', format: 'date-time' }
  }
};

const Due = {
  type: 'object',
  properties: {
    _id: { type: 'string', example: '65f1a2b3c4d5e6f7a8b9c0d4' },
    house: {
      allOf: [{ $ref: '#/components/schemas/House' }],
      description: 'Populated house. Selections vary by endpoint (some include nested owner/tenant).',
      nullable: true
    },
    month: { type: 'integer', minimum: 1, maximum: 12, example: 9 },
    year: { type: 'integer', minimum: 2000, example: 2026 },
    amount: { type: 'number', example: 500, description: 'Base charge copied from the house\'s `monthlyDue` at generation time.' },
    fine: { type: 'number', example: 10, description: 'Overdue penalty in NPR, recalculated daily by a cron job. See `FINE_PER_DAY` / `MAX_FINE`.' },
    status: DueStatus,
    dueDate: { type: 'string', format: 'date-time', description: 'Defaults to the 10th of the billing month, 23:59:59 local time.' },
    paidDate: { type: 'string', format: 'date-time', nullable: true },
    receiptNo: { type: 'string', nullable: true, example: 'RCP-1735680000000-0C0D4', description: 'Generated on approval.' },
    paidBy: UserSummary,
    submittedBy: UserSummary,
    paymentSubmittedAt: { type: 'string', format: 'date-time', nullable: true },
    paymentMethod: { ...PaymentMethod, nullable: true },
    paymentReference: { type: 'string', nullable: true },
    declaredAmount: { type: 'number', nullable: true },
    paymentProof: { ...PaymentProof, nullable: true, description: 'The current proof. Superseded proofs are retained inside `paymentAttempts`.' },
    rejectionReason: { type: 'string', nullable: true },
    verifiedBy: UserSummary,
    verifiedAt: { type: 'string', format: 'date-time', nullable: true },
    paymentAttempts: { type: 'array', items: { $ref: '#/components/schemas/PaymentAttempt' } },
    createdAt: { type: 'string', format: 'date-time' },
    updatedAt: { type: 'string', format: 'date-time' }
  }
};

const DuesSummary = {
  type: 'object',
  description:
    'Aggregates computed over the ENTIRE filtered result set, not just the current page — so dashboard cards stay ' +
    'correct at any page size. `outstanding` is amount + effective fine for unpaid dues.',
  properties: {
    outstanding: { type: 'number', example: 8400, description: 'Total NPR still owed across `pending` + `overdue` dues.' },
    verification: { type: 'integer', example: 3, description: 'Count of dues awaiting admin verification.' },
    paid: { type: 'integer', example: 120, description: 'Count of paid dues.' }
  }
};

const DashboardStats = {
  type: 'object',
  description: 'Current calendar month only. Residents see figures scoped to their own linked houses.',
  properties: {
    totalDues: { type: 'integer', example: 48 },
    paidDues: { type: 'integer', example: 41 },
    pendingDues: { type: 'integer', example: 7, description: 'Includes `pending`, `overdue` and `verification_pending`.' },
    verificationPending: { type: 'integer', example: 2 },
    collectionRate: { type: 'number', example: '85.4', description: '`paidDues / totalDues` as a percentage string, one decimal place.' },
    totalCollected: { type: 'number', example: 21450, description: 'Sum of amount + fine across paid dues this month, in NPR.' }
  }
};

const PaymentClusterHouse = {
  type: 'object',
  properties: {
    houseNo: { type: 'string', example: 'A-101' },
    owner: { type: 'string', example: 'Ram Bahadur' },
    score: { type: 'integer', example: 7, description: 'Heuristic risk score: `lateDues * 3 + paidLate`.' },
    lateDues: { type: 'integer', example: 2 },
    paidLate: { type: 'integer', example: 1 }
  }
};

const PaymentCluster = {
  type: 'object',
  description: 'One K-Means cluster of payment behaviour, ordered from best to worst payer.',
  properties: {
    label: { type: 'string', example: 'Regular Payer 🟢', description: 'One of `Regular Payer 🟢`, `Late Payer 🟡`, `Defaulter 🔴`.' },
    residents: { type: 'array', items: { $ref: '#/components/schemas/PaymentClusterHouse' } }
  }
};

const SubmitPaymentRequest = {
  type: 'object',
  required: ['proof', 'declaredAmount', 'paymentMethod'],
  description: 'Sent as `multipart/form-data`. The file field must be named `proof`.',
  properties: {
    proof: { type: 'string', format: 'binary', description: 'JPG, PNG or PDF. Maximum 5 MB. Content is sniffed, not trusted from the extension.' },
    declaredAmount: {
      type: 'number',
      example: 510,
      description: 'Must equal `amount + fine` within a tolerance of 0.01, otherwise the submission is rejected with 400.'
    },
    paymentMethod: PaymentMethod,
    paymentReference: { type: 'string', maxLength: 120, example: 'TXN-8891' }
  }
};

const RejectPaymentRequest = {
  type: 'object',
  required: ['reason'],
  properties: {
    reason: { type: 'string', example: 'Blurry image, amount unreadable.', description: 'Shown to the resident in a notification, so be specific.' }
  }
};

/* ------------------------------------------------------------------ *
 * Complaints
 * ------------------------------------------------------------------ */

const Complaint = {
  type: 'object',
  properties: {
    _id: { type: 'string', example: '65f1a2b3c4d5e6f7a8b9c0d5' },
    title: { type: 'string', minLength: 5, maxLength: 100, example: 'No water supply on 3rd floor' },
    description: { type: 'string', minLength: 10, maxLength: 500, example: 'Water has been unavailable since Tuesday morning.' },
    category: ComplaintCategory,
    priority: ComplaintPriority,
    status: ComplaintStatus,
    section: { type: 'string', example: 'Section 1', description: 'Auto-filled from the submitter\'s linked house.' },
    house: { allOf: [{ $ref: '#/components/schemas/House' }], nullable: true, description: 'Usually not populated in list responses — only `_id` is present.' },
    submittedBy: { ...UserSummary, description: 'Populated with `name phone`.' },
    assignedTo: { ...UserSummary, nullable: true, description: 'Populated with `name phone specialization`. Assigned automatically by category.' },
    resolution: { type: 'string', nullable: true, example: 'Pump replaced and supply restored.', description: 'Mandatory when transitioning to `resolved`.' },
    resolvedBy: { ...UserSummary, nullable: true },
    resolvedAt: { type: 'string', format: 'date-time', nullable: true },
    reopenCount: { type: 'integer', example: 0, description: 'Incremented each time a resolved complaint is reopened. At 2 the complaint is forced to `closed`.' },
    attachments: {
      type: 'array',
      items: { type: 'string' },
      example: ['/api/complaints/65f1a2b3c4d5e6f7a8b9c0d5/attachments/1735680000000-48291355.jpg'],
      description: 'Download URLs. Fetch them through `GET /complaints/{id}/attachments/{filename}` so access control is applied.'
    },
    createdAt: { type: 'string', format: 'date-time' },
    updatedAt: { type: 'string', format: 'date-time' }
  }
};

const CreateComplaintRequest = {
  type: 'object',
  required: ['title', 'description'],
  description: 'Sent as `multipart/form-data` so files can be attached alongside the text fields.',
  properties: {
    title: { type: 'string', minLength: 5, maxLength: 100, example: 'No water supply on 3rd floor' },
    description: { type: 'string', minLength: 10, maxLength: 500, example: 'Water has been unavailable since Tuesday morning.' },
    priority: { ...ComplaintPriority, default: 'medium', description: 'Residents are limited to `low` and `medium`; anything higher returns 403.' },
    section: { type: 'string', example: 'Section 1', description: 'Optional. Normally auto-filled from the linked house; falls back to this, then to `Unknown`.' },
    houseId: { type: 'string', description: 'Optional for staff/admin. Residents may only supply a house they are linked to.', example: '65f1a2b3c4d5e6f7a8b9c0d2' },
    attachments: {
      type: 'array',
      items: { type: 'string', format: 'binary' },
      description: 'Optional. Up to **5** files, each a JPEG/PNG/GIF image or PDF, 5 MB per file. Repeat the `attachments` field for each file.'
    }
  }
};

const SimilarComplaint = {
  type: 'object',
  description: 'A previously resolved/closed complaint surfaced by TF-IDF cosine similarity, so the submitter can see how it was handled before.',
  properties: {
    title: { type: 'string', example: 'Water tank empty for two days' },
    section: { type: 'string', example: 'Section 1' },
    resolution: { type: 'string', example: 'Tank cleaned and pump restarted.' },
    resolvedBy: { ...UserSummary, nullable: true, description: 'Includes `name`, `phone` and `specialization`.' },
    matchPercent: { type: 'string', example: '62.4', description: 'Similarity percentage as a string, one decimal place. Only matches above 10% are returned (max 3).' }
  }
};

const UpdateComplaintRequest = {
  type: 'object',
  description: 'Partial update. All fields optional.',
  properties: {
    status: {
      ...ComplaintStatus,
      description:
        'Allowed transitions only: `pending` -> `inprogress`, `inprogress` -> `resolved`, `resolved` -> `pending` (reopen) ' +
        'or `closed`. `closed` accepts nothing. Any other move returns 400.'
    },
    assignedTo: { type: 'string', description: 'User ID of an active staff member. Ignored for non admin/staff callers.', example: '65f1a2b3c4d5e6f7a8b9c0d3' },
    resolution: { type: 'string', minLength: 10, maxLength: 500, example: 'Pump replaced and supply restored.', description: 'Required (and length-validated) whenever `status` is `resolved`.' }
  }
};

/* ------------------------------------------------------------------ *
 * Notices
 * ------------------------------------------------------------------ */

const Notice = {
  type: 'object',
  properties: {
    _id: { type: 'string', example: '65f1a2b3c4d5e6f7a8b9c0d6' },
    title: { type: 'string', minLength: 5, maxLength: 100, example: 'Water supply interruption on Friday' },
    content: { type: 'string', minLength: 10, maxLength: 1000, example: 'Supply will be interrupted from 9 AM to 2 PM for tank maintenance.' },
    type: NoticeType,
    targetSections: {
      type: 'array',
      items: { type: 'string' },
      example: ['Section 1'],
      description: 'Empty array = broadcast to every section. Residents only ever see notices matching their own section(s) or broadcasts.'
    },
    createdBy: { ...UserSummary, description: 'Populated with `name` only.' },
    isActive: { type: 'boolean', example: true, description: 'Deletion sets this to `false` (soft delete) rather than removing the row.' },
    createdAt: { type: 'string', format: 'date-time' },
    updatedAt: { type: 'string', format: 'date-time' }
  }
};

const CreateNoticeRequest = {
  type: 'object',
  required: ['title', 'content'],
  properties: {
    title: { type: 'string', minLength: 5, maxLength: 100, example: 'Water supply interruption on Friday' },
    content: { type: 'string', minLength: 10, maxLength: 1000, example: 'Supply will be interrupted from 9 AM to 2 PM for tank maintenance.' },
    type: { ...NoticeType, default: 'general' },
    targetSections: {
      type: 'array',
      items: { type: 'string' },
      example: ['Section 1'],
      description: 'Optional. Omit or pass `[]` to broadcast to everyone. Every entry must match an existing house section, otherwise 400.'
    }
  }
};

/* ------------------------------------------------------------------ *
 * Notifications
 * ------------------------------------------------------------------ */

const Notification = {
  type: 'object',
  properties: {
    _id: { type: 'string', example: '65f1a2b3c4d5e6f7a8b9c0d7' },
    user: { type: 'string', description: 'Owner of the notification. Always the requesting user in list responses.' },
    title: { type: 'string', example: '🗳️ New Poll: Water supply timing' },
    message: { type: 'string', example: 'Please cast your vote before Friday.' },
    type: NotificationType,
    due: { type: 'string', nullable: true, description: 'Related due, when the notification is about a payment.' },
    notificationDate: { type: 'string', format: 'date-time', nullable: true },
    link: { type: 'string', example: '/dues', description: 'Frontend route to navigate to when the notification is clicked.' },
    isRead: { type: 'boolean', example: false },
    createdAt: { type: 'string', format: 'date-time' },
    updatedAt: { type: 'string', format: 'date-time' }
  }
};

/* ------------------------------------------------------------------ *
 * Polls
 * ------------------------------------------------------------------ */

const PollOption = {
  type: 'object',
  properties: {
    _id: { type: 'string', example: '65f1a2b3c4d5e6f7a8b9c0d8' },
    text: { type: 'string', example: 'Morning (6-9 AM)' },
    votes: {
      type: 'array',
      items: UserSummary,
      description: 'Populated voter list. For `anonymous` polls every entry is replaced with `{ _id: "anonymous", name: "Anonymous" }`.'
    }
  }
};

const Poll = {
  type: 'object',
  properties: {
    _id: { type: 'string', example: '65f1a2b3c4d5e6f7a8b9c0d8' },
    title: { type: 'string', minLength: 5, maxLength: 100, example: 'Preferred water supply timing?' },
    description: { type: 'string', maxLength: 500, example: 'Help us schedule the tank cleaning.' },
    options: { type: 'array', items: { $ref: '#/components/schemas/PollOption' }, minItems: 2 },
    type: PollType,
    status: PollStatus,
    targetSections: {
      type: 'array',
      items: { type: 'string' },
      example: ['Section 1'],
      description: 'Empty array = every section may vote. Section-targeted polls are hidden from residents outside those sections.'
    },
    createdBy: { ...UserSummary, description: 'Populated with `name` only.' },
    endDate: { type: 'string', format: 'date-time', nullable: true, description: 'Must be in the future when set. After this instant the poll rejects votes.' },
    totalVotes: { type: 'integer', example: 42 },
    hasVoted: { type: 'boolean', example: false, description: 'Computed per requester. Not stored in the database.' },
    createdAt: { type: 'string', format: 'date-time' },
    updatedAt: { type: 'string', format: 'date-time' }
  }
};

const CreatePollRequest = {
  type: 'object',
  required: ['title', 'options'],
  properties: {
    title: { type: 'string', minLength: 5, maxLength: 100, example: 'Preferred water supply timing?' },
    description: { type: 'string', maxLength: 500, example: 'Help us schedule the tank cleaning.' },
    options: {
      type: 'array',
      items: { type: 'string' },
      minItems: 2,
      example: ['Morning (6-9 AM)', 'Evening (6-9 PM)'],
      description: 'At least 2 non-empty option labels.'
    },
    type: { ...PollType, default: 'anonymous' },
    targetSections: { type: 'array', items: { type: 'string' }, example: ['Section 1'], description: 'Optional. Omit or pass `[]` to target everyone.' },
    endDate: { type: 'string', format: 'date-time', description: 'Optional, but must be in the future.' }
  }
};

const UpdatePollRequest = {
  type: 'object',
  description: 'Partial update. All fields optional.',
  properties: {
    title: { type: 'string', minLength: 5, maxLength: 100 },
    description: { type: 'string', maxLength: 500 },
    status: { ...PollStatus, enum: ['active', 'closed'], description: 'Any other value is rejected with 400.' },
    endDate: { type: 'string', format: 'date-time', description: 'Must be in the future.' }
  }
};

const VotePollRequest = {
  type: 'object',
  required: ['optionIndex'],
  properties: {
    optionIndex: {
      type: 'integer',
      minimum: 0,
      example: 0,
      description: 'Zero-based index into the poll\'s `options` array. Out-of-range values return 400. Voting twice returns 409.'
    }
  }
};

const PollResultRow = {
  type: 'object',
  properties: {
    text: { type: 'string', example: 'Morning (6-9 AM)' },
    votes: { type: 'integer', example: 30 },
    percentage: { type: 'string', example: '71.4', description: 'Share of `totalVotes` as a percentage string, one decimal place.' },
    voters: { type: 'array', items: UserSummary, description: 'Masked to anonymous placeholders for `anonymous` polls.' }
  }
};

const PollResults = {
  type: 'object',
  properties: {
    poll: {
      type: 'object',
      properties: {
        title: { type: 'string', example: 'Preferred water supply timing?' },
        description: { type: 'string', example: 'Help us schedule the tank cleaning.' },
        totalVotes: { type: 'integer', example: 42 },
        status: PollStatus,
        type: PollType
      }
    },
    results: { type: 'array', items: { $ref: '#/components/schemas/PollResultRow' } }
  }
};

/* ------------------------------------------------------------------ *
 * Audit logs
 * ------------------------------------------------------------------ */

const AuditLog = {
  type: 'object',
  description:
    'An immutable audit trail entry. The model exposes `id` as an alias for `_id` via `toJSON.virtuals`, so both are present.',
  properties: {
    id: { type: 'string', example: '65f1a2b3c4d5e6f7a8b9c0d9' },
    _id: { type: 'string', example: '65f1a2b3c4d5e6f7a8b9c0d9' },
    actor_id: { ...UserSummary, description: 'Populated with `name`, `username`, `role`.' },
    actor_role: UserRole,
    action: {
      type: 'string',
      maxLength: 100,
      example: 'due_approved',
      description:
        'Dotted action name. Observed values include `user_created`, `user_edited`, `user_password_reset`, `user_deleted`, ' +
        '`due_approved`, `due_rejected`, `complaint_status_changed`, `export_denied`.'
    },
    target_type: { type: 'string', maxLength: 50, example: 'due', description: 'Entity kind: `user`, `due`, `complaint`, `export`, ...' },
    target_id: { type: 'string', example: '65f1a2b3c4d5e6f7a8b9c0d4' },
    details: {
      type: 'object',
      additionalProperties: true,
      description:
        'Free-form context. The shape varies by `action`. Sensitive keys (`password`, `token`, `secret`, `paymentReference`, ' +
        '`paymentProof`, `credentials`, ...) are replaced with the literal string `[REDACTED]`.',
      example: { oldStatus: 'verification_pending', newStatus: 'paid', receiptNo: 'RCP-1735680000000-0C0D4' }
    },
    created_at: { type: 'string', format: 'date-time', description: 'Note the snake_case name — the model overrides the timestamp key.' }
  }
};

/* ------------------------------------------------------------------ *
 * Resident <-> House links
 * ------------------------------------------------------------------ */

const ResidentHouseLink = {
  type: 'object',
  description: 'A resident\'s relationship to a house. A resident may be linked to several houses.',
  properties: {
    _id: { type: 'string', example: '65f1a2b3c4d5e6f7a8b9c0da' },
    resident_id: { ...UserSummary, description: 'Populated with `name`, `username`, `role`.' },
    house_id: {
      allOf: [{ $ref: '#/components/schemas/House' }],
      description: 'Fully populated house. Legacy links (derived from `house.owner`/`house.tenant` without a `resident_houses` row) are returned with `relationship_type: "legacy"` and no `_id`.'
    },
    relationship_type: { ...RelationshipType, description: 'A synthetic value `legacy` is also possible on read (see Phase 3 notes).' },
    createdAt: { type: 'string', format: 'date-time' },
    updatedAt: { type: 'string', format: 'date-time' }
  }
};

const CreateResidentHouseRequest = {
  type: 'object',
  required: ['resident_id', 'house_id', 'relationship_type'],
  properties: {
    resident_id: { type: 'string', description: 'User ID of an existing resident.', example: '65f1a2b3c4d5e6f7a8b9c0d1' },
    house_id: { type: 'string', example: '65f1a2b3c4d5e6f7a8b9c0d2' },
    relationship_type: RelationshipType
  }
};

/* ------------------------------------------------------------------ *
 * Misc
 * ------------------------------------------------------------------ */

// These three are consumed by components/responses.js, but they are *schemas*
// rather than responses, so they must live in components.schemas for the
// `#/components/schemas/...` references to resolve.

const ValidationError = {
  type: 'object',
  description: 'A single failed field check, as produced by `express-validator`.',
  properties: {
    field: { type: 'string', example: 'email' },
    message: { type: 'string', example: 'Invalid email format' }
  }
};

const ErrorResponse = {
  type: 'object',
  required: ['success', 'message'],
  properties: {
    success: { type: 'boolean', example: false },
    message: { type: 'string', example: 'Access denied' }
  }
};

const ValidationErrorResponse = {
  type: 'object',
  required: ['success', 'message', 'errors'],
  description:
    'The `express-validator` failure envelope. Note the contrast with the export-filter error, whose `errors` array ' +
    'contains plain strings instead of `{ field, message }` objects.',
  properties: {
    success: { type: 'boolean', example: false },
    message: { type: 'string', example: 'Validation failed' },
    errors: { type: 'array', items: { $ref: '#/components/schemas/ValidationError' } }
  }
};

const HealthResponse = {
  type: 'object',
  properties: {
    success: { type: 'boolean', example: true },
    message: { type: 'string', example: 'Tole Management API is running' }
  }
};

const MessageResponse = {
  type: 'object',
  description: 'Endpoints that return no resource, only a status message.',
  properties: {
    success: { type: 'boolean', example: true },
    message: { type: 'string', example: 'Operation completed.' }
  }
};

module.exports = {
  UserRole,
  Specialization,
  ExportSection,
  HouseType,
  HouseStatus,
  DueStatus,
  PaymentMethod,
  PaymentAttemptStatus,
  ComplaintStatus,
  ComplaintCategory,
  ComplaintPriority,
  NoticeType,
  PollType,
  PollStatus,
  NotificationType,
  RelationshipType,
  PaginationMeta,
  UserSummary,
  User,
  UserProfile,
  LoginRequest,
  LoginResponse,
  CreateUserRequest,
  UpdateUserRequest,
  UpdateMyProfileRequest,
  House,
  CreateHouseRequest,
  UpdateHouseRequest,
  PaymentProof,
  PaymentAttempt,
  Due,
  DuesSummary,
  DashboardStats,
  PaymentClusterHouse,
  PaymentCluster,
  SubmitPaymentRequest,
  RejectPaymentRequest,
  Complaint,
  CreateComplaintRequest,
  SimilarComplaint,
  UpdateComplaintRequest,
  Notice,
  CreateNoticeRequest,
  Notification,
  PollOption,
  Poll,
  CreatePollRequest,
  UpdatePollRequest,
  VotePollRequest,
  PollResultRow,
  PollResults,
  AuditLog,
  ResidentHouseLink,
  CreateResidentHouseRequest,
  ValidationError,
  ErrorResponse,
  ValidationErrorResponse,
  HealthResponse,
  MessageResponse
};
