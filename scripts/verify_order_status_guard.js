'use strict';

/* ORDER-APPROVAL-003 — kiểm chứng lớp chặn ở gateway (src/server/order-status-guard.js).
   Không cần DB, không cần chạy server: chỉ nạp module và assert từng luật.

   Ca kiểm tra bám theo bộ test bắt buộc của backlog:
     - gọi API cũ kèm StatusID thì StatusID bị gỡ trước khi chuyển tiếp;
     - endpoint duyệt đơn là nơi DUY NHẤT được mang StatusID;
     - GET vẫn giữ StatusID (bộ lọc danh sách đơn, không phải lệnh đổi trạng thái);
     - identity của API đọc do server quyết định, client không khai đè được. */

const assert = require('assert');
const guard = require('../src/server/order-status-guard');

const results = [];
function check(name, fn) {
  fn();
  results.push([name, true]);
}

// ── Gỡ StatusID khỏi mọi mutation không phải endpoint duyệt đơn ────────────────
check('STATUSID_STRIPPED_FROM_LEGACY_UPDATE', () => {
  assert.strictEqual(guard.shouldStripOrderStatus('POST', '/api/API_DonHang_Update'), true);
  const body = { OldKeyID: 'D1', StatusID: 1, Notes: 'x' };
  const removed = guard.stripOrderStatusField(body);
  assert.deepStrictEqual(removed, ['StatusID']);
  assert.deepStrictEqual(body, { OldKeyID: 'D1', Notes: 'x' });
});

check('STATUSID_STRIPPED_CASE_INSENSITIVE', () => {
  const body = { statusid: 8, StatusID: 1, sTaTuSiD: 2 };
  const removed = guard.stripOrderStatusField(body);
  assert.strictEqual(removed.length, 3);
  assert.deepStrictEqual(Object.keys(body), []);
});

check('STATUSID_STRIPPED_FROM_OTHER_ORDER_WRITES', () => {
  for (const endpoint of ['/api/API_LuuDonNhap', '/api/API_DonHangChiTiet_Insert_AI',
    '/api/API_DonHangChiTiet_Update', '/api/API_DonHang_Insert']) {
    assert.strictEqual(guard.shouldStripOrderStatus('POST', endpoint), true, endpoint);
  }
});

check('APPROVE_ENDPOINT_KEEPS_STATUS_FIELDS', () => {
  assert.strictEqual(guard.shouldStripOrderStatus('POST', guard.ORDER_STATUS_WRITE_ENDPOINT), false);
  assert.strictEqual(guard.ORDER_STATUS_WRITE_ENDPOINT, '/api/API_DonHang_ApproveTransition_AI');
});

check('GET_FILTER_KEEPS_STATUSID', () => {
  assert.strictEqual(guard.shouldStripOrderStatus('GET', '/api/API_DonHang_AI'), false);
  assert.strictEqual(guard.shouldStripOrderStatus('HEAD', '/api/API_DonHang_AI'), false);
});

check('ERP_INTERNAL_ENDPOINTS_BLOCKED', () => {
  for (const endpoint of ['/api/AR_Order_CapNhatHangLoatStp', '/api/WA_Order_AfterSaveStp',
    '/api/AR_OrderLog_Stp', '/api/API_HoanTatDonHang']) {
    assert.strictEqual(guard.BLOCKED_ERP_ENDPOINTS.has(endpoint), true, endpoint);
  }
  assert.strictEqual(guard.BLOCKED_ERP_ENDPOINTS.has('/api/API_DonHang_AI'), false);
  assert.strictEqual(guard.BLOCKED_ERP_ENDPOINTS.has(guard.ORDER_STATUS_WRITE_ENDPOINT), false);
});

// ── Identity của API đọc do server quyết định ──────────────────────────────────
check('READ_IDENTITY_OVERRIDES_CLIENT_USERNAME', () => {
  const policy = guard.READ_IDENTITY_POLICY['/api/API_DonHang_ApprovalContext_AI'];
  assert.ok(policy, 'Thiếu chính sách identity cho API ngữ cảnh duyệt đơn');

  const forged = '/api/API_DonHang_ApprovalContext_AI?q='
    + encodeURIComponent(JSON.stringify({ Username: 'KE_TOAN_KHAC', DocumentID: 'DMB0826/1' }));
  const rewritten = guard.withServerOwnedQueryIdentity(forged, policy.identityField, 'demo');
  const filters = JSON.parse(new URL(rewritten, 'http://x.local').searchParams.get('q'));
  assert.strictEqual(filters.Username, 'demo');
  assert.strictEqual(filters.DocumentID, 'DMB0826/1', 'Tham số nghiệp vụ phải được giữ nguyên');
});

