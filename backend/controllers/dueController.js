const fs = require('fs');
const path = require('path');
const Due = require('../models/Due');
const House = require('../models/House');
const { createNotification } = require('./notificationController');

function calculateFine(dueDate, now = new Date()) {
  if (!dueDate || dueDate >= now) return 0;
  const daysLate = Math.max(0, Math.floor((now - dueDate) / (1000 * 60 * 60 * 24)));
  return daysLate * 10;
}


async function getResidentHouseIds(userId) {
  const houses = await House.find({
    $or: [{ owner: userId }, { tenant: userId }]
  }).select('_id');
  return houses.map(h => h._id);
}

async function isResidentForHouse(userId, houseId) {
  const house = await House.findOne({
    _id: houseId,
    $or: [{ owner: userId }, { tenant: userId }]
  }).select('houseNo section owner tenant');
  return house;
}

function removeUploadedFile(url) {
  if (!url) return;
  const relative = url.replace(/^\/+/, '');
  const filePath = path.join(__dirname, '..', relative);
  fs.unlink(filePath, () => {});
}

// K-Means clustering for payment behavior
function kMeansClustering(data, k = 3) {
  if (data.length < k) k = data.length;
  if (!k) return [];
  let centroids = data.slice(0, k).map(d => ({ score: d.score }));
  let clusters = [];
  for (let iter = 0; iter < 50; iter++) {
    clusters = Array.from({ length: k }, () => []);
    data.forEach(d => {
      let minDist = Infinity, idx = 0;
      centroids.forEach((c, i) => {
        const dist = Math.abs(d.score - c.score);
        if (dist < minDist) { minDist = dist; idx = i; }
      });
      clusters[idx].push(d);
    });
    const newCentroids = clusters.map(c =>
      c.length ? { score: c.reduce((s, d) => s + d.score, 0) / c.length } : centroids[0]
    );
    if (JSON.stringify(newCentroids) === JSON.stringify(centroids)) break;
    centroids = newCentroids;
  }
  clusters.sort((a, b) => {
    const avgA = a.reduce((s, d) => s + d.score, 0) / (a.length || 1);
    const avgB = b.reduce((s, d) => s + d.score, 0) / (b.length || 1);
    return avgA - avgB;
  });
  const labels = ['Regular Payer 🟢', 'Late Payer 🟡', 'Defaulter 🔴'];
  return clusters.map((group, i) => ({ label: labels[i] || 'Unknown', residents: group }));
}

