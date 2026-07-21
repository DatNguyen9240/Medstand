// -- Helpers ------------------------------------------------------------------
function genUUID() {
  return 'AUTO_GEN';
}
function todayStr() {
  var d = new Date();
  return d.getFullYear() + '-' + ('0' + (d.getMonth() + 1)).slice(-2) + '-' + ('0' + d.getDate()).slice(-2);
}

// -- Promotion Helpers --------------------------------------------------------
function parsePromotions(productName) {
  var promos = [];
  var regex = /(\d+)\s*\+\s*(\d+)/g;
  var match;
  while ((match = regex.exec(productName)) !== null) {
    promos.push({
      buy: parseInt(match[1], 10),
      get: parseInt(match[2], 10)
    });
  }
  promos.sort(function (a, b) { return b.buy - a.buy; });
  return promos;
}

// Greedy promotion allocator
function calculateFreeProducts(qty, promos) {
  var freeQty = 0;
  var tempQty = qty;
  for (var i = 0; i < promos.length; i++) {
    var promo = promos[i];
    if (promo.buy > 0) {
      var times = Math.floor(tempQty / promo.buy);
      freeQty += times * promo.get;
      tempQty = tempQty % promo.buy;
    }
  }
  return freeQty;
}

function autoApplyPromotion(parentRowId, itemId, name, freeQty) {
  var $existingPromoRow = $('#dynamicProductRowsContainer .add-product-row[data-parent-row-id="' + parentRowId + '"]');
  
  if (freeQty <= 0) {
    if ($existingPromoRow.length) {
      var existingRowId = $existingPromoRow.attr('id').split('_')[1];
      removeProductRow(existingRowId);
    }
    return;
  }
  
  var cleanName = name.replace(/\s*\(Mua\s+[\s\S]*$/, '');
  
  if ($existingPromoRow.length) {
    var existingRowId = $existingPromoRow.attr('id').split('_')[1];
    var $qtyField = $('#qty_' + existingRowId);
    if (parseInt($qtyField.val(), 10) !== freeQty) {
      $qtyField.val(freeQty);
      calculateRowTotal(existingRowId);
    }
  } else {
    appendProductRow({
      ItemID: itemId,
      ItemName: cleanName + ' (KM)',
      UnitPrice: 0,
      Quantity: freeQty,
      DiscountPercent: 0,
      parentRowId: parentRowId
    });
  }
}

var user = JSON.parse(localStorage.getItem('auth_user') || '{}');
var rowCounter = 0;
var _productsCache = null;
var _branchLoadError = false;
var _createOrderActive = true;
var _orderSubmitIdempotencyKey = '';
var _draftSubmitIdempotencyKey = '';

function newIdempotencyKey(prefix) {
  var randomPart = (window.crypto && window.crypto.randomUUID)
    ? window.crypto.randomUUID()
    : Date.now().toString(36) + '-' + Math.random().toString(36).slice(2);
  return prefix + '-' + randomPart;
}

function destroyProductPicker() {
  $('.picker-overlay, .picker-sheet').off().remove();
  $('body').css('overflow', '');
}

function mapCustomerOptions(records) {
  _customersCache = _customersCache.concat(records || []).filter(function (item, index, list) {
    return list.findIndex(function (x) { return x.ObjectID === item.ObjectID; }) === index;
  });
  return (records || []).map(function (r) {
    return { value: r.ObjectID || '', label: r.DisplayName || ((r.ObjectID || '') + ' - ' + (r.ObjectName || '')) };
  });
}

function loadCustomers(searchText, done) {
  Http.get(API_CONFIG.ENDPOINTS.FILTER.CUSTOMERS, {
    q: JSON.stringify({ User: user.UserName || '', ManagerID: '', EmployeeID: '', ObjectID: '', LoaiKhachHang: '', KenhBan: '', SearchText: searchText || '', SYSManagerID: user.ManagerID || '', SYSEmployeeID: user.EmployeeID || '' })
  }).then(function (res) {
    var records = (res.data || res).records || res.data || res || [];
    done(mapCustomerOptions(records));
  }).catch(function () {
    Alert.error('Không thể tải danh sách khách hàng. Vui lòng thử lại.');
    done([]);
  });
}
var _customersCache = [];    // Cache danh sách khách hàng đầy đủ
var _selectedLocationID = ''; // Lưu tỉnh thành của khách hàng đang chọn

// -- Build form using FormSelect component -----------------------------------
var orderForm = new FormSelect({ container: '#orderFormContainer' });

orderForm
  .addInput({ id: 'orderDate', label: 'Ngày CT', type: 'date', required: true, value: todayStr() })
  .addList({
    id: 'branch', label: 'Chi nhánh', required: true, placeholder: 'Chọn chi nhánh',
    locked: false,
    loadFn: function (done) {
      Http.get(API_CONFIG.ENDPOINTS.FILTER.BRANCHES, { q: JSON.stringify({ BranchID: '', SearchText: '' }) })
        .then(function (res) {
          var records = (res.data || res).records || res.data || res || [];
          var opts = records.map(function (r) { return { value: r.BranchID || '', label: r.BranchName || r.BranchID || '' }; });
          _branchLoadError = false;
          done(opts);
          // Auto-fill từ localStorage nếu có
          if (user.BranchID && !orderForm.getValue('branch')) {
            var match = opts.find(function (o) { return o.value === user.BranchID; });
            if (match) {
              orderForm.setListValue('branch', match.value, match.label);
              orderForm.setLocked('branch', true);
            } else {
              Alert.error('Chi nhánh được phân quyền không tồn tại trong danh sách. Vui lòng liên hệ quản trị viên.');
            }
          }
        }).catch(function () {
          _branchLoadError = true;
          orderForm.setLocked('branch', false);
          Alert.error('Không thể tải thông tin chi nhánh. Vui lòng thử lại hoặc liên hệ quản trị viên.');
        });
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
    },
    searchFn: function (keyword, done) { loadCustomers(keyword, done); }
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

// -- Tự động nhảy Tuyến thứ theo Ngày CT --------------------------------------
function updateRouteDay(dateStr, force) {
  if (!dateStr) return;
  var d = new Date(dateStr);
  var dayNames = ['Chủ nhật', 'Thứ 2', 'Thứ 3', 'Thứ 4', 'Thứ 5', 'Thứ 6', 'Thứ 7'];
  var routeDay = dayNames[d.getDay()];
  if (force || !orderForm.getValues().route) {
      orderForm.setListValue('route', routeDay, routeDay);
  }
}

// Gọi mặc định cho ngày hôm nay (chờ renderDOM)
setTimeout(function() { 
  if (!$('#fs-orderDate').val()) return;
  updateRouteDay($('#fs-orderDate').val(), false); 
}, 300);

// Bắt sự kiện người dùng đổi ngày
$(document).on('change', '#fs-orderDate', function() {
  updateRouteDay($(this).val(), true);
});

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
    return {
      value: item.ItemID || '',
      price: item.UnitPrice || item.Price || 0,
      name: item.ItemName || item.ItemID || '',
      unit: item.UnitName || item.Unit || item.UnitID || '',
      stock: item.QuantityinStock !== undefined ? item.QuantityinStock : (item.TonKho !== undefined ? item.TonKho : '')
    };
  });
}

