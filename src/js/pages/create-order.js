// -- Helpers ------------------------------------------------------------------
// Frontend không sinh mã nghiệp vụ. Khi người dùng để trống mã đơn, gửi
// AUTO_GEN để API_DonHangChiTiet_Insert_AI sinh mã theo quy tắc ERP phía SQL.
function todayStr() {
  var d = new Date();
  return d.getFullYear() + '-' + ('0' + (d.getMonth() + 1)).slice(-2) + '-' + ('0' + d.getDate()).slice(-2);
}

// giftItemId/giftItemName: dùng khi CTBH cấu hình chỉ định quà tặng khác sản phẩm đang mua
// (vd mua dầu gội tặng dầu xả). Mặc định giữ hành vi cũ — tặng cùng sản phẩm — khi không
// truyền (đúng cách note-text luôn hoạt động từ trước tới nay).
function autoApplyPromotion(parentRowId, itemId, name, freeQty, giftItemId, giftItemName) {
  var $existingPromoRow = $('#dynamicProductRowsContainer .add-product-row[data-parent-row-id="' + parentRowId + '"]');

  if (freeQty <= 0) {
    if ($existingPromoRow.length) {
      var existingRowId = $existingPromoRow.attr('id').split('_')[1];
      removeProductRow(existingRowId);
    }
    return;
  }

  var cleanName = name.replace(/\s*\(Mua\s+[\s\S]*$/, '');
  var resolvedItemId = giftItemId || itemId;
  var resolvedName = giftItemName || cleanName;

  if ($existingPromoRow.length) {
    var existingRowId = $existingPromoRow.attr('id').split('_')[1];
    var $qtyField = $('#qty_' + existingRowId);
    var currentGiftItemId = $('#productPickerContainer_' + existingRowId).attr('data-value') || '';
    if (currentGiftItemId !== resolvedItemId) {
      // Quà tặng đổi sản phẩm (vd đổi CTBH) — chỉ xoá đúng dòng quà tặng cũ (KHÔNG phải
      // removeProductRow(parentRowId), vì hàm đó xoá luôn dòng sản phẩm chính) rồi tạo lại
      // đúng sản phẩm mới, vì dòng quà tặng bị khoá (readonly) nên không thể chỉ đổi
      // data-value tại chỗ.
      $('#row_' + existingRowId).remove();
      appendProductRow({
        ItemID: resolvedItemId,
        ItemName: resolvedName,
        UnitPrice: 0,
        Quantity: freeQty,
        DiscountPercent: 0,
        PromotionLabel: 'Hàng tặng',
        parentRowId: parentRowId
      });
    } else if (parseInt($qtyField.val(), 10) !== freeQty) {
      $qtyField.val(freeQty);
      calculateRowTotal(existingRowId);
    }
  } else {
    appendProductRow({
      ItemID: resolvedItemId,
      ItemName: resolvedName,
      UnitPrice: 0,
      Quantity: freeQty,
      DiscountPercent: 0,
      PromotionLabel: 'Hàng tặng',
      parentRowId: parentRowId
    });
  }
}

var user = JSON.parse(localStorage.getItem('auth_user') || '{}');
var rowCounter = 0;
var _productsCache = null;
var _productsLoadError = false;
var _productsHydrating = false;
var _branchLoadError = false;
var _createOrderActive = true;
var _chatbotOrderPrefillActive = false;
var _openedFromChatbot = /#\/?create-order\?data=/.test(window.location.hash || '');
var _orderSubmitIdempotencyKey = '';
var _orderSubmitFingerprint = '';
var CHAT_ORDER_CREATED_NOTICE_KEY = 'medstand_chat_order_created_notice_v1';

function queueChatOrderCreatedNotice(documentId, payload) {
  if (!_openedFromChatbot) return false;

  var customerId = payload && payload.ObjectID ? String(payload.ObjectID) : '';
  var customer = _customersCache.find(function (item) {
    return String(item.ObjectID || '') === customerId;
  });
  var items = [];
  try {
    items = JSON.parse(payload && payload.ItemList ? payload.ItemList : '[]');
  } catch (e) {
    items = [];
  }

  try {
    sessionStorage.setItem(CHAT_ORDER_CREATED_NOTICE_KEY, JSON.stringify({
      documentId: String(documentId || ''),
      customerId: customerId,
      customerName: customer ? (customer.ObjectName || customer.DisplayName || customerId) : customerId,
      itemCount: items.filter(function (item) {
        return Number(item.Quantity || 0) > 0;
      }).length,
      username: user.UserName || user.Username || '',
      createdAt: Date.now()
    }));
    return true;
  } catch (e) {
    console.warn('[CreateOrder] Không thể lưu thông báo kết quả cho chatbot.', e);
    return false;
  }
}

function newIdempotencyKey(prefix) {
  var randomPart = (window.crypto && window.crypto.randomUUID)
    ? window.crypto.randomUUID()
    : Date.now().toString(36) + '-' + Math.random().toString(36).slice(2);
  return prefix + '-' + randomPart;
}

function escapeAttribute(value) {
  return String(value == null ? '' : value)
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function mutationFingerprint(payload) {
  return JSON.stringify(payload || {});
}

function getOrderSubmitKey(payload) {
  var fingerprint = mutationFingerprint(payload);
  if (!_orderSubmitIdempotencyKey || _orderSubmitFingerprint !== fingerprint) {
    _orderSubmitIdempotencyKey = newIdempotencyKey('order-create');
    _orderSubmitFingerprint = fingerprint;
  }
  return _orderSubmitIdempotencyKey;
}

function normalizeProductStock(value) {
  if (value === '' || value === null || value === undefined) return null;
  var stock = Number(value);
  return Number.isFinite(stock) ? stock : null;
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

// PROMO-CFG-001/002: cache rule CTBH cấu hình (đã duyệt) theo ItemID, ưu tiên hơn note-text
// khi có rule khớp mốc số lượng/giá trị hiện tại. Xem trước phía client, server vẫn luôn
// tính lại và là nguồn sự thật cuối cùng khi tạo đơn (API_DonHangChiTiet_Insert_AI).
var _configPromoRulesByItem = {};

function loadConfigPromoRules(itemId) {
  if (!itemId) return Promise.resolve([]);
  if (_configPromoRulesByItem[itemId]) return Promise.resolve(_configPromoRulesByItem[itemId]);
  return Http.get(API_CONFIG.ENDPOINTS.PROMOTION_ADMIN.ACTIVE_BY_ITEMS, {
    q: JSON.stringify({ Username: user.UserName || '', JsonItemIDs: JSON.stringify([itemId]) })
  }).then(function (res) {
    var body = res && res.data !== undefined ? res.data : res;
    var rows = (body && body.records) || body || [];
    if (rows.length && rows[0].MsgType === 1) rows = [];
    _configPromoRulesByItem[itemId] = rows;
    return rows;
  }).catch(function () {
    _configPromoRulesByItem[itemId] = [];
    return [];
  });
}

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
  .addInput({ id: 'address', label: 'Địa chỉ', placeholder: 'Địa chỉ khách hàng', readonly: true })
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
  .addInput({ id: 'phone', label: 'Số điện thoại', type: 'tel', required: true, placeholder: 'Số điện thoại khách hàng', readonly: true })
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
  _productsCache = null;
  $('#dynamicProductRowsContainer .add-product-row:not(.promo-row) [id^="productPickerContainer_"]').attr('data-verified', '0');
});

// -- Sự kiện khi chọn khách hàng -> Auto-fill ---------------------------------
orderForm.onListChange('customer', function(val) {
  if (!_chatbotOrderPrefillActive) {
    _productsCache = null;
    _productsLoadError = false;
    $('#dynamicProductRowsContainer').html('');
    rowCounter = 0;
    appendProductRow();
    updateLiveTotal();
  }
  var cust = _customersCache.find(function(r) { return r.ObjectID === val; });
  if (cust) {
    _selectedLocationID = cust.LocationID || '';
    // Xóa danh sách phường/xã của khách trước trước khi đặt giá trị mới.
    // Nếu hồ sơ khách chưa có XaPhuong, picker sẽ tải lại theo
    // LocationID để người dùng chọn thủ công, không tự suy đoán.
    orderForm.clearCache('ward');
    orderForm.setValue('phone', cust.Phone || '');
    orderForm.setValue('address', cust.Address || '');
    
    // Set Phường/Xã nếu có
    if (cust.XaPhuong) {
      orderForm.setListValue('ward', cust.XaPhuong, cust.XaPhuong);
    } else {
      orderForm.setListValue('ward', '', '');
    }
    
  }
});

// Danh mục chỉ dùng để tìm nhanh mã/tên. Giá, tồn, kho và CTBH luôn được
// đối chiếu riêng bằng API_HangHoaList_AI sau khi người dùng chọn đúng ItemID.
function responseRows(res) {
  var body = res && res.data !== undefined ? res.data : res;
  return (body && body.records) || body || [];
}

function searchProductCatalog(keyword) {
  return Http.get(API_CONFIG.ENDPOINTS.AI.CATALOG, {
    q: JSON.stringify({
      Username: user.UserName || '',
      Type: 'sanpham',
      timkiem: keyword || ''
    })
  }).then(function (res) {
    return responseRows(res).map(function (item) {
      return {
        value: item.MaDanhMuc || item.ItemID || '',
        name: item.Name || item.ItemName || item.MaDanhMuc || item.ItemID || ''
      };
    }).filter(function (item) { return item.value && item.name; });
  });
}

function loadProductDetail(itemId) {
  var customerId = orderForm.getValue('customer') || '';
  var documentDate = orderForm.getValue('orderDate') || todayStr();
  var cacheKey = [customerId, documentDate, itemId].join('|');
  if (!_productsCache) _productsCache = {};
  if (_productsCache[cacheKey]) return Promise.resolve(_productsCache[cacheKey]);

  return Http.get(API_CONFIG.ENDPOINTS.FILTER.PRODUCTS, {
    q: JSON.stringify({
      Username: user.UserName || '',
      ObjectID: customerId,
      ItemID: itemId || '',
      SearchText: '',
      DocumentDate: documentDate
    })
  }).then(function (res) {
    // PRODUCT-DIAG-001: đọc nguyên nhân từ Code, không tự đoán bằng danh sách rỗng.
    var verdict = window.MedstandProductOrderability.resolve(res, itemId);
    if (!verdict.orderable) throw window.MedstandProductOrderability.toError(verdict);
    var detail = verdict.detail;
    _productsCache[cacheKey] = detail;
    _productsLoadError = false;
    return loadConfigPromoRules(itemId).then(function () { return detail; });
  }).catch(function (error) {
    _productsLoadError = true;
    throw error;
  });
}

function buildProductOptions(items) {
  return items.map(function (item) {
    var option = {
      value: item.ItemID || '',
      price: item.UnitPrice || item.Price || 0,
      name: item.ItemName || item.ItemID || '',
      note: item.GhiChu || '',
      unit: item.UnitName || item.Unit || item.UnitID || '',
      stock: item.QuantityinStock !== undefined ? item.QuantityinStock : (item.TonKho !== undefined ? item.TonKho : ''),
      store: item.StoreHouseID || ''
    };
    return option;
  });
}

function openProductPicker(rowId) {
  destroyProductPicker();
  var $pickerContainer = $('#productPickerContainer_' + rowId);
  var $pickerText = $pickerContainer.find('.filter-value-text');
  var html = '<div class="filter-modal-header">' +
    '<button type="button" class="filter-modal-close" aria-label="Đóng" id="pp-close">&times;</button>' +
    '<h3>Chọn sản phẩm</h3></div>' +
    '<div style="padding:12px">' +
    Input.renderSearch({ id: 'pp-search', placeholder: 'Nhập ít nhất 2 ký tự tên hoặc mã' }) +
    '</div>' +
    '<ul class="select-modal-list product-picker-list" id="pp-list" style="max-height:50vh;overflow-y:auto;padding:0 12px">' +
    '<li class="product-picker-message">Nhập ít nhất 2 ký tự để tìm sản phẩm.</li></ul>';

  var $overlay = $('<div class="picker-overlay"></div>');
  var $sheet = $('<div class="picker-sheet"></div>').html(html);
  var searchTimer = null;
  var searchSeq = 0;
  $overlay.append($sheet).appendTo('body');
  $('body').css('overflow', 'hidden');

  function renderCatalog(options) {
    var listHtml = options.length ? options.map(function (o) {
      return '<li data-value="' + escapeAttribute(o.value) + '" data-name="' + escapeAttribute(o.name) + '" title="' + escapeAttribute(o.name) + '">' +
        '<span class="product-option-main"><strong>' + escapeAttribute(o.value) + '</strong><span class="product-option-name">' + escapeAttribute(o.name) + '</span></span>' +
        '<span class="product-option-meta"><span>Chọn để tải giá và tồn</span></span></li>';
    }).join('') : '<li class="product-picker-message">Không tìm thấy sản phẩm phù hợp.</li>';
    $overlay.find('#pp-list').html(listHtml);
  }

  setTimeout(function () {
    $overlay.addClass('active');
    $sheet.addClass('active');
    $overlay.find('#pp-search').trigger('focus');
  }, 10);
  $overlay.find('#pp-close').on('click', destroyProductPicker);
  $overlay.on('click', function (e) { if (e.target === $overlay[0]) destroyProductPicker(); });
  $overlay.find('#pp-search').on('input', function () {
    var keyword = String($(this).val() || '').trim();
    clearTimeout(searchTimer);
    if (keyword.length < 2) {
      searchSeq++;
      $overlay.find('#pp-list').html('<li class="product-picker-message">Nhập ít nhất 2 ký tự để tìm sản phẩm.</li>');
      return;
    }
    var requestSeq = ++searchSeq;
    $overlay.find('#pp-list').html('<li class="product-picker-message">Đang tìm sản phẩm...</li>');
    searchTimer = setTimeout(function () {
      searchProductCatalog(keyword).then(function (options) {
        if (requestSeq !== searchSeq || !$overlay.closest('body').length) return;
        renderCatalog(options);
      }).catch(function () {
        if (requestSeq !== searchSeq) return;
        $overlay.find('#pp-list').html('<li class="product-picker-message">Không thể tải danh mục sản phẩm. Vui lòng thử lại.</li>');
      });
    }, 300);
  });
  $overlay.on('click', '#pp-list li[data-value]', function () {
    var $selected = $(this);
    var itemId = $selected.attr('data-value') || '';
    $selected.addClass('selected').find('.product-option-meta').html('<span>Đang đối chiếu giá và tồn...</span>');
    loadProductDetail(itemId).then(function (detail) {
      if (!$overlay.closest('body').length) return;
      var option = buildProductOptions([detail])[0];
      $pickerContainer.attr('data-value', option.value).attr('data-price', option.price).attr('data-stock', option.stock).attr('data-store', option.store).attr('data-note', encodeURIComponent(option.note || '')).attr('data-name', option.name).attr('data-verified', '1');
      $pickerText.text(option.name);
      $pickerContainer.addClass('has-value');
      $('#price_' + rowId).val(option.price);
      $('#discount_' + rowId).val(0);
      destroyProductPicker();
      calculateRowTotal(rowId);
    }).catch(function (error) {
      $selected.removeClass('selected').find('.product-option-meta').html('<span>Không thể lấy giá/tồn</span>');
      Alert.error(error.message || 'Không thể đối chiếu sản phẩm đã chọn.');
    });
  });
}

function calculateRowTotal(rowId) {
  var $pickerContainer = $('#productPickerContainer_' + rowId);
  var itemId = $pickerContainer.attr('data-value') || '';
  if (!itemId) return null;
  var price = parseFloat($('#price_' + rowId).val() || 0);
  var name = $pickerContainer.attr('data-name') || '';
  var note = decodeURIComponent($pickerContainer.attr('data-note') || '');
  var qtyValue = Number($('#qty_' + rowId).val() || 0);
  var qty = Number.isInteger(qtyValue) ? qtyValue : 0;
  var discount = parseFloat($('#discount_' + rowId).val() || 0);
  var promotionResult = null;
  if (price > 0 && itemId && qty > 0 && window.MedstandPromotion) {
    var configRules = _configPromoRulesByItem[itemId];
    promotionResult = (configRules && configRules.length)
      ? window.MedstandPromotion.calculateFromConfigRules(configRules, qty, price)
      : null;
    if (!promotionResult) promotionResult = window.MedstandPromotion.calculate(note, qty);
    discount = promotionResult.discountPercent;
    $('#discount_' + rowId).val(discount);
  }
  var subtotal = price * qty;
  var total = subtotal - subtotal * (discount / 100);
  $('#total_' + rowId).val(Format.currency(total));

  // Dynamic promotional suggestions
  var $promoSuggest = $('#promoSuggest_' + rowId);
  if ($promoSuggest.length) {
    if (price > 0 && name && qty > 0) {
      var freeQty = promotionResult ? promotionResult.giftQuantity : 0;
      var giftItemId = promotionResult ? promotionResult.giftItemID : '';
      var giftItemName = promotionResult ? promotionResult.giftItemName : '';
      if (freeQty > 0) {
        autoApplyPromotion(rowId, itemId, name, freeQty, giftItemId, giftItemName);
        $promoSuggest.html('🎁 Hàng tặng: ' + freeQty + (giftItemName ? ' ' + giftItemName : ' sản phẩm') + ' (giá 0đ).').show();
      } else {
        autoApplyPromotion(rowId, itemId, name, 0);
        if (promotionResult && promotionResult.discountPercent > 0) {
          $promoSuggest.html('🏷️ Tự động áp dụng chiết khấu ' + promotionResult.discountPercent + '% do số lượng dưới mốc.').show();
        } else {
          $promoSuggest.hide().html('');
        }
      }
    } else if (price > 0) {
      autoApplyPromotion(rowId, itemId, name, 0);
      $promoSuggest.hide().html('');
    }
  }

  updateLiveTotal();
  return {
    itemId: itemId,
    name: name,
    price: price,
    qty: qty,
    discount: discount,
    stock: normalizeProductStock($pickerContainer.attr('data-stock')),
    isPromo: $('#row_' + rowId).hasClass('promo-row'),
    finalTotal: total
  };
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
    if ($(this).hasClass('promo-row')) return;
    var rowId = $(this).attr('id').split('_')[1];
    var data = calculateRowTotal(rowId);
    if (data && data.itemId && data.qty > 0) {
      data.giftQty = 0;
      $('#dynamicProductRowsContainer .add-product-row[data-parent-row-id="' + rowId + '"]').each(function () {
        var giftRowId = ($(this).attr('id') || '').split('_')[1];
        data.giftQty += Number($('#qty_' + giftRowId).val()) || 0;
      });
      items.push(data);
    }
  });
  return items;
}

