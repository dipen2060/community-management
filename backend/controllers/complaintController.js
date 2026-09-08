const Complaint = require('../models/Complaint');
const User = require('../models/User');
const House = require('../models/House');
const { createNotification, createNotificationForMany } = require('./notificationController');
const { detectCategory } = require('../utils/categoryClassifier');
const { findBestStaffForCategory } = require('../utils/autoAssign');

// TF-IDF Content-Based Filtering
function tokenize(text) {
  return text.toLowerCase().replace(/[^a-z0-9\u0900-\u097F\s]/g, '').split(/\s+/).filter(Boolean);
}

function cosineSimilarity(a, b) {
  const dot  = a.reduce((s, v, i) => s + v * b[i], 0);
  const magA = Math.sqrt(a.reduce((s, v) => s + v * v, 0));
  const magB = Math.sqrt(b.reduce((s, v) => s + v * v, 0));
  return magA && magB ? dot / (magA * magB) : 0;
}

function tfidfVector(text, allDocs, vocab) {
  const tokens = tokenize(text);
  const tf = {};
  tokens.forEach(t => { tf[t] = (tf[t] || 0) + 1; });
  return vocab.map(word => {
    const tfVal = (tf[word] || 0) / (tokens.length || 1);
    const df    = allDocs.filter(d => tokenize(d).includes(word)).length;
    const idf   = Math.log((allDocs.length + 1) / (df + 1)) + 1;
    return tfVal * idf;
  });
}

async function findSimilarComplaints(newText, pastComplaints) {
  const allTexts = pastComplaints.map(c => `${c.title} ${c.description}`);
  const vocab    = [...new Set(allTexts.concat(newText).flatMap(tokenize))];
  const queryVec = tfidfVector(newText, allTexts, vocab);
  const ranked = pastComplaints
    .map((c, i) => ({ complaint: c, sim: cosineSimilarity(queryVec, tfidfVector(allTexts[i], allTexts, vocab)) }))
    .filter(x => x.sim > 0.1)
    .sort((a, b) => b.sim - a.sim)
    .slice(0, 3);

  // Populate resolver name + contact for each match
  await Promise.all(ranked.map(async r => {
    if (r.complaint.resolvedBy) {
      const resolver = await User.findById(r.complaint.resolvedBy).select('name phone specialization');
      r.resolverInfo = resolver ? { name: resolver.name, phone: resolver.phone, specialization: resolver.specialization } : null;
    }
  }));

  return ranked;
}

