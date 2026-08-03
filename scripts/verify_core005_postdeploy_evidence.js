'use strict';

/* CORE-005 post-deploy evidence audit. Read-only; never creates or edits orders. */
const fs = require('fs');
const path = require('path');
const sql = require('mssql');

const ROOT = path.resolve(__dirname, '..');

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
    requestTimeout: 60000,
    pool: { max: 1, min: 0, idleTimeoutMillis: 10000 },
  });

  try {
    const result = await pool.request().query(`
IF DB_NAME() <> N'medtest' THROW 51405, N'CORE-005 evidence chỉ được chạy trên medtest.', 1;

DECLARE @DeployTime DATETIME = (
    SELECT modify_date FROM sys.procedures WHERE object_id = OBJECT_ID(N'dbo.API_DonHangChiTiet_Insert_AI')
);

SELECT DB_NAME() AS DatabaseName, @DeployTime AS OrderProcedureDeployTime;

SELECT ActionType, COUNT_BIG(*) AS EventCount, MAX(LogTime) AS LatestEventAt
FROM dbo.AI_AuditLog WITH (NOLOCK)
WHERE LogTime >= DATEADD(MINUTE, -1, @DeployTime)
  AND TargetEntity = 'API_DonHangChiTiet_Insert_AI'
  AND ActionType IN ('CREATE_DONHANG', 'REPLAY_DONHANG', 'CREATE_DONHANG_FAILED')
GROUP BY ActionType
ORDER BY ActionType;

SELECT TOP (20)
       LogTime, Username, ActionType, TargetID AS DocumentID,
       JSON_VALUE(ExtraInfo, '$.requestId') AS RequestID,
       JSON_VALUE(ExtraInfo, '$.outcome') AS Outcome,
       JSON_VALUE(ExtraInfo, '$.resultCode') AS ResultCode
FROM dbo.AI_AuditLog WITH (NOLOCK)
WHERE LogTime >= DATEADD(MINUTE, -1, @DeployTime)
  AND TargetEntity = 'API_DonHangChiTiet_Insert_AI'
  AND ActionType IN ('CREATE_DONHANG', 'REPLAY_DONHANG', 'CREATE_DONHANG_FAILED')
ORDER BY LogTime DESC;
`);
    const runtime = result.recordsets[0][0];
    const summary = result.recordsets[1];
    const events = result.recordsets[2];
    const creates = events.filter((event) => event.ActionType === 'CREATE_DONHANG' && event.DocumentID);
    const replays = events.filter((event) => event.ActionType === 'REPLAY_DONHANG' && event.DocumentID);
    const replayMatchesCreate = replays.some((replay) => creates.some((create) => create.DocumentID === replay.DocumentID));

    process.stdout.write(`${JSON.stringify({
      Status: creates.length && replayMatchesCreate ? 'CREATE_AND_REPLAY_EVIDENCE_PRESENT'
        : (creates.length ? 'CREATE_PRESENT_REPLAY_PENDING' : 'NO_POSTDEPLOY_MUTATION_EVIDENCE'),
      Mode: 'READ_ONLY',
      Runtime: runtime,
      Summary: summary,
      Events: events,
      ConcurrencyProven: false,
      MutationExecuted: false,
    }, null, 2)}\n`);
  } finally {
    await pool.close();
  }
}

main().catch((error) => {
  console.error(JSON.stringify({ Status: 'ERROR', Mode: 'READ_ONLY', Error: error.message, MutationExecuted: false }, null, 2));
  process.exitCode = 1;
});
