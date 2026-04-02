/**
 * Alert — wrapper SweetAlert2 dùng chung toàn app
 * Tự động load SweetAlert2 CDN, không cần thêm script tag.
 *
 * Cách dùng:
 *   Alert.success('Tạo đơn thành công!')
 *   Alert.error('Không thể tải dữ liệu')
 *   Alert.warning('Vui lòng điền đủ các trường bắt buộc')
 *   Alert.info('Chức năng đang phát triển')
 *   Alert.confirm('Bạn có chắc muốn xóa?').then(ok => { if (ok) ... })
 */
const Alert = (() => {
  const PRIMARY = '#3c50e0';
  const CDN_URL = 'https://cdn.jsdelivr.net/npm/sweetalert2@11';

  /** Load SweetAlert2 1 lần duy nhất */
  let _loadPromise = null;
  function _ensureLoaded() {
    if (window.Swal) return Promise.resolve();
    if (_loadPromise) return _loadPromise;
    _loadPromise = new Promise(function (resolve, reject) {
      var s = document.createElement('script');
      s.src = CDN_URL;
      s.onload = resolve;
      s.onerror = function () { reject(new Error('Failed to load SweetAlert2')); };
      document.head.appendChild(s);
    });
    return _loadPromise;
  }

  function _fire(icon, title, text, opts) {
    const isMobile = window.innerWidth < 768;
    
    var baseConfig = {
      icon: icon,
      title: title,
      text: text,
      confirmButtonColor: PRIMARY,
      timer: 2000,
      timerProgressBar: true,
      showClass: { popup: '' }, // Tắt hiệu ứng nhảy/rung khi hiện
      hideClass: { popup: '' }, // Tắt hiệu ứng khi đóng
    };

    if (isMobile) {
      // Trên mobile: Hiện Toast ở trên đầu cho gọn
      Object.assign(baseConfig, {
        toast: true,
        position: 'top',
        showConfirmButton: false,
      });
    }

    return _ensureLoaded().then(function () {
      return Swal.fire(Object.assign(baseConfig, opts || {}));
    });
  }

  /** Thông báo thành công */
  function success(text, title) {
    return _fire('success', title || 'Thành công', text);
  }

  /** Thông báo lỗi */
  function error(text, title) {
    return _fire('error', title || 'Lỗi', text);
  }

  /** Cảnh báo */
  function warning(text, title) {
    return _fire('warning', title || 'Cảnh báo', text);
  }

  /** Thông tin */
  function info(text, title) {
    return _fire('info', title || 'Thông báo', text);
  }

  /**
   * Xác nhận hành động (có nút Hủy)
   * @returns {Promise<boolean>} true nếu user bấm Confirm
   */
  function confirm(text, title) {
    return _ensureLoaded().then(function () {
      return Swal.fire({
        icon: 'question',
        title: title || 'Xác nhận',
        text: text,
        showCancelButton: true,
        confirmButtonColor: PRIMARY,
        cancelButtonColor: '#6b7280',
        confirmButtonText: 'Đồng ý',
        cancelButtonText: 'Hủy',
      }).then(function (result) {
        return result.isConfirmed;
      });
    });
  }

  // Pre-load ngay khi script được include (không block)
  _ensureLoaded();

  return { success, error, warning, info, confirm };
})();