exports.getComplaints = async (req, res) => {
  try {
    const filter = {};
    if (req.user.role === 'resident') filter.submittedBy = req.user._id;
    if (req.user.role === 'staff' && req.query.mine === 'true') filter.assignedTo = req.user._id;
    if (req.query.status)   filter.status   = req.query.status;
    if (req.query.category) filter.category = req.query.category;
    if (req.query.section)  filter.section  = req.query.section;
    
    // Search functionality - search in title and description
    if (req.query.search) {
      const searchRegex = new RegExp(req.query.search, 'i');
      filter.$or = [
        { title: searchRegex },
        { description: searchRegex }
      ];
    }
    
    const complaints = await Complaint.find(filter)
      .populate('submittedBy', 'name phone')
      .populate('assignedTo', 'name phone specialization')
      .populate('resolvedBy', 'name phone')
      .sort({ createdAt: -1 });
    res.json({ success: true, count: complaints.length, data: complaints });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
};

exports.createComplaint = async (req, res) => {
  try {
    const { title, description, priority } = req.body;

    // 📍 Find the resident's house to auto-fill the section/area
    const myHouse = await House.findOne({ $or: [{ owner: req.user._id }, { tenant: req.user._id }] });
    if (!myHouse && req.user.role === 'resident') {
      return res.status(400).json({ success: false, message: 'No house is linked to your account. Please contact admin to link your house before submitting complaints.' });
    }
    const section = myHouse?.section || req.body.section || 'Unknown';

    // 🤖 ALGORITHM 1: Auto-detect category from title + description (keyword scoring)
    const { category, confidence } = detectCategory(title, description);

    // Find similar past complaints (only within resolved/closed of same category for better relevance)
    const resolved = await Complaint.find({ status: { $in: ['resolved', 'closed'] }, category });
    const similar  = resolved.length ? await findSimilarComplaints(`${title} ${description}`, resolved) : [];

    // 🤖 ALGORITHM 2: Auto-assign to best-matching, least-busy staff
    const assignedStaff = await findBestStaffForCategory(category);

    // Handle file attachments
    const attachments = req.files ? req.files.map(file => `/uploads/${file.filename}`) : [];

    const complaint = await Complaint.create({
      title, description, priority,
      category, section,
      house: myHouse?._id,
      submittedBy: req.user._id,
      assignedTo: assignedStaff ? assignedStaff._id : null,
      status: assignedStaff ? 'inprogress' : 'pending',
      attachments
    });

    await complaint.populate('assignedTo', 'name phone specialization');

    // 🔔 Notify assigned staff (or all staff+admin if no specialist found)
    if (assignedStaff) {
      await createNotification({
        user: assignedStaff._id,
        title: 'New Complaint Assigned to You 🔧',
        message: `"${title}" (${category}, ${section}, ${priority} priority) auto-assigned to you based on your specialization.`,
        type: 'complaint',
        link: '/complaints'
      });
      // Also let admin know who it went to
      const admins = await User.find({ role: 'admin' }).select('_id');
      await createNotificationForMany(admins.map(u => u._id), {
        title: 'New Complaint Auto-Assigned 🤖',
        message: `"${title}" (${section}) assigned to ${assignedStaff.name} (${category} specialist)`,
        type: 'complaint',
        link: '/complaints'
      });
    } else {
      const staffAndAdmin = await User.find({ role: { $in: ['admin', 'staff'] } }).select('_id');
      await createNotificationForMany(staffAndAdmin.map(u => u._id), {
        title: 'New Complaint — No Specialist Available ⚠️',
        message: `${req.user.name} submitted: "${title}" (${category}, ${section}). No matching staff found — please assign manually.`,
        type: 'complaint',
        link: '/complaints'
      });
    }

    res.status(201).json({
      success: true,
      data: complaint,
      autoDetected: { category, confidence, section },
      autoAssigned: assignedStaff ? { name: assignedStaff.name, specialization: assignedStaff.specialization, phone: assignedStaff.phone } : null,
      similarComplaints: similar.map(s => ({
        title: s.complaint.title,
        section: s.complaint.section,
        resolution: s.complaint.resolution,
        resolvedBy: s.resolverInfo,
        matchPercent: (s.sim * 100).toFixed(1)
      }))
    });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
};

exports.updateComplaint = async (req, res) => {
  try {
    const { status, assignedTo, resolution } = req.body;
    const complaint = await Complaint.findById(req.params.id);
    if (!complaint) return res.status(404).json({ success: false, message: 'Not found' });

    // 🔒 RULE: Once closed (locked), nobody can modify it anymore
    if (complaint.status === 'closed') {
      return res.status(403).json({ success: false, message: 'This complaint is closed and locked. It has been resolved and reopened twice already — no further changes allowed.' });
    }

    // Role-based permissions
    if (req.user.role === 'resident') {
      const isSubmitter = complaint.submittedBy.toString() === req.user._id.toString();
      if (!isSubmitter || status !== 'pending' || complaint.status !== 'resolved') {
        return res.status(403).json({ success: false, message: 'Residents can only reopen their own resolved complaints.' });
      }
    }

    // 🔒 RULE: Only the assigned staff (or admin) can resolve a complaint
    if (status === 'resolved') {
      const isAssignedStaff = complaint.assignedTo && complaint.assignedTo.toString() === req.user._id.toString();
      const isAdmin = req.user.role === 'admin';
      if (!isAssignedStaff && !isAdmin) {
        return res.status(403).json({ success: false, message: 'Only the staff assigned to this complaint (or an admin) can mark it as resolved.' });
      }
      // 🔒 RULE: Resolution description is compulsory when resolving
      if (!resolution || !resolution.trim()) {
        return res.status(400).json({ success: false, message: 'Resolution description is required when resolving a complaint — explain what the problem was and how it was fixed.' });
      }
    }

    // Track reopens: if it was already resolved before and is now being changed away from resolved/closed
    const wasResolved = complaint.status === 'resolved';
    const isReopening = wasResolved && status && status !== 'resolved' && status !== 'closed';

    if (status)     complaint.status     = status;
    if (assignedTo) complaint.assignedTo = assignedTo;
    if (resolution) complaint.resolution = resolution;

    if (status === 'resolved') {
      complaint.resolvedAt = new Date();
      complaint.resolvedBy = req.user._id;
    }

    if (isReopening) {
      complaint.reopenCount += 1;
      // 🔒 RULE: After being reopened twice (resolved → reopened → resolved → reopened again), lock it
      if (complaint.reopenCount >= 2) {
        complaint.status = 'closed';
      }
    }

    await complaint.save();
    await complaint.populate('assignedTo', 'name phone specialization');
    await complaint.populate('resolvedBy', 'name phone');

    // 🔔 Notify the resident who submitted the complaint about status change
    if (status) {
      const statusMessages = {
        inprogress: `Your complaint "${complaint.title}" is now being worked on by ${complaint.assignedTo?.name || 'staff'}.`,
        resolved:   `Your complaint "${complaint.title}" has been resolved by ${req.user.name}! Solution: ${resolution}`,
        pending:    `Your complaint "${complaint.title}" status was updated to pending.`,
        closed:     `Your complaint "${complaint.title}" has been closed permanently after multiple resolve attempts.`
      };
      const finalStatus = complaint.status; // may have flipped to 'closed'
      if (statusMessages[finalStatus]) {
        await createNotification({
          user: complaint.submittedBy,
          title: finalStatus === 'resolved' ? 'Complaint Resolved ✅' : finalStatus === 'closed' ? 'Complaint Closed 🔒' : 'Complaint Update 🔧',
          message: statusMessages[finalStatus],
          type: 'complaint',
          link: '/complaints'
        });
      }
    }

    res.json({ success: true, data: complaint });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
};
