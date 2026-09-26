// docs/paths/exports.js — 4 binary export operations
const { op, errors, param } = require('../lib/helpers');

/**
 * Every export route runs the same middleware chain before the controller:
 *
 *   protect -> authorize('admin','staff') -> validateExportPagination
 *   -> validateExportFilters -> auditExport -> exportPermission(<resource>)
 *
 * The practical consequences, identical for all four endpoints:
 *
 *  - **Every export is written to the audit log** (`ExportAudit`) *before* the
 *    file is streamed, including the filters used. A denied attempt is audited
 *    too, as `export_denied`. There is no way to export without a trail.
 *  - **Staff permissions are narrower than admins'.** `exportPermission()` allows
 *    an admin everything, but a staff member only if their `exportSection` is
 *    the matching resource or `all`. Otherwise 403.
 *  - **Column sets differ by role.** Admins receive the financial / contact
 *    columns; staff receive a reduced, non-sensitive set. This is enforced per
 *    column while streaming, not by a separate endpoint.
 *  - `limit` is capped by `EXPORT_MAX_RECORDS` (default 1000) and defaults to
 *    500. Unlike the list endpoints, pagination here is always applied.
 *  - The response is a **streaming binary download**. Swagger UI cannot preview
 *    it — use "Download file".
 */
const EXPORT_COMMON = [
  '**Auditing.** Every export is recorded in the audit log before the file is streamed, together with the filters used. ' +
    'Denied attempts are recorded as `export_denied`.',
  '',
  '**Permissions.** Admins may export anything. A staff member may export only the dataset matching their `exportSection` ' +
    '(or `all`); otherwise the request is refused with 403 and the refusal is audited.',
  '',
  '**Columns depend on your role.** Admins receive the full financial and contact columns; staff receive a reduced, ' +
    'non-sensitive set. There is no separate "staff export" endpoint.',
  '',
  '**Response is a binary download** — Swagger UI cannot preview it, so use the "Download file" button.'
].join('\n');

const exportErrors = (extra = {}) =>
  errors({
    badRequest: { $ref: '#/components/responses/ExportFilterErrorResponse' },
    forbidden: true,
    ...extra
  });

module.exports = {
  '/exports/dues/excel': {
    get: op({
      operationId: 'exportDuesExcel',
      tags: ['Exports'],
      summary: 'Export dues to Excel',
      description: `Streams an \`.xlsx\` workbook of dues.\n\n${EXPORT_COMMON}\n\n**Valid filters:** \`page\`, \`limit\`, \`month\`, \`year\`, \`status\`, \`section\`. Any invalid filter returns 400 with an \`errors\` array of strings.`,
      params: [
        param('ExportPageParam'),
        param('ExportLimitParam'),
        param('MonthQuery'),
        param('YearQuery'),
        param('ExportDuesStatusQuery'),
        param('ExportSectionQuery')
      ],
      responses: {
        200: { $ref: '#/components/responses/XlsxFileResponse' },
        ...exportErrors()
      }
    })
  },

  '/exports/dues/pdf': {
    get: op({
      operationId: 'exportDuesPdf',
      tags: ['Exports'],
      summary: 'Export dues to PDF',
      description: `Streams an A4 landscape PDF report of dues, with the applied filters printed in the header.\n\n${EXPORT_COMMON}\n\n**Valid filters:** \`page\`, \`limit\`, \`month\`, \`year\`, \`status\`, \`section\`.`,
      params: [
        param('ExportPageParam'),
        param('ExportLimitParam'),
        param('MonthQuery'),
        param('YearQuery'),
        param('ExportDuesStatusQuery'),
        param('ExportSectionQuery')
      ],
      responses: {
        200: { $ref: '#/components/responses/PdfFileResponse' },
        ...exportErrors()
      }
    })
  },

  '/exports/complaints/excel': {
    get: op({
      operationId: 'exportComplaintsExcel',
      tags: ['Exports'],
      summary: 'Export complaints to Excel',
      description: `Streams an \`.xlsx\` workbook of complaints.\n\n${EXPORT_COMMON}\n\n**Valid filters:** \`page\`, \`limit\`, \`status\`, \`category\`, \`section\`. Note there is no \`month\`/\`year\` filter for complaints.`,
      params: [
        param('ExportPageParam'),
        param('ExportLimitParam'),
        param('ExportComplaintsStatusQuery'),
        param('CategoryQuery'),
        param('ExportSectionQuery')
      ],
      responses: {
        200: { $ref: '#/components/responses/XlsxFileResponse' },
        ...exportErrors()
      }
    })
  },

  '/exports/complaints/pdf': {
    get: op({
      operationId: 'exportComplaintsPdf',
      tags: ['Exports'],
      summary: 'Export complaints to PDF',
      description: `Streams a PDF report of complaints, one complaint per page with full description, assignment and resolution details.\n\n${EXPORT_COMMON}\n\n**Valid filters:** \`page\`, \`limit\`, \`status\`, \`category\`, \`section\`.`,
      params: [
        param('ExportPageParam'),
        param('ExportLimitParam'),
        param('ExportComplaintsStatusQuery'),
        param('CategoryQuery'),
        param('ExportSectionQuery')
      ],
      responses: {
        200: { $ref: '#/components/responses/PdfFileResponse' },
        ...exportErrors()
      }
    })
  }
};
