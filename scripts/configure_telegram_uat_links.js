'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const sql = require('mssql');

const ROOT = path.resolve(__dirname, '..');
const DEFAULT_CONFIG = path.join(ROOT, 'config', 'telegram', 'uat-links.local.json');
const MIGRATIONS = [
  path.join(ROOT, 'sql', 'Migrate_Telegram_Pilot_Auth_AI.sql'),
  path.join(ROOT, 'sql', 'Migrate_Telegram_Order_Draft_AI.sql'),
  path.join(ROOT, 'sql', 'Migrate_Telegram_Notification_Dispatch_AI.sql'),
  path.join(ROOT, 'sql', 'Migrate_Telegram_Self_Link_AI.sql'),
];
const ALLOWED_ACCOUNTS = new Set([
  'QLBH013.MED', 'NAMDINHB.MED', 'QLBH016.MED', 'BACNINHA.MED',
  'QLBH005.MED', 'HUEB.MED', 'QLBH010.MED', 'DANANGA.MED',
  'QLMN2', 'CanThoA', 'QLMD1', 'BinhPhuocA', 'QLBH024.MED',
]);

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

function sqlBatches(source) {
  return source.replace(/^\uFEFF/, '')
    .split(/^\s*GO\s*(?:--.*)?$/gim)
    .map((part) => part.trim())
    .filter(Boolean);
}

function configPathFromArgs() {
  const fileIndex = process.argv.indexOf('--file');
  return fileIndex >= 0 && process.argv[fileIndex + 1]
    ? path.resolve(process.argv[fileIndex + 1])
    : DEFAULT_CONFIG;
}

function validateConfig(config) {
  if (!config || config.environment !== 'medtest' || !Array.isArray(config.links)) {
    throw new Error('Config must target medtest and contain a links array.');
  }

  const links = config.links
    .map((entry) => ({
      userName: String(entry && entry.userName || '').trim(),
      telegramUserId: String(entry && entry.telegramUserId || '').trim(),
    }))
    .filter((entry) => entry.telegramUserId);

  if (!links.length) throw new Error('No Telegram IDs configured. Fill uat-links.local.json first.');

  const seenUsers = new Set();
  const seenTelegramIds = new Set();
  for (const link of links) {
    if (!ALLOWED_ACCOUNTS.has(link.userName)) {
      throw new Error(`Account is outside the 13-account pilot allowlist: ${link.userName}`);
    }
    if (!/^\d{1,20}$/.test(link.telegramUserId)) {
      throw new Error(`Invalid Telegram user ID for ${link.userName}.`);
    }
    if (seenUsers.has(link.userName)) throw new Error(`Duplicate Medstand account: ${link.userName}`);
    if (seenTelegramIds.has(link.telegramUserId)) {
      throw new Error('One Telegram ID cannot be assigned to two accounts at the same time.');
    }
    seenUsers.add(link.userName);
    seenTelegramIds.add(link.telegramUserId);
  }
  return links;
}

async function main() {
  const apply = process.argv.includes('--apply');
  const schemaOnly = process.argv.includes('--schema-only');
  const configPath = configPathFromArgs();
  if (!schemaOnly && !fs.existsSync(configPath)) {
    throw new Error(
      `Missing local mapping file: ${configPath}. Copy config/telegram/uat-links.example.json `
      + 'to config/telegram/uat-links.local.json and fill Telegram IDs.',
    );
  }

  const links = schemaOnly
    ? []
    : validateConfig(JSON.parse(fs.readFileSync(configPath, 'utf8')));
  const env = { ...readEnvFile('.env'), ...readEnvFile('.env.uat.local'), ...process.env };
  const required = ['TEST_DB_SERVER', 'TEST_DB_DATABASE', 'TEST_DB_USER', 'TEST_DB_PASSWORD'];
  const missing = required.filter((key) => !String(env[key] || '').trim());
  if (missing.length) throw new Error(`Missing database configuration: ${missing.join(', ')}`);
  if (env.TEST_DB_DATABASE !== 'medtest') {
    throw new Error(`Telegram pilot can only target medtest; received ${env.TEST_DB_DATABASE}.`);
  }

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
  try {
    await transaction.begin(sql.ISOLATION_LEVEL.SERIALIZABLE);
    for (const migration of MIGRATIONS) {
      for (const batch of sqlBatches(fs.readFileSync(migration, 'utf8'))) {
        await new sql.Request(transaction).batch(batch);
      }
    }

    for (const link of links) {
      const request = new sql.Request(transaction);
      request.input('TelegramUserID', sql.VarChar(20), link.telegramUserId);
      request.input('TelegramChatID', sql.VarChar(20), link.telegramUserId);
      request.input('UserName', sql.VarChar(50), link.userName);
      request.input('Actor', sql.VarChar(80), apply ? 'TELEGRAM_PILOT_APPLY' : 'TELEGRAM_PILOT_PREFLIGHT');
      await request.execute('dbo.API_TelegramAccountLink_Upsert_AI');
    }

    const countResult = await new sql.Request(transaction).execute('dbo.API_TelegramPilot_Status_AI');

    if (apply) await transaction.commit();
    else await transaction.rollback();

    console.log(JSON.stringify({
      task: 'TELEGRAM-PILOT-001',
      mode: `${schemaOnly ? 'SCHEMA_ONLY' : 'LINKS'}_${apply ? 'APPLY_COMMIT' : 'PREFLIGHT_ROLLBACK'}`,
      database: env.TEST_DB_DATABASE,
      configuredLinks: links.length,
      activeLinksAfterOperation: Number(countResult.recordset[0].ActiveLinks || 0),
      mappings: links.map((link) => ({
        userName: link.userName,
        telegramIdFingerprint: crypto.createHash('sha256').update(link.telegramUserId).digest('hex').slice(0, 12),
      })),
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
  console.error(JSON.stringify({
    task: 'TELEGRAM-PILOT-001',
    status: 'ERROR',
    message: error.message,
    details: Array.isArray(error.precedingErrors)
      ? error.precedingErrors.map((entry) => entry.message).filter(Boolean)
      : [],
  }, null, 2));
  process.exitCode = 1;
});
