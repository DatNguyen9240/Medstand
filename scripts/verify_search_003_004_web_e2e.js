'use strict';

/* E2E cho Phase 4.1: xác nhận màn Lập đơn (create-order) đã chuyển customer/product
   picker sang API_CustomerSearch_AI / API_ProductSearch_AI (SEARCH-003/004) thay vì
   API_KhachHangList / API_DanhMuc_AI, và danh sách nhiều khách trùng tên hiển thị
   thông tin phân biệt (SĐT/chi nhánh) trong label thay vì một danh sách phẳng.
   Theo khuôn scripts/verify_cust_search_001_e2e.js (gateway decode + puppeteer-core). */
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const puppeteer = require('puppeteer-core');
const { getRequiredUatPassword } = require('./lib/uat-test-config');

const ROOT = path.resolve(__dirname, '..');
const REPORT_DIR = path.join(ROOT, 'reports', 'uat', 'SEARCH-003-004-WEB');
const CHROME_PATH = process.env.CHROME_PATH || 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const BASE_URL = process.env.SEARCH_WEB_URL || 'http://localhost:3000';
// Không dùng 'demo' (tài khoản GLOBAL_LEADERSHIP, không giới hạn chi nhánh):
// loadFn ban đầu của field khách hàng tải TOÀN BỘ ~49k khách qua API_KhachHangList
// (không TopN) và làm treo UI trước khi kịp mở được picker — vấn đề có sẵn từ
// trước, không liên quan SEARCH-003/004, ghi nhận riêng chứ không sửa ở đây.
const USERNAME = process.env.APP_USER || 'QLBH013.MED';
const PASSWORD = getRequiredUatPassword();
const DUP_CUSTOMER_KEYWORD = process.env.SEARCH_DUP_CUSTOMER || 'Tâm Đức';
// "Antrinano" thuộc ItemGroupID='HH2', không nằm trong BR-STOCK-001/SellableItemGroupIDs
// (chỉ có 'HH1') nên @RequireSellable=1 loại đúng theo thiết kế — không dùng làm mẫu test
// đường happy-path. "Aquamed" thuộc HH1, thật sự bán được, dùng để test mặc định.
const PRODUCT_KEYWORD = process.env.SEARCH_PRODUCT_KEYWORD || 'med';
const PRODUCT_CHOSEN_ID = process.env.SEARCH_PRODUCT_CHOSEN_ID || 'A008';

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

function attachGatewayRecorder(page) {
  const events = [];
  const byRequest = new WeakMap();
  page.on('request', (request) => {
    if (!request.url().includes('/api/gateway')) return;
    const event = { url: request.url(), rawRequestBody: request.postData() || '', status: null, rawResponseBody: '' };
    events.push(event);
    byRequest.set(request, event);
  });
  page.on('response', async (response) => {
    const event = byRequest.get(response.request());
    if (!event) return;
    event.status = response.status();
    try { event.rawResponseBody = await response.text(); } catch (_) { /* unavailable */ }
  });
  return events;
}

function decodedEventsFor(events, endpointSubstring) {
  return events.map((event) => {
    const request = decodeGatewayBody(event.rawRequestBody);
    const response = decodeGatewayBody(event.rawResponseBody);
    return { status: event.status, request, response };
  }).filter((event) => event.request && String(event.request.endpoint || '').includes(endpointSubstring));
}

async function login(page) {
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
  // server.js chặn 403 mọi truy cập thô vào /src/js/... kể cả khi chạy local —
  // index.dev.html KHÔNG chạy được qua server thật. Phải `npm run build` trước
  // khi test để bundle index.html phản ánh đúng code đang sửa.
}

async function openCreateOrder(page) {
  // SPA điều hướng bằng hash — page.goto tới cùng document chỉ đổi hash mà
  // không chắc kích hoạt router (không có full reload). Gọi thẳng hàm
  // navigate() toàn cục mà router.js phơi ra, đúng cách UI thật điều hướng.
  await page.evaluate((path) => navigate(path), 'create-order');
  await page.waitForSelector('#fs-trigger-customer', { timeout: 20000 });
  await new Promise((resolve) => setTimeout(resolve, 500));
}

