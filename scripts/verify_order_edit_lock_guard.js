'use strict';

/* ORDER-APPROVAL-002 (điểm "Khóa sửa đơn") — kiểm chứng lớp thuần
   (src/server/order-edit-lock-guard.js). Không cần DB, không cần chạy server. */

const assert = require('assert');
const guard = require('../src/server/order-edit-lock-guard');

const results = [];
function check(name, fn) {
  fn();
  results.push([name, true]);
}

check('DOCUMENT_UPDATE_RESOLVES_DOCUMENT_ID', () => {
  const key = guard.resolveLockKey('/api/API_DonHang_Update', { OldKeyID: 'DMB0826/1', Notes: 'x' });
  assert.deepStrictEqual(key, { documentId: 'DMB0826/1' });
});

check('CHITIET_INSERT_RESOLVES_DOCUMENT_ID', () => {
  const key = guard.resolveLockKey('/api/API_DonHangChiTiet_Insert', { DocumentID: 'DMB0826/1', ItemID: 'B037' });
  assert.deepStrictEqual(key, { documentId: 'DMB0826/1' });
});

check('CHITIET_UPDATE_RESOLVES_USER_AUTO_ID', () => {
  const key = guard.resolveLockKey('/api/API_DonHangChiTiet_Update', { OldKeyID: 'abc-123', ItemID: 'B037' });
  assert.deepStrictEqual(key, { userAutoId: 'abc-123' });
});

check('CHITIET_DELETE_RESOLVES_USER_AUTO_ID', () => {
  const key = guard.resolveLockKey('/api/API_DonHangChiTiet_Delete', { UserAutoID: 'abc-123' });
  assert.deepStrictEqual(key, { userAutoId: 'abc-123' });
});

check('DONHANG_DELETE_RESOLVES_DOCUMENT_ID', () => {
  const key = guard.resolveLockKey('/api/API_DonHang_Delete', { OldKeyID: 'DMB0826/1' });
  assert.deepStrictEqual(key, { documentId: 'DMB0826/1' });
});

check('UNRELATED_ENDPOINT_RETURNS_NULL', () => {
  assert.strictEqual(guard.resolveLockKey('/api/API_DonHang_AI', { DocumentID: 'x' }), null);
  assert.strictEqual(guard.resolveLockKey('/api/API_DonHang_ApproveTransition_AI', { DocumentID: 'x' }), null);
});

check('MISSING_KEY_FIELD_RETURNS_NULL', () => {
  assert.strictEqual(guard.resolveLockKey('/api/API_DonHang_Update', { Notes: 'x' }), null);
  assert.strictEqual(guard.resolveLockKey('/api/API_DonHang_Update', { OldKeyID: '' }), null);
  assert.strictEqual(guard.resolveLockKey('/api/API_DonHang_Update', null), null);
  assert.strictEqual(guard.resolveLockKey('/api/API_DonHang_Update', ['not', 'an', 'object']), null);
});

check('IS_LOCKED_THRESHOLD_IS_STATUS_ID_GTE_1', () => {
  assert.strictEqual(guard.isLocked(1), true);
  assert.strictEqual(guard.isLocked(2), true);
  assert.strictEqual(guard.isLocked(10), true);
  assert.strictEqual(guard.isLocked(0), false);
  assert.strictEqual(guard.isLocked(-1), false);
  assert.strictEqual(guard.isLocked(-2), false);
});

check('IS_LOCKED_NON_NUMBER_IS_NOT_LOCKED', () => {
  assert.strictEqual(guard.isLocked(null), false);
  assert.strictEqual(guard.isLocked(undefined), false);
  assert.strictEqual(guard.isLocked('1'), false);
});

check('POLICY_COVERS_EXACTLY_THE_5_LEGACY_CRUD_ENDPOINTS', () => {
  const expected = [
    '/api/API_DonHang_Update',
    '/api/API_DonHangChiTiet_Insert',
    '/api/API_DonHangChiTiet_Update',
    '/api/API_DonHangChiTiet_Delete',
    '/api/API_DonHang_Delete'
  ].sort();
  assert.deepStrictEqual(Object.keys(guard.EDIT_LOCK_POLICY).sort(), expected);
});

console.log(JSON.stringify({ Task: 'VERIFY-ORDER-EDIT-LOCK-GUARD', Status: 'PASS', Results: results }, null, 2));
