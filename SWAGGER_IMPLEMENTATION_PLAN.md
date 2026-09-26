# Swagger / OpenAPI Implementation Plan

**Project:** Tole Community Management System — Backend
**Scope:** Document the complete HTTP API exposed by `backend/routes/` (11 route files, **48 endpoints**, plus the `GET /` health check)
**Status:** PLAN ONLY — no code has been written yet. Awaiting review.

---

## 1. Audit Summary — What We Found

### 1.1 Stack facts (verified by reading the code)

| Item | Finding |
|---|---|
| Runtime | Node + **Express 4.18.2**, **CommonJS** (`require`/`module.exports`) — no ESM, no TypeScript |
| Entry point | `backend/server.js` |
| DB | Mongoose 7.3.1 (MongoDB) |
| Validation | `express-validator` 7.3.2, centralized in `backend/middleware/validator.js` |
| Auth | JWT bearer token, `middleware/auth.js` (`protect` + `authorize(...roles)`) |
| Roles | `admin`, `staff`, `resident` |
| Uploads | `multer` 2.2.0 via a custom `middleware/validatedUpload.js` factory |
| Exports | `exceljs` (xlsx streaming) + `pdfkit` (PDF streaming) |
| Current docs | **None.** No OpenAPI/Swagger file, no `/api-docs` route, no docs folder |
| Tests | Jest + supertest (`backend/test/integration.test.js`) — mounts route files directly |

### 1.2 Route → mount map (from `server.js`)

| Mount path | Route file | Endpoints | Global auth |
|---|---|---|---|
| `/api/auth` | `routes/auth.js` | 2 | none (`login` public, `me` protected) |
| `/api/houses` | `routes/houses.js` | 4 | `router.use(protect)` |
| `/api/dues` | `routes/dues.js` | 10 | `router.use(protect)` |
| `/api/complaints` | `routes/complaints.js` | 4 | `router.use(protect)` |
| `/api/notices` | `routes/notices.js` | 3 | `router.use(protect)` |
| `/api/notifications` | `routes/notifications.js` | 3 | `router.use(protect)` |
| `/api/users` | `routes/users.js` | 7 | `router.use(protect)` |
| `/api/exports` | `routes/exports.js` | 4 | `protect` + `authorize('admin','staff')` |
| `/api/polls` | `routes/polls.js` | 7 | `router.use(protect)` |
| `/api/audit-logs` | `routes/auditLogs.js` | 1 | `protect` + `authorize('admin')` |
| `/api/resident-houses` | `routes/residentHouses.js` | 3 | `router.use(protect)` |
| `/` | inline in `server.js` | 1 | none (health check) |

**Total: 48 API endpoints + 1 root health check.**

### 1.3 Complete endpoint inventory

Legend for **Access**: `P` = public, `A` = any authenticated, `R` = resident, `S` = staff, `AS` = admin or staff, `Ad` = admin only.

#### Auth — `/api/auth` (2)
| # | Method | Path | Access | Notes |
|---|---|---|---|---|
| 1 | POST | `/api/auth/login` | P | JSON body. **Rate limited**: 10 req/15 min per IP (route-level) + 50–200/15 min (mount-level). Returns JWT + user object |
| 2 | GET | `/api/auth/me` | A | Current user profile from the token |

#### Users — `/api/users` (7)
| # | Method | Path | Access | Notes |
|---|---|---|---|---|
| 3 | GET | `/api/users` | A | Query `?role=`. **Visibility rule:** `staff` and `resident` callers are silently forced to `role=staff` + `isActive=true`; only `admin` sees everything. Custom middleware `allowStaffDirectoryOrManagement` |
| 4 | GET | `/api/users/:id` | Ad | 404 if not found |
| 5 | POST | `/api/users` | Ad | `createUserValidation`. Username auto-generated, **temporary password auto-generated and never returned** — deliver out-of-band. Returns 201 |
| 6 | PUT | `/api/users/me/profile` | A | `updateProfileValidation`. Self-edit. Password change requires `currentPassword`; clears `mustChangePassword` |
| 7 | PUT | `/api/users/:id` | Ad | Partial update. **Blocks deactivating/demoting the last active admin** (400) |
| 8 | PUT | `/api/users/:id/reset-password` | Ad | Issues a new temporary password, sets `mustChangePassword=true`. Password not returned |
| 9 | DELETE | `/api/users/:id` | Ad | **Soft delete** (`isActive=false`) + cascades (unlinks houses, nulls complaint/due refs, deletes notifications, pulls poll votes). Cannot delete own account; cannot delete last admin |

