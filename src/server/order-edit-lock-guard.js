'use strict';

/**
 * ORDER-APPROVAL-002 (điểm "Khóa sửa đơn") — luật khóa sửa đơn ở tầng gateway.
 *
 * Tách khỏi server.js để kiểm chứng được bằng test tự động
 * (scripts/verify_order_edit_lock_guard.js), theo đúng mẫu đã có ở
 * src/server/order-status-guard.js (KHÔNG sửa file đó — phiên khác đang phát triển nó).
 *
 * Không chứa bí mật: chỉ là danh sách endpoint + phép biến đổi thuần, không gọi DB/HTTP.
 * server.js là nơi thực sự gọi HTTP nội bộ tới API_DonHang_StatusLookup_AI rồi dùng
 * isLocked() để quyết định có forward request hay không.
 */

/**
 * Các endpoint sửa/xoá đơn hàng hoặc dòng sản phẩm cần khóa khi đơn đã StatusID >= 1
 * (đã được Duyệt trở đi). Mỗi entry khai field trong body chứa khoá tra cứu, và khoá đó là
 * DocumentID trực tiếp hay UserAutoID (cần proc StatusLookup_AI resolve ngược ra DocumentID).
 */
const EDIT_LOCK_POLICY = Object.freeze({
    '/api/API_DonHang_Update': Object.freeze({ keyField: 'OldKeyID', keyType: 'documentId' }),
    '/api/API_DonHangChiTiet_Insert': Object.freeze({ keyField: 'DocumentID', keyType: 'documentId' }),
    '/api/API_DonHangChiTiet_Update': Object.freeze({ keyField: 'OldKeyID', keyType: 'userAutoId' }),
    '/api/API_DonHangChiTiet_Delete': Object.freeze({ keyField: 'UserAutoID', keyType: 'userAutoId' }),
    '/api/API_DonHang_Delete': Object.freeze({ keyField: 'OldKeyID', keyType: 'documentId' })
});

/**
 * Từ 1 endpoint path + body request, rút ra khoá tra cứu cần dùng để gọi
 * API_DonHang_StatusLookup_AI. Hàm THUẦN — không gọi DB/HTTP.
 *
 * @returns {{documentId: string}|{userAutoId: string}|null} null nếu endpoint không nằm
 *          trong EDIT_LOCK_POLICY, hoặc body thiếu khoá cần thiết.
 */
const resolveLockKey = (endpointPath, body) => {
    const policy = EDIT_LOCK_POLICY[endpointPath];
    if (!policy) return null;
    if (!body || typeof body !== 'object' || Array.isArray(body)) return null;

    const value = body[policy.keyField];
    if (typeof value !== 'string' || value.trim() === '') return null;

    return policy.keyType === 'userAutoId' ? { userAutoId: value } : { documentId: value };
};

/**
 * Đơn đã Duyệt trở đi (StatusID >= 1) thì khóa sửa. StatusID null/undefined (không tìm thấy
 * đơn) không được coi là "chưa khóa" — gọi nơi khác (server.js) phải tự fail-closed khi
 * lookup thất bại, hàm này chỉ trả lời đúng câu hỏi "trạng thái này có bị khóa không".
 */
const isLocked = (statusId) => typeof statusId === 'number' && statusId >= 1;

module.exports = {
    EDIT_LOCK_POLICY,
    resolveLockKey,
    isLocked
};
