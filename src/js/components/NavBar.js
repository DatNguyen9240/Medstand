/* NavBar + Sidebar — Cash.js version */

var NAV_ICONS = {
  home: '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>',
  routes: '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="10" r="3"/><path d="M12 21.7C17.3 17 20 13 20 10a8 8 0 1 0-16 0c0 3 2.7 7 8 11.7z"/></svg>',
  orders: '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/></svg>',
  account: '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>'
};

var THEME_ICONS = {
  sun: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/></svg>',
  moon: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>'
};

function getNavTabs(activeTab) {
  return [
    { id: 'home', label: 'Trang chủ', icon: NAV_ICONS.home, href: '#/home' },
    { id: 'routes', label: 'Tuyến', icon: NAV_ICONS.routes, href: '#/routes' },
    { id: 'orders', label: 'Đơn hàng', icon: NAV_ICONS.orders, href: '#/orders' },
    { id: 'account', label: 'Tài khoản', icon: NAV_ICONS.account, href: '#/account' }
  ];
}

function renderSidebar(activeTab, base) {
  activeTab = activeTab || 'home';
  base = base || '';
  var tabs = getNavTabs(activeTab, base);
  var collapsed = localStorage.getItem('sidebar-collapsed') === 'true';

  return '<aside class="app-sidebar' + (collapsed ? ' collapsed' : '') + '" aria-label="Sidebar navigation">' +
    '<button type="button" class="sidebar-toggle" aria-label="Thu gọn sidebar" onclick="toggleSidebar()">' +
    '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="11 17 6 12 11 7"/><polyline points="18 17 13 12 18 7"/></svg>' +
    '</button>' +
    '<div class="sidebar-heading">MENU</div>' +
    '<nav class="sidebar-nav">' +
    tabs.map(function (t) {
      return '<a href="' + t.href + '" class="sidebar-item ' + (t.id === activeTab ? 'active' : '') + '" data-tab="' + t.id + '" title="' + t.label + '">' +
        '<span class="sidebar-icon">' + t.icon + '</span>' +
        '<span class="sidebar-label">' + t.label + '</span>' +
        '</a>';
    }).join('') +
    '</nav>' +
    '</aside>';
}

function toggleSidebar() {
  var $sidebar = $('.app-sidebar');
  if (!$sidebar.length) return;
  $sidebar.toggleClass('collapsed');
  var isCollapsed = $sidebar.hasClass('collapsed');
  localStorage.setItem('sidebar-collapsed', isCollapsed);

  // Update body class for header/main transitions
  if (isCollapsed) {
    $('body').addClass('sidebar-collapsed');
  } else {
    $('body').removeClass('sidebar-collapsed');
  }
}

// Apply saved collapsed state on load
$(function () {
  if (localStorage.getItem('sidebar-collapsed') === 'true') {
    $('body').addClass('sidebar-collapsed');
  }
  // html.sidebar-collapsed-init đã giữ layout đúng trong suốt quá trình load,
  // giờ remove để tránh conflict với body.sidebar-collapsed khi toggle
  document.documentElement.classList.remove('sidebar-collapsed-init');
});

function renderNavBar(activeTab, base) {
  activeTab = activeTab || 'home';
  base = base || '';
  var tabs = getNavTabs(activeTab, base);
  return '<nav class="app-nav" aria-label="Bottom navigation">' +
    tabs.map(function (t) {
      return '<a href="' + t.href + '" class="nav-item ' + (t.id === activeTab ? 'active' : '') + '" data-tab="' + t.id + '">' +
        '<span class="nav-icon">' + t.icon + '</span>' +
        '<span>' + t.label + '</span>' +
        '</a>';
    }).join('') +
    '</nav>';
}

function renderThemeToggle() {
  return '<button type="button" class="theme-toggle" onclick="toggleTheme()" aria-label="Chuyển đổi giao diện">' +
    '<span class="icon-sun">' + THEME_ICONS.sun + '</span>' +
    '<span class="icon-moon">' + THEME_ICONS.moon + '</span>' +
    '</button>';
}