function validateProductRows() {
  var error = '';
  $('#dynamicProductRowsContainer .add-product-row').each(function () {
    if (error) return;
    var rowId = ($(this).attr('id') || '').split('_')[1];
    if (!rowId) return;
    var itemId = $('#productPickerContainer_' + rowId).attr('data-value') || '';
    if (!itemId) return;
    var qty = Number($('#qty_' + rowId).val());
    var stock = normalizeProductStock($('#productPickerContainer_' + rowId).attr('data-stock'));
    var isPromo = $(this).hasClass('promo-row');
    var isVerified = $('#productPickerContainer_' + rowId).attr('data-verified') === '1';
    var price = Number($('#price_' + rowId).val());
    var discount = Number($('#discount_' + rowId).val());
    if (!isPromo && !isVerified) {
      error = 'Sản phẩm ' + itemId + ' chưa được đối chiếu lại giá và tồn theo SQL. Vui lòng chọn lại sản phẩm.';
      return;
    }
    if (!isPromo && (!Number.isFinite(price) || price <= 0 || !Number.isFinite(discount) || discount < 0 || discount > 100)) {
      error = 'Giá hoặc chiết khấu của sản phẩm ' + itemId + ' không hợp lệ.';
      return;
    }
    if (!Number.isInteger(qty) || qty <= 0) {
      error = 'Số lượng của sản phẩm ' + itemId + ' phải là số nguyên lớn hơn 0.';
      return;
    }
    var giftQty = 0;
    if (!isPromo) {
      $('#dynamicProductRowsContainer .add-product-row[data-parent-row-id="' + rowId + '"]').each(function () {
        var giftRowId = ($(this).attr('id') || '').split('_')[1];
        giftQty += Number($('#qty_' + giftRowId).val()) || 0;
      });
    }
    if (!isPromo && stock !== null && qty + giftQty > stock) {
      error = 'Tổng hàng bán và hàng tặng của sản phẩm ' + itemId + ' vượt tồn khả dụng (' + stock + ').';
    }
  });
  return error;
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
  var initialStock = p.QuantityinStock !== undefined ? p.QuantityinStock : (p.TonKho !== undefined ? p.TonKho : '');
  var rowHtml = '<div class="responsive-grid add-product-row' + (isPromo ? ' promo-row' : '') + '" id="row_' + rowId + '"' + parentAttr + ' style="margin-bottom:4px;padding-bottom:8px;border-bottom:1px solid var(--color-border)">' +
    '<div style="display:flex;flex-direction:column;min-width:0;">' +
      '<div id="productPickerContainer_' + rowId + '" class="form-group' + (p.ItemID ? ' has-value' : '') + '" style="cursor:pointer" data-value="' + escapeAttribute(p.ItemID || '') + '" data-price="' + escapeAttribute(p.UnitPrice || 0) + '" data-stock="' + escapeAttribute(initialStock) + '" data-note="' + encodeURIComponent(p.GhiChu || '') + '" data-name="' + escapeAttribute(p.ItemName || '') + '" data-verified="' + (isPromo ? '1' : '0') + '">' + productSelect + '</div>' +
      '<div id="promoSuggest_' + rowId + '" class="promo-suggest" style="font-size:0.8rem;color:#16a34a;margin-top:2px;font-weight:600;' + (p.PromotionLabel ? '' : 'display:none;') + '">' + (p.PromotionLabel || '') + '</div>' +
    '</div>' +
    qtyField +
    priceField +
    discountField +
    totalField +
    removeBtn +
    '</div>';

  $('#dynamicProductRowsContainer').prepend(rowHtml);
  $('#qty_' + rowId).attr({ min: '1', step: '1', inputmode: 'numeric' });

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
// isDraft=true (ORDER-APPROVAL-002, nút "Lưu nháp"): chỉ bắt buộc đã chọn khách hàng + ít
// nhất 1 sản phẩm hợp lệ — SĐT/phường-xã/tuyến/ngày vốn để đảm bảo đơn HOÀN CHỈNH trước khi
// gửi duyệt, không hợp lý khi chỉ đang "lưu tạm việc đang làm dở". Proc phía sau cũng không
// bắt buộc các field này làm tham số (BranchID/DocumentDate tự điền mặc định nếu để trống;
// Phone lấy từ hồ sơ khách, không phải field gửi lên).
function validateAndBuildPayload(isDraft) {
  var v = orderForm.getValues();
  var productError = validateProductRows();
  var productRows = collectProducts();

  if (_productsHydrating) { Alert.warning('Đang đối chiếu giá và tồn sản phẩm với SQL. Vui lòng chờ trong giây lát.'); return null; }
  if (_productsLoadError) { Alert.error('Không thể đối chiếu giá và tồn sản phẩm. Vui lòng tải lại danh sách hàng.'); return null; }

  if (!isDraft && _branchLoadError) {
    Alert.error('Không thể tải thông tin chi nhánh. Vui lòng tải lại trang hoặc liên hệ quản trị viên.');
    return null;
  }

  if (!v.customer) { Alert.warning('Vui lòng chọn khách hàng.'); return null; }
  if (!isDraft) {
    if (!v.orderDate) { Alert.warning('Vui lòng chọn ngày chứng từ.'); return null; }
    if (!v.branch) { Alert.warning('Vui lòng chọn chi nhánh.'); return null; }
    if (!v.ward) { Alert.warning('Vui lòng chọn phường/xã.'); return null; }
    if (!v.route) { Alert.warning('Vui lòng chọn tuyến thứ.'); return null; }
    if (!v.phone) { Alert.warning('Vui lòng nhập số điện thoại.'); return null; }
  }
  if (productError) { Alert.warning(productError); return null; }
  if (productRows.length === 0) { Alert.warning('Vui lòng thêm ít nhất 1 sản phẩm.'); return null; }

  var itemList = productRows.map(function (p) {
    var amount = p.price * p.qty;
    var discAmt = Math.round(amount * (p.discount / 100));
    return {
      ItemID: p.itemId, Quantity: p.qty, SoLuongTang: p.giftQty || 0,
      UnitPrice: p.price, Amount: amount,
      DiscountPercent: p.discount, DiscountAmount: discAmt,
      DiemSanPham: 0, Notes: ''
    };
  });

  var docId = v.orderId || 'AUTO_GEN';
  var payload = {
    Username: user.UserName || '',
    DocumentID: docId,
    DocumentDate: v.orderDate,
    BranchID: v.branch,
    ObjectID: v.customer,
    Memo: v.memo || '',
    Notes: v.notes || '',
    XaPhuong: v.ward || '',
    ThuDiTuyen: v.route || '',
    ItemList: JSON.stringify(itemList)
  };
  // ORDER-APPROVAL-006: chỉ gắn SaveAsDraft khi thực sự lưu nháp — payload gửi thẳng (Tạo đơn
  // hàng) giữ nguyên hình dạng cũ, để fingerprint chống gửi lặp không lẫn giữa 2 nút.
  if (isDraft) payload.SaveAsDraft = true;

  return { docId: docId, payload: payload };
}

function resetForm() {
  $('#dynamicProductRowsContainer').html('');
  orderForm.reset();
  orderForm.setValue('orderDate', todayStr());
  appendProductRow();
  updateLiveTotal();
  _orderSubmitIdempotencyKey = '';
  _orderSubmitFingerprint = '';
}

// -- Submit Order -------------------------------------------------------------
$('#btnSubmitOrder').on('click', function () {
  var data = validateAndBuildPayload();
  if (!data) return;

  var $btn = $(this);
  $btn.prop('disabled', true).text('Đang xử lý...');

  var submitKey = getOrderSubmitKey(data.payload);
  var submitSucceeded = false;
  Http.post(API_CONFIG.ENDPOINTS.ORDERS.CREATE, data.payload, { idempotencyKey: submitKey }).then(function (res) {
    var d = res.data || res;
    var record = Array.isArray(d) ? d[0] : (d.records ? d.records[0] : d);
    var msg = record && record.Msg ? record.Msg : '';
    var msgType = record && record.MsgType !== undefined ? Number(record.MsgType) : NaN;
    var responseDocumentId = record && record.DocumentID != null ? String(record.DocumentID).trim() : '';
    if (msgType !== 5 || !responseDocumentId) {
      Alert.error(msg || 'Phản hồi tạo đơn hàng không hợp lệ. Vui lòng thử lại.');
      return;
    }
    submitSucceeded = true;
    if (window.MedstandOrderDraft && typeof window.MedstandOrderDraft.markCreated === 'function') {
      window.MedstandOrderDraft.markCreated(responseDocumentId);
    }
    var chatNoticeQueued = queueChatOrderCreatedNotice(responseDocumentId, data.payload);
    var successAlert = Alert.success((msg || 'Tạo đơn hàng thành công!') + ' Mã đơn: ' + responseDocumentId);
    if (chatNoticeQueued) {
      var returnToChat = function () {
        if (_createOrderActive) navigate('chatbot');
      };
      Promise.resolve(successAlert).then(returnToChat, returnToChat);
    }
    resetForm();
  }).catch(function (err) {
    Alert.error(err.message || 'Có lỗi xảy ra.');
  }).finally(function () {
    if (submitSucceeded && _orderSubmitIdempotencyKey === submitKey) {
      _orderSubmitIdempotencyKey = '';
      _orderSubmitFingerprint = '';
    }
    $btn.prop('disabled', false).text('TẠO ĐƠN HÀNG');
  });
});

// -- Save Draft (ORDER-APPROVAL-006) -------------------------------------------
$('#btnSaveDraft').on('click', function () {
  var data = validateAndBuildPayload(true);
  if (!data) return;

  var $btn = $(this);
  $btn.prop('disabled', true).text('Đang lưu...');

  var draftKey = getOrderSubmitKey(data.payload);
  var draftSucceeded = false;
  Http.post(API_CONFIG.ENDPOINTS.ORDERS.CREATE, data.payload, { idempotencyKey: draftKey }).then(function (res) {
    var d = res.data || res;
    var record = Array.isArray(d) ? d[0] : (d.records ? d.records[0] : d);
    var msg = record && record.Msg ? record.Msg : '';
    var msgType = record && record.MsgType !== undefined ? Number(record.MsgType) : NaN;
    var responseDocumentId = record && record.DocumentID != null ? String(record.DocumentID).trim() : '';
    if (msgType !== 5 || !responseDocumentId) {
      Alert.error(msg || 'Phản hồi lưu nháp không hợp lệ. Vui lòng thử lại.');
      return;
    }
    draftSucceeded = true;
    if (window.MedstandOrderDraft && typeof window.MedstandOrderDraft.markCreated === 'function') {
      window.MedstandOrderDraft.markCreated(responseDocumentId);
    }
    Alert.success((msg || 'Đã lưu nháp đơn hàng!') + ' Mã đơn: ' + responseDocumentId);
    resetForm();
  }).catch(function (err) {
    Alert.error(err.message || 'Có lỗi xảy ra.');
  }).finally(function () {
    if (draftSucceeded && _orderSubmitIdempotencyKey === draftKey) {
      _orderSubmitIdempotencyKey = '';
      _orderSubmitFingerprint = '';
    }
    $btn.prop('disabled', false).text('LƯU NHÁP');
  });
});

// Lưu nháp ĐÃ BỎ (khách chốt 21/08/2026): tạo đơn là vào thẳng Chờ duyệt.
// Kéo theo: gửi đơn xong Sale hết quyền sửa, chỉ kế toán/quản lý sửa được — xem
// sql/ORDER-APPROVAL-005_Order_Edit_Guard_AI.sql.

// Obsolete promo click handler replaced with reactive auto-promotion

// Initialize with one empty row
appendProductRow();


// -- DỮ LIỆU TỪ CHATBOT SANG (AUTO-MAP) --------------------------------------
setTimeout(function() {
  if (window.location.hash.indexOf('?data=') > -1) {
    try {
      var dataStr = decodeURIComponent(window.location.hash.split('?data=')[1]);
      var params = JSON.parse(dataStr);
      _chatbotOrderPrefillActive = true;
      var customerReady = Promise.resolve();
      var productsReady = Promise.resolve();
      // alert('DEBUG FOUND HASH DATA: ' + Object.keys(params).join(', '));
      
      // Khôi phục khách hàng
      if (params['@ObjectID']) {
          var cusId = params['@ObjectID'];
          orderForm.setListValue('customer', cusId, cusId + ' (Đang tải...)');
          
          customerReady = Http.get(API_CONFIG.ENDPOINTS.FILTER.CUSTOMERS, {
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
                _selectedLocationID = c.LocationID || '';
                orderForm.clearCache('ward');
                orderForm.setValue('phone', c.Phone || '');
                orderForm.setValue('address', c.Address || '');
                orderForm.setListValue('ward', c.XaPhuong || '', c.XaPhuong || '');
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
          items = (items || []).filter(function (item) {
              return item.LineType !== 'promotion';
          });
          if (items && items.length > 0) {
              // Clear empty row
              $('#dynamicProductRowsContainer').html('');
              rowCounter = 0;
              var hydratedRowIds = [];
              
              items.forEach(function(it) {
                  appendProductRow();
                  var currentRId = rowCounter;
                  hydratedRowIds.push(currentRId);
                  var $picker = $('#productPickerContainer_' + currentRId);
                  var pId = it.ItemID;
                  var pName = it.ItemName || it.ItemID;
                  
                  $picker.attr('data-value', pId).attr('data-price', it.Price || 0).attr('data-name', pName).addClass('has-value');
                  $picker.find('.filter-value-text').text(pName);
                  $('#qty_' + currentRId).val(it.Quantity || 1);
                  $('#price_' + currentRId).val(it.Price || 0);
              });
              
              // Chỉ đối chiếu các ItemID có trong payload; không tải toàn bộ catalog nặng.
              _productsCache = null;
              _productsHydrating = true;
              productsReady = customerReady.then(function () {
                  return Promise.all(items.map(function (it) {
                      return loadProductDetail(it.ItemID).catch(function () { return null; });
                  }));
              }).then(function (details) {
                  items.forEach(function(it, idx) {
                     var match = details[idx];
                     if (match) {
                        var realName = match.ItemName || match.ItemID;
                        var realPrice = match.UnitPrice || match.Price || 0;
                        var targetRId = hydratedRowIds[idx];

                        var $p = $('#productPickerContainer_' + targetRId);
                        var realStock = match.QuantityinStock !== undefined ? match.QuantityinStock : (match.TonKho !== undefined ? match.TonKho : '');
                         $p.attr('data-value', match.ItemID).attr('data-name', realName).attr('data-price', realPrice).attr('data-stock', realStock).attr('data-store', match.StoreHouseID || '').attr('data-note', encodeURIComponent(match.GhiChu || '')).attr('data-verified', '1').addClass('has-value');
                        $p.find('.filter-value-text').text(realName);
                        $('#price_' + targetRId).val(realPrice);
                        
                         calculateRowTotal(targetRId);
                     }
                  });
              }).finally(function () {
                  _productsHydrating = false;
              });
          }
      }

      Promise.allSettled([customerReady, productsReady]).then(function () {
          _chatbotOrderPrefillActive = false;
      });
      
      // Xóa trên URL
      history.replaceState(null, null, '#/create-order');
      setTimeout(function() { Alert.success('Đã tải dữ liệu Đơn hàng từ Chatbot!'); }, 500);
      
    } catch(e) { 
       _chatbotOrderPrefillActive = false;
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
