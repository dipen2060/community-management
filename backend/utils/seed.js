require('../config/env');
const mongoose = require('mongoose');
const User     = require('../models/User');
const House    = require('../models/House');
const Due      = require('../models/Due');
const Notice   = require('../models/Notice');
const Complaint= require('../models/Complaint');
const Notification = require('../models/Notification');
const { generateTemporaryPassword } = require('./userCredentials');

const seed = async () => {
  if (!process.env.MONGO_URI) throw new Error('MONGO_URI is missing. Create backend/.env from backend/.env.example.');
  if (process.env.NODE_ENV !== 'development') {
    throw new Error('Seeding is only permitted when NODE_ENV=development.');
  }
  if (/\bprod(uction)?\b/i.test(process.env.MONGO_URI)) {
    throw new Error('Refusing to seed a production MONGO_URI.');
  }
  await mongoose.connect(process.env.MONGO_URI);

  // Drop entire database to remove stale indexes (handles email unique index migration)
  await mongoose.connection.dropDatabase();
  console.log('🗑️  Database dropped — fresh start');

  // Recreate indexes by syncing all models
  await User.syncIndexes();
  await House.syncIndexes();
  await Due.syncIndexes();
  await Notice.syncIndexes();
  await Complaint.syncIndexes();
  await Notification.syncIndexes();
  console.log('📦 Indexes recreated');

  // Create users with random temporary passwords. In development (the only NODE_ENV this
  // script will run under — see the guard above) we keep the plaintext values just long
  // enough to print them once below, then let them go out of scope; only the bcrypt hash
  // is ever persisted.
  const seededCredentials = [];
  const temporaryPassword = (email) => {
    const password = generateTemporaryPassword();
    seededCredentials.push({ email, password });
    return { password, mustChangePassword: true };
  };
  const admin       = await User.create({ name: 'Admin Sharma',       username: 'admin.sharma',       email: 'admin@tole.com',        ...temporaryPassword('admin@tole.com'),    role: 'admin', exportSection: 'all' });
  const staff       = await User.create({ name: 'General Staff',      username: 'general.staff',      email: 'staff@tole.com',        ...temporaryPassword('staff@tole.com'),  role: 'staff', specialization: 'general', exportSection: 'complaints' });
  const electrician = await User.create({ name: 'Bishnu Electrician', username: 'bishnu.electrician', email: 'electrician@tole.com',  ...temporaryPassword('electrician@tole.com'),    role: 'staff', specialization: 'electric', phone: '9811111111', exportSection: 'complaints' });
  const plumber     = await User.create({ name: 'Krishna Plumber',    username: 'krishna.plumber',    email: 'plumber@tole.com',      ...temporaryPassword('plumber@tole.com'),  role: 'staff', specialization: 'water',    phone: '9822222222', exportSection: 'dues' });
  const guard       = await User.create({ name: 'Suresh Guard',       username: 'suresh.guard',       email: 'guard@tole.com',        ...temporaryPassword('guard@tole.com'),    role: 'staff', specialization: 'security', phone: '9833333333', exportSection: null });
  const r1          = await User.create({ name: 'Ram Bahadur',        username: 'ram.bahadur',        email: 'ram@tole.com',          ...temporaryPassword('ram@tole.com'),      role: 'resident' });
  const r2          = await User.create({ name: 'Sita Devi',          username: 'sita.devi',          email: 'sita@tole.com',         ...temporaryPassword('sita@tole.com'),     role: 'resident' });
  const r3          = await User.create({ name: 'Hari Prasad',        username: 'hari.prasad',        email: 'hari@tole.com',         ...temporaryPassword('hari@tole.com'),     role: 'resident' });

  // Create houses — different sections
  const h1 = await House.create({ houseNo: 'A-101', section: 'Section 1', floor: 1, type: 'apartment', owner: r1._id, monthlyDue: 500 });
  const h2 = await House.create({ houseNo: 'A-102', section: 'Section 1', floor: 1, type: 'apartment', owner: r2._id, monthlyDue: 500 });
  const h3 = await House.create({ houseNo: 'B-201', section: 'Section 2', floor: 2, type: 'apartment', owner: r3._id, monthlyDue: 600 });

  // Create dues
  const now = new Date();
  await Due.create({ house: h1._id, month: now.getMonth()+1, year: now.getFullYear(), amount: 500, status: 'paid',    dueDate: new Date(), paidDate: new Date(), receiptNo: 'RCP-001', paidBy: r1._id });
  await Due.create({ house: h2._id, month: now.getMonth()+1, year: now.getFullYear(), amount: 500, status: 'pending', dueDate: new Date() });
  await Due.create({ house: h3._id, month: now.getMonth()+1, year: now.getFullYear(), amount: 600, fine: 50, status: 'overdue', dueDate: new Date(Date.now() - 5*24*60*60*1000) });

  // Create notices — one section-specific, one for everyone
  await Notice.create({ title: 'Water Supply Off Tomorrow', content: 'Section 1 ma matra: Bihana 6-10 baje paani band huncha maintenance ko karan.', type: 'maintenance', targetSections: ['Section 1'], createdBy: admin._id });
  await Notice.create({ title: 'Tole Meeting Saturday',     content: 'Saturday 4pm ma community hall ma bhetghat huncha sabailai (sabai section).', type: 'event', targetSections: [], createdBy: admin._id });

  // Create complaints — with section auto-filled from house, showing assignment + resolution workflow
  await Complaint.create({
    title: 'Paani aaudaina', description: '3 din dekhi paani supply bhayena A-101 ma',
    category: 'water', priority: 'high', status: 'resolved', section: h1.section, house: h1._id,
    submittedBy: r1._id, assignedTo: plumber._id, resolvedBy: plumber._id,
    resolution: 'Main pump motor fail bhayeko thiyo, naya motor lagayera fix gariyo.', resolvedAt: new Date()
  });
  await Complaint.create({
    title: 'Batti gaako', description: 'Hallway ma light fused bhayo, andhyaro cha raati',
    category: 'electric', priority: 'medium', status: 'inprogress', section: h2.section, house: h2._id,
    submittedBy: r2._id, assignedTo: electrician._id
  });
  await Complaint.create({
    title: 'Lift band cha', description: '2 din dekhi lift kaam gardaina, button press garda response aaudaina',
    category: 'lift', priority: 'urgent', status: 'pending', section: h3.section, house: h3._id, submittedBy: r3._id
    // no specialist for "lift" in seed data — demonstrates "no specialist available" notification
  });

  // Create sample notifications
  await Notification.create({ user: r2._id, title: 'New Due Generated 💰', message: `Rs. 500 due generated for A-102. Please pay before the 10th to avoid fine.`, type: 'due', link: '/dues' });
  await Notification.create({ user: r3._id, title: 'Payment Overdue ⚠️',   message: `Your due for B-201 is overdue. Fine: Rs. 50. Please pay as soon as possible.`, type: 'overdue', link: '/dues' });
  await Notification.create({ user: r1._id, title: 'Complaint Resolved ✅', message: `Your complaint "Paani aaudaina" has been resolved by Krishna Plumber! Solution: Main pump motor fail bhayeko thiyo, naya motor lagayera fix gariyo.`, type: 'complaint', link: '/complaints', isRead: true });
  await Notification.create({ user: r1._id, title: '📢 New Notice (Section 1): Water Supply Off Tomorrow', message: 'Bihana 6-10 baje paani band huncha maintenance ko karan.', type: 'notice', link: '/notices' });
  await Notification.create({ user: r2._id, title: '📢 New Notice (Section 1): Water Supply Off Tomorrow', message: 'Bihana 6-10 baje paani band huncha maintenance ko karan.', type: 'notice', link: '/notices' });
  await Notification.create({ user: electrician._id, title: 'New Complaint Assigned to You 🔧', message: '"Batti gaako" (electric, Section 1, medium priority) auto-assigned to you based on your specialization.', type: 'complaint', link: '/complaints' });
  await Notification.create({ user: admin._id, title: 'New Complaint — No Specialist Available ⚠️', message: 'Hari Prasad submitted: "Lift band cha" (lift, Section 2). No matching staff found — please assign manually.', type: 'complaint', link: '/complaints' });

  console.log('✅ Seed data created!');
  console.log('');
  console.log('🔑 All seeded accounts share the same default password (DEFAULT_USER_PASSWORD in .env):');
  console.log('');
  seededCredentials.forEach(({ email, password }) => {
    console.log(`   ${email.padEnd(22)} ${password}`);
  });
  console.log('');
  console.log('   Each user must change their password on first login (mustChangePassword=true).');
  process.exit(0);
};

seed().catch(e => { console.error(e); process.exit(1); });