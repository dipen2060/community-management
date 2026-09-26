// docs/components/parameters.js
//
// Reusable OpenAPI parameters. Every value here is checked against the actual
// reading code in the controllers / utils:
//
//  * pagination  -> utils/paginate.js
//  * search      -> utils/search.js (MAX_SEARCH_LENGTH = 100)
//  * exports     -> controllers/exportController.js (EXPORT_MAX_RECORDS, "Section <n>")
//  * audit dates -> controllers/auditLogController.js

const PageParam = {
  name: 'page',
  in: 'query',
  required: false,
  description:
    'Page number, 1-based. **Omit this entirely to disable pagination** and receive the full result set — several ' +
    'frontend screens (house pickers, section pickers) rely on that behaviour.',
  schema: { type: 'integer', minimum: 1, default: 1, example: 1 }
};

const LimitParam = {
  name: 'limit',
  in: 'query',
  required: false,
  description: 'Items per page. Clamped to the range 1-100. Has no effect unless `page` is also supplied.',
  schema: { type: 'integer', minimum: 1, maximum: 100, default: 20, example: 20 }
};

const ExportPageParam = {
  name: 'page',
  in: 'query',
  required: false,
  description: 'Page number for chunked exports. Unlike list endpoints, a default of `1` is always applied.',
  schema: { type: 'integer', minimum: 1, default: 1, example: 1 }
};

const ExportLimitParam = {
  name: 'limit',
  in: 'query',
  required: false,
  description:
    'Rows per export chunk. Defaults to 500 and is capped by the `EXPORT_MAX_RECORDS` environment variable ' +
    '(1000 by default). Exceeding the cap returns 400.',
  schema: { type: 'integer', minimum: 1, default: 500, example: 500 }
};

const IdPathParam = {
  name: 'id',
  in: 'path',
  required: true,
  description: 'MongoDB ObjectId of the resource.',
  schema: { type: 'string', pattern: '^[0-9a-fA-F]{24}$', example: '65f1a2b3c4d5e6f7a8b9c0d1' }
};

const FilenamePathParam = {
  name: 'filename',
  in: 'path',
  required: true,
  description: 'Exact stored filename of the attachment, as it appears in the parent resource\'s `attachments` array.',
  schema: { type: 'string', example: '1735680000000-48291355.jpg' }
};

const RoleQuery = {
  name: 'role',
  in: 'query',
  required: false,
  description:
    'Filter by role. **Note:** staff and resident callers are silently forced to `role=staff` with `isActive=true` ' +
    'regardless of what they send — only admins can list all roles.',
  schema: { $ref: '#/components/schemas/UserRole' }
};

const DueStatusQuery = {
  name: 'status',
  in: 'query',
  required: false,
  description: 'Filter dues by payment status.',
  schema: { $ref: '#/components/schemas/DueStatus' }
};

const ComplaintStatusQuery = {
  name: 'status',
  in: 'query',
  required: false,
  description: 'Filter complaints by status.',
  schema: { $ref: '#/components/schemas/ComplaintStatus' }
};

const ExportDuesStatusQuery = {
  name: 'status',
  in: 'query',
  required: false,
  description: 'Filter the export by due status.',
  schema: { type: 'string', enum: ['pending', 'overdue', 'verification_pending', 'paid'] }
};

const ExportComplaintsStatusQuery = {
  name: 'status',
  in: 'query',
  required: false,
  description: 'Filter the export by complaint status.',
  schema: { type: 'string', enum: ['pending', 'inprogress', 'resolved', 'closed'] }
};

const MonthQuery = {
  name: 'month',
  in: 'query',
  required: false,
  description: 'Calendar month filter.',
  schema: { type: 'integer', minimum: 1, maximum: 12, example: 9 }
};

const YearQuery = {
  name: 'year',
  in: 'query',
  required: false,
  description: 'Calendar year filter.',
  schema: { type: 'integer', minimum: 2000, maximum: 2100, example: 2026 }
};

const HouseIdQuery = {
  name: 'houseId',
  in: 'query',
  required: false,
  description:
    'Restrict results to one house. Residents are silently intersected with their own linked houses, so they can never ' +
    'widen their scope with this parameter.',
  schema: { type: 'string', pattern: '^[0-9a-fA-F]{24}$', example: '65f1a2b3c4d5e6f7a8b9c0d2' }
};

