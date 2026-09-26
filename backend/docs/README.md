# API documentation

OpenAPI 3.0.3 documentation for the Tole Community Management backend, served by
Swagger UI at **`/api-docs`** with the raw document at **`/api-docs.json`**.

## Viewing the docs

```bash
cd backend
npm run dev          # or: npm start
```

Then open <http://localhost:5000/api-docs>.

Click **Authorize**, paste the `token` from `POST /api/auth/login`, and every
"Try it out" button will work against real data.

The docs are **on by default in development and off in production.** Override
with `ENABLE_API_DOCS=true` / `false` (see `.env.example`).

## Layout

```
docs/
  swagger.js              assembles the document; exports createDocsRouter() + isDocsEnabled()
  generate.js             writes/validates the committed openapi.json artefact
  openapi.json            generated artefact — do not hand-edit
  components/
    schemas.js            entity + enum schemas, and the shared error envelopes
    parameters.js         reusable query/path parameters
    responses.js          reusable error + binary responses
  paths/
    health.js             GET /
    auth.js               2 operations
    users.js              7 operations
    houses.js             4 operations
    dues.js               10 operations
    complaints.js         4 operations
    notices.js            3 operations
    notifications.js      3 operations
    polls.js              7 operations
    exports.js            4 operations
    residentHouses.js     3 operations
    auditLogs.js          1 operation
  lib/
    helpers.js            small builders: op(), errors(), body(), multipart(), param()
```

**`backend/routes/*.js` is intentionally not modified.** The specification lives
here, separately, and is kept honest by the parity tests described below.

## Adding or changing an endpoint

1. Edit the matching file in `docs/paths/`. If you added a new router, add a
   matching file and register it in the `pathFiles` array in `docs/swagger.js`.
2. Reuse existing components before writing anything new — `$ref` to
   `#/components/schemas/...`, `#/components/parameters/...` and
   `#/components/responses/...` rather than repeating shapes.
3. Regenerate and verify:

   ```bash
   node docs/generate.js     # rewrite openapi.json
   npm test                  # run the parity tests
   ```

### Things that are easy to get wrong

- **Pagination is opt-in.** Document `page`/`limit` and state that omitting `page`
  returns the full result set. See `utils/paginate.js`.
- **Soft deletes are not deletes.** `DELETE /users/{id}`, `/notices/{id}` and
  `/houses/{id}` all preserve history. Do not describe them as removing data.
- **`op()` only forwards the keys it knows about** — `operationId`, `summary`,
  `description`, `tags`, `deprecated`, `security`, `params`, `requestBody`,
  `responses`. A new OpenAPI field passed to it is silently dropped. Add it to
  `docs/lib/helpers.js` first. `swagger-docs.test.js` guards the fields that
  matter today.
- **Binary and multipart endpoints** need explicit `content` maps; a JSON
  response schema on `/exports/*` or the two proof/attachment downloads is wrong.
- **Status codes must match the controller**, including the awkward ones
  (409 for already-processed payments and double votes, 403 for record-level
  ownership failures).

## Tests

`test/swagger-docs.test.js` (12 tests) guards the documentation:

| Test | Guards against |
| --- | --- |
| every `$ref` resolves | broken references rendering as an "unresolved" block in the UI |
| no drift | a route added to `routes/` but never documented |
| no orphans | a documented operation that no longer exists as a real route |
| mount count == 11 | the server.js mount parser silently breaking |
| operation count == 49 | an accidental drop of a whole path file |
| `deprecated` survives `op()` | helper keys being silently discarded |
| multipart only where expected | a JSON body documented for an upload endpoint |
| `openapi.json` not stale | committing code changes without regenerating the artefact |
| no query-API-key scheme | documenting `?token=` auth, which the server rejects |

The mount prefixes are parsed out of `server.js` at test time, so changing a
mount path without updating the docs fails the suite.

## Known pre-existing issue (unrelated to docs)

`test/integration.test.js` currently fails to load:

```
SyntaxError: Cannot use import statement outside a module
  at middleware/validatedUpload.js:4
```

`file-type` v22 is ESM-only, so Jest's CommonJS runtime cannot `require()` it.
This comes from the in-progress `file-type` v16 -> v22 upgrade in
`package.json`, not from the documentation work.
`test/swagger-docs.test.js` mocks `file-type` so it stays independent of that
migration. Fixing it properly needs a Babel transform for that dependency
(`transformIgnorePatterns` plus `@babel/preset-env`).
