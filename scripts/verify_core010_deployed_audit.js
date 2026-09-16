'use strict';

/* Read-only evidence review for deployed CORE-010 audit events on medtest. */
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
  const required = ['TEST_DB_SERVER', 'TEST_DB_DATABASE', 'TEST_DB_USER', 'TEST_DB_PASSWORD'];
  const missing = required.filter((key) => !env[key]);
  if (missing.length) throw new Error(`Thiếu cấu hình: ${missing.join(', ')}`);

  const pool = await sql.connect({
    server: env.TEST_DB_SERVER,
    port: Number(env.TEST_DB_PORT || 1433),
    database: env.TEST_DB_DATABASE,
    user: env.TEST_DB_USER,
    password: env.TEST_DB_PASSWORD,
    options: { encrypt: false, trustServerCertificate: true },
    requestTimeout: 30000,
  });

  try {
    const result = await pool.request().query(`
      SET NOCOUNT ON;
      IF DB_NAME() <> 'medtest' THROW 51290, 'CORE-010 evidence review is restricted to medtest.', 1;

      SELECT GETDATE() AS ServerTime,
             COUNT_BIG(*) AS RelevantEventCount,
             MAX(LogTime) AS LatestRelevantEventTime
      FROM dbo.AI_AuditLog WITH (NOLOCK)
      WHERE ActionType IN (
        'CREATE_CUSTOMER', 'REPLAY_CUSTOMER', 'CREATE_CUSTOMER_FAILED', 'IDEMPOTENCY_CONFLICT_CUSTOMER',
        'CREATE_DONHANG', 'REPLAY_DONHANG', 'CREATE_DONHANG_FAILED'
      );

      SELECT TOP (200)
          LogTime,
          Username,
          ActionType,
          TargetID,
          JSON_VALUE(ExtraInfo, '$.requestId') AS RequestID,
          JSON_VALUE(ExtraInfo, '$.outcome') AS Outcome,
          JSON_VALUE(ExtraInfo, '$.resultCode') AS ResultCode,
          JSON_VALUE(ExtraInfo, '$.capability') AS Capability
      FROM dbo.AI_AuditLog WITH (NOLOCK)
      WHERE ActionType IN (
          'CREATE_CUSTOMER', 'REPLAY_CUSTOMER', 'CREATE_CUSTOMER_FAILED', 'IDEMPOTENCY_CONFLICT_CUSTOMER',
          'CREATE_DONHANG', 'REPLAY_DONHANG', 'CREATE_DONHANG_FAILED'
        )
      ORDER BY LogTime DESC, LogID DESC;
    `);

    const summary = result.recordsets[0]?.[0] || {};
    const rows = result.recordsets[1] || [];
    const counts = {};
    const targets = new Map();
    for (const row of rows) {
      counts[row.ActionType] = (counts[row.ActionType] || 0) + 1;
      if (row.TargetID && (row.ActionType === 'CREATE_CUSTOMER' || row.ActionType === 'CREATE_DONHANG')) {
        const key = `${row.ActionType}:${row.TargetID}`;
        targets.set(key, (targets.get(key) || 0) + 1);
      }
    }

    console.log(JSON.stringify({
      Status: 'PASS_READ_ONLY',
      Database: 'medtest',
      Window: 'ALL_RELEVANT_EVENTS',
      ServerTime: summary.ServerTime || null,
      RelevantEventCount: String(summary.RelevantEventCount || 0),
      LatestRelevantEventTime: summary.LatestRelevantEventTime || null,
      EventCount: rows.length,
      CountsByAction: counts,
      DuplicateCreateAuditTargets: [...targets.entries()]
        .filter(([, count]) => count > 1)
        .map(([key, count]) => ({ key, count })),
      Events: rows,
      MutationExecuted: false,
    }, null, 2));
  } finally {
    await pool.close();
  }
}

main().catch((error) => {
  console.error(JSON.stringify({ Status: 'FAIL', MutationExecuted: false, Error: error.message }, null, 2));
  process.exitCode = 1;
});
