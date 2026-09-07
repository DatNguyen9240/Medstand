'use strict';

/* Xác nhận nhanh Phase 4.1 cho edit-order.js: searchFn khách hàng và searchProducts
   sản phẩm đã chuyển sang API_CustomerSearch_AI / API_ProductSearch_AI, không còn
   gọi API_KhachHangList / API_DanhMuc_AI cũ. Không lặp lại toàn bộ assertion đã có
   ở verify_search_003_004_web_e2e.js (create-order) vì hai trang dùng chung logic
   endpoint gần như y hệt — chỉ cần xác nhận đúng endpoint mới được gọi ở đây. */
const assert = require('assert');
const path = require('path');
const puppeteer = require('puppeteer-core');
const { getRequiredUatPassword } = require('./lib/uat-test-config');

const CHROME_PATH = process.env.CHROME_PATH || 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const BASE_URL = process.env.SEARCH_WEB_URL || 'http://localhost:3000';
const USERNAME = process.env.APP_USER || 'QLBH013.MED';
const PASSWORD = getRequiredUatPassword();
const ORDER_ID = process.env.EDIT_ORDER_ID || 'DMB0826/11'; // StatusID=0 'Chờ duyệt' — đủ điều kiện sửa
const DUP_CUSTOMER_KEYWORD = process.env.SEARCH_DUP_CUSTOMER || 'Tâm Đức';
const PRODUCT_KEYWORD = process.env.SEARCH_PRODUCT_KEYWORD || 'Aquamed';

function decrypt(cipherText, key = 107) {
  const xor = Buffer.from(String(cipherText || ''), 'base64').toString('latin1');
  let base64 = '';
  for (let i = 0; i < xor.length; i += 1) base64 += String.fromCharCode(xor.charCodeAt(i) ^ key);
  return Buffer.from(base64, 'base64').toString('utf8');
}
function decodeGatewayBody(rawBody) {
  try { return JSON.parse(decrypt(JSON.parse(rawBody || '{}').data)); } catch (_) { return null; }
}
function attachGatewayRecorder(page) {
  const events = [];
  const byRequest = new WeakMap();
  page.on('request', (request) => {
    if (!request.url().includes('/api/gateway')) return;
    const event = { rawRequestBody: request.postData() || '', status: null };
    events.push(event);
    byRequest.set(request, event);
  });
  page.on('response', (response) => {
    const event = byRequest.get(response.request());
    if (event) event.status = response.status();
  });
  return events;
}
function endpointsCalled(events, substring) {
  return events
    .map((e) => decodeGatewayBody(e.rawRequestBody))
    .filter((req) => req && String(req.endpoint || '').includes(substring));
}

async function main() {
  const browser = await puppeteer.launch({
    executablePath: CHROME_PATH,
    headless: 'new',
    defaultViewport: { width: 1366, height: 768 },
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });
  try {
    const page = await browser.newPage();
    const events = attachGatewayRecorder(page);

    await page.goto(`${BASE_URL}/pages/login.html`, { waitUntil: 'networkidle0' });
    if (!page.url().includes('/index.html')) {
      await page.type('#username', USERNAME);
      await page.type('#password', PASSWORD);
      await Promise.all([
        page.waitForNavigation({ waitUntil: 'networkidle0', timeout: 20000 }).catch(() => null),
        page.click('#btn-login')
      ]);
    }
    await page.waitForFunction(() => document.cookie.includes('auth_token='), { timeout: 20000 });

    // SPA điều hướng bằng hash — page.goto tới cùng document chỉ đổi hash không
    // chắc kích hoạt router (không có full reload). Gọi thẳng navigate() toàn
    // cục mà router.js phơi ra, đúng cách UI thật điều hướng (đã kiểm chứng ở
    // verify_search_003_004_web_e2e.js).
    await page.evaluate((p) => navigate(p), `edit-order?id=${encodeURIComponent(ORDER_ID)}`);
    await page.waitForSelector('#fs-trigger-customer', { timeout: 20000 });
    await new Promise((resolve) => setTimeout(resolve, 500));

    // Customer searchFn
    const customerEventsBefore = events.length;
    await page.evaluate(() => $('#fs-trigger-customer').trigger('click'));
    await page.waitForSelector('.picker-overlay.active #picker-search', { timeout: 10000 });
    await page.click('#picker-search', { clickCount: 3 });
    await page.type('#picker-search', DUP_CUSTOMER_KEYWORD, { delay: 30 });
    await new Promise((resolve) => setTimeout(resolve, 1500));
    const newCustomerCalls = endpointsCalled(events.slice(customerEventsBefore), 'API_CustomerSearch_AI');
    const legacyCustomerCalls = endpointsCalled(events.slice(customerEventsBefore), 'API_KhachHangList');
    assert(newCustomerCalls.length >= 1, 'edit-order searchFn phải gọi API_CustomerSearch_AI.');
    assert.strictEqual(legacyCustomerCalls.length, 0, 'edit-order searchFn không được còn gọi API_KhachHangList.');
    await page.evaluate(() => $('#picker-close').trigger('click'));

    // Product searchProducts
    const productEventsBefore = events.length;
    await page.evaluate(() => $('.add-product-row').first().find('[id^="productPickerContainer_"]').trigger('click'));
    await page.waitForSelector('.picker-overlay.active #pp-search', { timeout: 10000 });
    await new Promise((resolve) => setTimeout(resolve, 150));
    await page.click('#pp-search');
    await page.type('#pp-search', PRODUCT_KEYWORD, { delay: 30 });
    await new Promise((resolve) => setTimeout(resolve, 1500));
    const newProductCalls = endpointsCalled(events.slice(productEventsBefore), 'API_ProductSearch_AI');
    const legacyProductCalls = endpointsCalled(events.slice(productEventsBefore), 'API_DanhMuc_AI');
    assert(newProductCalls.length >= 1, 'edit-order searchProducts phải gọi API_ProductSearch_AI.');
    assert.strictEqual(legacyProductCalls.length, 0, 'edit-order searchProducts không được còn gọi API_DanhMuc_AI.');

    console.log(JSON.stringify({
      Task: 'SEARCH-003-004-EDIT-ORDER-E2E',
      Status: 'PASS',
      OrderID: ORDER_ID,
      CustomerSearchEndpoint: newCustomerCalls[0].endpoint,
      ProductSearchEndpoint: newProductCalls[0].endpoint
    }, null, 2));
  } finally {
    await browser.close();
  }
}

main().catch((error) => {
  console.error(JSON.stringify({ Task: 'SEARCH-003-004-EDIT-ORDER-E2E', Status: 'FAIL', Error: error.stack || error.message }, null, 2));
  process.exitCode = 1;
});
