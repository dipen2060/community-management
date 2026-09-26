// docs/lib/helpers.js
//
// Tiny builders used by docs/paths/*.js to keep 48 operations readable and
// consistent. Nothing here is generated at runtime — these are plain functions
// that return plain OpenAPI objects.

/** Reference a component schema. */
const schema = (name) => ({ $ref: `#/components/schemas/${name}` });

/** Reference a reusable parameter. */
const param = (name) => ({ $ref: `#/components/parameters/${name}` });

/** Reference a reusable response. */
const response = (name) => ({ $ref: `#/components/responses/${name}` });

/**
 * Build the standard error-response block.
 *
 * @param {object} opts
 * @param {boolean|object} [opts.badRequest]      400 — pass `true` for the plain envelope, or a response ref to override
 * @param {boolean|object} [opts.validation]      400 with the express-validator `errors[]` array
 * @param {boolean|object} [opts.unauthorized]    401 (default: true whenever auth is required)
 * @param {boolean|object} [opts.forbidden]       403
 * @param {boolean|object} [opts.notFound]        404
 * @param {boolean|object} [opts.conflict]        409
 * @param {boolean|object} [opts.rateLimit]       429
 * @param {boolean|object} [opts.serverError]     500 (default: true)
 * @param {boolean|object} [opts.upload]          400 with upload-specific messaging
 */
const errors = ({
  badRequest,
  validation,
  unauthorized = true,
  forbidden,
  notFound,
  conflict,
  rateLimit,
  serverError = true,
  upload
} = {}) => {
  const out = {};
  if (validation) out['400'] = validation === true ? response('ValidationFailedResponse') : validation;
  else if (badRequest) out['400'] = badRequest === true ? response('BadRequestResponse') : badRequest;
  if (upload) out['400'] = upload === true ? response('UploadErrorResponse') : upload;
  if (unauthorized) out['401'] = unauthorized === true ? response('UnauthorizedResponse') : unauthorized;
  if (forbidden) out['403'] = forbidden === true ? response('ForbiddenResponse') : forbidden;
  if (notFound) out['404'] = notFound === true ? response('NotFoundResponse') : notFound;
  if (conflict) out['409'] = conflict === true ? response('ConflictResponse') : conflict;
  if (rateLimit) out['429'] = rateLimit === true ? response('RateLimitResponse') : rateLimit;
  if (serverError) out['500'] = serverError === true ? response('ServerErrorResponse') : serverError;
  return out;
};

/**
 * Build a `application/json` response wrapping a schema.
 * @param {string|object} inner schema name or raw schema object
 */
const json = (inner) => ({
  content: { 'application/json': { schema: typeof inner === 'string' ? schema(inner) : inner } }
});

/** Merge a JSON schema with a `description`, for inline response bodies. */
const described = (inner, description) => ({
  description,
  content: { 'application/json': { schema: typeof inner === 'string' ? schema(inner) : inner } }
});

/**
 * A JSON request body.
 * @param {string|object} inner  schema name or raw schema object
 * @param {boolean} required
 * @param {object} [extra] e.g. `{ description: '...' }`
 */
const body = (inner, required = true, extra = {}) => ({
  required,
  content: { 'application/json': { schema: typeof inner === 'string' ? schema(inner) : inner } },
  ...extra
});

/**
 * A `multipart/form-data` request body. Used by the two upload endpoints.
 * @param {string|object} inner  schema name or raw schema object
 */
const multipart = (inner, required = true, extra = {}) => ({
  required,
  content: { 'multipart/form-data': { schema: typeof inner === 'string' ? schema(inner) : inner } },
  ...extra
});

/** The single security requirement for JWT bearer tokens. */
const bearer = [{ bearerAuth: [] }];

/** An empty security array, for genuinely public operations. */
const publicApi = [];

/**
 * Attach `security`, `tags` and a default 401 to an operation, then merge in
 * whatever error responses the caller supplied.
 *
 * Every key is destructured explicitly on purpose — an earlier version spread
 * the options object and silently dropped `deprecated`, which unmarked the one
 * deprecated endpoint in the API. Unknown keys are now simply absent, so check
 * this list when adding a new OpenAPI field.
 */
const op = ({
  operationId,
  summary,
  description,
  tags,
  deprecated = false,
  security = bearer,
  params = [],
  requestBody,
  responses = {}
}) => ({
  operationId,
  summary,
  description,
  tags,
  ...(deprecated ? { deprecated: true } : {}),
  ...(params.length ? { parameters: params } : {}),
  ...(requestBody ? { requestBody } : {}),
  security,
  responses
});

module.exports = { schema, param, response, errors, json, described, body, multipart, bearer, publicApi, op };
