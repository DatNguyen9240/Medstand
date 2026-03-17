// -- Helpers ------------------------------------------------------------------
function genUUID() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
    var r = Math.random() * 16 | 0;
    return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16);
  });
}
function todayStr() {
  var d = new Date();
  return d.getFullYear() + '-' + ('0' + (d.getMonth() + 1)).slice(-2) + '-' + ('0' + d.getDate()).slice(-2);
}

var user = JSON.parse(localStorage.getItem('auth_user') || '{}');
var rowCounter = 0;
var _productsCache = null;

// -- Build form using FormSelect component -----------------------------------
var orderForm = new FormSelect({ container: '#orderFormContainer' });

orderForm
  .addInput({ id: 'orderDate', label: 'Ngày CT', type: 'date', required: true, value: todayStr() })
  .addList({
    id: 'branch', label: 'Chi nhánh', required: true, placeholder: 'Chọn chi nhánh',
    loadFn: function (done) {
      Http.get(API_CONFIG.ENDPOINTS.FILTER.BRANCHES, { q: JSON.stringify({ BranchID: '', SearchText: '' }) })
        .then(function (res) {
          var records = (res.data || res).records || res.data || res || [];
          var opts = records.map(function (r) { return { value: r.BranchID || '', label: r.BranchName || r.BranchID || '' }; });
          done(opts);
          // Auto-fill từ localStorage nếu có
          if (user.BranchID && !orderForm.getValue('branch')) {
            var match = opts.find(function (o) { return o.value === user.BranchID; });
            if (match) orderForm.setListValue('branch', match.value, match.label);
          }
        }).catch(function () { done([]); });
    }
  })
  .addList({
    id: 'customer', label: 'Khách hàng', required: true, placeholder: 'Chọn khách hàng',
    loadFn: function (done) {
      Http.get(API_CONFIG.ENDPOINTS.FILTER.CUSTOMERS, {
        q: JSON.stringify({
          User: user.UserName || '', ManagerID: '', EmployeeID: '',
          ObjectID: '', LoaiKhachHang: '', KenhBan: '', SearchText: '',
          SYSManagerID: user.ManagerID || '', SYSEmployeeID: user.EmployeeID || ''
        })
      }).then(function (res) {
        var records = (res.data || res).records || res.data || res || [];
        done(records.map(function (r) { return { value: r.ObjectID || '', label: r.DisplayName || r.ObjectName || '' }; }));
      }).catch(function () { done([]); });
    }
  })
  .addList({
    id: 'ward', label: 'Phường/Xã', required: true, placeholder: 'Chọn phường/xã',
    loadFn: function (done) {
      Http.get(API_CONFIG.ENDPOINTS.FILTER.WARDS, {
        q: JSON.stringify({ User: user.UserName || '', LocationID: '', QuanHuyen: '', XaPhuong: '', SearchText: '' })
      }).then(function (res) {
        var records = (res.data || res).records || res.data || res || [];
        done(records.map(function (r) { return { value: r.XaPhuong || '', label: r.XaPhuong || '' }; }));
      }).catch(function () { done([]); });
    }
  })
  .addInput({ id: 'address', label: 'Địa chỉ', placeholder: 'Nhập địa chỉ' })
  .addList({
    id: 'route', label: 'Tuyến thứ', required: true, placeholder: 'Chọn tuyến',
    loadFn: function (done) {
      Http.get(API_CONFIG.ENDPOINTS.FILTER.ROUTE_DAYS, { q: JSON.stringify({ ThuDiTuyen: '' }) })
        .then(function (res) {
          var records = (res.data || res).records || res.data || res || [];
          done(records.map(function (r) { return { value: r.ThuTrongTuan || '', label: r.ThuTrongTuan || '' }; }));
        }).catch(function () { done([]); });
    }
  })
  .addInput({ id: 'phone', label: 'Số điện thoại', type: 'tel', required: true, placeholder: 'Nhập số điện thoại' })
  .addInput({ id: 'memo', label: 'Ghi chú', placeholder: 'Ghi chú thêm', full: true })
  .addInput({ id: 'notes', label: 'Diễn giải', type: 'textarea', placeholder: 'Nhập diễn giải đơn hàng', full: true });

