const Notice = require('../models/Notice');
const User = require('../models/User');
const House = require('../models/House');
const { createNotificationForMany } = require('./notificationController');
const { getResidentHouseIds, ResidentHouse } = require('../utils/residentHouses');
const { MAX_SEARCH_LENGTH, getSearchRegex } = require('../utils/search');
const { getPagination, buildMeta } = require('../utils/paginate');

exports.getNotices = async (req, res, next) => {
  try {
    const filter = { isActive: true };
    
    // Search functionality - search in title and content
    if (req.query.search !== undefined) {
      if (typeof req.query.search !== 'string' || req.query.search.length > MAX_SEARCH_LENGTH) {
        return res.status(400).json({ success: false, message: `Search query must be a string of at most ${MAX_SEARCH_LENGTH} characters.` });
      }
      const searchRegex = getSearchRegex(req.query.search);
      if (searchRegex) {
        filter.$or = [
          { title: searchRegex },
          { content: searchRegex }
        ];
      }
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
      const houseIds = await getResidentHouseIds(req.user._id);
      const linkedHouses = await House.find({ _id: { $in: houseIds } }).select('section').lean();
      const sections = new Set(linkedHouses.map(house => house.section).filter(Boolean));
      notices = notices.filter(n => n.targetSections.length === 0 || n.targetSections.some(section => sections.has(section)));
    }

    const { page, limit } = getPagination(req);
    const total = notices.length;
    const data = page ? notices.slice((page - 1) * limit, page * limit) : notices;
    res.json({ success: true, ...buildMeta(total, page, limit, data.length), data });
  } catch (err) { next(err); }
};

exports.createNotice = async (req, res, next) => {
  try {
    const { title, content, type, targetSections } = req.body;
    const sections = Array.isArray(targetSections) ? targetSections.map(section => section.trim()) : [];
    if (sections.some(section => !section)) {
      return res.status(400).json({ success: false, message: 'Target sections cannot be empty.' });
    }
    const knownSections = new Set(await House.distinct('section'));
    const unknownSections = sections.filter(section => !knownSections.has(section));
    if (unknownSections.length) {
      return res.status(400).json({ success: false, message: `Unknown target section(s): ${unknownSections.join(', ')}` });
    }
    const notice = await Notice.create({ title, content, type, targetSections: sections, createdBy: req.user._id });

    // 🔔 Notify residents — only those in the target section(s), or everyone if no section specified
    let residentFilter = { role: 'resident' };
    let recipientIds;
    if (sections.length > 0) {
      const housesInSections = await House.find({ section: { $in: sections } });
      const houseIds = housesInSections.map(house => house._id);
      const links = await ResidentHouse.find({ house_id: { $in: houseIds } }).select('resident_id').lean();
      const userIds = new Set(links.map(link => link.resident_id.toString()));
      housesInSections.forEach(h => {
        if (h.owner)  userIds.add(h.owner.toString());
        if (h.tenant) userIds.add(h.tenant.toString());
      });
      const activeResidents = await User.find({
        _id: { $in: Array.from(userIds) },
        role: 'resident',
        isActive: true
      }).select('_id');
      recipientIds = activeResidents.map(user => user._id);
      if (recipientIds.length !== userIds.size) {
        console.warn('Stale or invalid resident references found while notifying notice recipients.');
      }
    } else {
      const residents = await User.find({ ...residentFilter, isActive: true }).select('_id');
      recipientIds = residents.map(u => u._id);
    }

    const icons = { emergency: '🚨', event: '🎉', maintenance: '🔧', general: '📢' };
    const sectionLabel = sections.length > 0 ? ` (${sections.join(', ')})` : '';
    const notificationResult = await createNotificationForMany(recipientIds, {
      title: `${icons[notice.type] || '📢'} New Notice${sectionLabel}: ${notice.title}`,
      message: notice.content,
      type: 'notice',
      link: '/notices'
    });

    res.status(201).json({
      success: true,
      data: notice,
      notifiedCount: recipientIds.length,
      notificationDelivered: notificationResult.success,
      warning: notificationResult.success ? undefined : 'Notice was saved, but notifications could not be delivered.'
    });
  } catch (err) { next(err); }
};

exports.deleteNotice = async (req, res, next) => {
  try {
    const notice = await Notice.findByIdAndUpdate(req.params.id, { isActive: false }, { new: true, runValidators: true });
    if (!notice) return res.status(404).json({ success: false, message: 'Notice not found' });
    res.json({ success: true, message: 'Notice removed' });
  } catch (err) { next(err); }
};
