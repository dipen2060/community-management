const AuditLog = require('../models/AuditLog');
const mongoose = require('mongoose');
const { getPagination, applyPagination, buildMeta } = require('../utils/paginate');

exports.getAuditLogs = async (req, res) => {
  try {
    const filter = {};
    if (req.query.actor) {
      if (!mongoose.isValidObjectId(req.query.actor)) {
        return res.status(400).json({ success: false, message: 'Invalid actor filter' });
      }
      filter.actor_id = req.query.actor;
    }
    if (req.query.action) filter.action = req.query.action;

    if (req.query.from || req.query.to) {
      filter.created_at = {};
      if (req.query.from) {
        const from = new Date(`${req.query.from}T00:00:00.000Z`);
        if (Number.isNaN(from.getTime())) {
          return res.status(400).json({ success: false, message: 'Invalid from date filter' });
        }
        filter.created_at.$gte = from;
      }
      if (req.query.to) {
        const to = new Date(`${req.query.to}T23:59:59.999Z`);
        if (Number.isNaN(to.getTime())) {
          return res.status(400).json({ success: false, message: 'Invalid to date filter' });
        }
        filter.created_at.$lte = to;
      }
    }

    const total = await AuditLog.countDocuments(filter);
    const { page, limit } = getPagination(req);
    let query = AuditLog.find(filter)
      .populate('actor_id', 'name username role')
      .sort({ created_at: -1 });
    query = applyPagination(query, page, limit);
    const logs = await query;

    res.json({
      success: true,
      ...buildMeta(total, page, limit, logs.length),
      data: logs
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};
