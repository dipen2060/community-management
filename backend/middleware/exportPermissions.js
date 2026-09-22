const { logAudit } = require('../utils/auditLogger');

const allowedExportSections = new Set(['dues', 'complaints', 'residents', 'all']);

function canExport(user, resource) {
  if (!user) return false;
  if (user.role === 'admin') return true;
  return user.role === 'staff' && (user.exportSection === resource || user.exportSection === 'all');
}

function exportPermission(resource) {
  if (!allowedExportSections.has(resource)) {
    throw new Error(`Unsupported export resource: ${resource}`);
  }

  return async (req, res, next) => {
    if (canExport(req.user, resource)) return next();

    try {
      await logAudit(
        req.user._id,
        req.user.role,
        'export_denied',
        'export',
        req.user._id,
        { exportType: resource }
      );
    } catch (error) {
      console.error('Denied export audit logging failed:', error.message);
    }

    return res.status(403).json({
      success: false,
      message: `You are not allowed to export ${resource} data.`
    });
  };
}

module.exports = { allowedExportSections, canExport, exportPermission };
