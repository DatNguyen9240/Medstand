const assert = require('assert');
const crypto = require('crypto');
const path = require('path');
const sql = require('mssql');
const { testDbConfig } = require('./lib/test-db-config');

const ROOT = path.resolve(__dirname, '..');

const sha256 = (value) => crypto.createHash('sha256').update(value).digest('hex');

async function reserve(transaction, context) {
  const result = await new sql.Request(transaction)
    .input('IdempotencyKeyHash', sql.Char(64), context.keyHash)
    .input('VerifiedUserHash', sql.Char(64), context.userHash)
    .input('ApiCode', sql.VarChar(100), context.apiCode)
    .input('RequestID', sql.VarChar(100), context.requestId)
    .execute('dbo.AI_ReserveAPIMutation');
  return result.recordset[0].Decision;
}

async function complete(transaction, context) {
  await new sql.Request(transaction)
    .input('IdempotencyKeyHash', sql.Char(64), context.keyHash)
    .input('VerifiedUserHash', sql.Char(64), context.userHash)
    .input('ApiCode', sql.VarChar(100), context.apiCode)
    .input('RequestID', sql.VarChar(100), context.requestId)
    .input('Outcome', sql.VarChar(20), 'COMPLETED')
    .execute('dbo.AI_CompleteAPIMutation');
}

async function writeAndReadAudit(transaction, context, reader) {
  await new sql.Request(transaction)
    .input('RequestID', sql.VarChar(100), context.requestId)
    .input('VerifiedUserHash', sql.Char(64), context.userHash)
    .input('ApiCode', sql.VarChar(100), context.apiCode)
    .input('OperationType', sql.VarChar(20), 'MUTATION')
    .input('ResultCode', sql.VarChar(60), 'OK')
    .input('HttpStatus', sql.SmallInt, 200)
    .input('DurationMs', sql.Int, 1)
    .input('RowCountBucket', sql.VarChar(20), '1')
    .input('IdempotencyKeyHash', sql.Char(64), context.keyHash)
    .input('TransactionOutcome', sql.VarChar(30), 'COMMITTED')
    .input('N8nExecutionID', sql.VarChar(80), 'p2-04-authorized-rollback')
    .input('StartedAt', sql.DateTime2(3), new Date())
    .execute('dbo.AI_WriteAPIRequestAudit');

  const audit = await new sql.Request(transaction)
    .input('Username', sql.VarChar(50), reader)
    .input('RequestID', sql.VarChar(100), context.requestId)
    .execute('dbo.API_ReadRequestAudit_AI');
  const row = audit.recordset[0];
  assert(row, `Audit missing for ${context.apiCode}`);
  assert.strictEqual(row.OperationType, 'MUTATION');
  assert.strictEqual(row.TransactionOutcome, 'COMMITTED');
  assert.strictEqual(row.IdempotencyKeyHash, context.keyHash);
}

async function runCase(transaction, fixture, definition) {
  const nonce = crypto.randomUUID();
  const context = {
    apiCode: definition.apiCode,
    keyHash: sha256(`p2-04-key-${nonce}`),
    userHash: sha256(fixture.UserName.toLowerCase()),
    requestId: `req-p204-${nonce}`,
  };
  assert.strictEqual(await reserve(transaction, context), 'ACQUIRED');
  await definition.mutate(transaction);
  await definition.assertInside(transaction);
  await complete(transaction, context);
  assert.strictEqual(await reserve(transaction, { ...context, requestId: `req-p204-${crypto.randomUUID()}` }), 'REPLAY');
  await writeAndReadAudit(transaction, context, fixture.AuditReader);
  return { apiCode: definition.apiCode, mutation: 'PASS', audit: 'PASS', replay: 'PASS' };
}