function openProductPicker(rowId) {
  destroyProductPicker();
  var $pickerContainer = $('#productPickerContainer_' + rowId);
  var $pickerText = $pickerContainer.find('.filter-value-text');
  var origText = $pickerText.text();

  $pickerText.text('Đang tải...');
  loadProducts(function (items) {
    if (!_createOrderActive || document.body.getAttribute('data-page') !== 'create-order') return;
    $pickerText.text(origText);

    var options = buildProductOptions(items);
    var currentVal = $pickerContainer.attr('data-value') || '';
    var html = '<div class="filter-modal-header">' +
      '<button type="button" class="filter-modal-close" aria-label="Đóng" id="pp-close">&times;</button>' +
      '<h3>Chọn sản phẩm</h3></div>' +
      '<div style="padding:12px">' +
      Input.renderSearch({ id: 'pp-search', placeholder: 'Tìm kiếm sản phẩm' }) +
      '</div>' +
      '<ul class="select-modal-list product-picker-list" id="pp-list" style="max-height:50vh;overflow-y:auto;padding:0 12px">' +
      options.map(function (o, optionIndex) {
        var sel = currentVal === o.value ? ' class="selected"' : '';
        return '<li data-value="' + o.value + '" data-price="' + o.price + '" data-name="' + o.name + '"' + sel + (optionIndex >= 30 ? ' style="display:none"' : '') + ' title="' + o.name + '">' +
          '<span class="product-option-main"><strong>' + o.value + '</strong><span class="product-option-name">' + o.name + '</span></span>' +
          '<span class="product-option-meta"><span>' + Format.currency(o.price) + '</span>' +
          (o.stock !== '' ? '<span>Tồn: ' + o.stock + '</span>' : '') +
          (o.unit ? '<span>ĐVT: ' + o.unit + '</span>' : '') + '</span></li>';
      }).join('') + '</ul>';

    var $overlay = $('<div class="picker-overlay"></div>');
    var $sheet = $('<div class="picker-sheet"></div>').html(html);
    $overlay.append($sheet).appendTo('body');
    $('body').css('overflow', 'hidden');
    
    // Trigger animation
    setTimeout(function() {
      $overlay.addClass('active');
      $sheet.addClass('active');
    }, 10);
    $overlay.find('#pp-close').on('click', destroyProductPicker);
    $overlay.on('click', function (e) { if (e.target === $overlay[0]) destroyProductPicker(); });
    $overlay.find('#pp-search').on('input', function () {
      var kw = Format.removeAccents($(this).val());
      var matches = options.filter(function (o) {
        return Format.removeAccents(o.value + ' ' + o.name).indexOf(kw) !== -1;
      }).slice(0, 30);
      var allowed = {};
      matches.forEach(function (o) { allowed[o.value] = true; });
      $overlay.find('#pp-list li').each(function () { $(this).toggle(!!allowed[$(this).attr('data-value')]); });
    });
    $overlay.find('#pp-list li').on('click', function () {
      var val = $(this).attr('data-value');
      var price = $(this).attr('data-price');
      var name = $(this).attr('data-name');
      $pickerContainer.attr('data-value', val).attr('data-price', price).attr('data-name', name);
      $pickerText.text(name);
      $pickerContainer.addClass('has-value');
      $('#price_' + rowId).val(price);

      // Auto extract discount from product name
      var autoDiscount = 0;
      var ckMatch = name.match(/(?:ck|chiết khấu|chiet khau)\s*(\d+(\.\d+)?)%/i);
      if (ckMatch) {
          autoDiscount = parseFloat(ckMatch[1]);
      }
      $('#discount_' + rowId).val(autoDiscount);

      destroyProductPicker();
      calculateRowTotal(rowId);
    });
  });
}

