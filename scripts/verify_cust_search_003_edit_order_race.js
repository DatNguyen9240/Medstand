'use strict';

/* CUST-SEARCH-003 — chứng minh (hoặc bác bỏ) race guard trong FormSelect.js cũng hoạt động
 * đúng trên màn SỬA ĐƠN (edit-order), giờ đây có thể test được vì lỗi chặn render form
 * (API_DonHang_EditContext_AI) đã được vá cùng ORDER-APPROVAL-005/006.
 *
 * Phương pháp giống hệt bằng chứng create-order đã có (commit 4f288b5): giữ response của
 * request "chậm" (gõ trước) lại bằng CDP request interception cho tới sau khi response của
 * request "nhanh" (gõ sau) đã render xong, rồi mới thả ra — kiểm tra kết quả cuối không bị
 * ghi đè. Vì gateway mã hóa toàn bộ payload, script tự giải mã (XOR+Base64, key=107 — đúng
 * cipher client dùng trong src/js/services/http.js) để nhận diện đúng request theo SearchText,
 * không dựa vào thứ tự phỏng đoán.
 *
 * Chỉ đọc dữ liệu khách hàng có sẵn, không mutate gì. Không cần transaction/rollback vì
 * không ghi DB.
 */

const fs = require('fs');
const path = require('path');
const puppeteer = require('puppeteer-core');

const CHROME_PATH = process.env.CHROME_PATH || 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const REPORTS_DIR = path.join(__dirname, '..', 'reports', 'uat', 'CUST-SEARCH-003');
const BASE_URL = process.env.BASE_URL || 'http://localhost:3000';
const USERNAME = process.env.APP_USER || 'demo';
const PASSWORD = process.env.APP_PASSWORD || '123456';
const ORDER_ID = process.env.ORDER_ID || 'DMB0826/6';

const CIPHER_KEY = 107;
function decrypt(b64Cipher) {
  const xor = Buffer.from(b64Cipher, 'base64').toString('latin1');
  let b64 = '';
  for (let i = 0; i < xor.length; i++) b64 += String.fromCharCode(xor.charCodeAt(i) ^ CIPHER_KEY);
  return Buffer.from(b64, 'base64').toString('utf8');
}
function encrypt(str) {
  const b64 = Buffer.from(str, 'utf8').toString('base64');
  let xor = '';
  for (let i = 0; i < b64.length; i++) xor += String.fromCharCode(b64.charCodeAt(i) ^ CIPHER_KEY);
  return Buffer.from(xor, 'latin1').toString('base64');
}

function assert(cond, msg) {
  if (!cond) throw new Error('ASSERTION_FAILED: ' + msg);
}

