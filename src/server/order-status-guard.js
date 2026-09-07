'use strict';

/**
 * ORDER-APPROVAL-003 — các luật gateway của luồng duyệt đơn.
 *
 * Tách khỏi server.js để kiểm chứng được bằng test tự động (scripts/verify_order_status_guard.js):
 * server.js gọi app.listen() ngay khi require nên không thể nạp vào test để kiểm tra từng hàm.
 *
 * Không chứa bí mật: chỉ là danh sách endpoint và các phép biến đổi thuần.
 */

/** Endpoint DUY NHẤT được phép đổi trạng thái đơn (proc có kiểm hợp đồng/vai trò/idempotency/audit). */
const ORDER_STATUS_WRITE_ENDPOINT = '/api/API_DonHang_ApproveTransition_AI';

/**
 * API chỉ-đọc phải lấy identity từ token thay vì tin trình duyệt.
 * (Mutation đã có DIRECT_MUTATION_POLICY riêng trong server.js.)
 */
const READ_IDENTITY_POLICY = Object.freeze({
    '/api/API_DonHang_ApprovalContext_AI': Object.freeze({ identityField: 'Username' }),
    /*
     * PRODUCT-DIAG-001: API này quyết định theo phạm vi kho, bảng giá và nhóm khách của
     * người gọi, và nay còn trả về LÝ DO bị loại. Nếu vẫn tin Username do trình duyệt gửi
     * thì bất kỳ ai cũng đổi tên người khác để dò xem tài khoản đó có quyền kho nào, thấy
     * giá nào. Phải khoá identity từ token TRƯỚC khi bật chẩn đoán chi tiết.
     */
    '/api/API_HangHoaList_AI': Object.freeze({ identityField: 'Username' }),
    /*
     * ORDER-APPROVAL-005: API này trả lời "bạn có sửa được đơn này không" và lý do vì sao
     * không. Câu trả lời phụ thuộc vai trò và chi nhánh của người hỏi, nên identity phải do
     * server quyết định — nếu không thì đổi tên trong payload là dò được quyền của người khác.
     */
    '/api/API_DonHang_EditContext_AI': Object.freeze({ identityField: 'Username' }),
    /*
     * ORDER-APPROVAL-006: API trả lời "bạn có Gửi duyệt/Hủy được đơn nháp này không" — cùng
     * lý do với EditContext ở trên, identity không được tin từ payload.
     */
    '/api/API_DonHang_OwnerContext_AI': Object.freeze({ identityField: 'Username' }),
    /*
     * PROMO-CFG-002: ba API đọc CTBH kiểm quyền/phạm vi theo @Username. Nếu gateway tin
     * Username trong q thì Sale có thể giả tài khoản quản lý để đọc cả cấu hình nội bộ.
     */
    '/api/API_PromotionProgram_List_AI': Object.freeze({ identityField: 'Username' }),
    '/api/API_PromotionProgram_Detail_AI': Object.freeze({ identityField: 'Username' }),
    '/api/API_PromotionActiveByItems_AI': Object.freeze({ identityField: 'Username' }),
    '/api/API_PromotionPermissionContext_AI': Object.freeze({ identityField: 'Username' }),
    '/api/API_PromotionProgram_History_AI': Object.freeze({ identityField: 'Username' }),
    '/api/API_CTBHSanPham_AI': Object.freeze({ identityField: 'Username' }),
    '/api/API_ContractCustomerStats_AI': Object.freeze({ identityField: 'Username' }),
    '/api/API_ContractCustomerNoSales_AI': Object.freeze({ identityField: 'Username' }),
    /*
     * SEARCH-003/004: kết quả tìm kiếm phải giới hạn đúng phạm vi người gọi thật. Nếu tin
     * Username trong q thì Sale giả tên quản lý là dò được toàn bộ khách/sản phẩm ngoài phạm vi.
     */
    '/api/API_CustomerSearch_AI': Object.freeze({ identityField: 'Username' }),
    '/api/API_ProductSearch_AI': Object.freeze({ identityField: 'Username' })
});