exports.getDues = async (req, res) => {
  try {
    const filter = {};
    if (req.query.status) filter.status = req.query.status;
    if (req.query.month)  filter.month = Number(req.query.month);
    if (req.query.year)   filter.year = Number(req.query.year);

    // Residents can only see dues belonging to a house where they are owner/tenant.
    if (req.user.role === 'resident') {
      const houseIds = await getResidentHouseIds(req.user._id);
      filter.house = { $in: houseIds };
    }

    const dues = await Due.find(filter)
      .populate({ path: 'house', select: 'houseNo floor section monthlyDue owner tenant', populate: [
        { path: 'owner', select: 'name username email phone' },
        { path: 'tenant', select: 'name username email phone' }
      ]})
      .populate('paidBy', 'name username')
      .populate('submittedBy', 'name username')
      .populate('verifiedBy', 'name username')
      .sort({ dueDate: 1, createdAt: -1 });

    res.json({ success: true, count: dues.length, data: dues });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// Submit proof; this does NOT mark the due paid. An admin must verify it first.
exports.submitPaymentProof = async (req, res) => {
  let saved = false;
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, message: 'Payment proof is required (JPG, PNG or PDF).' });
    }

    const due = await Due.findById(req.params.id).populate('house', 'houseNo owner tenant');
    if (!due) return res.status(404).json({ success: false, message: 'Due not found' });

    if (due.status === 'paid') {
      removeUploadedFile(`/uploads/payment-proofs/${req.file.filename}`);
      return res.status(400).json({ success: false, message: 'This due is already paid.' });
    }
    if (due.status === 'verification_pending') {
      removeUploadedFile(`/uploads/payment-proofs/${req.file.filename}`);
      return res.status(409).json({ success: false, message: 'A payment proof is already awaiting admin verification.' });
    }

    const house = await isResidentForHouse(req.user._id, due.house._id);
    if (!house) {
      removeUploadedFile(`/uploads/payment-proofs/${req.file.filename}`);
      return res.status(403).json({ success: false, message: 'You can only submit proof for your own house.' });
    }

    const effectiveFine = Math.max(due.fine || 0, calculateFine(due.dueDate));
    const totalDue = Number((due.amount + effectiveFine).toFixed(2));
    const declaredAmount = Number(req.body.declaredAmount);
    if (!Number.isFinite(declaredAmount) || declaredAmount <= 0) {
      removeUploadedFile(`/uploads/payment-proofs/${req.file.filename}`);
      return res.status(400).json({ success: false, message: 'Valid payment amount is required.' });
    }
    if (Math.abs(declaredAmount - totalDue) > 0.01) {
      removeUploadedFile(`/uploads/payment-proofs/${req.file.filename}`);
      return res.status(400).json({ success: false, message: `Payment amount must be Rs. ${totalDue}.` });
    }

    const paymentMethod = String(req.body.paymentMethod || '').trim();
    const allowedMethods = ['cash', 'bank_transfer', 'digital_wallet'];
    if (!allowedMethods.includes(paymentMethod)) {
      removeUploadedFile(`/uploads/payment-proofs/${req.file.filename}`);
      return res.status(400).json({ success: false, message: 'Select a valid payment method.' });
    }

    // If the due date has passed, capture the current fine at submission time.
    const currentFine = Math.max(due.fine || 0, calculateFine(due.dueDate));
    const paymentProof = {
      originalName: req.file.originalname,
      fileName: req.file.filename,
      url: `/api/dues/${due._id}/proof`,
      mimeType: req.file.mimetype,
      size: req.file.size,
      uploadedAt: new Date()
    };

    // Keep track of an older rejected proof and remove it only after the replacement is saved.
    const previousProofUrl = due.paymentProof?.url;

    due.fine = currentFine;
    due.status = 'verification_pending';
    due.submittedBy = req.user._id;
    due.paymentSubmittedAt = new Date();
    due.paymentMethod = paymentMethod;
    due.paymentReference = String(req.body.paymentReference || '').trim() || undefined;
    due.declaredAmount = declaredAmount;
    due.paymentProof = paymentProof;
    due.rejectionReason = null;
    due.verifiedBy = null;
    due.verifiedAt = null;
    due.paymentAttempts.push({ submittedBy: req.user._id, paymentSubmittedAt: due.paymentSubmittedAt, paymentMethod, paymentReference: due.paymentReference, declaredAmount, paymentProof, status: 'verification_pending' });
    await due.save();
    saved = true;
    // Keep previous proofs for audit/history instead of deleting financial evidence.

    try {
      await createNotification({
      user: req.user._id,
      title: 'Payment Proof Submitted 🧾',
      message: `Your payment proof for ${due.house.houseNo} (${due.month}/${due.year}) was submitted and is waiting for admin verification.`,
      type: 'due',
        link: '/dues'
      });
    } catch (notificationError) {
      console.error('Payment notification error:', notificationError.message);
    }

    // Notify admins so verification is not dependent on someone checking manually.
    const User = require('../models/User');
    try {
      const admins = await User.find({ role: 'admin', isActive: true }).select('_id');
      for (const admin of admins) {
        await createNotification({
          user: admin._id,
          title: 'Payment Verification Required 🔎',
          message: `${req.user.name} submitted payment proof for ${due.house.houseNo} (${due.month}/${due.year}) — Rs. ${declaredAmount}.`,
          type: 'due',
          link: '/dues'
        });
      }
    } catch (notificationError) {
      console.error('Admin payment notification error:', notificationError.message);
    }

    res.json({ success: true, data: due, message: 'Payment proof submitted. Waiting for admin verification.' });
  } catch (err) {
    if (req.file && !saved) removeUploadedFile(`/uploads/payment-proofs/${req.file.filename}`);
    res.status(500).json({ success: false, message: err.message });
  }
};

