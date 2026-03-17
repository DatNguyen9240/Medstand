/**
 * AuthThemeToggle — render nút theme toggle cho các trang auth (login, register, forgot-password)
 * Requires: theme.js (đã load trước)
 *
 * Usage: thêm <div id="auth-theme-toggle"></div> vào body, rồi gọi:
 *   AuthThemeToggle.init('#auth-theme-toggle')
 * Hoặc tự render: document.body.insertAdjacentHTML('afterbegin', AuthThemeToggle.render());
 *                  AuthThemeToggle.bind();
 */
var AuthThemeToggle = (function () {
  function render() {
    return '<button class="theme-btn" id="btn-theme" aria-label="Đổi giao diện">' +
      '<svg id="icon-moon" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">' +
      '<path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>' +
      '<svg id="icon-sun" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="display:none">' +
      '<circle cx="12" cy="12" r="5"/>' +
      '<line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/>' +
      '<line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/>' +
      '<line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/>' +
      '<line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/>' +
      '</svg></button>';
  }

  function bind() {
    var btn = document.getElementById('btn-theme');
    var moon = document.getElementById('icon-moon');
    var sun = document.getElementById('icon-sun');
    if (!btn || !moon || !sun) return;

    function syncIcons() {
      var isDark = document.documentElement.getAttribute('data-theme') === 'dark';
      moon.style.display = isDark ? 'none' : '';
      sun.style.display = isDark ? '' : 'none';
    }

    syncIcons();
    btn.addEventListener('click', function () {
      if (typeof toggleTheme === 'function') toggleTheme();
      syncIcons();
    });
  }

  /** Shorthand: render vào container + bind */
  function init(selector) {
    var el = document.querySelector(selector);
    if (el) {
      el.innerHTML = render();
    } else {
      document.body.insertAdjacentHTML('afterbegin', render());
    }
    bind();
  }

  return { render: render, bind: bind, init: init };
})();
