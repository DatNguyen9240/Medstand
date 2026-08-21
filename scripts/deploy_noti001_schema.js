'use strict';

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const sql = require('mssql');

const root = path.resolve(__dirname, '..');
const files = [
  'sql/NOTI-001_Notification_Schema_AI.sql',
  'sql/NOTI-001_Notification_Distribution_AI.sql',
  'sql/NOTI-001_Notification_Admin_AI.sql',
  'sql/NOTI-001_Notification_Push_AI.sql',
];

function readEnv(relativePath) {
  const values = {};
  const filePath = path.join(root, relativePath);
  if (!fs.existsSync(filePath)) return values;
  for (const line of fs.readFileSync(filePath, 'utf8').split(/\r?\n/)) {
    const match = line.match(/^\s*([^#=]+)=(.*)$/);
    if (match) values[match[1].trim()] = match[2].trim().replace(/^['"]|['"]$/g, '');
  }
  return values;
}

function batches(source) {
  return source.replace(/^\uFEFF/, '').split(/^\s*GO\s*(?:--.*)?$/gim).map((part) => part.trim()).filter(Boolean);
}

async function main() {
  const apply = process.argv.includes('--apply');
  const applyMetadata = process.argv.includes('--metadata');
  const env = { ...readEnv('.env'), ...readEnv('.env.uat.local'), ...process.env };
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
    connectionTimeout: 15000,
    requestTimeout: 120000,
    pool: { max: 1, min: 0, idleTimeoutMillis: 10000 },
  });

  const context = (await pool.request().query('SELECT DB_NAME() AS DatabaseName, SUSER_SNAME() AS ExecutedBy;')).recordset[0];
  if (context.DatabaseName !== 'medtest') throw new Error(`NOTI-001 chỉ chạy trên medtest; hiện tại ${context.DatabaseName}.`);

  const transaction = new sql.Transaction(pool);
  let began = false;
  try {
    await transaction.begin(sql.ISOLATION_LEVEL.SERIALIZABLE);
    began = true;
    const applied = [];
    for (const relativePath of files) {
      const source = fs.readFileSync(path.join(root, relativePath), 'utf8');
      let batchCount = 0;
      for (const batch of batches(source)) {
        await new sql.Request(transaction).batch(batch);
        batchCount += 1;
      }
      applied.push({
        file: relativePath,
        batches: batchCount,
        sha256: crypto.createHash('sha256').update(source).digest('hex'),
      });
    }

    if (applyMetadata) {
      const relativePath = 'sql/NOTI-001_API_Metadata_AI.sql';
      const source = fs.readFileSync(path.join(root, relativePath), 'utf8');
      let batchCount = 0;
      for (const batch of batches(source)) {
        await new sql.Request(transaction).batch(batch);
        batchCount += 1;
      }
      applied.push({
        file: relativePath,
        batches: batchCount,
        sha256: crypto.createHash('sha256').update(source).digest('hex'),
      });
    }

    const objects = (await new sql.Request(transaction).query(`
      SELECT name, type_desc
      FROM sys.objects
      WHERE name IN (
        'AI_NotificationTbl', 'AI_NotificationBranchScopeTbl', 'AI_NotificationUserGroupScopeTbl',
        'AI_NotificationUserScopeTbl', 'AI_NotificationReadLogTbl', 'AI_NotificationAuditLogTbl',
        'AI_ActiveNotificationByUserFnc', 'API_ThongBao_AI', 'API_ThongBao_UnreadCount_AI',
        'API_ThongBao_Admin_AI', 'AI_NotificationPushSubscriptionTbl',
        'AI_NotificationPushDeliveryTbl', 'API_ThongBao_Push_AI'
      );
    `)).recordset;
    if (objects.length !== 13) throw new Error(`Thiếu object NOTI-001 sau compile: ${objects.length}/13.`);

    if (apply) {
      await transaction.commit();
      began = false;
    } else {
      await transaction.rollback();
      began = false;
    }

    console.log(JSON.stringify({
      task: 'NOTI-001-DEPLOY',
      mode: apply ? 'DEPLOY_COMMIT' : 'PREFLIGHT_ROLLBACK',
      metadata: applyMetadata,
      status: 'PASS',
      database: context.DatabaseName,
      executedBy: context.ExecutedBy,
      objects,
      files: applied,
    }, null, 2));
  } finally {
    if (began) {
      try { await transaction.rollback(); } catch (_) {}
    }
    await pool.close();
  }
}

main().catch((error) => {
  console.error(JSON.stringify({ task: 'NOTI-001-DEPLOY', status: 'ERROR', error: error.message }, null, 2));
  process.exitCode = 1;
});
