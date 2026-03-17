/**
 * Format Utilities — dùng chung cho tất cả các trang
 * Import file này sớm trong trang (sau cash.js)
 */
var Format = {
  /**
   * Format số thành tiền VND
   * @param {number|string} val
   * @returns {string}
   */
  currency: function (val) {
    var n = parseFloat(val) || 0;
    return new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(n);
  },

  /**
   * Format date string yyyy-MM-dd → dd/MM/yyyy
   * @param {string} dateStr
   * @returns {string}
   */
  dateVN: function (dateStr) {
    if (!dateStr) return '';
    var parts = dateStr.split('-');
    return parts[2] + '/' + parts[1] + '/' + parts[0];
  }
};
