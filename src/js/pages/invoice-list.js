(function () {
  var LIMIT = 20;
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

  var statusClass = {
    'Đã xuất hàng': 'exported',
    'Đơn nháp': 'draft',
    'Chờ duyệt': 'waiting'
  };
  function renderInvoice(i) {
    var sc = statusClass[i.StatusName] || 'exported';
    return '<div class="invoice-card">' +
      '<div class="row main"><span>' + i.DocumentID + '</span><span style="color:var(--color-text-muted)">' + i.DocumentDate + '</span></div>' +
      '<div class="customer">' + (i.ObjectName || '') + '</div>' +
      (i.Address ? '<div class="row" style="font-size:var(--font-size-xs);color:var(--color-text-muted)">' + i.Address + '</div>' : '') +
      '<div class="row">Nhân viên: ' + (i.EmployeeName || '') + '</div>' +
      '<div class="row">Trạng thái: <span class="status ' + sc + '">' + (i.StatusName || '') + '</span></div>' +
      (i.Notes ? '<div class="row">Ghi chú: ' + i.Notes + '</div>' : '') +
      '<div class="row"><span>Tổng tiền</span> <span class="amount">' + Format.currency(i.BaseTotal) + '</span></div>' +
      '</div>';
  }

  var now = new Date();
  if (!fromDate) fromDate = now.getFullYear() + '-' + String(now.getMonth() + 1).padStart(2, '0') + '-01';
  if (!toDate) toDate = now.getFullYear() + '-' + String(now.getMonth() + 1).padStart(2, '0') + '-' + String(now.getDate()).padStart(2, '0');

  TotalBar.init({ onPageChange: function (page) { loadPage(page); } });

  function loadPage(page) {
    $('#invoice-list').prop('hidden', true);
    $('#skeleton').prop('hidden', false);

    var params = Object.assign({ FromDate: fromDate, ToDate: toDate, SearchText: searchText, page: page, limit: LIMIT }, FilterFields.toApiParams(filterValues));
    InvoiceService.getList(params)
      .then(function (res) {
        var data = res.data || res;
        var invoices = data.records || data || [];
        var totalPages = data.pagetotal || data._pagetotal || 1;
        var totalValue = '';
        var records2 = data.records2 || [];
        if (records2.length > 0 && records2[0].TongTien) {
          totalValue = Format.currency(records2[0].TongTien);
        }
        TotalBar.show({ currentPage: page, totalPages: totalPages, fromDate: Format.dateVN(fromDate), toDate: Format.dateVN(toDate), totalLabel: 'Tổng doanh thu:', totalValue: totalValue });
        $('#skeleton').prop('hidden', true);
        var $el = $('#invoice-list');
        $el.prop('hidden', false);
        $el.html(invoices.length ? invoices.map(renderInvoice).join('') : '<p style="text-align:center;color:var(--color-text-muted);padding:48px 0;grid-column:1/-1">Không có hóa đơn</p>');
        window.scrollTo({ top: 0, behavior: 'smooth' });
      })
      .catch(function (err) {
        console.error('Failed to load invoices', err);
        $('#skeleton').prop('hidden', true);
        $('#invoice-list').prop('hidden', false).html('<p style="text-align:center;color:var(--color-text-muted);padding:48px 0;grid-column:1/-1">Không tải được dữ liệu</p>');
      });
  }

  // loadPage(1) triggered by FilterComponent auto-apply
})();
