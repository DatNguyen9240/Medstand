const assert = require('assert');
const crypto = require('crypto');
const path = require('path');
const sql = require('mssql');
const { testDbConfig } = require('./lib/test-db-config');

const ROOT = path.resolve(__dirname, '..');

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

async function reserve(target, context) {
  const result = await new sql.Request(target)
    .input('IdempotencyKeyHash', sql.Char(64), context.keyHash)
    .input('VerifiedUserHash', sql.Char(64), context.userHash)
    .input('ApiCode', sql.VarChar(100), context.apiCode)
    .input('RequestID', sql.VarChar(100), context.requestId)
    .execute('dbo.AI_ReserveAPIMutation');
  return result.recordset[0].Decision;
}

async function complete(target, context, outcome) {
  await new sql.Request(target)
    .input('IdempotencyKeyHash', sql.Char(64), context.keyHash)
    .input('VerifiedUserHash', sql.Char(64), context.userHash)
    .input('ApiCode', sql.VarChar(100), context.apiCode)
    .input('RequestID', sql.VarChar(100), context.requestId)
    .input('Outcome', sql.VarChar(20), outcome)
    .execute('dbo.AI_CompleteAPIMutation');
}

async function main() {
  const pool = await sql.connect(testDbConfig(ROOT));
  const nonce = `${Date.now()}-${crypto.randomUUID()}`;
  const context = {
    keyHash: sha256(`p2-04-key-${nonce}`),
    userHash: sha256(`p2-04-user-${nonce}`),
    apiCode: '@khach_hang_insert',
    requestId: `req-p204-${crypto.randomUUID()}`,
  };

  const first = new sql.Transaction(pool);
  const cleanupCheck = new sql.Transaction(pool);
  try {
    await first.begin();
    assert.strictEqual(await reserve(first, context), 'ACQUIRED');

    const concurrent = { ...context, requestId: `req-p204-${crypto.randomUUID()}` };
    assert.strictEqual(await reserve(first, concurrent), 'IN_PROGRESS');
    await complete(first, context, 'COMPLETED');
    assert.strictEqual(await reserve(first, concurrent), 'REPLAY');
    await first.rollback();

    await cleanupCheck.begin();
    assert.strictEqual(await reserve(cleanupCheck, context), 'ACQUIRED');
    await cleanupCheck.rollback();
    console.log(JSON.stringify({ acquired: 'PASS', concurrent: 'IN_PROGRESS', completedReplay: 'PASS', cleanupReacquire: 'PASS', overall: 'PASS' }, null, 2));
  } finally {
    if (first._aborted === false) try { await first.rollback(); } catch (_) {}
    if (cleanupCheck._aborted === false) try { await cleanupCheck.rollback(); } catch (_) {}
    await pool.close();
  }
}

main().catch((error) => {
  console.error(error.stack || error.message);
  process.exitCode = 1;
});
