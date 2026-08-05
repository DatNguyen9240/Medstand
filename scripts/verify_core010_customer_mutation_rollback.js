'use strict';

/*
 * Controlled CORE-010 customer mutation test.
 * Procedure/schema changes, customer, idempotency rows and audit rows all live
 * inside one outer transaction and are always rolled back.
 */
const fs = require('fs');
const path = require('path');
const sql = require('mssql');

const ROOT = path.resolve(__dirname, '..');
const SQL_FILES = [
  'sql/Migrate_API_Mutation_Idempotency_AI.sql',
  'sql/System - AI_AuditLog_AI.sql',
  'sql/Module common - API_KhachHang_Insert_AI.sql',
  'sql/Module common - API_DonHangChiTiet_Insert_AI.sql',
];

function readEnv() {
  const values = {};
  const envPath = path.join(ROOT, '.env');
  if (!fs.existsSync(envPath)) return values;
  for (const line of fs.readFileSync(envPath, 'utf8').split(/\r?\n/)) {
    const match = line.match(/^\s*([^#=]+)=(.*)$/);
    if (match) values[match[1].trim()] = match[2].trim();
  }
  return values;
}

function batches(source) {
  return source.split(/^\s*GO\s*(?:--.*)?$/gim).map((part) => part.trim()).filter(Boolean);
}

function firstRecord(result) {
  return result && result.recordset && result.recordset[0] || null;
}

async function executeCustomer(transaction, payload) {
  const request = new sql.Request(transaction);
  request.input('User', sql.VarChar(50), payload.User);
  request.input('ObjectID', sql.VarChar(50), '');
  request.input('ObjectName', sql.NVarChar(150), payload.ObjectName);
  request.input('Address', sql.NVarChar(250), payload.Address);
  request.input('Phone', sql.VarChar(50), payload.Phone);
  request.input('TaxCode', sql.VarChar(50), payload.TaxCode);
  request.input('Birthday', sql.DateTime, new Date('1900-01-01T00:00:00Z'));
  request.input('BranchID', sql.VarChar(50), payload.BranchID);
  request.input('ObjectGroupID', sql.VarChar(50), payload.ObjectGroupID);
  request.input('LocationID', sql.NVarChar(50), payload.LocationID);
  request.input('QuanHuyen', sql.NVarChar(50), payload.QuanHuyen);
  request.input('XaPhuong', sql.NVarChar(50), payload.XaPhuong);
  request.input('IdempotencyKey', sql.VarChar(128), payload.IdempotencyKey);
  request.input('RequestID', sql.VarChar(100), payload.RequestID);
  return firstRecord(await request.execute('dbo.API_KhachHang_Insert_AI'));
}

async function main() {
  const env = { ...readEnv(), ...process.env };
  const pool = await sql.connect({
    server: env.TEST_DB_SERVER,
    port: Number(env.TEST_DB_PORT || 1433),
    database: env.TEST_DB_DATABASE,
    user: env.TEST_DB_USER,
    password: env.TEST_DB_PASSWORD,
    options: { encrypt: false, trustServerCertificate: true },
    connectionTimeout: 15000,
    requestTimeout: 120000,
    pool: { max: 1, min: 0, idleTimeoutMillis: 10000 },
  });

  const transaction = new sql.Transaction(pool);
  let began = false;
  try {
    const dbName = (await pool.request().query('SELECT DB_NAME() AS DbName')).recordset[0].DbName;
    if (dbName !== 'medtest') throw new Error(`Test chỉ được chạy trên medtest; hiện tại là ${dbName}`);

    await transaction.begin(sql.ISOLATION_LEVEL.SERIALIZABLE);
    began = true;
    for (const relativePath of SQL_FILES) {
      const source = fs.readFileSync(path.join(ROOT, relativePath), 'utf8');
      for (const batch of batches(source)) await new sql.Request(transaction).batch(batch);
    }

    const candidate = firstRecord(await new sql.Request(transaction).query(`
SELECT TOP (1)
       U.UserName, U.BranchID, O.ObjectGroupID, O.LocationID, O.QuanHuyen, O.XaPhuong
FROM dbo.SY_User U
CROSS APPLY dbo.AR_GetObjectByUserFnc(U.UserName) F
JOIN dbo.CF_ObjectTbl O ON O.ObjectID = F.ObjectID
WHERE COALESCE(U.Disable, 0) = 0
  AND COALESCE(U.ObjectID, '') = ''
  AND COALESCE(U.EmployeeID, '') <> ''
  AND COALESCE(U.BranchID, '') <> ''
  AND COALESCE(O.ObjectGroupID, '') <> ''
  AND EXISTS (SELECT 1 FROM dbo.CF_LocationTbl L WHERE L.LocationID = O.LocationID)
  AND EXISTS (SELECT 1 FROM dbo.CF_LocationDetailTbl D WHERE D.QuanHuyen = O.QuanHuyen)
  AND EXISTS (SELECT 1 FROM dbo.CF_LocationDetail2Tbl W WHERE W.XaPhuong = O.XaPhuong)
ORDER BY CASE WHEN U.UserName = 'QLBH013.MED' THEN 0 ELSE 1 END, U.UserName;`));
    if (!candidate) throw new Error('Không tìm thấy user/group/address hợp lệ cho rollback test.');

    const suffix = String(Date.now());
    const phone = `09${suffix.slice(-8)}`;
    const taxCode = `9${suffix.slice(-12)}`;
    const key = `core010-customer-${suffix}`;
    const base = {
      ...candidate,
      User: candidate.UserName,
      ObjectName: `CORE010 rollback ${suffix}`,
      Address: `CORE010 rollback ${suffix}`,
      Phone: phone,
      TaxCode: taxCode,
      IdempotencyKey: key,
      RequestID: `req-core010-customer-a-${suffix}`,
    };

    const first = await executeCustomer(transaction, base);
    if (!first || Number(first.MsgType) !== 5 || !first.ObjectID || Number(first.IsReplay) !== 0) {
      throw new Error(`Create failed: ${JSON.stringify(first)}`);
    }

    const replay = await executeCustomer(transaction, { ...base, RequestID: `req-core010-customer-b-${suffix}` });
    if (!replay || Number(replay.MsgType) !== 5 || replay.ObjectID !== first.ObjectID || Number(replay.IsReplay) !== 1) {
      throw new Error(`Replay mismatch: ${JSON.stringify(replay)}`);
    }

    const conflict = await executeCustomer(transaction, {
      ...base,
      Address: `${base.Address} changed`,
      RequestID: `req-core010-customer-c-${suffix}`,
    });
    if (!conflict || Number(conflict.MsgType) !== 1 || conflict.Code !== 'IDEMPOTENCY_CONFLICT') {
      throw new Error(`Conflict was not rejected: ${JSON.stringify(conflict)}`);
    }

    const crypto = require('crypto');
    const keyHash = crypto.createHash('sha256').update(key).digest('hex');
    const userHash = crypto.createHash('sha256').update(String(candidate.UserName).toLowerCase()).digest('hex');
    const ledgerRequest = new sql.Request(transaction);
    ledgerRequest.input('IdempotencyKeyHash', sql.Char(64), keyHash);
    ledgerRequest.input('VerifiedUserHash', sql.Char(64), userHash);
    ledgerRequest.input('ApiCode', sql.VarChar(100), 'API_KhachHang_Insert_AI');
    ledgerRequest.input('RequestID', sql.VarChar(100), `req-core010-customer-ledger-${suffix}`);
    const ledgerProbe = firstRecord(await ledgerRequest.execute('dbo.AI_ReserveAPIMutation'));
    if (!ledgerProbe || ledgerProbe.Decision !== 'REPLAY' || ledgerProbe.ResultEntityID !== first.ObjectID) {
      throw new Error(`Ledger replay probe mismatch: ${JSON.stringify(ledgerProbe)}`);
    }

    const evidenceRequest = new sql.Request(transaction);
    evidenceRequest.input('ObjectID', sql.VarChar(50), first.ObjectID);
    const evidence = firstRecord(await evidenceRequest.query(`
SELECT
  (SELECT COUNT_BIG(*) FROM dbo.CF_ObjectTbl WHERE ObjectID = @ObjectID) AS CustomerCount,
  (SELECT COUNT_BIG(*) FROM dbo.AI_AuditLog WHERE TargetID = @ObjectID AND ActionType = 'CREATE_CUSTOMER') AS CreateAuditCount,
  (SELECT COUNT_BIG(*) FROM dbo.AI_AuditLog WHERE TargetID = @ObjectID AND ActionType = 'REPLAY_CUSTOMER') AS ReplayAuditCount,
  (SELECT COUNT_BIG(*) FROM dbo.AI_AuditLog WHERE TargetID = @ObjectID AND ActionType = 'IDEMPOTENCY_CONFLICT_CUSTOMER') AS ConflictAuditCount;`));
    if (Number(evidence.CustomerCount) !== 1
        || Number(evidence.CreateAuditCount) !== 1 || Number(evidence.ReplayAuditCount) !== 1
        || Number(evidence.ConflictAuditCount) !== 1) {
      throw new Error(`Transactional evidence mismatch: ${JSON.stringify(evidence)}`);
    }

    await new sql.Request(transaction).batch('DROP PROCEDURE dbo.AI_WriteAuditLog;');
    const auditUnavailableCustomer = await executeCustomer(transaction, {
      ...base,
      Phone: `08${suffix.slice(-8)}`,
      TaxCode: `8${suffix.slice(-12)}`,
      IdempotencyKey: `core010-customer-no-audit-${suffix}`,
      RequestID: `req-core010-customer-no-audit-${suffix}`,
    });
    if (!auditUnavailableCustomer || auditUnavailableCustomer.Code !== 'AUDIT_UNAVAILABLE') {
      throw new Error(`Customer did not fail closed without audit: ${JSON.stringify(auditUnavailableCustomer)}`);
    }

    const orderNoAuditRequest = new sql.Request(transaction);
    orderNoAuditRequest.input('Username', sql.VarChar(50), candidate.UserName);
    orderNoAuditRequest.input('IdempotencyKey', sql.VarChar(128), `core010-order-no-audit-${suffix}`);
    orderNoAuditRequest.input('RequestID', sql.VarChar(100), `req-core010-order-no-audit-${suffix}`);
    const auditUnavailableOrder = firstRecord(await orderNoAuditRequest.execute('dbo.API_DonHangChiTiet_Insert_AI'));
    if (!auditUnavailableOrder || auditUnavailableOrder.Code !== 'AUDIT_UNAVAILABLE') {
      throw new Error(`Order did not fail closed without audit: ${JSON.stringify(auditUnavailableOrder)}`);
    }

    await transaction.rollback();
    began = false;
    const cleanupRequest = pool.request();
    cleanupRequest.input('ObjectID', sql.VarChar(50), first.ObjectID);
    const cleanup = firstRecord(await cleanupRequest.query(`
SELECT
  (SELECT COUNT_BIG(*) FROM dbo.CF_ObjectTbl WITH (NOLOCK) WHERE ObjectID = @ObjectID) AS CustomerCount,
  (SELECT COUNT_BIG(*) FROM dbo.AI_AuditLog WITH (NOLOCK) WHERE TargetID = @ObjectID) AS AuditCount;`));
    if (Number(cleanup.CustomerCount) !== 0 || Number(cleanup.AuditCount) !== 0) {
      throw new Error(`Rollback cleanup failed: ${JSON.stringify(cleanup)}`);
    }
    process.stdout.write(`${JSON.stringify({
      Status: 'PASS',
      Database: dbName,
      Mode: 'CONTROLLED_MUTATION_ROLLBACK',
      Account: candidate.UserName,
      First: first,
      Replay: replay,
      Conflict: conflict,
      LedgerProbe: ledgerProbe,
      EvidenceBeforeRollback: evidence,
      AuditUnavailableCustomer: auditUnavailableCustomer,
      AuditUnavailableOrder: auditUnavailableOrder,
      CleanupAfterRollback: cleanup,
      PersistedChanges: false,
    }, null, 2)}\n`);
  } finally {
    if (began) {
      try { await transaction.rollback(); } catch (_) { /* transaction may already be aborted */ }
    }
    await pool.close();
  }
}

main().catch((error) => {
  console.error(JSON.stringify({ Status: 'FAIL', PersistedChanges: false, Error: error.message }, null, 2));
  process.exitCode = 1;
});
