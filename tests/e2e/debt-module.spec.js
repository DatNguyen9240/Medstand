const { test, expect } = require('@playwright/test');

async function openDebtHarness(page) {
  await page.goto('/');
  await page.setContent('<main id="chat-messages"></main>');
  await page.evaluate(() => {
    let sequence = 0;
    window.API_CONFIG = {};
    window.ApiEngine = { execute() {} };
    window.ApiChatbot = {
      __internal: {},
      helpers: {
        nextId: () => ++sequence,
        esc: (value) => String(value ?? '')
          .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
          .replace(/"/g, '&quot;').replace(/'/g, '&#39;'),
        fmtCellVal: (value) => `${Number(value ?? 0).toLocaleString('vi-VN')} đ`,
        isValidPhone: (value) => /^[0-9+]{9,15}$/.test(String(value ?? '').replace(/\s/g, '')),
        pickValue: () => null,
        pickField: () => null
      },
      registerRenderer() {}
    };
  });
  await page.addStyleTag({ url: `/chatbot-widget/css/chatbot.css?debt-source=${Date.now()}` });
  await page.addScriptTag({ url: `/chatbot-widget/js/chatbot-renderers-medstand.js?debt-source=${Date.now()}` });
  await page.waitForFunction(() => typeof window.ApiChatbot.__internal.renderDebt === 'function');
}

function customer(index, overrides) {
  return Object.assign({
    ObjectType: 'CUSTOMER',
    CustomerID: `KH-${String(index).padStart(2, '0')}`,
    CustomerName: `Nhà thuốc ${index}`,
    TotalDebt: 1000000 * index,
    PaymentStatus: 'DUE_DATE_UNKNOWN',
    DebtSize: index > 3 ? 'LARGE' : 'SMALL',
    AsOfDate: '2026-07-17',
    RuleVersion: 'DEBT-V1-DRAFT',
    DataSource: 'vCongNoBanHang'
  }, overrides || {});
}

async function renderResponse(page, response) {
  await page.evaluate((value) => {
    const metadata = value.metadata ?? {};
    const html = window.ApiChatbot.__internal.renderDebt(
      value.data,
      value.message ?? '',
      value.apiCode,
      {
        uiTemplate: value.uiTemplate,
        responseMetadata: metadata,
        requestId: value.requestId ?? metadata.requestId ?? null,
        contractVersion: value.contractVersion ?? metadata.contractVersion ?? null,
        khCode: value.khCode ?? '',
        status: value.errorCode ?? value.code ?? value.status ?? null
      }
    );
    document.querySelector('#chat-messages').insertAdjacentHTML('beforeend', html);
  }, response);
  await page.waitForTimeout(80);
}

test('@chatbot @debt B1-MGR-01 list renders only fields returned by debt API', async ({ page }) => {
  await openDebtHarness(page);
  await page.evaluate(() => {
    window.__MEDSTAND_CONTRACT_DRIFTS__ = [];
    window.__debtExecuteCalls = [];
    window.ApiEngine.execute = (apiCode, params) => window.__debtExecuteCalls.push({ apiCode, params });
  });

  const rows = Array.from({ length: 3 }, (_, index) => customer(index + 1));
  rows.push({ ObjectType: 'SUPPLIER', ObjectID: 'NCC-01', CustomerName: 'Không hiển thị', TotalDebt: 1, PaymentStatus: 'OVERDUE' });
  await renderResponse(page, {
    status: 'success',
    apiCode: '@cong_no_khach_hang',
    uiTemplate: 'CONG_NO',
    requestId: 'req-debt-list',
    contractVersion: '1.0.0-draft',
    data: rows
  });

  const card = page.locator('.ai-sales-debt-portfolio').last();
  await expect(card).toBeVisible();
  await expect(card.getByText('3 khách hàng')).toBeVisible();
  await expect(card.getByText(/Nguồn: vCongNoBanHang/)).toBeVisible();
  await expect(card.locator('tbody tr')).toHaveCount(3);
  await expect(card.getByText('Không hiển thị')).toHaveCount(0);
  await expect(card.locator('.ai-sales-debt-drift')).toContainText('1 bản ghi');
  await expect(card.getByText('Nhân viên phụ trách')).toHaveCount(0);
  await expect(card.getByText('Nợ quá hạn')).toHaveCount(0);
  await expect(card.getByText('HĐ sắp đến hạn 7 ngày')).toHaveCount(0);

  const detail = card.locator('[data-debt-customer]').first();
  await detail.dblclick();
  await expect.poll(() => page.evaluate(() => window.__debtExecuteCalls.length)).toBe(1);
  expect(await page.evaluate(() => window.__debtExecuteCalls[0])).toEqual({
    apiCode: '@cong_no_chi_tiet',
    params: { '@MaKhachHang': 'KH-01', '@DenNgay': '2026-07-17' }
  });

  const drift = await page.evaluate(() => window.__MEDSTAND_CONTRACT_DRIFTS__[0]);
  expect(drift).toMatchObject({ ApiCode: '@cong_no_khach_hang', ObjectType: 'SUPPLIER', ObjectID: 'NCC-01', requestId: 'req-debt-list' });
});

test('@chatbot @debt B1-MGR-02 detail separates invoices from other debt items', async ({ page }) => {
  await openDebtHarness(page);
  await renderResponse(page, {
    status: 'success',
    apiCode: '@cong_no_chi_tiet',
    uiTemplate: 'CONG_NO',
    requestId: 'req-debt-detail',
    data: [{
      ObjectType: 'CUSTOMER', CustomerID: 'KH-01', CustomerName: 'Nhà thuốc An Tâm',
      Phone: null, AsOfDate: '2026-07-17', TotalOutstanding: 6900000,
      InvoiceCount: 1, DebtItemCount: 2, TotalDebitAmount: 6900000, TotalCreditAmount: 0,
      InvoiceNumber: 'HD-01', DebtDate: '2026-06-01', DueDate: null, DocumentType: 'INVOICE',
      DebitAmount: 4000000, CreditAmount: 0, RemainingAmount: 4000000,
      OverdueDays: 0, PaymentStatus: 'DUE_DATE_UNKNOWN', Description: 'Hóa đơn bán hàng', DataSource: 'SY_GetDebitDocFnc'
    }, {
      ObjectType: 'CUSTOMER', CustomerID: 'KH-01', CustomerName: 'Nhà thuốc An Tâm',
      Phone: null, AsOfDate: '2026-07-17', TotalOutstanding: 6900000,
      InvoiceCount: 1, DebtItemCount: 2, TotalDebitAmount: 6900000, TotalCreditAmount: 0,
      MaChungTu: 'BL-01', DebtDate: '2016-01-01', DueDate: null, DocumentType: 'OPENING_BALANCE',
      DebitAmount: 2900000, CreditAmount: 0, RemainingAmount: 2900000,
      OverdueDays: 0, PaymentStatus: 'DUE_DATE_UNKNOWN', Description: 'Số dư đầu kỳ', DataSource: 'SY_GetDebitDocFnc'
    }]
  });

  const card = page.locator('.ai-sales-debt-detail').last();
  await expect(card).toBeVisible();
  await expect(card.getByText('Chưa có số điện thoại')).toBeVisible();
  await expect(card.getByText('Số hóa đơn')).toBeVisible();
  await expect(card.getByText('Số khoản công nợ')).toBeVisible();
  await expect(card.getByText('Hóa đơn', { exact: true })).toBeVisible();
  await expect(card.locator('.ai-sales-debt-item-type', { hasText: 'Số dư đầu kỳ' })).toBeVisible();
  await expect(card.locator('tbody tr')).toHaveCount(2);
  await expect(card.getByText('Gợi ý xử lý')).toHaveCount(0);
  await expect(card.getByText('Nợ quá hạn')).toHaveCount(0);
  await card.press('Escape');
  await expect(card).toBeHidden();
});

test('@chatbot @debt B1-MGR-03 mobile responsive and read-only interaction', async ({ page }) => {
  const mutationRequests = [];
  page.on('request', (request) => {
    if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(request.method())) mutationRequests.push(request.url());
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await openDebtHarness(page);
  mutationRequests.length = 0;
  await renderResponse(page, {
    status: 'success', apiCode: '@cong_no_khach_hang', uiTemplate: 'CONG_NO',
    metadata: { debtSummary: {} }, data: [customer(1)]
  });
  const card = page.locator('.ai-sales-debt-portfolio').last();
  await expect(card.locator('.ai-sales-debt-mobile-list')).toBeVisible();
  await expect(card.locator('.ai-sales-debt-customer-table-wrap')).toBeHidden();
  await expect(card.getByRole('button', { name: /Xem chi tiết công nợ/ })).toBeVisible();
  await expect(card.getByRole('button', { name: /tạo đơn|thanh toán|ghi nhận/i })).toHaveCount(0);
  expect(await card.evaluate((element) => ({ scrollWidth: element.scrollWidth, clientWidth: element.clientWidth }))).toEqual({ scrollWidth: await card.evaluate((element) => element.clientWidth), clientWidth: await card.evaluate((element) => element.clientWidth) });
  expect(mutationRequests).toEqual([]);
});

test('@chatbot @debt B1-TDV-01 legacy aliases, zero and invalid records are handled safely', async ({ page }) => {
  await openDebtHarness(page);
  const result = await page.evaluate(() => {
    window.__MEDSTAND_CONTRACT_DRIFTS__ = [];
    const render = window.ApiChatbot.__internal.renderDebt;
    const zeroHtml = render([{
      ObjectType: 'CUSTOMER', CustomerID: 'KH-0', CustomerName: 'Nhà thuốc 0',
      TotalDebt: 0, PaymentStatus: 'NOT_DUE'
    }], '', '@cong_no_khach_hang', { requestId: 'req-zero' });
    const legacyHtml = render([{ TenKH: 'Nhà thuốc legacy', MaKH: 'KH-LEGACY', TongNo: 125000 }], '', '@cong_no_khach_hang', { requestId: 'req-legacy' });
    const missingHtml = render([{ ObjectType: 'CUSTOMER', CustomerID: 'KH-MISSING', CustomerName: 'Thiếu tổng nợ' }], '', '@cong_no_khach_hang', { requestId: 'req-missing' });
    const employeeHtml = render([{ ObjectType: 'EMPLOYEE', ObjectID: 'NV-01', CustomerName: 'Không được hiện', TotalDebt: 1, PaymentStatus: 'OVERDUE' }], '', '@cong_no_khach_hang', { requestId: 'req-employee' });
    return {
      zeroAccepted: zeroHtml.includes('Nhà thuốc 0') && !zeroHtml.includes('Dữ liệu công nợ chưa đúng contract'),
      legacyAccepted: legacyHtml.includes('Nhà thuốc legacy') && legacyHtml.includes('KH-LEGACY'),
      missingSafe: missingHtml.includes('Dữ liệu công nợ chưa đúng contract'),
      employeeSafe: employeeHtml.includes('Dữ liệu công nợ chưa đúng contract'),
      driftFields: window.__MEDSTAND_CONTRACT_DRIFTS__.map((item) => item.field),
      driftRequestIds: window.__MEDSTAND_CONTRACT_DRIFTS__.map((item) => item.requestId)
    };
  });
  expect(result).toEqual({
    zeroAccepted: true,
    legacyAccepted: true,
    missingSafe: true,
    employeeSafe: true,
    driftFields: ['TotalDebt/TongNo', 'ObjectType'],
    driftRequestIds: ['req-missing', 'req-employee']
  });
});
