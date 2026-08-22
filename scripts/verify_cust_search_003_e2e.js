'use strict';

/* CUST-SEARCH-003 — kiểm chứng E2E thật (Chrome + server thật, không giả lập) cho bộ chọn
   khách hàng (FormSelect._openPicker, dùng bởi trường "customer" ở create-order/edit-order).

   Root cause đã xác định bằng đọc code (src/js/components/FormSelect.js): mỗi lần search
   remote trả về, _openPicker gọi thẳng `$overlay.remove(); _renderModal(remoteOptions);`
   KHÔNG có cờ đánh dấu "đây có còn là lần tìm mới nhất không". _renderModal lại tự tạo MỘT
   overlay + một bộ handler MỚI mỗi lần gọi (không tái dùng), nên biến đếm nếu khai báo cục bộ
   trong _renderModal sẽ không "nhớ" được các lần gõ trước đó thuộc thế hệ DOM khác.

   Script này dùng Chrome DevTools Protocol (qua puppeteer-core, request interception) để:
     - Ép request tìm kiếm ĐẦU TIÊN thật sự được gửi (Chrome đã nhận từ trang) nhưng GIỮ LẠI,
       chỉ thả cho hoàn tất sau khi request THỨ HAI (từ khoá khác, gõ sau) đã render xong.
     - Chứng minh: response cũ không được đè lên UI mới hơn, không tạo ra overlay/picker thứ 2.
     - Chứng minh: lỗi mạng của request cũ (bị ép fail) không bật lên toast sau khi request mới
       hơn đã thành công — người dùng không bị doạ bởi lỗi của một lượt gõ họ đã bỏ qua.

   Chạy 2 lần cạnh version code:
     - TRƯỚC khi sửa FormSelect.js: script này FAIL đúng ở các assertion race-condition —
       đó là bằng chứng lỗi tồn tại thật, không phải suy luận.
     - SAU khi sửa: PASS toàn bộ.
   Không sửa DB, không tạo dữ liệu giả — chỉ đọc danh sách khách hàng thật của tài khoản demo
   đang có sẵn rồi chọn 2 khách hàng bất kỳ có từ khoá tìm kiếm không trùng nhau. */

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const puppeteer = require('puppeteer-core');

const ROOT = path.resolve(__dirname, '..');
const REPORT_DIR = path.join(ROOT, 'reports', 'uat', 'CUST-SEARCH-003');
const CHROME_PATH = process.env.CHROME_PATH || 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const BASE_URL = process.env.CUST_SEARCH_URL || 'http://localhost:3410';
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
  } catch (_) { return null; }
}
function searchTextOf(decodedReq) {
  const endpoint = decodedReq && decodedReq.endpoint || '';
  if (!endpoint.includes('API_KhachHangList')) return null;
  try {
    const u = new URL(endpoint, 'http://gateway.local');
    const q = JSON.parse(u.searchParams.get('q') || '{}');
    return String(q.SearchText || '');
  } catch (_) { return null; }
}

/* Gắn CDP request interception: mọi request KHÁC endpoint/keyword mục tiêu đi qua bình
   thường (continue ngay). Request khớp "slowKeyword" bị GIỮ LẠI (không continue) cho tới khi
   test gọi release(). Request khớp "failKeyword" được trả lời trễ bằng lỗi 500 giả lập. */
async function attachRaceController(page) {
  await page.setRequestInterception(true);
  const events = [];
  const state = { slowKeyword: null, failKeyword: null, slowHold: null, failFired: false };

  page.on('request', (request) => {
    const url = request.url();
    if (request.method() !== 'POST' || !url.includes('/api/gateway')) {
      request.continue().catch(() => {});
      return;
    }
    const decodedReq = decodeGatewayBody(request.postData());
    const searchText = searchTextOf(decodedReq);
    const record = { at: Date.now(), endpoint: decodedReq && decodedReq.endpoint, searchText, heldMs: 0 };
    events.push(record);

    if (searchText !== null && state.slowKeyword && searchText === state.slowKeyword && !state.slowHold) {
      const heldAt = Date.now();
      state.slowHold = {
        record,
        release: () => {
          record.heldMs = Date.now() - heldAt;
          request.continue().catch(() => {});
        }
      };
      return; // KHÔNG continue() — request đã rời trang (Chrome đã nhận), chỉ giữ ở tầng CDP.
    }
    if (searchText !== null && state.failKeyword && searchText === state.failKeyword && !state.failFired) {
      state.failFired = true;
      setTimeout(() => {
        request.respond({
          status: 500,
          contentType: 'application/json',
          body: JSON.stringify({ error: 'FORCED_FAIL_FOR_TEST' })
        }).catch(() => {});
      }, 900);
      return;
    }
    request.continue().catch(() => {});
  });

  return { events, state };
}

