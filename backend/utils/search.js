const MAX_SEARCH_LENGTH = 100;

function escapeRegex(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function getSearchRegex(value) {
  if (typeof value !== 'string' || value.length > MAX_SEARCH_LENGTH) return null;
  return value ? new RegExp(escapeRegex(value), 'i') : null;
}

module.exports = { MAX_SEARCH_LENGTH, getSearchRegex };
