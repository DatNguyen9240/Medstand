(function () {
  var warningRows = [];

  function escapeHtml(value) {
    return String(value == null ? '' : value)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }
  function recordsOf(response) {
    var body = response && response.data !== undefined ? response.data : response;
    return (body && body.records) || body || [];
  }
  function formatNumber(value) { return new Intl.NumberFormat('vi-VN').format(Number(value || 0)); }
  function formatMoney(value) { return formatNumber(value) + ' đ'; }
  function formatDate(value) {
    if (!value) return '—';
    var match = String(value).match(/^(\d{4})-(\d{2})-(\d{2})/);
    return match ? match[3] + '/' + match[2] + '/' + match[1] : String(value);
  }
  function setMessage(message, error) {
    $('#contract-message').text(message || '').toggleClass('is-error', !!error);
  }
  function filters() {
    return {
      ContractYear: Number($('#contract-year').val() || 2026),
      AsOfDate: $('#contract-as-of').val()
    };
  }

  function renderStats(rows) {
    var error = rows[0] && Number(rows[0].MsgType) === 1 ? rows[0] : null;
    if (error) throw new Error(error.Msg || 'Không thể tải thống kê hợp đồng.');
    var total = rows.find(function (row) { return row.ScopeLevel === 'TOTAL'; }) || {};
    var sales = rows.filter(function (row) { return row.ScopeLevel === 'SALE'; });
    $('#contract-total').text(formatNumber(total.ContractCustomerCount));
    $('#contract-active').text(formatNumber(total.ActiveContractCustomerCount));
    $('#contract-no-sales').text(formatNumber(total.NoSales3MonthsCount));
    $('#contract-revenue').text(formatMoney(total.RevenueLast3Months));
    $('#contract-period').text('Kỳ doanh số: ' + formatDate(total.RevenuePeriodStart) + ' đến ' + formatDate(total.RevenuePeriodEnd));
    $('#contract-stats-body').html(sales.length ? sales.map(function (row) {
      return '<tr><td>' + escapeHtml(row.ManagerName || row.ManagerID || 'Chưa phân QLBH') + '</td>' +
        '<td>' + escapeHtml(row.EmployeeName || row.EmployeeID || 'Chưa phân Sale') + '</td>' +
        '<td>' + formatNumber(row.ContractCustomerCount) + '</td>' +
        '<td>' + formatNumber(row.ActiveContractCustomerCount) + '</td>' +
        '<td>' + formatNumber(row.NoSales3MonthsCount) + '</td>' +
        '<td>' + formatMoney(row.RevenueLast3Months) + '</td></tr>';
    }).join('') : '<tr><td colspan="6">Không có dữ liệu trong phạm vi tài khoản.</td></tr>');
  }

  function renderWarnings() {
    var term = String($('#contract-warning-search').val() || '').toLowerCase().trim();
    var rows = warningRows.filter(function (row) {
      return !term || [row.CanonicalObjectID, row.ObjectID, row.ObjectName, row.EmployeeName, row.ManagerName]
        .some(function (value) { return String(value || '').toLowerCase().includes(term); });
    });
    $('#contract-warning-list').html(rows.length ? rows.map(function (row) {
      return '<article class="contract-warning-item"><div><strong>' + escapeHtml(row.ObjectName) + '</strong>' +
        '<small>' + escapeHtml(row.CanonicalObjectID || row.ObjectID) + ' · ' + escapeHtml(row.BranchID || '') + '</small></div>' +
        '<div><span>' + escapeHtml(row.EmployeeName || 'Chưa phân Sale') + '</span><small>QLBH: ' + escapeHtml(row.ManagerName || 'Chưa phân') + '</small></div>' +
        '<div class="days">' + formatNumber(row.DaysSinceRevenueOrJoin) + ' ngày<br><small>Lần DS: ' + formatDate(row.LastRevenueDate) + '</small></div></article>';
    }).join('') : '<p>Không có khách cần cảnh báo trong phạm vi hiện tại.</p>');
  }

  function load() {
    var q = filters();
    setMessage('Đang đối chiếu nguồn hợp đồng...', false);
    $('#contract-refresh').prop('disabled', true);
    Promise.all([
      Http.get(API_CONFIG.ENDPOINTS.CONTRACT_ANALYTICS.STATS, { q: JSON.stringify(q) }, { cache: false }),
      Http.get(API_CONFIG.ENDPOINTS.CONTRACT_ANALYTICS.NO_SALES, { q: JSON.stringify(Object.assign({ TopN: 500 }, q)) }, { cache: false })
    ]).then(function (responses) {
      var stats = recordsOf(responses[0]);
      var warnings = recordsOf(responses[1]);
      if (warnings[0] && Number(warnings[0].MsgType) === 1) throw new Error(warnings[0].Msg);
      renderStats(stats);
      warningRows = warnings;
      renderWarnings();
      setMessage('Số liệu được gom theo Code chính và giới hạn theo phạm vi Sale/QLBH của tài khoản.', false);
    }).catch(function (error) {
      setMessage(error.message || 'Không thể tải báo cáo hợp đồng.', true);
      $('#contract-stats-body').html('<tr><td colspan="6">Không thể tải dữ liệu.</td></tr>');
      warningRows = [];
      renderWarnings();
    }).finally(function () { $('#contract-refresh').prop('disabled', false); });
  }

  $('#contract-as-of').val(new Date().toISOString().slice(0, 10));
  $('#contract-refresh').on('click', load);
  $('#contract-warning-search').on('input', renderWarnings);
  load();
})();
