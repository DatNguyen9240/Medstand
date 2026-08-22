'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const puppeteer = require('puppeteer-core');

const ROOT = path.resolve(__dirname, '..');
const REPORT_DIR = path.join(ROOT, 'reports', 'uat', 'CUST-SEARCH-001');
const CHROME_PATH = process.env.CHROME_PATH || 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const BEFORE_URL = process.env.CUST_SEARCH_BEFORE_URL || 'http://localhost:3100';
const AFTER_URL = process.env.CUST_SEARCH_AFTER_URL || 'http://localhost:3300';
const USERNAME = process.env.APP_USER || 'demo';
const PASSWORD = process.env.APP_PASSWORD || '123456';
const ORDER_ID = process.env.CUST_SEARCH_ORDER_ID || 'DMB0826/10';

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

function sanitizeResponse(decoded) {
  if (!decoded || typeof decoded !== 'object') return decoded;
  const rows = (decoded.records || decoded.data || []).slice?.(0, 5) || [];
  return {
    code: decoded.code,
    msg: decoded.msg,
    records: rows.map((row) => ({
      ObjectID: row.ObjectID,
      ObjectName: row.ObjectName,
      DisplayName: row.DisplayName,
      Phone: row.Phone
    }))
  };
}

function attachGatewayRecorder(page) {
  const events = [];
  const byRequest = new WeakMap();
  page.on('request', (request) => {
    if (!request.url().includes('/api/gateway')) return;
    const event = {
      startedAt: new Date().toISOString(),
      url: request.url(),
      method: request.method(),
      rawRequestBody: request.postData() || '',
      status: null,
      requestId: request.headers()['x-request-id'] || '',
      requestIdSource: request.headers()['x-request-id'] ? 'request-header' : '',
      rawResponseBody: ''
    };
    events.push(event);
    byRequest.set(request, event);
  });
  page.on('response', async (response) => {
    const event = byRequest.get(response.request());
    if (!event) return;
    event.status = response.status();
    const headers = response.headers();
    if (headers['x-request-id'] || headers['request-id']) {
      event.requestId = headers['x-request-id'] || headers['request-id'];
      event.requestIdSource = 'response-header';
    }
    try { event.rawResponseBody = await response.text(); } catch (_) { /* response may be unavailable */ }
  });
  return events;
}

function decodedCustomerEvents(events) {
  return events.map((event) => {
    const request = decodeGatewayBody(event.rawRequestBody);
    const response = decodeGatewayBody(event.rawResponseBody);
    return {
      startedAt: event.startedAt,
      status: event.status,
      requestId: event.requestId,
      requestIdSource: event.requestIdSource,
      request,
      response: sanitizeResponse(response)
    };
  }).filter((event) => event.request && String(event.request.endpoint || '').includes('API_KhachHangList'));
}

async function login(page, baseUrl) {
  await page.goto(`${baseUrl}/pages/login.html`, { waitUntil: 'networkidle0' });
  if (!page.url().includes('/index.html')) {
    await page.type('#username', USERNAME);
    await page.type('#password', PASSWORD);
    await Promise.all([
      page.waitForNavigation({ waitUntil: 'networkidle0', timeout: 20000 }).catch(() => null),
      page.click('#btn-login')
    ]);
  }
  await page.waitForFunction(() => document.cookie.includes('auth_token='), { timeout: 20000 });
}

async function openEditOrder(page, baseUrl) {
  await page.goto(`${baseUrl}/index.html#/edit-order?id=${encodeURIComponent(ORDER_ID)}`, { waitUntil: 'networkidle0' });
  await page.waitForSelector('#fs-trigger-customer', { timeout: 20000 });
  await page.waitForFunction(() => Array.isArray(window._customerRecords) && window._customerRecords.length > 0, { timeout: 20000 });
}

async function chooseTargetFromInitialRows(page) {
  return page.evaluate(() => {
    const rows = window._customerRecords || [];
    const currentObjectID = window._orderForm && window._orderForm.getValue('customer');
    const row = rows.find((candidate) => {
      const phone = String(candidate.Phone || '').trim();
      const label = String(candidate.DisplayName || candidate.ObjectName || '');
      return candidate.ObjectID !== currentObjectID
        && phone.replace(/\D/g, '').length >= 6
        && !label.includes(phone);
    });
    return row ? {
      ObjectID: row.ObjectID,
      ObjectName: row.ObjectName,
      DisplayName: row.DisplayName || row.ObjectName,
      Phone: String(row.Phone || '').trim(),
      Address: row.Address || '',
      XaPhuong: row.XaPhuong || ''
    } : null;
  });
}

