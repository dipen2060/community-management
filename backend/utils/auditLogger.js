const AuditLog = require('../models/AuditLog');

const SENSITIVE_KEYS = new Set([
  'password',
  'currentPassword',
  'newPassword',
  'token',
  'secret',
  'secretKey',
  'paymentReference',
  'paymentProof',
  'credentials'
]);

function sanitizeDetails(value, key = '') {
  if (SENSITIVE_KEYS.has(key)) return '[REDACTED]';
  if (value === null || typeof value !== 'object') return value;
  if (Array.isArray(value)) return value.map(item => sanitizeDetails(item));

  return Object.entries(value).reduce((result, [childKey, childValue]) => {
    result[childKey] = sanitizeDetails(childValue, childKey);
    return result;
  }, {});
}

async function logAudit(actorId, actorRole, action, targetType, targetId, details = {}) {
  if (!actorId || !actorRole || !action || !targetType || !targetId) {
    throw new Error('Audit log requires actor, action, target type, and target id');
  }

  return AuditLog.create({
    actor_id: actorId,
    actor_role: actorRole,
    action,
    target_type: targetType,
    target_id: targetId,
    details: sanitizeDetails(details)
  });
}

module.exports = { logAudit, sanitizeDetails };
