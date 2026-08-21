    (function () {
      var searchText = '';
      var fromDate, toDate;
      var filterValues = {};
      var LIMIT = 20;
      var statusClass = {
        'Chờ duyệt': 'waiting', 'Đơn nháp': 'draft', 'Đã chuyển xuống kho': 'transferred',
        'Đơn đã xử lý chưa chuyển kho': 'processed', 'Đã xuất hàng': 'transferred',
        'Nhận đơn': 'waiting', 'TDV Kiểm tra lại': 'draft'
      };

      function renderOrder(o) {
        var sc = statusClass[o.StatusName] || 'waiting';
        return '<div class="order-card" onclick="navigate(\'#/order-detail?id=' + encodeURIComponent(o.DocumentID) + '\')" style="cursor:pointer">' +
          '<div class="row main"><span>' + o.DocumentID + '</span><span style="color:var(--color-text-muted)">' + o.DocumentDate + '</span></div>' +
          '<div class="customer">' + (o.ObjectName || '') + '</div>' +
          '<div class="row">Nhân viên: ' + (o.EmployeeName || '') + '</div>' +
          '<div class="row">Trạng thái: <span class="status ' + sc + '">' + (o.StatusName || '') + '</span></div>' +
          (o.Notes ? '<div class="row">Ghi chú: ' + o.Notes + '</div>' : '') +
          '<div class="row"><span>Tổng tiền</span> <span class="amount">' + Format.currency(o.BaseTotal) + '</span></div>' +
          '<div class="row"><span>Điểm tích lũy</span> <span class="points">' + (o.DiemTichLuy || 0) + '</span></div>' +
          '</div>';
      }

      TotalBar.init({ onPageChange: function (page) { loadPage(page); } });

      function loadPage(page) {
        $('#order-list').prop('hidden', true);
        $('#order-skeleton').prop('hidden', false);
        var params = Object.assign({ FromDate: fromDate, ToDate: toDate, SearchText: searchText, page: page, limit: LIMIT }, FilterFields.toApiParams(filterValues));
        OrderService.getList(params)
          .then(function (res) {
            var data = res.data || res;
            var orders = data.records || data || [];
            var totalPages = data.pagetotal || data._pagetotal || 1;
            TotalBar.show({ currentPage: page, totalPages: totalPages, fromDate: Format.dateVN(fromDate), toDate: Format.dateVN(toDate) });
            $('#order-skeleton').prop('hidden', true);
            var $el = $('#order-list');
            $el.prop('hidden', false);
            $el.html(orders.length ? orders.map(renderOrder).join('') : '<p style="text-align:center;color:var(--color-text-muted);padding:48px 0;grid-column:1/-1">Không có đơn hàng</p>');
            window.scrollTo({ top: 0, behavior: 'smooth' });
          })
          .catch(function (err) {
            console.error('Failed to load orders', err);
            $('#order-skeleton').prop('hidden', true);
            $('#order-list').prop('hidden', false).html('<p style="text-align:center;color:var(--color-text-muted);padding:48px 0;grid-column:1/-1">Không tải được dữ liệu</p>');
          });
      }

      // ORDER-APPROVAL-003: lối vào "Đơn chờ duyệt" của Kế toán mở màn này kèm ?status=<id>.
      // Trạng thái nào là "chờ duyệt" do hợp đồng duyệt đơn quyết định (API trả PendingStatusIDs),
      // không hard-code ở đây.
      var routeStatus = String((window._routeParams || {}).status || '').trim();

      function initFilter(routeStatusLabel) {
        var filter = new FilterComponent({
          container: '#filter-container',
          fields: FilterFields.getDefault(),
          onApply: function (values) {
            if (values.dateFrom) fromDate = values.dateFrom;
            if (values.dateTo) toDate = values.dateTo;
            filterValues = values.filters || {};
            loadPage(1);
          },
          onSearch: function (keyword) { searchText = keyword; loadPage(1); }
        });

        // Ghi đè SAU khi khởi tạo: FilterComponent khôi phục bộ lọc đã lưu trong localStorage
        // ngay trong constructor, nên đặt defaultValue trước đó sẽ bị lần lọc trước của người
        // dùng đè mất. Lần onApply đầu tiên chạy trong setTimeout(0) nên vẫn đọc được giá trị này.
        if (routeStatus) {
          filter.values.status = routeStatus;
          if (routeStatusLabel) filter.labels.status = routeStatusLabel;
        }
      }

      if (!routeStatus) {
        initFilter('');
      } else {
        filterValues = { status: routeStatus };
        Http.get(API_CONFIG.ENDPOINTS.FILTER.STATUSES, { q: '{}' })
          .then(function (res) {
            var rows = ((res.data || res).records) || [];
            var match = rows.filter(function (s) {
              return String(s.OrderStatusID || s.StatusID || s.ID || '') === routeStatus;
            })[0];
            initFilter(match ? (match.StatusName || match.Name || '') : '');
          })
          .catch(function () { initFilter(''); });
      }
    })();