#### Houses — `/api/houses` (4)
| # | Method | Path | Access | Notes |
|---|---|---|---|---|
| 10 | GET | `/api/houses` | A | Paginated. Residents see only linked houses |
| 11 | POST | `/api/houses` | AS | `createHouseValidation`. 409 on duplicate `houseNo` or owner/tenant already assigned |
| 12 | PUT | `/api/houses/:id` | AS | Partial update. `owner`/`tenant` accept `""` to unassign. 409 on conflicts |
| 13 | DELETE | `/api/houses/:id` | Ad | **Actually archives** (`isOccupied=false`, clears owner/tenant, deletes resident links) — preserves dues/complaints |

#### Dues — `/api/dues` (10)
| # | Method | Path | Access | Notes |
|---|---|---|---|---|
| 14 | GET | `/api/dues` | A | Query: `status, month, year, houseId, history, page, limit`. Returns `summary` (outstanding/verification/paid) computed over the **full** filtered set. `history=true` includes archived houses. Residents restricted to their linked houses |
| 15 | GET | `/api/dues/stats` | A | Current-month dashboard stats; residents scoped to their houses |
| 16 | GET | `/api/dues/clusters` | Ad | K-Means payment-behaviour clustering → `Regular Payer / Late Payer / Defaulter` |
| 17 | GET | `/api/dues/:id/proof` | A | **Binary file** (image or PDF). Residents only for linked houses. 404 if no proof on file |
| 18 | GET | `/api/dues/:id` | A | Single due, populated. 403 for unrelated residents |
| 19 | POST | `/api/dues/generate` | Ad | Idempotent upsert per `house+month+year` |
| 20 | PUT | `/api/dues/:id/submit-payment` | R | **multipart/form-data**, field `proof` (1 file, JPG/PNG/PDF, max 5 MB). Fields `declaredAmount` (must equal amount+fine within ±0.01), `paymentMethod`, `paymentReference`. 400/403/409 on invalid, wrong house, already paid, or proof already pending |
| 21 | PUT | `/api/dues/:id/approve-payment` | Ad | `verification_pending` → `paid`, generates `receiptNo`. 409 if already processed |
| 22 | PUT | `/api/dues/:id/reject-payment` | Ad | Body `reason` (required). Reverts to `pending`/`overdue`. 409 if already processed |
| 23 | PUT | `/api/dues/:id/pay` | A | **DEPRECATED / disabled.** Always `400` — direct payment marking is intentionally blocked. Document as deprecated |

#### Complaints — `/api/complaints` (4)
| # | Method | Path | Access | Notes |
|---|---|---|---|---|
| 24 | GET | `/api/complaints` | A | Query: `status, category, section, houseId, search (≤100 chars), mine, history, page, limit`. Residents see only their own. `mine=true` for staff → assigned to them |
| 25 | POST | `/api/complaints` | A | **multipart/form-data**, field `attachments` (max **5** files, JPG/PNG/GIF/PDF, 5 MB each). Residents limited to `low`/`medium` priority. **Auto-detects** `category` (keyword) + `section` (from house), **auto-assigns** staff by specialization, returns `autoDetected`, `autoAssigned`, `similarComplaints` (TF‑IDF). 201 |
| 26 | GET | `/api/complaints/:id/attachments/:filename` | A | **Binary file.** Submitter, assigned staff, or admin only |
| 27 | PUT | `/api/complaints/:id` | A | `updateComplaintValidation` + `authorizeComplaintUpdate`. **Transition matrix:** `pending→inprogress`, `inprogress→resolved`, `resolved→pending\|closed`, `closed→` (locked). `resolution` required to resolve. Residents may only reopen their own resolved complaint. Auto-closes after 2 reopens |

