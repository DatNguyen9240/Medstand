    (function () {
      var LIMIT = 20;
      var dateFrom = '';
      var dateTo = '';
      var searchText = '';
      var _filterValues = {};
      var _loadSeq = 0; // Chặn kết quả trả về chậm của lần gọi cũ đè lên kết quả mới hơn

      var user = JSON.parse(localStorage.getItem('auth_user') || '{}');

      // Init filter
      new FilterComponent({
        container: '#filter-container',
        fields: [
          {
            key: 'branch', label: 'Chi nhánh',
            locked: true,
            defaultValue: user.BranchID || '',
            defaultLabel: user.BranchName || user.BranchID || ''
          },
          {
            key: 'employee', label: 'Mã nhân viên',
            locked: true,
            defaultValue: user.EmployeeID || '',
            defaultLabel: (user.EmployeeID ? '- ' : '') + (user.DisplayName || user.EmployeeName || user.UserName || '')
          },
          {
            key: 'customer', label: 'Khách hàng',
            options: [],
            loadOptions: function (done) {
              Http.get(API_CONFIG.ENDPOINTS.FILTER.CUSTOMERS, {
                q: JSON.stringify({
                  User: user.UserName || '', ManagerID: '', EmployeeID: '',
                  ObjectID: '', LoaiKhachHang: '', KenhBan: '', SearchText: '',
                  SYSManagerID: user.ManagerID || '', SYSEmployeeID: user.EmployeeID || ''
                })
              }).then(function (res) {
                var records = (res.data || res).records || res.data || res || [];
                done(records.map(function (r) { return { value: r.ObjectID || '', label: r.DisplayName || r.ObjectName || '' }; }));
              }).catch(function () { done([]); });
            }
          }
        ],
        onApply: function (result) {
          dateFrom = result.dateFrom || '';
          dateTo = result.dateTo || '';
          _filterValues = result.filters || {};
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

      TotalBar.init({ onPageChange: function (page) { loadPage(page); } });

      var emptyMsg = '<p style="text-align:center;color:var(--color-text-muted);padding:48px 0">Không có dữ liệu</p>';

      function renderContract(c) {
        return '<div class="contract-card" style="cursor:pointer" onclick="navigate(\'#/order-report?objectId=' + encodeURIComponent(c.ObjectID || '') + '&tab=detail\')">' +
          '<div class="name">' + (c.ObjectName || '-') + '</div>' +
          (c.Phone ? '<div class="row"><span>SĐT</span><span>' + c.Phone + '</span></div>' : '') +
          (c.SoHopDong ? '<div class="row"><span>Số HĐ</span><span>' + c.SoHopDong + '</span></div>' : '') +
          (c.NgayThamGia ? '<div class="row"><span>Ngày tham gia</span><span>' + c.NgayThamGia + '</span></div>' : '') +
          (c.NgayHetHan ? '<div class="row"><span>Ngày hết hạn</span><span>' + c.NgayHetHan + '</span></div>' : '') +
          (c.NgayNhanHopDong ? '<div class="row"><span>Ngày nhận HĐ</span><span>' + c.NgayNhanHopDong + '</span></div>' : '') +
          '<div class="row"><span>Điểm tích lũy</span><span class="points">' + (c.DiemTichLuy || 0) + '</span></div>' +
          (c.DiemTra ? '<div class="row"><span>Điểm trả</span><span>' + c.DiemTra + '</span></div>' : '') +
          '<div class="row"><span>Điểm còn lại</span><span class="points">' + (c.DiemConLai || 0) + '</span></div>' +
          '</div>';
      }

      function renderDetail(r) {
        return '<tr>' +
          '<td>' + (r.DocumentDate || '') + '</td>' +
          '<td>' + (r.ItemName || '') + '</td>' +
          '<td>' + (r.Quantity || 0) + '</td>' +
          '<td>' + (r.DiemSanPham || 0) + '</td>' +
          '<td class="amount">' + (r.DiemTichLuy || 0) + '</td>' +
          '<td class="amount">' + Format.currency(r.TotalAmount) + '</td>' +
          '</tr>';
      }

      function loadPage(page) {
        $('#report-list').prop('hidden', true);
        $('#skeleton-report').prop('hidden', false);
        $('#detail-content').prop('hidden', true);
        $('#skeleton-detail').prop('hidden', false);

        var requestSeq = ++_loadSeq;
        Http.get(API_CONFIG.ENDPOINTS.CONTRACT_POINT.LIST, {
          q: JSON.stringify({
            FromDate: dateFrom,
            ToDate: dateTo,
            BranchID: user.BranchID || '',
            ManagerID: user.ManagerID || '',
            EmployeeID: user.EmployeeID || '',
            ObjectID: _filterValues.customer || '',
            SearchText: searchText,
            User: user.UserName || '',
            page: page,
            limit: LIMIT
          })
        })
          .then(function (res) {
            if (requestSeq !== _loadSeq) return; // Có lần gọi mới hơn đã thay thế, bỏ kết quả cũ này
            var data = res.data || res;
            var totalPages = data.pagetotal || data._pagetotal || 1;

            // Tab 1: Báo cáo tích điểm (records)
            var contracts = data.records || [];
            $('#skeleton-report').prop('hidden', true);
            var $list = $('#report-list');
            $list.prop('hidden', false);
            $list.html(contracts.length ? contracts.map(renderContract).join('') : emptyMsg);

            // Tab 2: Chi tiết (records2)
            var details = data.records2 || [];
            $('#skeleton-detail').prop('hidden', true);
            $('#detail-content').prop('hidden', false);
            $('#detail-body').html(details.length ? details.map(renderDetail).join('') : '<tr><td colspan="6" style="text-align:center;color:var(--color-text-muted);padding:24px">Không có dữ liệu</td></tr>');

            TotalBar.show({ currentPage: page, totalPages: totalPages });
            window.scrollTo({ top: 0, behavior: 'smooth' });
          })
          .catch(function (err) {
            if (requestSeq !== _loadSeq) return;
            console.error('Failed to load contract points', err);
            $('#skeleton-report').prop('hidden', true);
            $('#skeleton-detail').prop('hidden', true);
            $('#report-list').prop('hidden', false).html(emptyMsg);
          });
      }

      // loadPage(1) triggered by FilterComponent auto-apply
    })();
