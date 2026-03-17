    $('#sidebar-container').html(renderSidebar('orders', ''));
    $('#nav-container').html(renderNavBar('orders', ''));
    $('#theme-toggle-container').html(renderThemeToggle());

    var params = new URLSearchParams(location.search);
    var documentId = params.get('id') || params.get('documentId') || '';
    var activeTab = params.get('tab') || 'overview';

    // Tab switching
    $('.segment-item').on('click', function () {
      var $this = $(this);
      $('.segment-item').removeClass('active');
      $('.tab-content').removeClass('active');
      $this.addClass('active');
      $('#tab-' + $this.attr('data-tab')).addClass('active');
    });

    // Auto-switch tab from URL
    if (activeTab && activeTab !== 'overview') {
      $('.segment-item').removeClass('active');
      $('.tab-content').removeClass('active');
      $('.segment-item[data-tab="' + activeTab + '"]').addClass('active');
      $('#tab-' + activeTab).addClass('active');
    }

    var emptyMsg = '<p style="text-align:center;color:var(--color-text-muted);padding:48px 0">Không có dữ liệu</p>';

    if (!documentId) {
      $('#tab-overview').html('<p style="text-align:center;color:var(--color-text-muted);padding:48px 0">Không có mã đơn hàng</p>');
      $('#tab-detail').html(emptyMsg);
    } else {
      Http.get(API_CONFIG.ENDPOINTS.ORDERS.DETAIL, {
        q: JSON.stringify({ ID: documentId, DocumentID: documentId })
      }).then(function (res) {
        var data = res.data || res;
        var items = data.records || [];       // chi tiết SP
        var summary = data.records2 || [];    // tổng đơn
        var customer = data.records3 || [];   // khách hàng

        // === Tab Tổng quan ===
        var overviewHtml = '';

        // Khách hàng info
        if (customer.length) {
          var c = customer[0];
          overviewHtml += '<div class="summary-card">' +
            '<div class="title">Khách hàng</div>' +
            '<div class="row"><span>Tên</span><span>' + (c.ObjectName || '') + '</span></div>' +
            '<div class="row"><span>Địa chỉ</span><span>' + (c.Address || '') + '</span></div>' +
            '<div class="row"><span>SĐT</span><span>' + (c.Phone || '') + '</span></div>' +
            (c.XaPhuong ? '<div class="row"><span>Xã/Phường</span><span>' + c.XaPhuong + '</span></div>' : '') +
            (c.QuanHuyen ? '<div class="row"><span>Quận/Huyện</span><span>' + c.QuanHuyen + '</span></div>' : '') +
            (c.ThuDiTuyen ? '<div class="row"><span>Tuyến</span><span>' + c.ThuDiTuyen + '</span></div>' : '') +
            '</div>';
        }

        // Tổng đơn hàng
        if (summary.length) {
          var s = summary[0];
          $('#page-title').text('Đơn: ' + (s.MaDonHang || documentId));
          overviewHtml += '<div class="summary-card">' +
            '<div class="title">Tổng quan đơn hàng</div>' +
            '<div class="row"><span>Mã đơn</span><span>' + (s.MaDonHang || '') + '</span></div>' +
            '<div class="row"><span>Ngày đặt</span><span>' + (s.NgayDatHang || '') + '</span></div>' +
            (s.BranchName ? '<div class="row"><span>Chi nhánh</span><span>' + s.BranchName + '</span></div>' : '') +
            (s.EmployeeName ? '<div class="row"><span>Nhân viên</span><span>' + s.EmployeeName + '</span></div>' : '') +
            (s.ManagerName ? '<div class="row"><span>Quản lý</span><span>' + s.ManagerName + '</span></div>' : '') +
            (s.CeoName ? '<div class="row"><span>GĐ</span><span>' + s.CeoName + '</span></div>' : '') +
            '<div class="row"><span>Doanh số</span><span class="amount">' + Format.currency(s.Amount || 0) + '</span></div>' +
            '<div class="row"><span>Giảm giá</span><span>' + Format.currency(s.GiamGia || 0) + '</span></div>' +
            '<div class="row"><span>Thành tiền</span><span class="amount">' + Format.currency(s.TotalAmount || 0) + '</span></div>' +
            (s.TongDiem ? '<div class="row"><span>Điểm tích lũy</span><span class="amount">' + s.TongDiem + '</span></div>' : '') +
            (s.Memo ? '<div class="row"><span>Ghi chú</span><span>' + s.Memo + '</span></div>' : '') +
            (s.Notes ? '<div class="row"><span>Chú thích</span><span>' + s.Notes + '</span></div>' : '') +
            '</div>';
        }

        $('#tab-overview').html(overviewHtml || emptyMsg);

        // === Tab Chi tiết SP ===
        if (!items.length) {
          $('#tab-detail').html('<p style="text-align:center;color:var(--color-text-muted);padding:48px 0">Không có sản phẩm</p>');
        } else {
          var detailHtml = items.map(function (r) {
            return '<div class="report-card">' +
              '<div class="row"><span style="font-weight:600;color:var(--color-primary)">' + (r.ItemName || r.ItemID || '') + '</span></div>' +
              '<div class="row"><span>SL</span><span>' + (r.Quantity || 0) + (r.SoLuongTang ? ' (+' + r.SoLuongTang + ' tặng)' : '') + '</span></div>' +
              '<div class="row"><span>Đơn giá</span><span>' + Format.currency(r.UnitPrice || 0) + '</span></div>' +
              '<div class="row"><span>Doanh số</span><span>' + Format.currency(r.Amount || 0) + '</span></div>' +
              (r.DiscountPercent ? '<div class="row"><span>CK %</span><span>' + r.DiscountPercent + '%</span></div>' : '') +
              (r.GiamGia ? '<div class="row"><span>Giảm giá</span><span>' + Format.currency(r.GiamGia) + '</span></div>' : '') +
              '<div class="row"><span>Thành tiền</span><span class="amount">' + Format.currency(r.TotalAmount || 0) + '</span></div>' +
              (r.DiemSanPham ? '<div class="row"><span>Điểm SP</span><span>' + r.DiemSanPham + '</span></div>' : '') +
              (r.DiemTichLuy ? '<div class="row"><span>Điểm TL</span><span>' + r.DiemTichLuy + '</span></div>' : '') +
              '</div>';
          }).join('');
          $('#tab-detail').html(detailHtml);
        }

      }).catch(function (err) {
        console.error('Order detail error:', err);
        $('#tab-overview').html('<p style="text-align:center;color:var(--color-text-muted);padding:48px 0">Lỗi tải dữ liệu</p>');
        $('#tab-detail').html('<p style="text-align:center;color:var(--color-text-muted);padding:48px 0">Lỗi tải dữ liệu</p>');
      });
    }