#### Notices — `/api/notices` (3)
| # | Method | Path | Access | Notes |
|---|---|---|---|---|
| 28 | GET | `/api/notices` | A | Query: `search (≤100 chars), type, page, limit`. Residents see only their section(s) or broadcast notices |
| 29 | POST | `/api/notices` | AS | `createNoticeValidation`. `targetSections` must be known sections. Returns 201 + `notifiedCount`, `notificationDelivered`, optional `warning` |
| 30 | DELETE | `/api/notices/:id` | Ad | **Soft delete** (`isActive=false`) |

#### Notifications — `/api/notifications` (3)
| # | Method | Path | Access | Notes |
|---|---|---|---|---|
| 31 | GET | `/api/notifications` | A | Latest 30 + `unreadCount`. Not paginated |
| 32 | PUT | `/api/notifications/:id/read` | A | Scoped to own notifications; 404 otherwise |
| 33 | PUT | `/api/notifications/read-all` | A | Returns message only |

#### Exports — `/api/exports` (4)
| # | Method | Path | Access | Notes |
|---|---|---|---|---|
| 34 | GET | `/api/exports/dues/excel` | AS | **Binary xlsx.** Query `page, limit, month, year, status, section`. Admin gets financial columns; staff gets a reduced set |
| 35 | GET | `/api/exports/dues/pdf` | AS | **Binary PDF**, same filters |
| 36 | GET | `/api/exports/complaints/excel` | AS | **Binary xlsx.** Query `page, limit, status, category, section` |
| 37 | GET | `/api/exports/complaints/pdf` | AS | **Binary PDF**, same filters |

> All 4 export routes run a **mandatory audit log** write before responding, and are gated by `exportPermission(resource)` (admin = always; staff = must match `exportSection`). Denials are audited as `export_denied` and return 403.
> `limit` is capped by `EXPORT_MAX_RECORDS` (default **1000**, default page size 500). `section` must match `Section <number>`. Invalid filters → 400 with an `errors[]` array.

#### Polls — `/api/polls` (7)
| # | Method | Path | Access | Notes |
|---|---|---|---|---|
| 38 | GET | `/api/polls` | A | Query `status, page, limit`. Residents filtered by their section(s). Each poll carries `hasVoted`; `anonymous` polls mask voters |
| 39 | GET | `/api/polls/:id` | A | 403 if a section-targeted poll is outside the resident's section |
| 40 | POST | `/api/polls/:id/vote` | R | `votePollValidation`. Body `optionIndex` (int ≥ 0). 400 if closed/expired/out of range; 403 if not eligible; **409 if already voted** |
| 41 | GET | `/api/polls/:id/results` | A | Per-option `percentage` + voter list (masked when anonymous) |
| 42 | POST | `/api/polls` | AS | `createPollValidation`. ≥2 options, `type`, `targetSections`, future `endDate`. Returns 201 + `notifiedCount`, `notificationDelivered` |
| 43 | PUT | `/api/polls/:id` | AS | `updatePollValidation`. 400 if closed, or if `options` changed after voting started |
| 44 | DELETE | `/api/polls/:id` | Ad | Hard delete |

#### Audit Logs — `/api/audit-logs` (1)
| # | Method | Path | Access | Notes |
|---|---|---|---|---|
| 45 | GET | `/api/audit-logs` | Ad | Query `actor, action, from, to (YYYY-MM-DD), page, limit`. 400 on invalid actor/date. `details` is `Mixed` and auto-redacted for sensitive keys |

#### Resident Houses — `/api/resident-houses` (3)
| # | Method | Path | Access | Notes |
|---|---|---|---|---|
| 46 | GET | `/api/resident-houses` | A | Residents get their own links; **non-residents must pass `?resident=<userId>`** or get 400 |
| 47 | POST | `/api/resident-houses` | AS | Body `resident_id, house_id, relationship_type (owner\|tenant)`. Idempotent upsert. 201 |
| 48 | DELETE | `/api/resident-houses/:id` | AS | Hard delete of the link |

#### Health (1)
| # | Method | Path | Access | Notes |
|---|---|---|---|---|
| 49 | GET | `/` | P | `{ success: true, message: 'Tole Management API is running' }` |

### 1.4 Cross-cutting conventions the spec must capture

These are the things a reader cannot guess and that make the docs genuinely useful:

