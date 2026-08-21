'use strict';

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const sql = require('mssql');
const webpush = require('web-push');

const root = path.resolve(__dirname, '..');

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

function required(env, name) {
  const value = String(env[name] || '').trim();
  if (!value) throw new Error(`Thiếu cấu hình ${name}.`);
  return value;
}

function decryptSubscription(cipherBytes, keySource) {
  const payload = Buffer.from(cipherBytes);
  if (payload.length < 29) throw new Error('SubscriptionCipher không hợp lệ.');
  const key = crypto.createHash('sha256').update(keySource).digest();
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, payload.subarray(0, 12));
  decipher.setAuthTag(payload.subarray(12, 28));
  return JSON.parse(Buffer.concat([decipher.update(payload.subarray(28)), decipher.final()]).toString('utf8'));
}

async function updateDelivery(pool, row, status, statusCode, errorMessage) {
  await pool.request()
    .input('NotificationID', sql.BigInt, row.NotificationID)
    .input('PushSubscriptionID', sql.BigInt, row.PushSubscriptionID)
    .input('Status', sql.VarChar(20), status)
    .input('StatusCode', sql.Int, statusCode || null)
    .input('LastError', sql.NVarChar(500), errorMessage ? String(errorMessage).slice(0, 500) : null)
    .query(`
      UPDATE dbo.AI_NotificationPushDeliveryTbl
      SET Status=@Status, AttemptCount=AttemptCount+1, LastAttemptAtUtc=SYSUTCDATETIME(),
          DeliveredAtUtc=CASE WHEN @Status='SENT' THEN SYSUTCDATETIME() ELSE DeliveredAtUtc END,
          LastStatusCode=@StatusCode, LastError=@LastError
      WHERE NotificationID=@NotificationID AND PushSubscriptionID=@PushSubscriptionID;
    `);
}

async function main() {
  const env = { ...readEnv('.env'), ...process.env };
  const keySource = String(env.NOTIFICATION_PUSH_ENCRYPTION_KEY || env.N8N_ENCRYPTION_KEY || '').trim();
  if (keySource.length < 32) throw new Error('Thiếu NOTIFICATION_PUSH_ENCRYPTION_KEY tối thiểu 32 ký tự.');

  webpush.setVapidDetails(required(env, 'WEB_PUSH_SUBJECT'), required(env, 'WEB_PUSH_VAPID_PUBLIC_KEY'),
    required(env, 'WEB_PUSH_VAPID_PRIVATE_KEY'));

  const pool = await sql.connect({
    server: required(env, 'MSSQL_SERVER'),
    port: Number(env.MSSQL_PORT || 1433),
    database: required(env, 'MSSQL_DATABASE'),
    user: required(env, 'MSSQL_USER'),
    password: required(env, 'MSSQL_PASSWORD'),
    options: {
      encrypt: String(env.MSSQL_TLS || 'true').toLowerCase() !== 'false',
      trustServerCertificate: String(env.MSSQL_ALLOW_UNAUTHORIZED_CERTS || 'false').toLowerCase() === 'true'
    },
    connectionTimeout: Number(env.MSSQL_CONNECT_TIMEOUT || 15000),
    requestTimeout: Number(env.MSSQL_REQUEST_TIMEOUT || 30000),
    pool: { max: 3, min: 0, idleTimeoutMillis: 10000 }
  });

  try {
    await pool.request().query(`
      INSERT dbo.AI_NotificationPushDeliveryTbl (NotificationID, PushSubscriptionID)
      SELECT N.NotificationID, P.PushSubscriptionID
      FROM dbo.AI_NotificationPushSubscriptionTbl P
      CROSS APPLY dbo.AI_ActiveNotificationByUserFnc(P.UserName, SYSUTCDATETIME()) N
      WHERE P.IsActive=1 AND N.IsView=0
        AND NOT EXISTS (SELECT 1 FROM dbo.AI_NotificationPushDeliveryTbl D
                        WHERE D.NotificationID=N.NotificationID AND D.PushSubscriptionID=P.PushSubscriptionID);
    `);

    const rows = (await pool.request().query(`
      SELECT TOP (100) D.NotificationID, D.PushSubscriptionID, P.SubscriptionCipher,
             N.Title, N.Summary, N.ActionUrl
      FROM dbo.AI_NotificationPushDeliveryTbl D
      JOIN dbo.AI_NotificationPushSubscriptionTbl P ON P.PushSubscriptionID=D.PushSubscriptionID
      JOIN dbo.AI_NotificationTbl N ON N.NotificationID=D.NotificationID
      WHERE P.IsActive=1 AND D.Status IN ('PENDING','FAILED') AND D.AttemptCount < 3
        AND (D.LastAttemptAtUtc IS NULL OR D.LastAttemptAtUtc < DATEADD(MINUTE,-5,SYSUTCDATETIME()))
      ORDER BY N.Priority, N.EffectiveFromUtc, D.NotificationID;
    `)).recordset;

    let sent = 0;
    let failed = 0;
    let revoked = 0;
    for (const row of rows) {
      try {
        const subscription = decryptSubscription(row.SubscriptionCipher, keySource);
        const result = await webpush.sendNotification(subscription, JSON.stringify({
          notificationId: String(row.NotificationID),
          title: String(row.Title || 'Thông báo Medstand').slice(0, 120),
          summary: String(row.Summary || '').slice(0, 240),
          actionUrl: String(row.ActionUrl || '/#/notifications')
        }), { TTL: 300, urgency: 'high' });
        await updateDelivery(pool, row, 'SENT', result.statusCode, null);
        sent += 1;
      } catch (error) {
        const statusCode = Number(error.statusCode) || null;
        if ([404, 410].includes(statusCode)) {
          await updateDelivery(pool, row, 'REVOKED', statusCode, error.message);
          await pool.request().input('ID', sql.BigInt, row.PushSubscriptionID).query(`
            UPDATE dbo.AI_NotificationPushSubscriptionTbl
            SET IsActive=0, RevokedAtUtc=SYSUTCDATETIME(), UpdatedAtUtc=SYSUTCDATETIME()
            WHERE PushSubscriptionID=@ID;
          `);
          revoked += 1;
        } else {
          await updateDelivery(pool, row, 'FAILED', statusCode, error.message);
          failed += 1;
        }
      }
    }

    console.log(JSON.stringify({ task: 'NOTI-001-PUSH', status: 'PASS', candidates: rows.length, sent, failed, revoked }));
  } finally {
    await pool.close();
  }
}

main().catch((error) => {
  console.error(JSON.stringify({ task: 'NOTI-001-PUSH', status: 'ERROR', error: error.message }));
  process.exitCode = 1;
});
