const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const workflow = JSON.parse(fs.readFileSync(path.join(root, 'n8n', 'API_Services', 'API_Execute.json'), 'utf8'));
const code = (name) => workflow.nodes.find((node) => node.name === name)?.parameters?.jsCode || '';
const validation = code('Validate API Request');
const build = code('Build Execute SQL');
const format = code('Format Execute Response');
const audit = code('Prepare Audit - Execute Success');
const migration = fs.readFileSync(path.join(root, 'sql', 'Migrate_API_Mutation_Idempotency_AI.sql'), 'utf8');

assert(validation.includes("errors.push('@Idempotency-Key')"));
assert(validation.includes("apiCode !== '@lap_don_hang'"));
assert(build.includes('AI_ReserveAPIMutation'));
assert(build.includes('AI_CompleteAPIMutation'));
assert(build.indexOf('AI_ReserveAPIMutation') < build.indexOf('EXEC sp_executesql @SQL'));
assert(build.includes("'IDEMPOTENCY_REPLAY' AS Severity"));
assert(build.includes("'IDEMPOTENCY_IN_PROGRESS' AS Severity"));
assert(format.includes("'IDEMPOTENCY_REPLAY'"));
assert(format.includes("'IDEMPOTENCY_IN_PROGRESS'"));
assert(audit.includes('$json.transactionOutcome'));
assert(migration.includes('PRIMARY KEY (IdempotencyKeyHash, VerifiedUserHash, ApiCode)'));
assert(migration.includes("Status IN ('PENDING', 'COMPLETED', 'FAILED')"));
assert(migration.includes('WITH (UPDLOCK, HOLDLOCK)'));
assert(migration.includes('DENY SELECT, INSERT, UPDATE, DELETE'));

console.log('P2-04 mutation idempotency contract: PASS');
