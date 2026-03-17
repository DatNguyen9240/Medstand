/**
 * ConfirmModal – modal xác nhận dùng chung
 *
 * Cách dùng:
 *   ConfirmModal.show({
 *     title: 'Xác nhận',           // tiêu đề (mặc định: 'Xác nhận')
 *     message: 'Bạn có chắc?',     // nội dung
 *     icon: '❓',                   // icon (mặc định: '❓')
 *     okText: 'Đồng ý',            // text nút OK (mặc định: 'Đồng ý')
 *     cancelText: 'Hủy',           // text nút hủy (mặc định: 'Hủy')
 *     danger: false,                // true → nút OK màu đỏ
 *     onOk: function() {},          // callback khi nhấn OK
 *     onCancel: function() {}       // callback khi nhấn Hủy
 *   });
 *
 *   ConfirmModal.hide();
 */
var ConfirmModal = (function () {
  var $overlay = null;
  var currentCallbacks = {};

  function _ensureDOM() {
    if ($overlay) return;

    var html =
      '<div class="confirm-overlay" id="confirm-modal-overlay">' +
      '  <div class="confirm-box">' +
      '    <div class="confirm-icon" id="confirm-icon">❓</div>' +
      '    <div class="confirm-title" id="confirm-title">Xác nhận</div>' +
      '    <div class="confirm-message" id="confirm-message"></div>' +
      '    <div class="confirm-actions">' +
      '      <button class="confirm-btn confirm-btn-cancel" id="confirm-btn-cancel">Hủy</button>' +
      '      <button class="confirm-btn confirm-btn-ok" id="confirm-btn-ok">Đồng ý</button>' +
      '    </div>' +
      '  </div>' +
      '</div>';

    $('body').append(html);
    $overlay = $('#confirm-modal-overlay');

    // Close on overlay click
    $overlay.on('click', function (e) {
      if (e.target === this) _handleCancel();
    });

    $('#confirm-btn-cancel').on('click', function () { _handleCancel(); });
    $('#confirm-btn-ok').on('click', function () { _handleOk(); });
  }

  function _handleOk() {
    var cb = currentCallbacks.onOk;
    hide();
    if (cb) cb();
  }

  function _handleCancel() {
    var cb = currentCallbacks.onCancel;
    hide();
    if (cb) cb();
  }

  function show(opts) {
    opts = opts || {};
    _ensureDOM();

    currentCallbacks = { onOk: opts.onOk, onCancel: opts.onCancel };

    $('#confirm-icon').text(opts.icon || '❓');
    $('#confirm-title').text(opts.title || 'Xác nhận');
    $('#confirm-message').text(opts.message || '');
    $('#confirm-btn-cancel').text(opts.cancelText || 'Hủy');

    var $okBtn = $('#confirm-btn-ok');
    $okBtn.text(opts.okText || 'Đồng ý');
    $okBtn.removeClass('confirm-btn-ok confirm-btn-danger');
    $okBtn.addClass(opts.danger ? 'confirm-btn-danger' : 'confirm-btn-ok');

    $overlay.addClass('active');
    document.body.style.overflow = 'hidden';
  }

  function hide() {
    if ($overlay) {
      $overlay.removeClass('active');
      document.body.style.overflow = '';
    }
    currentCallbacks = {};
  }

  return { show: show, hide: hide };
})();
