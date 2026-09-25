require('../config/env');

const configuredFinePerDay = Number(process.env.FINE_PER_DAY);
const configuredMaxFine = Number(process.env.MAX_FINE);
const finePerDay = Number.isFinite(configuredFinePerDay) && configuredFinePerDay >= 0
  ? configuredFinePerDay : 10;
const maxFine = Number.isFinite(configuredMaxFine) && configuredMaxFine >= 0
  ? configuredMaxFine : 500;

function calculateFine(dueDate, now = new Date()) {
  if (!dueDate || dueDate >= now) return 0;
  const daysLate = Math.max(0, Math.floor((now - dueDate) / (1000 * 60 * 60 * 24)));
  return Math.min(daysLate * finePerDay, maxFine);
}

function effectiveFine(storedFine, dueDate, now = new Date()) {
  return Math.min(Math.max(Number(storedFine || 0), calculateFine(dueDate, now)), maxFine);
}

module.exports = { calculateFine, effectiveFine };