check('READ_IDENTITY_STRIPS_LOWERCASE_AND_QUERY_PARAM_FORMS', () => {
  const forged = '/api/API_DonHang_ApprovalContext_AI?username=hacker&User=hacker&q='
    + encodeURIComponent(JSON.stringify({ username: 'hacker', user: 'hacker', DocumentID: 'D1' }));
  const rewritten = guard.withServerOwnedQueryIdentity(forged, 'Username', 'demo');
  const url = new URL(rewritten, 'http://x.local');
  assert.strictEqual(url.searchParams.get('username'), null);
  assert.strictEqual(url.searchParams.get('User'), null);
  const filters = JSON.parse(url.searchParams.get('q'));
  assert.deepStrictEqual(Object.keys(filters).sort(), ['DocumentID', 'Username']);
  assert.strictEqual(filters.Username, 'demo');
});

check('READ_IDENTITY_SURVIVES_BROKEN_Q', () => {
  const rewritten = guard.withServerOwnedQueryIdentity(
    '/api/API_DonHang_ApprovalContext_AI?q=%7Bnot-json', 'Username', 'demo');
  const filters = JSON.parse(new URL(rewritten, 'http://x.local').searchParams.get('q'));
  assert.deepStrictEqual(filters, { Username: 'demo' });
});

check('READ_IDENTITY_HANDLES_MISSING_Q', () => {
  const rewritten = guard.withServerOwnedQueryIdentity(
    '/api/API_DonHang_ApprovalContext_AI', 'Username', 'demo');
  const filters = JSON.parse(new URL(rewritten, 'http://x.local').searchParams.get('q'));
  assert.deepStrictEqual(filters, { Username: 'demo' });
});

// ── PRODUCT-DIAG-001: danh mục sản phẩm cũng phải lấy identity từ token ────────
check('PRODUCT_CATALOG_IDENTITY_IS_SERVER_OWNED', () => {
  const policy = guard.READ_IDENTITY_POLICY['/api/API_HangHoaList_AI'];
  assert.ok(policy, 'API_HangHoaList_AI phải nằm trong READ_IDENTITY_POLICY trước khi bật chẩn đoán');
  assert.strictEqual(policy.identityField, 'Username');

  /* Giả danh tài khoản khác để dò quyền kho/giá: mọi biến thể đều phải bị ghi đè. */
  const forged = '/api/API_HangHoaList_AI?Username=GIAM_DOC&user=GIAM_DOC&q='
    + encodeURIComponent(JSON.stringify({
      Username: 'GIAM_DOC', username: 'GIAM_DOC', ObjectID: 'DL011', ItemID: 'A008', SearchText: '',
    }));
  const url = new URL(guard.withServerOwnedQueryIdentity(forged, policy.identityField, 'sale01'), 'http://x.local');
  assert.strictEqual(url.searchParams.get('Username'), null);
  assert.strictEqual(url.searchParams.get('user'), null);

  const filters = JSON.parse(url.searchParams.get('q'));
  assert.strictEqual(filters.Username, 'sale01', 'Username phải là người đăng nhập, không phải giá trị client gửi');
  assert.deepStrictEqual(Object.keys(filters).sort(), ['ItemID', 'ObjectID', 'SearchText', 'Username']);
  assert.strictEqual(filters.ObjectID, 'DL011', 'Tham số nghiệp vụ phải giữ nguyên');
  assert.strictEqual(filters.ItemID, 'A008');
});

// ── ORDER-APPROVAL-005: proc CRUD cũ phải bị chặn hẳn ─────────────────────────
check('LEGACY_ORDER_CRUD_ENDPOINTS_ARE_BLOCKED', () => {
  for (const endpoint of ['/api/API_DonHang_Update', '/api/API_DonHang_Delete',
    '/api/API_DonHangChiTiet_Insert', '/api/API_DonHangChiTiet_Update',
    '/api/API_DonHangChiTiet_Delete']) {
    assert.strictEqual(guard.BLOCKED_ERP_ENDPOINTS.has(endpoint), true,
      endpoint + ' phải bị chặn: proc không nhận identity, không idempotency, không audit');
  }
});

