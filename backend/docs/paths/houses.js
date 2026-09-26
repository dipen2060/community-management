// docs/paths/houses.js — GET/POST /houses, PUT/DELETE /houses/{id}
const { op, body, json, errors, param, schema } = require('../lib/helpers');

const houseList = {
  type: 'object',
  properties: {
    success: { type: 'boolean', example: true },
    count: { type: 'integer', example: 20 },
    total: { type: 'integer', example: 48 },
    page: { type: 'integer', example: 1 },
    pages: { type: 'integer', example: 3 },
    data: { type: 'array', items: schema('House') }
  }
};

module.exports = {
  '/houses': {
    get: op({
      operationId: 'listHouses',
      tags: ['Houses'],
      summary: 'List houses',
      description:
        'Returns houses ordered by section, then house number. `owner` and `tenant` are populated with ' +
        '`name`, `username`, `phone` and `email`.\n\n' +
        '**Residents only ever see their own linked houses** — the server resolves the resident\'s `resident_houses` ' +
        'links (falling back to the legacy `house.owner`/`house.tenant` fields) and ignores any attempt to widen the ' +
        'result set. Admins and staff see everything.\n\n' +
        '**Pagination is opt-in.** Send `page` to paginate; omit it to receive all 48 houses, which is what the frontend ' +
        'house pickers rely on.',
      params: [param('PageParam'), param('LimitParam')],
      responses: {
        200: { description: 'Matching houses with pagination metadata.', content: { 'application/json': { schema: houseList } } },
        ...errors()
      }
    }),

    post: op({
      operationId: 'createHouse',
      tags: ['Houses'],
      summary: 'Create a house',
      description:
        'Registers a new house. `owner` and `tenant` must each reference an **active resident**; they cannot be the same ' +
        'person, and a resident may hold at most one house in each role (enforced by unique partial indexes).\n\n' +
        'Creating the house also writes matching `resident_houses` link rows, which is what powers resident-scoped ' +
        'visibility across dues, complaints, notices and polls.',
      requestBody: body('CreateHouseRequest'),
      responses: {
        201: {
          description: 'The house was created.',
          content: {
            'application/json': {
              schema: { type: 'object', properties: { success: { type: 'boolean', example: true }, data: schema('House') } }
            }
          }
        },
        ...errors({ validation: true, badRequest: true, forbidden: true, conflict: true })
      }
    })
  },

  '/houses/{id}': {
    put: op({
      operationId: 'updateHouse',
      tags: ['Houses'],
      summary: 'Update a house',
      description:
        'Partial update — only the keys present in the body are applied.\n\n' +
        '**Unassigning:** send an empty string (`"owner": ""` or `"tenant": ""`) to clear that link. Omitting the key ' +
        'entirely leaves the existing link alone. Changing either one rewrites the corresponding `resident_houses` rows.',
      params: [param('IdPathParam')],
      requestBody: body('UpdateHouseRequest'),
      responses: {
        200: {
          description: 'The updated house.',
          content: {
            'application/json': {
              schema: { type: 'object', properties: { success: { type: 'boolean', example: true }, data: schema('House') } }
            }
          }
        },
        ...errors({ validation: true, badRequest: true, forbidden: true, notFound: true, conflict: true })
      }
    }),

    delete: op({
      operationId: 'archiveHouse',
      tags: ['Houses'],
      summary: 'Archive a house',
      description:
        '**This does not delete anything.** The house is archived so that its dues, complaints and payment history stay ' +
        'intact for auditing:\n\n' +
        '1. `isOccupied` is set to `false` and `owner`/`tenant` are cleared.\n' +
        '2. Its `resident_houses` link rows are removed.\n\n' +
        'The `status` field becomes `archived`, which excludes the house from dues generation and from the default dues ' +
        'and complaints listings. Pass `history=true` to those list endpoints to include it again.',
      params: [param('IdPathParam')],
      responses: {
        200: { description: 'The house was archived.', ...json('MessageResponse') },
        ...errors({ notFound: true, forbidden: true })
      }
    })
  }
};
