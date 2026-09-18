// Opt-in pagination helper.
//
// IMPORTANT: pagination only activates when the caller sends a `page`
// query param. If `page` is absent, the query runs unpaginated (full
// result set) exactly like before this feature was added. This matters
// because several pages call these same list endpoints expecting the
// FULL list for dropdowns (e.g. Complaints.js house picker, Notices.js
// and Polls.js section pickers) — making pagination mandatory would
// silently break those without any error.

function getPagination(req, defaultLimit = 20) {
  const page = req.query.page ? Math.max(1, parseInt(req.query.page, 10) || 1) : null;
  const limit = Math.max(1, Math.min(100, parseInt(req.query.limit, 10) || defaultLimit));
  return { page, limit };
}

function applyPagination(query, page, limit) {
  if (!page) return query;
  return query.skip((page - 1) * limit).limit(limit);
}

function buildMeta(total, page, limit, dataLength) {
  return {
    count: dataLength,
    total,
    page: page || 1,
    pages: page ? Math.max(1, Math.ceil(total / limit)) : 1
  };
}

module.exports = { getPagination, applyPagination, buildMeta };