// Auto-fill và lock Chi nhánh nếu có trong localStorage
if (user.BranchID) {
  Http.get(API_CONFIG.ENDPOINTS.FILTER.BRANCHES, { q: JSON.stringify({ BranchID: '', SearchText: '' }) })
    .then(function (res) {
      var records = (res.data || res).records || res.data || res || [];
      var match = records.find(function (r) { return (r.BranchID || '') === user.BranchID; });
      if (match) {
        orderForm.setListValue('branch', match.BranchID, match.BranchName || match.BranchID);
        // Lock: không cho click
        $('#fs-branch').off('click').css({ opacity: '0.7', pointerEvents: 'none' });
      }
    });
}

// -- Load sản phẩm (cache) ----------------------------------------------------
function loadProducts(cb) {
  if (_productsCache) return cb(_productsCache);
  Http.get(API_CONFIG.ENDPOINTS.FILTER.PRODUCTS, {
    q: JSON.stringify({ User: user.UserName || '', ItemID: '', SearchText: '' })
  }).then(function (res) {
    _productsCache = (res.data || res).records || res.data || res || [];
    cb(_productsCache);
  }).catch(function () { cb([]); });
}

function buildProductOptions(items) {
  return items.map(function (item) {
    return { value: item.ItemID || '', label: (item.ItemName || item.ItemID || '') + ' - ' + Format.currency(item.UnitPrice || item.Price || 0), price: item.UnitPrice || item.Price || 0, name: item.ItemName || item.ItemID || '' };
  });
}

function openProductPicker(rowId) {
  var $picker = $('#productPicker_' + rowId);
  var origPlaceholder = $picker.attr('placeholder');
  $picker.attr('placeholder', 'Đang tải...').prop('disabled', true).css('opacity', '.6');
  loadProducts(function (items) {
    $picker.attr('placeholder', origPlaceholder).prop('disabled', false).css('opacity', '');

    var options = buildProductOptions(items);
    var currentVal = $picker.attr('data-value') || '';
    var html = '<div class="filter-modal-header">' +
      '<button type="button" class="filter-modal-close" aria-label="Đóng" id="pp-close">&times;</button>' +
      '<h3>Chọn sản phẩm</h3></div>' +
      '<div style="padding:12px"><input type="search" class="fs-input" id="pp-search" placeholder="Tìm kiếm sản phẩm"></div>' +
      '<ul class="select-modal-list" id="pp-list" style="max-height:50vh;overflow-y:auto;padding:0 12px">' +
      options.map(function (o) {
        var sel = currentVal === o.value ? ' class="selected"' : '';
        return '<li data-value="' + o.value + '" data-price="' + o.price + '" data-name="' + o.name + '"' + sel + '>' + o.label + '</li>';
      }).join('') + '</ul>';
    var $overlay = $('<div style="position:fixed;inset:0;background:rgba(0,0,0,.45);z-index:300;display:flex;align-items:flex-end"></div>');
    var $sheet = $('<div style="width:100%;max-height:80vh;background:var(--color-surface,#fff);border-radius:var(--radius-lg) var(--radius-lg) 0 0;display:flex;flex-direction:column;overflow-y:auto"></div>').html(html);
    $overlay.append($sheet).appendTo('body');
    $overlay.find('#pp-close').on('click', function () { $overlay.remove(); });
    $overlay.on('click', function (e) { if (e.target === $overlay[0]) $overlay.remove(); });
    $overlay.find('#pp-search').on('input', function () {
      var kw = $(this).val().toLowerCase();
      $overlay.find('#pp-list li').each(function () { $(this).toggle($(this).text().toLowerCase().indexOf(kw) !== -1); });
    });
    $overlay.find('#pp-list li').on('click', function () {
      var val = $(this).attr('data-value');
      var price = $(this).attr('data-price');
      var name = $(this).attr('data-name');
      $picker.attr('data-value', val).attr('data-price', price).attr('data-name', name);
      $picker.val(name);
      $picker.addClass('has-value');
      $overlay.remove();
      calculateRowTotal(rowId);
    });
  });
}

