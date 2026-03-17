/**
 * Theme Manager – dark / light mode toggle
 * Uses localStorage to persist preference.
 * Toggle: call toggleTheme() or click .theme-toggle button.
 */
(function () {
  var STORAGE_KEY = 'medstand-theme';

  function getPreferred() {
    var saved = localStorage.getItem(STORAGE_KEY);
    if (saved) return saved;
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  }

  function apply(theme) {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem(STORAGE_KEY, theme);
  }

  // Apply on load (before DOMContentLoaded to avoid flash)
  apply(getPreferred());

  // Apply sidebar-collapsed immediately (trước khi browser render body)
  // để tránh hiện tượng nội dung chuyển từ phải sang trái khi load trang
  if (localStorage.getItem('sidebar-collapsed') === 'true') {
    document.documentElement.classList.add('sidebar-collapsed-init');
  }

  // Global toggle function
  window.toggleTheme = function () {
    var current = document.documentElement.getAttribute('data-theme') || 'light';
    apply(current === 'dark' ? 'light' : 'dark');
  };
})();

