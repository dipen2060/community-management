const DEFAULT_POLL_RUNOFF_HOURS = 48;

function getPositiveNumber(value, fallback, integer = false) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0 || (integer && !Number.isInteger(parsed))) return fallback;
  return parsed;
}

function getPollConfig(env = process.env) {
  return {
    runoffHours: getPositiveNumber(env.POLL_RUNOFF_HOURS, DEFAULT_POLL_RUNOFF_HOURS)
  };
}

module.exports = {
  DEFAULT_POLL_RUNOFF_HOURS,
  getPollConfig
};
