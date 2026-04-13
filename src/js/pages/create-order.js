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
var _customersCache = [];    // Cache danh sách khách hàng đầy đủ
var _selectedLocationID = ''; // Lưu tỉnh thành của khách hàng đang chọn

// -- Build form using FormSelect component -----------------------------------
var orderForm = new FormSelect({ container: '#orderFormContainer' });

orderForm
  .addInput({ id: 'orderDate', label: 'Ngày CT', type: 'date', required: true, value: todayStr() })
  .addList({
    id: 'branch', label: 'Chi nhánh', required: true, placeholder: 'Chọn chi nhánh',
    locked: !!user.BranchID,
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
        _customersCache = records; // Lưu vào cache để auto-fill sau này
        done(records.map(function (r) { return { value: r.ObjectID || '', label: r.DisplayName || r.ObjectName || '' }; }));
      }).catch(function () { done([]); });
    }
  })
  .addList({
    id: 'ward', label: 'Phường/Xã', required: true, placeholder: 'Chọn phường/xã',
    loadFn: function (done) {
      Http.get(API_CONFIG.ENDPOINTS.FILTER.WARDS, {
        q: JSON.stringify({ User: user.UserName || '', LocationID: _selectedLocationID, SearchText: '' })
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

// -- Sự kiện khi chọn khách hàng -> Auto-fill ---------------------------------
orderForm.onListChange('customer', function(val) {
  var cust = _customersCache.find(function(r) { return r.ObjectID === val; });
  if (cust) {
    _selectedLocationID = cust.LocationID || '';
    orderForm.setValue('phone', cust.Phone || '');
    orderForm.setValue('address', cust.Address || '');
    
    // Set Phường/Xã nếu có
    if (cust.XaPhuong) {
      orderForm.setListValue('ward', cust.XaPhuong, cust.XaPhuong);
    } else {
      orderForm.setListValue('ward', '', '');
    }
    
    // Xóa cache trường Phường/Xã để khi nhấn chọn nó sẽ tải lại theo Tỉnh mới
    orderForm.clearCache('ward');
  }
});

// Auto-fill và lock Chi nhánh nếu có trong localStorage
if (user.BranchID) {
  Http.get(API_CONFIG.ENDPOINTS.FILTER.BRANCHES, { q: JSON.stringify({ BranchID: '', SearchText: '' }) })
    .then(function (res) {
      setTimeout(function() {
        var records = (res.data || res).records || res.data || res || [];
        var match = records.find(function (r) { return (r.BranchID || '') == user.BranchID; });
        if (match) {
          orderForm.setListValue('branch', match.BranchID, match.BranchName || match.BranchID);
          orderForm.setLocked('branch', true);
        }
      }, 100);
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
  var $pickerContainer = $('#productPickerContainer_' + rowId);
  var $pickerText = $pickerContainer.find('.filter-value-text');
  var origText = $pickerText.text();

  $pickerText.text('Đang tải...');
  loadProducts(function (items) {
    $pickerText.text(origText);

    var options = buildProductOptions(items);
    var currentVal = $pickerContainer.attr('data-value') || '';
    var html = '<div class="filter-modal-header">' +
      '<button type="button" class="filter-modal-close" aria-label="Đóng" id="pp-close">&times;</button>' +
      '<h3>Chọn sản phẩm</h3></div>' +
      '<div style="padding:12px">' +
      Input.renderSearch({ id: 'pp-search', placeholder: 'Tìm kiếm sản phẩm' }) +
      '</div>' +
      '<ul class="select-modal-list" id="pp-list" style="max-height:50vh;overflow-y:auto;padding:0 12px">' +
      options.map(function (o) {
        var sel = currentVal === o.value ? ' class="selected"' : '';
        return '<li data-value="' + o.value + '" data-price="' + o.price + '" data-name="' + o.name + '"' + sel + '>' + o.label + '</li>';
      }).join('') + '</ul>';

    var $overlay = $('<div class="picker-overlay"></div>');
    var $sheet = $('<div class="picker-sheet"></div>').html(html);
    $overlay.append($sheet).appendTo('body');
    
    // Trigger animation
    setTimeout(function() {
      $overlay.addClass('active');
      $sheet.addClass('active');
    }, 10);
    $overlay.find('#pp-close').on('click', function () { $overlay.remove(); });
    $overlay.on('click', function (e) { if (e.target === $overlay[0]) $overlay.remove(); });
    $overlay.find('#pp-search').on('input', function () {
      var kw = Format.removeAccents($(this).val());
      $overlay.find('#pp-list li').each(function () {
        var text = Format.removeAccents($(this).text());
        $(this).toggle(text.indexOf(kw) !== -1);
      });
    });
    $overlay.find('#pp-list li').on('click', function () {
      var val = $(this).attr('data-value');
      var price = $(this).attr('data-price');
      var name = $(this).attr('data-name');
      $pickerContainer.attr('data-value', val).attr('data-price', price).attr('data-name', name);
      $pickerText.text(name);
      $pickerContainer.addClass('has-value');
      $overlay.remove();
      calculateRowTotal(rowId);
    });
  });
}

function calculateRowTotal(rowId) {
  var $pickerContainer = $('#productPickerContainer_' + rowId);
  var itemId = $pickerContainer.attr('data-value') || '';
  if (!itemId) return null;
  var price = parseFloat($pickerContainer.attr('data-price') || 0);
  var name = $pickerContainer.attr('data-name') || '';
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
  $('#dynamicProductRowsContainer .add-product-row:not(.product-header-row)').each(function () {
    var idAttr = $(this).attr('id');
    if (!idAttr) return; // Bỏ qua header hoặc hàng lỗi
    var rowId = idAttr.split('_')[1];
    var $pickerContainer = $('#productPickerContainer_' + rowId);
    var price = parseFloat($pickerContainer.attr('data-price') || 0);
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

  var productSelect = Input.renderSelect({ key: 'p_' + rowId, label: 'Sản phẩm', value: 'Chọn sản phẩm' });
  var qtyField = Input.renderField({ id: 'qty_' + rowId, label: 'SL', type: 'number', value: '1' });
  var priceField = Input.renderField({ id: 'price_' + rowId, label: 'Giá', type: 'number', readonly: true });
  var discountField = Input.renderField({ id: 'discount_' + rowId, label: 'CK', type: 'number', value: '0' });
  var totalField = Input.renderField({ id: 'total_' + rowId, label: 'Tiền', readonly: true, className: 'amount-field' });

  var rowHtml = '<div class="responsive-grid add-product-row" id="row_' + rowId + '" style="margin-bottom:4px;padding-bottom:8px;border-bottom:1px solid var(--color-border)">' +
    '<div id="productPickerContainer_' + rowId + '" class="form-group" style="cursor:pointer" data-value="" data-price="0" data-name="">' + productSelect + '</div>' +
    qtyField +
    priceField +
    discountField +
    totalField +
    '<button type="button" class="btn-remove-row" onclick="removeProductRow(' + rowId + ')">🗑️</button>' +
    '</div>';

  $('#dynamicProductRowsContainer').prepend(rowHtml);

  // Bind click for product picker
  $('#productPickerContainer_' + rowId).on('click', function () { openProductPicker(rowId); });
  // Bind input for calculations
  $('#qty_' + rowId + ', #discount_' + rowId).on('input', function () { calculateRowTotal(rowId); });
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