check('INTERNAL_STATUS_LOOKUP_IS_BLOCKED', () => {
  // Proc không nhận @Username nên trả trạng thái của BẤT KỲ DocumentID nào. Mã đơn đánh số
  // tuần tự nên để hở là cho phép quét sạch đơn của mọi chi nhánh.
  assert.strictEqual(guard.BLOCKED_ERP_ENDPOINTS.has('/api/API_DonHang_StatusLookup_AI'), true);
});

check('OWNER_TRANSITION_IS_NOT_BLOCKED_AFTER_DRAFT_RESTORE', () => {
  // ORDER-APPROVAL-006: khách đổi ý 21/08/2026, khôi phục Lưu nháp — endpoint này đi qua
  // DIRECT_MUTATION_POLICY trong server.js (identity gắn từ token), không còn bị chặn ở đây.
  assert.strictEqual(guard.BLOCKED_ERP_ENDPOINTS.has('/api/API_DonHang_OwnerTransition_AI'), false);
});

check('EDIT_CONTEXT_IDENTITY_IS_SERVER_OWNED', () => {
  const policy = guard.READ_IDENTITY_POLICY['/api/API_DonHang_EditContext_AI'];
  assert.ok(policy, 'API ngữ cảnh sửa đơn phải lấy identity từ token');
  const forged = '/api/API_DonHang_EditContext_AI?q='
    + encodeURIComponent(JSON.stringify({ Username: 'KE_TOAN_KHAC', DocumentID: 'DMB0726/1' }));
  const filters = JSON.parse(new URL(
    guard.withServerOwnedQueryIdentity(forged, policy.identityField, 'sale01'),
    'http://x.local').searchParams.get('q'));
  assert.strictEqual(filters.Username, 'sale01');
  assert.strictEqual(filters.DocumentID, 'DMB0726/1');
});

// ── ORDER-APPROVAL-006: ngữ cảnh Gửi duyệt/Hủy nháp cũng phải lấy identity từ token ────
check('OWNER_CONTEXT_IDENTITY_IS_SERVER_OWNED', () => {
  const policy = guard.READ_IDENTITY_POLICY['/api/API_DonHang_OwnerContext_AI'];
  assert.ok(policy, 'API ngữ cảnh chủ đơn phải lấy identity từ token');
  const forged = '/api/API_DonHang_OwnerContext_AI?q='
    + encodeURIComponent(JSON.stringify({ Username: 'KE_TOAN_KHAC', DocumentID: 'DMB0726/1' }));
  const filters = JSON.parse(new URL(
    guard.withServerOwnedQueryIdentity(forged, policy.identityField, 'sale01'),
    'http://x.local').searchParams.get('q'));
  assert.strictEqual(filters.Username, 'sale01');
  assert.strictEqual(filters.DocumentID, 'DMB0726/1');
});

// ── PROMO-CFG-002: toàn bộ API cấu hình CTBH phải dùng identity từ token ──────────
check('PROMOTION_READ_IDENTITY_IS_SERVER_OWNED', () => {
  const endpoints = [
    '/api/API_PromotionProgram_List_AI',
    '/api/API_PromotionProgram_Detail_AI',
    '/api/API_PromotionActiveByItems_AI',
    '/api/API_PromotionPermissionContext_AI',
    '/api/API_PromotionProgram_History_AI',
    '/api/API_CTBHSanPham_AI'
  ];
  for (const endpoint of endpoints) {
    const policy = guard.READ_IDENTITY_POLICY[endpoint];
    assert.ok(policy, endpoint + ' thiếu READ_IDENTITY_POLICY');
    const forged = endpoint + '?Username=manager&q=' + encodeURIComponent(JSON.stringify({
      USERNAME: 'manager', username: 'manager', PromotionProgramID: 17, JsonItemIDs: '["A008"]'
    }));
    const url = new URL(
      guard.withServerOwnedQueryIdentity(forged, policy.identityField, 'sale01'),
      'http://x.local'
    );
    assert.strictEqual(url.searchParams.get('Username'), null);
    const filters = JSON.parse(url.searchParams.get('q'));
    assert.strictEqual(filters.Username, 'sale01');
    assert.strictEqual(filters.USERNAME, undefined);
    assert.strictEqual(filters.username, undefined);
    assert.strictEqual(filters.PromotionProgramID, 17, 'Không được làm rơi field nghiệp vụ');
  }
});

