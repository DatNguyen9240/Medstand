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

function expect(condition, message) {
  if (!condition) throw new Error(message);
}

async function main() {
  const env = { ...loadEnv('.env'), ...loadEnv('.env.uat.local'), ...process.env };
  expect(env.TEST_DB_DATABASE === 'medtest', 'Telegram notification UAT is restricted to medtest.');
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
  let notificationId = 0;
  try {
    await transaction.begin(sql.ISOLATION_LEVEL.READ_COMMITTED);

    const configPath = path.join(ROOT, 'config', 'telegram', 'uat-links.local.json');
    expect(fs.existsSync(configPath), 'Local Telegram UAT mapping is unavailable.');
    const configuredLinks = JSON.parse(fs.readFileSync(configPath, 'utf8')).links || [];
    const configured = configuredLinks.find((entry) => entry.userName === 'QLBH013.MED' && /^\d{1,20}$/.test(String(entry.telegramUserId || '')))
      || configuredLinks.find((entry) => /^\d{1,20}$/.test(String(entry.telegramUserId || '')));
    expect(configured, 'No Telegram ID is configured for notification UAT.');

    const issued = await new sql.Request(transaction)
      .input('TelegramUserID', sql.VarChar(20), configured.telegramUserId)
      .input('TelegramChatID', sql.VarChar(20), configured.telegramUserId)
      .input('TelegramUpdateID', sql.BigInt, Date.now())
      .execute('dbo.API_TelegramAuthTicket_Issue_AI');
    const identity = issued.recordset[0];
    expect(identity?.AuthStatus === 'AUTHORIZED', 'Configured Telegram mapping is not active.');
    const username = String(identity.UserName);

    const inserted = await new sql.Request(transaction)
      .input('Username', sql.VarChar(100), username)
      .query(`
        DECLARE @Now DATETIME2(0)=SYSUTCDATETIME();
        DECLARE @Created TABLE(NotificationID BIGINT);
        INSERT dbo.AI_NotificationTbl
          (Title,Summary,Body,NotificationType,Priority,EffectiveFromUtc,EffectiveToUtc,
           BranchScopeMode,UserGroupScopeMode,UserScopeMode,Status,
           CreatedBy,UpdatedBy,ApprovedBy,ApprovedAtUtc)
        OUTPUT inserted.NotificationID INTO @Created(NotificationID)
        VALUES
          (N'TELEGRAM_NOTIFICATION_UAT',N'Bản tin UAT không gửi thật',N'Kiểm tra dispatcher Telegram',
           'URGENT',1,DATEADD(MINUTE,-1,@Now),DATEADD(HOUR,1,@Now),
           'ALL','ALL','SELECTED','APPROVED','TELEGRAM_NOTIFICATION_UAT',
           'TELEGRAM_NOTIFICATION_UAT','TELEGRAM_NOTIFICATION_UAT',@Now);
        INSERT dbo.AI_NotificationUserScopeTbl(NotificationID,UserName)
          SELECT NotificationID,@Username FROM @Created;
        SELECT NotificationID FROM @Created;`);
    notificationId = Number(inserted.recordset[0]?.NotificationID || 0);
    expect(notificationId > 0, 'Could not create notification fixture.');

    let fixtureClaims = [];
    for (let attempt = 0; attempt < 10 && !fixtureClaims.length; attempt += 1) {
      const claim = await new sql.Request(transaction)
        .input('BatchSize', sql.Int, 50)
        .execute('dbo.API_TelegramNotification_Claim_AI');
      fixtureClaims = (claim.recordset || []).filter((row) => Number(row.NotificationID) === notificationId);
    }
    expect(fixtureClaims.length === 1, 'Fixture was not claimed exactly once.');
    const claimed = fixtureClaims[0];
    expect(String(claimed.TelegramUserID) === String(configured.telegramUserId), 'Notification escaped its Telegram user scope.');
    expect(Number(claimed.ContentVersion) === 1 && Number(claimed.AttemptCount) === 1, 'Claim version or attempt count mismatch.');

    const completed = await new sql.Request(transaction)
      .input('NotificationID', sql.BigInt, notificationId)
      .input('TelegramUserID', sql.VarChar(20), configured.telegramUserId)
      .input('ContentVersion', sql.Int, 1)
      .input('Succeeded', sql.Bit, true)
      .input('TelegramMessageID', sql.VarChar(50), 'uat-message-id')
      .input('LastError', sql.NVarChar(500), null)
      .execute('dbo.API_TelegramNotification_Complete_AI');
    expect(Number(completed.recordset[0]?.UpdatedRows) === 1 && completed.recordset[0]?.DeliveryStatus === 'SENT', 'Completion did not mark delivery SENT.');

    let duplicateClaimed = false;
    for (let attempt = 0; attempt < 3; attempt += 1) {
      const next = await new sql.Request(transaction)
        .input('BatchSize', sql.Int, 50)
        .execute('dbo.API_TelegramNotification_Claim_AI');
      if ((next.recordset || []).some((row) => Number(row.NotificationID) === notificationId)) duplicateClaimed = true;
    }
    expect(!duplicateClaimed, 'SENT notification was claimed again.');

    const unread = await new sql.Request(transaction)
      .input('Username', sql.VarChar(100), username)
      .input('NotificationID', sql.BigInt, notificationId)
      .query(`SELECT IsView FROM dbo.AI_ActiveNotificationByUserFnc(@Username,SYSUTCDATETIME())
              WHERE NotificationID=@NotificationID;`);
    expect(unread.recordset.length === 1 && !Boolean(unread.recordset[0].IsView), 'Telegram delivery must not mark notification as read.');

    await transaction.rollback();
    const remaining = await pool.request().input('NotificationID', sql.BigInt, notificationId)
      .query('SELECT COUNT_BIG(*) Total FROM dbo.AI_NotificationTbl WHERE NotificationID=@NotificationID;');
    expect(Number(remaining.recordset[0].Total) === 0, 'Rollback left the notification fixture behind.');

    console.log(JSON.stringify({
      task: 'TELEGRAM-NOTIFICATION-001',
      mode: 'UAT_TRANSACTION_ROLLBACK',
      database: env.TEST_DB_DATABASE,
      checks: [
        'APPROVED_ACTIVE_USER_SCOPE',
        'CLAIM_EXACTLY_ONCE_PER_CONTENT_VERSION',
        'DELIVERY_COMPLETION_SENT',
        'SENT_NOT_RECLAIMED',
        'PUSH_DOES_NOT_MARK_READ',
        'ROLLBACK_CLEAN',
      ],
      status: 'PASS',
    }, null, 2));
  } catch (error) {
    try { await transaction.rollback(); } catch (_) {}
    throw error;
  } finally {
    await pool.close();
  }
}

main().catch((error) => {
  console.error(JSON.stringify({ task: 'TELEGRAM-NOTIFICATION-001', status: 'ERROR', message: error.message }, null, 2));
  process.exitCode = 1;
});
