const DEFAULT_POLL_RUNOFF_HOURS = 24;
const DEFAULT_POLL_MAX_ROUNDS = 2;

function getPositiveNumber(value, fallback, integer = false) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0 || (integer && !Number.isInteger(parsed))) return fallback;
  return parsed;
}

function getPollConfig(env = process.env) {
  return {
    runoffHours: getPositiveNumber(env.POLL_RUNOFF_HOURS, DEFAULT_POLL_RUNOFF_HOURS),
    maxRounds: getPositiveNumber(env.POLL_MAX_ROUNDS, DEFAULT_POLL_MAX_ROUNDS, true)
  };
}

module.exports = {
  DEFAULT_POLL_RUNOFF_HOURS,
  DEFAULT_POLL_MAX_ROUNDS,
  getPollConfig
};
