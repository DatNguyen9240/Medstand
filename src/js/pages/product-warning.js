    $('#sidebar-container').html(renderSidebar('orders', ''));
    $('#nav-container').html(renderNavBar('orders', ''));
    $('#theme-toggle-container').html(renderThemeToggle());

    (function () {
      var LIMIT = 20;
      var searchText = '';
      var fromDate, toDate;

      // Init filter ngay lập tức
      var filter = new FilterComponent({
        container: '#filter-container',
        fields: [
          { key: 'product', label: 'Sản phẩm', options: [] }
        ],
        onApply: function (values) {
          if (values.dateFrom) fromDate = values.dateFrom;
          if (values.dateTo) toDate = values.dateTo;
          loadPage(1);
        },
        onSearch: function (keyword) { searchText = keyword; loadPage(1); }
      });

      // Load filter options async
      Http.get(API_CONFIG.ENDPOINTS.FILTER.PRODUCTS, { q: '{}' }).catch(function () { return {}; })
        .then(function (res) {
          filter.setFieldOptions('product', ((res.data || res).records || []).map(function (p) { return p.ItemName || p.Name || ''; }).filter(Boolean));
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

      var emptyRow5 = '<tr><td colspan="5" style="text-align:center;color:var(--color-text-muted);padding:24px">Không có dữ liệu</td></tr>';

      function loadPage(page) {
        $('#skeleton-out').prop('hidden', false); $('#content-out').prop('hidden', true);
        $('#skeleton-low').prop('hidden', false); $('#content-low').prop('hidden', true);
        $('#skeleton-warn').prop('hidden', false); $('#content-warn').prop('hidden', true);

        var params = { SearchText: searchText, page: page, limit: LIMIT };
        if (fromDate) params.FromDate = fromDate;
        if (toDate) params.ToDate = toDate;

        Http.get(API_CONFIG.ENDPOINTS.PRODUCT_WARNING.LIST, { q: JSON.stringify(params) })
          .then(function (res) {
            var data = res.data || res;
            var totalPages = data.pagetotal || data._pagetotal || 1;

            // Tab 1: Hết hàng (records - SL=0)
            var outItems = data.records || [];
            $('#badge-out').text(data.total || outItems.length);
            $('#skeleton-out').prop('hidden', true);
            $('#content-out').prop('hidden', false);
            $('#out-body').html(outItems.length ? outItems.map(function (r) {
              return '<tr><td>' + r.STT + '</td><td class="item-id">' + r.ItemID + '</td><td>' + r.ItemName + '</td><td>' + r.Unit + '</td><td class="sl-zero">' + r.SL + '</td></tr>';
            }).join('') : emptyRow5);

            // Tab 2: Sắp hết (records2)
            var lowItems = data.records2 || [];
            $('#badge-low').text(data.total2 || lowItems.length);
            $('#skeleton-low').prop('hidden', true);
            $('#content-low').prop('hidden', false);
            $('#low-body').html(lowItems.length ? lowItems.map(function (r) {
              return '<tr><td>' + r.STT + '</td><td class="item-id">' + r.ItemID + '</td><td>' + r.ItemName + '</td><td class="price">' + Format.currency(r.UnitPrice) + '</td><td class="sl-low">' + r.SL + '</td></tr>';
            }).join('') : emptyRow5);

            // Tab 3: Cần chú ý (records3)
            var warnItems = data.records3 || [];
            $('#badge-warn').text(data.total3 || warnItems.length);
            $('#skeleton-warn').prop('hidden', true);
            $('#content-warn').prop('hidden', false);
            $('#warn-body').html(warnItems.length ? warnItems.map(function (r) {
              return '<tr><td>' + r.STT + '</td><td class="item-id">' + r.ItemID + '</td><td>' + r.ItemName + '</td><td class="price">' + Format.currency(r.UnitPrice) + '</td><td class="sl-warn">' + r.SL + '</td></tr>';
            }).join('') : emptyRow5);

            TotalBar.show({ currentPage: page, totalPages: totalPages });
            window.scrollTo({ top: 0, behavior: 'smooth' });
          })
          .catch(function (err) {
            console.error('Failed to load product warnings', err);
            $('#skeleton-out').prop('hidden', true);
            $('#skeleton-low').prop('hidden', true);
            $('#skeleton-warn').prop('hidden', true);
          });
      }

      // loadPage(1) triggered by FilterComponent auto-apply
    })();
