// docs/paths/dues.js — 10 operations on /dues
const { op, body, json, errors, param, multipart, schema } = require('../lib/helpers');

const dueList = {
  type: 'object',
  properties: {
    success: { type: 'boolean', example: true },
    count: { type: 'integer', example: 20 },
    total: { type: 'integer', example: 137, description: 'Total matching records across all pages.' },
    page: { type: 'integer', example: 1 },
    pages: { type: 'integer', example: 7 },
    data: { type: 'array', items: schema('Due') },
    summary: {
      allOf: [{ $ref: '#/components/schemas/DuesSummary' }],
      description:
        'Computed over the **entire filtered set**, not just the current page, so stat cards stay correct at any page size. ' +
        'Fines are recalculated live, so `outstanding` can drift from the stored `fine` values between cron runs.'
    }
  }
};

const dueEnvelope = {
  type: 'object',
  properties: {
    success: { type: 'boolean', example: true },
    data: schema('Due'),
    message: { type: 'string', example: 'Payment proof submitted. Waiting for admin verification.' }
  }
};

const WORKFLOW = [
  '```',
  'pending / overdue',
  '     │  resident: PUT /dues/{id}/submit-payment   (file + declared amount)',
  '     ▼',
  'verification_pending',
  '     ├── admin: PUT /dues/{id}/approve-payment   →  paid   (+ receiptNo)',
  '     └── admin: PUT /dues/{id}/reject-payment    →  pending | overdue',
  '```',
  '',
  'A due is auto-created on the 10th of each month by a scheduled job, and a separate nightly job flips `pending` dues ' +
  'past their due date to `overdue` while accruing a fine. Residents can only ever move a due **into** ' +
  '`verification_pending`; only an admin can move it out.'
].join('\n');