/**
 * Mutation cần identity server-owned nhưng procedure chưa có ledger/idempotency parameters.
 * Không đưa các endpoint này vào DIRECT_MUTATION_POLICY: policy đó bắt buộc và chuyển tiếp
 * IdempotencyKey/RequestID, trong khi hai proc Promotion không khai báo hai tham số này.
 */
const IDENTITY_ONLY_MUTATION_POLICY = Object.freeze({
    '/api/API_PromotionProgram_Upsert_AI': Object.freeze({
        identityField: 'Username',
        orderedFields: Object.freeze([
            'PromotionProgramID', 'PromotionCode', 'PromotionName', 'ProgramType',
            'Description', 'EffectiveFrom', 'EffectiveTo', 'BranchScopeMode',
            'JsonBranchIDs', 'UserGroupScopeMode', 'JsonUserGroupIDs', 'Priority',
            'SourceDocument', 'JsonRules', 'Username', 'Apply'
        ]),
        defaults: Object.freeze({
            PromotionProgramID: null,
            Description: null,
            BranchScopeMode: 'ALL',
            JsonBranchIDs: '[]',
            UserGroupScopeMode: 'ALL',
            JsonUserGroupIDs: '[]',
            Priority: 100,
            JsonRules: '[]',
            Apply: 0
        })
    }),
    '/api/API_PromotionProgram_Approve_AI': Object.freeze({
        identityField: 'Username',
        orderedFields: Object.freeze([
            'PromotionProgramID', 'Action', 'Username', 'Apply', 'Reason'
        ]),
        defaults: Object.freeze({ Apply: 0, Reason: null })
    }),
    /*
     * SEARCH-001: token chọn kết quả gắn với danh tính đã xác thực + phiên hội thoại. Nếu tin
     * Username từ payload thì một tài khoản có thể phát hành/tiêu thụ token thay tài khoản khác.
     */
    '/api/API_SelectionToken_Issue_AI': Object.freeze({
        identityField: 'Username',
        orderedFields: Object.freeze([
            'Username', 'ChannelType', 'ChannelSessionID', 'EntityType', 'CandidateJson', 'PendingRequestJson'
        ]),
        defaults: Object.freeze({ PendingRequestJson: null })
    }),
    '/api/API_SelectionToken_Consume_AI': Object.freeze({
        identityField: 'Username',
        orderedFields: Object.freeze([
            'Username', 'ChannelType', 'ChannelSessionID', 'SelectionToken', 'ChosenEntityID', 'ChosenIndex'
        ]),
        defaults: Object.freeze({ ChosenEntityID: '', ChosenIndex: null })
    })
});

/**
 * Procedure nội bộ của ERP có thể đổi trạng thái đơn (kể cả hàng loạt). Ứng dụng không dùng
 * cái nào trong số này; backend ERP expose procedure theo tên nên nếu để hở qua gateway thì
 * Sale chỉ cần devtools là tự duyệt được đơn của mình.
 */
