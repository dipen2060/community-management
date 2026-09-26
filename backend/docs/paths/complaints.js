// docs/paths/complaints.js — 4 operations on /complaints
const { op, body, json, errors, param, multipart, schema } = require('../lib/helpers');

const complaintList = {
  type: 'object',
  properties: {
    success: { type: 'boolean', example: true },
    count: { type: 'integer', example: 20 },
    total: { type: 'integer', example: 96 },
    page: { type: 'integer', example: 1 },
    pages: { type: 'integer', example: 5 },
    data: { type: 'array', items: schema('Complaint') }
  }
};

const complaintEnvelope = {
  type: 'object',
  properties: { success: { type: 'boolean', example: true }, data: schema('Complaint') }
};

// The authoritative state machine, mirrored from the `allowedTransitions` map in
// controllers/complaintController.js. Kept as a table because it is the single
// most surprising rule set in this API.
const TRANSITIONS = [
  '| From | To | Who |',
  '| --- | --- | --- |',
  '| `pending` | `inprogress` | assigned staff, or admin |',
  '| `inprogress` | `resolved` | assigned staff, or admin — `resolution` is **required** |',
  '| `resolved` | `pending` | the original submitter (a reopen), or admin/staff |',
  '| `resolved` | `closed` | admin/staff |',
  '| `closed` | *(nothing)* | **locked forever** |',
  '',
  'Any other move returns **400**.',
  '',
  'Additional rules:',
  '- Staff may only update complaints **assigned to them**; everyone else gets 403. Admins bypass this.',
  '- Residents may only act on their **own** complaints, and only to reopen them.',
  '- `resolution` must be 10-500 characters when resolving.',
  '- `assignedTo` is silently ignored for callers who are not admin or staff.',
  '- Once `reopenCount` reaches 2 the complaint is **forced** to `closed`, whatever was requested.'
].join('\n');

module.exports = {
  '/complaints': {
    get: op({
      operationId: 'listComplaints',
      tags: ['Complaints'],
      summary: 'List complaints',
      description:
        'Returns complaints, newest first, with `submittedBy`, `assignedTo` and `resolvedBy` populated as ' +
        '`name`/`phone` (plus `specialization` for `assignedTo`).\n\n' +
        '**Who sees what:**\n\n' +
        '- **Residents** see only their own complaints.\n' +
        '- **Staff** see all complaints; adding `mine=true` narrows the list to those assigned to them.\n' +
        '- **Admins** see everything.\n\n' +
        '`search` matches the title or description case-insensitively (regex-escaped, max 100 characters). By default, ' +
        'complaints belonging to archived houses are excluded — pass `history=true` to include them.\n\n' +
        '**Pagination is opt-in** — omit `page` for the full list.',
      params: [
        param('ComplaintStatusQuery'),
        param('CategoryQuery'),
        param('SectionQuery'),
        param('HouseIdQuery'),
        param('SearchQuery'),
        param('MineQuery'),
        param('HistoryQuery'),
        param('PageParam'),
        param('LimitParam')
      ],
      responses: {
        200: { description: 'Matching complaints with pagination metadata.', content: { 'application/json': { schema: complaintList } } },
        ...errors({ badRequest: true })
      }
    }),

    post: op({
      operationId: 'createComplaint',
      tags: ['Complaints'],
      summary: 'File a complaint',
      description:
        'Files a complaint, optionally with photo/PDF evidence.\n\n' +
        '**Evidence:** send `multipart/form-data` and repeat the `attachments` field for each file — up to **5** files, ' +
        'each a JPEG/PNG/GIF image or PDF, 5 MB per file. Types are detected from the file\'s actual bytes, so renaming ' +
        'a `.exe` to `.jpg` will not help.\n\n' +
        '**Priority:** residents may only file `low` or `medium`; `high`/`urgent` returns 403. Staff and admins may file any ' +
        'priority.\n\n' +
        '**Section and house:** residents must have a house linked to their account (otherwise 400) and may only file ' +
        'against their own linked houses. `section` is normally auto-filled from that house.\n\n' +
        '**What the response tells you.** Creating a complaint triggers three server-side analyses, and all three are ' +
        'returned so the UI can surface them:\n\n' +
        '1. `autoDetected` — the `category` inferred from the text by keyword scoring, with a `confidence` value.\n' +
        '2. `autoAssigned` — the staff member picked by specialisation match and current workload, or `null` if nobody ' +
        'matched. A `null` here means the complaint is still `pending` and waiting for manual assignment.\n' +
        '3. `similarComplaints` — up to 3 previously resolved/closed complaints in the same category, ranked by TF-IDF ' +
        'cosine similarity, so the submitter can see how similar issues were handled.',
      requestBody: multipart('CreateComplaintRequest', true, {
        description: 'Text fields plus up to 5 optional attachments. Use this endpoint\'s "Try it out" form, not raw JSON.'
      }),
      responses: {
        201: {
          description: 'The complaint was created, auto-categorised, auto-assigned, and matched against similar past complaints.',
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  success: { type: 'boolean', example: true },
                  data: schema('Complaint'),
                  autoDetected: {
                    type: 'object',
                    properties: {
                      category: schema('ComplaintCategory'),
                      confidence: { type: 'number', example: 0.82, description: 'Keyword-scoring confidence between 0 and 1.' },
                      section: { type: 'string', example: 'Section 1' }
                    }
                  },
                  autoAssigned: {
                    nullable: true,
                    allOf: [{ $ref: '#/components/schemas/UserSummary' }],
                    description: 'The staff member auto-assigned, or `null` when no specialisation matched. Expect `name`, `specialization` and `phone`.'
                  },
                  similarComplaints: { type: 'array', items: schema('SimilarComplaint') }
                }
              }
            }
          }
        },
        ...errors({ validation: true, badRequest: true, upload: true, forbidden: true, serverError: true })
      }
    })
  },

  '/complaints/{id}/attachments/{filename}': {
    get: op({
      operationId: 'getComplaintAttachment',
      tags: ['Complaints'],
      summary: 'Download a complaint attachment',
      description:
        'Streams one attachment file. **Access is re-checked on every request** and is limited to the submitter, the ' +
        'assigned staff member, and admins — everyone else gets 403.\n\n' +
        'The `filename` must match a value stored in that complaint\'s `attachments` array exactly; the lookup is done ' +
        'against the parent record rather than the filesystem, and path traversal attempts are rejected.',
      params: [param('IdPathParam'), param('FilenamePathParam')],
      responses: {
        200: { $ref: '#/components/responses/ImageOrPdfResponse' },
        ...errors({ notFound: true, forbidden: true })
      }
    })
  },

  '/complaints/{id}': {
    put: op({
      operationId: 'updateComplaint',
      tags: ['Complaints'],
      summary: 'Update a complaint',
      description: `Change a complaint's status, assignment or resolution text.\n\n**Status state machine**\n\n${TRANSITIONS}`,
      params: [param('IdPathParam')],
      requestBody: body('UpdateComplaintRequest', false),
      responses: {
        200: { description: 'The updated complaint.', content: { 'application/json': { schema: complaintEnvelope } } },
        ...errors({ validation: true, badRequest: true, forbidden: true, notFound: true })
      }
    })
  }
};
