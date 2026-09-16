'use strict';

/*
 * Controlled verification for the demo-only customer SELF_ASSIGN capability.
 * Configuration/procedure changes, customer, idempotency rows and audit rows
 * are all executed inside one outer transaction and always rolled back.
 */
const fs = require('fs');
const path = require('path');
const sql = require('mssql');

const ROOT = path.resolve(__dirname, '..');
const SQL_FILES = [
  'sql/Migrate_Demo_Customer_SelfAssign_AI.sql',
  'sql/Module common - API_ObjectGroupByUser_AI.sql',
  'sql/Module common - API_EmployeeByManager_AI.sql',
  'sql/Module common - API_TinhThanhByUser_AI.sql',
  'sql/Module common - API_KhachHang_Insert_AI.sql',
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
  return source.replace(/^\uFEFF/, '').split(/^\s*GO\s*(?:--.*)?$/gim)
    .map((part) => part.trim()).filter(Boolean);
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
  request.input('AssignedEmployeeID', sql.VarChar(50), payload.AssignedEmployeeID);
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

  const baseline = firstRecord(await pool.request().query(`
DECLARE @DemoConfigCount BIGINT = 0;
IF OBJECT_ID(N'dbo.AI_CustomerSelfAssignConfig', N'U') IS NOT NULL
    EXEC sys.sp_executesql
         N'SELECT @Count = COUNT_BIG(*) FROM dbo.AI_CustomerSelfAssignConfig WHERE Username = ''demo'';',
         N'@Count BIGINT OUTPUT',
         @Count = @DemoConfigCount OUTPUT;
SELECT @DemoConfigCount AS DemoConfigCount,
       (SELECT COUNT_BIG(*) FROM dbo.CF_ObjectGroupTbl WHERE ObjectGroupID = 'DEMO_KH') AS DemoGroupCount;`));

  const transaction = new sql.Transaction(pool);
  let began = false;
  let createdObjectID = '';
  try {
    const dbName = firstRecord(await pool.request().query('SELECT DB_NAME() AS DbName')).DbName;
    if (dbName !== 'medtest') throw new Error(`Test chỉ được chạy trên medtest; hiện tại là ${dbName}`);

    await transaction.begin(sql.ISOLATION_LEVEL.SERIALIZABLE);
    began = true;
    for (const relativePath of SQL_FILES) {
      const source = fs.readFileSync(path.join(ROOT, relativePath), 'utf8');
      const sqlBatches = batches(source);
      for (let index = 0; index < sqlBatches.length; index += 1) {
        try {
          await new sql.Request(transaction).batch(sqlBatches[index]);
        } catch (error) {
          throw new Error(`${relativePath} batch ${index + 1}: ${error.message}`);
        }
      }
    }

    const groupRequest = new sql.Request(transaction);
    groupRequest.input('User', sql.VarChar(50), 'demo');
    const groupRow = firstRecord(await groupRequest.execute('dbo.API_ObjectGroupByUser_AI'));
    if (!groupRow || groupRow.ObjectGroupID !== 'DEMO_KH' || Number(groupRow.IsSelfAssign) !== 1) {
      throw new Error(`Object group metadata mismatch: ${JSON.stringify(groupRow || group)}`);
    }

    const employeeRequest = new sql.Request(transaction);
    employeeRequest.input('User', sql.VarChar(50), 'demo');
    const employeeRow = firstRecord(await employeeRequest.execute('dbo.API_EmployeeByManager_AI'));
    if (!employeeRow || employeeRow.EmployeeID !== 'DEMO'
        || employeeRow.ObjectGroupID !== 'DEMO_KH' || Number(employeeRow.IsSelfAssign) !== 1) {
      throw new Error(`Employee metadata mismatch: ${JSON.stringify(employeeRow)}`);
    }

    const provinceRequest = new sql.Request(transaction);
    provinceRequest.input('User', sql.VarChar(50), 'demo');
    const provinces = (await provinceRequest.execute('dbo.API_TinhThanhByUser_AI')).recordset || [];
    if (provinces.length !== 1 || provinces[0].LocationID !== 'Hà Nội') {
      throw new Error(`Location scope mismatch: ${JSON.stringify(provinces)}`);
    }

    const address = firstRecord(await new sql.Request(transaction).query(`
SELECT TOP (1) TinhThanh AS LocationID,
       COALESCE(QuanHuyen, N'') AS QuanHuyen,
       XaPhuong
FROM dbo.CF_XaPhuongTbl
WHERE TinhThanh = N'Hà Nội'
  AND NULLIF(LTRIM(RTRIM(COALESCE(XaPhuong, N''))), N'') IS NOT NULL
ORDER BY CASE WHEN NULLIF(LTRIM(RTRIM(COALESCE(QuanHuyen, N''))), N'') IS NULL THEN 1 ELSE 0 END,
         QuanHuyen, XaPhuong;`));
    if (!address) throw new Error('Không tìm thấy phường/xã Hà Nội hợp lệ cho rollback test.');

    const suffix = String(Date.now());
    const payload = {
      User: 'demo',
      ObjectName: `DEMO SELF_ASSIGN rollback ${suffix}`,
      Address: `DEMO rollback ${suffix}`,
      Phone: `09${suffix.slice(-8)}`,
      TaxCode: `9${suffix.slice(-12)}`,
      BranchID: 'MB',
      ObjectGroupID: 'KH',
      LocationID: address.LocationID,
      QuanHuyen: address.QuanHuyen,
      XaPhuong: address.XaPhuong,
      AssignedEmployeeID: 'SHOULD_NOT_WIN',
      IdempotencyKey: `demo-self-${suffix}`,
      RequestID: `req-demo-self-a-${suffix}`,
    };

    const first = await executeCustomer(transaction, payload);
    if (!first || Number(first.MsgType) !== 5 || !first.ObjectID || Number(first.IsReplay) !== 0) {
      throw new Error(`Create failed: ${JSON.stringify(first)}`);
    }
    createdObjectID = first.ObjectID;

    const replay = await executeCustomer(transaction, {
      ...payload,
      RequestID: `req-demo-self-b-${suffix}`,
    });
    if (!replay || Number(replay.MsgType) !== 5
        || replay.ObjectID !== createdObjectID || Number(replay.IsReplay) !== 1) {
      throw new Error(`Replay mismatch: ${JSON.stringify(replay)}`);
    }

    const evidenceRequest = new sql.Request(transaction);
    evidenceRequest.input('ObjectID', sql.VarChar(50), createdObjectID);
    const evidence = firstRecord(await evidenceRequest.query(`
SELECT O.ObjectID, O.ObjectGroupID, O.SaleID, O.UserCreate,
       (SELECT COUNT_BIG(*) FROM dbo.CF_ObjectTbl C WHERE C.ObjectID = @ObjectID) AS CustomerCount,
       (SELECT COUNT_BIG(*) FROM dbo.AI_AuditLog A
         WHERE A.TargetID = @ObjectID AND A.ActionType = 'CREATE_CUSTOMER') AS CreateAuditCount,
       (SELECT COUNT_BIG(*) FROM dbo.AI_AuditLog A
         WHERE A.TargetID = @ObjectID AND A.ActionType = 'REPLAY_CUSTOMER') AS ReplayAuditCount
FROM dbo.CF_ObjectTbl O
WHERE O.ObjectID = @ObjectID;`));
    if (!evidence || evidence.ObjectGroupID !== 'DEMO_KH' || evidence.SaleID !== 'DEMO'
        || String(evidence.UserCreate || '').toLowerCase() !== 'demo'
        || Number(evidence.CustomerCount) !== 1
        || Number(evidence.CreateAuditCount) !== 1 || Number(evidence.ReplayAuditCount) !== 1) {
      throw new Error(`Self-assign evidence mismatch: ${JSON.stringify(evidence)}`);
    }

    await transaction.rollback();
    began = false;

    const cleanupRequest = pool.request();
    cleanupRequest.input('ObjectID', sql.VarChar(50), createdObjectID);
    const cleanup = firstRecord(await cleanupRequest.query(`
DECLARE @DemoConfigCount BIGINT = 0;
IF OBJECT_ID(N'dbo.AI_CustomerSelfAssignConfig', N'U') IS NOT NULL
    EXEC sys.sp_executesql
         N'SELECT @Count = COUNT_BIG(*) FROM dbo.AI_CustomerSelfAssignConfig WHERE Username = ''demo'';',
         N'@Count BIGINT OUTPUT',
         @Count = @DemoConfigCount OUTPUT;
SELECT
  (SELECT COUNT_BIG(*) FROM dbo.CF_ObjectTbl WHERE ObjectID = @ObjectID) AS CustomerCount,
  (SELECT COUNT_BIG(*) FROM dbo.AI_AuditLog WHERE TargetID = @ObjectID) AS AuditCount,
  @DemoConfigCount AS DemoConfigCount,
  (SELECT COUNT_BIG(*) FROM dbo.CF_ObjectGroupTbl WHERE ObjectGroupID = 'DEMO_KH') AS DemoGroupCount;`));
    if (Number(cleanup.CustomerCount) !== 0 || Number(cleanup.AuditCount) !== 0
        || Number(cleanup.DemoConfigCount) !== Number(baseline.DemoConfigCount)
        || Number(cleanup.DemoGroupCount) !== Number(baseline.DemoGroupCount)) {
      throw new Error(`Rollback cleanup mismatch: ${JSON.stringify({ baseline, cleanup })}`);
    }

    process.stdout.write(`${JSON.stringify({
      Status: 'PASS',
      Database: dbName,
      Mode: 'CONTROLLED_MUTATION_ROLLBACK',
      Account: 'demo',
      ForcedAssignment: { EmployeeID: evidence.SaleID, ObjectGroupID: evidence.ObjectGroupID },
      Metadata: { Group: groupRow, Employee: employeeRow, Provinces: provinces },
      First: first,
      Replay: replay,
      EvidenceBeforeRollback: evidence,
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
