const { getSlaHours } = require('./slaConfig');

function getSLATargetAt(complaint, env = process.env) {
  const referenceDate = complaint.startedAt || complaint.createdAt;
  if (!referenceDate) return null;

  const referenceTime = new Date(referenceDate).getTime();
  if (!Number.isFinite(referenceTime)) return null;

  const slaHours = getSlaHours(env);
  const hours = slaHours[complaint.priority] ?? slaHours.medium;
  return new Date(referenceTime + hours * 60 * 60 * 1000);
}

function isSLABreached(complaint, now = new Date(), env = process.env) {
  if (!complaint || ['resolved', 'closed'].includes(complaint.status)) return false;
  const targetAt = getSLATargetAt(complaint, env);
  return Boolean(targetAt && new Date(now).getTime() > targetAt.getTime());
}

module.exports = { getSLATargetAt, isSLABreached };
