const Complaint = require('../models/Complaint');
const User = require('../models/User');
const House = require('../models/House');
const { getPagination, applyPagination, buildMeta } = require('../utils/paginate');
const { createNotification, createNotificationForMany } = require('./notificationController');
const { detectCategory } = require('../utils/categoryClassifier');
const { detectPriority, maxSeverity } = require('../utils/priorityClassifier');
const { findBestStaffForCategory } = require('../utils/autoAssign');
const { logAudit } = require('../utils/auditLogger');
const { getResidentHouseIds, isResidentLinkedToHouse } = require('../utils/residentHouses');
const fs = require('fs');
const path = require('path');
const { MAX_SEARCH_LENGTH, getSearchRegex } = require('../utils/search');

// TF-IDF Content-Based Filtering
function tokenize(text) {
  return text.toLowerCase().replace(/[^a-z0-9\u0900-\u097F\s]/g, '').split(/\s+/).filter(Boolean);
}

function cosineSimilarity(a, b) {
  const dot = a.reduce((s, v, i) => s + v * b[i], 0);
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
    const df = allDocs.filter(d => tokenize(d).includes(word)).length;
    const idf = Math.log((allDocs.length + 1) / (df + 1)) + 1;
    return tfVal * idf;
  });
}

async function findSimilarComplaints(newText, pastComplaints) {
  const allTexts = pastComplaints.map(c => `${c.title} ${c.description}`);
  const vocab = [...new Set(allTexts.concat(newText).flatMap(tokenize))];
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

exports.getComplaints = async (req, res, next) => {
  try {
    const filter = {};
    if (req.user.role === 'resident') filter.submittedBy = req.user._id;
    if (req.user.role === 'resident') {
      const houseIds = await getResidentHouseIds(req.user._id);
      if (req.query.houseId) {
        filter.house = { $in: houseIds.filter(id => String(id) === String(req.query.houseId)) };
      }
    } else if (req.query.houseId) {
      filter.house = req.query.houseId;
    }
    if (req.user.role === 'staff' && req.query.mine === 'true') filter.assignedTo = req.user._id;
    if (req.query.status) filter.status = req.query.status;
    if (req.query.category) filter.category = req.query.category;
    if (req.query.section) filter.section = req.query.section;
    if (req.query.history !== 'true') {
      const activeHouseIds = await House.find({ status: { $ne: 'archived' } }).distinct('_id');
      filter.$and = [{ $or: [{ house: { $in: activeHouseIds } }, { house: null }] }];
    }

    // Search functionality - search in title and description
    if (req.query.search !== undefined) {
      if (typeof req.query.search !== 'string' || req.query.search.length > MAX_SEARCH_LENGTH) {
        return res.status(400).json({ success: false, message: `Search query must be a string of at most ${MAX_SEARCH_LENGTH} characters.` });
      }
      const searchRegex = getSearchRegex(req.query.search);
      if (!searchRegex) return res.json({ success: true, ...buildMeta(0, 1, getPagination(req).limit, []), data: [] });
      filter.$or = [
        { title: searchRegex },
        { description: searchRegex }
      ];
    }

    const total = await Complaint.countDocuments(filter);
    const { page, limit } = getPagination(req);

    let query = Complaint.find(filter)
      .populate('submittedBy', 'name phone')
      .populate('assignedTo', 'name phone specialization')
      .populate('resolvedBy', 'name phone')
      .sort({ createdAt: -1 });
    query = applyPagination(query, page, limit);
    const complaints = await query;

    res.json({ success: true, ...buildMeta(total, page, limit, complaints.length), data: complaints });
  } catch (err) { next(err); }
};

exports.createComplaint = async (req, res, next) => {
  try {
    const { title, description } = req.body;
    if (req.user.role === 'resident' && ['high', 'urgent'].includes(req.body.priority)) {
      return res.status(403).json({ success: false, message: 'Residents may only submit low or medium priority complaints.' });
    }
<<<<<<< HEAD
    const requestedPriority = req.body.priority || 'medium';

    // 🤖 ALGORITHM 3: Auto-detect urgency from wording (keyword scoring, same
    // technique as category detection). A resident's own priority pick is
    // capped at 'medium' above, but a genuinely dangerous report ("gas leak",
    // "fire", "flooding") should never sit at low priority just because the
    // person who filed it wasn't allowed to tick "urgent" themselves.
    const { priority: detectedPriority, confidence: priorityConfidence } = detectPriority(title, description);
    const priority = detectedPriority ? maxSeverity(requestedPriority, detectedPriority) : requestedPriority;
    const priorityWasEscalated = priority !== requestedPriority;
    const priorityNote = priorityWasEscalated ? ` — ⚠️ auto-flagged ${priority} priority by the system based on wording` : '';

=======
    const priority = req.body.priority || 'medium';
    
>>>>>>> c53e76b3ee128c9665eaa1ebde60318d3eb34fee
    // 📍 Find the resident's house to auto-fill the section/area
    const linkedHouseIds = req.user.role === 'resident'
      ? await getResidentHouseIds(req.user._id)
      : [];
    const requestedHouseId = req.body.houseId;
    const myHouse = requestedHouseId
      ? await House.findById(requestedHouseId)
      : await House.findOne(
        req.user.role === 'resident'
          ? { _id: { $in: linkedHouseIds } }
          : { $or: [{ owner: req.user._id }, { tenant: req.user._id }] }
      );
    if (!myHouse && req.user.role === 'resident') {
      return res.status(400).json({ success: false, message: 'No house is linked to your account. Please contact admin to link your house before submitting complaints.' });
    }
    if (req.user.role === 'resident' && requestedHouseId && !(await isResidentLinkedToHouse(req.user._id, requestedHouseId))) {
      return res.status(403).json({ success: false, message: 'You can only submit complaints for your linked houses.' });
    }
    const section = myHouse?.section || req.body.section || 'Unknown';

    // 🤖 ALGORITHM 1: Auto-detect category from title + description (keyword scoring)
    const { category, confidence } = detectCategory(title, description);

    // Find similar past complaints (only within resolved/closed of same category for better relevance)
    const resolved = await Complaint.find({ status: { $in: ['resolved', 'closed'] }, category })
      .sort({ createdAt: -1 })
      .limit(200);
    const similar = resolved.length ? await findSimilarComplaints(`${title} ${description}`, resolved) : [];

    // 🤖 ALGORITHM 2: Auto-assign to best-matching, least-busy staff
    const assignedStaff = await findBestStaffForCategory(category);

    // Handle file attachments
    const attachments = req.files ? req.files.map(file => file.filename) : [];

    const complaint = await Complaint.create({
      title, description, priority,
      category, section,
      house: myHouse?._id,
      submittedBy: req.user._id,
      assignedTo: assignedStaff ? assignedStaff._id : null,
      status: assignedStaff ? 'inprogress' : 'pending',
      attachments
    });
    if (attachments.length) {
      complaint.attachments = attachments.map(filename => `/api/complaints/${complaint._id}/attachments/${filename}`);
      await complaint.save();
    }

    await complaint.populate('assignedTo', 'name phone specialization');

    // 🔔 Notify assigned staff (or all staff+admin if no specialist found)
    if (assignedStaff) {
      await createNotification({
        user: assignedStaff._id,
        title: 'New Complaint Assigned to You 🔧',
        message: `"${title}" (${category}, ${section}, ${priority} priority) auto-assigned to you based on your specialization.${priorityNote}`,
        type: 'complaint',
        link: '/complaints'
      });
      // Also let admin know who it went to
      const admins = await User.find({ role: 'admin', isActive: true }).select('_id');
      await createNotificationForMany(admins.map(u => u._id), {
        title: 'New Complaint Auto-Assigned 🤖',
        message: `"${title}" (${section}) assigned to ${assignedStaff.name} (${category} specialist)`,
        type: 'complaint',
        link: '/complaints'
      });
    } else {
      const staffAndAdmin = await User.find({ role: { $in: ['admin', 'staff'] }, isActive: true }).select('_id');
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
  } catch (err) { next(err); }
};

exports.authorizeComplaintUpdate = async (req, res, next) => {
  if (req.user.role === 'admin' || req.user.role === 'resident') return next();

  try {
    const complaint = await Complaint.findById(req.params.id).select('assignedTo');
    if (!complaint) return res.status(404).json({ success: false, message: 'Not found' });
    if (req.user.role !== 'staff' || !complaint.assignedTo || complaint.assignedTo.toString() !== req.user._id.toString()) {
      return res.status(403).json({ success: false, message: 'Only the staff assigned to this complaint or an admin can update it.' });
    }
    next();
  } catch (err) {
    next(err);
  }
};

exports.getComplaintAttachment = async (req, res, next) => {
  try {
    const complaint = await Complaint.findOne({
      _id: req.params.id,
      attachments: `/api/complaints/${req.params.id}/attachments/${req.params.filename}`
    }).select('submittedBy assignedTo attachments');
    if (!complaint) return res.status(404).json({ success: false, message: 'Attachment not found' });
    const allowed = req.user.role === 'admin' ||
      complaint.submittedBy.toString() === req.user._id.toString() ||
      (complaint.assignedTo && complaint.assignedTo.toString() === req.user._id.toString());
    if (!allowed) return res.status(403).json({ success: false, message: 'Access denied' });
    const filename = path.basename(req.params.filename);
    const filePath = path.resolve(__dirname, '..', 'uploads', filename);
    if (!filePath.startsWith(path.resolve(__dirname, '..', 'uploads') + path.sep) || !fs.existsSync(filePath)) {
      return res.status(404).json({ success: false, message: 'Attachment not found' });
    }
    return res.sendFile(filePath);
  } catch (err) { next(err); }
};

exports.updateComplaint = async (req, res, next) => {
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

    const oldStatus = complaint.status;
    const allowedTransitions = {
      pending: ['inprogress'],
      inprogress: ['resolved'],
      resolved: ['pending', 'closed'],
      closed: []
    };
    if (status && status !== oldStatus && !allowedTransitions[oldStatus].includes(status)) {
      return res.status(400).json({ success: false, message: `Invalid complaint status transition from ${oldStatus} to ${status}.` });
    }

    // Track reopens: if it was already resolved before and is now being changed away from resolved/closed
    const wasResolved = oldStatus === 'resolved';
    const isReopening = wasResolved && status && status !== 'resolved' && status !== 'closed';

    if (status) complaint.status = status;
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

    if (status) {
      await logAudit(req.user._id, req.user.role, 'complaint_status_changed', 'complaint', complaint._id, {
        oldStatus,
        requestedStatus: status,
        newStatus: complaint.status,
        reopenCount: complaint.reopenCount
      });
    }

    // 🔔 Notify the resident who submitted the complaint about status change
    if (status) {
      const statusMessages = {
        inprogress: `Your complaint "${complaint.title}" is now being worked on by ${complaint.assignedTo?.name || 'staff'}.`,
        resolved: `Your complaint "${complaint.title}" has been resolved by ${req.user.name}! Solution: ${resolution}`,
        pending: `Your complaint "${complaint.title}" status was updated to pending.`,
        closed: `Your complaint "${complaint.title}" has been closed permanently after multiple resolve attempts.`
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
  } catch (err) { next(err); }
};

// 🤖 ALGORITHM 4: Complaint SLA / auto-escalation.
// Each priority level gets a resolution-time budget; anything still open past
// its budget is bumped one severity level and admins are alerted, so nothing
// silently sits forgotten in the queue. Called from a cron job in server.js.
const SLA_HOURS = { urgent: 24, high: 48, medium: 96, low: 168 };
const ESCALATE_TO = { low: 'medium', medium: 'high', high: 'urgent', urgent: 'urgent' };

exports.escalateOverdueComplaints = async () => {
  const openComplaints = await Complaint.find({
    status: { $in: ['pending', 'inprogress'] },
    escalated: false
  });

  const now = Date.now();
  let escalatedCount = 0;
  const admins = await User.find({ role: 'admin', isActive: true }).select('_id');

  for (const complaint of openComplaints) {
    const slaHours = SLA_HOURS[complaint.priority] ?? SLA_HOURS.medium;
    const ageHours = (now - new Date(complaint.createdAt).getTime()) / (1000 * 60 * 60);
    if (ageHours < slaHours) continue;

    const oldPriority = complaint.priority;
    complaint.priority = ESCALATE_TO[complaint.priority] || 'urgent';
    complaint.escalated = true;
    complaint.escalatedAt = new Date();
    await complaint.save();
    escalatedCount++;

    await createNotificationForMany(admins.map(a => a._id), {
      title: 'Complaint SLA Breached ⏰',
      message: `"${complaint.title}" has been unresolved for ${Math.round(ageHours)}h (SLA: ${slaHours}h) and was auto-escalated from ${oldPriority} to ${complaint.priority}.`,
      type: 'complaint',
      link: '/complaints'
    });

    if (complaint.assignedTo) {
      await createNotification({
        user: complaint.assignedTo,
        title: 'Complaint Escalated ⏰',
        message: `"${complaint.title}" passed its ${slaHours}h SLA and is now ${complaint.priority} priority. Please prioritize it.`,
        type: 'complaint',
        link: '/complaints'
      });
    }
  }

  return { checked: openComplaints.length, escalated: escalatedCount };
};