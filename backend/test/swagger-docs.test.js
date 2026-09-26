// test/swagger-docs.test.js
//
// Guardrails for the OpenAPI document (Phase 5 of SWAGGER_IMPLEMENTATION_PLAN.md).
//
//  1. DRIFT  — every route Express actually registers must appear in the spec.
//     This is the test that makes the docs trustworthy over time: add a route,
//     forget to document it, and CI goes red.
//  2. ORPHANS — every operation in the spec must correspond to a real route, so
//     a typo in a path or method is caught too (the reverse of drift).
//  3. REFS   — every `$ref` in the document must resolve, so the UI never
//     renders a broken "unresolved reference" section.
//
// The mount prefixes are parsed out of server.js rather than hard-coded here, so
// changing a mount path in server.js without updating the docs also fails.

const fs = require('fs');
const path = require('path');

const { buildOpenApiSpec } = require('../docs/swagger');

// The drift test only inspects the Express router stack; it has no interest in
// real file-type sniffing. `file-type` v22 is ESM-only, which Jest's CommonJS
// runtime cannot `require()` — see the note in README about the pre-existing
// `npm test` failure in integration.test.js. Mocking it here keeps this suite
// independent of that migration.
jest.mock('file-type', () => ({ fromBuffer: jest.fn() }));

const HTTP_METHODS = ['get', 'post', 'put', 'patch', 'delete'];

/** Read the `/api/xxx -> routes/xxx.js` mount table straight out of server.js. */
const readMountsFromServer = () => {
  const source = fs.readFileSync(path.join(__dirname, '..', 'server.js'), 'utf8');
  const mounts = [];
  const blockPattern = /app\.use\(([\s\S]{0,300}?)\);/g;

  for (const [, block] of source.matchAll(blockPattern)) {
    const prefix = block.match(/'(\/[^']*)'/);
    const routeFile = block.match(/require\('\.\/routes\/(\w+)'\)/);
    if (prefix && routeFile) mounts.push({ prefix: prefix[1], file: routeFile[1] });
  }

  return mounts;
};

/** Walk an Express router stack and collect `METHOD /path` for every route. */
const collectRoutes = (stack, prefix = '') => {
  const found = [];
  for (const layer of stack) {
    if (layer.route) {
      for (const method of Object.keys(layer.route.methods)) {
        if (HTTP_METHODS.includes(method)) {
          found.push(`${method.toUpperCase()} ${prefix}${layer.route.path}`.replace(/\/+/g, '/'));
        }
      }
    } else if (layer.name === 'router' && layer.handle?.stack) {
      // Nested routers (router.use(subrouter)) are not used in this project, but
      // handle them so a future refactor cannot silently hide routes from the test.
      found.push(...collectRoutes(layer.handle.stack, prefix));
    }
  }
  return found;
};

/** Express `:id` -> OpenAPI `{id}`; also drops the trailing slash on the root. */
const toOpenApiPath = (expressPath) => {
  const templated = expressPath.replace(/:([A-Za-z0-9_]+)/g, '{$1}');
  return templated.length > 1 ? templated.replace(/\/$/, '') : templated;
};

const spec = buildOpenApiSpec();

/** Every operation in the spec as `METHOD /path`, with no `/api` prefix. */
const specOperations = () => {
  const ops = [];
  for (const [pathKey, item] of Object.entries(spec.paths)) {
    for (const method of HTTP_METHODS) {
      if (item[method]) ops.push(`${method.toUpperCase()} ${pathKey}`);
    }
  }
  return ops;
};

/**
 * The base path the spec's `servers` entry prepends to every path (Decision D2).
 * Express mounts include it; spec paths deliberately do not, so it is stripped
 * before comparison. Derived from the spec rather than hard-coded so that
 * changing the `servers` URL keeps this test honest.
 */
const specBasePath = () => {
  const url = spec.servers?.[0]?.url ?? '/';
  return new URL(url, 'http://placeholder.invalid').pathname.replace(/\/+$/, '');
};

