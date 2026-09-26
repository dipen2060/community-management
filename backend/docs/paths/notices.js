// docs/paths/notices.js — GET/POST /notices, DELETE /notices/{id}
const { op, body, json, errors, param, schema } = require('../lib/helpers');

const noticeList = {
  type: 'object',
  properties: {
    success: { type: 'boolean', example: true },
    count: { type: 'integer', example: 10 },
    total: { type: 'integer', example: 34 },
    page: { type: 'integer', example: 1 },
    pages: { type: 'integer', example: 4 },
    data: { type: 'array', items: schema('Notice') }
  }
};

module.exports = {
  '/notices': {
    get: op({
      operationId: 'listNotices',
      tags: ['Notices'],
      summary: 'List notices',
      description:
        'Returns active notices, newest first. `search` matches the title or content case-insensitively (regex-escaped, ' +
        'max 100 characters).\n\n' +
        '**Residents only see notices addressed to their own section**, plus any notice with an empty `targetSections` ' +
        'array (a broadcast). Admins and staff see every notice.\n\n' +
        '**Pagination is opt-in** — omit `page` to receive the full list, which the frontend section pickers depend on.',
      params: [param('SearchQuery'), param('NoticeTypeQuery'), param('PageParam'), param('LimitParam')],
      responses: {
        200: { description: 'Matching notices with pagination metadata.', content: { 'application/json': { schema: noticeList } } },
        ...errors({ badRequest: true })
      }
    }),

    post: op({
      operationId: 'createNotice',
      tags: ['Notices'],
      summary: 'Create a notice and notify residents',
      description:
        'Publishes a notice and immediately pushes an in-app notification to the affected residents.\n\n' +
        '**Targeting:** omit `targetSections` (or send `[]`) to notify every active resident. When sections are supplied, ' +
        'every entry must match an existing house section — an unknown name returns 400 — and only residents linked to a ' +
        'house in those sections are notified.\n\n' +
        'The notification step is best-effort: the notice is saved even if delivery fails, in which case ' +
        '`notificationDelivered` is `false` and a `warning` explains why.',
      requestBody: body('CreateNoticeRequest'),
      responses: {
        201: {
          description: 'The notice was created and notifications were dispatched.',
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  success: { type: 'boolean', example: true },
                  data: schema('Notice'),
                  notifiedCount: { type: 'integer', example: 37, description: 'Number of residents notified.' },
                  notificationDelivered: { type: 'boolean', example: true },
                  warning: { type: 'string', nullable: true, example: 'Notice was saved, but notifications could not be delivered.' }
                }
              }
            }
          }
        },
        ...errors({ validation: true, badRequest: true, forbidden: true })
      }
    })
  },

  '/notices/{id}': {
    delete: op({
      operationId: 'removeNotice',
      tags: ['Notices'],
      summary: 'Remove a notice',
      description:
        '**This is a soft delete.** The notice\'s `isActive` flag is set to `false` and the row is retained, so the record ' +
        'and its history stay available. Removed notices disappear from `GET /notices` immediately.',
      params: [param('IdPathParam')],
      responses: {
        200: { description: 'The notice was removed.', ...json('MessageResponse') },
        ...errors({ notFound: true, forbidden: true })
      }
    })
  }
};
