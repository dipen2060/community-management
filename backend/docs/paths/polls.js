// docs/paths/polls.js — 7 operations on /polls
const { op, body, json, errors, param, schema } = require('../lib/helpers');

const pollList = {
  type: 'object',
  properties: {
    success: { type: 'boolean', example: true },
    count: { type: 'integer', example: 10 },
    total: { type: 'integer', example: 23 },
    page: { type: 'integer', example: 1 },
    pages: { type: 'integer', example: 3 },
    data: { type: 'array', items: schema('Poll') }
  }
};

const pollEnvelope = {
  type: 'object',
  properties: { success: { type: 'boolean', example: true }, data: schema('Poll') }
};

const POLL_TRANSITIONS = [
  'Only **active** polls accept votes, and only while `endDate` is in the future.',
  'Each user may vote **once** per poll. A second attempt returns 409.',
  'Options cannot be edited once `totalVotes > 0`.',
  'A `closed` poll can never be modified or deleted-and-recreated meaningfully; it accepts no further changes.'
].join('\n');

module.exports = {
  '/polls': {
    get: op({
      operationId: 'listPolls',
      tags: ['Polls'],
      summary: 'List polls',
      description:
        'Returns polls, newest first. Each item carries a computed `hasVoted` flag for the caller.\n\n' +
        '**Residents only see polls addressed to their own section**, plus any poll with an empty `targetSections` array. ' +
        'Admins and staff see every poll.\n\n' +
        'For `anonymous` polls every voter is replaced with `{ _id: "anonymous", name: "Anonymous" }` before the response ' +
        'is sent, so identities are never leaked regardless of role.\n\n' +
        '**Pagination is opt-in** — omit `page` to receive all polls, which the frontend section pickers rely on.',
      params: [param('PollStatusQuery'), param('PageParam'), param('LimitParam')],
      responses: {
        200: { description: 'Matching polls with pagination metadata.', content: { 'application/json': { schema: pollList } } },
        ...errors()
      }
    }),

    post: op({
      operationId: 'createPoll',
      tags: ['Polls'],
      summary: 'Create a poll and notify residents',
      description:
        'Creates a poll with at least two options and notifies the relevant residents.\n\n' +
        '- `type` defaults to `anonymous`. Set `named` if voters should be identifiable — treat that as a privacy decision, ' +
        'not a cosmetic one.\n' +
        '- `targetSections` may be omitted to open the poll to the whole community.\n' +
        '- `endDate`, if supplied, must be in the future.\n\n' +
        'Notification delivery is best-effort: the poll is saved even if it fails, in which case ' +
        '`notificationDelivered` is `false` and a `warning` is included.',
      requestBody: body('CreatePollRequest'),
      responses: {
        201: {
          description: 'The poll was created and notifications were dispatched.',
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  success: { type: 'boolean', example: true },
                  data: schema('Poll'),
                  notifiedCount: { type: 'integer', example: 37, description: 'Number of residents notified.' },
                  notificationDelivered: { type: 'boolean', example: true },
                  warning: { type: 'string', nullable: true, example: 'Poll was saved, but notifications could not be delivered.' },
                  message: { type: 'string', example: 'Poll created successfully' }
                }
              }
            }
          }
        },
        ...errors({ validation: true, badRequest: true, forbidden: true })
      }
    })
  },

  '/polls/{id}': {
    get: op({
      operationId: 'getPollById',
      tags: ['Polls'],
      summary: 'Get a poll',
      description:
        'Returns a single poll with its options and voters, plus a computed `hasVoted` flag. Voters are masked for ' +
        '`anonymous` polls.\n\n' +
        'A resident requesting a section-targeted poll outside their own section receives **403** rather than 404, which ' +
        'does confirm that the poll exists.',
      params: [param('IdPathParam')],
      responses: {
        200: { description: 'The poll.', content: { 'application/json': { schema: pollEnvelope } } },
        ...errors({ notFound: true, forbidden: true })
      }
    }),

    put: op({
      operationId: 'updatePoll',
      tags: ['Polls'],
      summary: 'Update a poll',
      description:
        `Partial update of \`title\`, \`description\`, \`status\` and \`endDate\`.\n\n${POLL_TRANSITIONS}\n\n` +
        'A `closed` poll cannot be modified at all (400), and a new `endDate` must always be in the future.',
      params: [param('IdPathParam')],
      requestBody: body('UpdatePollRequest', false),
      responses: {
        200: {
          description: 'The updated poll.',
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  success: { type: 'boolean', example: true },
                  data: schema('Poll'),
                  message: { type: 'string', example: 'Poll updated successfully' }
                }
              }
            }
          }
        },
        ...errors({ validation: true, badRequest: true, forbidden: true, notFound: true })
      }
    }),

    delete: op({
      operationId: 'deletePoll',
      tags: ['Polls'],
      summary: 'Delete a poll',
      description:
        'Permanently removes the poll along with its votes. Unlike users, notices and houses, polls **are** hard-deleted, ' +
        'so this cannot be undone and any vote history is lost. Prefer setting `status: "closed"` via `PUT /polls/{id}` ' +
        'when the goal is simply to stop accepting votes.',
      params: [param('IdPathParam')],
      responses: {
        200: { description: 'The poll was deleted.', ...json('MessageResponse') },
        ...errors({ notFound: true, forbidden: true })
      }
    })
  },

  '/polls/{id}/vote': {
    post: op({
      operationId: 'votePoll',
      tags: ['Polls'],
      summary: 'Cast a vote',
      description:
        `Records a vote for the option at \`optionIndex\`.\n\n${POLL_TRANSITIONS}\n\n` +
        '**Eligibility:** residents may only vote on polls addressed to their own section (or on broadcasts). A vote is ' +
        'recorded atomically against the poll\'s current state, so concurrent double submissions cannot both succeed.\n\n' +
        'The response returns the whole poll with the vote list masked appropriately for its `type`.',
      params: [param('IdPathParam')],
      requestBody: body('VotePollRequest'),
      responses: {
        200: {
          description: 'The vote was recorded.',
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  success: { type: 'boolean', example: true },
                  data: schema('Poll'),
                  message: { type: 'string', example: 'Vote recorded successfully' }
                }
              }
            }
          }
        },
        ...errors({ validation: true, badRequest: true, forbidden: true, notFound: true, conflict: true })
      }
    })
  },

  '/polls/{id}/results': {
    get: op({
      operationId: 'getPollResults',
      tags: ['Polls'],
      summary: 'Get poll results',
      description:
        'Returns per-option tallies with a `percentage` share of `totalVotes`, plus the voter list. For `anonymous` polls ' +
        'each voter is replaced with an `{ _id: "anonymous", name: "Anonymous" }` placeholder, so the tally is public but ' +
        'the identities are not.\n\n' +
        'The embedded `poll` object is a summary (title, description, totalVotes, status, type) — fetch `GET /polls/{id}` if ' +
        'you need the options and `endDate` too.',
      params: [param('IdPathParam')],
      responses: {
        200: {
          description: 'Tallies and voters per option.',
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: { success: { type: 'boolean', example: true }, data: schema('PollResults') }
              }
            }
          }
        },
        ...errors({ notFound: true })
      }
    })
  }
};
