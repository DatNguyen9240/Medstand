/**
 * Theme Manager – dark / light mode toggle
 * Uses localStorage to persist preference.
 * Toggle: call toggleTheme() or click .theme-toggle button.
 */
(function () {
  var STORAGE_KEY = 'medstand-theme';
  var darkQuery = window.matchMedia('(prefers-color-scheme: dark)');

  /**
   * Applies the theme to the document and optionally persists it.
   */
  
  function syncMetaThemeColor() {
    setTimeout(function() {
      try {
        var primaryColor = getComputedStyle(document.documentElement).getPropertyValue('--color-primary').trim();
        var isDarkMode = document.documentElement.getAttribute('data-theme') === 'dark';
        var surfaceColor = getComputedStyle(document.documentElement).getPropertyValue('--color-surface').trim();
        
        var metaTag = document.querySelector('meta[name="theme-color"]');
        if (metaTag && primaryColor) {
           // For PWA tab colors, usually surface or primary is good. 
           // We will map it to surface color for a clean look, or primary if you prefer branded bars.
           // Medstand original was branded blue #3c50e0 (Primary)
           metaTag.setAttribute('content', primaryColor);
        }
      } catch(e) {}
    }, 50);
  }

  // Also sync on init and apply
function apply(theme, persist) {
    document.documentElement.setAttribute('data-theme', theme);
    if (persist) {
      localStorage.setItem(STORAGE_KEY, theme);
    }
    // Dispatch event for components that might need to sync icons/states
    window.dispatchEvent(new CustomEvent('themechanged', { detail: { theme: theme } }));
    syncMetaThemeColor();
  }

  /**
   * Initialize theme based on preference or system settings.
   */
  function init() {
    var saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      apply(saved, false);
    } else {
      apply(darkQuery.matches ? 'dark' : 'light', false);
    }
  }

  // 1. Initial Apply (sync)
  init();

  // 2. Listen for System Theme Changes
  var themeListener = function (e) {
    // Only follow system if user hasn't manually set a preference
    if (!localStorage.getItem(STORAGE_KEY)) {
      apply(e.matches ? 'dark' : 'light', false);
    }
  };

  if (darkQuery.addEventListener) {
    darkQuery.addEventListener('change', themeListener);
  } else {
    darkQuery.addListener(themeListener);
  }

  // Sidebar-collapsed init (giữ nguyên logic cũ)
  if (localStorage.getItem('sidebar-collapsed') === 'true') {
    document.documentElement.classList.add('sidebar-collapsed-init');
  }

  // Global toggle function
  window.toggleTheme = function () {
    var current = document.documentElement.getAttribute('data-theme') || 'light';
    var next = (current === 'dark') ? 'light' : 'dark';
    apply(next, true);
  };
})();

