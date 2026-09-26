// docs/generate.js
//
// Writes the generated OpenAPI document to docs/openapi.json so it can be
// committed as a build artefact (handy for the frontend team, Postman import,
// or a thesis submission) without anyone having to boot the server and a
// MongoDB connection.
//
// Usage:
//   node docs/generate.js          # write docs/openapi.json
//   node docs/generate.js --check  # exit 1 if the file is stale, write nothing
//
// `--check` is what CI should run: it fails when routes have changed but the
// committed artefact has not been regenerated.

const fs = require('fs');
const path = require('path');
const { buildOpenApiSpec } = require('./swagger');

const OUTPUT = path.join(__dirname, 'openapi.json');
const CHECK_ONLY = process.argv.includes('--check');

// 2-space indent + trailing newline: readable in diffs and git-hostile to nobody.
const serialised = `${JSON.stringify(buildOpenApiSpec(), null, 2)}\n`;

if (CHECK_ONLY) {
  if (!fs.existsSync(OUTPUT)) {
    console.error('docs/openapi.json is missing. Run: node docs/generate.js');
    process.exit(1);
  }
  const current = fs.readFileSync(OUTPUT, 'utf8');
  if (current !== serialised) {
    console.error('docs/openapi.json is stale. Run: node docs/generate.js');
    process.exit(1);
  }
  console.log('docs/openapi.json is up to date.');
} else {
  fs.writeFileSync(OUTPUT, serialised, 'utf8');
  const spec = buildOpenApiSpec();
  const operations = Object.values(spec.paths).reduce(
    (total, item) => total + Object.keys(item).filter((k) => ['get', 'post', 'put', 'patch', 'delete'].includes(k)).length,
    0
  );
  console.log(`Wrote docs/openapi.json — ${Object.keys(spec.paths).length} paths, ${operations} operations.`);
}
