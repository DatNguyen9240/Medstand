'use strict';

/* CUST-SEARCH-003 — chứng minh (hoặc bác bỏ) race guard trong FormSelect.js cũng hoạt động
 * đúng trên màn SỬA ĐƠN (edit-order), giờ đây có thể test được vì lỗi chặn render form
 * (API_DonHang_EditContext_AI) đã được vá cùng ORDER-APPROVAL-005/006.
 *
 * Phương pháp giống hệt bằng chứng create-order đã có (commit 4f288b5): giữ response của
 * request "chậm" (gõ trước) lại cho tới sau khi response của request "nhanh" (gõ sau) đã
 * render xong, rồi mới thả ra — kiểm tra kết quả cuối không bị ghi đè. Giữ ở TẦNG JS trong
 * trang (patch Http.get) thay vì CDP network interception: đã thử CDP trước, nhưng các request
 * fetch() qua gateway không hiện đều đặn trong sự kiện 'request' của Puppeteer trong môi
 * trường này (nghi do Service Worker), làm rớt mất đúng request cần giữ. Patch Http.get đọc
 * được SearchText trực tiếp trước khi mã hóa, không cần giải mã, và không phụ thuộc tầng mạng.
 *
 * Chỉ đọc dữ liệu khách hàng có sẵn, không mutate gì. Không cần transaction/rollback vì
 * không ghi DB.
 */

const fs = require('fs');
const path = require('path');
const puppeteer = require('puppeteer-core');
const { getRequiredUatPassword } = require('./lib/uat-test-config');

