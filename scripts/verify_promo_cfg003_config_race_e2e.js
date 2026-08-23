'use strict';

/* PROMO-CFG-003 — live UI preview + stale-config rejection + double-click/retry.
 * Test programs are removed in finally; the single successful draft order is retained
 * as traceable UAT evidence and printed in the result. Raw browser/network data is not persisted. */

const assert = require('assert');
const fs = require('fs');
const http = require('http');
const path = require('path');
const { spawn } = require('child_process');
const puppeteer = require('puppeteer-core');
const sql = require('mssql');
const { getRequiredUatPassword } = require('./lib/uat-test-config');

const ROOT = path.resolve(__dirname, '..');
const PORT = Number(process.env.PROMO_CFG003_E2E_PORT || 3413);
const BASE_URL = `http://127.0.0.1:${PORT}`;
const USERNAME = process.env.APP_USER || 'demo';
const PASSWORD = getRequiredUatPassword(['PROMO_CFG003_PASSWORD']);
const CHROME_PATH = process.env.CHROME_PATH || 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const ITEM_ID = process.env.PROMO_CFG003_ITEM || 'A014';
const CUSTOMER_ID = process.env.PROMO_CFG003_CUSTOMER || 'HNBV356';
const RUN_TOKEN = Date.now().toString(36).toUpperCase();
const MARKER = `PROMO-CFG-003-${RUN_TOKEN}`;

function readEnv() {
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

function decodeEnvelope(value) {
  try {
    const envelope = typeof value === 'string' ? JSON.parse(value) : value;
    return envelope && envelope.data ? JSON.parse(decrypt(envelope.data)) : envelope;
  } catch (_) {
    return null;
  }
}

function firstRow(value) {
  if (Array.isArray(value)) return value[0] || {};
  if (value && Array.isArray(value.records)) return value.records[0] || {};
  if (value && value.data !== undefined) return firstRow(value.data);
  return value || {};
}

async function waitForServer(port, timeoutMs = 20000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      await new Promise((resolve, reject) => {
        const request = http.get({ hostname: '127.0.0.1', port, path: '/' }, (response) => {
          response.resume();
          resolve();
        });
        request.on('error', reject);
      });
      return;
    } catch (_) {
      await new Promise((resolve) => setTimeout(resolve, 250));
    }
  }
  throw new Error(`Local server did not start on port ${port}.`);
}

async function waitUntil(predicate, timeoutMs = 30000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const result = predicate();
    if (result) return result;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error('Timed out waiting for expected gateway event.');
}

async function upsertProgram(pool, code, giftQuantity) {
  const now = new Date();
  const response = await pool.request()
    .input('PromotionProgramID', sql.BigInt, null)
    .input('PromotionCode', sql.VarChar(50), code)
    .input('PromotionName', sql.NVarChar(300), code)
    .input('ProgramType', sql.VarChar(20), 'EVENT')
    .input('Description', sql.NVarChar(2000), MARKER)
    .input('EffectiveFrom', sql.DateTime2(0), new Date(now.getTime() - 60000))
    .input('EffectiveTo', sql.DateTime2(0), new Date(now.getTime() + 3600000))
    .input('BranchScopeMode', sql.VarChar(10), 'ALL')
    .input('JsonBranchIDs', sql.NVarChar(sql.MAX), '[]')
    .input('UserGroupScopeMode', sql.VarChar(10), 'ALL')
    .input('JsonUserGroupIDs', sql.NVarChar(sql.MAX), '[]')
    .input('Priority', sql.Int, 1)
    .input('SourceDocument', sql.NVarChar(500), 'verify_promo_cfg003_config_race_e2e.js')
    .input('JsonRules', sql.NVarChar(sql.MAX), JSON.stringify([{
      RuleOrder: 1,
      ItemID: ITEM_ID,
      RuleType: 'QUANTITY_GIFT',
      MinimumQuantity: 10,
      MaximumQuantity: 10,
      GiftItemID: ITEM_ID,
      GiftQuantity: giftQuantity,
      BenefitDescription: `UAT mua 10 tặng ${giftQuantity}`
    }]))
    .input('Username', sql.VarChar(50), USERNAME)
    .input('Apply', sql.Bit, 1)
    .execute('dbo.API_PromotionProgram_Upsert_AI');
  const row = firstRow(response.recordset);
  assert.ok(row.PromotionProgramID && Number(row.MsgType) !== 1, `Cannot create test promotion: ${JSON.stringify(row)}`);
  await pool.request()
    .input('PromotionProgramID', sql.BigInt, row.PromotionProgramID)
    .input('Action', sql.VarChar(20), 'APPROVE')
    .input('Username', sql.VarChar(50), USERNAME)
    .input('Apply', sql.Bit, 1)
    .input('Reason', sql.NVarChar(500), null)
    .execute('dbo.API_PromotionProgram_Approve_AI');
  return String(row.PromotionProgramID);
}