const SearchQuery = {
  name: 'search',
  in: 'query',
  required: false,
  description:
    'Case-insensitive substring match. The value is regex-escaped, so it is matched literally. Must be 100 characters ' +
    'or fewer — a longer value returns 400.',
  schema: { type: 'string', maxLength: 100, example: 'water' }
};

const SectionQuery = {
  name: 'section',
  in: 'query',
  required: false,
  description: 'Filter by community section.',
  schema: { type: 'string', example: 'Section 1' }
};

const ExportSectionQuery = {
  name: 'section',
  in: 'query',
  required: false,
  description: 'Must strictly match the pattern `Section <number>`. Anything else returns 400.',
  schema: { type: 'string', pattern: '^Section [0-9]+$', example: 'Section 1' }
};

const CategoryQuery = {
  name: 'category',
  in: 'query',
  required: false,
  description: 'Filter complaints by category.',
  schema: { $ref: '#/components/schemas/ComplaintCategory' }
};

const NoticeTypeQuery = {
  name: 'type',
  in: 'query',
  required: false,
  description: 'Filter notices by type.',
  schema: { $ref: '#/components/schemas/NoticeType' }
};

const PollStatusQuery = {
  name: 'status',
  in: 'query',
  required: false,
  description: 'Filter polls by status.',
  schema: { $ref: '#/components/schemas/PollStatus' }
};

const HistoryQuery = {
  name: 'history',
  in: 'query',
  required: false,
  description:
    'Set to the string `true` to include records belonging to archived houses. Any other value (including omitting ' +
    'the parameter) excludes them.',
  schema: { type: 'string', enum: ['true'], example: 'true' }
};

const MineQuery = {
  name: 'mine',
  in: 'query',
  required: false,
  description: 'Set to the string `true` to restrict complaints to those assigned to the calling staff member. Ignored for other roles.',
  schema: { type: 'string', enum: ['true'], example: 'true' }
};

const ResidentQuery = {
  name: 'resident',
  in: 'query',
  required: false,
  description:
    'User ID of the resident whose house links to list. **Required for non-resident callers** — omitting it returns 400. ' +
    'Residents may omit it and always receive their own links.',
  schema: { type: 'string', pattern: '^[0-9a-fA-F]{24}$', example: '65f1a2b3c4d5e6f7a8b9c0d1' }
};

const ActorQuery = {
  name: 'actor',
  in: 'query',
  required: false,
  description: 'Filter by the user who performed the action. Must be a valid ObjectId, otherwise 400.',
  schema: { type: 'string', pattern: '^[0-9a-fA-F]{24}$', example: '65f1a2b3c4d5e6f7a8b9c0d1' }
};

const AuditActionQuery = {
  name: 'action',
  in: 'query',
  required: false,
  description: 'Filter by action name, e.g. `due_approved`.',
  schema: { type: 'string', maxLength: 100, example: 'due_approved' }
};

const FromDateQuery = {
  name: 'from',
  in: 'query',
  required: false,
  description: 'Inclusive lower bound on the audit timestamp, as `YYYY-MM-DD`. Interpreted at 00:00:00.000 UTC. Invalid dates return 400.',
  schema: { type: 'string', format: 'date', example: '2026-09-01' }
};

const ToDateQuery = {
  name: 'to',
  in: 'query',
  required: false,
  description: 'Inclusive upper bound on the audit timestamp, as `YYYY-MM-DD`. Interpreted at 23:59:59.999 UTC. Invalid dates return 400.',
  schema: { type: 'string', format: 'date', example: '2026-09-30' }
};

module.exports = {
  PageParam,
  LimitParam,
  ExportPageParam,
  ExportLimitParam,
  IdPathParam,
  FilenamePathParam,
  RoleQuery,
  DueStatusQuery,
  ComplaintStatusQuery,
  ExportDuesStatusQuery,
  ExportComplaintsStatusQuery,
  MonthQuery,
  YearQuery,
  HouseIdQuery,
  SearchQuery,
  SectionQuery,
  ExportSectionQuery,
  CategoryQuery,
  NoticeTypeQuery,
  PollStatusQuery,
  HistoryQuery,
  MineQuery,
  ResidentQuery,
  ActorQuery,
  AuditActionQuery,
  FromDateQuery,
  ToDateQuery
};
