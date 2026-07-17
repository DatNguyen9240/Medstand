const assert = require('assert');
const fs = require('fs');
const path = require('path');
const sql = require('mssql');
const { testDbConfig } = require('./lib/test-db-config');

const ROOT = path.resolve(__dirname, '..');

async function main() {
  const expected = ['manager', 'tdv'].flatMap((role) => {
    const file = path.join(ROOT, 'reports', `p2-04-${role}-mutation-denied.json`);
    return JSON.parse(fs.readFileSync(file, 'utf8')).results;
  });
  assert.strictEqual(expected.length, 8);

  const pool = await sql.connect(testDbConfig(ROOT));
  try {
    const reader = (await pool.request().query(`
      SELECT TOP 1 UserName FROM dbo.SY_User
      WHERE COALESCE(Disable, 0) = 0 AND UPPER(UserGroupID) IN ('ADMIN', 'SECURITY', 'QA')
      ORDER BY CASE UPPER(UserGroupID) WHEN 'QA' THEN 0 WHEN 'SECURITY' THEN 1 ELSE 2 END;
    `)).recordset[0];
    assert(reader, 'No authorized audit reader exists.');

    const results = [];
    for (const item of expected) {
      const audit = (await pool.request()
        .input('username', sql.VarChar, reader.UserName)
        .input('requestId', sql.VarChar, item.requestId)
        .query('EXEC dbo.API_ReadRequestAudit_AI @Username=@username, @RequestID=@requestId;')).recordset[0];
      assert(audit, `Missing audit row for ${item.requestId}`);
      assert.strictEqual(audit.HttpStatus, 403);
      assert(/^[a-f0-9]{64}$/i.test(audit.IdempotencyKeyHash || ''));
      if (item.apiCode === '@cap_nhat_ket_qua_khao_sat') {
        assert.strictEqual(audit.OperationType, 'DENY');
        assert.strictEqual(audit.TransactionOutcome, 'NOT_APPLICABLE');
      } else {
        assert.strictEqual(audit.OperationType, 'MUTATION');
        assert.strictEqual(audit.TransactionOutcome, 'NOT_STARTED');
      }
      results.push({ apiCode: item.apiCode, operationType: audit.OperationType, transactionOutcome: audit.TransactionOutcome, idempotencyHash: 'SHA256', result: 'PASS' });
    }
    console.log(JSON.stringify({ rows: results.length, results, overall: 'PASS' }, null, 2));
  } finally {
    await pool.close();
  }
}

main().catch((error) => {
  console.error(error.stack || error.message);
  process.exitCode = 1;
});
