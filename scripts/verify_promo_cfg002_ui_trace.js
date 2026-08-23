'use strict';

/* PROMO-CFG-002 — UI REJECT/WITHDRAW with Gateway request-ID and SQL audit correlation.
 * Programs created by this verifier are deleted in finally after assertions. */

const assert = require('assert');
const fs = require('fs');
const http = require('http');
const path = require('path');
const { spawn } = require('child_process');
const puppeteer = require('puppeteer-core');
const sql = require('mssql');
const { getRequiredUatPassword } = require('./lib/uat-test-config');

const ROOT = path.resolve(__dirname, '..');
const PORT = Number(process.env.PROMO_CFG002_UI_PORT || 3414);
const BASE_URL = `http://127.0.0.1:${PORT}`;
const USERNAME = process.env.APP_USER || 'demo';
const PASSWORD = getRequiredUatPassword(['PROMO_CFG002_PASSWORD']);
const CHROME_PATH = process.env.CHROME_PATH || 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const TOKEN = Date.now().toString(36).toUpperCase();
const MARKER = `PROMO-CFG-002-TRACE-${TOKEN}`;

function envValues() {
  const values = {};
  for (const file of ['.env', '.env.uat.local']) {
    const fullPath = path.join(ROOT, file);
    if (!fs.existsSync(fullPath)) continue;
    for (const line of fs.readFileSync(fullPath, 'utf8').split(/\r?\n/)) {
      const match = line.match(/^\s*([^#=]+)=(.*)$/);
      if (match) values[match[1].trim()] = match[2].trim().replace(/^['"]|['"]$/g, '');
    }
  }
  return { ...values, ...process.env };
}

function decrypt(value, key = 107) {
  const xor = Buffer.from(String(value || ''), 'base64').toString('latin1');
  let base64 = '';
  for (let i = 0; i < xor.length; i += 1) base64 += String.fromCharCode(xor.charCodeAt(i) ^ key);
  return Buffer.from(base64, 'base64').toString('utf8');
}

function decodedRequest(request) {
  try {
    const envelope = JSON.parse(request.postData() || '{}');
    return envelope.data ? JSON.parse(decrypt(envelope.data)) : envelope;
  } catch (_) { return null; }
}

async function waitForServer() {
  const deadline = Date.now() + 20000;
  while (Date.now() < deadline) {
    try {
      await new Promise((resolve, reject) => {
        const request = http.get({ hostname: '127.0.0.1', port: PORT, path: '/' }, (response) => {
          response.resume();
          resolve();
        });
        request.on('error', reject);
      });
      return;
    } catch (_) { await new Promise((resolve) => setTimeout(resolve, 250)); }
  }
  throw new Error('Local server did not start.');
}

async function waitUntil(predicate, timeoutMs = 30000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const value = predicate();
    if (value) return value;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error('Timed out waiting for Gateway mutation.');
}

async function createProgram(pool, code) {
  const response = await pool.request()
    .input('PromotionProgramID', sql.BigInt, null)
    .input('PromotionCode', sql.VarChar(50), code)
    .input('PromotionName', sql.NVarChar(300), code)
    .input('ProgramType', sql.VarChar(20), 'EVENT')
    .input('Description', sql.NVarChar(2000), MARKER)
    .input('EffectiveFrom', sql.DateTime2(0), new Date(Date.now() - 60000))
    .input('EffectiveTo', sql.DateTime2(0), new Date(Date.now() + 3600000))
    .input('BranchScopeMode', sql.VarChar(10), 'ALL')
    .input('JsonBranchIDs', sql.NVarChar(sql.MAX), '[]')
    .input('UserGroupScopeMode', sql.VarChar(10), 'ALL')
    .input('JsonUserGroupIDs', sql.NVarChar(sql.MAX), '[]')
    .input('Priority', sql.Int, 100)
    .input('SourceDocument', sql.NVarChar(500), 'verify_promo_cfg002_ui_trace.js')
    .input('JsonRules', sql.NVarChar(sql.MAX), JSON.stringify([{
      RuleOrder: 1, ItemID: 'A014', RuleType: 'QUANTITY_GIFT',
      MinimumQuantity: 10, MaximumQuantity: 10, GiftItemID: 'A014', GiftQuantity: 2
    }]))
    .input('Username', sql.VarChar(50), USERNAME)
    .input('Apply', sql.Bit, 1)
    .execute('dbo.API_PromotionProgram_Upsert_AI');
  const row = response.recordset[0];
  assert.ok(row && row.PromotionProgramID && Number(row.MsgType) !== 1, JSON.stringify(row));
  return String(row.PromotionProgramID);
}

async function approveDirect(pool, programId) {
  await pool.request()
    .input('PromotionProgramID', sql.BigInt, programId)
    .input('Action', sql.VarChar(20), 'APPROVE')
    .input('Username', sql.VarChar(50), USERNAME)
    .input('Apply', sql.Bit, 1)
    .input('Reason', sql.NVarChar(500), null)
    .execute('dbo.API_PromotionProgram_Approve_AI');
}

async function auditFor(pool, programId, actionType) {
  const response = await pool.request()
    .input('TargetID', sql.VarChar(100), programId)
    .input('ActionType', sql.VarChar(100), actionType)
    .query(`SELECT TOP (1) LogID, LogTime, Username, ExtraInfo
            FROM dbo.AI_AuditLog
            WHERE TargetEntity='API_PromotionProgram_Approve_AI'
              AND TargetID=@TargetID AND ActionType=@ActionType
            ORDER BY LogID DESC;`);
  return response.recordset[0];
}

async function deletePrograms(pool, ids) {
  if (!ids.length) return;
  const tx = new sql.Transaction(pool);
  await tx.begin();
  try {
    const lock = new sql.Request(tx).input('Marker', sql.NVarChar(2000), MARKER);
    ids.forEach((id, index) => lock.input(`Id${index}`, sql.BigInt, id));
    const names = ids.map((_, index) => `@Id${index}`).join(',');
    const rows = await lock.query(`SELECT PromotionProgramID, Description FROM dbo.AI_PromotionProgramTbl
                                   WITH (UPDLOCK,HOLDLOCK) WHERE PromotionProgramID IN (${names});`);
    assert.strictEqual(rows.recordset.length, ids.length);
    assert.ok(rows.recordset.every((row) => row.Description === MARKER));
    const remove = new sql.Request(tx);
    ids.forEach((id, index) => remove.input(`Id${index}`, sql.BigInt, id));
    await remove.query(`DELETE dbo.AI_PromotionProgramTbl WHERE PromotionProgramID IN (${names});`);
    await tx.commit();
  } catch (error) {
    await tx.rollback();
    throw error;
  }
}

async function main() {
  const env = envValues();
  assert.strictEqual(String(env.TEST_DB_DATABASE || '').toLowerCase(), 'medtest', 'medtest only');
  const pool = await sql.connect({
    server: env.TEST_DB_SERVER,
    port: Number(env.TEST_DB_PORT || 1433),
    database: env.TEST_DB_DATABASE,
    user: env.TEST_DB_USER,
    password: env.TEST_DB_PASSWORD,
    options: { encrypt: false, trustServerCertificate: true },
    connectionTimeout: 15000
  });
  const server = spawn(process.execPath, ['server.js'], {
    cwd: ROOT,
    env: { ...process.env, PORT: String(PORT) },
    stdio: ['ignore', 'pipe', 'pipe']
  });
  let serverLog = '';
  server.stdout.on('data', (data) => { serverLog += data.toString(); });
  server.stderr.on('data', (data) => { serverLog += data.toString(); });
  const ids = [];
  let browser;
  try {
    await waitForServer();
    const rejectId = await createProgram(pool, `UAT_CFG002_REJ_${TOKEN}`.slice(0, 50));
    ids.push(rejectId);
    const withdrawId = await createProgram(pool, `UAT_CFG002_WDR_${TOKEN}`.slice(0, 50));
    ids.push(withdrawId);
    await approveDirect(pool, withdrawId);

    browser = await puppeteer.launch({ executablePath: CHROME_PATH, headless: 'new', args: ['--no-sandbox'] });
    const page = await browser.newPage();
    const events = [];
    const byRequest = new WeakMap();
    page.on('request', (request) => {
      const decoded = decodedRequest(request);
      if (!decoded || request.method() !== 'POST' || !request.url().includes('/api/gateway')) return;
      const event = { endpoint: decoded.endpoint, action: decoded.body && decoded.body.Action, completed: false };
      byRequest.set(request, event);
      events.push(event);
    });
    page.on('response', async (response) => {
      const event = byRequest.get(response.request());
      if (!event) return;
      event.httpStatus = response.status();
      event.requestId = response.headers()['x-request-id'] || '';
      event.completed = true;
    });
    let dialogValue = null;
    page.on('dialog', async (dialog) => {
      if (dialog.type() === 'prompt') await dialog.accept(dialogValue || '');
      else await dialog.accept();
    });

    await page.goto(`${BASE_URL}/pages/login.html`, { waitUntil: 'networkidle0' });
    await page.type('#username', USERNAME);
    await page.type('#password', PASSWORD);
    await page.click('#btn-login');
    await page.waitForNavigation({ waitUntil: 'networkidle0', timeout: 20000 }).catch(() => {});
    await page.goto(`${BASE_URL}/index.html#/rag-admin`, { waitUntil: 'networkidle0' });
    await page.waitForSelector('#pf-code', { timeout: 20000 });

    async function runUiAction(programId, action, reason) {
      await page.waitForSelector(`.promo-item[data-id="${programId}"]`, { timeout: 20000 });
      await page.evaluate((id) => document.querySelector(`.promo-item[data-id="${id}"]`).click(), programId);
      await new Promise((resolve) => setTimeout(resolve, 500));
      dialogValue = reason;
      const start = events.length;
      const selector = action === 'REJECT' ? '#btn-reject-promo' : '#btn-withdraw-promo';
      await page.evaluate((buttonSelector) => document.querySelector(buttonSelector).click(), selector);
      const event = await waitUntil(() => events.slice(start).find((entry) =>
        entry.completed && entry.action === action && String(entry.endpoint || '').includes('API_PromotionProgram_Approve_AI')));
      assert.strictEqual(event.httpStatus, 200);
      assert.ok(event.requestId && serverLog.includes(`requestId=${event.requestId};`), `${action} request ID not in server log.`);
      return event;
    }

    const rejectReason = `${MARKER} reject`;
    const rejectEvent = await runUiAction(rejectId, 'REJECT', rejectReason);
    const withdrawReason = `${MARKER} withdraw`;
    const withdrawEvent = await runUiAction(withdrawId, 'WITHDRAW', withdrawReason);

    const rejectAudit = await auditFor(pool, rejectId, 'PROMOTION_REJECT');
    const withdrawAudit = await auditFor(pool, withdrawId, 'PROMOTION_WITHDRAW');
    assert.ok(rejectAudit && withdrawAudit, 'Missing promotion transition audit.');
    const rejectExtra = JSON.parse(rejectAudit.ExtraInfo);
    const withdrawExtra = JSON.parse(withdrawAudit.ExtraInfo);
    assert.strictEqual(rejectAudit.Username, USERNAME);
    assert.strictEqual(withdrawAudit.Username, USERNAME);
    assert.strictEqual(rejectExtra.Reason, rejectReason);
    assert.strictEqual(withdrawExtra.Reason, withdrawReason);

    console.log(JSON.stringify({
      Task: 'PROMO-CFG-002-UI-TRACE',
      Status: 'PASS',
      Results: {
        Reject: { RequestID: rejectEvent.requestId, Actor: rejectAudit.Username, ReasonMatched: true },
        Withdraw: { RequestID: withdrawEvent.requestId, Actor: withdrawAudit.Username, ReasonMatched: true },
        RequestIdsConfirmedInServerLog: 2
      },
      TestProgramsRemovedAfterVerification: ids
    }, null, 2));
  } finally {
    if (browser) await browser.close().catch(() => {});
    await deletePrograms(pool, ids).catch((error) => {
      console.error('TEST_PROGRAM_CLEANUP_FAILED:', error.message);
      process.exitCode = 1;
    });
    server.kill();
    await pool.close();
  }
}

main().catch((error) => {
  console.error(JSON.stringify({ Task: 'PROMO-CFG-002-UI-TRACE', Status: 'FAIL', Error: error.message }, null, 2));
  process.exitCode = 1;
});