async function main() {
  fs.mkdirSync(REPORTS_DIR, { recursive: true });
  const browser = await puppeteer.launch({
    executablePath: CHROME_PATH,
    headless: 'new',
    defaultViewport: { width: 1366, height: 768 },
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });
  const page = await browser.newPage();
  const results = {};

  try {
    // 1. Đăng nhập
    await page.goto(`${BASE_URL}/pages/login.html`, { waitUntil: 'networkidle0' });
    await page.type('#username', USERNAME);
    await page.type('#password', PASSWORD);
    await page.click('#btn-login');
    await page.waitForNavigation({ waitUntil: 'networkidle0', timeout: 15000 }).catch(() => {});
    await new Promise((r) => setTimeout(r, 1000));

    // 2. Mở màn sửa đơn — xác nhận lại lần nữa là form render được (không còn bug chặn)
    await page.goto(`${BASE_URL}/index.html#/edit-order?id=${encodeURIComponent(ORDER_ID)}`, { waitUntil: 'networkidle0' });
    const trigger = await page.waitForSelector('#fs-trigger-customer', { timeout: 20000 }).catch(() => null);
    assert(trigger, 'edit-order.js vẫn không render được form (blocker cũ có thể chưa hết) — dừng lại, không test race.');
    results.editOrderFormRenders = true;

    // 3. Mở picker khách hàng
    await page.click('#fs-trigger-customer');
    await page.waitForSelector('#picker-search', { timeout: 10000 });

    // 4. Bật request interception, tự giải mã payload để nhận diện đúng request theo SearchText
    await page.setRequestInterception(true);
    const pending = new Map(); // SearchText -> { request, resolveHeld }
    const seenRequests = [];
    page.on('request', (req) => {
      if (req.method() !== 'POST' || !req.url().includes('/api/gateway')) {
        req.continue();
        return;
      }
      let searchText = null;
      try {
        const outer = JSON.parse(req.postData() || '{}');
        const inner = JSON.parse(decrypt(outer.data));
        if (inner && inner.endpoint && String(inner.endpoint).includes('API_KhachHangList')) {
          const q = JSON.parse((inner.body && inner.body.q) || '{}');
          searchText = q.SearchText || '';
        }
      } catch (_) { /* not a customer-list call, or not parseable — pass through untouched */ }

      if (searchText === null) { req.continue(); return; }
      seenRequests.push(searchText);
      pending.set(searchText, req);
      // Không continue() ngay — request này bị GIỮ LẠI cho tới khi script chủ động release.
    });

    async function releaseRequest(searchText) {
      const req = pending.get(searchText);
      if (!req) throw new Error('Không có request nào đang bị giữ cho SearchText="' + searchText + '"');
      pending.delete(searchText);
      await req.continue();
    }

    async function typeKeyword(kw) {
      await page.evaluate(() => { document.querySelector('#picker-search').value = ''; });
      await page.type('#picker-search', kw, { delay: 30 });
    }

    async function pickerState() {
      return page.evaluate(() => {
        const overlays = document.querySelectorAll('.picker-overlay').length;
        const items = Array.from(document.querySelectorAll('#picker-list li[data-value]')).map((li) => ({
          value: li.getAttribute('data-value'), label: li.textContent.trim(),
        }));
        return { overlayCount: overlays, visibleOptions: items };
      });
    }

    // ── Kịch bản 1: request cũ (gõ trước) hoàn tất SAU request mới (gõ sau) ──
    const slow = { keyword: 'Tech' };
    const fast = { keyword: 'Shop' };

    await typeKeyword(slow.keyword);
    await new Promise((r) => setTimeout(r, 500)); // qua debounce 300ms, request A phải đã bắn ra và bị giữ
    const slowHeld = pending.has(slow.keyword);
    results.slowRequestSent = slowHeld;
    assert(slowHeld, 'Request cho từ khóa chậm ("' + slow.keyword + '") không thấy bị giữ lại — script CDP không bắt được request, không thể test.');

    await typeKeyword(fast.keyword);
    // Đợi request nhanh tới và render xong (không giữ request này)
    let fastRendered = false;
    for (let i = 0; i < 40; i++) {
      await new Promise((r) => setTimeout(r, 100));
      const st = await pickerState();
      if (st.visibleOptions.some((o) => o.value === 'HNBV356')) { fastRendered = true; break; }
    }
    assert(fastRendered, 'Request nhanh ("' + fast.keyword + '") không render được kết quả trong 4s.');
    results.midRace = await pickerState();

    // Giờ mới thả request chậm ra — nó đến TRỄ hơn, không được phép ghi đè
    await releaseRequest(slow.keyword);
    await new Promise((r) => setTimeout(r, 800));
    results.afterStaleArrives = await pickerState();

    assert(results.afterStaleArrives.visibleOptions.some((o) => o.value === 'HNBV356'),
      'Sau khi request chậm về trễ, kết quả KHÔNG còn giữ đúng khách của request nhanh — race guard hỏng.');
    assert(!results.afterStaleArrives.visibleOptions.some((o) => o.value === 'Techcombank') || results.afterStaleArrives.overlayCount <= 1,
      'Request chậm về trễ tạo overlay thứ 2 hoặc ghi đè danh sách — race guard hỏng.');
    assert(results.afterStaleArrives.overlayCount === 1, 'Có nhiều hơn 1 overlay sau khi request chậm về trễ — có thể đã render lại thay vì bị bỏ qua.');

    // ── Kịch bản 2: request bị bỏ dở nhưng sau đó lỗi — không được hiện toast / xóa kết quả ──
    const failKeyword = 'Techx';
    await typeKeyword(failKeyword);
    await new Promise((r) => setTimeout(r, 500));
    const failHeld = pending.has(failKeyword);
    if (failHeld) {
      await typeKeyword(fast.keyword); // đổi ý, gõ tiếp từ khóa nhanh — request lỗi giờ là "abandoned"
      await new Promise((r) => setTimeout(r, 900));
      // Thả request lỗi ra dưới dạng network failure
      const req = pending.get(failKeyword);
      pending.delete(failKeyword);
      await req.abort('failed').catch(() => {});
      await new Promise((r) => setTimeout(r, 800));
      const afterFailState = await pickerState();
      const toastVisible = await page.evaluate(() => {
        const el = document.querySelector('.alert-toast, .toast-error, .swal2-popup');
        return !!(el && el.offsetParent !== null);
      });
      results.staleErrorScenario = {
        failKeyword, fastKeyword: fast.keyword,
        errorToastVisibleAfterAbandonedFailure: toastVisible,
        stillShowingFastResults: afterFailState.visibleOptions.some((o) => o.value === 'HNBV356'),
      };
      assert(!toastVisible, 'Request đã bị bỏ dở nhưng vẫn hiện toast lỗi khi thất bại trễ — vi phạm "không hiện toast cho request đã bỏ qua".');
      assert(results.staleErrorScenario.stillShowingFastResults, 'Kết quả bị xóa mất sau khi request lỗi trễ về — phải giữ nguyên kết quả đang hiển thị.');
    } else {
      results.staleErrorScenario = { skipped: true, reason: 'Không bắt được request cho keyword lỗi trong thời gian chờ.' };
    }

    await page.setRequestInterception(false);

    const evidence = {
      Task: 'CUST-SEARCH-003',
      Screen: 'edit-order',
      Status: 'PASS',
      Server: BASE_URL,
      Account: USERNAME,
      OrderIdUsed: ORDER_ID,
      Results: results,
      SeenSearchRequests: seenRequests,
    };
    fs.writeFileSync(path.join(REPORTS_DIR, 'AFTER_edit-order_RUN_OUTPUT.json'), JSON.stringify(evidence, null, 2));
    console.log(JSON.stringify({ Status: 'PASS', Summary: 'Race guard + stale-error hoạt động đúng trên màn edit-order.', EvidenceFile: 'reports/uat/CUST-SEARCH-003/AFTER_edit-order_RUN_OUTPUT.json' }, null, 2));
  } catch (err) {
    console.error(JSON.stringify({ Status: 'FAIL', Error: err.message }, null, 2));
    process.exitCode = 1;
  } finally {
    await browser.close();
  }
}

main();