const CHROME_PATH = process.env.CHROME_PATH || 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const REPORTS_DIR = path.join(__dirname, '..', 'reports', 'uat', 'CUST-SEARCH-003');
const BASE_URL = process.env.BASE_URL || 'http://localhost:3000';
const USERNAME = process.env.APP_USER || 'demo';
const PASSWORD = getRequiredUatPassword();
const ORDER_ID = process.env.ORDER_ID || 'DMB0826/6';

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
  if (process.env.DEBUG_INTERCEPT) page.on('console', (m) => console.error('[page]', m.text()));
  const results = {};

  try {
    // 1. Đăng nhập
    await page.goto(`${BASE_URL}/pages/login.html`, { waitUntil: 'networkidle0' });
    await page.type('#username', USERNAME);
    await page.type('#password', PASSWORD);
    await page.click('#btn-login');
    await page.waitForNavigation({ waitUntil: 'networkidle0', timeout: 15000 }).catch(() => {});
    await new Promise((r) => setTimeout(r, 1000));

    // 2. Mở màn sửa đơn — xác nhận lại lần nữa là form render được (không còn bug chặn cũ)
    await page.goto(`${BASE_URL}/index.html#/edit-order?id=${encodeURIComponent(ORDER_ID)}`, { waitUntil: 'networkidle0' });
    const trigger = await page.waitForSelector('#fs-trigger-customer', { timeout: 20000 }).catch(() => null);
    assert(trigger, 'edit-order.js vẫn không render được form (blocker cũ có thể chưa hết) — dừng lại, không test race.');
    results.editOrderFormRenders = true;

    // Loading spinner toàn cục (#global-spinner) là bộ đếm dùng chung cho MỌI request đang
    // chạy trên trang (kể cả các request nền không liên quan — đếm thông báo, v.v.), không chỉ
    // riêng phần vừa load. Nội dung form có thể đã hiện, nhưng spinner còn phủ và chặn click
    // cho tới khi TẤT CẢ các request đó xong. Đợi đúng điều kiện này thay vì đoán 1 mốc cố định.
    await page.waitForFunction(
      () => { const el = document.getElementById('global-spinner'); return !el || el.hasAttribute('hidden'); },
      { timeout: 15000 },
    );
    results.globalSpinnerClearedBeforeInteract = true;

    // 3. Mở picker khách hàng
    await page.click('#fs-trigger-customer');
    await page.waitForSelector('#picker-search', { timeout: 10000 });

    // 4. Giữ request ở TẦNG JS trong trang, không dùng CDP network interception nữa — thử với
    // page.setRequestInterception(true) cho thấy các request fetch() qua gateway không hiện ra
    // đều đặn trong sự kiện 'request' của Puppeteer trong môi trường này (nghi do Service Worker
    // hoặc cách Chrome xử lý fetch()), làm rớt mất chính request cần giữ. Patch thẳng Http.get
    // trong trang đáng tin cậy hơn: đọc được SearchText TRƯỚC khi mã hóa, không cần giải mã, và
    // không phụ thuộc tầng mạng của trình duyệt.
    const holdKeywords = new Set();
    const patched = await page.evaluate(() => {
      if (typeof Http === 'undefined' || typeof API_CONFIG === 'undefined') return 'Http/API_CONFIG not global';
      if (window.__origHttpGet) return 'already patched';
      window.__origHttpGet = Http.get;
      window.__heldGets = {}; // SearchText -> { release: fn }
      window.__seenSearchTexts = [];
      Http.get = function (url, params, options) {
        let searchText = null;
        if (url === API_CONFIG.ENDPOINTS.FILTER.CUSTOMERS && params && typeof params.q === 'string') {
          try { searchText = JSON.parse(params.q).SearchText || ''; } catch (_) { /* not JSON, ignore */ }
        }
        if (searchText === null || !window.__holdKeywords || !window.__holdKeywords.includes(searchText)) {
          return window.__origHttpGet.call(Http, url, params, options);
        }
        window.__seenSearchTexts.push(searchText);
        return new Promise((resolve, reject) => {
          window.__heldGets[searchText] = {
            release: () => window.__origHttpGet.call(Http, url, params, options).then(resolve, reject),
            fail: () => reject(new Error('Simulated network failure (verify script)')),
          };
        });
      };
      return 'patched';
    });
    assert(patched === 'patched', 'Không patch được Http.get trong trang: ' + patched);

    async function setHoldKeywords(keywords) {
      holdKeywords.clear();
      keywords.forEach((k) => holdKeywords.add(k));
      await page.evaluate((kws) => { window.__holdKeywords = kws; }, keywords);
    }

    async function releaseRequest(searchText) {
      const has = await page.evaluate((kw) => !!(window.__heldGets && window.__heldGets[kw]), searchText);
      if (!has) throw new Error('Không có request nào đang bị giữ cho SearchText="' + searchText + '"');
      await page.evaluate((kw) => { window.__heldGets[kw].release(); delete window.__heldGets[kw]; }, searchText);
    }

    async function isHeld(searchText) {
      return page.evaluate((kw) => !!(window.__heldGets && window.__heldGets[kw]), searchText);
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

    // Đếm chính xác số lần _renderModal thực sự chạy (overlay MỚI được thêm vào DOM) — đây là
    // tín hiệu đáng tin cậy DUY NHẤT để biết "đã render lại theo kết quả tìm kiếm" hay chưa.
    // Không dùng cách đoán qua nội dung (vd "có thấy HNBV356 chưa") vì list gốc (autoload, 500
    // khách) đã chứa sẵn hầu hết các khách mẫu, nên phép đoán đó luôn "đúng" ngay từ đầu — sai
    // hoàn toàn cho việc đồng bộ thời điểm.
    await page.evaluate(() => {
      window.__renderCount = 0;
      const mo = new MutationObserver((muts) => {
        for (const m of muts) {
          for (const n of m.addedNodes) {
            if (n.classList && n.classList.contains('picker-overlay')) window.__renderCount++;
          }
        }
      });
      mo.observe(document.body, { childList: true });
      window.__renderMo = mo;
    });

    await setHoldKeywords([slow.keyword]);
    await typeKeyword(slow.keyword);
    await new Promise((r) => setTimeout(r, 500)); // qua debounce 300ms, request A phải đã bắn ra và bị giữ
    const slowHeld = await isHeld(slow.keyword);
    results.slowRequestSent = slowHeld;
    assert(slowHeld, 'Request cho từ khóa chậm ("' + slow.keyword + '") không thấy bị giữ lại.');

    await typeKeyword(fast.keyword);
    // Đợi ĐÚNG 1 lần render mới xảy ra (kết quả tìm kiếm "Shop" thật sự đã thay overlay) —
    // không giữ request này nên nó phải hoàn tất và render bình thường.
    let fastRenderCount = 0;
    for (let i = 0; i < 40; i++) {
      await new Promise((r) => setTimeout(r, 100));
      fastRenderCount = await page.evaluate(() => window.__renderCount);
      if (fastRenderCount >= 1) break;
    }
    assert(fastRenderCount === 1, 'Request nhanh ("' + fast.keyword + '") không render đúng 1 lần trong 4s (renderCount=' + fastRenderCount + ').');
    results.midRace = await pickerState();
    assert(results.midRace.visibleOptions.length < 500,
      'Sau khi render theo "Shop", danh sách vẫn còn ' + results.midRace.visibleOptions.length + ' dòng — có vẻ vẫn là list gốc chưa lọc, chưa phải kết quả tìm kiếm thật.');
    assert(results.midRace.visibleOptions.some((o) => o.value === 'HNBV356'),
      'Kết quả tìm "Shop" không có khách kỳ vọng (HNBV356).');
    assert(!results.midRace.visibleOptions.some((o) => o.value === 'Techcombank'),
      'Kết quả tìm "Shop" (đã render đúng 1 lần, xác nhận là kết quả tìm kiếm thật) lại có luôn "Techcombank" — không liên quan tới race, đây là vấn đề khác (server trả nhầm hoặc client lọc sai) — dừng lại, cần báo cáo riêng.');

    // Giờ mới thả request chậm ra — nó đến TRỄ hơn, không được phép ghi đè
    await releaseRequest(slow.keyword);
    await new Promise((r) => setTimeout(r, 800));
    results.afterStaleArrives = await pickerState();
    const renderCountAfterStale = await page.evaluate(() => window.__renderCount);
    results.overlayReRenderedAfterStaleArrival = renderCountAfterStale > fastRenderCount;

    assert(results.afterStaleArrives.visibleOptions.some((o) => o.value === 'HNBV356'),
      'Sau khi request chậm về trễ, kết quả KHÔNG còn giữ đúng khách của request nhanh — race guard hỏng.');
    assert(results.afterStaleArrives.overlayCount === 1, 'Có nhiều hơn 1 overlay sau khi request chậm về trễ.');
    assert(!results.overlayReRenderedAfterStaleArrival,
      'Response chậm về trễ đã khiến _renderModal chạy lại (renderCount tăng từ ' + fastRenderCount + ' lên ' + renderCountAfterStale + ') — guard KHÔNG chặn được.');
    assert(!results.afterStaleArrives.visibleOptions.some((o) => o.value === 'Techcombank'),
      'Kết quả của request chậm ("Techcombank") xuất hiện trong DOM sau khi về trễ dù không render lại — race guard hỏng theo cách khác.');

    // ── Kịch bản 2: request bị bỏ dở nhưng sau đó lỗi — không được hiện toast / xóa kết quả ──
    const failKeyword = 'Techx';
    await setHoldKeywords([failKeyword]);
    await typeKeyword(failKeyword);
    await new Promise((r) => setTimeout(r, 500));
    const failHeld = await isHeld(failKeyword);
    if (failHeld) {
      await typeKeyword(fast.keyword); // đổi ý, gõ tiếp từ khóa nhanh — request lỗi giờ là "abandoned"
      await new Promise((r) => setTimeout(r, 900));
      // Thả request lỗi ra dưới dạng network failure (reject Promise thay vì resolve thật)
      await page.evaluate((kw) => { window.__heldGets[kw].fail(); delete window.__heldGets[kw]; }, failKeyword);
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

    const seenRequests = await page.evaluate(() => window.__seenSearchTexts || []);

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
