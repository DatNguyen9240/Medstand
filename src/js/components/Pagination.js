/**
 * Pagination — phân trang dùng chung
 *
 * Sử dụng:
 *   var pager = new Pagination({
 *     container: '#pagination',   // selector hoặc element
 *     limit: 50,                  // items per page
 *     onPageChange: function(page) { loadData(page); }
 *   });
 *
 *   // Sau khi load data từ API, cập nhật:
 *   pager.update({ currentPage: 1, totalPages: 5 });
 */
function Pagination(opts) {
  this.container = opts.container || '#pagination';
  this.limit = opts.limit;
  this.onPageChange = opts.onPageChange || function () { };
  this.currentPage = 1;
  this.totalPages = 1;

  // Đăng ký global handler
  var self = this;
  window._paginationGoPage = function (p) {
    if (p >= 1 && p <= self.totalPages && p !== self.currentPage) {
      self.currentPage = p;
      self.onPageChange(p);
    }
  };
}

Pagination.prototype.update = function (data) {
  this.currentPage = data.currentPage || 1;
  this.totalPages = data.totalPages || 1;
  this._render();
};

Pagination.prototype._render = function () {
  var $el = $(this.container);
  if (!$el.length) return;

  if (this.totalPages <= 1) {
    $el.html('').hide();
    return;
  }

  var page = this.currentPage;
  var total = this.totalPages;
  var html = '';

  // Prev
  html += '<button ' + (page <= 1 ? 'disabled' : '') + ' onclick="_paginationGoPage(' + (page - 1) + ')">‹</button>';

  // Page numbers
  var start = Math.max(1, page - 2);
  var end = Math.min(total, page + 2);

  if (start > 1) {
    html += '<button onclick="_paginationGoPage(1)">1</button>';
    if (start > 2) html += '<span class="page-info">...</span>';
  }

  for (var p = start; p <= end; p++) {
    html += '<button class="' + (p === page ? 'active' : '') + '" onclick="_paginationGoPage(' + p + ')">' + p + '</button>';
  }

  if (end < total) {
    if (end < total - 1) html += '<span class="page-info">...</span>';
    html += '<button onclick="_paginationGoPage(' + total + ')">' + total + '</button>';
  }

  // Next
  html += '<button ' + (page >= total ? 'disabled' : '') + ' onclick="_paginationGoPage(' + (page + 1) + ')">›</button>';

  // Info
  html += '<span class="page-info">Trang ' + page + '/' + total + '</span>';

  $el.html(html).show().prop('hidden', false);
};
