// docs/paths/auditLogs.js — GET /audit-logs
const { op, errors, param, schema } = require('../lib/helpers');

module.exports = {
  '/audit-logs': {
    get: op({
      operationId: 'listAuditLogs',
      tags: ['Audit Logs'],
      summary: 'List audit log entries',
      description:
        'Returns the audit trail, newest first, with the actor populated as `name`/`username`/`role`.\n\n' +
        '**What gets audited:** user creation, edits, password resets and deactivations; payment approvals and ' +
        'rejections; complaint status changes; and every export attempt (including refusals, recorded as ' +
        '`export_denied`).\n\n' +
        '**`details` is a mixed bag.** Its shape depends entirely on `action`, so read `action` first. Sensitive values ' +
        'are replaced with the literal string `[REDACTED]` before storage — this covers `password`, `currentPassword`, ' +
        '`newPassword`, `token`, `secret`, `secretKey`, `paymentReference`, `paymentProof` and `credentials`.\n\n' +
        '**Date filtering** uses `from`/`to` as `YYYY-MM-DD` and is evaluated in **UTC**, inclusive of the whole day ' +
        '(`from` at 00:00:00.000, `to` at 23:59:59.999). An unparseable date returns 400, as does a non-ObjectId `actor`.\n\n' +
        'Entries are immutable — there is no write or delete endpoint for this resource, by design.',
      params: [param('ActorQuery'), param('AuditActionQuery'), param('FromDateQuery'), param('ToDateQuery'), param('PageParam'), param('LimitParam')],
      responses: {
        200: {
          description: 'Matching audit entries with pagination metadata.',
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  success: { type: 'boolean', example: true },
                  count: { type: 'integer', example: 20 },
                  total: { type: 'integer', example: 412 },
                  page: { type: 'integer', example: 1 },
                  pages: { type: 'integer', example: 21 },
                  data: { type: 'array', items: schema('AuditLog') }
                }
              }
            }
          }
        },
        ...errors({ badRequest: true, forbidden: true })
      }
    })
  }
};