function calculateRowTotal(rowId) {
  var $pickerContainer = $('#productPickerContainer_' + rowId);
  var itemId = $pickerContainer.attr('data-value') || '';
  if (!itemId) return null;
  var price = parseFloat($('#price_' + rowId).val() || 0);
  var name = $pickerContainer.attr('data-name') || '';
  var qty = parseInt($('#qty_' + rowId).val() || 0);
  var discount = parseFloat($('#discount_' + rowId).val() || 0);
  var subtotal = price * qty;
  var total = subtotal - subtotal * (discount / 100);
  $('#total_' + rowId).val(Format.currency(total));

  // Dynamic promotional suggestions
  var $promoSuggest = $('#promoSuggest_' + rowId);
  if ($promoSuggest.length) {
    if (price > 0 && name && qty > 0) {
      var promos = parsePromotions(name);
      var freeQty = calculateFreeProducts(qty, promos);
      if (freeQty > 0) {
        autoApplyPromotion(rowId, itemId, name, freeQty);
        $promoSuggest.html('🎁 Đã tự động thêm ' + freeQty + ' sản phẩm khuyến mãi (Giá 0đ).').show();
      } else {
        autoApplyPromotion(rowId, itemId, name, 0);
        $promoSuggest.hide().html('');
      }
    } else if (price > 0) {
      autoApplyPromotion(rowId, itemId, name, 0);
      $promoSuggest.hide().html('');
    }
  }

  updateLiveTotal();
  return { itemId: itemId, name: name, price: price, qty: qty, discount: discount, finalTotal: total };
}