const BLOCKED_ERP_ENDPOINTS = new Set([
    '/api/AR_Order_CapNhatHangLoatStp',
    '/api/AR_Order_AfterSaveStp',
    '/api/WA_Order_AfterSaveStp',
    '/api/AR_Order_UpdateOnOpenCloseStp',
    '/api/AR_OrderLog_Stp',
    '/api/AR_OrderToInvoiceStp',
    '/api/AR_StockOutStatus_UpdateStp',
    '/api/API_HoanTatDonHang',

    /*
     * ORDER-APPROVAL-005 — 5 proc CRUD đơn hàng của ERP.
     *
     * Cả 5 đều KHÔNG nhận identity người gọi (đã đối chiếu INFORMATION_SCHEMA.PARAMETERS thật
     * trên medtest), không có idempotency, không audit. API_DonHangChiTiet_Delete còn xoá thẳng
     * theo UserAutoID mà không kiểm cả trạng thái lẫn chủ sở hữu, và API_DonHang_Update có
     * nhánh "@StatusID > 0 thì đổi thẳng trạng thái rồi thoát" bỏ qua mọi kiểm tra duyệt.
     * Người đã đăng nhập chỉ cần biết DocumentID/UserAutoID là sửa/xoá được đơn của người khác.
     *
     * App đi qua 4 proc thay thế trong sql/ORDER-APPROVAL-005_Order_Edit_Guard_AI.sql: chúng
     * khoá dòng đơn, kiểm quyền và ghi trong CÙNG một transaction.
     */
    '/api/API_DonHang_Update',
    '/api/API_DonHang_Delete',
    '/api/API_DonHangChiTiet_Insert',
    '/api/API_DonHangChiTiet_Update',
    '/api/API_DonHangChiTiet_Delete',

    /*
     * Proc đọc nội bộ, không nhận @Username nên không giới hạn theo phạm vi người gọi. Để hở
     * là ai đăng nhập cũng dò được sự tồn tại và trạng thái của bất kỳ DocumentID nào — mã đơn
     * lại đánh số tuần tự (DMB0726/1) nên quét sạch là chuyện vài phút.
     * Từ ORDER-APPROVAL-005 gateway không còn cần nó: việc khoá sửa đã nằm trong SQL.
     */
    '/api/API_DonHang_StatusLookup_AI'

    /*
     * ORDER-APPROVAL-006: API_DonHang_OwnerTransition_AI (Gửi duyệt / Hủy đơn nháp phía chủ
     * đơn) đã được MỞ LẠI — khách đổi ý, muốn giữ Lưu nháp (21/08/2026). Không còn chặn ở
     * đây; đi qua DIRECT_MUTATION_POLICY trong server.js (Username do gateway gắn từ token).
     * Bản thân proc chỉ cho phép đúng 2 transition đã APPROVED trong dữ liệu hợp đồng
     * (SUBMIT -1->0, CANCEL -1->10) — xem sql/ORDER-APPROVAL-006_Draft_Restore_AI.sql.
     */
]);

/**
 * Gỡ StatusID khỏi payload ghi. dbo.API_DonHang_Update vẫn còn nhánh cũ "hễ @StatusID > 0 là
 * đổi thẳng trạng thái", bỏ qua mọi kiểm tra quyền/chi nhánh/transition.
 *
 * @returns {string[]} tên các trường đã gỡ (để ghi log đối soát)
 */
const stripOrderStatusField = (body) => {
    if (!body || typeof body !== 'object' || Array.isArray(body)) return [];
    const removed = [];
    for (const key of Object.keys(body)) {
        if (key.toLowerCase() === 'statusid') {
            delete body[key];
            removed.push(key);
        }
    }
    return removed;
};

/** Chỉ chặn method ghi: GET vẫn được mang StatusID vì đó là bộ lọc danh sách đơn. */
const shouldStripOrderStatus = (method, endpointPath) => {
    const upperMethod = String(method || '').toUpperCase();
    if (upperMethod === 'GET' || upperMethod === 'HEAD') return false;
    return endpointPath !== ORDER_STATUS_WRITE_ENDPOINT;
};

/**
 * Ghi đè identity cho API đọc kiểu ERP: tham số nằm trong chuỗi JSON ở query `q`, nên không
 * thể set bằng query param như withServerOwnedIdentity().
 */
