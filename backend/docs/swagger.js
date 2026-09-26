// docs/swagger.js
//
// Assembles the OpenAPI 3.0.3 document for the Tole Community Management API and
// mounts the Swagger UI.
//
// Design notes
// ------------
//  * The spec is composed from plain JavaScript objects under docs/paths/ and
//    docs/components/. It is NOT generated from JSDoc annotations, so there is
//    no glob scanning, no comment parsing, and no silent-drop failure mode — a
//    mistake here is an ordinary stack trace.
//
//  * This file deliberately imports nothing from the application's runtime code
//    (no models, no controllers, no database). That keeps `GET /api-docs.json`
//    working even when MongoDB is unreachable, and it means the docs cannot
//    break the server.
//
//  * Per the approved plan, backend/routes/*.js is left completely untouched.
//
// Mount order in server.js matters — see the comments there:
//   * BEFORE helmet's CSP      -> Swagger UI needs inline/eval'd script + style
//   * BEFORE the rate limiter   -> the UI issues many sub-resource requests
//   * AFTER express.json       -> serves the JSON spec

const swaggerUi = require('swagger-ui-express');

const schemas = require('./components/schemas');
const parameters = require('./components/parameters');
const responses = require('./components/responses');

const pathFiles = [
  require('./paths/health'),
  require('./paths/auth'),
  require('./paths/users'),
  require('./paths/houses'),
  require('./paths/dues'),
  require('./paths/complaints'),
  require('./paths/notices'),
  require('./paths/notifications'),
  require('./paths/polls'),
  require('./paths/exports'),
  require('./paths/residentHouses'),
  require('./paths/auditLogs')
];

// Tag order here drives the order of the groups in the Swagger UI sidebar.
const tags = [
  { name: 'Health', description: 'Service liveness probe.' },
  { name: 'Auth', description: 'Login and session introspection. Everything else requires a bearer token obtained here.' },
  { name: 'Users', description: 'Accounts, roles, staff specialisation and export permissions. Admins only, apart from self-service profile edits.' },
  { name: 'Houses', description: 'The properties that dues, complaints, notices and polls are all scoped to.' },
  { name: 'Dues', description: 'Monthly charges, fines, and the submit-then-verify payment workflow.' },
  { name: 'Complaints', description: 'Resident maintenance reports, with auto-categorisation, auto-assignment and similar-complaint matching.' },
  { name: 'Notices', description: 'Broadcast or section-targeted announcements, pushed to residents as notifications.' },
  { name: 'Notifications', description: 'The current user\'s in-app alert feed.' },
  { name: 'Polls', description: 'Community voting, optionally anonymous and optionally restricted to a section.' },
  { name: 'Exports', description: 'Audited Excel/PDF downloads of dues and complaints data.' },
  { name: 'Resident Houses', description: 'Links that grant a resident visibility of a house and its dues, complaints, notices and polls.' },
  { name: 'Audit Logs', description: 'Immutable trail of every privileged action. Admin only.' }
];