1. **Response envelope** — every JSON response is `{ success: boolean, message?: string, ...payload }`. List endpoints add `count`, `total`, `page`, `pages` from `utils/paginate.js`.
2. **Pagination is opt-in** — `utils/paginate.js` only paginates when `page` is present; otherwise the **full** list is returned (deliberate, so dropdowns keep working). `limit` is clamped to 1–100. This must be documented explicitly, and again in each paginated endpoint.
3. **Error shape** — `{ success: false, message: string }`; validation failures add `errors: [{ field, message }]` (from `middleware/validator.js`); export filter failures add `errors: [string]`.
4. **Auth is header-only** — `middleware/auth.js` **rejects** `?token=` / `?access_token` with 401. So the Swagger security scheme must be `type: http, scheme: bearer` — **never** `apiKey` in query.
5. **Status codes in use** — 200, 201, 400, 401, 403, 404, 409, 429, 500. (`errorHandler.js` maps CastError→404, duplicate key→400, Mongoose ValidationError→400, Multer/oversize/invalid-file-type→400, JWT errors→401.)
6. **Rate limiting** — global 2000/15 min (dev) or 100/15 min (prod); `/api/auth` mount 200/50; `/api/auth/login` 10/15 min. The two mount-level limiters reply with a **plain-text** body, not JSON — worth a note.
7. **Soft deletes / archives** — users, notices, and houses are never hard-deleted; the docs must not say "deleted".
8. **Deceptive endpoint** — `PUT /api/dues/:id/pay` always 400s by design.
9. **Binary endpoints** — 2 file-download routes + 4 export routes need `content` maps, not JSON schemas.
10. **Multipart endpoints** — 2 routes need `multipart/form-data` request bodies.

---

## 2. Recommended Approach

### 2.1 Tooling decision

| Option | Verdict |
|---|---|
| **`swagger-ui-express` + `swagger-jsdoc`** | ✅ **Recommended.** Zero TypeScript, CommonJS-native, serves interactive UI + raw JSON, and the spec is generated from plain JS objects so it needs no build step. Fits this repo exactly. |
| Hand-written static `openapi.json` + `swagger-ui-express` | Acceptable fallback, but drifts from the code with nothing to catch it. |
| `zod` + `@asteasolutions/zod-to-openapi` | Best long-term DX (schemas double as runtime validators), but it would mean **rewriting the validation layer**. Too invasive for a docs task. |
| `@tsoa` / `nestjs-swagger` | Wrong fit — those assume TypeScript/decorators. |

**Packages to add (dev-time only, they are not needed at runtime by the app logic):**
- `swagger-ui-express` (^5)
- `swagger-jsdoc` (^6)

### 2.2 Where the annotations live — **Decision D1 (needs your call)**

**Option A — Separate `docs/` folder (RECOMMENDED)**
```
backend/
  docs/
    swagger.js              # openapi base object + component assembly + server mount
    components/
      schemas.js            # all component schemas
      parameters.js         # reusable query/path params
      responses.js          # reusable error responses
    paths/
      auth.js  users.js  houses.js  dues.js  complaints.js
      notices.js  notifications.js  exports.js  polls.js
      auditLogs.js  residentHouses.js
```
- `backend/routes/*.js` stay **completely untouched**.
- One file per resource mirrors one route file — easy to review and to keep in sync.
- Cost: you must remember to update `docs/` when a route changes.

**Option B — Inline `/** @openapi *\/` blocks inside each route file**
- Spec lives next to the code, so drift is less likely.
- Cost: bloats 11 route files with 150–400 lines of annotation each; mixes concerns; the Express router code becomes harder to read.
- Also, `test/integration.test.js` mounts route files directly — annotations are inert there, so no functional risk either way.

**Recommendation: Option A.** Cleaner separation, zero risk of touching working route code, and easier for you to review diff-by-diff.

### 2.3 URL strategy — **Decision D2 (needs your call)**

| Option | Detail |
|---|---|
| **A — Single spec with `servers` (RECOMMENDED)** | One document. `servers: [{ url: '/api', ... }]`, then paths are written relative (`/auth/login`, `/dues/{id}`). Matches how you actually consume the API from the frontend and keeps every path short. |
| B — Full paths in one spec | Paths written as `/api/auth/login`. More explicit, but the `/api` prefix is repeated 48 times and the base-URL story gets awkward if a gateway ever strips the prefix. |
| C — Split spec per resource | Multiple JSON files merged at load. Best for very large APIs; unnecessary at 49 endpoints and adds merge-order fragility. |