check('CONTRACT_ANALYTICS_IDENTITY_IS_SERVER_OWNED', () => {
  for (const endpoint of [
    '/api/API_ContractCustomerStats_AI',
    '/api/API_ContractCustomerNoSales_AI'
  ]) {
    const policy = guard.READ_IDENTITY_POLICY[endpoint];
    assert.ok(policy, endpoint + ' thiếu READ_IDENTITY_POLICY');
    const forged = endpoint + '?q=' + encodeURIComponent(JSON.stringify({
      Username: 'director', username: 'director', ContractYear: 2026, AsOfDate: '2026-09-04'
    }));
    const filters = JSON.parse(new URL(
      guard.withServerOwnedQueryIdentity(forged, policy.identityField, 'sale01'),
      'http://x.local'
    ).searchParams.get('q'));
    assert.strictEqual(filters.Username, 'sale01');
    assert.strictEqual(filters.username, undefined);
    assert.strictEqual(filters.ContractYear, 2026);
    assert.strictEqual(filters.AsOfDate, '2026-09-04');
  }
});

check('PROMOTION_MUTATION_IDENTITY_IS_SERVER_OWNED', () => {
  const policy = guard.IDENTITY_ONLY_MUTATION_POLICY['/api/API_PromotionProgram_Approve_AI'];
  const rewritten = guard.withServerOwnedOrderedBody({
    Reason: 'Lý do kiểm thử', Apply: 1, USER: 'manager',
    Action: 'REJECT', PromotionProgramID: 17, Username: 'manager'
  }, policy, 'sale01');
  assert.deepStrictEqual(rewritten, {
    PromotionProgramID: 17,
    Action: 'REJECT',
    Username: 'sale01',
    Apply: 1,
    Reason: 'Lý do kiểm thử'
  });
  assert.deepStrictEqual(Object.keys(rewritten), policy.orderedFields);
});

check('PROMOTION_UPSERT_BODY_USES_EXACT_PROCEDURE_ORDER', () => {
  const policy = guard.IDENTITY_ONLY_MUTATION_POLICY['/api/API_PromotionProgram_Upsert_AI'];
  const rewritten = guard.withServerOwnedOrderedBody({
    Apply: 0,
    JsonRules: '[]',
    SourceDocument: 'UAT',
    EffectiveTo: '2026-08-23T00:00:00',
    EffectiveFrom: '2026-08-22T00:00:00',
    ProgramType: 'EVENT',
    PromotionName: 'Kiểm thử',
    PromotionCode: 'PROMO_TEST',
    username: 'forged-manager'
  }, policy, 'manager01');
  assert.deepStrictEqual(Object.keys(rewritten), policy.orderedFields);
  assert.strictEqual(rewritten.Username, 'manager01');
  assert.strictEqual(rewritten.PromotionProgramID, null);
  assert.strictEqual(rewritten.Description, null);
  assert.strictEqual(rewritten.BranchScopeMode, 'ALL');
  assert.strictEqual(rewritten.Priority, 100);
});

check('PROMOTION_MUTATION_UNKNOWN_FIELD_IS_REJECTED', () => {
  const policy = guard.IDENTITY_ONLY_MUTATION_POLICY['/api/API_PromotionProgram_Approve_AI'];
  assert.throws(() => guard.withServerOwnedOrderedBody({
    PromotionProgramID: 17, Action: 'APPROVE', Apply: 0, InjectedField: 'shift'
  }, policy, 'manager01'), /UNKNOWN_MUTATION_FIELD:InjectedField/);
});

check('PROMOTION_MUTATION_DUPLICATE_CASE_VARIANT_IS_REJECTED', () => {
  const policy = guard.IDENTITY_ONLY_MUTATION_POLICY['/api/API_PromotionProgram_Approve_AI'];
  assert.throws(() => guard.withServerOwnedOrderedBody({
    PromotionProgramID: 17, Action: 'APPROVE', action: 'REJECT', Apply: 0
  }, policy, 'manager01'), /DUPLICATE_MUTATION_FIELD:Action/);
});

check('PROMOTION_MUTATION_MISSING_REQUIRED_FIELD_IS_REJECTED', () => {
  const policy = guard.IDENTITY_ONLY_MUTATION_POLICY['/api/API_PromotionProgram_Approve_AI'];
  assert.throws(() => guard.withServerOwnedOrderedBody({
    PromotionProgramID: 17, Apply: 0
  }, policy, 'manager01'), /MISSING_MUTATION_FIELD:Action/);
});

console.log(JSON.stringify({ Task: 'VERIFY-ORDER-STATUS-GUARD', Status: 'PASS', Results: results }, null, 2));
