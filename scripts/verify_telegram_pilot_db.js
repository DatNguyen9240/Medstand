'use strict';

const fs = require('fs');
const path = require('path');
const sql = require('mssql');

const ROOT = path.resolve(__dirname, '..');

function readEnvFile(fileName) {
  const filePath = path.join(ROOT, fileName);
  const values = {};
  if (!fs.existsSync(filePath)) return values;
  for (const line of fs.readFileSync(filePath, 'utf8').replace(/^\uFEFF/, '').split(/\r?\n/)) {
    const match = line.match(/^\s*([^#=]+)=(.*)$/);
    if (!match) continue;
    values[match[1].trim()] = match[2].trim().replace(/^['"]|['"]$/g, '');
  }
  return values;
}

function firstRow(result) {
  return result && result.recordset && result.recordset[0] || {};
}

function expect(condition, message) {
  if (!condition) throw new Error(message);
}

async function main() {
  const env = { ...readEnvFile('.env'), ...readEnvFile('.env.uat.local'), ...process.env };
  const required = ['TEST_DB_SERVER', 'TEST_DB_DATABASE', 'TEST_DB_USER', 'TEST_DB_PASSWORD'];
  const missing = required.filter((key) => !String(env[key] || '').trim());
  if (missing.length) throw new Error(`Missing database configuration: ${missing.join(', ')}`);
  if (env.TEST_DB_DATABASE !== 'medtest') throw new Error('Telegram DB self-test only runs on medtest.');

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
  const checks = [];
  try {
    await transaction.begin(sql.ISOLATION_LEVEL.SERIALIZABLE);

    const status = firstRow(await new sql.Request(transaction).execute('dbo.API_TelegramPilot_Status_AI'));
    expect(Number(status.AllowedAccounts) === 13, 'Pilot allowlist must contain exactly 13 accounts.');
    checks.push('ALLOWLIST_13');

    const telegramId = '999999999999999001';
    const userName = 'QLBH013.MED';
    const link = new sql.Request(transaction);
    link.input('TelegramUserID', sql.VarChar(20), telegramId);
    link.input('TelegramChatID', sql.VarChar(20), telegramId);
    link.input('UserName', sql.VarChar(50), userName);
    link.input('Actor', sql.VarChar(80), 'TELEGRAM_PILOT_SELF_TEST');
    const linked = firstRow(await link.execute('dbo.API_TelegramAccountLink_Upsert_AI'));
    expect(linked.LinkStatus === 'LINKED' && linked.UserName === userName, 'Could not create test link.');
    checks.push('LINK_PRIVATE_CHAT');

    const groupIssue = new sql.Request(transaction);
    groupIssue.input('TelegramUserID', sql.VarChar(20), telegramId);
    groupIssue.input('TelegramChatID', sql.VarChar(20), '999999999999999002');
    groupIssue.input('TelegramUpdateID', sql.BigInt, Date.now());
    const groupResult = firstRow(await groupIssue.execute('dbo.API_TelegramAuthTicket_Issue_AI'));
    expect(groupResult.AuthStatus === 'PRIVATE_CHAT_REQUIRED', 'Group chat must be denied.');
    checks.push('GROUP_DENIED');

    const issue = new sql.Request(transaction);
    issue.input('TelegramUserID', sql.VarChar(20), telegramId);
    issue.input('TelegramChatID', sql.VarChar(20), telegramId);
    issue.input('TelegramUpdateID', sql.BigInt, Date.now() + 1);
    const issued = firstRow(await issue.execute('dbo.API_TelegramAuthTicket_Issue_AI'));
    expect(issued.AuthStatus === 'AUTHORIZED', 'Ticket issue failed.');
    expect(/^telegram_[0-9a-f]{64}$/.test(String(issued.AuthTicket || '')), 'Ticket format is invalid.');
    checks.push('TICKET_ISSUED');

    const verify = new sql.Request(transaction);
    verify.input('Ticket', sql.VarChar(100), issued.AuthTicket);
    const verified = firstRow(await verify.execute('dbo.API_TelegramAuthTicket_Verify_AI'));
    expect(verified.AuthStatus === 'AUTHENTICATED', 'Ticket verification failed.');
    expect(verified.username === userName, 'Verified identity does not match mapped account.');
    expect(
      verified.Capabilities === 'api.read,orders.draft.write',
      'Telegram ticket must grant api.read plus orders.draft.write only.',
    );
    expect(/^tg-[0-9a-f]{40}$/.test(String(verified.ServerSessionID || '')), 'Stable Telegram session ID is invalid.');
    checks.push('SCOPED_IDENTITY_CAPABILITIES_VERIFIED');

    const invalid = new sql.Request(transaction);
    invalid.input('Ticket', sql.VarChar(100), `telegram_${'0'.repeat(64)}`);
    const invalidResult = firstRow(await invalid.execute('dbo.API_TelegramAuthTicket_Verify_AI'));
    expect(invalidResult.AuthStatus === 'AUTH_TOKEN_INVALID', 'Unknown ticket must be rejected.');
    checks.push('UNKNOWN_TICKET_DENIED');

    const revoke = new sql.Request(transaction);
    revoke.input('TelegramUserID', sql.VarChar(20), telegramId);
    revoke.input('Actor', sql.VarChar(80), 'TELEGRAM_PILOT_SELF_TEST');
    const revoked = firstRow(await revoke.execute('dbo.API_TelegramAccountLink_Revoke_AI'));
    expect(revoked.LinkStatus === 'REVOKED', 'Test link could not be revoked.');

    const verifyRevoked = new sql.Request(transaction);
    verifyRevoked.input('Ticket', sql.VarChar(100), issued.AuthTicket);
    const revokedResult = firstRow(await verifyRevoked.execute('dbo.API_TelegramAuthTicket_Verify_AI'));
    expect(revokedResult.AuthStatus === 'AUTH_TOKEN_INVALID', 'Revoked link must invalidate live tickets.');
    checks.push('REVOKE_INVALIDATES_TICKET');

    await transaction.rollback();
    console.log(JSON.stringify({
      task: 'TELEGRAM-PILOT-001-DB',
      mode: 'UAT_TRANSACTION_ROLLBACK',
      database: env.TEST_DB_DATABASE,
      status: 'PASS',
      checks,
    }, null, 2));
  } catch (error) {
    try { await transaction.rollback(); } catch (_) {}
    throw error;
  } finally {
    await pool.close();
  }
}

main().catch((error) => {
  console.error(JSON.stringify({
    task: 'TELEGRAM-PILOT-001-DB',
    status: 'ERROR',
    message: error.message,
  }, null, 2));
  process.exitCode = 1;
});
