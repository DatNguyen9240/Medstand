const fs = require('fs');
const path = require('path');
const assert = require('assert');
const sqlite3 = require('sqlite3').verbose();

const root = path.resolve(__dirname, '..');
const expected = JSON.parse(fs.readFileSync(path.join(root, 'reports', 'p1-04-uat-result.json'), 'utf8').replace(/^\uFEFF/, ''));
const db = new sqlite3.Database(path.join(root, 'n8n-system', 'n8n_data', '.n8n', 'database.sqlite'), sqlite3.OPEN_READONLY);

function decode(text) {
  const table = JSON.parse(text); const memo = new Map();
  function resolve(value) {
    if (typeof value === 'string' && /^\d+$/.test(value) && Number(value) < table.length) {
      const index = Number(value); if (memo.has(index)) return memo.get(index);
      const source = table[index]; if (source === null || typeof source !== 'object') return source;
      const output = Array.isArray(source) ? [] : {}; memo.set(index, output);
      for (const [key, child] of Object.entries(source)) output[key] = resolve(child);
      return output;
    }
    return value;
  }
  return resolve('0');
}

db.get("SELECT e.id,d.data FROM execution_entity e JOIN execution_data d ON d.executionId=e.id WHERE e.workflowId=? ORDER BY e.id DESC LIMIT 1", ['p104AuditVerifyV1'], (error, execution) => {
  if (error) throw error;
  assert(execution, 'Audit verification execution not found.');
  const runData = decode(execution.data).resultData?.runData || {};
  const rows = (runData['Read Safe Audit Rows'] || []).flatMap((run) => (run.data?.main?.[0] || []).map((item) => item.json));
  const safeKeys = new Set(['RequestID', 'CorrelationHintHash', 'VerifiedUserHash', 'ApiCode', 'OperationType', 'ResultCode', 'HttpStatus', 'DurationMs', 'RowCountBucket', 'IdempotencyKeyHash', 'TransactionOutcome', 'N8nExecutionID', 'StartedAt', 'CompletedAt']);
  const results = expected.map((item) => {
    const row = rows.find((candidate) => candidate.RequestID === item.requestId);
    assert(row, `Missing audit row for ${item.name}`);
    assert.strictEqual(row.OperationType, item.operation, `${item.name} operation mismatch`);
    assert.strictEqual(row.TransactionOutcome, item.transactionOutcome, `${item.name} transaction mismatch`);
    assert(/^[a-f0-9]{64}$/i.test(row.CorrelationHintHash || ''), `${item.name} correlation hint was not hashed`);
    if (item.expectIdempotency) assert(/^[a-f0-9]{64}$/i.test(row.IdempotencyKeyHash || ''), `${item.name} idempotency key was not hashed`);
    assert(Object.keys(row).every((key) => safeKeys.has(key)), `${item.name} contains an unsafe audit column`);
    return { name: item.name, requestId: item.requestId, auditId: execution.id, result: 'PASS' };
  });
  console.table(results);
  console.log(`summary=${results.length}/${results.length} pass`);
  db.close();
});
