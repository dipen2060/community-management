// docs/paths/notifications.js — GET /notifications, PUT /notifications/{id}/read, PUT /notifications/read-all
const { op, json, errors, param, schema } = require('../lib/helpers');

module.exports = {
  '/notifications': {
    get: op({
      operationId: 'listNotifications',
      tags: ['Notifications'],
      summary: 'List my notifications',
      description:
        'Returns the 30 most recent notifications for the authenticated user, newest first, plus the total unread count. ' +
        '**This endpoint is not paginated** — the limit is fixed at 30, so `page`/`limit` are not accepted.\n\n' +
        'Polling this endpoint is the intended way to surface in-app alerts: dues generated, dues overdue, complaint ' +
        'status changes, new notices and new polls all push entries here.',
      responses: {
        200: {
          description: 'Up to 30 notifications plus the unread total.',
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  success: { type: 'boolean', example: true },
                  data: { type: 'array', items: schema('Notification') },
                  unreadCount: { type: 'integer', example: 4 }
                }
              }
            }
          }
        },
        ...errors()
      }
    })
  },

  '/notifications/{id}/read': {
    put: op({
      operationId: 'markNotificationRead',
      tags: ['Notifications'],
      summary: 'Mark one notification as read',
      description:
        'Marks a single notification as read. The update is scoped to the authenticated user, so passing another user\'s ' +
        'notification ID returns **404** rather than 403 — the endpoint does not confirm that the record exists.',
      params: [param('IdPathParam')],
      responses: {
        200: {
          description: 'The updated notification.',
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: { success: { type: 'boolean', example: true }, data: schema('Notification') }
              }
            }
          }
        },
        ...errors({ notFound: true })
      }
    })
  },

  '/notifications/read-all': {
    put: op({
      operationId: 'markAllNotificationsRead',
      tags: ['Notifications'],
      summary: 'Mark all my notifications as read',
      description: 'Marks every unread notification belonging to the authenticated user as read. Idempotent — returns 200 even when there was nothing to update.',
      responses: {
        200: { description: 'All notifications were marked as read.', ...json('MessageResponse') },
        ...errors()
      }
    })
  }
};