const withServerOwnedQueryIdentity = (endpoint, identityField, username) => {
    const parsed = new URL(endpoint, 'http://gateway.local');
    for (const key of Array.from(parsed.searchParams.keys())) {
        if (['user', 'username'].includes(key.toLowerCase())) parsed.searchParams.delete(key);
    }

    let filters = {};
    const rawFilters = parsed.searchParams.get('q');
    if (rawFilters) {
        try {
            const parsedFilters = JSON.parse(rawFilters);
            if (parsedFilters && typeof parsedFilters === 'object' && !Array.isArray(parsedFilters)) {
                filters = parsedFilters;
            }
        } catch (_) {
            // q hỏng thì coi như không có bộ lọc; identity vẫn do server quyết định.
            filters = {};
        }
    }
    for (const key of Object.keys(filters)) {
        if (['user', 'username'].includes(key.toLowerCase())) delete filters[key];
    }
    filters[identityField] = username;
    parsed.searchParams.set('q', JSON.stringify(filters));
    return parsed.pathname + parsed.search;
};

/** Gỡ mọi biến thể User/Username do client gửi rồi gắn identity đã xác minh từ token. */
const withServerOwnedBodyIdentity = (body, identityField, username) => {
    const rewritten = body && typeof body === 'object' && !Array.isArray(body) ? { ...body } : {};
    for (const key of Object.keys(rewritten)) {
        if (['user', 'username'].includes(key.toLowerCase())) delete rewritten[key];
    }
    rewritten[identityField] = username;
    return rewritten;
};

/**
 * Dựng lại payload CTBH theo đúng thứ tự tham số procedure.
 *
 * ERP đang bind JSON body theo vị trí. Vì vậy không được spread payload của client: field lạ,
 * field thiếu hoặc thứ tự client gửi đều có thể làm các giá trị trượt sang tham số kế tiếp.
 * Hàm này canonicalize tên field, loại mọi identity client tự khai, điền default cho tham số
 * optional và từ chối field lạ/trùng trước khi request rời gateway.
 */
const withServerOwnedOrderedBody = (body, policy, username) => {
    if (!body || typeof body !== 'object' || Array.isArray(body)) {
        throw new Error('INVALID_MUTATION_BODY');
    }
    if (!policy || !Array.isArray(policy.orderedFields) || !policy.identityField) {
        throw new Error('INVALID_MUTATION_POLICY');
    }
    if (!String(username || '').trim()) throw new Error('MISSING_SERVER_IDENTITY');

    const canonicalByLowerName = new Map(
        policy.orderedFields.map((field) => [field.toLowerCase(), field])
    );
    const supplied = Object.create(null);
    for (const [rawKey, value] of Object.entries(body)) {
        const lowerKey = rawKey.toLowerCase();
        if (lowerKey === 'user' || lowerKey === 'username') continue;
        const canonicalKey = canonicalByLowerName.get(lowerKey);
        if (!canonicalKey) throw new Error('UNKNOWN_MUTATION_FIELD:' + rawKey);
        if (Object.prototype.hasOwnProperty.call(supplied, canonicalKey)) {
            throw new Error('DUPLICATE_MUTATION_FIELD:' + canonicalKey);
        }
        supplied[canonicalKey] = value;
    }

    const defaults = policy.defaults || {};
    const rewritten = {};
    for (const field of policy.orderedFields) {
        if (field === policy.identityField) {
            rewritten[field] = username;
        } else if (Object.prototype.hasOwnProperty.call(supplied, field) && supplied[field] !== undefined) {
            rewritten[field] = supplied[field];
        } else if (Object.prototype.hasOwnProperty.call(defaults, field)) {
            rewritten[field] = defaults[field];
        } else {
            throw new Error('MISSING_MUTATION_FIELD:' + field);
        }
    }
    return rewritten;
};

module.exports = {
    ORDER_STATUS_WRITE_ENDPOINT,
    READ_IDENTITY_POLICY,
    IDENTITY_ONLY_MUTATION_POLICY,
    BLOCKED_ERP_ENDPOINTS,
    stripOrderStatusField,
    shouldStripOrderStatus,
    withServerOwnedQueryIdentity,
    withServerOwnedBodyIdentity,
    withServerOwnedOrderedBody
};
