/**
 * SPA Router — Hash-based routing for Medstand
 * Handles #/path navigation, template loading, script execution
 */
const Router = (() => {
  // ── Route definitions ──────────────────────────────────────────────────
  const ROUTES = [
    // Auth pages (login, register, forgot-password) are standalone HTML pages
    // See: login.html, register.html, forgot-password.html

    // Main app pages (need auth + nav)
    { path: 'home', template: 'src/templates/home.html', scripts: ['src/js/pages/home.js', 'src/js/pages/index.js'], css: ['src/css/pages/home.css'], auth: true, nav: 'home', title: 'Trang chủ' },
    { path: 'notifications', template: 'src/templates/notifications.html', scripts: ['src/js/pages/notifications.js'], css: ['src/css/pages/notifications.css'], auth: true, nav: 'home', title: 'Xem thông báo' },
    { path: 'chatbot', template: 'chatbot-widget/template/chatbot.html', scripts: ['chatbot-widget/js/chatbot.bundle.min.js'], css: ['chatbot-widget/css/chatbot.css', 'chatbot-widget/css/chatbot-api-engine.css'], auth: true, nav: 'chatbot', title: 'AI Trợ lý' },
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
    { path: 'rag-admin', template: 'src/templates/rag-admin.html', scripts: ['src/js/pages/rag-admin.js'], css: ['src/css/pages/rag-admin.css'], auth: true, nav: 'account', title: 'Quản lý Tri thức' },


    // Survey
    { path: 'survey', template: 'src/templates/survey.html', scripts: ['src/js/pages/survey.js'], css: ['src/css/pages/survey.css'], auth: true, nav: 'account', title: 'Khảo sát' },
    { path: 'survey-question', template: 'src/templates/survey-question.html', scripts: ['src/js/pages/survey-question.js'], css: ['src/css/pages/survey-question.css'], auth: true, nav: 'account', title: 'Làm khảo sát' },
    { path: 'survey-history', template: 'src/templates/survey-history.html', scripts: ['src/js/pages/survey-history.js?v=9.6'], css: ['src/css/pages/survey-history.css'], auth: true, nav: 'account', title: 'Lịch sử khảo sát' },
  ];

  // ── State ──────────────────────────────────────────────────────────────
  let _currentRoute = null;
  let _loadedScripts = new Set();    // track loaded page scripts
  let _dynamicStylesheets = [];       // track dynamic CSS <link> elements
  window._pageCleanupHooks = [];      // track global cleanup hooks per page

  // ── Template cache ─────────────────────────────────────────────────────
  const _templateCache = {};

  async function _fetchTemplate(url) {
    if (_templateCache[url]) return _templateCache[url];
    const res = await fetch(url + '?v=' + Date.now(), { cache: 'no-store' });
    if (!res.ok) throw new Error('Template not found: ' + url);
    const html = await res.text();
    _templateCache[url] = html;
    return html;
  }

  // ── Preload common templates in background ────────────────────────────
  function _preloadTemplates() {
    const priority = ['home', 'orders', 'account', 'routes'];
    priority.forEach(p => {
      const route = _findRoute(p);
      if (route) _fetchTemplate(route.template).catch(() => { });
    });
  }

  // ── Loading spinner ───────────────────────────────────────────────────
  let _spinnerTimer = null;
  function _showSpinner($content) {
    if (!$content) return;
    const existing = $content.querySelector('.route-spinner');
    if (existing) return;
    const spinner = document.createElement('div');
    spinner.className = 'route-spinner';
    spinner.setAttribute('aria-label', 'Đang tải...');
    spinner.innerHTML = '<div class="route-spinner-dot"></div>';
    $content.appendChild(spinner);

    // 15s timeout
    _spinnerTimer = setTimeout(() => {
      _hideSpinner($content);
      $content.innerHTML =
        '<div style="display:flex;flex-direction:column;align-items:center;justify-content:center;min-height:40vh;padding:48px 24px;text-align:center">' +
        '<div style="font-size:3rem;margin-bottom:16px;opacity:.4">⏱️</div>' +
        '<p style="color:var(--color-text-muted);margin:0 0 16px;font-size:var(--font-size-sm)">Trang tải quá lâu, vui lòng thử lại</p>' +
        '<button onclick="location.reload()" style="padding:10px 24px;background:var(--color-primary);color:#fff;border:none;border-radius:var(--radius-md);cursor:pointer;font-family:var(--font-family);font-weight:600">Tải lại</button>' +
        '</div>';
    }, 15000);
  }
  function _hideSpinner($content) {
    if (_spinnerTimer) { clearTimeout(_spinnerTimer); _spinnerTimer = null; }
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
      if (document.querySelector(`link[href^="${href}"]`)) return;
      const link = document.createElement('link');
      link.rel = 'stylesheet';
      link.href = href + '?v=11.79';
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
      script.src = src + '?v=11.79';
      script.charset = 'UTF-8';
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

  function _updateNotificationBadgeGlobal() {
    const $badge = document.getElementById('notif-badge');
    if (!$badge) return;
    if (typeof Http === 'undefined' || typeof API_CONFIG === 'undefined') return;

    let user = null;
    try {
      user = JSON.parse(localStorage.getItem('auth_user') || '{}');
    } catch (e) {}
    const userName = user ? (user.UserName || user.Username || '') : '';
    if (!userName) return;

    Http.get(API_CONFIG.ENDPOINTS.NOTIFICATION.LIST, { User: userName })
      .then(res => {
        const records = res?.records || res?.data || [];
        if (Array.isArray(records)) {
          let unreadCount = 0;
          records.forEach(n => { if (!n.isView) unreadCount++; });
          if (unreadCount > 0) {
            $badge.textContent = unreadCount;
            $badge.removeAttribute('hidden');
            $badge.style.display = '';
          } else {
            $badge.setAttribute('hidden', '');
            $badge.style.display = 'none';
          }
        }
      })
      .catch(err => console.warn('[Router] Failed to fetch notification count:', err));
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

    // Auth guard — redirect to standalone login page
    if (route.auth && !_isLoggedIn()) {
      window.location.replace(window.location.origin + '/pages/login.html?v=' + Date.now());
      return;
    }

    // Cleanup previous page elements (appended outside #app-content)
    if (typeof TotalBar !== 'undefined') TotalBar.destroy();
    if (window.Swal) Swal.close();
    // FilterComponent appends overlay/modal/select to body
    $('.filter-overlay, .filter-modal, .select-modal, .picker-overlay, .picker-sheet').remove();
    $('body').css('overflow', '').removeClass('has-total-bar');

    // Run cleanup hooks from previous page
    if (window._pageCleanupHooks && window._pageCleanupHooks.length > 0) {
      window._pageCleanupHooks.forEach(hook => {
        try { hook(); } catch (e) { console.error('[Router] Cleanup error:', e); }
      });
      window._pageCleanupHooks = [];
    }

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

      const $header = document.querySelector('.app-header');
      if ($header) {
        // Prepend mobile hamburger menu button if not present
        if (!$header.querySelector('.header-menu-toggle')) {
          const menuBtnHTML = `
            <button type="button" class="header-icon header-menu-toggle" aria-label="Mở thanh điều hướng" onclick="toggleSidebar()">
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <line x1="3" y1="6" x2="21" y2="6"></line>
                <line x1="3" y1="12" x2="21" y2="12"></line>
                <line x1="3" y1="18" x2="21" y2="18"></line>
              </svg>
            </button>
          `;
          $header.insertAdjacentHTML('afterbegin', menuBtnHTML);
        }
        // Dynamic header upgrade: if a template has #theme-toggle-container but lacks .header-actions,
        // wrap it in a .header-actions container so it gains the notification bell and supports AI chatbot icon injection.
        let $actions = $header.querySelector('.header-actions');
        if (!$actions) {
          const $oldThemeContainer = $header.querySelector('#theme-toggle-container');
          if ($oldThemeContainer) {
            const styleAttr = $oldThemeContainer.getAttribute('style') || '';
            const isAbsolute = styleAttr.includes('absolute');
            const wrapperStyle = isAbsolute 
              ? 'position:absolute;right:16px;display:flex;align-items:center;gap:4px' 
              : 'margin-left:auto;display:flex;align-items:center;gap:4px';
            
            const actionsHTML = `
              <div class="header-actions" style="${wrapperStyle}">
                <button type="button" class="header-icon header-notification" id="btn-notif" aria-label="Thông báo">
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"></path>
                    <path d="M13.73 21a2 2 0 0 1-3.46 0"></path>
                  </svg>
                  <span class="notification-badge" id="notif-badge" hidden>0</span>
                </button>
                <span id="theme-toggle-container"></span>
              </div>
            `;
            $oldThemeContainer.outerHTML = actionsHTML;
          }
        }
      }
      
      // Dynamic injection of AI chatbot icon into .header-actions (except on chatbot page itself)
      if (path !== 'chatbot') {
        const $upgradedHeader = document.querySelector('.app-header');
        if ($upgradedHeader) {
          const $actions = $upgradedHeader.querySelector('.header-actions');
          if ($actions && !$actions.querySelector('.header-ai-btn')) {
            const aiBtnHTML = `<button type="button" class="header-icon ai-chat-btn header-ai-btn" aria-label="Trợ lý AI" onclick="navigate('chatbot')">
              <svg class="ai-robot" width="28" height="28" viewBox="0 0 48 48" fill="none">
                <defs>
                  <linearGradient id="hd-head-grad" x1="14" y1="12" x2="34" y2="36">
                    <stop offset="0%" stop-color="#6366f1"></stop>
                    <stop offset="100%" stop-color="#3c50e0"></stop>
                  </linearGradient>
                  <radialGradient id="hd-eye-glow" cx="50%" cy="40%" r="50%">
                    <stop offset="0%" stop-color="#fff"></stop>
                    <stop offset="100%" stop-color="#c7d2fe"></stop>
                  </radialGradient>
                </defs>
                <line x1="24" y1="5" x2="24" y2="12" stroke="#6366f1" stroke-width="2" stroke-linecap="round"></line>
                <circle cx="24" cy="4" r="3" fill="#818cf8">
                  <animate attributeName="opacity" values="1;0.5;1" dur="2s" repeatCount="indefinite"></animate>
                </circle>
                <rect x="6" y="20" width="5" height="8" rx="2.5" fill="#6366f1" opacity="0.5"></rect>
                <rect x="37" y="20" width="5" height="8" rx="2.5" fill="#6366f1" opacity="0.5"></rect>
                <rect x="10" y="12" width="28" height="24" rx="7" fill="url(#hd-head-grad)"></rect>
                <rect x="14" y="16" width="20" height="16" rx="5" fill="#eef2ff" opacity="0.95"></rect>
                <ellipse cx="19.5" cy="23" rx="3" ry="3.2" fill="url(#hd-eye-glow)"></ellipse>
                <circle cx="19.5" cy="23.5" r="1.8" fill="#3c50e0"></circle>
                <circle cx="18.8" cy="22.5" r="0.7" fill="#fff"></circle>
                <ellipse cx="28.5" cy="23" rx="3" ry="3.2" fill="url(#hd-eye-glow)"></ellipse>
                <circle cx="28.5" cy="23.5" r="1.8" fill="#3c50e0"></circle>
                <circle cx="27.8" cy="22.5" r="0.7" fill="#fff"></circle>
                <circle cx="16" cy="27" r="2" fill="#f9a8d4" opacity="0.5"></circle>
                <circle cx="32" cy="27" r="2" fill="#f9a8d4" opacity="0.5"></circle>
                <path d="M21 29 Q24 32.5 27 29" stroke="#3c50e0" stroke-width="1.5" fill="none" stroke-linecap="round"></path>
                <g class="ai-hand" transform-origin="40 30">
                  <path d="M38 28 Q42 22 44 18" stroke="#6366f1" stroke-width="2.5" fill="none" stroke-linecap="round"></path>
                  <circle cx="44" cy="16" r="3.5" fill="#818cf8"></circle>
                  <line x1="42" y1="14" x2="41" y2="11" stroke="#818cf8" stroke-width="1.5" stroke-linecap="round"></line>
                  <line x1="44" y1="13" x2="44" y2="10" stroke="#818cf8" stroke-width="1.5" stroke-linecap="round"></line>
                  <line x1="46" y1="14" x2="47" y2="11" stroke="#818cf8" stroke-width="1.5" stroke-linecap="round"></line>
                </g>
              </svg>
            </button>`;
            $actions.insertAdjacentHTML('afterbegin', aiBtnHTML);
          }
        }
      }
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

    // Inject theme toggle if container exists
    const $themeContainer = document.getElementById('theme-toggle-container');
    if ($themeContainer && typeof renderThemeToggle === 'function') {
      $themeContainer.innerHTML = renderThemeToggle();
    }

    // Load and execute page scripts (with error boundary)
    for (const src of (route.scripts || [])) {
      const oldScript = document.querySelector(`script[src^="${src}"]`);
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

    // Sync notification badge count dynamically
    _updateNotificationBadgeGlobal();

    // Focus management (a11y) — move focus to main content
    if ($content) {
      $content.setAttribute('tabindex', '-1');
      $content.focus({ preventScroll: true });
      $content.removeAttribute('tabindex');
    }
  }

  // ── Init ───────────────────────────────────────────────────────────────
  function init() {

    // ── Global: ẩn nav + header + total-bar khi input được focus (mobile) ──
    // Chatbot page tự xử lý riêng, nên skip
    var _inputTags = ['INPUT', 'TEXTAREA', 'SELECT'];
    var _fixedSels = ['.app-nav', '.app-header', '.total-bar'];
    function _toggleFixed(show) {
      _fixedSels.forEach(function (sel) {
        var el = document.querySelector(sel);
        if (el) el.style.display = show ? '' : 'none';
      });
    }
    document.addEventListener('focusin', function (e) {
      if (window.innerWidth > 768) return;
      if (document.body.getAttribute('data-page') === 'chatbot') return;
      if (_inputTags.indexOf(e.target.tagName) === -1) return;
      // Bỏ qua radio, checkbox, và date vì chúng không mở bàn phím ảo (dùng picker native)
      if (e.target.tagName === 'INPUT' && (e.target.type.toLowerCase() === 'radio' || e.target.type.toLowerCase() === 'checkbox' || e.target.type.toLowerCase() === 'date')) return;
      _toggleFixed(false);
    });
    document.addEventListener('focusout', function (e) {
      if (window.innerWidth > 768) return;
      if (document.body.getAttribute('data-page') === 'chatbot') return;
      if (_inputTags.indexOf(e.target.tagName) === -1) return;
      if (e.target.tagName === 'INPUT' && (e.target.type.toLowerCase() === 'radio' || e.target.type.toLowerCase() === 'checkbox' || e.target.type.toLowerCase() === 'date')) return;
      // Delay đủ lâu để button click kịp xử lý trước khi layout shift
      setTimeout(function () {
        var active = document.activeElement;
        if (active && _inputTags.indexOf(active.tagName) !== -1 && !(active.tagName === 'INPUT' && (active.type.toLowerCase() === 'radio' || active.type.toLowerCase() === 'checkbox' || active.type.toLowerCase() === 'date'))) return;
        _toggleFixed(true);
      }, 150);
    });

    // ── Fix: Android Back button đóng keyboard nhưng KHÔNG fire focusout ──
    // Dùng visualViewport để phát hiện keyboard đóng, rồi blur + restore layout
    if (window.visualViewport) {
      var _lastVH = window.visualViewport.height;
      window.visualViewport.addEventListener('resize', function () {
        var newVH = window.visualViewport.height;
        var grew = newVH - _lastVH;
        _lastVH = newVH;

        // Keyboard vừa đóng (viewport mở rộng > 100px)
        if (grew > 100 && window.innerWidth <= 768) {
          if (document.body.getAttribute('data-page') === 'chatbot') return;
          var active = document.activeElement;
          // Nếu vẫn còn input đang focused → blur nó (fire focusout → _toggleFixed)
          if (active && _inputTags.indexOf(active.tagName) !== -1) {
            active.blur();
          } else {
            // Không có focusout được fire → restore thủ công
            _toggleFixed(true);
          }
        }
      });
    }

    // ── Global: click on notification bell → navigate ──
    document.addEventListener('click', function (e) {
      var $btn = e.target.closest('#btn-notif');
      if ($btn) {
        e.preventDefault();
        navigate('notifications');
      }
    });

    // Listen for hash changes (wrap async in error handler)
    window.addEventListener('hashchange', function () {
      _handleRoute().catch(function (err) {
        console.error('[Router] handleRoute error:', err);
      });
    });

    // Initial route
    if (!location.hash || location.hash === '#' || location.hash === '#/') {
      if (!_isLoggedIn()) {
        window.location.replace(window.location.origin + '/pages/login.html?v=' + Date.now());
        return;
      }
      location.hash = '#/home';
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