async function login(page) {
  await page.goto(`${BASE_URL}/pages/login.html`, { waitUntil: 'networkidle0' });
  if (!page.url().includes('/index.html') && !page.url().includes('/index.dev.html')) {
    await page.type('#username', USERNAME);
    await page.type('#password', PASSWORD);
    await Promise.all([
      page.waitForNavigation({ waitUntil: 'networkidle0', timeout: 20000 }).catch(() => null),
      page.click('#btn-login')
    ]);
  }
  await page.waitForFunction(() => document.cookie.includes('auth_token='), { timeout: 20000 });
}

async function pickTwoDistinctCustomers(page, sourceGlobal) {
  return page.evaluate((globalName) => {
    const rows = window[globalName] || [];
    function keywordOf(row) {
      const label = String(row.DisplayName || row.ObjectName || '').trim();
      const words = label.split(/\s+/).filter((w) => w.length >= 2);
      return words.length ? words[words.length - 1].slice(0, 4) : label.slice(0, 4);
    }
    const candidates = rows
      .filter((r) => r.ObjectID && (r.DisplayName || r.ObjectName))
      .map((r) => ({ ObjectID: r.ObjectID, label: r.DisplayName || r.ObjectName, keyword: keywordOf(r) }))
      .filter((r) => r.keyword && r.keyword.length >= 2);
    for (let i = 0; i < candidates.length; i += 1) {
      for (let j = 0; j < candidates.length; j += 1) {
        if (i === j) continue;
        const a = candidates[i], b = candidates[j];
        if (a.keyword.toLowerCase() === b.keyword.toLowerCase()) continue;
        // Từ khoá của A không được khớp nhãn của B (và ngược lại) — tránh nhầm do trùng lặp.
        if (b.label.toLowerCase().includes(a.keyword.toLowerCase())) continue;
        if (a.label.toLowerCase().includes(b.keyword.toLowerCase())) continue;
        return { slow: a, fast: b };
      }
    }
    return null;
  }, sourceGlobal);
}

function pickerState(page) {
  return page.evaluate(() => {
    const overlays = Array.from(document.querySelectorAll('.picker-overlay'));
    const optionNodes = Array.from(document.querySelectorAll('#picker-list li[data-value]'));
    return {
      overlayCount: overlays.length,
      totalOptionCount: optionNodes.length,
      visibleOptions: optionNodes
        .filter((node) => {
          const style = window.getComputedStyle(node);
          return style.display !== 'none'
            && style.visibility !== 'hidden'
            && node.getClientRects().length > 0;
        })
        .map((n) => ({ value: n.getAttribute('data-value'), label: n.textContent.trim() })),
      errorToastVisible: document.querySelectorAll('.swal2-popup.swal2-icon-error').length > 0
    };
  });
}

function summarizePickerState(state, pair) {
  return {
    overlayCount: state.overlayCount,
    totalOptionCount: state.totalOptionCount,
    visibleOptionCount: state.visibleOptions.length,
    slowCustomerPresent: state.visibleOptions.some((option) => option.value === pair.slow.ObjectID),
    fastCustomerPresent: state.visibleOptions.some((option) => option.value === pair.fast.ObjectID),
    errorToastVisible: state.errorToastVisible
  };
}

// Triple-click select-all (và cả Ctrl+A/Backspace mô phỏng qua CDP) trên input mới render
// đều KHÔNG select/xoá được ổn định (phụ thuộc focus/timing thật của Chrome headless), khiến
// page.type() gõ NỐI vào chữ cũ thay vì thay thế — tự nó tạo ra một race-condition-giả trong
// chính test (bắt được qua debug: SearchText gửi lên là "TechShop" thay vì "Shop"). Set thẳng
// .value = '' + dispatch một sự kiện 'input' thật (jQuery .on('input', fn) lắng nghe sự kiện
// DOM gốc nên vẫn bắt được) để CHẮC CHẮN input trống trước khi gõ từ khoá mới.
async function clearAndType(page, selector, text) {
  await page.evaluate((sel) => {
    const el = document.querySelector(sel);
    el.focus();
    el.value = '';
    el.dispatchEvent(new Event('input', { bubbles: true }));
  }, selector);
  const cleared = await page.$eval(selector, (el) => el.value === '');
  assert(cleared, `Không xoá được nội dung cũ của ${selector} trước khi gõ "${text}".`);
  await page.type(selector, text, { delay: 30 });
}

