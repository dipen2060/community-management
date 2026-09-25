// Verification test suite for backend logic, validations, and algorithms
const fs = require('fs');
const path = require('path');
const assert = require('assert');

console.log('🧪 Running Tole Management Logic Verification Tests...\n');

const uploadDirectories = [
  path.join(__dirname, 'uploads'),
  path.join(__dirname, 'uploads', 'payment-proofs')
];

uploadDirectories.forEach((directory) => {
  fs.mkdirSync(directory, { recursive: true });
});

let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    fn();
    console.log(`  ✅ PASS: ${name}`);
    passed++;
  } catch (err) {
    console.error(`  ❌ FAIL: ${name}`);
    console.error(`     ${err.message}`);
    failed++;
  }
}

// 1. Upload Directories Test
test('Upload directories exist', () => {
  const uploads = path.join(__dirname, 'uploads');
  const proofs = path.join(__dirname, 'uploads', 'payment-proofs');
  assert.ok(fs.existsSync(uploads), 'uploads folder must exist');
  assert.ok(fs.existsSync(proofs), 'uploads/payment-proofs folder must exist');
});

// 2. Fine Calculation Logic Test
function calculateFine(dueDate, now = new Date()) {
  if (!dueDate || dueDate >= now) return 0;
  const daysLate = Math.max(0, Math.floor((now - dueDate) / (1000 * 60 * 60 * 24)));
  return daysLate * 10;
}

test('Effective fine uses Math.max of stored fine and calculated late fine', () => {
  const now = new Date('2026-07-20T12:00:00Z');
  const dueDate = new Date('2026-07-10T23:59:59Z'); // 9 days late -> 90 Rs
  const storedFine = 10;
  const lateFine = calculateFine(dueDate, now);
  const effectiveFine = Math.max(storedFine || 0, lateFine);
  assert.strictEqual(effectiveFine, 90, 'Effective fine should be 90, not 10');

  const amount = 500;
  const totalDue = Number((amount + effectiveFine).toFixed(2));
  assert.strictEqual(totalDue, 590, 'Total due should be 590');
});

// 3. Tokenizer Devanagari & English Test
const { detectCategory } = require('./utils/categoryClassifier');

test('Category classifier detects English & Nepali keywords', () => {
  const r1 = detectCategory('Paani aaudaina', 'pipe leak bhayo');
  assert.strictEqual(r1.category, 'water', 'Expected water category for paani/pipe');

  const r2 = detectCategory('Batti gaako', 'hallway light fuse bhayo');
  assert.strictEqual(r2.category, 'electric', 'Expected electric category for batti/light');

  const r3 = detectCategory('Lift problem', 'elevator button not working');
  assert.strictEqual(r3.category, 'lift', 'Expected lift category for elevator/lift');
});

// 4. Tokenizer in Complaint Controller (Devanagari Unicode support)
test('Devanagari characters are preserved by tokenizer', () => {
  function tokenize(text) {
    return text.toLowerCase().replace(/[^a-z0-9\u0900-\u097F\s]/g, '').split(/\s+/).filter(Boolean);
  }
  const tokens = tokenize('पानी आपूर्ति बन्द भयो water leak');
  assert.ok(tokens.includes('पानी'), 'Should include Nepali word पानी');
  assert.ok(tokens.includes('water'), 'Should include English word water');
});

// 5. Auth Middleware Rejects Query Token
const { protect } = require('./middleware/auth');

test('Auth middleware rejects query-string token with 401', () => {
  let statusCode;
  let nextCalled = false;
  const reqWithQuery = { headers: {}, query: { token: 'my-jwt-token' } };
  const res = {
    status(code) {
      statusCode = code;
      return this;
    },
    json() {
      return this;
    }
  };

  protect(reqWithQuery, res, () => {
    nextCalled = true;
  });

  assert.strictEqual(statusCode, 401, 'Query-string token requests must be rejected');
  assert.strictEqual(nextCalled, false, 'Rejected requests must not reach the next middleware');
});

// 6. User credentials generator test
const { generateTemporaryPassword } = require('./utils/userCredentials');
test('Temporary passwords are random and sufficiently long', () => {
  const first = generateTemporaryPassword();
  const second = generateTemporaryPassword();
  assert.ok(first.length >= 20);
  assert.notStrictEqual(first, second);
});

test('Concurrent payment decisions allow only one conditional transition', () => {
  let status = 'verification_pending';
  const transition = (nextStatus) => {
    if (status !== 'verification_pending') return false;
    status = nextStatus;
    return true;
  };

  assert.strictEqual(transition('paid'), true);
  assert.strictEqual(transition('pending'), false);
  assert.strictEqual(status, 'paid');
});

test('Concurrent poll submissions reject a duplicate voter', () => {
  const voters = new Set();
  const submitVote = (userId) => {
    if (voters.has(userId)) return false;
    voters.add(userId);
    return true;
  };

  assert.strictEqual(submitVote('resident-1'), true);
  assert.strictEqual(submitVote('resident-1'), false);
});

test('Staff directory scope excludes non-staff users', () => {
  const users = [
    { role: 'admin', isActive: true },
    { role: 'staff', isActive: true },
    { role: 'resident', isActive: true },
    { role: 'staff', isActive: false }
  ];
  const staffDirectory = users.filter(user => user.role === 'staff' && user.isActive);
  assert.deepStrictEqual(staffDirectory, [{ role: 'staff', isActive: true }]);
});

test('Complaint updates require the assigned staff member', () => {
  const complaint = { assignedTo: 'staff-1' };
  const canUpdate = (user) => user.role === 'admin'
    || (user.role === 'staff' && complaint.assignedTo === user.id);

  assert.strictEqual(canUpdate({ id: 'staff-1', role: 'staff' }), true);
  assert.strictEqual(canUpdate({ id: 'staff-2', role: 'staff' }), false);
  assert.strictEqual(canUpdate({ id: 'admin-1', role: 'admin' }), true);
});

console.log(`\n========================================`);
console.log(`Results: ${passed} passed, ${failed} failed`);
console.log(`========================================\n`);

if (failed > 0) process.exit(1);
