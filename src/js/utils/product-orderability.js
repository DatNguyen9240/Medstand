(function (root) {
  'use strict';

  /*
    PRODUCT-DIAG-001 — đọc hợp đồng chẩn đoán của API_HangHoaList_AI.

    MỘT nơi duy nhất ánh xạ mã lỗi sang câu tiếng Việt, dùng chung cho trang tạo đơn, sửa đơn
    và panel lập đơn trong chatbot. Trước đây ba chỗ đó tự viết cùng một câu gộp; sao chép
    thành ba bảng message là con đường chắc chắn dẫn tới ba cách nói khác nhau cho cùng một lỗi.

    Ba nguyên tắc:
      1. Quyết định dựa trên `Code`, KHÔNG bao giờ dựa trên chuỗi tiếng Việt trong `Msg`.
         Đổi câu chữ hiển thị không được phép làm đổi hành vi.
      2. Mã lạ hoặc version hợp đồng lạ => coi là KHÔNG bán được (fail-closed). Không suy đoán,
         không im lặng cho qua như thể sản phẩm hợp lệ.
      3. Response cũ (chưa có `Code`) vẫn phải chạy: rơi về câu chung như trước.
  */

  var CONTRACT_VERSION = 'PRODUCT_ORDERABILITY_V1';

  /* Câu hiển thị cho người dùng cuối. Cố tình KHÔNG nhắc tên kho, mã kho hay số lượng tồn:
     người dùng không được biết gì về phạm vi kho mà họ không được cấp. */
  var MESSAGES = {
    INVALID_USER: 'Tài khoản không tồn tại hoặc đã bị khóa.',
    CUSTOMER_OUT_OF_SCOPE: 'Khách hàng này không thuộc phạm vi được cấp của bạn.',
    ITEM_NOT_FOUND: 'Không tìm thấy sản phẩm trong danh mục.',
    ITEM_DISABLED_AT_BRANCH: 'Sản phẩm đang ngừng bán tại chi nhánh của bạn.',
    ITEM_GROUP_NOT_SELLABLE: 'Nhóm sản phẩm này chưa được phép bán.',
    SELLABLE_RULE_UNAVAILABLE: 'Cấu hình nhóm hàng được phép bán chưa sẵn sàng. Vui lòng báo quản trị hệ thống.',
    WAREHOUSE_SCOPE_REQUIRED: 'Tài khoản chưa được phân quyền kho. Vui lòng liên hệ quản trị.',
    STOCK_BLOCKED_BY_WAREHOUSE_SCOPE: 'Chưa đọc được tồn vì tài khoản chưa có kho nào được cấp quyền.',
    STOCK_NO_ROW: 'Chưa có dữ liệu tồn trong các kho được cấp quyền.',
    STOCK_ZERO_AVAILABLE: 'Sản phẩm đã hết tồn khả dụng trong phạm vi kho được cấp quyền.',
    PRICE_NOT_FOUND: 'Chưa thiết lập bảng giá áp dụng cho khách hàng này.',
    PRICE_EXPIRED_OR_DISABLED: 'Bảng giá của sản phẩm chưa tới hiệu lực, đã hết hiệu lực hoặc đang bị khóa.',
    PRODUCT_DIAGNOSTIC_INCONSISTENT: 'Không xác định được nguyên nhân. Vui lòng tải lại danh sách hàng và báo bộ phận kỹ thuật.'
  };

  /* Dùng khi server trả mã hoặc version mà bản frontend này chưa biết. Nói thật là không rõ
     nguyên nhân, thay vì đoán bừa một câu nghe hợp lý. */
  var UNKNOWN_MESSAGE = 'Sản phẩm hiện không lập đơn được. Vui lòng tải lại danh sách hàng hoặc báo bộ phận kỹ thuật.';

  /* Response cũ chưa có hợp đồng chẩn đoán. */
  var LEGACY_MESSAGE = 'Sản phẩm không còn bán được hoặc không có giá/tồn hợp lệ.';

  function rowsOf(res) {
    var data = res && res.data !== undefined ? res.data : res;
    if (!data) return [];
    if (Array.isArray(data)) return data;
    if (Array.isArray(data.records)) return data.records;
    return [];
  }

  function parseReasonCodes(value) {
    if (Array.isArray(value)) return value.slice();
    if (typeof value !== 'string' || !value) return [];
    try {
      var parsed = JSON.parse(value);
      if (!Array.isArray(parsed)) return [];
      /* Chấp nhận cả ["A","B"] lẫn [{"Code":"A"}] để không vỡ nếu server đổi cách serialize. */
      return parsed.map(function (entry) {
        return typeof entry === 'string' ? entry : (entry && entry.Code) || '';
      }).filter(Boolean);
    } catch (error) {
      return [];
    }
  }

  function messageFor(code) {
    return Object.prototype.hasOwnProperty.call(MESSAGES, code) ? MESSAGES[code] : '';
  }

  /*
     API trung gian của ERP đưa Msg/MsgType/Code lên envelope { code, msg, records }
     và chỉ để các cột còn lại trong records. Vì vậy response thật qua gateway không còn
     head.Code dù procedure SQL đã trả cột đó. ReasonCodesJson giữ nguyên thứ tự ưu tiên,
     nên phần tử đầu chính là mã chính của hợp đồng.
  */
  function isDiagnosticEnvelope(res) {
    var rows = rowsOf(res);
    var head = rows.length ? rows[0] : {};
    var isNotOrderable = head.IsOrderable === false || Number(head.IsOrderable) === 0;
    return String(head.DiagnosticContractVersion || '') === CONTRACT_VERSION
      && isNotOrderable
      && parseReasonCodes(head.ReasonCodesJson).length > 0;
  }

  /**
   * Đọc response của API_HangHoaList_AI cho MỘT sản phẩm cụ thể.
   *
   * @param {*} res      response thô (đã hoặc chưa bóc .data)
   * @param {string} itemId mã sản phẩm đã yêu cầu
   * @returns {{orderable: boolean, detail: object|null, code: string, reasonCodes: string[],
   *            message: string, contractVersion: string, recognized: boolean}}
   */
  function resolve(res, itemId) {
    var rows = rowsOf(res);
    var wanted = String(itemId || '').toLowerCase();

    var detail = null;
    for (var i = 0; i < rows.length; i++) {
      if (String(rows[i].ItemID || '').toLowerCase() === wanted) { detail = rows[i]; break; }
    }
    if (detail) {
      return {
        orderable: true, detail: detail, code: '', reasonCodes: [],
        message: '', contractVersion: '', recognized: true
      };
    }

    var head = rows.length ? rows[0] : {};
    var code = String(head.Code || '');
    var contractVersion = String(head.DiagnosticContractVersion || '');
    var reasonCodes = parseReasonCodes(head.ReasonCodesJson);

    /* Response trực tiếp từ SQL có Code; response thật qua gateway thì Code đã được
       chuyển lên envelope số. Lấy mã đầu tiên từ mảng lý do có thứ tự của contract. */
    if (!code && contractVersion === CONTRACT_VERSION && reasonCodes.length) {
      code = String(reasonCodes[0] || '');
    }

    /* Không có mã => bản server cũ. Giữ câu chung như trước, vẫn là không bán được. */
    if (!code) {
      return {
        orderable: false, detail: null, code: '', reasonCodes: reasonCodes,
        message: LEGACY_MESSAGE, contractVersion: contractVersion, recognized: false
      };
    }

    /* Version lạ: có thể server đã đổi ý nghĩa mã. Không diễn giải, chỉ fail-closed. */
    var known = contractVersion === CONTRACT_VERSION && Boolean(messageFor(code));

    return {
      orderable: false,
      detail: null,
      code: code,
      reasonCodes: reasonCodes.length ? reasonCodes : [code],
      message: known ? messageFor(code) : UNKNOWN_MESSAGE,
      contractVersion: contractVersion,
      recognized: known
    };
  }

  /** Ném Error đã gắn sẵn code/reasonCodes để chỗ gọi hiển thị và log đối soát. */
  function toError(result) {
    var error = new Error(result.message || UNKNOWN_MESSAGE);
    error.productDiagnosticCode = result.code || '';
    error.productDiagnosticReasons = result.reasonCodes || [];
    error.productDiagnosticVersion = result.contractVersion || '';
    return error;
  }

  var api = {
    CONTRACT_VERSION: CONTRACT_VERSION,
    MESSAGES: MESSAGES,
    UNKNOWN_MESSAGE: UNKNOWN_MESSAGE,
    LEGACY_MESSAGE: LEGACY_MESSAGE,
    rowsOf: rowsOf,
    parseReasonCodes: parseReasonCodes,
    messageFor: messageFor,
    isDiagnosticEnvelope: isDiagnosticEnvelope,
    resolve: resolve,
    toError: toError
  };

  root.MedstandProductOrderability = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