async function openCustomerPicker(page) {
  await page.waitForSelector('#fs-trigger-customer', { timeout: 20000 });
  await page.evaluate(() => {
    document.querySelectorAll('.picker-overlay').forEach((node) => node.remove());
    const trigger = document.querySelector('#fs-trigger-customer');
    if (trigger) trigger.scrollIntoView({ block: 'center' });
  });
  await page.click('#fs-trigger-customer');
  let picker = await page.waitForSelector('.picker-overlay #picker-search', { timeout: 3000 }).catch(() => null);
  if (!picker) {
    // Headless đôi khi click đúng lúc global spinner vừa đóng. Gọi lại chính DOM click event
    // của trigger; không gọi trực tiếp FormSelect._openPicker hay helper nội bộ.
    await page.evaluate(() => document.querySelector('#fs-trigger-customer').click());
    picker = await page.waitForSelector('.picker-overlay #picker-search', { timeout: 12000 }).catch(() => null);
  }
  assert(picker, `[${page.url()}] Không mở được customer picker.`);
}

async function runOnScreen(browser, screenName, gotoUrl, waitReadyFn) {
  const context = await browser.createBrowserContext();
  const page = await context.newPage();
  await page.setViewport({ width: 1366, height: 768 });
  const ctl = await attachRaceController(page);
  await login(page);
  await page.goto(gotoUrl, { waitUntil: 'networkidle0' });
  await waitReadyFn(page);

  const pair = await pickTwoDistinctCustomers(page, screenName === 'edit-order' ? '_customerRecords' : '_customersCache');
  assert(pair, `[${screenName}] Cần ít nhất 2 khách hàng với từ khoá tìm kiếm khác nhau trong dữ liệu thật của ${USERNAME}.`);

  const result = {
    screenName,
    pair: {
      slow: { ObjectID: pair.slow.ObjectID, keyword: pair.slow.keyword },
      fast: { ObjectID: pair.fast.ObjectID, keyword: pair.fast.keyword }
    }
  };

  // ── Kịch bản A: request cũ (slow) hoàn tất SAU request mới (fast) — không được đè UI ────
  ctl.state.slowKeyword = pair.slow.keyword;
  await openCustomerPicker(page);
  await clearAndType(page, '#picker-search', pair.slow.keyword);

  const slowCaptured = await (async () => {
    const deadline = Date.now() + 5000;
    while (Date.now() < deadline) {
      if (ctl.state.slowHold) return true;
      await new Promise((r) => setTimeout(r, 50));
    }
    return false;
  })();
  assert(slowCaptured, `[${screenName}] Request tìm kiếm "${pair.slow.keyword}" phải thật sự được gửi (bị CDP giữ lại) trong 5s.`);
  result.slowRequestSent = true;
  await page.screenshot({ path: path.join(REPORT_DIR, `${screenName}_A1_SLOW_REQUEST_IN_FLIGHT.png`) });

  // Gõ từ khoá khác (fast) trong khi slow còn đang treo
  await clearAndType(page, '#picker-search', pair.fast.keyword);
  await page.waitForFunction((objectID) => {
    const node = document.querySelector(`.picker-overlay.active #picker-list li[data-value="${objectID}"]`);
    if (!node) return false;
    const style = window.getComputedStyle(node);
    return style.display !== 'none' && style.visibility !== 'hidden' && node.getClientRects().length > 0;
  }, { timeout: 10000 }, pair.fast.ObjectID);

  const midRace = await pickerState(page);
  result.midRace = summarizePickerState(midRace, pair);
  await page.screenshot({ path: path.join(REPORT_DIR, `${screenName}_A2_FAST_RENDERED_SLOW_STILL_PENDING.png`) });
  assert.strictEqual(midRace.overlayCount, 1, `[${screenName}] Trước khi thả request cũ: phải chỉ có 1 overlay.`);
  assert(midRace.visibleOptions.some((o) => o.value === pair.fast.ObjectID),
    `[${screenName}] Kết quả tìm "${pair.fast.keyword}" phải hiển thị trước khi request cũ hoàn tất.`);

  // Thả request cũ (slow) — nó hoàn tất SAU, không được đè lên kết quả đang hiển thị
  ctl.state.slowHold.release();
  await new Promise((r) => setTimeout(r, 1500));
  const afterStale = await pickerState(page);
  result.afterStaleArrives = summarizePickerState(afterStale, pair);
  result.slowHeldMs = ctl.state.slowHold.record.heldMs;
  await page.screenshot({ path: path.join(REPORT_DIR, `${screenName}_A3_AFTER_STALE_RESPONSE_ARRIVES.png`) });

  assert.strictEqual(afterStale.overlayCount, 1,
    `[${screenName}] Sau khi response cũ (${pair.slow.keyword}) hoàn tất trễ: vẫn phải chỉ có 1 overlay (không bị nhân đôi).`);
  assert(afterStale.visibleOptions.some((o) => o.value === pair.fast.ObjectID),
    `[${screenName}] Sau khi response cũ hoàn tất trễ: UI vẫn phải giữ kết quả "${pair.fast.keyword}", không bị đè về "${pair.slow.keyword}".`);
  assert(!afterStale.visibleOptions.some((o) => o.value === pair.slow.ObjectID && !midRace.visibleOptions.some((m) => m.value === pair.slow.ObjectID)),
    `[${screenName}] Không được để kết quả của từ khoá cũ "${pair.slow.keyword}" xuất hiện đè lên sau khi đã chuyển sang "${pair.fast.keyword}".`);

  // Đóng picker để dọn state trước kịch bản B
  await page.evaluate(() => { document.querySelectorAll('.picker-overlay').forEach((n) => n.remove()); });

  // ── Kịch bản B: lỗi mạng của request cũ không được bật toast sau khi request mới đã OK ──
  const failPair = await pickTwoDistinctCustomers(page, screenName === 'edit-order' ? '_customerRecords' : '_customersCache');
  ctl.state.slowKeyword = null;
  ctl.state.failFired = false;
  ctl.state.failKeyword = failPair.slow.keyword + 'x'; // biến thể khác để không trùng cache key với A
  const fastKw2 = failPair.fast.keyword;

  await openCustomerPicker(page);
  await clearAndType(page, '#picker-search', ctl.state.failKeyword);
  await new Promise((r) => setTimeout(r, 500)); // đảm bảo debounce đã bắn request lỗi (trễ 900ms mới trả 500)
  await clearAndType(page, '#picker-search', fastKw2);
  try {
    await page.waitForFunction((objectID) => {
      const node = document.querySelector(`.picker-overlay.active #picker-list li[data-value="${objectID}"]`);
      if (!node) return false;
      const style = window.getComputedStyle(node);
      return style.display !== 'none' && style.visibility !== 'hidden' && node.getClientRects().length > 0;
    }, { timeout: 10000 }, failPair.fast.ObjectID);
  } catch (waitErr) {
    const debugState = await pickerState(page);
    console.error('DEBUG_B_TIMEOUT', JSON.stringify({ failPair, ctlEvents: ctl.events.slice(-8), debugState }, null, 2));
    throw waitErr;
  }

  const rightAfterFastSuccess = await pickerState(page);
  await new Promise((r) => setTimeout(r, 1300)); // đợi qua mốc 900ms để response lỗi giả lập trả về
  const afterDelayedFailure = await pickerState(page);
  result.staleErrorScenario = {
    failKeyword: ctl.state.failKeyword, fastKeyword: fastKw2,
    errorToastRightAfterSuccess: rightAfterFastSuccess.errorToastVisible,
    errorToastAfterDelayedFailureArrives: afterDelayedFailure.errorToastVisible,
    stillShowingFastResults: afterDelayedFailure.visibleOptions.some((o) => o.value === failPair.fast.ObjectID)
  };
  await page.screenshot({ path: path.join(REPORT_DIR, `${screenName}_B1_AFTER_DELAYED_FAILURE_ARRIVES.png`) });

  assert.strictEqual(afterDelayedFailure.errorToastVisible, false,
    `[${screenName}] Lỗi trễ của từ khoá cũ đã bị bỏ qua "${ctl.state.failKeyword}" không được hiện toast sau khi tìm kiếm mới đã thành công.`);
  assert(afterDelayedFailure.visibleOptions.some((o) => o.value === failPair.fast.ObjectID),
    `[${screenName}] Sau khi lỗi trễ tới nơi: UI vẫn phải giữ kết quả tìm kiếm thành công gần nhất.`);

  await context.close();
  return result;
}