async function transitionProgram(pool, programId, action, reason) {
  await pool.request()
    .input('PromotionProgramID', sql.BigInt, programId)
    .input('Action', sql.VarChar(20), action)
    .input('Username', sql.VarChar(50), USERNAME)
    .input('Apply', sql.Bit, 1)
    .input('Reason', sql.NVarChar(500), reason || null)
    .execute('dbo.API_PromotionProgram_Approve_AI');
}

async function cancelTestDraft(pool, documentId) {
  if (!documentId) return null;
  const current = await pool.request()
    .input('DocumentID', sql.VarChar(50), documentId)
    .query(`SELECT DocumentID, StatusID, UserCreate, Memo
            FROM dbo.AR_OrderTbl WHERE DocumentID=@DocumentID;`);
  const row = current.recordset[0];
  assert.ok(row, `Test draft ${documentId} no longer exists.`);
  if (Number(row.StatusID) === 10) return row;
  assert.strictEqual(Number(row.StatusID), -1, `Refusing to cancel non-draft ${documentId}.`);
  assert.strictEqual(String(row.UserCreate || '').toLowerCase(), USERNAME.toLowerCase());
  assert.strictEqual(row.Memo, `${MARKER}-SUCCESS`, `Refusing to cancel unmarked order ${documentId}.`);
  const requestId = `req-promo003-cleanup-${RUN_TOKEN}`;
  const response = await pool.request()
    .input('Username', sql.VarChar(50), USERNAME)
    .input('DocumentID', sql.VarChar(50), documentId)
    .input('Action', sql.VarChar(20), 'CANCEL')
    .input('ExpectedStatusID', sql.Int, -1)
    .input('IdempotencyKey', sql.VarChar(128), `idem-promo003-cleanup-${RUN_TOKEN}`)
    .input('RequestID', sql.VarChar(100), requestId)
    .execute('dbo.API_DonHang_OwnerTransition_AI');
  const result = firstRow(response.recordset);
  assert.ok(Number(result.MsgType) !== 1, `Cannot cancel test draft ${documentId}: ${JSON.stringify(result)}`);
  const verified = await pool.request()
    .input('DocumentID', sql.VarChar(50), documentId)
    .query('SELECT StatusID FROM dbo.AR_OrderTbl WHERE DocumentID=@DocumentID;');
  assert.strictEqual(Number(verified.recordset[0].StatusID), 10, `Test draft ${documentId} was not cancelled.`);
  return verified.recordset[0];
}

async function deleteTestPrograms(pool, programIds) {
  if (!programIds.length) return;
  const tx = new sql.Transaction(pool);
  await tx.begin();
  try {
    const request = new sql.Request(tx).input('Marker', sql.NVarChar(2000), MARKER);
    const ids = programIds.map((id, index) => {
      request.input(`Id${index}`, sql.BigInt, id);
      return `@Id${index}`;
    }).join(',');
    const found = await request.query(`
      SELECT PromotionProgramID, Status, Description
      FROM dbo.AI_PromotionProgramTbl WITH (UPDLOCK, HOLDLOCK)
      WHERE PromotionProgramID IN (${ids});
    `);
    assert.strictEqual(found.recordset.length, programIds.length, 'Test promotion cleanup target count changed.');
    assert.ok(found.recordset.every((row) => row.Description === MARKER), 'Refusing to delete non-test promotion.');
    const deleteRequest = new sql.Request(tx);
    programIds.forEach((id, index) => deleteRequest.input(`Id${index}`, sql.BigInt, id));
    await deleteRequest.query(`DELETE dbo.AI_PromotionProgramTbl WHERE PromotionProgramID IN (${ids});`);
    await tx.commit();
  } catch (error) {
    await tx.rollback();
    throw error;
  }
}

