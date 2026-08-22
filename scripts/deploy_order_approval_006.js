'use strict';

/* ORDER-APPROVAL-006 — deploy: sửa @InitialStatusID hard-code trong
   API_DonHangChiTiet_Insert_AI, mở rộng AI_OrderEditGuardFnc cho đơn nháp, bật đúng 2 dòng
   hợp đồng (SUBMIT -1->0, CANCEL -1->10). Sau deploy tự chứng minh 6 dòng CANCEL còn lại
   (0,1,2,3,4,6 -> 10) vẫn RETIRED — không được vô tình bật nhầm khi UPDATE. */
const fs = require('fs');
const path = require('path');
const sql = require('mssql');

const root = path.resolve(__dirname, '..');
const FILES = [
  'sql/Module common - API_DonHangChiTiet_Insert_AI.sql',
  'sql/ORDER-APPROVAL-006_Draft_Restore_AI.sql',
];

function readEnv(relativeEnvPath) {
  const values = {};
  const filePath = path.join(root, relativeEnvPath);
  if (!fs.existsSync(filePath)) return values;
  for (const line of fs.readFileSync(filePath, 'utf8').split(/\r?\n/)) {
    const match = line.match(/^\s*([^#=]+)=(.*)$/);
    if (match) values[match[1].trim()] = match[2].trim().replace(/^['"]|['"]$/g, '');
  }
  return values;
}

function batches(source) {
  return source.split(/^\s*GO\s*(?:--.*)?$/gim).map((part) => part.trim()).filter(Boolean);
}

async function main() {
  if (!process.argv.includes('--apply')) throw new Error('Thêm --apply để chạy deploy thật.');
  const env = { ...readEnv('.env'), ...readEnv('.env.uat.local'), ...process.env };
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

  try {
    const context = (await pool.request().query('SELECT DB_NAME() AS DatabaseName, SUSER_SNAME() AS ExecutedBy;')).recordset[0];
    if (context.DatabaseName !== 'medtest') {
      throw new Error(`ORDER-APPROVAL-006 chỉ deploy trên medtest; hiện tại ${context.DatabaseName}.`);
    }

    const deployed = [];
    for (const relativePath of FILES) {
      const source = fs.readFileSync(path.join(root, relativePath), 'utf8');
      let batchCount = 0;
      for (const batch of batches(source)) {
        await new sql.Request(pool).batch(batch);
        batchCount += 1;
      }
      deployed.push({ File: relativePath, Batches: batchCount });
    }

    const transitionRows = (await pool.request().query(`
      SELECT ActionCode, FromStatusID, ToStatusID, Status, ApprovedBy
      FROM dbo.AI_OrderApprovalTransitionTbl
      WHERE ContractVersion = 'ORDER-APPROVAL-002' AND ActionCode IN ('SUBMIT', 'CANCEL')
      ORDER BY ActionCode, FromStatusID;
    `)).recordset;

    const submitRow = transitionRows.find((r) => r.ActionCode === 'SUBMIT' && r.FromStatusID === -1 && r.ToStatusID === 0);
    const cancelDraftRow = transitionRows.find((r) => r.ActionCode === 'CANCEL' && r.FromStatusID === -1 && r.ToStatusID === 10);
    const stillRetired = transitionRows.filter((r) => r.ActionCode === 'CANCEL' && r.FromStatusID !== -1);

    if (!submitRow || submitRow.Status !== 'APPROVED') {
      throw new Error('SUBMIT (-1->0) không ở trạng thái APPROVED sau deploy: ' + JSON.stringify(submitRow));
    }
    if (!cancelDraftRow || cancelDraftRow.Status !== 'APPROVED') {
      throw new Error('CANCEL (-1->10) không ở trạng thái APPROVED sau deploy: ' + JSON.stringify(cancelDraftRow));
    }
    const wronglyEnabled = stillRetired.filter((r) => r.Status !== 'RETIRED');
    if (wronglyEnabled.length) {
      throw new Error('CANCEL từ trạng thái không phải nháp bị bật nhầm: ' + JSON.stringify(wronglyEnabled));
    }

    const objects = (await pool.request().query(`
      SELECT name, type_desc FROM sys.objects
      WHERE name IN ('AI_OrderEditGuardFnc', 'API_DonHangChiTiet_Insert_AI')
      ORDER BY name;
    `)).recordset;
    if (objects.length !== 2) {
      throw new Error(`Thiếu object sau deploy: ${objects.map((o) => o.name).join(',')} (${objects.length}/2).`);
    }

    console.log(JSON.stringify({
      Task: 'ORDER-APPROVAL-006-DEPLOY',
      Status: 'PASS',
      Database: context.DatabaseName,
      ExecutedBy: context.ExecutedBy,
      Deployed: deployed,
      Objects: objects.map((o) => `${o.name} (${o.type_desc})`),
      TransitionRows: transitionRows,
    }, null, 2));
  } finally {
    await pool.close();
  }
}

main().catch((error) => {
  console.error(JSON.stringify({ Task: 'ORDER-APPROVAL-006-DEPLOY', Status: 'FAIL', Error: error.message }, null, 2));
  process.exitCode = 1;
});
