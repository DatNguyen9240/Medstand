    $('#sidebar-container').html(renderSidebar('orders', ''));
    $('#nav-container').html(renderNavBar('orders', ''));
    $('#theme-toggle-container').html(renderThemeToggle());

    (function () {
      var LIMIT = 20;
      function renderReturn(r) {
        return '<div class="return-card" onclick="window.location.href=\'return-order-detail.html?id=' + encodeURIComponent(r.DocumentID) + '\'" style="cursor:pointer">' +
          '<div class="row main"><span>' + r.DocumentID + '</span><span style="color:var(--color-text-muted)">' + r.DocumentDate + '</span></div>' +
          '<div class="customer">' + (r.ObjectName || '') + '</div>' +
          (r.LyDoTraHang ? '<div class="reason">Lý do: ' + r.LyDoTraHang + '</div>' : '') +
          (r.EmployeeName ? '<div class="row">Nhân viên: ' + r.EmployeeName + '</div>' : '') +
          (r.ManagerName ? '<div class="row">Quản lý: ' + r.ManagerName + '</div>' : '') +
          (r.CeoName ? '<div class="row">CEO: ' + r.CeoName + '</div>' : '') +
          '<div class="row"><span>Tổng tiền</span> <span class="amount">' + Format.currency(r.BaseTotal) + '</span></div>' +
          '</div>';
      }

      var searchText = '';
      var fromDate, toDate;
      var filterValues = {};

      // Init filter
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




      TotalBar.init({ onPageChange: function (page) { loadPage(page); } });

      function loadPage(page) {
        $('#return-list').prop('hidden', true);
        $('#skeleton').prop('hidden', false);
        var params = Object.assign({ FromDate: fromDate, ToDate: toDate, SearchText: searchText, page: page, limit: LIMIT }, FilterFields.toApiParams(filterValues));
        ReturnService.getList(params)
          .then(function (res) {
            var data = res.data || res;
            var returns = data.records || data || [];
            var totalPages = data.pagetotal || data._pagetotal || 1;
            var totalCount = data.total || data._recordtotal || returns.length;
            $('#return-count').html('Sl trả lại: <strong style="color:var(--color-text)">' + totalCount + '</strong>').prop('hidden', false);
            TotalBar.show({ currentPage: page, totalPages: totalPages, fromDate: Format.dateVN(fromDate), toDate: Format.dateVN(toDate) });
            $('#skeleton').prop('hidden', true);
            var $el = $('#return-list');
            $el.prop('hidden', false);
            $el.html(returns.length ? returns.map(renderReturn).join('') : '<p style="text-align:center;color:var(--color-text-muted);padding:48px 0">Không có phiếu trả hàng</p>');
            window.scrollTo({ top: 0, behavior: 'smooth' });
          })
          .catch(function (err) {
            console.error('Failed to load returns', err);
            $('#skeleton').prop('hidden', true);
            $('#return-list').prop('hidden', false).html('<p style="text-align:center;color:var(--color-text-muted);padding:48px 0">Không tải được dữ liệu</p>');
          });
      }

      // loadPage(1) triggered by FilterComponent auto-apply
    })();
