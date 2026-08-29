'use strict';

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const sql = require('mssql');
const sqlite3 = require('sqlite3');

const ROOT = path.resolve(__dirname, '..');
const WORKFLOW_ID = 'medstandTelegramChatbotDemo';
const SQLITE_PATH = path.join(ROOT, 'n8n-system', 'n8n_data', '.n8n', 'database.sqlite');
const wait = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

function loadEnv(fileName) {
  const filePath = path.join(ROOT, fileName);
  if (!fs.existsSync(filePath)) return {};
  return Object.fromEntries(fs.readFileSync(filePath, 'utf8').replace(/^\uFEFF/, '').split(/\r?\n/)
    .map((line) => line.match(/^\s*([^#=]+)=(.*)$/))
    .filter(Boolean)
    .map((match) => [match[1].trim(), match[2].trim().replace(/^['"]|['"]$/g, '')]));
}

function assertLoopbackUrl(raw) {
  const url = new URL(raw);
  if (url.protocol !== 'http:' || !['127.0.0.1', 'localhost', '::1'].includes(url.hostname.toLowerCase())) {
    throw new Error('Telegram smoke ingest must use HTTP on localhost only.');
  }
  return url.toString();
}

function openDatabase(filePath) {
  return new Promise((resolve, reject) => {
    const db = new sqlite3.Database(filePath, sqlite3.OPEN_READONLY, (error) => {
      if (error) reject(error);
      else resolve(db);
    });
  });
}

function get(db, statement, params = []) {
  return new Promise((resolve, reject) => {
    db.get(statement, params, (error, row) => {
      if (error) reject(error);
      else resolve(row || null);
    });
  });
}

function closeDatabase(db) {
  return new Promise((resolve, reject) => db.close((error) => (error ? reject(error) : resolve())));
}

async function request(url, options, timeoutMs = 15000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, { ...options, signal: controller.signal });
    await response.text();
    if (!response.ok) throw new Error(`Local ingest returned HTTP ${response.status}.`);
  } finally {
    clearTimeout(timer);
  }
}

async function latestExecution(db) {
  const row = await get(db, `
    SELECT CAST(id AS INTEGER) AS id, status, stoppedAt
    FROM execution_entity
    WHERE workflowId = ?
    ORDER BY CAST(id AS INTEGER) DESC
    LIMIT 1`, [WORKFLOW_ID]);
  return row || { id: 0, status: null, stoppedAt: null };
}

async function waitForExecution(db, afterId, timeoutMs = 45000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const row = await get(db, `
      SELECT CAST(id AS INTEGER) AS id, status, stoppedAt
      FROM execution_entity
      WHERE workflowId = ? AND CAST(id AS INTEGER) > ?
      ORDER BY CAST(id AS INTEGER) DESC
      LIMIT 1`, [WORKFLOW_ID, afterId]);
    if (row && ['success', 'error', 'canceled', 'crashed'].includes(String(row.status || '').toLowerCase())) return row;
    await wait(1000);
  }
  throw new Error('Timed out while waiting for the n8n chatbot execution.');
}

function decodeExecutionData(raw) {
  const values = JSON.parse(raw);
  const memo = new Map();
  const resolve = (value) => {
    if (typeof value === 'string' && /^\d+$/.test(value) && Number(value) < values.length) return resolveIndex(Number(value));
    if (Array.isArray(value)) return value.map(resolve);
    if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([key, child]) => [key, resolve(child)]));
    return value;
  };
  const resolveIndex = (index) => {
    if (memo.has(index)) return memo.get(index);
    const value = values[index];
    const output = Array.isArray(value) ? [] : (value && typeof value === 'object' ? {} : value);
    memo.set(index, output);
    if (Array.isArray(value)) value.forEach((child) => output.push(resolve(child)));
    else if (value && typeof value === 'object') Object.entries(value).forEach(([key, child]) => { output[key] = resolve(child); });
    return output;
  };
  return resolveIndex(0);
}

function firstNodeJson(runData, nodeName) {
  try { return runData[nodeName][0].data.main[0][0].json || null; } catch (_) { return null; }
}

async function executionEvidence(db, executionId) {
  const row = await get(db, 'SELECT data FROM execution_data WHERE executionId = ?', [executionId]);
  if (!row?.data) throw new Error(`Execution ${executionId} has no saved data.`);
  const runData = decodeExecutionData(row.data)?.resultData?.runData || {};
  const normalized = firstNodeJson(runData, 'Normalize Telegram Update') || {};
  const main = firstNodeJson(runData, 'Call MAIN ChatBot') || {};
  const formatted = firstNodeJson(runData, 'Split Telegram Message') || {};
  const draft = firstNodeJson(runData, 'Format Draft Order Reply') || {};
  const telegram = firstNodeJson(runData, 'Send Draft Order Preview') || firstNodeJson(runData, 'Send Telegram Reply') || {};
  return {
    normalizedText: String(normalized.text || ''),
    apiCode: String(main.ApiCode || ''),
    businessStatus: String(main.status || (draft.actionMode === 'DRAFT_PREVIEW' ? 'PREVIEW' : 'LOCAL')),
    replyText: String(formatted.text || ''),
    draftButtons: Boolean(formatted.showDraftButtons),
    telegramAccepted: telegram.ok === true,
  };
}

async function resolveOrderablePair(env, userName) {
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
    const customers = (await pool.request()
      .input('Username', sql.VarChar(50), userName)
      .query(`SELECT TOP (20) O.ObjectID
              FROM dbo.AR_GetObjectByUserFnc(@Username) S
              JOIN dbo.CF_ObjectTbl O ON O.ObjectID=S.ObjectID
              WHERE COALESCE(O.Phone,'')<>'' ORDER BY O.ObjectID;`)).recordset;
    for (const customer of customers || []) {
      const catalog = await pool.request()
        .input('Username', sql.VarChar(50), userName)
        .input('ObjectID', sql.VarChar(50), customer.ObjectID)
        .execute('dbo.API_HangHoaList_AI');
      const product = (catalog.recordset || []).find((row) => row.ItemID && Number(row.UnitPrice) > 0 && Number(row.AvailableStock) >= 1);
      if (product) return { customerId: String(customer.ObjectID), itemId: String(product.ItemID) };
    }
    throw new Error('No orderable customer/product pair was found for draft preview.');
  } finally {
    await pool.close();
  }
}

async function main() {
  if (!process.argv.includes('--apply')) throw new Error('Live Telegram query smoke requires explicit --apply.');
  const env = { ...loadEnv('.env'), ...loadEnv('.env.uat.local'), ...process.env };
  if (env.TEST_DB_DATABASE !== 'medtest') throw new Error('Live Telegram query smoke is restricted to medtest.');
  const token = String(env.TELEGRAM_CHATBOT_BOT_TOKEN || '').trim();
  if (!token) throw new Error('TELEGRAM_CHATBOT_BOT_TOKEN is missing.');
  const ingestUrl = assertLoopbackUrl(env.TELEGRAM_POLL_N8N_URL || 'http://127.0.0.1:5678/webhook/telegram-poll-ingest');

  const configPath = path.join(ROOT, 'config', 'telegram', 'uat-links.local.json');
  if (!fs.existsSync(configPath)) throw new Error('Local Telegram mapping is unavailable.');
  const links = JSON.parse(fs.readFileSync(configPath, 'utf8')).links || [];
  const configured = links.find((entry) => entry.userName === 'QLBH013.MED' && /^\d{1,20}$/.test(String(entry.telegramUserId || '')))
    || links.find((entry) => /^\d{1,20}$/.test(String(entry.telegramUserId || '')));
  if (!configured) throw new Error('No Telegram ID is configured for smoke.');
  const telegramId = Number(configured.telegramUserId);
  if (!Number.isSafeInteger(telegramId) || telegramId <= 0) throw new Error('Configured Telegram ID is not a safe numeric identifier.');
  if (!fs.existsSync(SQLITE_PATH)) throw new Error('n8n execution database is unavailable.');

  const allCases = [
    { name: 'IDENTITY', text: '/whoami', expectedApiCode: '' },
    { name: 'SALES_TODAY', text: 'Hôm nay tôi bán được bao nhiêu?', expectedApiCode: '@doanh_so' },
    { name: 'ROUTE_TODAY', text: 'Hôm nay tôi nên ghé khách hàng nào?', expectedApiCode: '@tuyen_ban_hang' },
    { name: 'INVENTORY', text: 'A003 còn bao nhiêu hàng trong kho?', expectedApiCode: '@danh_sach_tonkho' },
    { name: 'UNREAD_NOTIFICATIONS', text: 'Cho tôi xem tin mới chưa đọc', expectedApiCode: '@thong_bao' },
    { name: 'CUSTOMER_DEBT', text: 'NDB001 còn nợ bao nhiêu?', expectedApiCode: '@cong_no_chi_tiet' },
    { name: 'DRAFT_PREVIEW', text: '/draft NDB001 | A003x1', expectedApiCode: '' },
  ];
  const requestedCase = process.argv.find((argument) => argument.startsWith('--case='))?.slice('--case='.length).trim().toUpperCase();
  if (!requestedCase || requestedCase === 'DRAFT_PREVIEW') {
    const pair = await resolveOrderablePair(env, configured.userName);
    allCases.find((testCase) => testCase.name === 'DRAFT_PREVIEW').text = `/draft ${pair.customerId} | ${pair.itemId}x1`;
  }
  const cases = requestedCase ? allCases.filter((testCase) => testCase.name === requestedCase) : allCases;
  if (!cases.length) throw new Error(`Unknown smoke case: ${requestedCase}`);
  const localKey = crypto.createHash('sha256').update(token, 'utf8').digest('hex');
  const db = await openDatabase(SQLITE_PATH);
  const checks = [];

  try {
    for (let index = 0; index < cases.length; index += 1) {
      const testCase = cases[index];
      const before = await latestExecution(db);
      const updateId = Number(`${Date.now()}`.slice(-11)) * 10 + index;
      const update = {
        update_id: updateId,
        message: {
          message_id: 900000 + index,
          date: Math.floor(Date.now() / 1000),
          chat: { id: telegramId, type: 'private' },
          from: { id: telegramId, is_bot: false, first_name: 'UAT' },
          text: testCase.text,
        },
      };
      await request(ingestUrl, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-medstand-telegram-poller-key': localKey,
        },
        body: JSON.stringify(update),
      });
      const execution = await waitForExecution(db, Number(before.id || 0));
      const status = String(execution.status || '').toLowerCase();
      if (status !== 'success') throw new Error(`${testCase.name} execution ended with ${status || 'unknown status'}.`);
      const evidence = await executionEvidence(db, execution.id);
      if (testCase.expectedApiCode && evidence.apiCode !== testCase.expectedApiCode) {
        throw new Error(`${testCase.name} routed to ${evidence.apiCode || 'no API'} instead of ${testCase.expectedApiCode}.`);
      }
      if (!evidence.telegramAccepted) throw new Error(`${testCase.name} did not receive Telegram acceptance.`);
      if (/\b(?:CustomerID|CustomerName|TenCuaHang|LanMuaCuoiDate|NotificationID|ObjectType):/i.test(evidence.replyText)) {
        throw new Error(`${testCase.name} exposed a technical field label.`);
      }
      if (testCase.name === 'CUSTOMER_DEBT'
          && (!evidence.replyText.includes('Ngày công nợ:')
            || !evidence.replyText.includes('Loại khoản:')
            || !evidence.replyText.includes('Còn nợ:'))) {
        throw new Error('CUSTOMER_DEBT does not distinguish separate debt items.');
      }
      if (testCase.name === 'DRAFT_PREVIEW' && !evidence.draftButtons) {
        throw new Error('DRAFT_PREVIEW did not return confirmation buttons.');
      }
      checks.push({
        case: testCase.name,
        executionStatus: status,
        apiCode: evidence.apiCode || 'LOCAL',
        businessStatus: evidence.businessStatus,
        formatting: 'PASS',
      });
      await wait(1500);
    }

    console.log(JSON.stringify({
      task: 'TELEGRAM-CHATBOT-LIVE-QUERY-SMOKE',
      mode: 'LOCAL_AUTHENTICATED_INGEST_WITH_LIVE_TELEGRAM_REPLIES',
      cases: checks,
      status: 'PASS',
    }, null, 2));
  } finally {
    await closeDatabase(db);
  }
}

main().catch((error) => {
  console.error(JSON.stringify({
    task: 'TELEGRAM-CHATBOT-LIVE-QUERY-SMOKE',
    status: 'ERROR',
    message: error.message,
  }, null, 2));
  process.exitCode = 1;
});