exports.approvePayment = async (req, res) => {
  try {
    const due = await Due.findById(req.params.id).populate('house', 'houseNo owner tenant');
    if (!due) return res.status(404).json({ success: false, message: 'Due not found' });
    if (due.status !== 'verification_pending') {
      return res.status(400).json({ success: false, message: 'Only payments awaiting verification can be approved.' });
    }

    const receiptNo = `RCP-${Date.now()}-${String(due._id).slice(-5).toUpperCase()}`;
    const now = new Date();
    const latestAttempt = [...(due.paymentAttempts || [])].reverse().find(a => a.status === 'verification_pending');
    if (latestAttempt) { latestAttempt.status = 'approved'; latestAttempt.verifiedBy = req.user._id; latestAttempt.verifiedAt = now; }
    due.status = 'paid';
    due.paidDate = now;
    due.paidBy = due.submittedBy || req.user._id;
    due.receiptNo = receiptNo;
    due.verifiedBy = req.user._id;
    due.verifiedAt = now;
    due.rejectionReason = null;
    await due.save();

    const recipient = due.submittedBy || due.house.owner || due.house.tenant;
    if (recipient) {
      try {
        await createNotification({
          user: recipient,
          title: 'Payment Verified ✅',
          message: `Your payment for ${due.house.houseNo} (${due.month}/${due.year}) has been verified. Receipt: ${receiptNo}.`,
          type: 'due',
          link: '/dues'
        });
      } catch (notificationError) {
        console.error('Payment approval notification error:', notificationError.message);
      }
    }

    res.json({ success: true, data: due, message: 'Payment approved and receipt generated.' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

exports.rejectPayment = async (req, res) => {
  try {
    const reason = String(req.body.reason || '').trim();
    if (!reason) return res.status(400).json({ success: false, message: 'Rejection reason is required.' });

    const due = await Due.findById(req.params.id).populate('house', 'houseNo owner tenant');
    if (!due) return res.status(404).json({ success: false, message: 'Due not found' });
    if (due.status !== 'verification_pending') {
      return res.status(400).json({ success: false, message: 'Only payments awaiting verification can be rejected.' });
    }

    const now = new Date();
    due.fine = Math.max(due.fine || 0, calculateFine(due.dueDate, now));
    due.status = due.dueDate && due.dueDate < now ? 'overdue' : 'pending';
    due.rejectionReason = reason;
    due.verifiedBy = req.user._id;
    due.verifiedAt = now;
    const latestAttempt = [...(due.paymentAttempts || [])].reverse().find(a => a.status === 'verification_pending');
    if (latestAttempt) { latestAttempt.status = 'rejected'; latestAttempt.rejectionReason = reason; latestAttempt.verifiedBy = req.user._id; latestAttempt.verifiedAt = now; }
    await due.save();

    const recipient = due.submittedBy || due.house.owner || due.house.tenant;
    if (recipient) {
      try {
        await createNotification({
          user: recipient,
          title: 'Payment Proof Rejected ⚠️',
          message: `Your payment proof for ${due.house.houseNo} was rejected. Reason: ${reason}. Please submit a valid proof.`,
          type: 'due',
          link: '/dues'
        });
      } catch (notificationError) {
        console.error('Payment rejection notification error:', notificationError.message);
      }
    }

    res.json({ success: true, data: due, message: 'Payment proof rejected. Resident can submit a new proof.' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// Kept for API compatibility, but direct marking as paid is intentionally disabled.
exports.payDue = async (req, res) => {
  return res.status(400).json({
    success: false,
    message: 'Direct payment marking is disabled. Residents must submit payment proof and an admin must verify it.'
  });
};

// Auto generate monthly dues
exports.generateMonthlyDues = async (req, res) => {
  try {
    const now = new Date();
    const month = now.getMonth() + 1;
    const year = now.getFullYear();
    const houses = await House.find({ isOccupied: true });
    let created = 0;

    for (const house of houses) {
      const exists = await Due.findOne({ house: house._id, month, year });
      if (exists) continue;

      const dueDate = new Date(year, month - 1, 10, 23, 59, 59, 999);
      const overdue = dueDate < now;
      const fine = calculateFine(dueDate, now);

      await Due.create({
        house: house._id,
        month,
        year,
        amount: house.monthlyDue,
        fine,
        status: overdue ? 'overdue' : 'pending',
        dueDate
      });
      created++;

      const recipients = [house.owner, house.tenant].filter(Boolean);
      for (const userId of recipients) {
        await createNotification({
          user: userId,
          title: 'New Due Generated 💰',
          message: `Rs. ${house.monthlyDue} due generated for ${house.houseNo} (${month}/${year}). Please pay before the 10th to avoid fine.`,
          type: 'due',
          link: '/dues'
        });
      }
    }

    res.json({ success: true, message: `${created} dues generated for ${month}/${year}` });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// Payment behavior clustering
exports.getPaymentClusters = async (req, res) => {
  try {
    const houses = await House.find().populate('owner', 'name');
    const houseStats = [];
    for (const house of houses) {
      const allDues = await Due.find({ house: house._id });
      const lateDues = allDues.filter(d => d.status === 'overdue').length;
      const paidLate = allDues.filter(d => d.status === 'paid' && d.paidDate && d.dueDate && d.paidDate > d.dueDate).length;
      const score = lateDues * 3 + paidLate;
      houseStats.push({ houseNo: house.houseNo, owner: house.owner?.name || 'N/A', score, lateDues, paidLate });
    }
    const clusters = kMeansClustering(houseStats);
    res.json({ success: true, data: clusters });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

exports.getDashboardStats = async (req, res) => {
  try {
    const now = new Date();
    const month = now.getMonth() + 1;
    const year = now.getFullYear();
    const baseFilter = { month, year };
    if (req.user.role === 'resident') {
      const houseIds = await getResidentHouseIds(req.user._id);
      baseFilter.house = { $in: houseIds };
    }

    const totalDues = await Due.countDocuments(baseFilter);
    const paidDues = await Due.countDocuments({ ...baseFilter, status: 'paid' });
    const pendingDues = await Due.countDocuments({ ...baseFilter, status: { $in: ['pending', 'overdue', 'verification_pending'] } });
    const verificationPending = await Due.countDocuments({ ...baseFilter, status: 'verification_pending' });
    const totalAmount = await Due.aggregate([
      { $match: { ...baseFilter, status: 'paid' } },
      { $group: { _id: null, total: { $sum: { $add: ['$amount', { $ifNull: ['$fine', 0] }] } } } }
    ]);

    res.json({
      success: true,
      data: {
        totalDues,
        paidDues,
        pendingDues,
        verificationPending,
        collectionRate: totalDues ? ((paidDues / totalDues) * 100).toFixed(1) : 0,
        totalCollected: totalAmount[0]?.total || 0
      }
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

exports.getPaymentProof = async (req, res) => {
  try {
    const due = await Due.findById(req.params.id).populate('house', 'owner tenant');
    if (!due) return res.status(404).json({ success: false, message: 'Due not found' });
    if (req.user.role === 'resident') {
      const allowed = [due.house?.owner, due.house?.tenant].filter(Boolean).some(id => id.toString() === req.user._id.toString());
      if (!allowed) return res.status(403).json({ success: false, message: 'Access denied' });
    } else if (!['admin','staff'].includes(req.user.role)) {
      return res.status(403).json({ success: false, message: 'Access denied' });
    }
    const fileName = due.paymentProof?.fileName;
    if (!fileName || fileName.includes('/') || fileName.includes('\\') || fileName.includes('..')) return res.status(404).json({ success: false, message: 'Proof file unavailable' });
    const absolute = path.join(__dirname, '..', 'uploads', 'payment-proofs', fileName);
    if (!fs.existsSync(absolute)) return res.status(404).json({ success: false, message: 'Proof file not found' });
    return res.sendFile(absolute);
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
};

exports.getDueById = async (req, res) => {
  try {
    const due = await Due.findById(req.params.id)
      .populate({ path: 'house', select: 'houseNo floor section owner tenant', populate: [
        { path: 'owner', select: 'name username email phone' },
        { path: 'tenant', select: 'name username email phone' }
      ]})
      .populate('submittedBy', 'name username email')
      .populate('verifiedBy', 'name username');
    if (!due) return res.status(404).json({ success: false, message: 'Due not found' });

    if (req.user.role === 'resident') {
      const allowed = await isResidentForHouse(req.user._id, due.house._id);
      if (!allowed) return res.status(403).json({ success: false, message: 'Access denied' });
    }

    res.json({ success: true, data: due });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};
