// docs/paths/health.js — GET / (service root, defined inline in server.js)
const { op, json, publicApi } = require('../lib/helpers');

module.exports = {
  '/': {
    // Override the global `servers: ['/api']` for this path item only. The health
    // check is the single route mounted outside the /api prefix, so without this
    // override Swagger UI would request `/api/` and get a 404.
    servers: [{ url: '/', description: 'Server root — the only endpoint outside the /api prefix.' }],
    get: op({
      operationId: 'healthCheck',
      tags: ['Health'],
      summary: 'Service health check',
      description:
        'Liveness probe. Returns as soon as the HTTP server is accepting connections, so a 200 here does **not** confirm ' +
        'the MongoDB connection is healthy — the process exits at startup if the initial database connection fails, so a ' +
        'responding server is generally a good enough signal for a container orchestrator or uptime monitor.\n\n' +
        'This is the only route that lives outside the `/api` prefix, which is why it is the only path in this document ' +
        'without one.',
      security: publicApi,
      responses: {
        200: { description: 'The API is running.', ...json('HealthResponse') }
      }
    })
  }
};