/** Every route the real Express routers register, expressed as a spec path. */
const actualRoutes = () => {
  const base = specBasePath();
  const ops = [];
  for (const { prefix, file } of readMountsFromServer()) {
    // Each router is walked directly with its mount prefix, rather than mounting
    // them all onto a scratch app — mounting loses the prefix, because Express
    // does not keep the mount string on the layer in a readable form.
    const router = require(`../routes/${file}`);
    for (const route of collectRoutes(router.stack, prefix)) {
      const [method, ...rest] = route.split(' ');
      let specPath = toOpenApiPath(rest.join(' '));
      if (base && specPath.startsWith(base)) specPath = specPath.slice(base.length) || '/';
      ops.push(`${method} ${specPath}`);
    }
  }
  return ops;
};

describe('OpenAPI document', () => {
  it('is a valid OpenAPI 3.0.x document with a bearer security scheme', () => {
    expect(spec.openapi).toMatch(/^3\.0\.\d+$/);
    expect(spec.info.title).toBeTruthy();
    expect(spec.info.version).toBeTruthy();
    expect(spec.components.securitySchemes.bearerAuth).toMatchObject({
      type: 'http',
      scheme: 'bearer',
      bearerFormat: 'JWT'
    });
  });

  it('never offers a query-parameter API key, which the server rejects', () => {
    // middleware/auth.js answers 401 when a token arrives as ?token= / ?access_token=.
    // Offering an apiKey-in-query scheme would document a pattern that cannot work.
    for (const [name, scheme] of Object.entries(spec.components.securitySchemes)) {
      expect({ name, in: scheme.in }).toEqual({ name, in: undefined });
    }
  });

  it('resolves every $ref in the document', () => {
    const unresolved = [];
    const walk = (node, trail) => {
      if (Array.isArray(node)) return node.forEach((item, i) => walk(item, `${trail}[${i}]`));
      if (!node || typeof node !== 'object') return;
      for (const [key, value] of Object.entries(node)) {
        if (key === '$ref' && typeof value === 'string' && value.startsWith('#/')) {
          const resolved = value
            .slice(2)
            .split('/')
            .reduce((acc, part) => (acc == null ? undefined : acc[part]), spec);
          if (resolved === undefined) unresolved.push(`${trail}.${key} -> ${value}`);
        } else {
          walk(value, `${trail}.${key}`);
        }
      }
    };
    walk(spec, '#');
    expect(unresolved).toEqual([]);
  });

  it('gives every operation a tag, summary and operationId', () => {
    const problems = [];
    for (const [pathKey, item] of Object.entries(spec.paths)) {
      for (const method of HTTP_METHODS) {
        const operation = item[method];
        if (!operation) continue;
        const where = `${method.toUpperCase()} ${pathKey}`;
        if (!operation.operationId) problems.push(`${where}: missing operationId`);
        if (!operation.summary) problems.push(`${where}: missing summary`);
        if (!operation.tags?.length) problems.push(`${where}: missing tags`);
        if (!Object.keys(operation.responses || {}).length) problems.push(`${where}: missing responses`);
        if (operation.description === undefined) problems.push(`${where}: missing description`);
      }
    }
    expect(problems).toEqual([]);
  });

  it('flags the disabled legacy payment endpoint as deprecated', () => {
    // Regression test. The `op()` helper builds operation objects key by key, so
    // a key it does not know about is silently discarded. That is exactly how
    // `deprecated: true` was lost from this one operation while it still looked
    // correct in the source. OpenAPI booleans that must survive the helper are
    // asserted here.
    const legacy = spec.paths['/dues/{id}/pay']?.put;
    expect(legacy).toBeDefined();
    expect(legacy.deprecated).toBe(true);
    expect(Object.keys(legacy.responses)).toEqual(expect.arrayContaining(['400']));
  });

  it('declares multipart bodies only for the two upload endpoints', () => {
    const multipartOps = [];
    for (const [pathKey, item] of Object.entries(spec.paths)) {
      for (const method of HTTP_METHODS) {
        if (item[method]?.requestBody?.content?.['multipart/form-data']) {
          multipartOps.push(`${method.toUpperCase()} ${pathKey}`);
        }
      }
    }
    expect(multipartOps.sort()).toEqual([
      'POST /complaints',
      'PUT /dues/{id}/submit-payment'
    ]);
  });

  it('documents 403 on every role-gated operation', () => {
    // Every one of these routes passes through authorize(...roles) in
    // backend/routes/*.js, so all of them can legitimately answer 403. This list
    // was missing 403 across the board at one point, which made the docs
    // under-report failure modes. Endpoints that are open to any authenticated
    // user (e.g. GET /dues, GET /polls/{id}/results) are deliberately absent.
    const roleGated = [
      ['/users', 'post'],
      ['/users/{id}', 'get'],
      ['/users/{id}', 'put'],
      ['/users/{id}', 'delete'],
      ['/users/{id}/reset-password', 'put'],
      ['/houses', 'post'],
      ['/houses/{id}', 'put'],
      ['/houses/{id}', 'delete'],
      ['/dues/clusters', 'get'],
      ['/dues/generate', 'post'],
      ['/notices', 'post'],
      ['/notices/{id}', 'delete'],
      ['/polls', 'post'],
      ['/polls/{id}', 'put'],
      ['/polls/{id}', 'delete'],
      ['/polls/{id}/vote', 'post'],
      ['/resident-houses', 'post'],
      ['/resident-houses/{id}', 'delete'],
      ['/audit-logs', 'get'],
      // Not authorize()-gated, but 403 is reachable via record-level checks.
      ['/dues/{id}', 'get'],
      ['/dues/{id}/proof', 'get'],
      ['/dues/{id}/submit-payment', 'put'],
      ['/dues/{id}/approve-payment', 'put'],
      ['/dues/{id}/reject-payment', 'put'],
      ['/complaints/{id}', 'put'],
      ['/complaints/{id}/attachments/{filename}', 'get'],
      ['/polls/{id}', 'get'],
      ['/exports/dues/excel', 'get'],
      ['/exports/dues/pdf', 'get'],
      ['/exports/complaints/excel', 'get'],
      ['/exports/complaints/pdf', 'get']
    ];

    const missing = roleGated
      .filter(([pathKey, method]) => spec.paths[pathKey]?.[method])
      .filter(([pathKey, method]) => !spec.paths[pathKey][method].responses['403'])
      .map(([pathKey, method]) => `${method.toUpperCase()} ${pathKey}`);

    expect(missing).toEqual([]);
  });
});

