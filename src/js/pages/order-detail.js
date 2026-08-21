    function getUrlParam(name) {
      return (window._routeParams || {})[name] || '';
    }

    // Lấy ID từ URL, DocumentID từ localStorage
    var orderId = getUrlParam('id');
    var user = JSON.parse(localStorage.getItem('auth_user') || '{}');
    var documentId = user.DocumentID || '';

    // ORDER-APPROVAL-002/003: nhãn trạng thái LUÔN lấy từ API_OrderStatusList, không hard-code
    // (đúng lỗi P0 đã sửa ở edit-order.js — nhãn cũ từng sai hoàn toàn so với DB thật).
    function loadOrderStatusDictionary() {
      return Http.get(API_CONFIG.ENDPOINTS.FILTER.STATUSES, { q: '{}' }).then(function (res) {
        var data = res && res.data !== undefined ? res.data : res;
        var rows = (data && data.records) || data || [];
        var byId = {};
        rows.forEach(function (r) { byId[String(r.OrderStatusID)] = r.StatusName; });
        return byId;
      }).catch(function () { return {}; });
    }

    function loadApprovalContext() {
      return Http.get(API_CONFIG.ENDPOINTS.ORDERS.APPROVAL_CONTEXT, {
        q: JSON.stringify({ Username: user.UserName || '', DocumentID: orderId })
      }).then(function (res) {
        var data = res && res.data !== undefined ? res.data : res;
        var rows = (data && data.records) || data || [];
        return rows[0] || null;
      }).catch(function () { return null; });
    }

    function newApprovalIdempotencyKey(action) {
      var randomPart = (window.crypto && window.crypto.randomUUID)
        ? window.crypto.randomUUID()
        : Date.now().toString(36) + '-' + Math.random().toString(36).slice(2);
      return 'order-' + action.toLowerCase() + '-' + randomPart;
    }

    function renderApprovalArea(statusNameById) {
      return loadApprovalContext().then(function (ctx) {
        if (!ctx) return;
        var statusLabel = statusNameById[String(ctx.StatusID)] || ctx.StatusName || ('#' + ctx.StatusID);
        $('#order-header').append(
          '<div class="info-row"><span class="info-label">Trạng thái:</span><span class="info-value" id="order-status-badge">' + statusLabel + '</span></div>'
        );
        if (!ctx.CanApprove && !ctx.CanReject) return;

        var $bar = $('<div class="action-bar" id="approval-action-bar"></div>');
        if (ctx.CanApprove) $bar.append('<button class="btn-edit" id="btn-approve-order">Duyệt</button>');
        if (ctx.CanReject) $bar.append('<button class="btn-delete" id="btn-reject-order">Từ chối</button>');
        if ($('.action-bar').length) $bar.insertBefore($('.action-bar').first());
        else $('.app-content').append($bar);

        function runTransition(action, $btn, busyText, confirmText) {
          if (!window.confirm(confirmText)) return;
          $btn.prop('disabled', true).text(busyText);
          Http.post(API_CONFIG.ENDPOINTS.ORDERS.APPROVE_TRANSITION, {
            DocumentID: orderId,
            Action: action,
            ExpectedStatusID: ctx.StatusID
          }, { idempotencyKey: newApprovalIdempotencyKey(action) }).then(function (res) {
            var body = res && res.data !== undefined ? res.data : res;
            var record = Array.isArray(body) ? body[0] : (body && body.records ? body.records[0] : body);
            var msgType = record && record.MsgType !== undefined ? record.MsgType : 5;
            if (msgType == 1) {
              Alert.error((record && record.Msg) || 'Không thể cập nhật trạng thái đơn.');
              $btn.prop('disabled', false).text(action === 'APPROVE' ? 'Duyệt' : 'Từ chối');
              return;
            }
            Alert.success((record && record.Msg) || 'Đã cập nhật trạng thái đơn hàng.');
            $('#approval-action-bar').remove();
            setTimeout(function () { location.reload(); }, 800);
          }).catch(function (err) {
            Alert.error(err.message || 'Có lỗi xảy ra.');
            $btn.prop('disabled', false).text(action === 'APPROVE' ? 'Duyệt' : 'Từ chối');
          });
        }

        $('#btn-approve-order').on('click', function () {
          runTransition('APPROVE', $(this), 'Đang duyệt...', 'Duyệt đơn hàng ' + orderId + '?');
        });
        $('#btn-reject-order').on('click', function () {
          runTransition('REJECT', $(this), 'Đang từ chối...', 'Từ chối đơn hàng ' + orderId + ' để Sale kiểm tra lại?');
        });
      });
    }

    if (!orderId) {
      $('#detail-skeleton').hide();
      $('#detail-content').show().prop('hidden', false);
      $('#order-header').html('<p style="text-align:center;color:var(--color-text-muted);padding:48px 0">Không có mã đơn hàng</p>');
    } else {
      var _statusNameById = {};

      Promise.all([
        OrderService.getDetail(orderId, documentId),
        loadOrderStatusDictionary().then(function (byId) { _statusNameById = byId; })
      ])
        .then(function (results) {
          var res = results[0];
          var data = res.data || res;

          // API trả về nhiều result sets:
          // records / Table: chi tiết sản phẩm
          // Table1: tổng đơn
          // Table2: khách hàng
          var products = data.records || data.Table || [];
          var summary = (data.Table1 && data.Table1[0]) || {};
          var customer = (data.Table2 && data.Table2[0]) || {};

          // Header: thông tin đơn hàng
          var headerInfo = summary.MaDonHang || products[0] && products[0].MaDonHang || orderId;
          var orderDate = summary.NgayDatHang || (products[0] && products[0].NgayDatHang) || '';

          $('#order-header').html(
            '<div class="info-row">' +
            '<span class="info-label">Mã đơn hàng:</span>' +
            '<span class="info-value">' + headerInfo + '</span>' +
            '</div>' +
            '<div class="info-row">' +
            '<span class="info-label">Ngày đặt hàng:</span>' +
            '<span class="info-value">' + orderDate + '</span>' +
            '</div>' +
            (customer.ObjectName ? '<div class="info-row"><span class="info-label">Khách hàng:</span><span class="info-value">' + customer.ObjectName + '</span></div>' : '') +
            (customer.Address ? '<div class="info-row"><span class="info-label">Địa chỉ:</span><span class="info-value">' + customer.Address + '</span></div>' : '') +
            (customer.Phone ? '<div class="info-row"><span class="info-label">Điện thoại:</span><span class="info-value">' + customer.Phone + '</span></div>' : '') +
            (summary.EmployeeName ? '<div class="info-row"><span class="info-label">Nhân viên:</span><span class="info-value">' + summary.EmployeeName + '</span></div>' : '')
          );

          // Danh sách sản phẩm
          if (products.length > 0) {
            $('#product-list').html(
              products.map(function (p) {
                var imgSrc = p.ItemImage ? 'data:image/png;base64,' + p.ItemImage : '';
                return '<div class="product-item">' +
                  (imgSrc ? '<img src="' + imgSrc + '" class="product-img" alt="' + (p.ItemName || '') + '">' : '') +
                  '<div class="product-info">' +
                  '<div class="product-name">' + (p.ItemName || p.ItemID || '') + '</div>' +
                  '<div class="product-detail-row">' +
                  '<span class="product-price">' + Format.currency(p.UnitPrice) + '</span>' +
                  '<span class="product-points">Điểm: ' + (p.DiemTichLuy || p.DiemSanPham || 0) + '</span>' +
                  '</div>' +
                  '<div class="product-detail-row"><span>Số lượng:</span> <span>' + (p.Quantity || 0) + '</span></div>' +
                  '<div class="product-detail-row"><span>Số lượng tặng:</span> <span>' + (p.SoLuongTang || 0) + '</span></div>' +
                  (p.DiscountPercent && parseFloat(p.DiscountPercent) > 0 ? '<div class="product-detail-row"><span>Chiết khấu:</span> <span>' + p.DiscountPercent + '%</span></div>' : '') +
                  '</div>' +
                  '</div>';
              }).join('')
            );
          } else {
            $('#product-list').html('<p style="text-align:center;color:var(--color-text-muted)">Không có sản phẩm</p>');
          }

          // Tổng kết đơn hàng
          var totalAmount = summary.Amount || summary.TotalAmount || 0;
          var totalPayment = summary.TotalAmount || totalAmount;
          var totalDiscount = summary.GiamGia || 0;
          var totalPoints = summary.TongDiem || 0;

          $('#order-summary').html(
            '<div class="summary-card">' +
            '<div class="summary-row">' +
            '<span class="label">Tổng tiền:</span>' +
            '<span class="value">' + Format.currency(totalAmount) + '</span>' +
            '</div>' +
            (parseFloat(totalDiscount) > 0 ? '<div class="summary-row"><span class="label">Giảm giá:</span><span class="value" style="color:#dc2626">-' + Format.currency(totalDiscount) + '</span></div>' : '') +
            '<div class="summary-row">' +
            '<span class="label">Tổng thanh toán:</span>' +
            '<span class="value">' + Format.currency(totalPayment) + '</span>' +
            '</div>' +
            '<div class="summary-row">' +
            '<span class="label">Tổng điểm:</span>' +
            '<span class="value">' + totalPoints + '</span>' +
            '</div>' +
            '</div>'
          );

          renderApprovalArea(_statusNameById);
        })
        .catch(function (err) {
          console.error('Failed to load order detail', err);
          $('#order-header').html('<p style="text-align:center;color:var(--color-text-muted);padding:48px 0">Không tải được chi tiết đơn hàng</p>');
        })
        .finally(function () {
          $('#detail-skeleton').hide();
          $('#detail-content').show().prop('hidden', false);
          // Kết nối nút Sửa
          $('#btn-edit-order').on('click', function () {
            if (orderId) navigate('#/edit-order?id=' + encodeURIComponent(orderId));
          });
          // Kết nối nút Xoá
          $('#btn-delete-order').on('click', function () {
            if (!orderId) return;
            if (!confirm('Bạn có chắc muốn xoá đơn hàng ' + orderId + ' không?')) return;
            var $btn = $(this);
            $btn.prop('disabled', true).text('Đang xoá...');
            OrderService.deleteOrder(orderId)
              .then(function (res) {
                var data = res.data || res;
                var record = Array.isArray(data) ? data[0] : (data.records ? data.records[0] : data);
                var msg = record && record.Msg ? record.Msg : '';
                var msgType = record && record.MsgType !== undefined ? record.MsgType : 5;
                if (msgType == 1) { Alert.error(msg || 'Có lỗi xảy ra.'); $btn.prop('disabled', false).text('Xoá'); return; }
                Alert.success(msg || 'Xoá đơn hàng thành công!');
                setTimeout(function () { navigate('#/order-list'); }, 1200);
              })
              .catch(function (err) {
                Alert.error(err.message || 'Có lỗi xảy ra.');
                $btn.prop('disabled', false).text('Xoá');
              });
          });
        });
    }
