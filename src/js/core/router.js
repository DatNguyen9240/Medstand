/**
 * SPA Router — Hash-based routing for Medstand
 * Handles #/path navigation, template loading, script execution
 */
const Router = (() => {
  // ── Route definitions ──────────────────────────────────────────────────
  const ROUTES = [
    // Auth pages (no nav, no auth guard)
    { path: 'login', template: 'src/templates/login.html', scripts: ['src/js/pages/login.js'], css: ['src/css/pages/auth.css'], auth: false, nav: false, title: 'Đăng nhập' },
    { path: 'register', template: 'src/templates/register.html', scripts: ['src/js/pages/register.js'], css: ['src/css/pages/auth.css', 'src/css/pages/register.css'], auth: false, nav: false, title: 'Đăng ký' },
    { path: 'forgot-password', template: 'src/templates/forgot-password.html', scripts: ['src/js/pages/forgot-password.js'], css: ['src/css/pages/auth.css', 'src/css/pages/forgot-password.css'], auth: false, nav: false, title: 'Quên mật khẩu' },

    // Main app pages (need auth + nav)
    { path: 'home', template: 'src/templates/home.html', scripts: ['src/js/pages/home.js', 'src/js/pages/index.js'], css: [], auth: true, nav: 'home', title: 'Trang chủ' },
    { path: 'notifications', template: 'src/templates/notifications.html', scripts: ['src/js/pages/notifications.js'], css: ['src/css/pages/notifications.css'], auth: true, nav: 'home', title: 'Thông báo' },
    { path: 'routes', template: 'src/templates/routes.html', scripts: ['src/js/pages/routes.js'], css: ['src/css/components/segment.css', 'src/css/pages/routes.css'], auth: true, nav: 'routes', title: 'Tuyến' },
    { path: 'orders', template: 'src/templates/orders.html', scripts: ['src/js/pages/orders.js'], css: ['src/css/pages/orders.css'], auth: true, nav: 'orders', title: 'Đơn hàng' },
    { path: 'account', template: 'src/templates/account.html', scripts: ['src/js/pages/account.js'], css: ['src/css/pages/account.css'], auth: true, nav: 'account', title: 'Tài khoản' },

    // Order sub-pages
    { path: 'order-list', template: 'src/templates/order-list.html', scripts: ['src/js/pages/order-list.js'], css: ['src/css/components/fab.css', 'src/css/pages/order-list.css'], auth: true, nav: 'orders', title: 'Danh sách đơn hàng' },
    { path: 'create-order', template: 'src/templates/create-order.html', scripts: ['src/js/pages/create-order.js'], css: ['src/css/components/fab.css', 'src/css/pages/order-form.css', 'src/css/pages/create-order.css'], auth: true, nav: 'orders', title: 'Tạo đơn hàng' },
    { path: 'order-detail', template: 'src/templates/order-detail.html', scripts: ['src/js/pages/order-detail.js'], css: ['src/css/pages/detail.css', 'src/css/pages/order-detail.css'], auth: true, nav: 'orders', title: 'Chi tiết đơn hàng' },
    { path: 'edit-order', template: 'src/templates/edit-order.html', scripts: ['src/js/pages/edit-order.js'], css: ['src/css/pages/order-form.css', 'src/css/pages/edit-order.css'], auth: true, nav: 'orders', title: 'Sửa đơn hàng' },
    { path: 'order-report', template: 'src/templates/order-report.html', scripts: ['src/js/pages/order-report.js'], css: ['src/css/pages/order-report.css'], auth: true, nav: 'orders', title: 'Báo cáo đơn hàng' },
    { path: 'invoice-list', template: 'src/templates/invoice-list.html', scripts: ['src/js/pages/invoice-list.js'], css: ['src/css/pages/invoice-list.css'], auth: true, nav: 'orders', title: 'Danh sách hóa đơn' },

    // Return orders
    { path: 'return-orders', template: 'src/templates/return-orders.html', scripts: ['src/js/pages/return-orders.js'], css: ['src/css/pages/return-orders.css'], auth: true, nav: 'orders', title: 'Phiếu trả hàng' },
    { path: 'return-order-detail', template: 'src/templates/return-order-detail.html', scripts: ['src/js/pages/return-order-detail.js'], css: ['src/css/pages/detail.css', 'src/css/pages/return-order-detail.css'], auth: true, nav: 'orders', title: 'Chi tiết phiếu trả hàng' },
    { path: 'return-product-list', template: 'src/templates/return-product-list.html', scripts: ['src/js/pages/return-product-list.js'], css: ['src/css/pages/return-product-list.css'], auth: true, nav: 'orders', title: 'Danh sách SP trả' },

    // Sales
    { path: 'revenue', template: 'src/templates/revenue.html', scripts: ['src/js/pages/revenue.js'], css: ['src/css/components/segment.css', 'src/css/components/data-table.css', 'src/css/pages/revenue.css'], auth: true, nav: 'orders', title: 'Doanh số' },
    { path: 'sales-plan', template: 'src/templates/sales-plan.html', scripts: ['src/js/pages/sales-plan.js'], css: ['src/css/pages/sales-plan.css'], auth: true, nav: 'orders', title: 'Kế hoạch bán hàng' },
    { path: 'sales-plan-detail', template: 'src/templates/sales-plan-detail.html', scripts: ['src/js/pages/sales-plan-detail.js'], css: ['src/css/pages/sales-plan-detail.css'], auth: true, nav: 'orders', title: 'Chi tiết kế hoạch' },
    { path: 'product-warning', template: 'src/templates/product-warning.html', scripts: ['src/js/pages/product-warning.js'], css: ['src/css/components/segment.css', 'src/css/components/data-table.css', 'src/css/pages/product-warning.css'], auth: true, nav: 'orders', title: 'Sản phẩm cảnh báo' },
    { path: 'contract-point', template: 'src/templates/contract-point.html', scripts: ['src/js/pages/contract-point.js'], css: ['src/css/components/segment.css', 'src/css/components/data-table.css', 'src/css/pages/contract-point.css'], auth: true, nav: 'account', title: 'Điểm hợp đồng' },

    // Customer management
    { path: 'customer-management', template: 'src/templates/customer-management.html', scripts: ['src/js/pages/customer-management.js'], css: ['src/css/components/fab.css', 'src/css/pages/customer-management.css'], auth: true, nav: 'account', title: 'Quản lý khách hàng' },

    // Account sub-pages
    { path: 'account-detail', template: 'src/templates/account-detail.html', scripts: ['src/js/pages/account-detail.js'], css: ['src/css/pages/account-detail.css'], auth: true, nav: 'account', title: 'Thông tin tài khoản' },
    { path: 'account-edit', template: 'src/templates/account-edit.html', scripts: ['src/js/pages/account-edit.js'], css: ['src/css/pages/account-edit.css'], auth: true, nav: 'account', title: 'Chỉnh sửa tài khoản' },
    { path: 'change-password', template: 'src/templates/change-password.html', scripts: ['src/js/pages/change-password.js'], css: ['src/css/components/forms.css', 'src/css/pages/change-password.css'], auth: true, nav: 'account', title: 'Đổi mật khẩu' },

    // Survey
    { path: 'survey', template: 'src/templates/survey.html', scripts: ['src/js/pages/survey.js'], css: ['src/css/pages/survey.css'], auth: true, nav: 'account', title: 'Khảo sát' },
    { path: 'survey-question', template: 'src/templates/survey-question.html', scripts: ['src/js/pages/survey-question.js'], css: ['src/css/pages/survey-question.css'], auth: true, nav: 'account', title: 'Làm khảo sát' },
    { path: 'survey-history', template: 'src/templates/survey-history.html', scripts: ['src/js/pages/survey-history.js'], css: ['src/css/pages/survey-history.css'], auth: true, nav: 'account', title: 'Lịch sử khảo sát' },
  ];

  // ── State ──────────────────────────────────────────────────────────────
  let _currentRoute = null;
  let _loadedScripts = new Set();    // track loaded page scripts
  let _dynamicStylesheets = [];       // track dynamic CSS <link> elements

  // ── Template cache ─────────────────────────────────────────────────────
  const _templateCache = {};

  async function _fetchTemplate(url) {
    if (_templateCache[url]) return _templateCache[url];
    const res = await fetch(url);
    if (!res.ok) throw new Error('Template not found: ' + url);
    const html = await res.text();
    _templateCache[url] = html;
    return html;
  }

  // ── Preload common templates in background ────────────────────────────
  function _preloadTemplates() {
    const priority = ['home', 'orders', 'account', 'routes', 'login'];
    priority.forEach(p => {
      const route = _findRoute(p);
      if (route) _fetchTemplate(route.template).catch(() => { });
    });
  }

  // ── Loading spinner ───────────────────────────────────────────────────
  function _showSpinner($content) {
    if (!$content) return;
    const existing = $content.querySelector('.route-spinner');
    if (existing) return;
    const spinner = document.createElement('div');
    spinner.className = 'route-spinner';
    spinner.setAttribute('aria-label', 'Đang tải...');
    spinner.innerHTML = '<div class="route-spinner-dot"></div>';
    $content.appendChild(spinner);
  }
  function _hideSpinner($content) {
    if (!$content) return;
    const s = $content.querySelector('.route-spinner');
    if (s) s.remove();
  }

  // ── Dynamic CSS ────────────────────────────────────────────────────────
  function _loadCSS(hrefs) {
    // Remove previously loaded dynamic CSS
    _dynamicStylesheets.forEach(el => el.remove());
    _dynamicStylesheets = [];

    hrefs.forEach(href => {
      // Skip if already in <head> as static
      if (document.querySelector(`link[href="${href}"]`)) return;
      const link = document.createElement('link');
      link.rel = 'stylesheet';
      link.href = href;
      link.setAttribute('data-dynamic', 'true');
      document.head.appendChild(link);
      _dynamicStylesheets.push(link);
    });
  }

  // ── Dynamic Script Loading ─────────────────────────────────────────────
  function _loadScript(src) {
    return new Promise((resolve, reject) => {
      // If already loaded in this session, skip
      if (_loadedScripts.has(src)) {
        resolve();
        return;
      }
      const script = document.createElement('script');
      script.src = src;
      script.onload = () => {
        _loadedScripts.add(src);
        resolve();
      };
      script.onerror = () => reject(new Error('Failed to load: ' + src));
      document.body.appendChild(script);
    });
  }

  // ── Auth check ─────────────────────────────────────────────────────────
  function _isLoggedIn() {
    const match = document.cookie.match(/(?:^|; )auth_token=([^;]*)/);
    return !!(match && match[1]);
  }

  // ── Route matching ─────────────────────────────────────────────────────
  function _parseHash() {
    const hash = location.hash.replace(/^#\/?/, '') || 'home';
    const [path, queryString] = hash.split('?');
    const params = {};
    if (queryString) {
      queryString.split('&').forEach(pair => {
        const [k, v] = pair.split('=');
        params[decodeURIComponent(k)] = decodeURIComponent(v || '');
      });
    }
    return { path, params };
  }

  function _findRoute(path) {
    return ROUTES.find(r => r.path === path);
  }

  // ── Navigation ─────────────────────────────────────────────────────────
  async function navigate(hash) {
    if (hash.startsWith('#')) {
      location.hash = hash;
    } else {
      location.hash = '#/' + hash;
    }
  }

  // ── 404 page ──────────────────────────────────────────────────────────
  function _render404(path) {
    const $content = document.getElementById('app-content');
    if ($content) {
      $content.innerHTML =
        '<div style="display:flex;flex-direction:column;align-items:center;justify-content:center;min-height:60vh;padding:48px 24px;text-align:center">' +
        '<div style="font-size:5rem;margin-bottom:16px;opacity:.3">🔍</div>' +
        '<h1 style="font-size:2rem;font-weight:700;color:var(--color-text);margin:0 0 8px">404</h1>' +
        '<p style="color:var(--color-text-muted);margin:0 0 24px;font-size:1.05rem">Trang <code>' + path + '</code> không tồn tại</p>' +
        '<a href="#/home" style="display:inline-block;padding:12px 32px;background:var(--color-primary);color:#fff;border-radius:var(--radius-md);text-decoration:none;font-weight:600">Về trang chủ</a>' +
        '</div>';
    }
    document.title = '404 - Medstand';
  }

  // ── Page transition ───────────────────────────────────────────────────
  function _fadeOut($el) {
    return new Promise(resolve => {
      $el.style.opacity = '0';
      $el.style.transition = 'opacity 150ms ease';
      setTimeout(resolve, 150);
    });
  }
  function _fadeIn($el) {
    $el.style.opacity = '1';
    $el.style.transition = 'opacity 200ms ease';
  }

  async function _handleRoute() {
    const { path, params } = _parseHash();
    const route = _findRoute(path);
    const $content = document.getElementById('app-content');

    // 404 — show page instead of silent redirect
    if (!route) {
      if ($content) await _fadeOut($content);
      _render404(path);
      if ($content) _fadeIn($content);
      window.scrollTo(0, 0);
      return;
    }

    // Auth guard
    if (route.auth && !_isLoggedIn()) {
      navigate('login');
      return;
    }

    // Already logged in trying to access login/register
    if (!route.auth && _isLoggedIn() && (path === 'login' || path === 'register')) {
      navigate('home');
      return;
    }

    // Cleanup previous page elements (appended outside #app-content)
    if (typeof TotalBar !== 'undefined') TotalBar.destroy();
    if (window.Swal) Swal.close();
    // FilterComponent appends overlay/modal/select to body
    $('.filter-overlay, .filter-modal, .select-modal').remove();
    $('body').css('overflow', '').removeClass('has-total-bar');

    // Scroll to top first
    window.scrollTo(0, 0);

    // Fade out current content
    if ($content && _currentRoute) await _fadeOut($content);

    // Show loading spinner
    _showSpinner($content);

    // Update title
    document.title = route.title + ' - Medstand';

    // Update body data-page
    document.body.setAttribute('data-page', path);

    // Load route-specific CSS
    _loadCSS(route.css || []);

    // Load template
    try {
      const html = await _fetchTemplate(route.template);
      if ($content) $content.innerHTML = html;
    } catch (e) {
      console.error('[Router] Template load error:', e);
      _hideSpinner($content);
      if ($content) $content.innerHTML = '<p style="text-align:center;padding:48px;color:var(--color-danger)">Không thể tải trang</p>';
      return;
    }

    // Show/hide nav + sidebar
    const $nav = document.getElementById('nav-container');
    const $sidebar = document.getElementById('sidebar-container');
    const $header = document.getElementById('app-header');

    if (route.nav) {
      if ($nav) $nav.innerHTML = renderNavBar(route.nav);
      if ($sidebar) $sidebar.innerHTML = renderSidebar(route.nav);
      if ($nav) $nav.hidden = false;
      if ($sidebar) $sidebar.hidden = false;
      document.body.classList.add('has-sidebar');
    } else {
      if ($nav) { $nav.innerHTML = ''; $nav.hidden = true; }
      if ($sidebar) { $sidebar.innerHTML = ''; $sidebar.hidden = true; }
      document.body.classList.remove('has-sidebar');
    }

    // Expose params globally
    window._routeParams = params;

    // Load and execute page scripts (with error boundary)
    for (const src of (route.scripts || [])) {
      const oldScript = document.querySelector(`script[src="${src}"]`);
      if (oldScript) oldScript.remove();
      _loadedScripts.delete(src);
      try {
        await _loadScript(src);
      } catch (e) {
        console.error('[Router] Script error:', src, e);
        _hideSpinner($content);
        if ($content) {
          $content.innerHTML +=
            '<div style="text-align:center;padding:24px;color:var(--color-danger);font-size:var(--font-size-sm)">' +
            '<p>⚠️ Lỗi tải script: <code>' + src.split('/').pop() + '</code></p>' +
            '<button onclick="location.reload()" style="margin-top:8px;padding:8px 20px;border:1px solid var(--color-danger);color:var(--color-danger);background:transparent;border-radius:var(--radius-md);cursor:pointer">Tải lại</button>' +
            '</div>';
        }
        return;
      }
    }

    // Store current route
    _currentRoute = route;

    // Hide spinner & fade in
    _hideSpinner($content);
    if ($content) _fadeIn($content);

    // Focus management (a11y) — move focus to main content
    if ($content) {
      $content.setAttribute('tabindex', '-1');
      $content.focus({ preventScroll: true });
      $content.removeAttribute('tabindex');
    }
  }

  // ── Init ───────────────────────────────────────────────────────────────
  function init() {
    // Listen for hash changes (wrap async in error handler)
    window.addEventListener('hashchange', function () {
      _handleRoute().catch(function (err) {
        console.error('[Router] handleRoute error:', err);
      });
    });

    // Initial route
    if (!location.hash || location.hash === '#' || location.hash === '#/') {
      location.hash = _isLoggedIn() ? '#/home' : '#/login';
    }
    _handleRoute().catch(function (err) {
      console.error('[Router] init handleRoute error:', err);
    });

    // Preload common templates in background after first render
    setTimeout(_preloadTemplates, 1000);
  }

  // ── Public API ─────────────────────────────────────────────────────────
  return { init, navigate, ROUTES };
})();

// Global navigate function for easy use in templates
function navigate(hash) {
  Router.navigate(hash);
}
