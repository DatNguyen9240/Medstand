'use strict';

/* ORDER-APPROVAL-005/006 — UI E2E evidence on the real local application.
 *
 * This script intentionally creates two traceable UAT orders on medtest:
 *   1) draft -> edit by owner -> submit -> owner locked -> manager edits pending;
 *   2) draft -> non-owner blocked -> cancel (double-click guarded).
 *
 * Credentials are never written to the report. Override the UAT accounts/password with:
 *   ORDER_UI_SALE_USER, ORDER_UI_SALE_PASSWORD,
 *   ORDER_UI_MANAGER_USER, ORDER_UI_MANAGER_PASSWORD,
 *   ORDER_UI_OTHER_SALE_USER, ORDER_UI_OTHER_SALE_PASSWORD.
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const puppeteer = require('puppeteer-core');

const BASE_URL = process.env.BASE_URL || 'http://localhost:3103';
const CHROME_PATH = process.env.CHROME_PATH || 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const UAT_PASSWORD = process.env.ORDER_UI_PASSWORD || process.env.APP_PASSWORD || '';
const SALE = {
  user: process.env.ORDER_UI_SALE_USER || 'NAMDINHB.MED',
  password: process.env.ORDER_UI_SALE_PASSWORD || UAT_PASSWORD,
  customer: process.env.ORDER_UI_CUSTOMER || 'NDB001'
};
const MANAGER = {
  user: process.env.ORDER_UI_MANAGER_USER || 'QLBH013.MED',
  password: process.env.ORDER_UI_MANAGER_PASSWORD || UAT_PASSWORD
};
const OTHER_SALE = {
  user: process.env.ORDER_UI_OTHER_SALE_USER || 'BACNINHA.MED',
  password: process.env.ORDER_UI_OTHER_SALE_PASSWORD || UAT_PASSWORD
};
const EXISTING_SUBMIT_ORDER = String(process.env.ORDER_UI_EXISTING_SUBMIT_ORDER || '').trim();
const EXISTING_SUBMIT_MARKER = String(process.env.ORDER_UI_EXISTING_SUBMIT_MARKER || '').trim();
const EXISTING_SUBMIT_STAGE = String(process.env.ORDER_UI_EXISTING_SUBMIT_STAGE || 'DRAFT').trim().toUpperCase();
const EXISTING_CANCEL_ORDER = String(process.env.ORDER_UI_EXISTING_CANCEL_ORDER || '').trim();
const EXISTING_CANCEL_MARKER = String(process.env.ORDER_UI_EXISTING_CANCEL_MARKER || '').trim();

const REPORT_DIR = path.join(__dirname, '..', 'reports', 'uat', 'ORDER-APPROVAL-005-006');
const RUN_ID = `order-ui-${new Date().toISOString().replace(/[-:.TZ]/g, '').slice(0, 14)}`;
const network = [];
const dialogs = [];
let requestSequence = 0;

function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function safeName(value) {
  return String(value || '').replace(/[^A-Za-z0-9_-]+/g, '_');
}

async function installNetworkEvidence(page, role) {
  let stage = 'BOOT';
  const byRequest = new WeakMap();
  page.setEvidenceStage = value => { stage = value; };
  await page.setRequestInterception(true);
  page.on('request', request => {
    if (!request.url().includes('/api/gateway')) {
      request.continue();
      return;
    }
    requestSequence += 1;
    // server.js only accepts caller-provided IDs beginning with "req-".
    const requestId = `req-ui-${RUN_ID.slice(-14)}-${safeName(role).slice(0, 16)}-${requestSequence}`;
    const headers = Object.assign({}, request.headers(), { 'x-request-id': requestId });
    const entry = {
      role,
      stage,
      requestId,
      method: request.method(),
      url: request.url(),
      idempotencyKey: headers['idempotency-key'] || '',
      startedAt: new Date().toISOString(),
      status: null,
      completedAt: null
    };
    byRequest.set(request, entry);
    network.push(entry);
    request.continue({ headers });
  });
  page.on('response', response => {
    const entry = byRequest.get(response.request());
    if (!entry) return;
    entry.status = response.status();
    entry.completedAt = new Date().toISOString();
  });
  page.on('dialog', async dialog => {
    dialogs.push({ role, stage, type: dialog.type(), message: dialog.message(), at: new Date().toISOString() });
    await dialog.accept();
  });
}

async function login(browser, account, role) {
  const context = await browser.createBrowserContext();
  const page = await context.newPage();
  await page.setViewport({ width: 1440, height: 900 });
  await installNetworkEvidence(page, role);
  page.setEvidenceStage('LOGIN');
  await page.goto(`${BASE_URL}/pages/login.html`, { waitUntil: 'networkidle0', timeout: 30000 });
  await page.type('#username', account.user);
  await page.type('#password', account.password);
  const navigation = page.waitForNavigation({ waitUntil: 'networkidle0', timeout: 30000 });
  await page.click('#btn-login');
  await navigation;
  await page.waitForFunction(() => {
    try {
      const user = JSON.parse(localStorage.getItem('auth_user') || '{}');
      return Boolean(user.UserName || user.Username);
    } catch (_) {
      return false;
    }
  }, { timeout: 30000 });
  const loggedIn = await page.evaluate(() => {
    const user = JSON.parse(localStorage.getItem('auth_user') || '{}');
    return { userName: user.UserName || user.Username || '', branchId: user.BranchID || user.branchId || '' };
  });
  assert.strictEqual(loggedIn.userName.toLowerCase(), account.user.toLowerCase(), `${role} authenticated as another account`);
  return { context, page, identity: loggedIn };
}

async function discoverOrderableItem(page, customerId) {
  page.setEvidenceStage('DISCOVER_SCOPED_DATA');
  await page.goto(`${BASE_URL}/index.html#/create-order`, { waitUntil: 'networkidle0', timeout: 30000 });
  await page.waitForFunction(() => typeof Http !== 'undefined' && window.API_CONFIG && window.MedstandProductOrderability,
    { timeout: 20000 });
  let result;
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    result = await page.evaluate(async customer => {
      try {
        const customerResponse = await Http.get(API_CONFIG.ENDPOINTS.FILTER.CUSTOMERS, {
          q: JSON.stringify({ User: '', ManagerID: '', EmployeeID: '', ObjectID: customer,
            LoaiKhachHang: '', KenhBan: '', SearchText: '', SYSManagerID: '', SYSEmployeeID: '' })
        }, { cache: false });
        const customerRows = customerResponse.records || customerResponse.data?.records || customerResponse.data || customerResponse || [];
        const exactCustomer = customerRows.find(row => String(row.ObjectID || '').toLowerCase() === customer.toLowerCase());
        if (!exactCustomer) return { error: `CUSTOMER_OUT_OF_SCOPE:${customer}`, transient: false };

        const today = new Date().toISOString().slice(0, 10);
        const productResponse = await Http.get(API_CONFIG.ENDPOINTS.FILTER.PRODUCTS, {
          q: JSON.stringify({ Username: '', ObjectID: customer, ItemID: '', SearchText: '', DocumentDate: today })
        }, { cache: false });
        const rows = productResponse.records || productResponse.data?.records || productResponse.data || productResponse || [];
        const item = rows.find(row => {
          const stock = Number(row.QuantityinStock ?? row.TonKho ?? row.AvailableStock ?? 0);
          const price = Number(row.UnitPrice ?? row.Price ?? 0);
          return Boolean(row.ItemID) && price > 0 && stock >= 2;
        });
        if (!item) return { error: 'NO_ORDERABLE_ITEM_WITH_STOCK', transient: false };
        return {
          customerId: exactCustomer.ObjectID,
          customerName: exactCustomer.DisplayName || exactCustomer.ObjectName || exactCustomer.ObjectID,
          itemId: item.ItemID,
          itemName: item.ItemName || item.ItemID,
          unitPrice: Number(item.UnitPrice ?? item.Price ?? 0),
          availableStock: Number(item.QuantityinStock ?? item.TonKho ?? item.AvailableStock ?? 0)
        };
      } catch (error) {
        return { error: String(error && error.message || error), transient: true };
      }
    }, customerId);
    if (!result.transient) break;
    await delay(1200 * attempt);
  }
  assert.ok(!result.error, result.error || 'Scoped data discovery failed');
  return result;
}

async function closeAlert(page) {
  const button = await page.$('.swal2-confirm');
  if (button) await button.click().catch(() => {});
  await delay(250);
}

async function waitForGlobalIdle(page, timeout = 45000) {
  await page.waitForFunction(() => {
    const spinner = document.querySelector('#global-spinner');
    return !spinner || spinner.hidden || getComputedStyle(spinner).display === 'none';
  }, { timeout });
}

async function waitForAlertText(page, pattern, timeout = 30000) {
  await page.waitForFunction(source => {
    const popup = document.querySelector('.swal2-popup');
    return popup && new RegExp(source, 'i').test(popup.innerText || '');
  }, { timeout }, pattern.source);
  return page.$eval('.swal2-popup', el => el.innerText.replace(/\s+/g, ' ').trim());
}

async function loadWithRetry(page, options) {
  const {
    url, stage, ready, describe, attempts = 4, timeout = 30000
  } = options;
  let lastState = null;
  let lastError = null;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    page.setEvidenceStage(`${stage}_TRY_${attempt}`);
    try {
      await page.goto(url, { waitUntil: 'networkidle0', timeout });
      await page.waitForFunction(ready, { timeout });
      return;
    } catch (error) {
      lastError = error;
      lastState = await page.evaluate(() => ({
        loading: document.querySelector('#loading-state')?.innerText?.trim() || '',
        formHidden: document.querySelector('#edit-form-wrap')?.hidden,
        ownerActions: document.querySelector('#owner-action-bar')?.innerText?.trim() || '',
        body: document.body?.innerText?.replace(/\s+/g, ' ').trim().slice(0, 800) || ''
      })).catch(() => null);
      if (attempt < attempts) await delay(1200 * attempt);
    }
  }
  throw new Error(`${describe} after ${attempts} attempts: ${lastError && lastError.message}; UI=${JSON.stringify(lastState)}`);
}

async function loadEditableOrder(page, documentId, stage) {
  await loadWithRetry(page, {
    url: `${BASE_URL}/index.html#/edit-order?id=${encodeURIComponent(documentId)}`,
    stage,
    describe: `Editable order ${documentId} did not load`,
    ready: () => {
      const form = document.querySelector('#edit-form-wrap');
      return Boolean(form && !form.hidden);
    }
  });
}

async function loadBlockedOrder(page, documentId, stage) {
  await loadWithRetry(page, {
    url: `${BASE_URL}/index.html#/edit-order?id=${encodeURIComponent(documentId)}`,
    stage,
    describe: `Blocked state for ${documentId} did not load`,
    ready: () => {
      const loading = document.querySelector('#loading-state');
      const form = document.querySelector('#edit-form-wrap');
      const message = loading && loading.innerText || '';
      return Boolean(loading && !/Đang tải|Lỗi tải|Không kiểm tra được/i.test(message) && form && form.hidden);
    }
  });
}

async function createDraft(page, data, suffix) {
  const marker = `UAT ${RUN_ID} ${suffix}`;
  const prefill = encodeURIComponent(JSON.stringify({
    '@ObjectID': data.customerId,
    '@Description': marker,
    '@ItemList': [{ ItemID: data.itemId, Quantity: 1 }]
  }));
  page.setEvidenceStage(`PREFILL_${suffix}`);
  await page.goto(`${BASE_URL}/index.html#/create-order?data=${prefill}`, { waitUntil: 'networkidle0', timeout: 30000 });
  await page.waitForFunction((customerId, itemId) => {
    const form = window._orderForm || (typeof orderForm !== 'undefined' ? orderForm : null);
    const picker = document.querySelector('[id^="productPickerContainer_"][data-verified="1"]');
    return form && form.getValue('customer') === customerId && picker && picker.getAttribute('data-value') === itemId;
  }, { timeout: 40000 }, data.customerId, data.itemId);
  await delay(2300); // let the informational prefill toast close before saving
  await waitForGlobalIdle(page);
  await page.screenshot({ path: path.join(REPORT_DIR, `${suffix}_01_READY_TO_SAVE.png`), fullPage: true });

  page.setEvidenceStage(`CREATE_DRAFT_${suffix}`);
  await page.click('#btnSaveDraft');
  const alertText = await waitForAlertText(page, /Mã đơn\s*:/i);
  const match = alertText.match(/Mã đơn\s*:\s*([A-Za-z0-9/_-]+)/i);
  assert.ok(match && match[1], `Cannot extract DocumentID from: ${alertText}`);
  const documentId = match[1];
  await page.screenshot({ path: path.join(REPORT_DIR, `${suffix}_02_DRAFT_CREATED.png`), fullPage: true });
  await closeAlert(page);
  return { documentId, marker, alertText };
}

async function assertOwnerCanEditAndSave(page, draft) {
  await loadEditableOrder(page, draft.documentId, 'OWNER_OPEN_OWN_DRAFT');
  await page.screenshot({ path: path.join(REPORT_DIR, 'SUBMIT_03_OWNER_CAN_EDIT_DRAFT.png'), fullPage: true });
  const changedMemo = `${draft.marker} OWNER_EDITED`;
  await page.evaluate(value => {
    const input = document.querySelector('#fs-memo');
    if (!input) throw new Error('memo input not found');
    input.value = value;
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new Event('change', { bubbles: true }));
  }, changedMemo);
  page.setEvidenceStage('OWNER_SAVE_OWN_DRAFT');
  await page.click('#btnUpdateOrder');
  const alertText = await waitForAlertText(page, /thành công|cập nhật/i);
  await page.screenshot({ path: path.join(REPORT_DIR, 'SUBMIT_04_OWNER_EDIT_SAVED.png'), fullPage: true });
  await closeAlert(page);
  await delay(1500);
  return { changedMemo, alertText };
}

async function openOwnerActions(page, documentId, suffix) {
  await loadWithRetry(page, {
    url: `${BASE_URL}/index.html#/order-detail?id=${encodeURIComponent(documentId)}`,
    stage: `OWNER_ACTIONS_${suffix}`,
    describe: `Owner actions for ${documentId} did not load`,
    ready: () => Boolean(document.querySelector('#owner-action-bar'))
  });
  const state = await page.evaluate(() => ({
    canSubmit: Boolean(document.querySelector('#btn-submit-order')),
    canCancel: Boolean(document.querySelector('#btn-cancel-draft-order')),
    text: document.querySelector('#owner-action-bar')?.innerText || ''
  }));
  assert.ok(state.canSubmit && state.canCancel, `Draft owner actions incomplete: ${JSON.stringify(state)}`);
  await page.screenshot({ path: path.join(REPORT_DIR, `${suffix}_OWNER_ACTIONS_SEPARATE.png`), fullPage: true });
  return state;
}

async function doubleClickTransition(page, selector, stage, screenshotName) {
  const before = network.length;
  page.setEvidenceStage(stage);
  await page.evaluate(buttonSelector => {
    const button = document.querySelector(buttonSelector);
    if (!button) throw new Error(`Missing transition button ${buttonSelector}`);
    button.click();
    button.click();
  }, selector);
  await page.waitForFunction(() => !document.querySelector('#owner-action-bar'), { timeout: 30000 });
  await delay(1800);
  await page.screenshot({ path: path.join(REPORT_DIR, screenshotName), fullPage: true });
  const mutations = network.slice(before).filter(entry => entry.stage === stage && entry.idempotencyKey);
  assert.strictEqual(mutations.length, 1, `${stage} double-click emitted ${mutations.length} mutation requests`);
  assert.ok(mutations[0].status >= 200 && mutations[0].status < 300, `${stage} HTTP ${mutations[0].status}`);
  return mutations[0];
}

async function assertOwnerActionsStayClosed(page, documentId, stage, screenshotName) {
  page.setEvidenceStage(stage);
  await page.goto(`${BASE_URL}/index.html#/order-detail?id=${encodeURIComponent(documentId)}`, {
    waitUntil: 'networkidle0',
    timeout: 30000
  });
  await page.waitForFunction(() => {
    const detail = document.querySelector('#detail-content');
    return Boolean(detail && !detail.hidden);
  }, { timeout: 30000 });
  await delay(1500);
  const state = await page.evaluate(() => ({
    ownerBar: Boolean(document.querySelector('#owner-action-bar')),
    submit: Boolean(document.querySelector('#btn-submit-order')),
    cancel: Boolean(document.querySelector('#btn-cancel-draft-order'))
  }));
  assert.deepStrictEqual(state, { ownerBar: false, submit: false, cancel: false },
    `Owner actions reopened after terminal transition: ${JSON.stringify(state)}`);
  await page.screenshot({ path: path.join(REPORT_DIR, screenshotName), fullPage: true });
  return state;
}

async function assertOwnerLockedAfterSubmit(page, documentId) {
  await loadBlockedOrder(page, documentId, 'OWNER_LOCKED_AFTER_SUBMIT');
  const message = await page.$eval('#loading-state', el => el.innerText.trim());
  assert.match(message, /Đơn đã gửi|chỉ kế toán|quản lý/i);
  await page.screenshot({ path: path.join(REPORT_DIR, 'SUBMIT_07_OWNER_LOCKED_AFTER_SUBMIT.png'), fullPage: true });
  return message;
}

async function assertNonOwnerBlocked(page, documentId) {
  await loadBlockedOrder(page, documentId, 'OTHER_SALE_BLOCKED_FROM_DRAFT');
  const message = await page.$eval('#loading-state', el => el.innerText.trim());
  assert.match(message, /không phải của bạn|không.*quyền|không.*phạm vi|lỗi tải/i);
  await page.screenshot({ path: path.join(REPORT_DIR, 'CANCEL_03_OTHER_SALE_BLOCKED.png'), fullPage: true });
  return message;
}

async function assertManagerCanEdit(page, documentId, marker) {
  await loadEditableOrder(page, documentId, 'MANAGER_OPEN_PENDING_ORDER');
  await waitForGlobalIdle(page);
  await page.screenshot({ path: path.join(REPORT_DIR, 'SUBMIT_08_MANAGER_CAN_EDIT_PENDING.png'), fullPage: true });
  const managerFormState = await page.evaluate(() => ({
    customer: window._orderForm && window._orderForm.getValue('customer'),
    route: window._orderForm && window._orderForm.getValue('route'),
    context: window._orderContext || null
  }));
  assert.ok(managerFormState.customer,
    `Authorized manager form lost the order customer: ${JSON.stringify(managerFormState)}`);
  await page.evaluate(value => {
    const input = document.querySelector('#fs-memo');
    if (!input) throw new Error('memo input not found');
    input.value = value;
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new Event('change', { bubbles: true }));
  }, `${marker} MANAGER_EDITED`);
  page.setEvidenceStage('MANAGER_SAVE_PENDING_ORDER');
  await page.click('#btnUpdateOrder');
  const alertText = await waitForAlertText(page, /thành công|cập nhật/i);
  await page.screenshot({ path: path.join(REPORT_DIR, 'SUBMIT_09_MANAGER_EDIT_SAVED.png'), fullPage: true });
  await closeAlert(page);
  return alertText;
}

async function main() {
  assert.ok(SALE.password && MANAGER.password && OTHER_SALE.password,
    'UAT passwords must be supplied through ORDER_UI_PASSWORD or role-specific environment variables.');
  fs.mkdirSync(REPORT_DIR, { recursive: true });
  let priorSubmitEvidence = null;
  if (EXISTING_SUBMIT_ORDER && EXISTING_SUBMIT_STAGE.indexOf('PENDING') === 0) {
    const evidencePath = path.join(REPORT_DIR, 'ORDER-APPROVAL-005-006_UI_EVIDENCE.json');
    assert.ok(fs.existsSync(evidencePath), 'Pending resume requires the previous partial evidence file.');
    priorSubmitEvidence = JSON.parse(fs.readFileSync(evidencePath, 'utf8'));
    const priorOrder = (priorSubmitEvidence.createdOrders || [])
      .find(order => order.documentId === EXISTING_SUBMIT_ORDER);
    assert.ok(priorOrder, `Previous evidence does not contain ${EXISTING_SUBMIT_ORDER}.`);
    const requiredPriorCases = ['SALE_EDITS_OWN_DRAFT', 'SUBMIT_IS_SEPARATE_FROM_EDIT_AND_CANCEL', 'SUBMIT_DOUBLE_CLICK_ONE_REQUEST'];
    if (EXISTING_SUBMIT_STAGE === 'PENDING_MANAGER_EDITED') requiredPriorCases.push('SAME_BRANCH_MANAGER_EDITS_PENDING');
    for (const caseName of requiredPriorCases) {
      const priorCase = (priorSubmitEvidence.cases || []).find(testCase => testCase.case === caseName);
      assert.ok(priorCase && priorCase.status === 'PASS', `Previous evidence has no PASS for ${caseName}.`);
    }
  }
  const browser = await puppeteer.launch({
    executablePath: CHROME_PATH,
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });
  const startedAt = new Date().toISOString();
  const evidence = {
    task: 'ORDER-APPROVAL-005-006-UI-E2E',
    runId: RUN_ID,
    startedAt,
    baseUrl: BASE_URL,
    accounts: { sale: SALE.user, manager: MANAGER.user, otherSale: OTHER_SALE.user },
    createdOrders: [],
    cases: [],
    cleanupPlan: 'Keep the two traceable UAT orders for audit; DBA/PMKT may archive the pending and cancelled records by DocumentID after sign-off.',
    network,
    dialogs
  };
  if (priorSubmitEvidence) {
    evidence.priorRun = {
      runId: priorSubmitEvidence.runId,
      documentId: EXISTING_SUBMIT_ORDER,
      carriedCases: ['SALE_EDITS_OWN_DRAFT', 'SUBMIT_IS_SEPARATE_FROM_EDIT_AND_CANCEL', 'SUBMIT_DOUBLE_CLICK_ONE_REQUEST']
        .concat(EXISTING_SUBMIT_STAGE === 'PENDING_MANAGER_EDITED' ? ['SAME_BRANCH_MANAGER_EDITS_PENDING'] : [])
    };
  }

  let saleSession;
  let managerSession;
  let otherSaleSession;
  try {
    // Credential/readiness gate: all accounts must authenticate before the first mutation.
    saleSession = await login(browser, SALE, 'SALE_OWNER');
    managerSession = await login(browser, MANAGER, 'MANAGER_SAME_BRANCH');
    otherSaleSession = await login(browser, OTHER_SALE, 'SALE_NON_OWNER');
    assert.ok(saleSession.identity.branchId && managerSession.identity.branchId, 'Missing branch identity');
    assert.strictEqual(saleSession.identity.branchId, managerSession.identity.branchId, 'Sale and manager are not in the same branch');
    evidence.cases.push({ case: 'THREE_UAT_ACCOUNTS_AUTHENTICATED_BEFORE_MUTATION', status: 'PASS' });

    const scopedData = await discoverOrderableItem(saleSession.page, SALE.customer);
    evidence.scopedData = scopedData;
    evidence.cases.push({ case: 'SCOPED_CUSTOMER_AND_ORDERABLE_ITEM_DISCOVERED', status: 'PASS' });

    const submitDraft = EXISTING_SUBMIT_ORDER
      ? { documentId: EXISTING_SUBMIT_ORDER, marker: EXISTING_SUBMIT_MARKER || `UAT RESUMED ${EXISTING_SUBMIT_ORDER}` }
      : await createDraft(saleSession.page, scopedData, 'SUBMIT');
    evidence.createdOrders.push({ documentId: submitDraft.documentId, intendedFinalStatus: 'PENDING', marker: submitDraft.marker });
    evidence.cases.push({
      case: EXISTING_SUBMIT_ORDER
        ? (EXISTING_SUBMIT_STAGE.indexOf('PENDING') === 0 ? 'RESUME_EXISTING_PENDING_ORDER' : 'RESUME_EXISTING_SALE_DRAFT')
        : 'SALE_SAVES_DRAFT',
      status: 'PASS', documentId: submitDraft.documentId
    });

    if (EXISTING_SUBMIT_STAGE.indexOf('PENDING') === 0) {
      for (const caseName of ['SALE_EDITS_OWN_DRAFT', 'SUBMIT_IS_SEPARATE_FROM_EDIT_AND_CANCEL', 'SUBMIT_DOUBLE_CLICK_ONE_REQUEST']) {
        const priorCase = priorSubmitEvidence.cases.find(testCase => testCase.case === caseName);
        evidence.cases.push(Object.assign({}, priorCase, {
          evidenceSource: `prior-run:${priorSubmitEvidence.runId}`
        }));
      }
    } else {
      const ownerEdit = await assertOwnerCanEditAndSave(saleSession.page, submitDraft);
      evidence.cases.push({ case: 'SALE_EDITS_OWN_DRAFT', status: 'PASS', detail: ownerEdit.alertText });

      const submitActions = await openOwnerActions(saleSession.page, submitDraft.documentId, 'SUBMIT_05');
      evidence.cases.push({ case: 'SUBMIT_IS_SEPARATE_FROM_EDIT_AND_CANCEL', status: 'PASS', detail: submitActions.text });

      const submitMutation = await doubleClickTransition(
        saleSession.page,
        '#btn-submit-order',
        'OWNER_SUBMIT_DOUBLE_CLICK',
        'SUBMIT_06_DOUBLE_CLICK_ONE_TRANSITION.png'
      );
      evidence.cases.push({ case: 'SUBMIT_DOUBLE_CLICK_ONE_REQUEST', status: 'PASS', requestId: submitMutation.requestId,
        idempotencyKey: submitMutation.idempotencyKey });
    }

    await assertOwnerActionsStayClosed(
      saleSession.page,
      submitDraft.documentId,
      'OWNER_ACTIONS_CLOSED_AFTER_SUBMIT',
      'SUBMIT_06B_OWNER_ACTIONS_STAY_CLOSED.png'
    );
    evidence.cases.push({ case: 'SUBMITTED_ORDER_CANNOT_BE_CANCELLED_OR_RESUBMITTED', status: 'PASS' });

    const ownerBlockMessage = await assertOwnerLockedAfterSubmit(saleSession.page, submitDraft.documentId);
    evidence.cases.push({ case: 'SALE_LOCKED_AFTER_SUBMIT', status: 'PASS', detail: ownerBlockMessage });

    if (EXISTING_SUBMIT_STAGE === 'PENDING_MANAGER_EDITED') {
      const priorManagerCase = priorSubmitEvidence.cases
        .find(testCase => testCase.case === 'SAME_BRANCH_MANAGER_EDITS_PENDING');
      evidence.cases.push(Object.assign({}, priorManagerCase, {
        evidenceSource: `prior-run:${priorSubmitEvidence.runId}`
      }));
    } else {
      const managerEditMessage = await assertManagerCanEdit(managerSession.page, submitDraft.documentId, submitDraft.marker);
      evidence.cases.push({ case: 'SAME_BRANCH_MANAGER_EDITS_PENDING', status: 'PASS', detail: managerEditMessage });
    }

    const cancelDraft = EXISTING_CANCEL_ORDER
      ? { documentId: EXISTING_CANCEL_ORDER, marker: EXISTING_CANCEL_MARKER || `UAT RESUMED ${EXISTING_CANCEL_ORDER}` }
      : await createDraft(saleSession.page, scopedData, 'CANCEL');
    evidence.createdOrders.push({ documentId: cancelDraft.documentId, intendedFinalStatus: 'CANCELLED', marker: cancelDraft.marker });
    evidence.cases.push({ case: 'SECOND_DRAFT_CREATED_FOR_CANCEL', status: 'PASS', documentId: cancelDraft.documentId });

    const nonOwnerMessage = await assertNonOwnerBlocked(otherSaleSession.page, cancelDraft.documentId);
    evidence.cases.push({ case: 'OTHER_SALE_CANNOT_EDIT_DRAFT', status: 'PASS', detail: nonOwnerMessage });

    await openOwnerActions(saleSession.page, cancelDraft.documentId, 'CANCEL_04');
    const cancelMutation = await doubleClickTransition(
      saleSession.page,
      '#btn-cancel-draft-order',
      'OWNER_CANCEL_DOUBLE_CLICK',
      'CANCEL_05_DOUBLE_CLICK_ONE_TRANSITION.png'
    );
    evidence.cases.push({ case: 'CANCEL_DOUBLE_CLICK_ONE_REQUEST', status: 'PASS', requestId: cancelMutation.requestId,
      idempotencyKey: cancelMutation.idempotencyKey });

    await assertOwnerActionsStayClosed(
      saleSession.page,
      cancelDraft.documentId,
      'OWNER_ACTIONS_CLOSED_AFTER_CANCEL',
      'CANCEL_06_OWNER_ACTIONS_STAY_CLOSED.png'
    );
    evidence.cases.push({ case: 'CANCELLED_ORDER_ACTIONS_STAY_CLOSED', status: 'PASS' });

    evidence.status = 'PASS';
  } catch (error) {
    evidence.status = 'FAIL';
    evidence.error = { name: error.name, message: error.message, stack: error.stack };
    throw error;
  } finally {
    evidence.finishedAt = new Date().toISOString();
    fs.writeFileSync(path.join(REPORT_DIR, 'ORDER-APPROVAL-005-006_UI_EVIDENCE.json'), JSON.stringify(evidence, null, 2));
    await browser.close();
  }

  console.log(JSON.stringify({
    Task: evidence.task,
    Status: evidence.status,
    RunID: evidence.runId,
    Accounts: evidence.accounts,
    Orders: evidence.createdOrders,
    Cases: evidence.cases,
    NetworkRequestCount: evidence.network.length,
    EvidenceDir: REPORT_DIR
  }, null, 2));
}

main().catch(error => {
  console.error(JSON.stringify({ Task: 'ORDER-APPROVAL-005-006-UI-E2E', Status: 'FAIL', Error: error.message }, null, 2));
  process.exitCode = 1;
});