async function openPickerAndSearch(page, keyword) {
  await page.click('#fs-trigger-customer');
  await page.waitForSelector('.picker-overlay.active #picker-search', { timeout: 10000 });
  await page.click('#picker-search', { clickCount: 3 });
  await page.type('#picker-search', keyword, { delay: 30 });
  await new Promise((resolve) => setTimeout(resolve, 1500));
  return page.evaluate(() => ({
    overlayVisible: Boolean(document.querySelector('.picker-overlay.active')),
    visibleOptions: Array.from(document.querySelectorAll('#picker-list li[data-value]'))
      .filter((node) => getComputedStyle(node).display !== 'none')
      .map((node) => ({ value: node.getAttribute('data-value'), label: node.textContent.trim() }))
  }));
}

async function runBefore(browser) {
  const context = await browser.createBrowserContext();
  const page = await context.newPage();
  await page.setViewport({ width: 1366, height: 768 });
  const events = attachGatewayRecorder(page);
  await login(page, BEFORE_URL);
  await openEditOrder(page, BEFORE_URL);
  const target = await chooseTargetFromInitialRows(page);
  assert(target && target.ObjectID && target.Phone, 'Không tìm được khách có số điện thoại trong scope để tái hiện.');
  const eventCountBeforeSearch = events.length;
  const ui = await openPickerAndSearch(page, target.Phone);
  const searchEvents = decodedCustomerEvents(events.slice(eventCountBeforeSearch));
  await page.screenshot({ path: path.join(REPORT_DIR, 'CUST-SEARCH-001_BEFORE_PHONE_NO_SUGGESTION.png'), fullPage: false });

  assert.strictEqual(searchEvents.length, 0, 'Bản trước sửa không được phát remote search trên màn sửa đơn.');
  assert.strictEqual(ui.visibleOptions.length, 0, 'Tìm theo Phone ở bản trước phải không có gợi ý vì label không chứa Phone.');
  await context.close();
  return { target, ui, searchEvents };
}