/* Kiểm tra cấu trúc cache key của MỘT tài khoản. Đây chỉ là defense-in-depth tĩnh, KHÔNG thay
   thế ca đăng xuất A -> đăng nhập B và khách ngoài scope trong verifier remaining E2E.
   Http.get cache theo sessionStorage, key = URL đầy đủ (bao gồm query "q" — đã đọc
   src/js/services/http.js: `_cacheKey(url)` = CACHE_PREFIX + url). Vì query của
   API_KhachHangList LUÔN nhúng `User: user.UserName` (đọc code create-order.js/edit-order.js),
   cache key của kết quả tìm kiếm khách hàng của tài khoản A và B KHÔNG BAO GIỜ trùng nhau —
   dù chung sessionStorage (cùng tab), B không thể vô tình đọc trúng cache của A. */
async function verifyCacheKeyEmbedsUsername(browser) {
  const context = await browser.createBrowserContext();
  const page = await context.newPage();
  await login(page);
  await page.goto(`${BASE_URL}/index.html#/create-order`, { waitUntil: 'networkidle0' });
  await page.waitForFunction(() => Array.isArray(window._customersCache) && window._customersCache.length > 1, { timeout: 20000 });

  const before = await page.evaluate(() => Object.keys(sessionStorage).filter((k) => k.startsWith('_hc_')).length);
  await openCustomerPicker(page);
  const pair = await pickTwoDistinctCustomers(page, '_customersCache');
  assert(pair, 'Cần ít nhất 2 khách hàng để chọn từ khoá tìm kiếm.');
  await clearAndType(page, '#picker-search', pair.fast.keyword);
  await page.waitForFunction((objectID) => {
    return Boolean(document.querySelector(`.picker-overlay.active #picker-list li[data-value="${objectID}"]`));
  }, { timeout: 10000 }, pair.fast.ObjectID);
  await new Promise((r) => setTimeout(r, 200));

  const check = await page.evaluate((expectedUsername) => {
    const searchKeys = Object.keys(sessionStorage).filter((k) => k.startsWith('_hc_') && k.includes('API_KhachHangList'));
    return {
      searchCacheKeyCount: searchKeys.length,
      allEmbedUsername: searchKeys.length > 0 && searchKeys.every((k) => k.includes('User%22%3A%22' + expectedUsername + '%22') || k.includes('"User":"' + expectedUsername + '"') || k.includes(expectedUsername)),
      sample: searchKeys[0] || null
    };
  }, USERNAME);

  await context.close();
  assert(check.searchCacheKeyCount > 0, 'Phải có ít nhất 1 cache entry cho tìm kiếm khách hàng trong sessionStorage.');
  assert(check.allEmbedUsername, `Cache key của tìm kiếm khách hàng phải chứa username "${USERNAME}" — nếu không, 2 tài khoản khác nhau tìm cùng từ khoá có thể đọc trúng cache của nhau. Sample: ${check.sample}`);
  return { beforeCacheEntries: before, ...check };
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
    // index.dev.html trả 403 cho src/js/* trên server này (chặn phục vụ source thô) — dùng
    // đúng bundle production (index.html) mà người dùng thật sẽ chạy. Nghĩa là phải build lại
    // (node scripts/build.js) sau mỗi lần sửa src/js/components/FormSelect.js trước khi rerun.
    const createOrder = await runOnScreen(
      browser, 'create-order', `${BASE_URL}/index.html#/create-order`,
      (page) => page.waitForFunction(() => Array.isArray(window._customersCache) && window._customersCache.length > 1, { timeout: 20000 })
    );

    // Blocker edit-context đã được sửa và merge cùng ORDER-APPROVAL-005/006. Từ đây màn sửa
    // đơn là điều kiện bắt buộc: lỗi/timeout phải FAIL, không còn được đổi thành SKIPPED.
    const editOrder = await runOnScreen(
      browser, 'edit-order', `${BASE_URL}/index.html#/edit-order?id=${encodeURIComponent(ORDER_ID)}`,
      (page) => page.waitForFunction(() => Array.isArray(window._customerRecords) && window._customerRecords.length > 1, { timeout: 20000 })
    );

    const cacheKeyScope = await verifyCacheKeyEmbedsUsername(browser);

    const evidence = {
      Task: 'CUST-SEARCH-003',
      Status: 'PASS',
      Server: BASE_URL,
      Account: USERNAME,
      Screens: { 'create-order': createOrder, 'edit-order': editOrder },
      SingleAccountCacheKeyShape: cacheKeyScope,
      CrossAccountAndOutsideScopeEvidence: 'CUST-SEARCH-003_REMAINING_E2E_EVIDENCE.json'
    };
    fs.writeFileSync(path.join(REPORT_DIR, 'CUST-SEARCH-003_EVIDENCE.json'), JSON.stringify(evidence, null, 2));
    console.log(JSON.stringify(evidence, null, 2));
  } finally {
    await browser.close();
  }
}

main().catch((error) => {
  console.error(JSON.stringify({ Task: 'CUST-SEARCH-003', Status: 'FAIL', Error: error.stack || error.message }, null, 2));
  process.exitCode = 1;
});