describe('Spec / route parity', () => {
  const mounts = readMountsFromServer();

  it('finds every route mount in server.js', () => {
    // 11 route files are mounted under /api. If this drops, the parser above has
    // broken and the parity tests below would pass vacuously.
    expect(mounts.length).toBe(11);
    expect(mounts.map((m) => m.file).sort()).toEqual(
      [
        'auditLogs', 'auth', 'complaints', 'dues', 'exports', 'houses',
        'notices', 'notifications', 'polls', 'residentHouses', 'users'
      ].sort()
    );
  });

  it('documents every route the Express app actually registers (no drift)', () => {
    const documented = new Set(specOperations());
    // The health check is defined inline in server.js rather than in routes/,
    // so it is absent from the collected set and checked separately below.
    const missing = [...new Set(actualRoutes())].filter((op) => !documented.has(op));

    expect(missing).toEqual([]);
  });

  it('documents the root health check', () => {
    expect(spec.paths['/']?.get?.operationId).toBe('healthCheck');
  });

  it('has no operations that do not exist as real routes (no orphans)', () => {
    const actual = new Set(actualRoutes());
    actual.add('GET /'); // inline health check

    const orphans = specOperations().filter((op) => !actual.has(op));
    expect(orphans).toEqual([]);
  });

  it('covers all 48 API endpoints plus the health check', () => {
    expect(specOperations().length).toBe(49);
  });
});

describe('Committed openapi.json artefact', () => {
  it('is present and not stale', () => {
    // Decision D4: the generated spec is committed so the frontend team and the
    // thesis submission have a copy that needs no running server.
    const artefact = path.join(__dirname, '..', 'docs', 'openapi.json');
    expect(fs.existsSync(artefact)).toBe(true);
    const { execFileSync } = require('child_process');
    expect(() =>
      execFileSync(process.execPath, [path.join(__dirname, '..', 'docs', 'generate.js'), '--check'], {
        stdio: 'pipe'
      })
    ).not.toThrow();
  });
});