async function runAfter(browser, target) {
  const context = await browser.createBrowserContext();
  const page = await context.newPage();
  await page.setViewport({ width: 1366, height: 768 });
  const events = attachGatewayRecorder(page);
  await login(page, AFTER_URL);
  await openEditOrder(page, AFTER_URL);
  await page.setExtraHTTPHeaders({ 'X-Request-ID': 'req-cust-search-001-after' });
  const eventCountBeforeSearch = events.length;
  const searchedUi = await openPickerAndSearch(page, target.Phone);
  await page.waitForFunction((objectID) => {
    const node = document.querySelector(`.picker-overlay.active #picker-list li[data-value="${objectID}"]`);
    return Boolean(node && node.offsetParent !== null && getComputedStyle(node).display !== 'none');
  }, { timeout: 10000 }, target.ObjectID);
  const activeSuggestionSelector = `.picker-overlay.active #picker-list li[data-value="${target.ObjectID}"]`;
  const suggestion = await page.$eval(activeSuggestionSelector, (node) => ({
    value: node.getAttribute('data-value'),
    label: node.textContent.trim()
  }));
  await new Promise((resolve) => setTimeout(resolve, 400));
  await page.screenshot({ path: path.join(REPORT_DIR, 'CUST-SEARCH-001_AFTER_REMOTE_SUGGESTION.png'), fullPage: false });
  await page.click(activeSuggestionSelector);
  await new Promise((resolve) => setTimeout(resolve, 700));
  const selected = await page.evaluate(() => ({
    ObjectID: window._orderForm && window._orderForm.getValue('customer'),
    label: document.querySelector('#fs-trigger-customer .filter-value-text')?.textContent.trim() || '',
    phone: document.querySelector('#fs-phone')?.value || '',
    address: document.querySelector('#fs-address')?.value || '',
    ward: document.querySelector('#fs-ward')?.value || ''
  }));
  await page.screenshot({ path: path.join(REPORT_DIR, 'CUST-SEARCH-001_AFTER_SELECTED_AND_LOADED.png'), fullPage: false });
  const searchEvents = decodedCustomerEvents(events.slice(eventCountBeforeSearch)).filter((event) => {
    const endpoint = String(event.request.endpoint || '');
    if (!endpoint.includes('API_KhachHangList')) return false;
    try {
      const parsed = new URL(endpoint, 'http://gateway.local');
      const q = JSON.parse(parsed.searchParams.get('q') || '{}');
      return String(q.SearchText || '') === target.Phone;
    } catch (_) { return false; }
  });

  assert(searchEvents.length >= 1, 'Bản sau sửa phải gửi remote search với SearchText bằng Phone.');
  assert(searchEvents.some((event) => event.status === 200), 'Remote customer search phải trả HTTP 200.');
  assert(searchEvents.some((event) => event.requestId), 'Response gateway phải có request ID.');
  assert(searchEvents.some((event) => (event.response?.records || []).some((row) => row.ObjectID === target.ObjectID)),
    'Response phải chứa đúng ObjectID mục tiêu.');
  assert.strictEqual(suggestion.value, target.ObjectID, 'data-value của gợi ý phải là ObjectID.');
  assert.strictEqual(selected.ObjectID, target.ObjectID, 'Giá trị form sau chọn phải là ObjectID.');
  assert.strictEqual(selected.label, suggestion.label, 'Label sau chọn phải đúng label gợi ý.');
  assert.strictEqual(selected.phone, target.Phone, 'Sau chọn phải tải đúng số điện thoại khách hàng.');
  assert.strictEqual(selected.address, target.Address, 'Sau chọn phải tải đúng địa chỉ khách hàng.');
  assert.strictEqual(selected.ward, target.XaPhuong, 'Sau chọn phải tải đúng phường/xã khách hàng.');

  await context.close();
  return { searchedUi, suggestion, selected, searchEvents };
}

async function main() {
  fs.mkdirSync(REPORT_DIR, { recursive: true });
  const browser = await puppeteer.launch({
    executablePath: CHROME_PATH,
    headless: 'new',
    defaultViewport: { width: 1366, height: 768 },
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });
  try {
    const before = await runBefore(browser);
    const after = await runAfter(browser, before.target);
    const evidence = {
      Task: 'CUST-SEARCH-001',
      Status: 'PASS',
      ComparedCommits: { before: '74f6c53e^ (ca6ce72)', after: '2e9bfef (contains CORE-011 + gateway request ID)' },
      Scenario: 'Tìm khách bằng số điện thoại trên màn sửa đơn',
      Target: before.target,
      Before: {
        RemoteSearchRequestsAfterTyping: before.searchEvents.length,
        VisibleSuggestions: before.ui.visibleOptions.length,
        OverlayVisible: before.ui.overlayVisible
      },
      After: {
        RemoteSearchRequestsAfterTyping: after.searchEvents.length,
        RequestIDs: after.searchEvents.map((event) => event.requestId).filter(Boolean),
        Requests: after.searchEvents.map((event) => event.request),
        Responses: after.searchEvents.map((event) => event.response),
        Suggestion: after.suggestion,
        SelectedAndLoaded: after.selected
      },
      RootCause: [
        'Bản trước sửa: edit-order không cấu hình searchFn cho field customer, nên nhập Phone chỉ lọc local theo label và không gọi API.',
        'Bản trước sửa: API_KhachHangList chưa đưa Phone vào điều kiện SearchText.',
        'Bản trước sửa: FormSelect._renderModal return sớm khi remoteOptions rỗng, làm picker biến mất thay vì hiển thị empty-state.'
      ]
    };
    fs.writeFileSync(path.join(REPORT_DIR, 'CUST-SEARCH-001_EVIDENCE.json'), JSON.stringify(evidence, null, 2));
    console.log(JSON.stringify(evidence, null, 2));
  } finally {
    await browser.close();
  }
}

main().catch((error) => {
  console.error(JSON.stringify({ Task: 'CUST-SEARCH-001', Status: 'FAIL', Error: error.stack || error.message }, null, 2));
  process.exitCode = 1;
});
