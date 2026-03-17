$('#sidebar-container').html(renderSidebar('orders', ''));

$('#nav-container').html(renderNavBar('orders', ''));

    new SearchBar({
      container: '#search-container',
      placeholder: 'Tìm kế hoạch...',
      onSearch: function (kw) { searchText = kw; loadData(); }
    });

    (function () {
      var searchText = '';
      var now = new Date();
      var y = now.getFullYear(), m = String(now.getMonth() + 1).padStart(2, '0'), d = String(now.getDate()).padStart(2, '0');

      // Set default date inputs to current month
      var $from = $('input[type=date]').eq(0);
      var $to = $('input[type=date]').eq(1);
      $from.val(y + '-' + m + '-01');
      $to.val(y + '-' + m + '-' + d);

      // Reload on date change
      $from.on('change', function () { loadData(); });
      $to.on('change', function () { loadData(); });
      function renderCard(r) {
        var cardLabel = (r.CeoID || '') + (r.CeoName ? ' - ' + r.CeoName : '');
        return '<a href="sales-plan-detail.html?ceoId=' + encodeURIComponent(r.CeoID || '') + '&label=' + encodeURIComponent(cardLabel) + '&ceoLabel=' + encodeURIComponent(cardLabel) + '" style="text-decoration:none;color:var(--color-text-muted)">' +
          '<div class="plan-card">' +
          '<div class="header">' + (r.CeoID || '') + (r.CeoName ? ' - ' + r.CeoName : '') + '</div>' +
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
          '<div class="row"><span>Nhân viên</span><span>' + (r.NhanVien || 0) + '</span></div>' +
          '</div></a>';
      }

      function loadData() {
        var fromDate = $from.val();
        var toDate = $to.val();
        $('#plan-list').prop('hidden', true);
        $('#skeleton').prop('hidden', false);

        Http.get(API_CONFIG.ENDPOINTS.SALES.PLAN, {
          q: JSON.stringify({ FromDate: fromDate, ToDate: toDate, SearchText: searchText })
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