async function selectCustomerAndProduct(page, quantity, marker) {
  await page.goto(`${BASE_URL}/index.html#/create-order`, { waitUntil: 'networkidle0' });
  await page.waitForSelector('#dynamicProductRowsContainer', { timeout: 20000 });
  await page.evaluate((customerId, memo) => {
    const form = window._orderForm || window.orderForm;
    form.setListValue('customer', customerId, customerId);
    form.setValue('memo', memo);
  }, CUSTOMER_ID, marker);
  await page.evaluate(() => document.querySelector('#productPickerContainer_1').click());
  await page.waitForSelector('#pp-search', { timeout: 10000 });
  await page.evaluate((itemId) => {
    const input = document.querySelector('#pp-search');
    input.value = itemId;
    input.dispatchEvent(new Event('input', { bubbles: true }));
  }, ITEM_ID);
  try {
    await page.waitForSelector(`#pp-list li[data-value="${ITEM_ID}"]`, { timeout: 45000 });
  } catch (error) {
    const pickerText = await page.evaluate(() => (document.querySelector('#pp-list') || {}).textContent || '');
    throw new Error(`Product picker did not return ${ITEM_ID}: ${pickerText.trim() || error.message}`);
  }
  await page.evaluate((itemId) => document.querySelector(`#pp-list li[data-value="${itemId}"]`).click(), ITEM_ID);
  try {
    await page.waitForFunction(() => {
      const picker = document.querySelector('#productPickerContainer_1');
      return picker && picker.getAttribute('data-verified') === '1';
    }, { timeout: 45000 });
  } catch (error) {
    const state = await page.evaluate(() => ({
      pickerText: (document.querySelector('#productPickerContainer_1') || {}).textContent || '',
      pickerValue: (document.querySelector('#productPickerContainer_1') || {}).getAttribute
        ? document.querySelector('#productPickerContainer_1').getAttribute('data-value') : '',
      verified: (document.querySelector('#productPickerContainer_1') || {}).getAttribute
        ? document.querySelector('#productPickerContainer_1').getAttribute('data-verified') : '',
      alertText: Array.from(document.querySelectorAll('.swal2-html-container, .alert-message, .modal-body'))
        .map((node) => node.textContent.trim()).filter(Boolean).slice(-3)
    }));
    throw new Error(`Product ${ITEM_ID} was selected but not verified: ${JSON.stringify(state)}; ${error.message}`);
  }
  await page.evaluate((qty) => {
    const input = document.querySelector('#qty_1');
    input.value = String(qty);
    input.dispatchEvent(new Event('input', { bubbles: true }));
  }, quantity);
  await new Promise((resolve) => setTimeout(resolve, 500));
  return page.evaluate(() => ({
    giftQuantity: Number((document.querySelector('.promo-row input[readonly]') || {}).value || 0),
    label: (document.querySelector('#promoSuggest_1') || {}).textContent || '',
    discount: Number((document.querySelector('#discount_1') || {}).value || 0)
  }));
}