module.exports = {
  '/dues': {
    get: op({
      operationId: 'listDues',
      tags: ['Dues'],
      summary: 'List dues',
      description:
        'Returns dues with the house populated, plus `paidBy`, `submittedBy` and `verifiedBy` as `name`/`username`.\n\n' +
        '**Scoping.** Residents are restricted to houses they are linked to, and `houseId` is intersected with that set ' +
        'rather than replacing it — a resident cannot widen their scope by passing another house\'s ID. ' +
        '`history=true` additionally includes dues belonging to archived houses, which are excluded by default.\n\n' +
        '**Pagination is opt-in** — omit `page` for the full list. Either way, `summary` always describes the whole ' +
        'filtered set.',
      params: [
        param('DueStatusQuery'),
        param('MonthQuery'),
        param('YearQuery'),
        param('HouseIdQuery'),
        param('HistoryQuery'),
        param('PageParam'),
        param('LimitParam')
      ],
      responses: {
        200: { description: 'Matching dues with pagination metadata and a whole-set summary.', content: { 'application/json': { schema: dueList } } },
        ...errors()
      }
    })
  },

  '/dues/stats': {
    get: op({
      operationId: 'getDuesDashboardStats',
      tags: ['Dues'],
      summary: 'Get this month\'s dashboard statistics',
      description:
        'Aggregates for the **current calendar month only** — this endpoint takes no filters, so it is a straight ' +
        'read of what the Dues page header shows.\n\n' +
        'Residents receive the same figures scoped to their own linked houses, so a resident\'s `totalCollected` reflects ' +
        'their own payments rather than the community total. `collectionRate` is returned as a **percentage string** with ' +
        'one decimal place, not a number.',
      responses: {
        200: {
          description: 'Month-to-date aggregates.',
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: { success: { type: 'boolean', example: true }, data: schema('DashboardStats') }
              }
            }
          }
        },
        ...errors()
      }
    })
  },

  '/dues/clusters': {
    get: op({
      operationId: 'getPaymentClusters',
      tags: ['Dues'],
      summary: 'Cluster houses by payment behaviour',
      description:
        'Runs K-Means (k = 3) over a per-house payment-behaviour score and returns the groups, best payer first: ' +
        '`Regular Payer 🟢`, `Late Payer 🟡`, `Defaulter 🔴`.\n\n' +
        'The score is `lateDues * 3 + paidLate` — that is, three times the number of dues that went overdue, plus the ' +
        'number that were paid late. It is a heuristic, so treat the labels as indicative rather than a credit score.\n\n' +
        'This is an admin-only analytical endpoint and is computationally expensive: it issues several queries per house.',
      responses: {
        200: {
          description: 'Payment-behaviour clusters, ordered best to worst.',
          content: {
            'application/json': {
              schema: { type: 'object', properties: { success: { type: 'boolean', example: true }, data: { type: 'array', items: schema('PaymentCluster') } } }
            }
          }
        },
        ...errors({ forbidden: true })
      }
    })
  },

  '/dues/generate': {
    post: op({
      operationId: 'generateMonthlyDues',
      tags: ['Dues'],
      summary: 'Generate this month\'s dues',
      description:
        'Creates a due for every occupied, non-archived house for the current month, due on the 10th at 23:59:59 local ' +
        'time, with the fine pre-computed if that date has already passed.\n\n' +
        '**Idempotent.** Each `(house, month, year)` triple is upserted, and a house that already has a due this month is ' +
        'skipped, so calling this repeatedly will not duplicate charges. The returned count is how many were actually ' +
        'created.\n\n' +
        'A cron job runs the same logic automatically at 08:00 on the 1st of each month, so this endpoint is mainly for ' +
        'backfilling or forcing a run. Every affected resident is notified.',
      responses: {
        200: {
          description: 'Generation completed. The message reports how many dues were created.',
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  success: { type: 'boolean', example: true },
                  message: { type: 'string', example: '12 dues generated for 9/2026' }
                }
              }
            }
          }
        },
        ...errors({ forbidden: true })
      }
    })
  },

  '/dues/{id}': {
    get: op({
      operationId: 'getDueById',
      tags: ['Dues'],
      summary: 'Get a due',
      description:
        'Returns a single due with the house and its owner/tenant populated, plus `submittedBy` and `verifiedBy`. ' +
        'Residents may only fetch dues belonging to their own linked houses; anyone else receives 403.',
      params: [param('IdPathParam')],
      responses: {
        200: {
          description: 'The due.',
          content: {
            'application/json': {
              schema: { type: 'object', properties: { success: { type: 'boolean', example: true }, data: schema('Due') } }
            }
          }
        },
        ...errors({ notFound: true, forbidden: true })
      }
    })
  },

  '/dues/{id}/pay': {
    put: op({
      operationId: 'markDuePaidLegacy',
      tags: ['Dues'],
      summary: '[DEPRECATED] Mark a due as paid',
      deprecated: true,
      description:
        '**This endpoint is disabled and always returns 400.** It is kept only so old clients get a clear error instead ' +
        'of a 404.\n\n' +
        'Marking a due as paid without evidence would let anyone settle their own debts, so the workflow is now ' +
        'submission-then-verification:\n\n' +
        '- Resident: `PUT /dues/{id}/submit-payment`\n' +
        '- Admin: `PUT /dues/{id}/approve-payment`\n\n' +
        'Do not call this endpoint. Remove any client code that still references it.',
      params: [param('IdPathParam')],
      responses: {
        400: {
          description: 'Always returned. The endpoint has no success path.',
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/ErrorResponse' },
              example: {
                success: false,
                message: 'Direct payment marking is disabled. Residents must submit payment proof and an admin must verify it.'
              }
            }
          }
        },
        ...errors()
      }
    })
  },

  '/dues/{id}/proof': {
    get: op({
      operationId: 'getPaymentProof',
      tags: ['Dues'],
      summary: 'Download a payment proof',
      description:
        'Streams the payment proof file for a due. Residents may only download proofs for their own linked houses; ' +
        'admins and staff may download any.\n\n' +
        'Returns 404 when the due has no proof on file, when the stored file has been removed from disk, or when the ' +
        'stored filename contains path separators (which is treated as tampering rather than followed).',
      params: [param('IdPathParam')],
      responses: {
        200: { $ref: '#/components/responses/ImageOrPdfResponse' },
        ...errors({ notFound: true, forbidden: true })
      }
    })
  },

  '/dues/{id}/submit-payment': {
    put: op({
      operationId: 'submitPaymentProof',
      tags: ['Dues'],
      summary: 'Submit payment proof',
      description:
        'Lets a resident submit evidence that they paid. **This does not mark the due as paid** — it moves the due to ' +
        '`verification_pending` and notifies admins, who must then approve or reject it.\n\n' +
        `**Payment verification workflow**\n\n${WORKFLOW}\n\n` +
        '**Request format:** `multipart/form-data` with the file in a field named exactly `proof` (JPG, PNG or PDF, 5 MB ' +
        'maximum, type sniffed from the file bytes), plus the text fields below.\n\n' +
        '**`declaredAmount` must match `amount + fine` within a tolerance of 0.01** — the fine is recomputed live at ' +
        'submission time, so a client that computed it days earlier may be off. A mismatch returns 400 telling you the ' +
        'expected total.\n\n' +
        '**Rejections and retries:** a rejected proof leaves the due back at `pending`/`overdue` and the resident may ' +
        'submit again. Every attempt is appended to `paymentAttempts` and kept — superseded proofs are never deleted, so ' +
        'financial evidence is preserved.\n\n' +
        'Possible failures: 400 (no file, bad amount, invalid method, wrong house), 403 (due belongs to another house), ' +
        '404 (no such due), 409 (already paid, or a proof is already awaiting verification, or a concurrent request won ' +
        'the race). In every failure case any uploaded file is deleted before responding.',
      params: [param('IdPathParam')],
      requestBody: multipart('SubmitPaymentRequest'),
      responses: {
        200: {
          description: 'The proof was accepted and is awaiting admin verification. The due\'s status is now `verification_pending`.',
          content: { 'application/json': { schema: dueEnvelope } }
        },
        ...errors({ badRequest: true, upload: true, forbidden: true, notFound: true, conflict: true })
      }
    })
  },

  '/dues/{id}/approve-payment': {
    put: op({
      operationId: 'approveDuePayment',
      tags: ['Dues'],
      summary: 'Approve a submitted payment',
      description:
        'Marks a `verification_pending` due as **paid**, generating a `receiptNo` of the form ' +
        '`RCP-<timestamp>-<last 5 of id>`, stamping `verifiedBy`/`verifiedAt`, and appending a receipt to the ' +
        '`paymentAttempts` history.\n\n' +
        '`paidBy` is set to whoever submitted the proof, falling back to the approving admin when the submitter is unknown.\n\n' +
        'The transition is applied conditionally on the due still being `verification_pending`, so **if two admins approve ' +
        'at the same time only one succeeds** and the other gets 409. The resident is notified with the receipt number.\n\n' +
        'Approving without inspecting the proof defeats the purpose of the workflow — check `GET /dues/{id}/proof` first.',
      params: [param('IdPathParam')],
      responses: {
        200: {
          description: 'The payment was approved and a receipt was generated.',
          content: { 'application/json': { schema: dueEnvelope } }
        },
        ...errors({ notFound: true, conflict: true, forbidden: true })
      }
    })
  },

  '/dues/{id}/reject-payment': {
    put: op({
      operationId: 'rejectDuePayment',
      tags: ['Dues'],
      summary: 'Reject a submitted payment',
      description:
        'Sends a `verification_pending` due back to `pending` (or `overdue` if its due date has since passed) and stores ' +
        'the rejection `reason`, which is shown to the resident in a notification. Be specific — the resident has to act ' +
        'on it.\n\n' +
        'The fine is recalculated as of now, so a long-delayed rejection does not under-charge the resident. The attempt ' +
        'is marked `rejected` in the history rather than removed.\n\n' +
        'Like approval, the transition is conditional on the current status, so concurrent rejections produce a **409** for ' +
        'all but one.',
      params: [param('IdPathParam')],
      requestBody: body('RejectPaymentRequest'),
      responses: {
        200: {
          description: 'The proof was rejected and the resident may submit a new one.',
          content: { 'application/json': { schema: dueEnvelope } }
        },
        ...errors({ badRequest: true, notFound: true, conflict: true, forbidden: true })
      }
    })
  }
};