**Recommendation: Option A.**

### 2.4 Serving strategy

- `GET /api-docs` → interactive Swagger UI (HTML)
- `GET /api-docs.json` → the raw generated OpenAPI document
- Optionally `GET /api-docs/*` → Swagger UI static assets (served automatically)
- Mounted in `server.js` **before** the `errorHandler` and **before** `app.get('/')`.
- `NODE_ENV=production` → serve the UI behind an env flag (e.g. `ENABLE_API_DOCS`, defaulting **on** in dev, **off** in prod) or at least clearly document the decision. The JSON spec can remain available or be gated — your call (fold into D2).

---

## 3. Known Technical Landmines (must be handled)

These are the things that will silently break the docs UI. Each needs an explicit mitigation in the plan.

| # | Risk | Detail | Mitigation |
|---|---|---|---|
| R1 | **Helmet CSP blocks Swagger UI** | `server.js` applies `helmet()` globally, which enables a strict `Content-Security-Policy` (`script-src 'self'`, `style-src 'self'`). Swagger UI needs inline/eval'd script and style, so the page commonly renders **blank**. | Apply `helmet({ contentSecurityPolicy: false })` **on the docs router only**, or pass CSP directives that permit what the UI needs. Verify in the browser as the very first acceptance test. |
| R2 | **Global rate limiter throttles the UI** | `generalLimiter` allows only **100 req / 15 min in production**. The Swagger UI page issues many sub-resource requests on load. | Mount the docs router **before** `app.use(generalLimiter)`, or exclude `/api-docs*` from the limiter. |
| R3 | **`authLimiter` text body** | `/api/auth` limiter returns a plain string, not JSON. If documented as JSON, the docs will lie. | Document the 429 body as `text/plain` for those routes, or (optional, separate decision) unify the limiters' response bodies. **Do not** change runtime behaviour as part of a docs task. |
| R4 | **Query-token auth must not be offered** | `protect` deliberately rejects `?token=`. | Security scheme is `bearerAuth` = `{ type: 'http', scheme: 'bearer', bearerFormat: 'JWT' }` only. |
| R5 | **Multer parsing order** | `POST /complaints` runs `upload.array('attachments', 5)` **before** `createComplaintValidation` (validation cleans up rejected uploads). | Document the multipart body faithfully, including the max-5-files cap and the 5 MB per-file limit from `validatedUpload.js`. |
| R6 | **Streaming binary responses** | Export routes stream XLSX/PDF straight to the socket; Swagger UI cannot render them inline. | Declare `content` with the correct media types and a `Content-Disposition` note so users know it's a download. |
| R7 | **Spec/spec-code drift** | Nothing forces the spec to match reality. | Add a Jest test (see Phase 5) that walks the Express router stack and fails if any registered route is missing from the spec. |
| R8 | **`swagger-jsdoc` + ESM/CJS** | `swagger-jsdoc` v6 ships CJS-compatible output; `swagger-ui-express` v5 is CJS. | Pin to v6 / v5 respectively and verify with a smoke require before writing any annotations. |
| R9 | **Sensitive data in examples** | `createUser` and `resetPassword` generate temporary passwords; `auditLogger` redacts keys like `paymentReference`, `paymentProof`, `token`. | Never put a real token, password, or phone number in an example. Use obvious placeholders. |

---

## 4. Implementation Phases

Each phase is independently runnable and ends in something verifiable.

### Phase 0 — Preflight
- Confirm Node version and that `npm i -D swagger-ui-express swagger-jsdoc` resolves cleanly.
- Smoke-test that `require('swagger-jsdoc')` and `require('swagger-ui-express')` load under CommonJS.
- Re-run the existing suite: `npm test` — capture the **baseline** (must stay green).

**Done when:** deps installed, baseline test result recorded.

