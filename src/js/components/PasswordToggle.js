/**
 * PasswordToggle — tự động khởi tạo toggle hiện/ẩn mật khẩu
 * Tìm tất cả button.btn-toggle-pw, lấy input password trước nó trong cùng .input-wrap
 *
 * HTML pattern:
 *   <div class="input-wrap">
 *     <input type="password" id="myPw" class="form-input has-toggle">
 *     <button type="button" class="btn-toggle-pw" aria-label="Hiện/Ẩn mật khẩu">
 *       <svg class="eye-open" ...>...</svg>
 *       <svg class="eye-off" ... style="display:none">...</svg>
 *     </button>
 *   </div>
 *
 * Usage: load file này sau DOM ready, hoặc gọi PasswordToggle.init()
 */
var PasswordToggle = (function () {
  /** Tạo HTML cho nút toggle (để dùng trong JS render) */
  function renderButton(targetId) {
    return '<button type="button" class="btn-toggle-pw" data-target="' + targetId + '" aria-label="Hiện/Ẩn mật khẩu">' +
      '<svg class="eye-open" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">' +
      '<path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>' +
      '<svg class="eye-off" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="display:none">' +
      '<path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94"/>' +
      '<path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19"/>' +
      '<line x1="1" y1="1" x2="23" y2="23"/></svg></button>';
  }

  /** Bind toggle logic cho tất cả .btn-toggle-pw trên trang */
  function init() {
    var buttons = document.querySelectorAll('.btn-toggle-pw');
    buttons.forEach(function (btn) {
      // Sync trạng thái icon ban đầu — đảm bảo eye-off luôn ẩn
      var eyeOpen = btn.querySelector('.eye-open');
      var eyeOff = btn.querySelector('.eye-off');
      if (eyeOpen) eyeOpen.style.display = '';
      if (eyeOff) eyeOff.style.display = 'none';

      // Tránh bind 2 lần
      if (btn._pwToggleBound) return;
      btn._pwToggleBound = true;

      btn.addEventListener('click', function () {
        // Tìm input: qua data-target hoặc tìm input[type=password/text] trong cùng .input-wrap
        var input;
        var targetId = btn.getAttribute('data-target');
        if (targetId) {
          input = document.getElementById(targetId);
        } else {
          var wrap = btn.closest('.input-wrap');
          if (wrap) input = wrap.querySelector('input[type="password"], input[type="text"]');
        }
        if (!input) return;

        var isPassword = input.type === 'password';
        input.type = isPassword ? 'text' : 'password';

        // Toggle eye icons nếu có
        var eo = btn.querySelector('.eye-open');
        var ef = btn.querySelector('.eye-off');
        if (eo && ef) {
          eo.style.display = isPassword ? 'none' : '';
          ef.style.display = isPassword ? '' : 'none';
        }
      });
    });
  }

  // Auto-init khi DOM ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    // DOM đã ready, nhưng delay 1 tick để đảm bảo HTML đã render
    setTimeout(init, 0);
  }

  return { init: init, renderButton: renderButton };
})();
