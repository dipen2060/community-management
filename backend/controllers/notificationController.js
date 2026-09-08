const Notification = require('../models/Notification');

// Helper — call this from other controllers/cron jobs to create a notification
exports.createNotification = async ({ user, title, message, type = 'general', link = '' }) => {
  try {
    await Notification.create({ user, title, message, type, link });
  } catch (err) {
    console.error('Notification creation failed:', err.message);
  }
};

// Helper — notify multiple users at once (e.g. all residents for a notice)
exports.createNotificationForMany = async (userIds, { title, message, type = 'general', link = '' }) => {
  try {
    const docs = userIds.map(user => ({ user, title, message, type, link }));
    await Notification.insertMany(docs);
  } catch (err) {
    console.error('Bulk notification creation failed:', err.message);
  }
};

// GET /api/notifications  — current user's notifications (latest 30)
exports.getNotifications = async (req, res) => {
  try {
    const notifications = await Notification.find({ user: req.user._id })
      .sort({ createdAt: -1 })
      .limit(30);
    const unreadCount = await Notification.countDocuments({ user: req.user._id, isRead: false });
    res.json({ success: true, data: notifications, unreadCount });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
};

// PUT /api/notifications/:id/read — mark single notification as read
exports.markAsRead = async (req, res) => {
  try {
    const notif = await Notification.findOneAndUpdate(
      { _id: req.params.id, user: req.user._id },
      { isRead: true },
      { new: true }
    );
    if (!notif) return res.status(404).json({ success: false, message: 'Not found' });
    res.json({ success: true, data: notif });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
};

// PUT /api/notifications/read-all — mark all as read for current user
exports.markAllAsRead = async (req, res) => {
  try {
    await Notification.updateMany({ user: req.user._id, isRead: false }, { isRead: true });
    res.json({ success: true, message: 'All notifications marked as read' });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
};