### Phase 1 — Scaffold & mount
- Create `backend/docs/swagger.js` exporting `{ openapiSpec, serveDocs }` (or equivalent).
- Minimal `openapi` 3.0.3 object: `info` (title `Tole Community Management API`, version `1.0.0`, description, contact, license), `servers` per Decision D2.
- Add `components.securitySchemes.bearerAuth`.
- Mount in `server.js` before the limiter/errorHandler per R1/R2.
- Add `GET /` health path + the root health response.

**Done when:** `http://localhost:5000/api-docs` loads and the Authorize button is present.

### Phase 2 — Reusable building blocks
- `components/schemas.js` — every entity + sub-object:
  `User`, `UserSummary` (populated `name/username/phone/email`), `UserProfile` (login/`/me` shape),
  `House`, `Due`, `PaymentProof`, `PaymentAttempt`, `PaymentCluster`,
  `Complaint`, `ComplaintAutoAssignee`, `SimilarComplaint`,
  `Notice`, `Notification`, `Poll`, `PollOption`, `PollResults`, `PollResultRow`,
  `AuditLog`, `ResidentHouseLink`,
  and enums: `UserRole`, `Specialization`, `ExportSection`, `HouseType`, `HouseStatus`,
  `DueStatus`, `PaymentMethod`, `PaymentAttemptStatus`, `ComplaintStatus`, `ComplaintCategory`,
  `ComplaintPriority`, `NoticeType`, `PollType`, `PollStatus`, `NotificationType`.
- `components/parameters.js` — `PageParam`, `LimitParam`, `IdPathParam`, `FilenamePathParam`,
  `RoleQuery`, `StatusQuery`, `MonthQuery`, `YearQuery`, `SearchQuery` (max 100),
  `SectionQuery` (`Section <n>`), `HouseIdQuery`, `HistoryQuery`, `ActorQuery`, `FromDateQuery`, `ToDateQuery`.
- `components/responses.js` — `Unauthorized401`, `Forbidden403`, `NotFound404`, `Conflict409`,
  `ValidationFailed400` (with `errors[]`), `InvalidExportFilter400` (with string `errors[]`),
  `RateLimited429`, `ServerError500`, plus binary responses `PdfFile`, `ImageOrPdfFile`, `XlsxFile`.

**Done when:** `/api-docs.json` validates and every referenced `#/components/...` resolves.

### Phase 3 — Document all 48 endpoints
Suggested order (public → simple → complex → binary), one `docs/paths/*.js` file each:

1. `auth.js` — 2 endpoints
2. `notifications.js` — 3
3. `houses.js` — 4
4. `notices.js` — 3
5. `residentHouses.js` — 3
6. `users.js` — 7
7. `polls.js` — 7
8. `complaints.js` — 4 (incl. multipart + binary + transition matrix)
9. `dues.js` — 10 (incl. multipart + binary + the deprecated endpoint)
10. `exports.js` — 4 (all binary)
11. `auditLogs.js` — 1

Per endpoint, `tags`, `summary`, `description`, `operationId`, per-role `security` overrides (e.g. `GET /api/users` is `bearerAuth` for all but its *content* varies by role — capture that in the description), `parameters`, `requestBody`, and **every** response code the controller can actually emit.

**Done when:** the inventory in §1.3 is fully covered and each tag group renders in the UI with no unresolved references.

### Phase 4 — Cross-cutting documentation
- Global `info.description` covering: base URL, auth flow (login → bearer), the three roles and what each can do, the response envelope, the opt-in pagination rule, the standard error shape, and rate limits.
- A "Business rules" section describing complaint status transitions + auto-close-after-2-reopens, the dues verification workflow, admin-generated temporary passwords, and the soft-delete/archive semantics.
- A `tags` array with ordered, described tags.

**Done when:** a new developer can onboard using only `/api-docs`.

### Phase 5 — Guardrails & polish
- **Drift test** (`backend/test/swagger-docs.test.js`): walk each router's stack, collect `method + fullPath`, assert every one exists in the generated spec. Fails loudly on a new undocumented endpoint. Also assert `GET /` is documented.
- **Spec validation test**: parse `/api-docs.json` and assert no `$ref` is broken.
- `.gitignore` / README updates: document how to view the docs and how to add a new endpoint.
- Optional, **separate decision**: export the spec to `backend/docs/openapi.json` and commit it as a build artefact for the frontend team / thesis submission.

