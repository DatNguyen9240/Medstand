    var ICON_MAP = {
      "Quản lý đơn hàng": "📦",
      "Hóa đơn bán hàng": "📄",
      "Phiếu trả hàng": "🔄",
      "Đơn hàng chi tiết": "📋",
      "Doanh số": "💸",
      "Kế hoạch bán hàng": "📅",
      "Kế hoạch": "📅",
      "Hạng mục sản phẩm cảnh báo": "⚠️",
      "Cảnh báo": "⚠️"
    };

    var HREF_MAP = {
      "Quản lý đơn hàng": "#/order-list",
      "Hóa đơn bán hàng": "#/invoice-list",
      "Phiếu trả hàng": "#/return-orders",
      "Đơn hàng chi tiết": "#/order-report",
      "Doanh số": "#/revenue",
      "Kế hoạch bán hàng": "#/sales-plan",
      "Kế hoạch": "#/sales-plan",
      "Hạng mục sản phẩm cảnh báo": "#/product-warning",
      "Cảnh báo": "#/product-warning"
    };

    var user = JSON.parse(localStorage.getItem('auth_user') || '{}');
    var payload = {
      BranchID: user.BranchID || '',
      ManagerID: user.ManagerID || '',
      EmployeeID: user.EmployeeID || '',
      ObjectID: user.ObjectID || '',
      User: user.UserName || user.User || ''
    };

    // ORDER-APPROVAL-003: lối vào danh sách đơn chờ duyệt cho người có quyền duyệt.
    // Username do gateway gắn từ token; trạng thái "chờ duyệt" lấy từ hợp đồng duyệt đơn
    // (PendingStatusIDs), không hard-code trong UI.
    function renderPendingApprovalEntry() {
      return Http.get(API_CONFIG.ENDPOINTS.ORDERS.APPROVAL_CONTEXT, { q: JSON.stringify({}) }, { cache: false })
        .then(function (res) {
          var data = res && res.data !== undefined ? res.data : res;
          var ctx = ((data && data.records) || data || [])[0];
          if (!ctx || ctx.MsgType == 1 || !ctx.HasApprovalRole) return;

          var firstStatus = String(ctx.PendingStatusIDs || '').split(',')[0];
          var href = '#/order-list' + (firstStatus ? '?status=' + encodeURIComponent(firstStatus) : '');
          var count = ctx.PendingCount == null ? '' : ' (' + ctx.PendingCount + ')';
          var hint = ctx.BlockMsg ? '<span class="menu-hint">' + ctx.BlockMsg + '</span>' : '';

          $('#orders-grid').prepend(
            '<a href="' + href + '" class="order-menu-card highlighted">' +
            '<div class="menu-icon">🕒</div>' +
            '<span class="menu-label">Đơn chờ duyệt' + count + '</span>' + hint +
            '</a>'
          );
        })
        .catch(function (err) {
          // Không chặn màn hình chính vì một lối tắt: chỉ ghi log để còn truy được nguyên nhân.
          console.error('[orders] Không đọc được ngữ cảnh duyệt đơn', err);
        });
    }

    OrderService.getThongKeSoLuong(payload)
      .then(function (res) {
        var data = res.data || res;
        var records = data.records || [];

        $('#orders-grid').html(
          records.map(function (item) {
            var hl = item.Highlight === "1" || item.Highlight === 1;
            var icon = ICON_MAP[item.Memo] || "📊";
            var href = HREF_MAP[item.Memo] || "#";
            return '<a href="' + href + '" class="order-menu-card' + (hl ? ' highlighted' : '') + '">' +
              '<div class="menu-icon">' + icon + '</div>' +
              '<span class="menu-label">' + item.Memo + '</span>' +
              '</a>';
          }).join('')
        );
      })
      .catch(function (err) {
        console.error('Failed to load orders data', err);
        $('#orders-grid').html('<p style="text-align:center;color:var(--color-text-muted);padding:48px 0;grid-column:1/-1">Không tải được dữ liệu</p>');
      })
      .finally(function () {
        $('#orders-skeleton').hide();
        $('#orders-grid').show().prop('hidden', false);
        renderPendingApprovalEntry();
      });