const buildOpenApiSpec = () => ({
  openapi: '3.0.3',

  info: {
    title: 'Tole Community Management API',
    version: '1.0.0',
    description: [
      'REST API for the Tole Community Management System — a neighbourhood administration platform covering monthly dues and fines,',
      'resident complaints with automated routing, notices, community polls, and audited reporting.',
      '',
      '## Authentication',
      '',
      'All endpoints except `GET /` and `POST /auth/login` require a JWT.',
      '',
      '1. `POST /auth/login` with an email and password.',
      '2. Click **Authorize** in this page and paste the returned `token`.',
      '3. Every subsequent call is sent as `Authorization: Bearer <token>`.',
      '',
      'Tokens are **only** accepted in that header. Passing `?token=` or `?access_token=` is rejected with 401 on purpose,',
      'so credentials never end up in access logs, browser history or `Referer` headers. If you are integrating from a',
      'browser, note that this also means you cannot pass the token in a query string from a `<script>` tag.',
      '',
      '## Roles',
      '',
      '| Role | Can do |',
      '| --- | --- |',
      '| `admin` | Everything: manage users and houses, verify payments, assign complaints, export all data, read the audit log. |',
      '| `staff` | Work the complaints assigned to them, view/export the sections they are permitted to export. |',
      '| `resident` | See and pay their own house dues, file complaints, vote in polls, read notices, edit their own profile. |',
      '',
      'Role checks happen in two places: coarse endpoint-level checks (`authorize`) and fine record-level ownership checks',
      '(for example, a resident may only fetch a due belonging to a house they are linked to). Both surface as 403.',
      '',
      '## Response envelope',
      '',
      'Every JSON response follows the same shape:',
      '',
      '```json',
      '{ "success": true, "message": "optional human-readable text", "data": { } }',
      '```',
      '',
      'List endpoints add pagination counters — `count` (items in this response), `total` (matching records), `page` and',
      '`pages`. Errors always set `success: false` and give a `message`; validation failures add an `errors` array.',
      '',
      '## Pagination is opt-in',
      '',
      'List endpoints paginate **only when you send a `page` parameter**. Omit it and you receive the entire result set, with',
      '`page` and `pages` both reported as `1`. This is deliberate — several frontend screens (house pickers, section pickers)',
      'depend on receiving everything — but it means a client that expects pagination must send `page` explicitly.',
      '`limit` defaults to 20 and is clamped to 1-100.',
      '',
      '## Status codes',
      '',
      '| Code | Meaning |',
      '| --- | --- |',
      '| `200` | Success. |',
      '| `201` | Resource created. |',
      '| `400` | Business-rule violation, invalid enum, rejected upload, or failed field validation. |',
      '| `401` | Missing, malformed or expired token — or a token supplied in the query string. |',
      '| `403` | Authenticated but not allowed (wrong role, or someone else\'s record). |',
      '| `404` | No such record, or a malformed ObjectId. |',
      '| `409` | State conflict: duplicate unique value, or a payment/vote already processed. |',
      '| `429` | Rate limited. |',
      '| `500` | Unhandled server error. |',
      '',
      '## Rate limits',
      '',
      '| Scope | Development | Production |',
      '| --- | --- | --- |',
      '| All endpoints | 2000 / 15 min | 100 / 15 min |',
      '| `/api/auth/*` | 200 / 15 min | 50 / 15 min |',
      '| `POST /api/auth/login` | 10 / 15 min | 10 / 15 min |',
      '',
      'The global and `/api/auth` limiters respond with a **plain-text** body rather than JSON.',
      '',
      '## Deletion semantics',
      '',
      'Most resources are **never actually deleted**, so history stays auditable:',
      '',
      '- `DELETE /users/{id}` sets `isActive=false` and cascades to clean up references.',
      '- `DELETE /notices/{id}` sets `isActive=false`.',
      '- `DELETE /houses/{id}` archives the house, clearing its owner/tenant and removing resident links. Dues and complaints are preserved.',
      '- `DELETE /resident-houses/{id}` and `DELETE /polls/{id}` **are** hard deletes.',
      '',
      '## Binary and multipart endpoints',
      '',
      'Six endpoints do not return JSON: four under `/exports` stream `.xlsx`/`.pdf` downloads, and',
      '`GET /dues/{id}/proof` and `GET /complaints/{id}/attachments/{filename}` stream stored files. Swagger UI cannot',
      'preview these — use the "Download file" button.',
      '',
      'Two endpoints accept `multipart/form-data`: `POST /complaints` (up to 5 attachments) and',
      '`PUT /dues/{id}/submit-payment` (a single `proof` file).'
    ].join('\n'),
    contact: {
      name: 'Tole Community Management System',
      url: 'https://github.com/'
    },
    license: { name: 'UNLICENSED' }
  },

  // Decision D2: a single document with the /api prefix carried by `servers`,
  // so paths below stay short and a future gateway prefix change is one edit.
  servers: [
    {
      url: '/api',
      description: 'This server — all versioned endpoints live under the /api prefix.'
    }
  ],

  tags,

  components: {
    securitySchemes: {
      bearerAuth: {
        type: 'http',
        scheme: 'bearer',
        bearerFormat: 'JWT',
        description:
          'Paste the `token` returned by `POST /auth/login` into the Authorize dialog. It is sent as ' +
          '`Authorization: Bearer <token>`. Query-string tokens are rejected by the server.'
      }
    },
    schemas,
    parameters,
    responses
  },

  paths: pathFiles.reduce((acc, file) => Object.assign(acc, file), {})
});

const openApiSpec = buildOpenApiSpec();

/**
 * Express router serving the interactive docs.
 *
 * Mount this BEFORE `helmet()`'s default CSP and BEFORE the global rate limiter
 * in server.js. Both orderings are load-bearing:
 *
 *  - Helmet's default `Content-Security-Policy` sets `script-src 'self'` and
 *    `style-src 'self'`, which Swagger UI cannot satisfy — it needs inline and
 *    `unsafe-eval` script/style. Left enabled, the page renders blank with no
 *    error in the console, which is a very confusing first-run experience.
 *    Disabling CSP is scoped to *this router only*; the rest of the API keeps
 *    full helmet protection.
 *
 *  - The production global limiter allows 100 requests per 15 minutes, and the
 *    Swagger UI page load alone issues a dozen or more sub-resource requests.
 *    Mounting after the limiter would have the UI fail to load in production.
 *
 * The router is mounted behind `ENABLE_API_DOCS` (see `isDocsEnabled`).
 *
 * Exposed as a factory rather than a pre-built router so the router is not
 * constructed at all when the docs are disabled.
 */
const createDocsRouter = () => {
  const router = require('express').Router();

  // Scoped CSP relaxation — see the note above. `contentSecurityPolicy: false`
  // disables the header for these routes only.
  router.use(require('helmet')({ contentSecurityPolicy: false }));

  router.get('/api-docs.json', (req, res) => {
    res.json(openApiSpec);
  });

  router.use(
    '/api-docs',
    swaggerUi.serve,
    swaggerUi.setup(openApiSpec, {
      customSiteTitle: 'Tole Community Management API',
      swaggerOptions: {
        persistAuthorization: true,
        displayRequestDuration: true,
        docExpansion: 'none',
        filter: true,
        tryItOutEnabled: true,
        defaultModelsExpandDepth: 2,
        syntaxHighlight: { activate: true, theme: 'agate' }
      }
    })
  );

  return router;
};

/**
 * Whether the docs should be served.
 *
 * Defaults to ON in development and OFF in production, overridable with
 * ENABLE_API_DOCS=true|false. Kept off by default in production because the
 * spec enumerates every role-gated endpoint, which is useful reconnaissance.
 * The JSON spec at /api-docs.json is gated by the same flag — if you want the
 * spec public but the UI private, split the mount in server.js.
 */
const isDocsEnabled = () => {
  const flag = process.env.ENABLE_API_DOCS;
  if (flag === 'true') return true;
  if (flag === 'false') return false;
  return process.env.NODE_ENV !== 'production';
};

module.exports = { buildOpenApiSpec, openApiSpec, createDocsRouter, isDocsEnabled };
