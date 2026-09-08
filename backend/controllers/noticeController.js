const Notice = require('../models/Notice');
const User = require('../models/User');
const House = require('../models/House');
const { createNotificationForMany } = require('./notificationController');

exports.getNotices = async (req, res) => {
  try {
    const filter = { isActive: true };
    
    // Search functionality - search in title and content
    if (req.query.search) {
      const searchRegex = new RegExp(req.query.search, 'i');
      filter.$or = [
        { title: searchRegex },
        { content: searchRegex }
      ];
    }
    
    // Filter by type if specified
    if (req.query.type) {
      filter.type = req.query.type;
    }
    
    let notices = await Notice.find(filter)
      .populate('createdBy', 'name')
      .sort({ createdAt: -1 });

    // Residents only see notices targeted at their section (or sent to all = empty targetSections)
    if (req.user.role === 'resident') {
      const myHouse = await House.findOne({ $or: [{ owner: req.user._id }, { tenant: req.user._id }] });
      const mySection = myHouse?.section;
      notices = notices.filter(n => n.targetSections.length === 0 || (mySection && n.targetSections.includes(mySection)));
    }

    res.json({ success: true, data: notices });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
};

exports.createNotice = async (req, res) => {
  try {
    const { title, content, type, targetSections } = req.body;
    const sections = Array.isArray(targetSections) ? targetSections.filter(Boolean) : [];
    const notice = await Notice.create({ title, content, type, targetSections: sections, createdBy: req.user._id });

    // 🔔 Notify residents — only those in the target section(s), or everyone if no section specified
    let residentFilter = { role: 'resident' };
    let recipientIds;
    if (sections.length > 0) {
      const housesInSections = await House.find({ section: { $in: sections } });
      const userIds = new Set();
      housesInSections.forEach(h => {
        if (h.owner)  userIds.add(h.owner.toString());
        if (h.tenant) userIds.add(h.tenant.toString());
      });
      recipientIds = Array.from(userIds);
    } else {
      const residents = await User.find(residentFilter).select('_id');
      recipientIds = residents.map(u => u._id);
    }

    const icons = { emergency: '🚨', event: '🎉', maintenance: '🔧', general: '📢' };
    const sectionLabel = sections.length > 0 ? ` (${sections.join(', ')})` : '';
    await createNotificationForMany(recipientIds, {
      title: `${icons[notice.type] || '📢'} New Notice${sectionLabel}: ${notice.title}`,
      message: notice.content,
      type: 'notice',
      link: '/notices'
    });

    res.status(201).json({ success: true, data: notice, notifiedCount: recipientIds.length });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
};

exports.deleteNotice = async (req, res) => {
  try {
    await Notice.findByIdAndUpdate(req.params.id, { isActive: false });
    res.json({ success: true, message: 'Notice removed' });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
};
