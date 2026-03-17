    $('#sidebar-container').html(renderSidebar('orders', ''));
    $('#nav-container').html(renderNavBar('orders', ''));
    $('#theme-toggle-container').html(renderThemeToggle());

    (function () {
      function getUrlParam(name) {
        return new URLSearchParams(window.location.search).get(name) || '';
      }

      var documentId = getUrlParam('id');
      var searchTimeout = null;

      if (!documentId) {
        $('#detail-skeleton').hide();
        $('#detail-content').prop('hidden', false);
        $('#return-header').html('<p style="text-align:center;color:var(--color-text-muted);padding:48px 0">Không có mã phiếu trả hàng</p>');
        return;
      }

      // Search debounce
      $('#search-input').on('input', function () {
        clearTimeout(searchTimeout);
        var kw = $(this).val().trim();
        searchTimeout = setTimeout(function () { loadDetail(kw); }, 400);
      });

      function renderProduct(p) {
        return '<div class="product-item">' +
          '<div class="product-name">' + (p.ItemName || p.ItemID || '') + '</div>' +
          '<div class="product-code">Mã SP: ' + (p.ItemID || '') + (p.Unit ? ' · ĐVT: ' + p.Unit : '') + '</div>' +
          '<div class="product-detail-row"><span>Đơn giá:</span> <span class="product-price">' + Format.currency(p.UnitPrice) + '</span></div>' +
          '<div class="product-detail-row"><span>Số lượng:</span> <span>' + (p.Quantity || 0) + '</span></div>' +
          '<div class="product-detail-row"><span>Thành tiền:</span> <span>' + Format.currency(p.Amount) + '</span></div>' +
          (parseFloat(p.DiscountPercent) > 0 ? '<div class="product-detail-row"><span>Chiết khấu:</span> <span>' + p.DiscountPercent + '% (' + Format.currency(p.DiscountAmount) + ')</span></div>' : '') +
          '<div class="product-detail-row"><span>Tổng sau CK:</span> <span class="product-price">' + Format.currency(p.TotalAmount) + '</span></div>' +
          (parseInt(p.DiemSanPham) > 0 ? '<div class="product-detail-row"><span>Điểm SP:</span> <span class="product-points">' + p.DiemSanPham + '</span></div>' : '') +
          (parseInt(p.DiemTichLuy) > 0 ? '<div class="product-detail-row"><span>Điểm tích lũy:</span> <span class="product-points">' + p.DiemTichLuy + '</span></div>' : '') +
          '</div>';
      }

      function loadDetail(searchText) {
        searchText = searchText || '';
        $('#detail-content').prop('hidden', true);
        $('#detail-skeleton').show();

        Http.get(API_CONFIG.ENDPOINTS.RETURNS.DETAIL, {
          q: JSON.stringify({ DocumentID: documentId, SearchText: searchText })
        })
          .then(function (res) {
            var data = res.data || res;
            var records = data.records || [];

            // Header info (from first record)
            var first = records[0] || {};
            $('#return-header').html(
              '<div class="info-row">' +
              '  <span class="info-label">Mã phiếu:</span>' +
              '  <span class="info-value">' + (first.DocumentID || documentId) + '</span>' +
              '</div>' +
              '<div class="info-row">' +
              '  <span class="info-label">Ngày:</span>' +
              '  <span class="info-value">' + (first.DocumentDate || '-') + '</span>' +
              '</div>'
            );

            // Product list
            if (records.length > 0) {
              $('#product-list').html(records.map(renderProduct).join(''));
            } else {
              $('#product-list').html('<p style="text-align:center;color:var(--color-text-muted);padding:24px 0">Không có sản phẩm</p>');
            }

            // Summary
            var totalAmount = 0, totalDiscount = 0, totalFinal = 0, totalDiem = 0;
            records.forEach(function (r) {
              totalAmount += parseFloat(r.Amount) || 0;
              totalDiscount += parseFloat(r.DiscountAmount) || 0;
              totalFinal += parseFloat(r.TotalAmount) || 0;
              totalDiem += parseInt(r.DiemTichLuy) || 0;
            });

            $('#return-summary').html(
              '<div class="summary-card">' +
              '  <div class="summary-row"><span class="label">Tổng tiền hàng:</span><span class="value">' + Format.currency(totalAmount) + '</span></div>' +
              (totalDiscount > 0 ? '  <div class="summary-row"><span class="label">Tổng chiết khấu:</span><span class="value" style="color:#dc2626">-' + Format.currency(totalDiscount) + '</span></div>' : '') +
              '  <div class="summary-row"><span class="label">Tổng thanh toán:</span><span class="value">' + Format.currency(totalFinal) + '</span></div>' +
              (totalDiem > 0 ? '  <div class="summary-row"><span class="label">Tổng điểm:</span><span class="value">' + totalDiem + '</span></div>' : '') +
              '  <div class="summary-row"><span class="label">Số sản phẩm:</span><span class="value">' + records.length + '</span></div>' +
              '</div>'
            );
          })
          .catch(function (err) {
            console.error('Failed to load return detail', err);
            $('#return-header').html('<p style="text-align:center;color:var(--color-text-muted);padding:48px 0">Không tải được chi tiết phiếu</p>');
          })
          .finally(function () {
            $('#detail-skeleton').hide();
            $('#detail-content').prop('hidden', false);
          });
      }

      // Load initial
      loadDetail('');
    })();
