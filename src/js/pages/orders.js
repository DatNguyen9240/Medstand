    $('#sidebar-container').html(renderSidebar('orders', ''));
    $('#nav-container').html(renderNavBar('orders', ''));
    $('#theme-toggle-container').html(renderThemeToggle());

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
      "Quản lý đơn hàng": "order-list.html",
      "Hóa đơn bán hàng": "invoice-list.html",
      "Phiếu trả hàng": "return-orders.html",
      "Đơn hàng chi tiết": "order-report.html",
      "Doanh số": "revenue.html",
      "Kế hoạch bán hàng": "sales-plan.html",
      "Kế hoạch": "sales-plan.html",
      "Hạng mục sản phẩm cảnh báo": "product-warning.html",
      "Cảnh báo": "product-warning.html"
    };

    var user = JSON.parse(localStorage.getItem('auth_user') || '{}');
    var payload = {
      BranchID: user.BranchID || '',
      ManagerID: user.ManagerID || '',
      EmployeeID: user.EmployeeID || '',
      ObjectID: user.ObjectID || '',
      User: user.UserName || user.User || ''
    };

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
        $('#orders-grid').html('<p style="text-align:center;color:var(--color-text-muted);padding:48px 0">Không tải được dữ liệu</p>');
      })
      .finally(function () {
        $('#orders-skeleton').hide();
        $('#orders-grid').show().prop('hidden', false);
      });
