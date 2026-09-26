// docs/components/responses.js
//
// Reusable OpenAPI responses.
//
// Two distinct error envelopes exist in this codebase and both are represented here:
//
//  1. The standard envelope produced by controllers and middleware/errorHandler.js:
//       { success: false, message: string }
//
//  2. The express-validator envelope produced by middleware/validator.js:
//       { success: false, message: 'Validation failed', errors: [{ field, message }] }
//
// A third, export-specific shape carries `errors` as an array of *strings*:
//
//       { success: false, message: 'Invalid export filter', errors: [string] }
//
// ErrorResponse, ValidationErrorResponse and ValidationError are schemas rather
// than responses, so they live in components/schemas.js — which is also where
// the `#/components/schemas/...` references below resolve against.
const { ErrorResponse, ValidationErrorResponse } = require('./schemas');

const UnauthorizedResponse = {
  description:
    'Authentication failed or was not supplied. Returned when the `Authorization` header is missing, the token is ' +
    'invalid or expired, the referenced user no longer exists, the account is deactivated, or a token was passed as a ' +
    '`token` / `access_token` **query parameter** (which this API rejects on purpose to avoid leaking credentials in logs).',
  content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } } },
  examples: {
    missingToken: { summary: 'No Authorization header', value: { success: false, message: 'Not authorized' } },
    queryToken: { summary: 'Token supplied in the query string', value: { success: false, message: 'Use the Authorization request header' } },
    inactive: { summary: 'Deactivated account', value: { success: false, message: 'User account is inactive or not found' } },
    invalid: { summary: 'Malformed or bad signature', value: { success: false, message: 'Token invalid' } }
  }
};

const ForbiddenResponse = {
  description:
    'The caller is authenticated but not permitted. Covers role mismatches (`authorize`), record-level ownership ' +
    'checks (a resident touching another resident\'s due or complaint), and denied export attempts.',
  content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } } },
  examples: {
    role: { summary: 'Wrong role for this endpoint', value: { success: false, message: 'Access denied' } },
    export: { summary: 'Export not permitted for this staff member', value: { success: false, message: 'You are not allowed to export dues data.' } }
  }
};

const NotFoundResponse = {
  description:
    'The resource does not exist. Also returned when a file is requested that is missing on disk, and for malformed ' +
    'ObjectIds (`errorHandler` maps Mongoose `CastError` to 404).',
  content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } } }
};

const ConflictResponse = {
  description:
    'The request conflicts with the current state of the resource. Typical causes: a duplicate unique value, a payment ' +
    'or complaint that has already been processed by someone else, or a vote that has already been cast.',
  content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } } },
  examples: {
    duplicate: { summary: 'Unique constraint violation', value: { success: false, message: 'House number already exists' } },
    processed: { summary: 'Already handled by a concurrent request', value: { success: false, message: 'This payment was already processed. Refresh and try again.' } },
    alreadyVoted: { summary: 'Duplicate vote', value: { success: false, message: 'You have already voted or this poll is no longer available.' } }
  }
};

const BadRequestResponse = {
  description:
    'The request was rejected. Covers business-rule violations, invalid enum values, rejected uploads ' +
    '(`INVALID_FILE_TYPE`, `LIMIT_FILE_SIZE`), Mongoose validation errors and duplicate-key errors.',
  content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } } }
};

const ValidationFailedResponse = {
  description: 'One or more fields failed `express-validator` checks. Any files uploaded alongside the request are deleted before responding.',
  content: { 'application/json': { schema: { $ref: '#/components/schemas/ValidationErrorResponse' } } },
  example: {
    success: false,
    message: 'Validation failed',
    errors: [
      { field: 'email', message: 'Invalid email format' },
      { field: 'password', message: 'Password must be at least 6 characters' }
    ]
  }
};

