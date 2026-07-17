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

  function update(payload) {
    return Http.post(EP.UPDATE, payload);
  }

  function deleteOrder(orderId) {
    return Http.post(EP.DELETE, { OldKeyID: orderId });
  }

  function deleteDetail(userAutoId) {
    return Http.post(EP.DELETE_DETAIL, { UserAutoID: userAutoId });
  }

  function insertDetail(payload) {
    // Notes=0 workaround: SP bug — @Notes đang map vào cột DiemTichLuy (numeric), truyền 0 để SQL convert được
    return Http.post(EP.INSERT_DETAIL, Object.assign({ UserAutoID: '', SoLuongTang: 0, DiemSanPham: 0, Notes: 0 }, payload));
  }

  function updateDetail(payload) {
    // payload: { OldKeyID (UserAutoID cũ), UserAutoID, ItemID, Quantity, SoLuongTang, UnitPrice, Amount, DiscountPercent, DiscountAmount, DiemSanPham, Notes }
    return Http.post(EP.UPDATE_DETAIL, Object.assign({ SoLuongTang: 0, DiemSanPham: 0, Notes: '' }, payload));
  }

  return { getList, getDetail, create, update, deleteOrder, deleteDetail, insertDetail, updateDetail, getThongKeSoLuong };
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