function calculateRowTotal(rowId) {
  var $picker = $('#productPicker_' + rowId);
  var itemId = $picker.attr('data-value') || '';
  if (!itemId) return null;
  var price = parseFloat($picker.attr('data-price') || 0);
  var name = $picker.attr('data-name') || '';
  var qty = parseInt($('#qty_' + rowId).val() || 0);
  var discount = parseFloat($('#discount_' + rowId).val() || 0);
  $('#price_' + rowId).val(price);
  var subtotal = price * qty;
  var total = subtotal - subtotal * (discount / 100);
  $('#total_' + rowId).val(Format.currency(total));
  updateLiveTotal();
  return { itemId: itemId, name: name, price: price, qty: qty, discount: discount, finalTotal: total };
}

function updateLiveTotal() {
  var total = 0;
  $('#dynamicProductRowsContainer .add-product-row').each(function () {
    var rowId = $(this).attr('id').split('_')[1];
    var $picker = $('#productPicker_' + rowId);
    var price = parseFloat($picker.attr('data-price') || 0);
    var qty = parseInt($('#qty_' + rowId).val() || 0);
    var discount = parseFloat($('#discount_' + rowId).val() || 0);
    var subtotal = price * qty;
    total += subtotal - subtotal * (discount / 100);
  });
  $('#totalAmountText').text(Format.currency(total));
}

function collectProducts() {
  var items = [];
  $('#dynamicProductRowsContainer .add-product-row').each(function () {
    var rowId = $(this).attr('id').split('_')[1];
    var data = calculateRowTotal(rowId);
    if (data && data.itemId && data.qty > 0) items.push(data);
  });
  return items;
}

function appendProductRow() {
  rowCounter++;
  var rowId = rowCounter;
  var rowHtml = '<div class="responsive-grid add-product-row" id="row_' + rowId + '" style="margin-bottom:8px;padding-bottom:16px;border-bottom:1px solid var(--color-border)">' +
    '<div class="form-group"><label class="form-label">Sản phẩm</label>' +
    '<input type="text" class="form-control" id="productPicker_' + rowId + '" data-value="" data-price="0" data-name="" readonly placeholder="Chọn sản phẩm" onclick="openProductPicker(' + rowId + ')" style="cursor:pointer"></div>' +
    '<div class="form-group"><label class="form-label">SL</label>' +
    '<input type="number" class="form-control" id="qty_' + rowId + '" value="1" min="1" oninput="calculateRowTotal(' + rowId + ')"></div>' +
    '<div class="form-group"><label class="form-label">Đơn giá</label>' +
    '<input type="number" class="form-control" id="price_' + rowId + '" readonly></div>' +
    '<div class="form-group"><label class="form-label">CK(%)</label>' +
    '<input type="number" class="form-control" id="discount_' + rowId + '" value="0" min="0" max="100" oninput="calculateRowTotal(' + rowId + ')"></div>' +
    '<div class="form-group"><label class="form-label">Thành tiền</label>' +
    '<input type="text" class="form-control" id="total_' + rowId + '" readonly style="font-weight:600;color:var(--color-primary)"></div>' +
    '<div class="form-group" style="display:flex;align-items:flex-end;justify-content:center">' +
    '<button type="button" class="btn-remove-row" onclick="removeProductRow(' + rowId + ')">🗑</button></div>' +
    '</div>';
  $('#dynamicProductRowsContainer').prepend(rowHtml);
}

function removeProductRow(rowId) {
  $('#row_' + rowId).remove();
  updateLiveTotal();
}