async function main() {
  const env = readEnv();
  assert.strictEqual(String(env.TEST_DB_DATABASE || '').toLowerCase(), 'medtest', 'medtest only');
  const pool = await sql.connect({
    server: env.TEST_DB_SERVER,
    port: Number(env.TEST_DB_PORT || 1433),
    database: env.TEST_DB_DATABASE,
    user: env.TEST_DB_USER,
    password: env.TEST_DB_PASSWORD,
    options: { encrypt: false, trustServerCertificate: true },
    connectionTimeout: 15000,
    requestTimeout: 120000
  });
  const server = spawn(process.execPath, ['server.js'], {
    cwd: ROOT,
    env: { ...process.env, PORT: String(PORT) },
    stdio: ['ignore', 'pipe', 'pipe']
  });
  let serverLog = '';
  server.stdout.on('data', (data) => { serverLog += data.toString(); });
  server.stderr.on('data', (data) => { serverLog += data.toString(); });
  const programIds = [];
  let createdDocumentId = null;
  let browser;
  try {
    await waitForServer(PORT);
    const activeBefore = await pool.request()
      .input('ItemID', sql.VarChar(50), ITEM_ID)
      .query(`SELECT COUNT(*) AS C FROM dbo.AI_PromotionItemRuleTbl R
              JOIN dbo.AI_PromotionProgramTbl P ON P.PromotionProgramID=R.PromotionProgramID
              WHERE R.ItemID=@ItemID AND P.Status='APPROVED'
                AND SYSUTCDATETIME() BETWEEN P.EffectiveFrom AND P.EffectiveTo;`);
    assert.strictEqual(Number(activeBefore.recordset[0].C), 0, `${ITEM_ID} already has an active configured promotion.`);

    const programA = await upsertProgram(pool, `UAT_CFG003_A_${RUN_TOKEN}`.slice(0, 50), 3);
    programIds.push(programA);

    browser = await puppeteer.launch({
      executablePath: CHROME_PATH,
      headless: 'new',
      defaultViewport: { width: 1366, height: 768 },
      args: ['--no-sandbox', '--disable-setuid-sandbox']
    });
    const page = await browser.newPage();
    const gatewayEvents = [];
    const byRequest = new WeakMap();
    page.on('request', (request) => {
      if (request.method() !== 'POST' || !request.url().includes('/api/gateway')) return;
      let decodedRequest = null;
      try {
        const envelope = JSON.parse(request.postData() || '{}');
        decodedRequest = envelope.data ? JSON.parse(decrypt(envelope.data)) : envelope;
      } catch (_) { /* ignored */ }
      const event = {
        request,
        endpoint: decodedRequest && decodedRequest.endpoint,
        payload: decodedRequest && decodedRequest.body,
        rawBody: request.postData(),
        authorization: request.headers().authorization || '',
        idempotencyKey: request.headers()['idempotency-key'] || '',
        completed: false
      };
      byRequest.set(request, event);
      gatewayEvents.push(event);
    });
    page.on('response', async (response) => {
      const event = byRequest.get(response.request());
      if (!event) return;
      event.httpStatus = response.status();
      event.requestId = response.headers()['x-request-id'] || '';
      event.response = decodeEnvelope(await response.text().catch(() => ''));
      event.completed = true;
    });

    await page.goto(`${BASE_URL}/pages/login.html`, { waitUntil: 'networkidle0' });
    await page.type('#username', USERNAME);
    await page.type('#password', PASSWORD);
    await page.click('#btn-login');
    await page.waitForNavigation({ waitUntil: 'networkidle0', timeout: 20000 }).catch(() => {});

    const previewA = await selectCustomerAndProduct(page, 20, `${MARKER}-STALE`);
    assert.strictEqual(previewA.giftQuantity, 3, `Config A preview expected gift=3: ${JSON.stringify(previewA)}`);

    await transitionProgram(pool, programA, 'WITHDRAW', `${MARKER} switch to B`);
    const programB = await upsertProgram(pool, `UAT_CFG003_B_${RUN_TOKEN}`.slice(0, 50), 1);
    programIds.push(programB);

    let start = gatewayEvents.length;
    await page.evaluate(() => document.querySelector('#btnSaveDraft').click());
    const staleEvent = await waitUntil(() => gatewayEvents.slice(start).find((event) =>
      event.completed && String(event.endpoint || '').includes('API_DonHangChiTiet_Insert_AI')));
    const staleRow = firstRow(staleEvent.response);
    assert.strictEqual(staleEvent.httpStatus, 200, 'Stale config response must be a business response.');
    assert.ok(staleEvent.requestId && serverLog.includes(`requestId=${staleEvent.requestId};`), 'Stale request ID not correlated with server log.');
    assert.strictEqual(String(staleRow.Code || '').toUpperCase(), 'PROMOTION_CHANGED', `Expected PROMOTION_CHANGED: ${JSON.stringify(staleRow)}`);

    const staleOrders = await pool.request().input('Memo', sql.NVarChar(200), `${MARKER}-STALE`)
      .query('SELECT COUNT(*) AS C FROM dbo.AR_OrderTbl WHERE Memo=@Memo;');
    assert.strictEqual(Number(staleOrders.recordset[0].C), 0, 'Stale preview created an order.');

    // A real browser refresh resets the page-level rule cache; ACTIVE_BY_ITEMS itself
    // must also bypass Http session cache (the production fix exercised by this test).
    await page.reload({ waitUntil: 'networkidle0' });
    const previewB = await selectCustomerAndProduct(page, 20, `${MARKER}-SUCCESS`);
    assert.strictEqual(previewB.giftQuantity, 1, `Config B preview expected gift=1: ${JSON.stringify(previewB)}`);

    start = gatewayEvents.length;
    await page.evaluate(() => {
      const button = document.querySelector('#btnSaveDraft');
      button.click();
      button.click();
    });
    const successEvent = await waitUntil(() => gatewayEvents.slice(start).find((event) =>
      event.completed && String(event.endpoint || '').includes('API_DonHangChiTiet_Insert_AI')));
    await new Promise((resolve) => setTimeout(resolve, 500));
    const mutationEvents = gatewayEvents.slice(start).filter((event) =>
      String(event.endpoint || '').includes('API_DonHangChiTiet_Insert_AI'));
    assert.strictEqual(mutationEvents.length, 1, `Double click sent ${mutationEvents.length} mutations.`);
    const successRow = firstRow(successEvent.response);
    assert.strictEqual(successEvent.httpStatus, 200);
    assert.ok(successEvent.requestId && serverLog.includes(`requestId=${successEvent.requestId};`), 'Success request ID not correlated with server log.');
    assert.ok(successEvent.idempotencyKey, 'Missing Idempotency-Key on successful mutation.');
    if (successRow.DocumentID) createdDocumentId = String(successRow.DocumentID);
    assert.ok(createdDocumentId && Number(successRow.MsgType) === 5, `Draft save failed: ${JSON.stringify(successRow)}`);

    const replayResponse = await fetch(`${BASE_URL}/api/gateway`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: successEvent.authorization,
        'Idempotency-Key': successEvent.idempotencyKey,
        'X-Request-ID': `req-promo003-replay-${RUN_TOKEN}`
      },
      body: successEvent.rawBody
    });
    const replayRequestId = replayResponse.headers.get('x-request-id') || '';
    const replayRow = firstRow(decodeEnvelope(await replayResponse.text()));
    assert.strictEqual(replayResponse.status, 200);
    assert.ok(replayRequestId && serverLog.includes(`requestId=${replayRequestId};`), 'Replay request ID not correlated with server log.');
    assert.ok(replayRow.IsReplay === true || Number(replayRow.IsReplay) === 1, `Retry was not a replay: ${JSON.stringify(replayRow)}`);

    const persisted = await pool.request().input('DocumentID', sql.VarChar(50), String(successRow.DocumentID)).query(`
      SELECT O.DocumentID, O.StatusID, O.Memo, D.ItemID, D.Quantity, D.SoLuongTang,
             D.DiscountPercent, D.TotalAmount
      FROM dbo.AR_OrderTbl O JOIN dbo.AR_OrderDetailTbl D ON D.DocumentID=O.DocumentID
      WHERE O.DocumentID=@DocumentID;
    `);
    assert.strictEqual(persisted.recordset.length, 1, 'Expected exactly one persisted order detail row.');
    assert.strictEqual(Number(persisted.recordset[0].SoLuongTang), 1, 'Persisted order did not use config B.');
    await cancelTestDraft(pool, createdDocumentId);

    console.log(JSON.stringify({
      Task: 'PROMO-CFG-003-CONFIG-RACE-E2E',
      Status: 'PASS',
      ContractVersion: 'PROMOTION_BENEFIT_V3',
      Results: {
        ConfigAPreviewGift: previewA.giftQuantity,
        StaleConfigCode: staleRow.Code,
        StaleOrderCount: 0,
        ConfigBPreviewGift: previewB.giftQuantity,
        DoubleClickMutationCount: mutationEvents.length,
        RetryIsReplay: Boolean(replayRow.IsReplay),
        PersistedDocumentID: createdDocumentId,
        PersistedGiftQuantity: Number(persisted.recordset[0].SoLuongTang),
        FinalStatusID: 10,
        RequestIdsCorrelated: 3
      },
      TestMutation: {
        DraftOrder: createdDocumentId,
        Cleanup: 'Cancelled through API_DonHang_OwnerTransition_AI after verification.'
      }
    }, null, 2));
  } finally {
    if (browser) await browser.close().catch(() => {});
    const markedDrafts = await pool.request()
      .input('Memo', sql.NVarChar(200), `${MARKER}-SUCCESS`)
      .query('SELECT DocumentID FROM dbo.AR_OrderTbl WHERE Memo=@Memo AND StatusID=-1;')
      .catch(() => ({ recordset: [] }));
    for (const row of markedDrafts.recordset) {
      await cancelTestDraft(pool, String(row.DocumentID)).catch((error) => {
        console.error('MARKED_TEST_ORDER_CLEANUP_FAILED:', error.message);
        process.exitCode = 1;
      });
    }
    if (createdDocumentId) {
      await cancelTestDraft(pool, createdDocumentId).catch((error) => {
        console.error('TEST_ORDER_CLEANUP_FAILED:', error.message);
        process.exitCode = 1;
      });
    }
    if (programIds.length) {
      await Promise.all(programIds.map(async (id) => {
        try { await transitionProgram(pool, id, 'WITHDRAW', `${MARKER} teardown`); } catch (_) { /* already terminal */ }
      }));
      await deleteTestPrograms(pool, programIds);
    }
    server.kill();
    await pool.close();
  }
}

main().catch((error) => {
  console.error(JSON.stringify({ Task: 'PROMO-CFG-003-CONFIG-RACE-E2E', Status: 'FAIL', Error: error.message }, null, 2));
  process.exitCode = 1;
});
