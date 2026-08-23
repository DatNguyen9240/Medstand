'use strict';

/*
 * CUST-SEARCH-003 — các ca E2E còn thiếu sau verifier race chính:
 *   1. Request tìm kiếm HIỆN TẠI lỗi, sau đó người dùng retry thành công (create/edit order).
 *   2. Đăng xuất tài khoản A rồi đăng nhập B trong cùng browser context; cache/dữ liệu A
 *      không được tồn tại trong phiên B.
 *   3. Khách đại diện của A không xuất hiện trong scope B và ngược lại.
 *
 * Tất cả thao tác nghiệp vụ đều read-only. SQL chỉ dùng làm oracle phạm vi, không thay thế
 * bằng chứng UI/gateway. Evidence không lưu password, token hoặc nội dung khách nhạy cảm.
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const sql = require('mssql');
const puppeteer = require('puppeteer-core');
const { getRequiredUatPassword } = require('./lib/uat-test-config');

const ROOT = path.resolve(__dirname, '..');
const REPORT_DIR = path.join(ROOT, 'reports', 'uat', 'CUST-SEARCH-003');
const EVIDENCE_PATH = path.join(REPORT_DIR, 'CUST-SEARCH-003_REMAINING_E2E_EVIDENCE.json');
const BASE_URL = process.env.CUST_SEARCH_URL || 'http://localhost:3000';
const CHROME_PATH = process.env.CHROME_PATH || 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const COMMON_PASSWORD = getRequiredUatPassword(['CUST_SEARCH_PASSWORD']);

const RETRY_ACCOUNT = {
  user: process.env.CUST_SEARCH_RETRY_USER || 'demo',
  password: process.env.CUST_SEARCH_RETRY_PASSWORD || COMMON_PASSWORD,
  customer: process.env.CUST_SEARCH_RETRY_CUSTOMER || 'HNBV356',
  orderId: process.env.CUST_SEARCH_ORDER_ID || 'DMB0826/10'
};
const ACCOUNT_A = {
  user: process.env.CUST_SEARCH_USER_A || 'NAMDINHB.MED',
  password: process.env.CUST_SEARCH_PASSWORD_A || COMMON_PASSWORD,
  ownCustomer: process.env.CUST_SEARCH_CUSTOMER_A || 'NDB001'
};
const ACCOUNT_B = {
  user: process.env.CUST_SEARCH_USER_B || 'BACNINHA.MED',
  password: process.env.CUST_SEARCH_PASSWORD_B || COMMON_PASSWORD,
  ownCustomer: process.env.CUST_SEARCH_CUSTOMER_B || 'BNA051'
};
const EDIT_SCOPE_ACCOUNT = {
  user: process.env.CUST_SEARCH_EDIT_SCOPE_USER || 'QLBH013.MED',
  password: process.env.CUST_SEARCH_EDIT_SCOPE_PASSWORD || COMMON_PASSWORD,
  ownCustomer: process.env.CUST_SEARCH_EDIT_SCOPE_OWN_CUSTOMER || ACCOUNT_A.ownCustomer,
  crossCustomer: process.env.CUST_SEARCH_EDIT_SCOPE_CROSS_CUSTOMER || ACCOUNT_B.ownCustomer,
  orderId: process.env.CUST_SEARCH_EDIT_SCOPE_ORDER_ID || 'DMB0826/11'
};

const RUN_ID = new Date().toISOString().replace(/[-:.TZ]/g, '').slice(0, 14);
let requestSequence = 0;

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function readEnv() {
  const values = {};
  const envPath = path.join(ROOT, '.env');
  if (fs.existsSync(envPath)) {
    for (const line of fs.readFileSync(envPath, 'utf8').split(/\r?\n/)) {
      const match = line.match(/^\s*([^#=]+)=(.*)$/);
      if (match) values[match[1].trim()] = match[2].trim();
    }
  }
  return { ...values, ...process.env };
}

function decrypt(cipherText, key = 107) {
  const xor = Buffer.from(String(cipherText || ''), 'base64').toString('latin1');
  let base64 = '';
  for (let i = 0; i < xor.length; i += 1) base64 += String.fromCharCode(xor.charCodeAt(i) ^ key);
  return Buffer.from(base64, 'base64').toString('utf8');
}

function decodeGatewayBody(rawBody) {
  try {
    const envelope = JSON.parse(rawBody || '{}');
    return JSON.parse(decrypt(envelope.data));
  } catch (_) {
    return null;
  }
}

function gatewayRequestInfo(request) {
  if (request.method() !== 'POST' || !request.url().includes('/api/gateway')) return null;
  const decoded = decodeGatewayBody(request.postData());
  if (!decoded) return { endpoint: null, searchText: null, user: null };
  let query = {};
  try {
    const url = new URL(decoded.endpoint || '', 'http://gateway.local');
    query = JSON.parse(url.searchParams.get('q') || '{}');
  } catch (_) {}
  return {
    endpoint: decoded.endpoint || null,
    searchText: String(query.SearchText || ''),
    user: String(query.User || query.Username || '')
  };
}

async function attachNetworkEvidence(page, role) {
  await page.setRequestInterception(true);
  const events = [];
  const byRequest = new WeakMap();
  const state = { failKeyword: null, failConsumed: false };

  page.on('request', (request) => {
    const info = gatewayRequestInfo(request);
    if (!info) {
      request.continue().catch(() => {});
      return;
    }

    requestSequence += 1;
    const requestId = `req-cust003-${RUN_ID}-${role}-${requestSequence}`;
    const event = {
      requestId,
      at: new Date().toISOString(),
      endpoint: info.endpoint,
      searchText: info.searchText,
      declaredUser: info.user || null,
      action: 'FORWARD',
      httpStatus: null
    };
    events.push(event);
    byRequest.set(request, event);

    if (info.endpoint && info.endpoint.includes('API_KhachHangList')
        && state.failKeyword && info.searchText === state.failKeyword && !state.failConsumed) {
      state.failConsumed = true;
      event.action = 'FORCED_CURRENT_REQUEST_500';
      event.httpStatus = 500;
      setTimeout(() => {
        request.respond({
          status: 500,
          contentType: 'application/json',
          body: JSON.stringify({ error: 'CUST_SEARCH_003_FORCED_CURRENT_ERROR', requestId })
        }).catch(() => {});
      }, 250);
      return;
    }

    request.continue({ headers: { ...request.headers(), 'x-request-id': requestId } }).catch(() => {});
  });

  page.on('response', (response) => {
    const event = byRequest.get(response.request());
    if (event && event.httpStatus === null) event.httpStatus = response.status();
  });

  return { events, state };
}

async function login(page, account) {
  await page.goto(`${BASE_URL}/pages/login.html`, { waitUntil: 'networkidle0', timeout: 30000 });
  if (!page.url().includes('/pages/login.html')) {
    throw new Error(`LOGIN_PRECONDITION_FAILED: ${account.user} gặp phiên đăng nhập cũ tại ${page.url()}`);
  }
  await page.type('#username', account.user);
  await page.type('#password', account.password);
  await Promise.all([
    page.waitForNavigation({ waitUntil: 'networkidle0', timeout: 30000 }).catch(() => null),
    page.click('#btn-login')
  ]);
  try {
    await page.waitForFunction((expected) => {
      if (!document.cookie.includes('auth_token=')) return false;
      try {
        const user = JSON.parse(localStorage.getItem('auth_user') || '{}');
        return String(user.UserName || user.Username || '').toLowerCase() === String(expected).toLowerCase();
      } catch (_) { return false; }
    }, { timeout: 20000 }, account.user);
  } catch (error) {
    const debug = await page.evaluate(() => {
      const el = document.querySelector('#login-error');
      let stored = {};
      try { stored = JSON.parse(localStorage.getItem('auth_user') || '{}'); } catch (_) {}
      return {
        message: el ? el.textContent.trim() : '',
        url: location.href,
        cookiePresent: document.cookie.includes('auth_token='),
        storedUser: stored.UserName || stored.Username || stored.username || null,
        usernameInput: (document.querySelector('#username') || {}).value || null
      };
    }).catch(() => ({ message: '', url: page.url() }));
    throw new Error(`LOGIN_FAILED: ${account.user}; state=${JSON.stringify(debug)}`);
  }
}

async function openCustomerPicker(page) {
  await page.waitForSelector('#fs-trigger-customer', { timeout: 30000 });
  await page.evaluate(() => {
    document.querySelectorAll('.picker-overlay').forEach((node) => node.remove());
    const trigger = document.querySelector('#fs-trigger-customer');
    if (trigger) trigger.scrollIntoView({ block: 'center' });
  });
  await page.click('#fs-trigger-customer');
  let picker = await page.waitForSelector('.picker-overlay #picker-search', { timeout: 3000 }).catch(() => null);
  if (!picker) {
    // Một số lượt headless còn global spinner vừa đóng tại đúng toạ độ click. Kích hoạt lại
    // chính DOM click handler mà người dùng gọi, không gọi trực tiếp _openPicker/helper.
    await page.evaluate(() => document.querySelector('#fs-trigger-customer').click());
    picker = await page.waitForSelector('.picker-overlay #picker-search', { timeout: 12000 }).catch(() => null);
  }
  assert(picker, `Không mở được customer picker tại ${page.url()}.`);
  await page.waitForFunction(() => document.querySelector('.picker-overlay #picker-search') !== null, { timeout: 5000 });
}

async function searchPicker(page, keyword) {
  await page.evaluate((value) => {
    const input = document.querySelector('.picker-overlay #picker-search');
    if (!input) throw new Error('Không tìm thấy picker-search đang mở.');
    input.focus();
    input.value = value;
    input.dispatchEvent(new Event('input', { bubbles: true }));
  }, keyword);
}

async function waitForOption(page, objectId) {
  await page.waitForFunction((id) => {
    const node = document.querySelector(`.picker-overlay #picker-list li[data-value="${id}"]`);
    if (!node) return false;
    const style = window.getComputedStyle(node);
    return style.display !== 'none' && style.visibility !== 'hidden' && node.getClientRects().length > 0;
  }, { timeout: 15000 }, objectId).catch(() => {
    throw new Error(`OPTION_TIMEOUT: picker không hiển thị ${objectId} tại ${page.url()}`);
  });
}

async function waitForEmpty(page) {
  await page.waitForFunction(() => Boolean(
    document.querySelector('.picker-overlay #picker-list .picker-empty')
  ), { timeout: 15000 }).catch(() => {
    throw new Error(`EMPTY_STATE_TIMEOUT: picker không render empty-state tại ${page.url()}`);
  });
}

async function pickerValues(page) {
  return page.evaluate(() => Array.from(
    document.querySelectorAll('.picker-overlay #picker-list li[data-value]')
  ).filter((node) => {
    const style = window.getComputedStyle(node);
    return style.display !== 'none' && style.visibility !== 'hidden' && node.getClientRects().length > 0;
  }).map((node) => node.getAttribute('data-value')));
}

async function chooseCustomer(page, objectId) {
  // Remote render chèn <li> trước rồi mới gắn handler click ở cuối _renderModal; chờ một nhịp
  // để không click vào khoảng cực ngắn DOM đã có nhưng handler chưa bind xong.
  await delay(100);
  await page.click(`.picker-overlay #picker-list li[data-value="${objectId}"]`);
  await page.waitForFunction((id) => {
    const form = window.orderForm || window._orderForm;
    return Boolean(form && form.getValue('customer') === id);
  }, { timeout: 10000 }, objectId).catch(async () => {
    const state = await page.evaluate(() => ({
      hasOrderForm: Boolean(window.orderForm),
      hasUnderscoreOrderForm: Boolean(window._orderForm),
      label: (document.querySelector('#fs-trigger-customer .filter-value-text') || {}).textContent || '',
      pickerCount: document.querySelectorAll('.picker-overlay').length
    }));
    throw new Error(`CUSTOMER_SELECTION_TIMEOUT: ${objectId}; state=${JSON.stringify(state)}`);
  });
}

async function customerMapping(page, objectId) {
  return page.evaluate((id) => {
    const rows = window._customersCache || window._customerRecords || [];
    const expected = rows.find((row) => String(row.ObjectID) === String(id)) || {};
    const form = window.orderForm || window._orderForm;
    const actual = {
      customer: form ? form.getValue('customer') : '',
      phone: form ? form.getValue('phone') : '',
      address: form ? form.getValue('address') : '',
      ward: form ? form.getValue('ward') : '',
      route: form ? form.getValue('route') : '',
      label: (document.querySelector('#fs-trigger-customer .filter-value-text') || {}).textContent || ''
    };
    const normalizedExpected = {
      phone: String(expected.Phone || ''),
      address: String(expected.Address || ''),
      ward: String(expected.XaPhuong || ''),
      route: String(expected.ThuDiTuyen || expected.ThuTrongTuan || '')
    };
    // Tuyến của đơn được tính từ Ngày CT hoặc giữ từ đơn đang sửa; không phải mọi response
    // khách hàng đều có ThuDiTuyen. Khi oracle khách không có trường này, yêu cầu UI giữ một
    // tuyến hợp lệ thay vì so với chuỗi rỗng.
    const routeMatches = normalizedExpected.route
      ? actual.route === normalizedExpected.route
      : Boolean(actual.route);
    const fieldMatches = {
      customer: actual.customer === id,
      phone: actual.phone === normalizedExpected.phone,
      address: actual.address === normalizedExpected.address,
      ward: actual.ward === normalizedExpected.ward,
      route: routeMatches
    };
    return {
      objectId: id,
      selectedValueMatches: fieldMatches.customer,
      labelIncludesObjectId: actual.label.includes(id),
      fieldPresence: {
        phone: Boolean(actual.phone),
        address: Boolean(actual.address),
        ward: Boolean(actual.ward),
        route: Boolean(actual.route)
      },
      fieldMatches,
      matches: Object.values(fieldMatches).every(Boolean)
    };
  }, objectId);
}

async function maskCustomerFieldsForScreenshot(page) {
  await page.evaluate(() => {
    [
      '#fs-trigger-customer .filter-value-text',
      '#fs-trigger-ward .filter-value-text'
    ].forEach((selector) => {
      const element = document.querySelector(selector);
      if (element) element.textContent = '[REDACTED]';
    });
    ['#fs-phone', '#fs-address', '#fs-ward'].forEach((selector) => {
      const element = document.querySelector(selector);
      if (element) element.value = '[REDACTED]';
    });
  });
}

async function runCurrentErrorRetry(browser, screenName, route, readySelector) {
  const context = await browser.createBrowserContext();
  const page = await context.newPage();
  await page.setViewport({ width: 1366, height: 768 });
  const net = await attachNetworkEvidence(page, `retry-${screenName}`);
  try {
    await login(page, RETRY_ACCOUNT);
    await page.goto(`${BASE_URL}${route}`, { waitUntil: 'networkidle0', timeout: 30000 });
    await page.waitForSelector(readySelector, { timeout: 30000 });
    await openCustomerPicker(page);

    const failKeyword = `Fail${screenName === 'create-order' ? 'Create' : 'Edit'}`;
    net.state.failKeyword = failKeyword;
    await searchPicker(page, failKeyword);
    await waitForEmpty(page);
    assert.strictEqual(net.state.failConsumed, true, `[${screenName}] request lỗi hiện tại phải bị bắt và trả 500.`);

    const toastAfterCurrentError = await page.evaluate(() => Boolean(
      document.querySelector('.swal2-popup.swal2-icon-error, .alert-toast.toast-error')
    ));
    await searchPicker(page, RETRY_ACCOUNT.customer);
    await waitForOption(page, RETRY_ACCOUNT.customer);
    const optionsAfterRetry = await pickerValues(page);
    await chooseCustomer(page, RETRY_ACCOUNT.customer);
    const mapping = await customerMapping(page, RETRY_ACCOUNT.customer);
    assert(mapping.matches, `[${screenName}] retry chọn khách nhưng các trường map không khớp record API: ${JSON.stringify(mapping)}`);

    const retryEvent = net.events.find((event) => event.searchText === RETRY_ACCOUNT.customer && event.action === 'FORWARD');
    assert(retryEvent && retryEvent.httpStatus === 200,
      `[${screenName}] retry phải đi qua gateway thật và nhận HTTP 200.`);

    const screenshot = `REMAINING_${screenName}_CURRENT_ERROR_RETRY_PASS.png`;
    await maskCustomerFieldsForScreenshot(page);
    await page.screenshot({ path: path.join(REPORT_DIR, screenshot), fullPage: false });
    return {
      status: 'PASS',
      failKeyword,
      currentErrorRenderedEmptyState: true,
      toastAfterCurrentError,
      retryCustomer: RETRY_ACCOUNT.customer,
      retryOptionsContainCustomer: optionsAfterRetry.includes(RETRY_ACCOUNT.customer),
      retryRequestId: retryEvent.requestId,
      retryHttpStatus: retryEvent.httpStatus,
      mapping,
      screenshot,
      network: net.events.filter((event) => event.endpoint && event.endpoint.includes('API_KhachHangList'))
    };
  } finally {
    await context.close();
  }
}

async function cacheKeys(page) {
  return page.evaluate(() => Object.keys(sessionStorage).filter(
    (key) => key.startsWith('_hc_') && key.includes('API_KhachHangList')
  ));
}

async function searchExpectAbsent(page, objectId) {
  await openCustomerPicker(page);
  await searchPicker(page, objectId);
  await waitForEmpty(page);
  const values = await pickerValues(page);
  assert(!values.includes(objectId), `Khách ngoài scope ${objectId} vẫn xuất hiện trong picker.`);
  await page.click('.picker-overlay #picker-close');
  return { objectId, absent: true };
}

async function searchAndChoose(page, objectId) {
  await openCustomerPicker(page);
  await searchPicker(page, objectId);
  await waitForOption(page, objectId);
  await chooseCustomer(page, objectId);
  const mapping = await customerMapping(page, objectId);
  assert(mapping.matches, `Các trường sau chọn khách ${objectId} không khớp record API: ${JSON.stringify(mapping)}`);
  return mapping;
}

async function runCrossAccountScope(browser) {
  const context = await browser.createBrowserContext();
  const page = await context.newPage();
  await page.setViewport({ width: 1366, height: 768 });
  const net = await attachNetworkEvidence(page, 'account-switch');
  try {
    await login(page, ACCOUNT_A);
    await page.goto(`${BASE_URL}/index.html#/create-order`, { waitUntil: 'networkidle0', timeout: 30000 });
    await page.waitForSelector('#fs-trigger-customer', { timeout: 30000 });

    const aCannotSeeB = await searchExpectAbsent(page, ACCOUNT_B.ownCustomer);
    const mappingA = await searchAndChoose(page, ACCOUNT_A.ownCustomer);
    const cacheA = await cacheKeys(page);
    assert(cacheA.length > 0, 'Tài khoản A phải tạo cache tìm kiếm để kiểm tra logout thực sự dọn cache.');
    await maskCustomerFieldsForScreenshot(page);
    await page.screenshot({ path: path.join(REPORT_DIR, 'REMAINING_ACCOUNT_A_SELECTED.png'), fullPage: false });

    await page.click('.sidebar-logout-btn');
    await page.waitForFunction(() => location.pathname.includes('/pages/login.html'), { timeout: 15000 });
    const afterLogout = await page.evaluate(() => ({
      customerCacheKeys: Object.keys(sessionStorage).filter((key) => key.includes('API_KhachHangList')),
      authUserPresent: Boolean(localStorage.getItem('auth_user')),
      authCookiePresent: document.cookie.includes('auth_token=')
    }));
    assert.strictEqual(afterLogout.customerCacheKeys.length, 0, 'Logout phải xóa cache khách hàng của tài khoản A.');
    assert.strictEqual(afterLogout.authUserPresent, false, 'Logout phải xóa auth_user của tài khoản A.');
    assert.strictEqual(afterLogout.authCookiePresent, false, 'Logout phải xóa auth cookie của tài khoản A.');

    await login(page, ACCOUNT_B);
    await page.goto(`${BASE_URL}/index.html#/create-order`, { waitUntil: 'networkidle0', timeout: 30000 });
    await page.waitForSelector('#fs-trigger-customer', { timeout: 30000 });

    const bCannotSeeA = await searchExpectAbsent(page, ACCOUNT_A.ownCustomer);
    const mappingB = await searchAndChoose(page, ACCOUNT_B.ownCustomer);
    const cacheB = await cacheKeys(page);
    assert(cacheB.length > 0, 'Tài khoản B phải có cache tìm kiếm của chính mình.');
    assert(cacheB.every((key) => !key.toLowerCase().includes(ACCOUNT_A.user.toLowerCase())),
      'Phiên B vẫn còn cache key mang username của A.');
    assert(cacheB.some((key) => key.toLowerCase().includes(ACCOUNT_B.user.toLowerCase())),
      'Cache tìm kiếm của B phải chứa identity B trong URL hiện hành.');

    await maskCustomerFieldsForScreenshot(page);
    await page.screenshot({ path: path.join(REPORT_DIR, 'REMAINING_ACCOUNT_B_SELECTED.png'), fullPage: false });
    return {
      status: 'PASS',
      accountA: ACCOUNT_A.user,
      accountB: ACCOUNT_B.user,
      aCannotSeeB,
      bCannotSeeA,
      mappingA,
      mappingB,
      cacheAEntryCountBeforeLogout: cacheA.length,
      afterLogout,
      cacheBEntryCount: cacheB.length,
      cacheBContainsAccountA: false,
      cacheBContainsAccountB: true,
      network: net.events.filter((event) => event.endpoint && event.endpoint.includes('API_KhachHangList'))
    };
  } finally {
    await context.close();
  }
}

async function runEditOrderOutsideScope(browser) {
  const context = await browser.createBrowserContext();
  const page = await context.newPage();
  await page.setViewport({ width: 1366, height: 768 });
  const net = await attachNetworkEvidence(page, 'edit-scope');
  try {
    await login(page, EDIT_SCOPE_ACCOUNT);
    await page.goto(
      `${BASE_URL}/index.html#/edit-order?id=${encodeURIComponent(EDIT_SCOPE_ACCOUNT.orderId)}`,
      { waitUntil: 'networkidle0', timeout: 30000 }
    );
    await page.waitForSelector('#fs-trigger-customer', { timeout: 30000 });

    const cannotSeeCrossScope = await searchExpectAbsent(page, EDIT_SCOPE_ACCOUNT.crossCustomer);
    const ownCustomerMapping = await searchAndChoose(page, EDIT_SCOPE_ACCOUNT.ownCustomer);
    await maskCustomerFieldsForScreenshot(page);
    const screenshot = 'REMAINING_EDIT_ORDER_OUTSIDE_SCOPE_PASS.png';
    await page.screenshot({ path: path.join(REPORT_DIR, screenshot), fullPage: false });

    return {
      status: 'PASS',
      account: EDIT_SCOPE_ACCOUNT.user,
      orderId: EDIT_SCOPE_ACCOUNT.orderId,
      cannotSeeCrossScope,
      ownCustomerMapping,
      screenshot,
      network: net.events.filter((event) => event.endpoint && event.endpoint.includes('API_KhachHangList'))
    };
  } finally {
    await context.close();
  }
}

async function verifyScopeOracle() {
  const env = readEnv();
  assert.strictEqual(String(env.TEST_DB_DATABASE || '').toLowerCase(), 'medtest',
    'Scope oracle chỉ được phép chạy read-only trên medtest.');
  const pool = await sql.connect({
    server: env.TEST_DB_SERVER,
    port: Number(env.TEST_DB_PORT || 1433),
    database: env.TEST_DB_DATABASE,
    user: env.TEST_DB_USER,
    password: env.TEST_DB_PASSWORD,
    options: { encrypt: false, trustServerCertificate: true },
    connectionTimeout: 15000,
    requestTimeout: 30000,
    pool: { max: 1, min: 0, idleTimeoutMillis: 10000 }
  });
  try {
    async function visibility(user, own, cross) {
      const row = (await pool.request()
        .input('UserName', sql.VarChar(50), user)
        .input('OwnCustomer', sql.VarChar(50), own)
        .input('CrossCustomer', sql.VarChar(50), cross)
        .query(`
SELECT
  CASE WHEN EXISTS (SELECT 1 FROM dbo.AR_GetObjectByUserFnc(@UserName) WHERE ObjectID = @OwnCustomer) THEN 1 ELSE 0 END AS OwnVisible,
  CASE WHEN EXISTS (SELECT 1 FROM dbo.AR_GetObjectByUserFnc(@UserName) WHERE ObjectID = @CrossCustomer) THEN 1 ELSE 0 END AS CrossVisible;`)).recordset[0];
      return { user, ownCustomer: own, crossCustomer: cross, ownVisible: Number(row.OwnVisible), crossVisible: Number(row.CrossVisible) };
    }
    const a = await visibility(ACCOUNT_A.user, ACCOUNT_A.ownCustomer, ACCOUNT_B.ownCustomer);
    const b = await visibility(ACCOUNT_B.user, ACCOUNT_B.ownCustomer, ACCOUNT_A.ownCustomer);
    const edit = await visibility(
      EDIT_SCOPE_ACCOUNT.user,
      EDIT_SCOPE_ACCOUNT.ownCustomer,
      EDIT_SCOPE_ACCOUNT.crossCustomer
    );
    assert.strictEqual(a.ownVisible, 1, 'Oracle: khách đại diện A phải nằm trong scope A.');
    assert.strictEqual(a.crossVisible, 0, 'Oracle: khách đại diện B phải nằm ngoài scope A.');
    assert.strictEqual(b.ownVisible, 1, 'Oracle: khách đại diện B phải nằm trong scope B.');
    assert.strictEqual(b.crossVisible, 0, 'Oracle: khách đại diện A phải nằm ngoài scope B.');
    assert.strictEqual(edit.ownVisible, 1, 'Oracle: edit account must see its representative in-scope customer.');
    assert.strictEqual(edit.crossVisible, 0, 'Oracle: edit account must not see the representative out-of-scope customer.');
    return { status: 'PASS', accountA: a, accountB: b, editOrderAccount: edit, readOnly: true };
  } finally {
    await pool.close();
  }
}

async function main() {
  fs.mkdirSync(REPORT_DIR, { recursive: true });
  const browser = await puppeteer.launch({
    executablePath: CHROME_PATH,
    headless: 'new',
    defaultViewport: { width: 1366, height: 768 },
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });

  const evidence = {
    Task: 'CUST-SEARCH-003-REMAINING-E2E',
    Status: 'RUNNING',
    Timestamp: new Date().toISOString(),
    BaseUrl: BASE_URL,
    MutationCount: 0,
    Cases: {}
  };

  try {
    evidence.Cases.ScopeOracle = await verifyScopeOracle();
    evidence.Cases.CreateOrderCurrentErrorRetry = await runCurrentErrorRetry(
      browser, 'create-order', '/index.html#/create-order', '#fs-trigger-customer'
    );
    evidence.Cases.EditOrderCurrentErrorRetry = await runCurrentErrorRetry(
      browser, 'edit-order', `/index.html#/edit-order?id=${encodeURIComponent(RETRY_ACCOUNT.orderId)}`, '#fs-trigger-customer'
    );
    evidence.Cases.CrossAccountAndOutsideScope = await runCrossAccountScope(browser);
    evidence.Cases.EditOrderOutsideScope = await runEditOrderOutsideScope(browser);
    evidence.Status = 'PASS';
    evidence.Summary = '5 PASS / 0 FAIL / 0 SKIPPED';
    fs.writeFileSync(EVIDENCE_PATH, JSON.stringify(evidence, null, 2));
    console.log(JSON.stringify({
      Task: evidence.Task,
      Status: evidence.Status,
      Summary: evidence.Summary,
      Evidence: path.relative(ROOT, EVIDENCE_PATH),
      Accounts: [ACCOUNT_A.user, ACCOUNT_B.user, EDIT_SCOPE_ACCOUNT.user],
      MutationCount: 0
    }, null, 2));
  } catch (error) {
    evidence.Status = 'FAIL';
    evidence.Error = error.message;
    fs.writeFileSync(EVIDENCE_PATH, JSON.stringify(evidence, null, 2));
    console.error(JSON.stringify({ Task: evidence.Task, Status: 'FAIL', Error: error.message }, null, 2));
    process.exitCode = 1;
  } finally {
    await browser.close();
  }
}

main().catch((error) => {
  console.error(JSON.stringify({ Task: 'CUST-SEARCH-003-REMAINING-E2E', Status: 'FAIL', Error: error.message }, null, 2));
  process.exitCode = 1;
});
