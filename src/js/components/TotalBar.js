/**
 * TotalBar — thanh tổng kết cố định dưới viewport
 * Hiển thị: pagination + từ ngày + đến ngày + tổng tiền
 *
 * Sử dụng:
 *   TotalBar.init({ onPageChange: function(page){} });
 *   TotalBar.show({
 *     fromDate: '01/03/2026',
 *     toDate: '11/03/2026',
 *     totalLabel: 'Tổng doanh thu:',
 *     totalValue: '2.537.342.200 ₫',
 *     currentPage: 1,
 *     totalPages: 5
 *   });
 *   TotalBar.hide();
 */
var TotalBar = (function () {
  var containerId = 'total-bar-container';
  var _onPageChange = null;
  var _state = {};

  function _ensureContainer() {
    var $el = $('#' + containerId);
    if (!$el.length) {
      $('body').append('<div id="' + containerId + '" class="total-bar" style="display:none"></div>');
      $el = $('#' + containerId);
    }
    return $el;
  }

  function _renderPagination(page, total) {
    if (!total || total <= 1) return '';

    var html = '<div class="tb-pagination">';
    html += '<button ' + (page <= 1 ? 'disabled' : '') + ' onclick="TotalBar._goPage(' + (page - 1) + ')">‹</button>';

    var start = Math.max(1, page - 2);
    var end = Math.min(total, page + 2);

    if (start > 1) {
      html += '<button onclick="TotalBar._goPage(1)">1</button>';
      if (start > 2) html += '<span class="page-info">…</span>';
    }
    for (var p = start; p <= end; p++) {
      html += '<button class="' + (p === page ? 'active' : '') + '" onclick="TotalBar._goPage(' + p + ')">' + p + '</button>';
    }
    if (end < total) {
      if (end < total - 1) html += '<span class="page-info">…</span>';
      html += '<button onclick="TotalBar._goPage(' + total + ')">' + total + '</button>';
    }

    html += '<button ' + (page >= total ? 'disabled' : '') + ' onclick="TotalBar._goPage(' + (page + 1) + ')">›</button>';
    html += '<span class="page-info">' + page + '/' + total + '</span>';
    html += '</div>';
    return html;
  }

  function _render() {
    var $el = _ensureContainer();
    var s = _state;
    var html = '';

    // Pagination
    html += _renderPagination(s.currentPage || 1, s.totalPages || 0);

    // Từ ngày / Đến ngày
    if (s.fromDate) {
      html += '<div class="tb-row"><span class="tb-label">Từ ngày:</span><span class="tb-value">' + s.fromDate + '</span></div>';
    }
    if (s.toDate) {
      html += '<div class="tb-row"><span class="tb-label">Đến ngày:</span><span class="tb-value">' + s.toDate + '</span></div>';
    }

    // Tổng tiền
    if (s.totalValue) {
      html += '<div class="tb-row tb-total"><span class="tb-label">' + (s.totalLabel || 'Tổng:') + '</span><span class="tb-value">' + s.totalValue + '</span></div>';
    }

    $el.html(html);
    $el.show();
    $('body').addClass('has-total-bar');
  }

  function init(opts) {
    opts = opts || {};
    _onPageChange = opts.onPageChange || null;
  }

  function show(opts) {
    opts = opts || {};
    _state = Object.assign(_state, opts);
    _render();
  }

  function hide() {
    var $el = $('#' + containerId);
    if ($el.length) {
      $el.hide();
      $('body').removeClass('has-total-bar');
    }
  }

  function update(opts) {
    show(opts);
  }

  function _goPage(p) {
    if (p >= 1 && p <= (_state.totalPages || 1) && p !== _state.currentPage) {
      _state.currentPage = p;
      if (_onPageChange) _onPageChange(p);
    }
  }

  return { init: init, show: show, hide: hide, update: update, _goPage: _goPage };
})();