const ExportFilterErrorResponse = {
  description:
    'One or more export filters were invalid. Unlike the standard validation envelope, `errors` here is an array of ' +
    'human-readable **strings**, not objects.',
  content: {
    'application/json': {
      schema: {
        type: 'object',
        properties: {
          success: { type: 'boolean', example: false },
          message: { type: 'string', example: 'Invalid export filter' },
          errors: { type: 'array', items: { type: 'string' }, example: ['month must be an integer between 1 and 12'] }
        }
      }
    }
  },
  example: {
    success: false,
    message: 'Invalid export filter',
    errors: ['month must be an integer between 1 and 12', 'section must match the format "Section <number>"']
  }
};

const RateLimitResponse = {
  description:
    'Too many requests. Limits: 2000 req / 15 min globally in development (100 in production), 200 / 50 on the ' +
    '`/api/auth` mount, and 10 / 15 min on `POST /api/auth/login`. ' +
    '**The global and `/api/auth` limiters reply with a plain-text body, not JSON** — only the login limiter returns JSON.',
  content: {
    'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } },
    'text/plain': { schema: { type: 'string' }, example: 'Too many requests. Please try again later.' }
  }
};

const ServerErrorResponse = {
  description: 'Unhandled server error. `message` is the raw error text, so treat it as diagnostic only.',
  content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } } }
};

const UploadErrorResponse = {
  description:
    'The uploaded file was rejected. Only JPEG/JPG/PNG/GIF images and PDFs are accepted (JPG/PNG/PDF only for payment ' +
    'proofs), 5 MB maximum each. The file type is detected from the file\'s actual bytes, not its extension or the ' +
    'client-supplied MIME type.',
  content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } } },
  examples: {
    type: { summary: 'Unsupported file type', value: { success: false, message: 'Invalid file type. Upload a supported image or PDF file.' } },
    size: { summary: 'File larger than 5 MB', value: { success: false, message: 'Uploaded file is too large. Maximum size is 5 MB.' } }
  }
};

const XlsxFileResponse = {
  description:
    'A generated `.xlsx` workbook, streamed as a binary download. Swagger UI cannot render spreadsheets inline — ' +
    'use "Download file" and open it in a spreadsheet application. Column set depends on role: admins receive the full ' +
    'financial/contact columns, staff receive a reduced set. Every export is written to the audit log before the ' +
    'response is sent.',
  headers: {
    'Content-Disposition': {
      description: 'Attachment filename, e.g. `dues-report-2026-09-26.xlsx`.',
      schema: { type: 'string' }
    }
  },
  content: {
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': {
      schema: { type: 'string', format: 'binary' }
    }
  }
};

const PdfFileResponse = {
  description:
    'A generated PDF report, streamed as a binary download. Swagger UI cannot render PDFs inline — use "Download file". ' +
    'Column set depends on role, and every export is written to the audit log before the response is sent.',
  headers: {
    'Content-Disposition': {
      description: 'Attachment filename, e.g. `complaints-report-2026-09-26.pdf`.',
      schema: { type: 'string' }
    }
  },
  content: { 'application/pdf': { schema: { type: 'string', format: 'binary' } } }
};

const ImageOrPdfResponse = {
  description:
    'The stored file, streamed as a binary download. Swagger UI cannot render this inline — use "Download file". ' +
    'Content type matches whatever was originally uploaded. Access is re-checked on every request; the filename must ' +
    'match the value recorded on the parent record.',
  content: {
    'image/jpeg': { schema: { type: 'string', format: 'binary' } },
    'image/png': { schema: { type: 'string', format: 'binary' } },
    'image/gif': { schema: { type: 'string', format: 'binary' } },
    'application/pdf': { schema: { type: 'string', format: 'binary' } }
  }
};

module.exports = {
  UnauthorizedResponse,
  ForbiddenResponse,
  NotFoundResponse,
  ConflictResponse,
  BadRequestResponse,
  ValidationFailedResponse,
  ExportFilterErrorResponse,
  RateLimitResponse,
  ServerErrorResponse,
  UploadErrorResponse,
  XlsxFileResponse,
  PdfFileResponse,
  ImageOrPdfResponse
};