async function main() {
  const pool = await sql.connect(testDbConfig(ROOT));
  const suffix = Date.now().toString().slice(-7);
  const customerName = `P2UAT_AUTH_${suffix}`;
  const promotionId = `P2AUT${suffix}`;
  const transaction = new sql.Transaction(pool);
  try {
    const fixture = (await pool.request().query(`
      SELECT TOP 1 u.UserName, i.ItemID,
        (SELECT TOP 1 UserName FROM dbo.SY_User WHERE COALESCE(Disable, 0)=0 AND UPPER(UserGroupID) IN ('ADMIN','SECURITY','QA') ORDER BY CASE UPPER(UserGroupID) WHEN 'QA' THEN 0 WHEN 'SECURITY' THEN 1 ELSE 2 END) AuditReader
      FROM dbo.SY_User u
      CROSS APPLY (SELECT TOP 1 ItemID FROM dbo.CF_ItemTbl WHERE COALESCE(isDisable, 0)=0 ORDER BY ItemID) i
      WHERE COALESCE(u.Disable, 0)=0 AND COALESCE(u.BranchID, '')<>''
      ORDER BY CASE WHEN UPPER(u.UserGroupID)='ADMIN' THEN 0 ELSE 1 END, u.UserName;
    `)).recordset[0];
    assert(fixture?.AuditReader, 'Authorized mutation/audit fixture is unavailable.');

    await transaction.begin();
    const results = [];
    results.push(await runCase(transaction, fixture, {
      apiCode: '@khach_hang_insert',
      mutate: (tx) => new sql.Request(tx)
        .input('Username', sql.VarChar(50), fixture.UserName)
        .input('TenKhachHang', sql.NVarChar(255), customerName)
        .input('SoDienThoai', sql.VarChar(20), `091${suffix}`)
        .input('DiaChi', sql.NVarChar(500), 'P2 authorized rollback')
        .execute('dbo.API_KhachHang_Insert_AI'),
      assertInside: async (tx) => {
        const row = await new sql.Request(tx).input('name', sql.NVarChar(255), customerName)
          .query('SELECT COUNT(*) AS C FROM dbo.CF_ObjectTbl WHERE ObjectName=@name;');
        assert.strictEqual(row.recordset[0].C, 1);
      },
    }));
    results.push(await runCase(transaction, fixture, {
      apiCode: '@san_pham_trong_tam_import',
      mutate: (tx) => new sql.Request(tx)
        .input('DocumentID', sql.VarChar(50), promotionId)
        .input('TuNgay', sql.VarChar(10), '2026-07-01')
        .input('DenNgay', sql.VarChar(10), '2026-07-31')
        .input('Memo', sql.NVarChar(500), 'P2 authorized rollback')
        .input('JsonItems', sql.NVarChar(sql.MAX), JSON.stringify([{ ItemID: fixture.ItemID, Notes: 'P2' }]))
        .input('JsonRules', sql.NVarChar(sql.MAX), JSON.stringify([{ TuDiem: 1, DenDiem: 2, QuaTang: 'P2' }]))
        .input('Username', sql.VarChar(50), fixture.UserName)
        .execute('dbo.API_SanPhamTrongTam_Import_AI'),
      assertInside: async (tx) => {
        const row = await new sql.Request(tx).input('id', sql.VarChar(50), promotionId)
          .query('SELECT COUNT(*) AS C FROM dbo.AR_SanPhamTrongTamTbl WHERE DocumentID=@id;');
        assert.strictEqual(row.recordset[0].C, 1);
      },
    }));
    await transaction.rollback();

    const remaining = (await pool.request()
      .input('customerName', sql.NVarChar(255), customerName)
      .input('promotionId', sql.VarChar(50), promotionId)
      .query(`SELECT
        (SELECT COUNT(*) FROM dbo.CF_ObjectTbl WHERE ObjectName=@customerName) CustomerRows,
        (SELECT COUNT(*) FROM dbo.AR_SanPhamTrongTamTbl WHERE DocumentID=@promotionId) PromotionRows;`)).recordset[0];
    assert.deepStrictEqual(Object.values(remaining).map(Number), [0, 0]);
    console.log(JSON.stringify({ results, rollbackCleanup: remaining, overall: 'PASS' }, null, 2));
  } finally {
    if (transaction._aborted === false) try { await transaction.rollback(); } catch (_) {}
    await pool.close();
  }
}

main().catch((error) => {
  console.error(error.stack || error.message);
  process.exitCode = 1;
});
