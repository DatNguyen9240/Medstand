'use strict';
const puppeteer = require('puppeteer-core');
const path = require('path');
const fs = require('fs');
const assert = require('assert');

const CHROME_PATH = process.env.CHROME_PATH || 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const REPORTS_DIR = path.join(__dirname, '..', 'reports', 'uat');
const BASE_URL = process.env.BASE_URL || 'http://localhost:3000';
const USERNAME = process.env.APP_USER || 'demo';
const PASSWORD = process.env.APP_PASSWORD || '123456';

async function main() {
  fs.mkdirSync(REPORTS_DIR, { recursive: true });

  console.log('🚀 Starting pure E2E browser verification with strict UI assertions...');
  const browser = await puppeteer.launch({
    executablePath: CHROME_PATH,
    headless: 'new',
    defaultViewport: { width: 1366, height: 768 },
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });

  const page = await browser.newPage();
  page.on('console', msg => {
    const text = msg.text();
    if (text.includes('[HTTP]') || text.includes('Error') || text.includes('diag') || text.includes('Orderability') || text.includes('Chưa có dữ liệu') || text.includes('ae-order')) {
      console.log('  [Console]', text);
    }
  });

  try {
    // 1. ĐĂNG NHẬP
    console.log('1. Đăng nhập hệ thống...');
    await page.goto(`${BASE_URL}/pages/login.html`, { waitUntil: 'networkidle0' });
    await page.type('#username', USERNAME);
    await page.type('#password', PASSWORD);
    await page.click('#btn-login');
    await page.waitForNavigation({ waitUntil: 'networkidle0', timeout: 15000 }).catch(() => {});
    await new Promise(r => setTimeout(r, 2000));
    console.log('   URL sau đăng nhập:', page.url());

    // 2. LUỒNG 1: TẠO ĐƠN (#/create-order)
    console.log('\n2. LUỒNG 1: Tạo đơn (#/create-order) - Chẩn đoán B043...');
    await page.goto(`${BASE_URL}/index.html#/create-order`, { waitUntil: 'networkidle0' });
    await page.waitForSelector('#dynamicProductRowsContainer', { timeout: 15000 });
    await new Promise(r => setTimeout(r, 1000));

    // Chọn khách hàng HNBV356 (khách hàng thực tế của demo)
    await page.evaluate(() => {
      const form = window._orderForm || (typeof orderForm !== 'undefined' ? orderForm : null);
      if (form) form.setListValue('customer', 'HNBV356', 'HNBV356 - 2 Gà Con Shop');
    });
    await new Promise(r => setTimeout(r, 1000));

    // Mở popup chọn sản phẩm
    await page.evaluate(() => {
      const p = document.querySelector('[id^="productPickerContainer_"]');
      if (p) p.click();
    });
    await page.waitForSelector('#pp-search', { timeout: 10000 });

    // Gõ tìm kiếm B043 và kích hoạt event
    await page.evaluate(() => {
      const s = document.querySelector('#pp-search');
      if (s) {
        s.value = 'B043';
        s.dispatchEvent(new Event('input', { bubbles: true }));
      }
    });

    // Chờ B043 xuất hiện trong danh mục và click chọn
    await page.waitForSelector('#pp-list li[data-value="B043"]', { timeout: 10000 });
    console.log('   Đã hiển thị B043 trong danh mục tạo đơn. Click chọn...');
    await page.evaluate(() => {
      document.querySelector('#pp-list li[data-value="B043"]').click();
    });

    // Chờ thông báo Alert xuất hiện tự nhiên từ create-order.js
    console.log('   Đang chờ modal Alert thông báo lỗi chẩn đoán tự nhiên...');
    await page.waitForFunction(() => {
      const modal = document.querySelector('.custom-alert-box, .swal2-popup, .alert-box, .modal-content, [role="alertdialog"], .custom-modal-content');
      return modal && modal.innerText.includes('Chưa có dữ liệu tồn trong các kho được cấp quyền');
    }, { timeout: 10000 });

    const createOrderDiagText = await page.evaluate(() => {
      const alertModal = document.querySelector('.custom-alert-box, .swal2-popup, .modal-content, [role="alertdialog"], .alert-box, .custom-modal-content');
      return alertModal ? alertModal.textContent : document.body.innerText;
    });

    console.log('   Nội dung chẩn đoán Tạo đơn:', createOrderDiagText.replace(/\s+/g, ' ').slice(0, 150));
    assert.ok(
      createOrderDiagText.includes('Chưa có dữ liệu tồn trong các kho được cấp quyền'),
      `Tạo đơn không hiển thị đúng câu chẩn đoán cho B043! Nhận được: ${createOrderDiagText}`
    );
    console.log('   ✅ PASS LUỒNG 1: Tạo đơn hiển thị đúng câu chẩn đoán cho B043!');

    const shot1Path = path.join(REPORTS_DIR, 'PRODUCT-DIAG-001_UI_CREATE_ORDER.png');
    await page.screenshot({ path: shot1Path, fullPage: false });
    console.log('   📸 Đã lưu ảnh Luồng 1:', shot1Path);

    // Đóng alert
    await page.evaluate(() => {
      const btn = document.querySelector('.custom-alert-btn, .swal2-confirm, button:focus, .alert-btn');
      if (btn) btn.click();
      const close = document.querySelector('#pp-close');
      if (close) close.click();
    });
    await new Promise(r => setTimeout(r, 800));

    // 3. LUỒNG 2: SỬA ĐƠN (#/edit-order)
    console.log('\n3. LUỒNG 2: Sửa đơn (#/edit-order) - Chẩn đoán B043...');
    await page.goto(`${BASE_URL}/index.html#/edit-order?id=DMB0826%2F10`, { waitUntil: 'networkidle0' });
    await page.waitForSelector('#dynamicProductRowsContainer', { timeout: 15000 });
    await new Promise(r => setTimeout(r, 2000));

    // Đóng bất kỳ alert thông báo nào nếu có
    await page.evaluate(() => {
      const alertBtns = document.querySelectorAll('.custom-alert-btn, .swal2-confirm, .alert-btn');
      alertBtns.forEach(b => b.click());
      const overlays = document.querySelectorAll('.custom-alert-overlay, .swal2-container, .alert-overlay');
      overlays.forEach(o => o.remove());
    });
    await new Promise(r => setTimeout(r, 1000));

    // Mở popup chọn sản phẩm dòng đầu tiên
    await page.evaluate(() => {
      const pickers = document.querySelectorAll('[id^="productPickerContainer_"]');
      if (pickers.length > 0) pickers[0].click();
    });
    await page.waitForSelector('#pp-search', { timeout: 10000 });

    // Gõ tìm kiếm B043
    await page.evaluate(() => {
      const s = document.querySelector('#pp-search');
      if (s) {
        s.value = 'B043';
        s.dispatchEvent(new Event('input', { bubbles: true }));
      }
    });

    // Chờ B043 trong list sửa đơn
    await page.waitForSelector('#pp-list li[data-value="B043"]', { timeout: 10000 });
    console.log('   Đã hiển thị B043 trong danh mục sửa đơn. Click chọn...');
    await page.evaluate(() => {
      document.querySelector('#pp-list li[data-value="B043"]').click();
    });

    // Trong edit-order.js, khi click dòng lỗi, $selected.text(error.message) cập nhật trực tiếp
    console.log('   Đang chờ kết quả chẩn đoán tự nhiên trên dòng danh sách sửa đơn...');
    await page.waitForFunction(() => {
      const listEl = document.querySelector('#pp-list');
      return listEl && listEl.innerText.includes('Chưa có dữ liệu tồn trong các kho được cấp quyền');
    }, { timeout: 10000 });

    // Đóng overlay phụ nếu có để picker hiển thị rõ nét
    await page.evaluate(() => {
      const overlays = document.querySelectorAll('.custom-alert-overlay, .swal2-container, .alert-overlay');
      overlays.forEach(o => o.remove());
    });
    await new Promise(r => setTimeout(r, 500));

    const editOrderDiagText = await page.evaluate(() => {
      const listEl = document.querySelector('#pp-list');
      return listEl ? listEl.innerText : document.body.innerText;
    });

    console.log('   Nội dung chẩn đoán Sửa đơn:', editOrderDiagText.replace(/\s+/g, ' ').slice(0, 150));
    assert.ok(
      editOrderDiagText.includes('Chưa có dữ liệu tồn trong các kho được cấp quyền'),
      `Sửa đơn không hiển thị đúng câu chẩn đoán cho B043! Nhận được: ${editOrderDiagText}`
    );
    console.log('   ✅ PASS LUỒNG 2: Sửa đơn hiển thị đúng câu chẩn đoán cho B043!');

    const shot2Path = path.join(REPORTS_DIR, 'PRODUCT-DIAG-001_UI_EDIT_ORDER.png');
    await page.screenshot({ path: shot2Path, fullPage: false });
    console.log('   📸 Đã lưu ảnh Luồng 2:', shot2Path);

    // Đóng popup
    await page.evaluate(() => {
      const close = document.querySelector('#pp-close');
      if (close) close.click();
    });
    await new Promise(r => setTimeout(r, 800));

    // 4. LUỒNG 3: CHATBOT (#/chatbot) - Pure E2E conversational prefill call với khách hàng thực tế HNBV356
    console.log('\n4. LUỒNG 3: Chatbot (#/chatbot) - Chờ widget khởi tạo hoàn chỉnh...');
    await page.goto(`${BASE_URL}/index.html#/chatbot`, { waitUntil: 'networkidle0' });
    await page.waitForFunction(() => typeof window.ApiEngine !== 'undefined' && !!window.ApiEngine.selectApi, { timeout: 10000 });
    console.log('   window.ApiEngine đã sẵn sàng.');

    // Kích hoạt flow lập đơn hội thoại tự nhiên của chatbot: chọn khách HNBV356 và thêm item B043
    console.log('   Kích hoạt selectApi(@lap_don_hang, HNBV356, B043)...');
    await page.evaluate(() => {
      window.ApiEngine.selectApi('@lap_don_hang', {
        params: { '@MaKhachHang': 'HNBV356' },
        items: [{ ItemID: 'B043', qty: 1 }]
      });
    });

    // Chờ panel mở
    await page.waitForSelector('#ae-panel.active', { timeout: 10000 });
    console.log('   Panel lập đơn đã mở. Đang chờ chatbot-api-engine.js tải khách hàng và nạp chẩn đoán cho B043...');

    // Chờ #ae-order-mapped hiển thị (xác nhận khách hàng HNBV356 đã nạp xong)
    await page.waitForSelector('#ae-order-mapped:not([hidden])', { timeout: 60000 });
    console.log('   ✅ Chatbot engine đã map khách hàng HNBV356.');

    // Chờ loadProductDetail('B043') tự nhiên hoàn thành và chatbot-api-engine.js hiển thị lỗi vào #ae-order-error
    console.log('   Đang chờ loadProductDetail(B043) tự nhiên bắt lỗi chẩn đoán vào #ae-order-error...');
    await page.waitForFunction(() => {
      const errEl = document.querySelector('#ae-order-error');
      return errEl && errEl.textContent.includes('Chưa có dữ liệu tồn trong các kho được cấp quyền');
    }, { timeout: 30000, polling: 500 });

    const chatbotDiagText = await page.evaluate(() => {
      const errEl = document.querySelector('#ae-order-error');
      return errEl ? errEl.textContent : '';
    });

    console.log('   Nội dung chẩn đoán tự nhiên từ Chatbot:', chatbotDiagText);
    assert.ok(
      chatbotDiagText.includes('Chưa có dữ liệu tồn trong các kho được cấp quyền'),
      `Chatbot panel không hiển thị câu chẩn đoán cho B043! Nhận được: ${chatbotDiagText}`
    );
    console.log('   ✅ PASS LUỒNG 3: Chatbot panel hiển thị đúng câu chẩn đoán tự nhiên cho B043!');

    const shot3Path = path.join(REPORTS_DIR, 'PRODUCT-DIAG-001_UI_CHATBOT.png');
    await page.screenshot({ path: shot3Path, fullPage: false });
    console.log('   📸 Đã lưu ảnh Luồng 3:', shot3Path);

    console.log('\n════════════════════════════════════════════════════════════════');
    console.log('🎉 TẤT CẢ 3/3 LUỒNG PURE E2E ĐỀU ĐÃ ĐẠT ASSERTION VÀ LƯU ẢNH THÀNH CÔNG!');
    console.log('════════════════════════════════════════════════════════════════');
  } finally {
    await browser.close();
  }
}

main().catch(err => {
  console.error('\n❌ ERROR IN EVIDENCE CAPTURE:', err.message);
  process.exitCode = 1;
});
