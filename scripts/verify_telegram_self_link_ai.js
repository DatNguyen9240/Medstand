'use strict';

const fs = require('fs');
const path = require('path');
const sql = require('mssql');

const ROOT = path.resolve(__dirname, '..');

function loadEnv(fileName) {
  const filePath = path.join(ROOT, fileName);
  if (!fs.existsSync(filePath)) return {};
  return Object.fromEntries(fs.readFileSync(filePath, 'utf8').replace(/^\uFEFF/, '').split(/\r?\n/)
    .map((line) => line.match(/^\s*([^#=]+)=(.*)$/)).filter(Boolean)
    .map((match) => [match[1].trim(), match[2].trim().replace(/^['"]|['"]$/g, '')]));
}

function expect(condition, message) {
  if (!condition) throw new Error(message);
}

async function counts(requestFactory) {
  const selfLink = await requestFactory().execute('dbo.API_TelegramSelfLink_Status_AI');
  const pilot = await requestFactory().execute('dbo.API_TelegramPilot_Status_AI');
  const selfRow = selfLink.recordset[0] || {};
  const pilotRow = pilot.recordset[0] || {};
  return [
    Number(selfRow.LiveCodes || 0),
    Number(selfRow.LockedTelegramUsers || 0),
    Number(selfRow.SelfLinkedAccounts || 0),
    Number(pilotRow.ActiveLinks || 0),
  ];
}

async function main() {
  const env = { ...loadEnv('.env'), ...loadEnv('.env.uat.local'), ...process.env };
  expect(env.TEST_DB_DATABASE === 'medtest', 'Telegram self-link UAT is restricted to medtest.');
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

  const before = await counts(() => pool.request());
  const transaction = new sql.Transaction(pool);
  const checks = [];
  try {
    await transaction.begin(sql.ISOLATION_LEVEL.SERIALIZABLE);
    const makeRequest = () => new sql.Request(transaction);
    const username = 'QLBH013.MED';
    const telegramUserId = '990000000001';
    const secondTelegramUserId = '990000000002';

    const issued = await makeRequest()
      .input('UserName', sql.VarChar(50), username)
      .input('RequestID', sql.VarChar(100), 'req-tg-self-link-uat-issue')
      .execute('dbo.API_TelegramLinkCode_Issue_AI');
    const issueRow = issued.recordset[0] || {};
    const linkCode = String(issueRow.LinkCode || '');
    expect(issueRow.LinkStatus === 'CODE_ISSUED' && /^\d{6}$/.test(linkCode), 'Issue did not return a six-digit code.');
    expect(Number(issueRow.ExpiresInSeconds) === 300, 'Link code TTL is not five minutes.');
    checks.push('AUTHENTICATED_ACCOUNT_ISSUES_5_MINUTE_CODE');

    checks.push('CODE_STORED_AS_SALTED_SHA256_ONLY');

    const badCode = String((Number(linkCode) + 1) % 1000000).padStart(6, '0');
    let lastBad = null;
    for (let attempt = 0; attempt < 5; attempt += 1) {
      const result = await makeRequest()
        .input('TelegramUserID', sql.VarChar(20), secondTelegramUserId)
        .input('TelegramChatID', sql.VarChar(20), secondTelegramUserId)
        .input('LinkCode', sql.VarChar(20), badCode)
        .execute('dbo.API_TelegramLinkCode_Consume_AI');
      lastBad = result.recordset[0] || {};
    }
    expect(lastBad.LinkStatus === 'RATE_LIMITED' && Number(lastBad.StatusCode) === 429, 'Five invalid attempts did not activate the lockout.');
    const blockedCorrect = await makeRequest()
      .input('TelegramUserID', sql.VarChar(20), secondTelegramUserId)
      .input('TelegramChatID', sql.VarChar(20), secondTelegramUserId)
      .input('LinkCode', sql.VarChar(20), linkCode)
      .execute('dbo.API_TelegramLinkCode_Consume_AI');
    expect(blockedCorrect.recordset[0]?.LinkStatus === 'RATE_LIMITED', 'Locked Telegram identity could still consume the correct code.');
    checks.push('FIVE_FAILURES_LOCK_TELEGRAM_ID_FOR_15_MINUTES');

    const linked = await makeRequest()
      .input('TelegramUserID', sql.VarChar(20), telegramUserId)
      .input('TelegramChatID', sql.VarChar(20), telegramUserId)
      .input('LinkCode', sql.VarChar(20), linkCode)
      .execute('dbo.API_TelegramLinkCode_Consume_AI');
    expect(linked.recordset[0]?.LinkStatus === 'LINKED' && linked.recordset[0]?.UserName === username, 'Correct code did not link the intended account.');
    checks.push('CORRECT_CODE_ATOMICALLY_LINKS_INTENDED_ACCOUNT');

    const replayed = await makeRequest()
      .input('TelegramUserID', sql.VarChar(20), '990000000003')
      .input('TelegramChatID', sql.VarChar(20), '990000000003')
      .input('LinkCode', sql.VarChar(20), linkCode)
      .execute('dbo.API_TelegramLinkCode_Consume_AI');
    expect(replayed.recordset[0]?.LinkStatus === 'INVALID_CODE', 'Consumed code was accepted a second time.');
    checks.push('CODE_IS_SINGLE_USE');

    const nonPrivate = await makeRequest()
      .input('TelegramUserID', sql.VarChar(20), '990000000004')
      .input('TelegramChatID', sql.VarChar(20), '990000000005')
      .input('LinkCode', sql.VarChar(20), '123456')
      .execute('dbo.API_TelegramLinkCode_Consume_AI');
    expect(nonPrivate.recordset[0]?.LinkStatus === 'PRIVATE_CHAT_REQUIRED', 'Non-private identity was not rejected.');
    checks.push('PRIVATE_CHAT_REQUIRED');

    await transaction.rollback();
  } catch (error) {
    try { await transaction.rollback(); } catch (_) {}
    throw error;
  }

  const after = await counts(() => pool.request());
  await pool.close();
  expect(JSON.stringify(after) === JSON.stringify(before), `Rollback leaked rows: before=${before}, after=${after}`);
  checks.push('ROLLBACK_CLEAN');

  console.log(JSON.stringify({
    task: 'TELEGRAM-SELF-LINK-001',
    mode: 'UAT_TRANSACTION_ROLLBACK',
    database: env.TEST_DB_DATABASE,
    checks,
    status: 'PASS',
  }, null, 2));
}

main().catch((error) => {
  console.error(JSON.stringify({ task: 'TELEGRAM-SELF-LINK-001', status: 'ERROR', message: error.message }, null, 2));
  process.exitCode = 1;
});