---

## 5. Verification Checklist

Run through this before calling the task done.

- [ ] `npm test` still passes (no regression in `integration.test.js`).
- [ ] `GET /api-docs` renders the UI — **not a blank page** (R1).
- [ ] `GET /api-docs.json` returns valid OpenAPI 3.0.x.
- [ ] Spec passes a linter/parser with **zero** unresolved `$ref`s.
- [ ] The **Authorize** button works — paste a real JWT from `POST /api/auth/login`, then `GET /api/auth/me` returns 200.
- [ ] Every one of the 48 endpoints has an operation and appears under a tag.
- [ ] Every documented status code matches what the controller really returns (spot-check ≥10 endpoints, including the tricky ones: #9, #13, #20, #21, #23, #25, #27, #33, #34, #45, #46).
- [ ] `POST /api/complaints` "Try it out" accepts a real multi-file upload.
- [ ] `PUT /api/dues/{id}/submit-payment` "Try it out" accepts `proof` + `declaredAmount` + `paymentMethod`.
- [ ] Export routes return a download and are documented as binary, not JSON.
- [ ] Loading the UI in a browser does not burn through the production rate limit (R2).
- [ ] No real secrets, tokens, or personal data in any example.
- [ ] Drift test fails when a temporary fake route is added, then removed.

---

## 6. Risks & Mitigations (roll-up)

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| Helmet CSP blanks the Swagger UI | High | High | Phase 1 acceptance test; disable/relax CSP on the docs router only |
| Prod rate limiter breaks the UI | Medium | High | Mount docs before the limiter |
| `swagger-jsdoc` CJS interop issue | Low | Medium | Pin versions, smoke-test in Phase 0 |
| Spec drifts from routes over time | High | Medium | Drift test (Phase 5) |
| Scope creep into rewriting validation | Low | High | Explicitly out of scope — docs only, no behaviour changes |
| Annotations bloat route files | Certain (if Option B) | Medium | Choose Option A (separate `docs/`) |
| Doc examples leak real data | Low | High | Placeholders only (R9) |

---

## 7. Explicitly Out of Scope

- No changes to controller, model, or middleware **behaviour**.
- No new runtime validation (that would be the zod migration, a separate project).
- No API version-prefix change (`/api/v1`) — that would break the frontend.
- No removal/alteration of the deprecated `PUT /api/dues/:id/pay` endpoint.
- No changes to auth, rate limiting, or CORS semantics.

---

## 8. Effort Estimate

| Phase | Scope | Relative effort |
|---|---|---|
| 0 | Preflight | Small |
| 1 | Scaffold + mount + health | Small |
| 2 | Components (≈25 schemas, ≈16 params, ≈11 responses) | Medium |
| 3 | 48 endpoints across 11 files | **Large** — the bulk of the work |
| 4 | Cross-cutting docs | Medium |
| 5 | Tests + polish | Small–Medium |

Phase 3 dominates. It is best split into 3–4 commits (e.g. auth+users+houses, dues+complaints, polls+notices+notifications, exports+audit+resident-houses) so each is reviewable.

---

## 9. Open Decisions — I need your answers

| ID | Question | My recommendation |
|---|---|---|
| **D1** | Annotations in a separate `docs/` folder, or inline in `routes/*.js`? | Separate `docs/` folder — route files stay untouched |
| **D2** | One spec with `servers: ['/api']`, or full `/api/...` paths? | One spec, `/api` base via `servers` |
| **D3** | Should `/api-docs` be exposed in production? | Gate behind an env flag: on in dev, off in prod |
| **D4** | Commit the generated `openapi.json` as an artefact, or generate on the fly only? | Generate on the fly **and** commit the artefact (useful for your thesis submission / frontend team) |
| **D5** | Do you want the two text-body rate limiters unified to JSON? | **No** — out of scope; just document them accurately |

---

## 10. Next Step

Once you approve this plan and answer **D1–D4**, I will begin at **Phase 0**, then work through Phases 1 → 5, reporting after each phase.

If you want to adjust anything — a different annotation style, a different URL prefix, a trimmed scope (e.g. document only `auth` + `dues` + `complaints` first) — tell me and I will revise this file before writing any code.