function updateLiveTotal() {
  var total = 0;
  $('#dynamicProductRowsContainer .add-product-row:not(.product-header-row)').each(function () {
    var idAttr = $(this).attr('id');
    if (!idAttr) return; // Bỏ qua header hoặc hàng lỗi
    var rowId = idAttr.split('_')[1];
    var price = parseFloat($('#price_' + rowId).val() || 0);
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

function appendProductRow(prefill) {
  rowCounter++;
  var rowId = rowCounter;
  var p = prefill || {};
  var isPromo = (p.UnitPrice !== undefined && p.UnitPrice !== null && parseFloat(p.UnitPrice) === 0);

  var productSelect = Input.renderSelect({ key: 'p_' + rowId, label: 'Sản phẩm', value: p.ItemName || 'Chọn sản phẩm', locked: isPromo });
  var qtyField = Input.renderField({ id: 'qty_' + rowId, label: 'SL', type: 'number', value: p.Quantity || '1', readonly: isPromo });
  var priceField = Input.renderField({ id: 'price_' + rowId, label: 'Giá', type: 'number', value: (p.UnitPrice !== undefined && p.UnitPrice !== null) ? p.UnitPrice : '', readonly: true });
  var discountField = Input.renderField({ id: 'discount_' + rowId, label: 'CK', type: 'number', value: p.DiscountPercent || '0', readonly: isPromo });
  var totalField = Input.renderField({ id: 'total_' + rowId, label: 'Tiền', readonly: true, className: 'amount-field' });

  var parentAttr = p.parentRowId ? ' data-parent-row-id="' + p.parentRowId + '"' : '';
  var removeBtn = isPromo ? '' : '<button type="button" class="btn-remove-row" onclick="removeProductRow(' + rowId + ')">🗑️</button>';
  var rowHtml = '<div class="responsive-grid add-product-row' + (isPromo ? ' promo-row' : '') + '" id="row_' + rowId + '"' + parentAttr + ' style="margin-bottom:4px;padding-bottom:8px;border-bottom:1px solid var(--color-border)">' +
    '<div style="display:flex;flex-direction:column;min-width:0;">' +
      '<div id="productPickerContainer_' + rowId + '" class="form-group' + (p.ItemID ? ' has-value' : '') + '" style="cursor:pointer" data-value="' + (p.ItemID || '') + '" data-price="' + (p.UnitPrice || 0) + '" data-name="' + (p.ItemName || '') + '">' + productSelect + '</div>' +
      '<div id="promoSuggest_' + rowId + '" class="promo-suggest" style="font-size:0.8rem;color:#16a34a;margin-top:2px;font-weight:600;display:none;"></div>' +
    '</div>' +
    qtyField +
    priceField +
    discountField +
    totalField +
    removeBtn +
    '</div>';

  $('#dynamicProductRowsContainer').prepend(rowHtml);

  // Bind click for product picker
  $('#productPickerContainer_' + rowId).on('click', function () {
    if ($(this).find('.locked').length > 0) return;
    openProductPicker(rowId);
  });
  // Bind input for calculations
  $('#qty_' + rowId + ', #discount_' + rowId + ', #price_' + rowId).on('input', function () { calculateRowTotal(rowId); });

  if (p.ItemID) calculateRowTotal(rowId);
}

function removeProductRow(rowId) {
  $('#dynamicProductRowsContainer .add-product-row[data-parent-row-id="' + rowId + '"]').each(function() {
    var promoRowId = $(this).attr('id').split('_')[1];
    $('#row_' + promoRowId).remove();
  });
  $('#row_' + rowId).remove();
  updateLiveTotal();
}

// -- Validate & build payload ----------------------------------------------
function validateAndBuildPayload() {
  var v = orderForm.getValues();
  var productRows = collectProducts();

  if (_branchLoadError) {
    Alert.error('Không thể tải thông tin chi nhánh. Vui lòng tải lại trang hoặc liên hệ quản trị viên.');
    return null;
  }

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

  var docId = v.orderId || genUUID();
  return {
    docId: docId,
    payload: {
      User: user.UserName || '',
      DocumentID: docId,
      DocumentDate: v.orderDate,
      BranchID: v.branch,
      ManagerID: user.ManagerID || 'ADMIN',
      EmployeeID: user.EmployeeID || 'ADMIN',
      ObjectID: v.customer,
      Memo: v.memo || '',
      Notes: v.notes || '',
      ChanhXe: v.phone || '',
      DeliverDate: v.orderDate,
      XaPhuong: v.ward || '',
      ThuDiTuyen: v.route || '',
      StatusID: 0,
      ItemList: JSON.stringify(itemList),
      SYSManagerID: user.ManagerID || 'ADMIN',
      SYSEmployeeID: user.EmployeeID || 'ADMIN'
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

  if (!_orderSubmitIdempotencyKey) _orderSubmitIdempotencyKey = newIdempotencyKey('order-create');
  var submitKey = _orderSubmitIdempotencyKey;
  Http.post(API_CONFIG.ENDPOINTS.ORDERS.CREATE, data.payload, { idempotencyKey: submitKey }).then(function (res) {
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
    if (_orderSubmitIdempotencyKey === submitKey) _orderSubmitIdempotencyKey = '';
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
  if (!_draftSubmitIdempotencyKey) _draftSubmitIdempotencyKey = newIdempotencyKey('order-draft');
  var draftKey = _draftSubmitIdempotencyKey;
  Http.post(API_CONFIG.ENDPOINTS.ORDERS.CREATE, data.payload, { idempotencyKey: draftKey }).then(function (res) {
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
    if (_draftSubmitIdempotencyKey === draftKey) _draftSubmitIdempotencyKey = '';
    $btn.prop('disabled', false).text('LƯU NHÁP');
  });
});

// Obsolete promo click handler replaced with reactive auto-promotion

// Initialize with one empty row
appendProductRow();


// -- DỮ LIỆU TỪ CHATBOT SANG (AUTO-MAP) --------------------------------------
setTimeout(function() {
  if (window.location.hash.indexOf('?data=') > -1) {
    try {
      var dataStr = decodeURIComponent(window.location.hash.split('?data=')[1]);
      var params = JSON.parse(dataStr);
      // alert('DEBUG FOUND HASH DATA: ' + Object.keys(params).join(', '));
      
      // Khôi phục khách hàng
      if (params['@ObjectID']) {
          var cusId = params['@ObjectID'];
          orderForm.setListValue('customer', cusId, cusId + ' (Đang tải...)');
          
          Http.get(API_CONFIG.ENDPOINTS.FILTER.CUSTOMERS, {
            q: JSON.stringify({ User: user.UserName || '', ManagerID: '', EmployeeID: '', ObjectID: '', LoaiKhachHang: '', KenhBan: '', SearchText: '', SYSManagerID: user.ManagerID || '', SYSEmployeeID: user.EmployeeID || '' })
          }).then(function (res) {
            var records = (res.data || res).records || res.data || res || [];
            _customersCache = records;
            var c = records.find(function(x) { return (x.ObjectID||'').toLowerCase() === cusId.toLowerCase(); });
            if (!c) {
                var searchLow = cusId.toLowerCase().trim();
                c = records.find(function(x) {
                    return (x.DisplayName||'').toLowerCase().indexOf(searchLow) > -1 || 
                           (x.ObjectName||'').toLowerCase().indexOf(searchLow) > -1 || 
                           (x.Phone||'') === searchLow;
                });
            }
            if (c) {
                orderForm.setListValue('customer', c.ObjectID, c.DisplayName || c.ObjectName);
                
                // Kích hoạt auto full Phường xã
                orderForm.setValue('phone', c.Phone || '');
                orderForm.setValue('address', c.Address || '');
                if (c.XaPhuong) orderForm.setListValue('ward', c.XaPhuong, c.XaPhuong);
            } else {
                // Báo lỗi không khớp khách hàng
                orderForm.setListValue('customer', '', 'Không tìm thấy: ' + cusId);
            }
          });
      }
      
      if (params['@Description']) {
          orderForm.setValue('memo', params['@Description']);
      }
      
      // Khôi phục danh sách sản phẩm
      if (params['@ItemList']) {
          var items = typeof params['@ItemList'] === 'string' ? JSON.parse(params['@ItemList']) : params['@ItemList'];
          if (items && items.length > 0) {
              // Clear empty row
              $('#dynamicProductRowsContainer').html('');
              rowCounter = 0;
              
              items.forEach(function(it) {
                  appendProductRow();
                  var currentRId = rowCounter;
                  var $picker = $('#productPickerContainer_' + currentRId);
                  var pId = it.ItemID;
                  var pName = it.ItemName || it.ItemID;
                  
                  $picker.attr('data-value', pId).attr('data-price', it.Price || 0).attr('data-name', pName).addClass('has-value');
                  $picker.find('.filter-value-text').text(pName);
                  $('#qty_' + currentRId).val(it.Quantity || 1);
                  $('#price_' + currentRId).val(it.Price || 0);
                  calculateRowTotal(currentRId);
              });
              
              // Load full list
              loadProducts(function(prods) {
                  items.forEach(function(it, idx) {
                     var match = prods.find(function(x) { return (x.ItemID||'').toLowerCase() === (it.ItemID||'').toLowerCase(); });
                     if (!match) {
                         var pLow = (it.ItemID||it.ItemName||'').toLowerCase().trim();
                         match = prods.find(function(x) {
                             return (x.ItemName||'').toLowerCase().indexOf(pLow) > -1 || (x.ItemID||'').toLowerCase().indexOf(pLow) > -1;
                         });
                     }
                     
                     if (match) {
                        var realName = match.ItemName || match.ItemID;
                        var realPrice = match.UnitPrice || match.Price || 0;
                        var targetRId = idx + 1;
                        
                         // Extract Discount (Chiết khấu)
                         var autoDiscount = 0;
                         if (it.DiscountPercent !== undefined && it.DiscountPercent !== null && it.DiscountPercent !== '' && parseFloat(it.DiscountPercent) > 0) {
                             autoDiscount = parseFloat(it.DiscountPercent);
                         } else if (it.discount !== undefined && it.discount !== null && it.discount !== '' && parseFloat(it.discount) > 0) {
                             autoDiscount = parseFloat(it.discount);
                         } else {
                             var chatbotString = it.ItemName || it.ItemID || '';
                             var ckMatch = chatbotString.match(/(?:ck|chiết khấu|chiet khau)\s*(\d+(\.\d+)?)%/i);
                             if (ckMatch) {
                                 autoDiscount = parseFloat(ckMatch[1]);
                             } else {
                                 var realCkMatch = realName.match(/(?:ck|chiết khấu|chiet khau)\s*(\d+(\.\d+)?)%/i);
                                 if (realCkMatch) {
                                     autoDiscount = parseFloat(realCkMatch[1]);
                                 }
                             }
                         }

                        // Nhận diện chatbotPrice để giữ giá 0đ của chatbot nếu có
                        var chatbotPrice = it.Price !== undefined ? it.Price : (it.UnitPrice !== undefined ? it.UnitPrice : null);
                        if (chatbotPrice !== null && parseFloat(chatbotPrice) === 0) {
                            realPrice = 0;
                        }

                        var $p = $('#productPickerContainer_' + targetRId);
                        $p.attr('data-value', match.ItemID).attr('data-name', realName).attr('data-price', realPrice).addClass('has-value');
                        $p.find('.filter-value-text').text(realName);
                        $('#price_' + targetRId).val(realPrice);
                        
                        // Set auto discount if detected
                        if (autoDiscount > 0) {
                            $('#discount_' + targetRId).val(autoDiscount);
                        }
                        
                        calculateRowTotal(targetRId);
                     }
                  });
              });
          }
      }
      
      // Xóa trên URL
      history.replaceState(null, null, '#/create-order');
      setTimeout(function() { Alert.success('Đã tải dữ liệu Đơn hàng từ Chatbot!'); }, 500);
      
    } catch(e) { 
       alert('Parse chatbot payload failed: ' + e.message); 
       console.error('Parse chatbot payload failed:', e); 
    }
  }
}, 500);

// -- Cleanup Hooks (Chống rò rỉ bộ nhớ) --------------------------------
window._pageCleanupHooks = window._pageCleanupHooks || [];
window._pageCleanupHooks.push(function() {
  _createOrderActive = false;
  destroyProductPicker();
  $(document).off('change', '#fs-orderDate');
});