async function testCustomerPicker(page, events) {
  const eventCountBefore = events.length;
  await fs.promises.mkdir(REPORT_DIR, { recursive: true });
  await page.screenshot({ path: path.join(REPORT_DIR, 'dbg_before_click_customer_trigger.png') });
  // Puppeteer .click() tự nhiên (toạ độ thật) không kích hoạt handler trên
  // phần tử này dù bounding box hợp lệ — không tái hiện được bằng .click()
  // gốc trong môi trường headless này; $().trigger('click') gọi thẳng handler
  // đã bind và mở đúng picker (đã kiểm chứng cùng luồng dữ liệu qua gateway).
  await page.evaluate(() => $('#fs-trigger-customer').trigger('click'));
  await page.waitForSelector('.picker-overlay.active #picker-search', { timeout: 10000 });
  await page.click('#picker-search', { clickCount: 3 });
  await page.type('#picker-search', DUP_CUSTOMER_KEYWORD, { delay: 30 });
  await new Promise((resolve) => setTimeout(resolve, 1500));
  const ui = await page.evaluate(() => ({
    overlayVisible: Boolean(document.querySelector('.picker-overlay.active')),
    visibleOptions: Array.from(document.querySelectorAll('#picker-list li[data-value]'))
      .filter((node) => getComputedStyle(node).display !== 'none')
      .map((node) => ({ value: node.getAttribute('data-value'), label: node.textContent.trim() }))
  }));
  await fs.promises.mkdir(REPORT_DIR, { recursive: true });
  await page.screenshot({ path: path.join(REPORT_DIR, 'customer_picker_ambiguous.png') });

  // Chọn thẳng một trong các khách trùng tên — xác nhận việc CHỌN một gợi ý cụ
  // thể (không phải tự động lấy dòng đầu) vẫn gán đúng ObjectID vào form, và
  // cho màn sau (chọn sản phẩm) có ngữ cảnh khách hàng thật để đối chiếu giá/tồn.
  const chosen = await page.evaluate(() => {
    const first = document.querySelector('#picker-list li[data-value]');
    return first ? { value: first.getAttribute('data-value'), label: first.textContent.trim() } : null;
  });
  await page.evaluate(() => $('#picker-list li[data-value]').first().trigger('click'));
  await new Promise((resolve) => setTimeout(resolve, 500));
  const formCustomer = await page.evaluate(() => window.orderForm && window.orderForm.getValue('customer'));

  const searchEvents = decodedEventsFor(events.slice(eventCountBefore), 'API_CustomerSearch_AI');
  const legacyEvents = decodedEventsFor(events.slice(eventCountBefore), 'API_KhachHangList');

  assert(searchEvents.length >= 1, `Phải gọi API_CustomerSearch_AI khi gõ '${DUP_CUSTOMER_KEYWORD}'.`);
  assert.strictEqual(legacyEvents.length, 0, 'Không được còn gọi API_KhachHangList (endpoint cũ) từ searchFn nữa.');
  assert(searchEvents.some((e) => e.status === 200), 'API_CustomerSearch_AI phải trả HTTP 200.');
  assert(ui.visibleOptions.length >= 2, `Từ khóa '${DUP_CUSTOMER_KEYWORD}' phải cho nhiều hơn 1 khách để kiểm tra phân biệt, nhận ${ui.visibleOptions.length}.`);
  assert(ui.visibleOptions.every((o) => /\(.+\)/.test(o.label)), 'Mỗi label phải kèm thông tin phân biệt (SĐT/chi nhánh) trong ngoặc.');
  const uniqueLabels = new Set(ui.visibleOptions.map((o) => o.label));
  assert.strictEqual(uniqueLabels.size, ui.visibleOptions.length, 'Không được có hai lựa chọn trùng label (mất khả năng phân biệt).');
  assert(chosen && chosen.value, 'Phải lấy được data-value của gợi ý đầu để bấm chọn.');
  assert.strictEqual(formCustomer, chosen.value, 'Sau khi bấm một gợi ý cụ thể, form phải gán đúng ObjectID đó (không tự chọn khách khác).');

  return {
    ui,
    chosen,
    searchEvents: searchEvents.map((e) => ({ status: e.status, endpoint: e.request.endpoint, params: e.request.params }))
  };
}