// -- Validate & build payload ----------------------------------------------
function validateAndBuildPayload() {
  var v = orderForm.getValues();
  var productRows = collectProducts();

  if (!v.orderDate) { Alert.warning('Vui lòng chọn ngày chứng từ.'); return null; }
  if (!v.branch) { Alert.warning('Vui lòng chọn chi nhánh.'); return null; }
  if (!v.customer) { Alert.warning('Vui lòng chọn khách hàng.'); return null; }
  if (!v.ward) { Alert.warning('Vui lòng chọn phường/xã.'); return null; }
  if (!v.route) { Alert.warning('Vui lòng chọn tuyến thứ.'); return null; }
  if (!v.phone) { Alert.warning('Vui lòng nhập số điện thoại.'); return null; }
  if (productRows.length === 0) { Alert.warning('Vui lòng thêm ít nhất 1 sản phẩm.'); return null; }

  var itemList = productRows.map(function (p) {
    var amount = p.price * p.qty;
    var discAmt = Math.round(amount * (p.discount / 100));
    return {
      ItemID: p.itemId, Quantity: p.qty, SoLuongTang: 0,
      UnitPrice: p.price, Amount: amount,
      DiscountPercent: p.discount, DiscountAmount: discAmt,
      DiemSanPham: 0, Notes: ''
    };
  });

  var docId = genUUID();
  return {
    docId: docId,
    payload: {
      User: user.UserName || '',
      DocumentID: docId,
      DocumentDate: v.orderDate,
      BranchID: v.branch,
      ManagerID: '',
      EmployeeID: '',
      ObjectID: v.customer,
      Memo: v.memo || '',
      Notes: v.notes || '',
      ChanhXe: v.phone || '',
      DeliverDate: v.orderDate,
      XaPhuong: v.ward || '',
      ThuDiTuyen: v.route || '',
      StatusID: 0,
      ItemList: JSON.stringify(itemList),
      SYSManagerID: user.ManagerID || '',
      SYSEmployeeID: user.EmployeeID || ''
    }
  };
}

function resetForm() {
  $('#dynamicProductRowsContainer').html('');
  orderForm.reset();
  orderForm.setValue('orderDate', todayStr());
  appendProductRow();
  updateLiveTotal();
}

// -- Submit Order -------------------------------------------------------------
$('#btnSubmitOrder').on('click', function () {
  var data = validateAndBuildPayload();
  if (!data) return;

  var $btn = $(this);
  $btn.prop('disabled', true).text('Đang xử lý...');

  Http.post(API_CONFIG.ENDPOINTS.ORDERS.CREATE, data.payload).then(function (res) {
    var d = res.data || res;
    var record = Array.isArray(d) ? d[0] : (d.records ? d.records[0] : d);
    var msg = record && record.Msg ? record.Msg : '';
    var msgType = record && record.MsgType !== undefined ? record.MsgType : 5;
    if (msgType == 1) { Alert.error(msg || 'Có lỗi xảy ra.'); return; }
    Alert.success(msg || 'Tạo đơn hàng thành công!');
    resetForm();
  }).catch(function (err) {
    Alert.error(err.message || 'Có lỗi xảy ra.');
  }).finally(function () {
    $btn.prop('disabled', false).text('TẠO ĐƠN HÀNG');
  });
});

// -- Save Draft ---------------------------------------------------------------
$('#btnDraftOrder').on('click', function () {
  var data = validateAndBuildPayload();
  if (!data) return;

  var $btn = $(this);
  $btn.prop('disabled', true).text('Đang xử lý...');

  // Bước 1: Tạo đơn hàng
  Http.post(API_CONFIG.ENDPOINTS.ORDERS.CREATE, data.payload).then(function (res) {
    var d = res.data || res;
    var record = Array.isArray(d) ? d[0] : (d.records ? d.records[0] : d);
    var msg = record && record.Msg ? record.Msg : '';
    var msgType = record && record.MsgType !== undefined ? record.MsgType : 5;
    if (msgType == 1) { Alert.error(msg || 'Có lỗi xảy ra.'); return; }

    // Bước 2: Chuyển thành đơn nháp (StatusID = -1)
    return Http.post(API_CONFIG.ENDPOINTS.ORDERS.SAVE_DRAFT, {
      DocumentID: data.docId
    });
  }).then(function (res) {
    if (!res) return; // bỏ lỗi ở bước 1
    Alert.success('Lưu đơn nháp thành công!');
    resetForm();
  }).catch(function (err) {
    Alert.error(err.message || 'Có lỗi xảy ra.');
  }).finally(function () {
    $btn.prop('disabled', false).text('LƯU NHÁP');
  });
});

// Initialize with one empty row
appendProductRow();
