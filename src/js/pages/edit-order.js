    var params = window._routeParams || {};
    var orderId = params.id || '';
    var user = JSON.parse(localStorage.getItem('auth_user') || '{}');
    var rowCounter = 0;
    var _productsCache = null;

    // -- Promotion Helpers ----------------------------------------------------
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

    // Back button: trở về order-detail nếu có id
    if (orderId) {
      $('#btn-back').attr('href', '#/order-detail?id=' + encodeURIComponent(orderId));
    }

    if (!orderId) {
      $('#loading-state').text('Không có mã đơn hàng.');
    } else {
      // Load order data
      OrderService.getDetail(orderId, '')
        .then(function (res) {
          var data = res.data || res;
          // API_DonHangChiTiet trả:
          //   records   = chi tiết sản phẩm (cũng chứa order header)
          //   records2  = order summary (TotalAmount, GiamGia...)
          //   records3  = thông tin địa chỉ khách (XaPhuong, QuanHuyen...)
          var products = data.records || [];
          var p0       = products[0] || {};      // header bọc trong mỗi row sản phẩm
          var customer = (data.records3 && data.records3[0]) || {};

          // Chuẩn hóa ngày: "2026-04-20T00:00:00" hoặc "20/04/2026" → YYYY-MM-DD
          var rawDate = p0.NgayDatHang || p0.DocumentDate || '';
          if (rawDate && rawDate.indexOf('/') !== -1) {
            var dparts = rawDate.split('/');
            if (dparts.length === 3) rawDate = dparts[2].substring(0,4) + '-' + dparts[1] + '-' + dparts[0];
          } else if (rawDate.indexOf('T') !== -1) {
            rawDate = rawDate.substring(0, 10);
          }

          // Build summary object từ p0 (order header) + records3 (địa chỉ)
          var summary = {
            StatusID:     undefined,          // sẽ fetch riêng
            DocumentDate: rawDate,
            BranchID:     p0.BranchID     || '',
            BranchName:   p0.BranchName   || '',
            CeoID:        p0.CeoID        || '',
            CeoName:      p0.CeoName      || '',
            ManagerID:    p0.ManagerID    || '',
            ManagerName:  p0.ManagerName  || '',
            EmployeeID:   p0.EmployeeID   || '',
            EmployeeName: p0.EmployeeName || '',
            Memo:         p0.Memo         || '',
            Notes:        p0.Notes        || '',
            // Thông tin khách hàng
            ObjectID:     p0.ObjectID     || '',
            ObjectName:   p0.ObjectName   || '',
            Address:      customer.Address    || p0.Address    || '',
            Phone:        p0.Phone        || '',
            XaPhuong:     customer.XaPhuong   || p0.XaPhuong   || '',
            ThuTrongTuan: p0.ThuDiTuyen   || ''
          };

          $('#loading-state').hide();
          $('#edit-form-wrap').prop('hidden', false);

          // Build form với dữ liệu đã có
          buildForm(summary);

          // Pre-fill products
          if (products.length) {
            products.forEach(function (p) { appendProductRow(p); });
          } else {
            appendProductRow();
          }
          updateLiveTotal();

          // StatusID: thử đọc từ first product row, mặc định 0 nếu không có
          setTimeout(function() {
            if ($('#selAdminStatus').length) {
              var sid = p0.StatusID !== undefined ? parseInt(p0.StatusID, 10) : 0;
              $('#selAdminStatus').val(sid);
            }
          }, 300);
        })
        .catch(function (err) {
          console.error(err);
          $('#loading-state').text('Lỗi tải dữ liệu đơn hàng.');
        });
    }

    // ── Build form ────────────────────────────────────────────────────────────────
    function buildForm(summary) {
      var orderForm = new FormSelect({ container: '#orderFormContainer' });
      window._orderForm = orderForm;

      // Các trường readonly (chỉ hiển thị, không gửi lên SP)
      orderForm.addInput({ id: 'orderDate', label: 'Ngày CT', type: 'date', value: (summary.DocumentDate || '').substring(0, 10), readonly: true });

      // Chi nhánh: lock nếu có BranchID trong localStorage, ngược lại dropdown
      if (user.BranchID) {
        orderForm.addInput({ id: 'branch', label: 'Chi nhánh', value: user.BranchName || summary.BranchName || '', readonly: true });
        orderForm.setLocked('branch', true);
      } else {
        orderForm.addList({
          id: 'branch', label: 'Chi nhánh', required: true, placeholder: 'Chọn chi nhánh',
          loadFn: function (done) {
            Http.get(API_CONFIG.ENDPOINTS.FILTER.BRANCHES, { q: JSON.stringify({ BranchID: '', SearchText: '' }) })
              .then(function (res) {
                var records = (res.data || res).records || res.data || res || [];
                var opts = records.map(function (r) { return { value: r.BranchID || '', label: r.BranchName || r.BranchID || '' }; });
                done(opts);
                if (summary.BranchID) {
                  var match = opts.find(function (o) { return o.value === summary.BranchID; });
                  if (match) orderForm.setListValue('branch', match.value, match.label);
                }
              }).catch(function () { done([]); });
          }
        });
      }

      orderForm
        .addInput({ id: 'ceo', label: 'Tổng quản lý', value: summary.CeoName || user.CeoName || '', placeholder: 'Tổng quản lý', readonly: true })
        .addList({
          id: 'manager', label: 'Quản lý',
          loadFn: function (done) {
            done([{ value: summary.ManagerID || user.ManagerID || '', label: summary.ManagerName || user.ManagerName || '' }]);
            orderForm.setListValue('manager', summary.ManagerID || user.ManagerID || '', summary.ManagerName || user.ManagerName || '');
          }
        })
        .addList({
          id: 'employee', label: 'Tên nhân viên',
          loadFn: function (done) {
            var empId  = summary.EmployeeID  || user.EmployeeID  || '';
            var empName = summary.EmployeeName || user.EmployeeName || empId; // fallback to ID nếu name trống
            done([{ value: empId, label: empName }]);
            if (empId) orderForm.setListValue('employee', empId, empName);
          }
        })
        // Các trường cho phép sửa
        .addList({
          id: 'customer', label: 'Tên khách hàng', required: true, placeholder: 'Chọn khách hàng',
          loadFn: function (done) {
            Http.get(API_CONFIG.ENDPOINTS.FILTER.CUSTOMERS, {
              q: JSON.stringify({
                User: user.UserName || '', ManagerID: '', EmployeeID: '',
                ObjectID: '', LoaiKhachHang: '', KenhBan: '', SearchText: '',
                SYSManagerID: user.ManagerID || '', SYSEmployeeID: user.EmployeeID || ''
              })
            }).then(function (res) {
              var records = (res.data || res).records || res.data || res || [];
              window._customerRecords = records;
              var opts = records.map(function (r) { return { value: r.ObjectID || '', label: r.DisplayName || r.ObjectName || '' }; });
              // Đảm bảo khách hiện tại luôn có trong options
              if (summary.ObjectID && !opts.find(function(o){ return o.value === summary.ObjectID; })) {
                opts.unshift({ value: summary.ObjectID, label: summary.ObjectName || summary.ObjectID });
              }
              done(opts);
              if (summary.ObjectID) {
                var match = opts.find(function (o) { return o.value === summary.ObjectID; });
                if (match) orderForm.setListValue('customer', match.value, match.label);
              }
            }).catch(function () {
              // Nếu API lỗi, vẫn hiện khách hàng hiện tại
              var fallbackOpts = summary.ObjectID ? [{ value: summary.ObjectID, label: summary.ObjectName || summary.ObjectID }] : [];
              window._customerRecords = fallbackOpts;
              done(fallbackOpts);
              if (summary.ObjectID) orderForm.setListValue('customer', summary.ObjectID, summary.ObjectName || summary.ObjectID);
            });
          }
        })
        .addInput({ id: 'ward', label: 'Phường/Xã', value: summary.XaPhuong || '', placeholder: 'Phường/Xã', readonly: true })
        .addInput({ id: 'address', label: 'Địa chỉ', value: summary.Address || '', placeholder: 'Địa chỉ', readonly: true })
        .addList({
          id: 'route', label: 'Tuyến thứ', required: true, placeholder: 'Chọn tuyến',
          loadFn: function (done) {
            Http.get(API_CONFIG.ENDPOINTS.FILTER.ROUTE_DAYS, { q: JSON.stringify({ ThuDiTuyen: '' }) })
              .then(function (res) {
                var records = (res.data || res).records || res.data || res || [];
                // API có thể trả ThuTrongTuan hoặc ThuDiTuyen
                var opts = records.map(function (r) { 
                  var val = r.ThuTrongTuan || r.ThuDiTuyen || '';
                  return { value: val, label: val }; 
                });
                done(opts);
                // summary.ThuTrongTuan có thể là "Thứ 2" từ field ThuDiTuyen
                var routeVal = summary.ThuTrongTuan || '';
                if (routeVal) {
                  var match = opts.find(function (o) { return o.value === routeVal; });
                  if (match) orderForm.setListValue('route', match.value, match.label);
                }
              }).catch(function () { done([]); });
          }
        })
        .addInput({ id: 'phone', label: 'Số điện thoại', type: 'tel', value: summary.Phone || '', placeholder: 'Số điện thoại', readonly: true })
        .addInput({ id: 'memo', label: 'Ghi chú', placeholder: 'Ghi chú thêm', value: summary.Memo || '' });

      // Khi chọn lại khách hàng → tự cập nhật Phường/Xã, Địa chỉ, SĐT
      orderForm.onListChange('customer', function (val) {
        var records = window._customerRecords || [];
        var found = records.find(function (r) { return r.ObjectID === val; });
        if (found) {
          orderForm.setValue('ward', found.XaPhuong || '');
          orderForm.setValue('address', found.Address || '');
          orderForm.setValue('phone', found.Phone || '');
        }
      });
    }

    // ── Product helpers ───────────────────────────────────────────────────────────
    function loadProducts(cb) {
      if (_productsCache) return cb(_productsCache);
      Http.get(API_CONFIG.ENDPOINTS.FILTER.PRODUCTS, {
        q: JSON.stringify({ User: user.UserName || '', ItemID: '', SearchText: '' })
      }).then(function (res) {
        _productsCache = (res.data || res).records || res.data || res || [];
        cb(_productsCache);
      }).catch(function () { cb([]); });
    }

    function openProductPicker(rowId) {
      var $pickerContainer = $('#productPickerContainer_' + rowId);
      var $pickerText = $pickerContainer.find('.filter-value-text');
      var origText = $pickerText.text();

      $pickerText.text('Đang tải...');
      loadProducts(function (items) {
        $pickerText.text(origText);
        var options = items.map(function (item) {
          return { value: item.ItemID || '', label: (item.ItemName || item.ItemID || '') + ' - ' + Format.currency(item.UnitPrice || 0), price: item.UnitPrice || 0, name: item.ItemName || item.ItemID || '' };
        });
        var currentVal = $pickerContainer.attr('data-value') || '';
        var html = '<div class="filter-modal-header">' +
          '<button type="button" class="filter-modal-close" id="pp-close">&times;</button>' +
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
          $('#price_' + rowId).val(price);
          $overlay.remove();
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
            $promoSuggest.html('🎁 Đủ điều kiện tặng ' + freeQty + ' sp (Giá 0đ). <a href="#" class="btn-apply-promo" data-row-id="' + rowId + '" data-qty="' + freeQty + '" style="text-decoration:underline;color:#2563eb;margin-left:4px;">Thêm ngay</a>').show();
          } else {
            $promoSuggest.hide().html('');
          }
        } else {
          $promoSuggest.hide().html('');
        }
      }

      updateLiveTotal();
      return { itemId: itemId, name: name, price: price, qty: qty, discount: discount, finalTotal: total };
    }

    function updateLiveTotal() {
      var total = 0;
      $('#dynamicProductRowsContainer .add-product-row').each(function () {
        var rowId = $(this).attr('id').split('_')[1];
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

    // prefill = object {ItemID, ItemName, UnitPrice, Quantity, DiscountPercent, DiemSanPham, Notes, UserAutoID?}
    // Row có UserAutoID (từ SP hoặc sau insert) → row cũ; không có → row mới
    function appendProductRow(prefill) {
      rowCounter++;
      var rowId = rowCounter;
      var p = prefill || {};
      var autoId = p.UserAutoID || '';
      // Row mới: chưa có UserAutoID
      var isNew = !autoId;
      var isPromo = (p.UnitPrice !== undefined && p.UnitPrice !== null && parseFloat(p.UnitPrice) === 0);
      var actionBtns = isPromo ? '' : (isNew
        ? '<button type="button" class="btn-save-row" id="saveBtn_' + rowId + '" title="Lưu mới" onclick="saveProductRow(' + rowId + ')">&#x2713;</button>' +
        '<button type="button" class="btn-remove-row" onclick="removeProductRow(' + rowId + ')">&#x2715;</button>'
        : '<button type="button" class="btn-update-row" id="saveBtn_' + rowId + '" title="Cập nhật" onclick="updateProductRow(' + rowId + ')">&#x270E;</button>' +
        '<button type="button" class="btn-remove-row" onclick="removeProductRow(' + rowId + ')">&#x2715;</button>');
      var productSelect = Input.renderSelect({ key: 'p_' + rowId, label: 'Sản phẩm', value: p.ItemName || 'Chọn sản phẩm', locked: isPromo });
      var qtyField = Input.renderField({ id: 'qty_' + rowId, label: 'SL', type: 'number', value: p.Quantity || 1, readonly: isPromo });
      var priceField = Input.renderField({ id: 'price_' + rowId, label: 'Giá', type: 'number', value: (p.UnitPrice !== undefined && p.UnitPrice !== null) ? p.UnitPrice : '', readonly: true });
      var discountField = Input.renderField({ id: 'discount_' + rowId, label: 'CK', type: 'number', value: p.DiscountPercent || 0, readonly: isPromo });
      var totalField = Input.renderField({ id: 'total_' + rowId, label: 'Tiền', readonly: true, className: 'amount-field' });

      var rowHtml = '<div class="responsive-grid add-product-row edit-mode' + (isPromo ? ' promo-row' : '') + '" id="row_' + rowId + '"' +
        ' data-auto-id="' + autoId + '"' +
        ' style="margin-bottom:4px;padding-bottom:4px;border-bottom:1px solid var(--color-border)">' +
        '<div style="display:flex;flex-direction:column;min-width:0;">' +
          '<div id="productPickerContainer_' + rowId + '" class="form-group' + (p.ItemID ? ' has-value' : '') + '" style="cursor:pointer" ' +
          ' data-value="' + (p.ItemID || '') + '"' +
          ' data-price="' + (p.UnitPrice || 0) + '"' +
          ' data-name="' + (p.ItemName || '') + '">' + productSelect + '</div>' +
          '<div id="promoSuggest_' + rowId + '" class="promo-suggest" style="font-size:0.8rem;color:#16a34a;margin-top:2px;font-weight:600;display:none;"></div>' +
        '</div>' +
        qtyField +
        priceField +
        discountField +
        totalField +
        '<div style="display:flex;align-items:center;justify-content:flex-end;gap:4px">' +
        actionBtns + '</div>' +
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

    function saveProductRow(rowId) {
      var data = calculateRowTotal(rowId);
      if (!data || !data.itemId) { Alert.warning('Vui lòng chọn sản phẩm.'); return; }
      if (!data.qty || data.qty <= 0) { Alert.warning('Số lượng phải > 0.'); return; }
      var $saveBtn = $('#saveBtn_' + rowId);
      $saveBtn.prop('disabled', true).text('…');
      var amount = data.price * data.qty;
      var discAmt = Math.round(amount * (data.discount / 100));
      OrderService.insertDetail({
        User: user.UserName || '',
        DocumentID: orderId,
        ItemID: data.itemId,
        Quantity: data.qty,
        SoLuongTang: 0,
        UnitPrice: data.price,
        Amount: amount,
        DiscountPercent: data.discount,
        DiscountAmount: discAmt,
        DiemSanPham: 0,
        Notes: 0
      }).then(function (res) {
        var d = res.data || res;
        var record = Array.isArray(d) ? d[0] : (d.records ? d.records[0] : d);
        var msg = record && record.Msg ? record.Msg : '';
        var msgType = record && record.MsgType !== undefined ? record.MsgType : 5;
        if (msgType == 1) { Alert.error(msg || 'Lỗi thêm sản phẩm.'); $saveBtn.prop('disabled', false).text('✓'); return; }
        // Lưu thành công: gán UserAutoID → row trở thành existing
        var newAutoId = (record && record.UserAutoID) || '';
        $('#row_' + rowId).attr('data-auto-id', newAutoId);
        // Đổi nút ✓ (lưu mới) → ✎ (cập nhật) cho row cũ
        $saveBtn
          .removeClass('btn-save-row').addClass('btn-update-row')
          .attr('title', 'Cập nhật').attr('onclick', 'updateProductRow(' + rowId + ')')
          .html('&#x270E;');
        Alert.success(msg || 'Đã thêm sản phẩm!');
      }).catch(function (err) {
        Alert.error(err.message || 'Lỗi thêm sản phẩm.');
        $saveBtn.prop('disabled', false).text('✓');
      });
    }

    function updateProductRow(rowId) {
      var $row = $('#row_' + rowId);
      var autoId = $row.attr('data-auto-id') || '';
      if (!autoId) {
        // API không trả UserAutoID → dùng nút CẬP NHẬT ĐƠN để lưu toàn bộ
        var $mainBtn = $('#btnUpdateOrder');
        $mainBtn.css({ outline: '3px solid var(--color-primary)', transition: 'outline .2s' });
        setTimeout(function () { $mainBtn.css('outline', ''); }, 1500);
        $mainBtn[0] && $mainBtn[0].scrollIntoView({ behavior: 'smooth', block: 'center' });
        Alert.info('Sửa xong → nhấn "CẬP NHẬT ĐƠN" bên dưới để lưu.');
        return;
      }
      var data = calculateRowTotal(rowId);
      if (!data || !data.itemId) { Alert.warning('Vui lòng chọn sản phẩm.'); return; }
      if (!data.qty || data.qty <= 0) { Alert.warning('Số lượng phải > 0.'); return; }
      var $saveBtn = $('#saveBtn_' + rowId);
      $saveBtn.prop('disabled', true).text('…');
      var amount = data.price * data.qty;
      var discAmt = Math.round(amount * (data.discount / 100));
      OrderService.updateDetail({
        OldKeyID: autoId,
        UserAutoID: autoId,
        ItemID: data.itemId,
        Quantity: data.qty,
        SoLuongTang: 0,
        UnitPrice: data.price,
        Amount: amount,
        DiscountPercent: data.discount,
        DiscountAmount: discAmt,
        DiemSanPham: 0,
        Notes: ''
      }).then(function (res) {
        var d = res.data || res;
        var record = Array.isArray(d) ? d[0] : (d.records ? d.records[0] : d);
        var msg = record && record.Msg ? record.Msg : '';
        var msgType = record && record.MsgType !== undefined ? record.MsgType : 5;
        if (msgType == 1) { Alert.error(msg || 'Lỗi cập nhật sản phẩm.'); $saveBtn.prop('disabled', false).html('&#x270E;'); return; }
        $saveBtn.prop('disabled', false).html('&#x270E;').css('background', 'rgba(22,163,74,0.25)');
        setTimeout(function () { $saveBtn.css('background', ''); }, 800);
        Alert.success(msg || 'Đã cập nhật sản phẩm!');
      }).catch(function (err) {
        Alert.error(err.message || 'Lỗi cập nhật sản phẩm.');
        $saveBtn.prop('disabled', false).html('&#x270E;');
      });
    }

    function removeProductRow(rowId) {
      var $row = $('#row_' + rowId);
      var autoId = $row.attr('data-auto-id') || '';
      if (autoId) {
        // Row có UserAutoID → gọi SP xóa trước
        var $btn = $row.find('.btn-remove-row');
        $btn.prop('disabled', true).text('…');
        OrderService.deleteDetail(autoId)
          .then(function () {
            $row.remove();
            updateLiveTotal();
          })
          .catch(function (err) {
            Alert.error(err.message || 'Không thể xóa sản phẩm.');
            $btn.prop('disabled', false).text('✕');
          });
      } else {
        // Row mới chưa lưu → xóa DOM ngay
        $row.remove();
        updateLiveTotal();
      }
    }

    // ── Submit Update ─────────────────────────────────────────────────────────────
    $('#btnUpdateOrder').on('click', function () {
      var v = window._orderForm ? window._orderForm.getValues() : {};
      var productRows = collectProducts();

      if (!v.customer) { Alert.warning('Vui lòng chọn khách hàng.'); return; }
      if (productRows.length === 0) { Alert.warning('Vui lòng thêm ít nhất 1 sản phẩm.'); return; }

      var $btn = $(this);
      $btn.prop('disabled', true).text('Đang cập nhật...');

      var itemList = productRows.map(function (p) {
        var amount = p.price * p.qty;
        var discAmt = Math.round(amount * (p.discount / 100));
        return {
          ItemID: p.itemId,
          Quantity: p.qty,
          SoLuongTang: 0,
          UnitPrice: p.price,
          Amount: amount,
          DiscountPercent: p.discount,
          DiscountAmount: discAmt,
          DiemSanPham: 0,
          Notes: ''
        };
      });

      OrderService.update({
        OldKeyID: orderId,
        BranchID: user.BranchID || '',
        CeoID: user.CeoID || '',
        ManagerID: user.ManagerID || '',
        EmployeeID: user.EmployeeID || '',
        ObjectID: v.customer || '',
        Memo: v.memo || '',
        Notes: v.notes || '',
        ThuDiTuyen: v.route || '',
        ItemList: JSON.stringify(itemList),
        User: user.UserName || ''
      }).then(function (res) {
        var data = res.data || res;
        var record = Array.isArray(data) ? data[0] : (data.records ? data.records[0] : data);
        var msg = record && record.Msg ? record.Msg : '';
        var msgType = record && record.MsgType !== undefined ? record.MsgType : 5;
        if (msgType == 1) { Alert.error(msg || 'Có lỗi xảy ra.'); return; }
        Alert.success(msg || 'Cập nhật đơn hàng thành công!');
        setTimeout(function () {
          navigate('#/order-detail?id=' + encodeURIComponent(orderId));
        }, 1200);
      }).catch(function (err) {
        Alert.error(err.message || 'Có lỗi xảy ra.');
      }).finally(function () {
        $btn.prop('disabled', false).text('CẬP NHẬT ĐƠN');
      });
    });
    // ── Admin Approve ─────────────────────────────────────────────────────────────
    // Hiển thị phần "Cập nhật trạng thái" cho tất cả user để test (hoặc đưa logic phân quyền về backend)
    $('#adminApproveBtnContainer').html(
      '<div style="display:inline-flex; align-items:center; gap:8px; margin-right:8px;">' +
        '<select id="selAdminStatus" style="padding:0 12px; border-radius:var(--radius-md); border:1px solid #d1d5db; font-size:0.9rem; outline:none; background:#fff; font-weight:600; color:#374151; min-width:170px; height: 42px; cursor:pointer;">' +
          '<option value="0">Mới tạo (Lưu nháp)</option>' +
          '<option value="1">Đã Duyệt</option>' +
          '<option value="2">Đang Giao Hàng</option>' + 
          '<option value="10">Hoàn Thành</option>' +
          '<option value="-1">Hủy Đơn</option>' +
          '<option value="-2">Trả Lại Hàng</option>' +
        '</select>' +
        '<button type="button" id="btnApproveOrder" style="padding:0 24px;background:#3b82f6;color:#fff;border:none;border-radius:var(--radius-md);font-size:0.9rem;font-weight:700;letter-spacing:.04em;cursor:pointer;white-space:nowrap; height: 42px; transition: background 0.2s;">CẬP NHẬT TRẠNG THÁI</button>' +
      '</div>'
    ).show();

    $('#btnApproveOrder').on('mouseenter', function() { $(this).css('background', '#2563eb'); })
                         .on('mouseleave', function() { $(this).css('background', '#3b82f6'); });

    $('#btnApproveOrder').on('click', function() {
      var targetStatus = parseInt($('#selAdminStatus').val(), 10);
      var $btn = $(this);
      $btn.prop('disabled', true).text('ĐANG XỬ LÝ...');
      OrderService.update({
        OldKeyID: orderId,
        BranchID: '', CeoID: '', ManagerID: '', EmployeeID: '', ObjectID: '', Memo: '', Notes: '', ThuDiTuyen: '', ItemList: '',
        User: user.UserName || '',
        StatusID: targetStatus
      }).then(function (res) {
        var data = res.data || res;
        var record = Array.isArray(data) ? data[0] : (data.records ? data.records[0] : data);
        var msgType = record && record.MsgType !== undefined ? record.MsgType : 5;
        if (msgType == 1) { 
          Alert.error(record.Msg || 'Lỗi cập nhật trạng thái'); 
          $btn.prop('disabled', false).text('CẬP NHẬT TRẠNG THÁI');
          return; 
        }
        Alert.success('Đã cập nhật trạng thái đơn hàng thành công!');
        
        // Hiển thị nút thành trạng thái Đã lưu
        $btn.css('background', '#10b981').text('ĐÃ LƯU!');
        
        // Khôi phục lại trạng thái nút sau 3s
        setTimeout(function () {
           $btn.prop('disabled', false).css('background', '#3b82f6').text('CẬP NHẬT TRẠNG THÁI');
        }, 3000);
        
      }).catch(function (err) {
        Alert.error(err.message || 'Lỗi hệ thống');
        $btn.prop('disabled', false).text('CẬP TRẠNG THÁI');
      });
    });

    // Bind apply promotion button click
    $(document).on('click', '.btn-apply-promo', function (e) {
      e.preventDefault();
      var rowId = $(this).attr('data-row-id');
      var freeQty = parseInt($(this).attr('data-qty'), 10);
      
      var $pickerContainer = $('#productPickerContainer_' + rowId);
      var itemId = $pickerContainer.attr('data-value');
      var name = $pickerContainer.attr('data-name');
      
      appendProductRow({
        ItemID: itemId,
        ItemName: name + ' (KM)',
        UnitPrice: 0,
        Quantity: freeQty,
        DiscountPercent: 0
      });
      
      $('#promoSuggest_' + rowId).hide().html('');
    });
