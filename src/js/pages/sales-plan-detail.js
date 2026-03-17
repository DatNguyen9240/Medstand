    $('#sidebar-container').html(renderSidebar('orders', ''));
    $('#nav-container').html(renderNavBar('orders', ''));

    (function () {
      function getParam(name) {
        return new URLSearchParams(window.location.search).get(name) || '';
      }

      // Drill-down params from URL
      var ceoId = getParam('ceoId');
      var managerId = getParam('managerId');
      var employeeId = getParam('employeeId');
      var label = decodeURIComponent(getParam('label') || '');
      var searchText = '';

      // Determine current level
      // Level: ceo (from sales-plan, shows managers), manager (shows employees), employee (shows single)
      var level = 'ceo';
      if (employeeId) level = 'employee';
      else if (managerId) level = 'manager';
      else if (ceoId) level = 'ceo';

      // Page title
      var titleText = label || 'Chi tiết kế hoạch';
      $('#page-title').text(titleText);

      // Breadcrumb
      function buildBreadcrumb() {
        var crumbs = '<a href="sales-plan.html">Kế hoạch bán hàng</a>';
        if (ceoId) {
          var ceoLabel = decodeURIComponent(getParam('ceoLabel') || ceoId);
          if (managerId || employeeId) {
            crumbs += ' <span class="sep">›</span> <a href="sales-plan-detail.html?ceoId=' + encodeURIComponent(ceoId) + '&label=' + encodeURIComponent(ceoLabel) + '&ceoLabel=' + encodeURIComponent(ceoLabel) + '">' + ceoLabel + '</a>';
          } else {
            crumbs += ' <span class="sep">›</span> <span>' + ceoLabel + '</span>';
          }
        }
        if (managerId) {
          var mgrLabel = decodeURIComponent(getParam('mgrLabel') || managerId);
          if (employeeId) {
            crumbs += ' <span class="sep">›</span> <a href="sales-plan-detail.html?ceoId=' + encodeURIComponent(ceoId) + '&managerId=' + encodeURIComponent(managerId) + '&label=' + encodeURIComponent(mgrLabel) + '&ceoLabel=' + encodeURIComponent(getParam('ceoLabel') || ceoId) + '&mgrLabel=' + encodeURIComponent(mgrLabel) + '">' + mgrLabel + '</a>';
          } else {
            crumbs += ' <span class="sep">›</span> <span>' + mgrLabel + '</span>';
          }
        }
        if (employeeId) {
          crumbs += ' <span class="sep">›</span> <span>' + label + '</span>';
        }
        $('#breadcrumb').html(crumbs);
      }
      buildBreadcrumb();

      // Level label
      var levelLabels = {
        'ceo': 'Theo quản lý',
        'manager': 'Theo nhân viên',
        'employee': 'Chi tiết nhân viên'
      };
      $('#level-label').text(levelLabels[level] || '');

      // Back button logic
      if (employeeId) {
        $('#back-btn').attr('href', 'sales-plan-detail.html?ceoId=' + encodeURIComponent(ceoId) + '&managerId=' + encodeURIComponent(managerId) + '&label=' + encodeURIComponent(getParam('mgrLabel') || managerId) + '&ceoLabel=' + encodeURIComponent(getParam('ceoLabel') || ceoId) + '&mgrLabel=' + encodeURIComponent(getParam('mgrLabel') || managerId));
      } else if (managerId) {
        $('#back-btn').attr('href', 'sales-plan-detail.html?ceoId=' + encodeURIComponent(ceoId) + '&label=' + encodeURIComponent(getParam('ceoLabel') || ceoId) + '&ceoLabel=' + encodeURIComponent(getParam('ceoLabel') || ceoId));
      } else {
        $('#back-btn').attr('href', 'sales-plan.html');
      }

      // Date defaults
      var now = new Date();
      var y = now.getFullYear(), m = String(now.getMonth() + 1).padStart(2, '0'), d = String(now.getDate()).padStart(2, '0');
      $('#from-date').val(y + '-' + m + '-01');
      $('#to-date').val(y + '-' + m + '-' + d);
      $('#from-date').on('change', function () { loadData(); });
      $('#to-date').on('change', function () { loadData(); });

      new SearchBar({
        container: '#search-container',
        placeholder: 'Tìm kiếm...',
        onSearch: function (kw) { searchText = kw; loadData(); }
      });
      function renderCard(r) {
        var id = r.ManagerID || r.EmployeeID || r.CeoID || '';
        var name = r.ManagerName || r.EmployeeName || r.CeoName || '';

        return '<div class="plan-card no-drill">' +
          '<div class="header">' + (id || '') + (name ? ' - ' + name : '') + '</div>' +
          '<div class="row"><span>Doanh số thực hiện</span><span>' + Format.currency(r.DoanhSoThucHien) + '</span></div>' +
          '<div class="row"><span>Doanh số kế hoạch</span><span>' + Format.currency(r.DoanhSoKeHoach) + '</span></div>' +
          '<div class="row"><span>% Thực hiện DS</span><span>' + (r.PhanTramThucHienDS || '0') + '%</span></div>' +
          '<div class="row"><span>Độ phủ KH</span><span>' + (r.DoPhuKhachHang || 0) + '</span></div>' +
          '<div class="row"><span>Độ phủ KH thực hiện</span><span>' + (r.DoPhuKHThucHien || 0) + '</span></div>' +
          '<div class="row"><span>% Độ phủ KH</span><span>' + (r.PhanTramDoPhuKH || '0') + '%</span></div>' +
          '<div class="row"><span>SL KH hợp đồng</span><span>' + (r.SLKhachHopDong || 0) + '</span></div>' +
          '<div class="row"><span>SL KHHD phát sinh DS</span><span>' + (r.SLKhachHopDongPS || 0) + '</span></div>' +
          '<div class="row"><span>% Thực hiện KHHD</span><span>' + (r.PhanTramThucHienKHHD || '0') + '%</span></div>' +
          '<div class="row"><span>SL KH mở mới</span><span>' + (r.SLKhachMoMoi || 0) + '</span></div>' +
          '</div>';
      }

      function loadData() {
        var fromDate = $('#from-date').val();
        var toDate = $('#to-date').val();
        $('#plan-list').prop('hidden', true);
        $('#skeleton').prop('hidden', false);

        Http.get(API_CONFIG.ENDPOINTS.SALES.PLAN, {
          q: JSON.stringify({
            FromDate: fromDate,
            ToDate: toDate,
            CeoID: ceoId,
            ManagerID: managerId,
            EmployeeID: employeeId,
            SearchText: searchText
          })
        })
          .then(function (res) {
            var data = res.data || res;
            var records = data.records || [];
            $('#skeleton').prop('hidden', true);
            $('#plan-list').prop('hidden', false);
            $('#plan-list').html(records.length
              ? records.map(renderCard).join('')
              : '<p style="text-align:center;color:var(--color-text-muted);padding:48px 0">Không có dữ liệu</p>');
          })
          .catch(function () {
            $('#skeleton').prop('hidden', true);
            $('#plan-list').prop('hidden', false).html('<p style="text-align:center;color:var(--color-text-muted);padding:48px 0">Không tải được dữ liệu</p>');
          });
      }

      loadData();
    })();
