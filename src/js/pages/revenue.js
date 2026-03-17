    $('#sidebar-container').html(renderSidebar('orders', ''));
    $('#nav-container').html(renderNavBar('orders', ''));
    $('#theme-toggle-container').html(renderThemeToggle());

    (function () {
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

      // Tab switching
      $('.segment-item').on('click', function () {
        var $this = $(this);
        $('.segment-item').removeClass('active');
        $('.tab-content').removeClass('active');
        $this.addClass('active');
        $('#tab-' + $this.data('tab')).addClass('active');
      });

      var LIMIT = 20;
      var now = new Date();
      if (!fromDate) fromDate = now.getFullYear() + '-' + String(now.getMonth() + 1).padStart(2, '0') + '-01';
      if (!toDate) toDate = now.getFullYear() + '-' + String(now.getMonth() + 1).padStart(2, '0') + '-' + String(now.getDate()).padStart(2, '0');

      TotalBar.init({ onPageChange: function (page) { loadPage(page); } });

      function loadPage(page) {
        $('#skeleton-emp').prop('hidden', false);
        $('#content-employee').prop('hidden', true);
        $('#skeleton-cust').prop('hidden', false);
        $('#content-customer').prop('hidden', true);
        var params = Object.assign({ FromDate: fromDate, ToDate: toDate, SearchText: searchText, page: page, limit: LIMIT }, FilterFields.toApiParams(filterValues));
        SalesService.getDoanhSo(params)
          .then(function (res) {
            var data = res.data || res;
            var totalPages = data.pagetotal || data._pagetotal || 1;
            var byEmp = data.records || [];
            $('#skeleton-emp').prop('hidden', true);
            $('#content-employee').prop('hidden', false);
            $('#emp-body').html(byEmp.map(function (r) {
              return '<tr onclick="window.location.href=\'order-list.html\'">' + '<td>' + r.STT + '</td><td>' + r.EmployeeName + '</td><td style="color:var(--color-primary);font-weight:600">' + Format.currency(r.DoanhSo) + '</td></tr>';
            }).join('') || '<tr><td colspan="3" style="text-align:center;color:var(--color-text-muted);padding:24px">Không có dữ liệu</td></tr>');
            var byCust = data.records2 || [];
            $('#skeleton-cust').prop('hidden', true);
            $('#content-customer').prop('hidden', false);
            $('#cust-body').html(byCust.map(function (r) {
              return '<tr onclick="window.location.href=\'order-list.html\'">' + '<td>' + r.STT + '</td><td>' + r.ObjectName + '</td><td>' + (r.DocumentDate || '') + '</td><td style="color:var(--color-primary);font-weight:600">' + Format.currency(r.DoanhSo) + '</td></tr>';
            }).join('') || '<tr><td colspan="4" style="text-align:center;color:var(--color-text-muted);padding:24px">Không có dữ liệu</td></tr>');
            var totalValue = '';
            var records3 = data.records3 || [];
            if (records3.length > 0 && records3[0].TongTien) totalValue = Format.currency(records3[0].TongTien);
            TotalBar.show({ currentPage: page, totalPages: totalPages, fromDate: Format.dateVN(fromDate), toDate: Format.dateVN(toDate), totalLabel: 'Tổng doanh số:', totalValue: totalValue });
            window.scrollTo({ top: 0, behavior: 'smooth' });
          })
          .catch(function (err) {
            console.error('Failed to load revenue', err);
            $('#skeleton-emp').prop('hidden', true);
            $('#skeleton-cust').prop('hidden', true);
          });
      }

      // loadPage(1) triggered by FilterComponent auto-apply
    })();
