// docs/paths/residentHouses.js — GET/POST /resident-houses, DELETE /resident-houses/{id}
const { op, body, json, errors, param, schema } = require('../lib/helpers');

module.exports = {
  '/resident-houses': {
    get: op({
      operationId: 'listResidentHouses',
      tags: ['Resident Houses'],
      summary: 'List resident-to-house links',
      description:
        'Returns the links between residents and houses, each with the full house and a populated resident ' +
        '(`name`, `username`, `role`).\n\n' +
        '**Residents** always receive their own links and may omit the query parameter.\n\n' +
        '**Admins and staff must pass `?resident=<userId>`** — omitting it returns 400 because there is no sensible ' +
        'default for "all links".\n\n' +
        'If a resident has no explicit `resident_houses` rows but is still referenced by a legacy `house.owner` or ' +
        '`house.tenant` field, those are synthesised into the response with `relationship_type: "legacy"` and no `_id`.',
      params: [param('ResidentQuery')],
      responses: {
        200: {
          description: 'Matching links.',
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: { success: { type: 'boolean', example: true }, data: { type: 'array', items: schema('ResidentHouseLink') } }
              }
            }
          }
        },
        ...errors({ badRequest: true })
      }
    }),

    post: op({
      operationId: 'createResidentHouse',
      tags: ['Resident Houses'],
      summary: 'Link a resident to a house',
      description:
        'Creates a resident-to-house link. This is how a resident becomes associated with a property independently of ' +
        'the legacy `house.owner`/`house.tenant` fields, and it is what grants them visibility of that house\'s dues, ' +
        'complaints, notices and polls.\n\n' +
        'The operation is **idempotent**: an identical `(resident_id, house_id, relationship_type)` triple is reused ' +
        'rather than duplicated, so calling it twice is safe.',
      requestBody: body('CreateResidentHouseRequest'),
      responses: {
        201: {
          description: 'The link exists (created now or already present).',
          content: {
            'application/json': {
              schema: { type: 'object', properties: { success: { type: 'boolean', example: true }, data: schema('ResidentHouseLink') } }
            }
          }
        },
        ...errors({ badRequest: true, forbidden: true, notFound: true })
      }
    })
  },

  '/resident-houses/{id}': {
    delete: op({
      operationId: 'deleteResidentHouse',
      tags: ['Resident Houses'],
      summary: 'Remove a resident-to-house link',
      description:
        'Permanently removes a link. Unlike houses and users, this resource is genuinely hard-deleted — it is a join row ' +
        'with no history worth preserving.\n\n' +
        'Removing a link revokes the resident\'s visibility of that house\'s dues and complaints, so use it carefully.',
      params: [param('IdPathParam')],
      responses: {
        200: { description: 'The link was removed.', ...json('MessageResponse') },
        ...errors({ notFound: true, forbidden: true })
      }
    })
  }
};
