'use strict';

const fs = require('fs');
const path = require('path');
const sql = require('mssql');

const ROOT = path.resolve(__dirname, '..');

function loadEnv(fileName) {
  const filePath = path.join(ROOT, fileName);
  if (!fs.existsSync(filePath)) return {};
  return Object.fromEntries(fs.readFileSync(filePath, 'utf8').replace(/^\uFEFF/, '').split(/\r?\n/)
    .map((line) => line.match(/^\s*([^#=]+)=(.*)$/))
    .filter(Boolean)
    .map((match) => [match[1].trim(), match[2].trim().replace(/^['"]|['"]$/g, '')]));
}

const wait = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

async function main() {
  if (!process.argv.includes('--apply')) throw new Error('Smoke notification requires explicit --apply.');
  const env = { ...loadEnv('.env'), ...loadEnv('.env.uat.local'), ...process.env };
  if (env.TEST_DB_DATABASE !== 'medtest') throw new Error('Smoke notification is restricted to medtest.');
  const configPath = path.join(ROOT, 'config', 'telegram', 'uat-links.local.json');
  if (!fs.existsSync(configPath)) throw new Error('Local Telegram mapping is unavailable.');
  const links = JSON.parse(fs.readFileSync(configPath, 'utf8')).links || [];
  const configured = links.find((entry) => entry.userName === 'QLBH013.MED' && /^\d{1,20}$/.test(String(entry.telegramUserId || '')))
    || links.find((entry) => /^\d{1,20}$/.test(String(entry.telegramUserId || '')));
  if (!configured) throw new Error('No Telegram ID is configured for smoke.');

  const pool = await sql.connect({
    server: env.TEST_DB_SERVER,
    port: Number(env.TEST_DB_PORT || 1433),
    database: env.TEST_DB_DATABASE,
    user: env.TEST_DB_USER,
    password: env.TEST_DB_PASSWORD,
    options: { encrypt: false, trustServerCertificate: true },
    connectionTimeout: 15000,
    requestTimeout: 30000,
    pool: { max: 1, min: 0, idleTimeoutMillis: 10000 },
  });

  try {
    const inserted = await pool.request()
      .input('Username', sql.VarChar(100), configured.userName)
      .query(`
        DECLARE @Now DATETIME2(0)=SYSUTCDATETIME();
        DECLARE @Created TABLE(NotificationID BIGINT);
        INSERT dbo.AI_NotificationTbl
          (Title,Summary,Body,NotificationType,Priority,EffectiveFromUtc,EffectiveToUtc,
           BranchScopeMode,UserGroupScopeMode,UserScopeMode,Status,
           CreatedBy,UpdatedBy,ApprovedBy,ApprovedAtUtc)
        OUTPUT inserted.NotificationID INTO @Created(NotificationID)
        VALUES
          (N'Thông báo Telegram đã sẵn sàng',
           N'Đây là thông báo kiểm tra từ Medstand. Các thông báo mới sẽ được gửi tự động tới đúng tài khoản Telegram.',
           N'Luồng Telegram Notification Dispatch đã được bật và kiểm tra thành công.',
           'SYSTEM',1,DATEADD(SECOND,-5,@Now),DATEADD(DAY,1,@Now),
           'ALL','ALL','SELECTED','APPROVED',
           'TELEGRAM_NOTIFICATION_SMOKE','TELEGRAM_NOTIFICATION_SMOKE','TELEGRAM_NOTIFICATION_SMOKE',@Now);
        INSERT dbo.AI_NotificationUserScopeTbl(NotificationID,UserName)
          SELECT NotificationID,@Username FROM @Created;
        SELECT NotificationID FROM @Created;`);
    const notificationId = Number(inserted.recordset[0]?.NotificationID || 0);
    if (!notificationId) throw new Error('Could not create smoke notification.');

    let status = null;
    for (let attempt = 0; attempt < 18; attempt += 1) {
      await wait(5000);
      const result = await pool.request().input('NotificationID', sql.BigInt, notificationId)
        .execute('dbo.API_TelegramNotification_Status_AI');
      status = result.recordset[0] || null;
      if (Number(status?.SentCount || 0) >= 1 || Number(status?.FailedCount || 0) >= 1) break;
    }

    if (Number(status?.SentCount || 0) < 1) {
      throw new Error(`Smoke notification was not delivered: ${JSON.stringify(status)}`);
    }
    console.log(JSON.stringify({
      task: 'TELEGRAM-NOTIFICATION-SMOKE',
      database: env.TEST_DB_DATABASE,
      notificationId,
      sent: Number(status.SentCount || 0),
      failed: Number(status.FailedCount || 0),
      status: 'PASS',
    }, null, 2));
  } finally {
    await pool.close();
  }
}

main().catch((error) => {
  console.error(JSON.stringify({ task: 'TELEGRAM-NOTIFICATION-SMOKE', status: 'ERROR', message: error.message }, null, 2));
  process.exitCode = 1;
});