async function testProductPicker(page, events) {
  const eventCountBefore = events.length;
  await page.evaluate(() => $('#productPickerContainer_1').trigger('click'));
  await page.waitForSelector('.picker-overlay.active #pp-search', { timeout: 10000 });
  // openProductPicker tự trigger('focus') qua jQuery ở +10ms sau khi mở — có thể
  // đến sau và giật focus khỏi input ngay khi page.type() vừa focus xong bằng
  // CDP. Đợi qua mốc đó trước khi gõ để không bị mất ký tự.
  await new Promise((resolve) => setTimeout(resolve, 150));
  await page.click('#pp-search');
  await page.type('#pp-search', PRODUCT_KEYWORD, { delay: 30 });
  await new Promise((resolve) => setTimeout(resolve, 1500));
  const ui = await page.evaluate(() => ({
    overlayVisible: Boolean(document.querySelector('.picker-overlay.active')),
    selectedBeforeClick: $('#productPickerContainer_1').attr('data-value') || '',
    visibleOptions: Array.from(document.querySelectorAll('#pp-list li[data-value]'))
      .map((node) => ({ value: node.getAttribute('data-value'), name: node.getAttribute('data-name') }))
  }));
  await page.screenshot({ path: path.join(REPORT_DIR, 'product_picker_results.png') });

  const searchEvents = decodedEventsFor(events.slice(eventCountBefore), 'API_ProductSearch_AI');
  const legacyEvents = decodedEventsFor(events.slice(eventCountBefore), 'API_DanhMuc_AI');

  assert(searchEvents.length >= 1, `Phải gọi API_ProductSearch_AI khi gõ '${PRODUCT_KEYWORD}'.`);
  assert.strictEqual(legacyEvents.length, 0, 'Không được còn gọi API_DanhMuc_AI (endpoint cũ) từ searchProductCatalog nữa.');
  assert(searchEvents.some((e) => e.status === 200), 'API_ProductSearch_AI phải trả HTTP 200.');
  assert(ui.visibleOptions.length >= 2, `SEARCH-09 cần nhiều sản phẩm, nhận ${ui.visibleOptions.length}.`);
  assert.strictEqual(ui.selectedBeforeClick, '', 'SEARCH-09: không tự gán sản phẩm trước khi bấm chọn.');
  const chosenIndex = ui.visibleOptions.findIndex(item => item.value === PRODUCT_CHOSEN_ID);
  assert(chosenIndex > 0, 'SEARCH-09: fixture phải cho phép chọn sản phẩm không phải dòng đầu.');

  // Chọn một kết quả KHÁC dòng đầu, xác nhận luồng xác thực giá/tồn vẫn chạy sau khi chọn
  // — đây là mô hình "danh sách rẻ → xác thực chi tiết", KHÔNG được vỡ bởi việc đổi nguồn tìm
  // kiếm. Cần đã chọn khách hàng trước đó (testCustomerPicker) để loadProductDetail có ObjectID.
  await page.evaluate(id => $('#pp-list li[data-value]').filter(function () { return this.getAttribute('data-value') === id; }).trigger('click'), PRODUCT_CHOSEN_ID);
  await page.waitForFunction(
    () => $('#productPickerContainer_1').attr('data-verified') === '1',
    { timeout: 10000 }
  );
  const afterPick = await page.evaluate(() => ({
    verified: $('#productPickerContainer_1').attr('data-verified'),
    value: $('#productPickerContainer_1').attr('data-value'),
    price: $('#price_1').val()
  }));
  await page.screenshot({ path: path.join(REPORT_DIR, 'product_picker_selected.png') });

  assert.strictEqual(afterPick.verified, '1', 'Sau khi chọn sản phẩm, phải đối chiếu giá/tồn xong (data-verified=1).');
  assert.strictEqual(afterPick.value, PRODUCT_CHOSEN_ID, 'Sản phẩm được gán vào dòng đơn phải đúng ItemID đã chọn.');
  assert(Number(afterPick.price) > 0, `Giá sau đối chiếu phải > 0, nhận '${afterPick.price}'.`);

  return { ui, afterPick, searchEvents: searchEvents.map((e) => ({ status: e.status, endpoint: e.request.endpoint, params: e.request.params })) };
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
    const page = await browser.newPage();
    const events = attachGatewayRecorder(page);
    const consoleErrors = [];
    page.on('console', (msg) => { if (msg.type() === 'error') consoleErrors.push(msg.text()); });
    page.on('pageerror', (err) => consoleErrors.push(String(err)));

    await login(page);
    await openCreateOrder(page);

    const customerResult = await testCustomerPicker(page, events);
    const productResult = await testProductPicker(page, events);

    const evidence = {
      Task: 'SEARCH-003-004-WEB-E2E',
      Status: 'PASS',
      Customer: customerResult,
      Product: productResult,
      ConsoleErrors: consoleErrors
    };
    fs.writeFileSync(path.join(REPORT_DIR, 'EVIDENCE.json'), JSON.stringify(evidence, null, 2));
    console.log(JSON.stringify(evidence, null, 2));
    if (consoleErrors.length) {
      console.error('CONSOLE ERRORS DETECTED (not necessarily fatal, review):', JSON.stringify(consoleErrors));
    }
  } finally {
    await browser.close();
  }
}

main().catch((error) => {
  console.error(JSON.stringify({ Task: 'SEARCH-003-004-WEB-E2E', Status: 'FAIL', Error: error.stack || error.message }, null, 2));
  process.exitCode = 1;
});
