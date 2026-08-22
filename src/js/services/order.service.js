/**
 * OrderService — quản lý đơn hàng
 */
const OrderService = (() => {
  const EP = API_CONFIG.ENDPOINTS.ORDERS;

  function getList(filters = {}) {
    return Http.get(EP.LIST, { q: JSON.stringify(filters) });
  }

  function getDetail(orderId, documentId) {
    return Http.get(EP.DETAIL, { q: JSON.stringify({ ID: orderId, DocumentID: documentId || '' }) });
  }

  function create(payload) {
    return Http.post(EP.CREATE, payload);
  }

  function getThongKeSoLuong(filters = {}) {
    return Http.get(EP.THONG_KE_SO_LUONG, filters);
  }

  // ORDER-APPROVAL-005: sửa đơn đi qua 4 proc API_DonHang_Edit*_AI. Chúng kiểm quyền và khoá
  // trạng thái đơn trong CÙNG transaction SQL, có idempotency ledger và audit thật.
  // KHÔNG gửi field User/Username: gateway tự gắn Username từ token, client khai là vô nghĩa.
  // Bắt buộc truyền options.idempotencyKey, thiếu là gateway trả 422.
  function update(payload, options) {
    return Http.post(EP.UPDATE, payload, options);
  }

  // Xoá cả đơn: không còn endpoint nào. API_DonHang_Delete đã bị chặn ở gateway vì không
  // kiểm chủ sở hữu. Muốn bỏ đơn thì xử lý bên phần mềm kế toán.

  function deleteDetail(userAutoId, options) {
    return Http.post(EP.DELETE_DETAIL, { UserAutoID: userAutoId }, options);
  }

  function insertDetail(payload, options) {
    // Bỏ workaround "Notes: 0". Proc ERP cũ ghi lệch cột (@Notes rơi vào DiemTichLuy kiểu số)
    // nên trước đây phải truyền số cho SQL convert được. API_DonHang_EditItemInsert_AI ghi
    // đúng cột nên Notes lại là chuỗi bình thường. UserAutoID cũng bỏ: proc tự sinh và trả về.
    return Http.post(EP.INSERT_DETAIL, Object.assign({ SoLuongTang: 0, DiemSanPham: 0, Notes: '' }, payload), options);
  }

  function updateDetail(payload, options) {
    // payload: { UserAutoID, ItemID, Quantity, SoLuongTang, UnitPrice, Amount, DiscountPercent, DiscountAmount, DiemSanPham, Notes }
    return Http.post(EP.UPDATE_DETAIL, Object.assign({ SoLuongTang: 0, DiemSanPham: 0, Notes: '' }, payload), options);
  }

  // ORDER-APPROVAL-006: chủ đơn Gửi duyệt / Hủy đơn nháp của chính mình. CanSubmit/CanCancel
  // trả về đúng theo hợp đồng đã APPROVED (chỉ -1->0 và -1->10) — không cần chặn thêm ở JS.
  // Identity do gateway gắn từ token, không khai trong payload.
  function getOwnerContext(documentId) {
    return Http.get(EP.OWNER_CONTEXT, { q: JSON.stringify({ DocumentID: documentId }) }, { cache: false });
  }

  // payload: { DocumentID, Action: 'SUBMIT'|'CANCEL', ExpectedStatusID }. Bắt buộc truyền
  // options.idempotencyKey, thiếu là gateway trả 422. KHÔNG gửi Username: gateway tự gắn.
  function ownerTransition(payload, options) {
    return Http.post(EP.OWNER_TRANSITION, payload, options);
  }

  // ORDER-APPROVAL-005: hỏi trước khi mở trang sửa — CanEdit + BlockCode/BlockMsg nói rõ vì sao
  // không sửa được. Identity do gateway gắn từ token, không khai trong payload.
  function getEditContext(documentId) {
    return Http.get(EP.EDIT_CONTEXT, { q: JSON.stringify({ DocumentID: documentId }) }, { cache: false });
  }

  return {
    getList, getDetail, create, update, deleteDetail, insertDetail, updateDetail,
    getThongKeSoLuong, getOwnerContext, ownerTransition, getEditContext
  };
})();

// ─────────────────────────────────────────────────────────────────────────────

/**
 * InvoiceService — hóa đơn bán hàng
 */
const InvoiceService = (() => {
  const EP = API_CONFIG.ENDPOINTS.INVOICES;

  function getList(filters = {}) {
    // API_HoaDon_AI only accepts these four user filters; Username is injected
    // by the authenticated API layer. Do not forward UI-only paging fields.
    const apiFilters = {
      TuNgay: filters.TuNgay !== undefined ? filters.TuNgay : filters.FromDate,
      DenNgay: filters.DenNgay !== undefined ? filters.DenNgay : filters.ToDate,
      timkiem: filters.timkiem !== undefined ? filters.timkiem : (filters.SearchText || ''),
      MaKhachHang: filters.MaKhachHang !== undefined ? filters.MaKhachHang : (filters.ObjectID || '')
    };
    return Http.get(EP.LIST, { q: JSON.stringify(apiFilters) });
  }

  function getDetail(invoiceId) {
    return Http.get(EP.DETAIL, { invoiceId });
  }

  return { getList, getDetail };
})();

// ─────────────────────────────────────────────────────────────────────────────

/**
 * ReturnService — phiếu trả hàng
 */
const ReturnService = (() => {
  const EP = API_CONFIG.ENDPOINTS.RETURNS;

  function getList(filters = {}) {
    return Http.get(EP.LIST, { q: JSON.stringify(filters) });
  }

  function getDetail(returnId) {
    return Http.get(EP.DETAIL, { returnId });
  }

  return { getList, getDetail };
})();
