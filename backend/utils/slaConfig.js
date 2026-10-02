const DEFAULT_SLA_HOURS = Object.freeze({
  urgent: 4,
  high: 12,
  medium: 48,
  low: 72
});

const DEFAULT_SLA_CHECK_CRON = '*/30 * * * *';

function getSlaHours(env = process.env) {
  return Object.fromEntries(Object.entries(DEFAULT_SLA_HOURS).map(([priority, fallback]) => {
    const key = `SLA_${priority.toUpperCase()}_HOURS`;
    const value = Number(env[key]);
    return [priority, Number.isFinite(value) && value > 0 ? value : fallback];
  }));
}

function getSlaCheckCron(env = process.env, validate) {
  const configured = typeof env.SLA_CHECK_CRON === 'string' && env.SLA_CHECK_CRON.trim()
    ? env.SLA_CHECK_CRON.trim()
    : DEFAULT_SLA_CHECK_CRON;
  return validate(configured) ? configured : DEFAULT_SLA_CHECK_CRON;
}

module.exports = {
  DEFAULT_SLA_HOURS,
  DEFAULT_SLA_CHECK_CRON,
  getSlaHours,
  getSlaCheckCron
};
