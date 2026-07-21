/* NavBar + Sidebar — Cash.js version */

var NAV_ICONS = {
  home: '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>',
  routes: '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="10" r="3"/><path d="M12 21.7C17.3 17 20 13 20 10a8 8 0 1 0-16 0c0 3 2.7 7 8 11.7z"/></svg>',
  orders: '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/></svg>',
  reports: '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 19V9"/><path d="M10 19V5"/><path d="M16 19v-7"/><path d="M22 19H2"/></svg>',
  customers: '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>',
  chatbot: '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="7" width="18" height="13" rx="3"/><path d="M8 7V5a4 4 0 0 1 8 0v2"/><circle cx="9" cy="13" r="1"/><circle cx="15" cy="13" r="1"/><path d="M9 17h6"/></svg>',
  account: '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>'
};

var THEME_ICONS = {
  sun: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/></svg>',
  moon: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>'
};

function isManagerNavUser(user) {
  user = user || {};
  var role = String(user.role || user.Role || user.roleName || user.RoleName || user.RoleCode || '').toLowerCase();
  var group = String(user.UserGroupID || user.userGroupID || user.UserGroup || '').toLowerCase();
  return role.indexOf('manager') >= 0 || role.indexOf('quanly') >= 0 || role.indexOf('quản lý') >= 0 ||
    role.indexOf('admin') >= 0 || group.indexOf('admin') >= 0 || Number(user.Manager || user.manager) === 1 ||
    user.IsManager === true || Number(user.IsManager || user.isManager) === 1 ||
    (user.EmployeeID && user.ManagerID && String(user.EmployeeID).toLowerCase() === String(user.ManagerID).toLowerCase());
}

function getSidebarTabs(activeTab, user) {
  var tabs = [
    { id: 'home', label: 'Trang chủ', icon: NAV_ICONS.home, href: '#/home' },
    { id: 'routes', label: 'Tuyến', icon: NAV_ICONS.routes, href: '#/routes' },
    { id: 'orders', label: 'Đơn hàng', icon: NAV_ICONS.orders, href: '#/orders' }
  ];
  if (isManagerNavUser(user)) tabs.push({ id: 'reports', label: 'Báo cáo', icon: NAV_ICONS.reports, href: '#/revenue' });
  tabs.push({ id: 'customers', label: 'Khách hàng', icon: NAV_ICONS.customers, href: '#/customer-management' });
  tabs.push({ id: 'chatbot', label: 'Trợ lý AI', icon: NAV_ICONS.chatbot, href: '#/chatbot' });
  return tabs;
}

function getMobileTabs(activeTab) {
  return [
    { id: 'home', label: 'Trang chủ', icon: NAV_ICONS.home, href: '#/home' },
    { id: 'routes', label: 'Tuyến', icon: NAV_ICONS.routes, href: '#/routes' },
    { id: 'orders', label: 'Đơn hàng', icon: NAV_ICONS.orders, href: '#/orders' },
    { id: 'account', label: 'Tài khoản', icon: NAV_ICONS.account, href: '#/account' }
  ];
}

function getUserRoleLabel(user) {
  var userGroup = String(user.UserGroupID || user.UserGroup || '').toLowerCase();
  if (userGroup === 'admin' || userGroup.indexOf('admin') >= 0) return 'Quản trị viên';
  if (userGroup === 'ql' || userGroup === 'manager' || userGroup === 'quanly' || userGroup === 'quản lý') return 'Quản lý';
  var managerFlag = user.Manager !== undefined ? user.Manager : user.manager;
  var isManagerFlag = user.IsManager !== undefined ? user.IsManager : user.isManager;
  if (Number(managerFlag) === 1 || isManagerFlag === true || Number(isManagerFlag) === 1) return 'Quản lý';
  if (user.EmployeeID && user.ManagerID && String(user.EmployeeID).toLowerCase() === String(user.ManagerID).toLowerCase()) return 'Quản lý';

  var explicitRole = user.RoleName || user.UserRoleName || user.GroupName || user.UserGroupName;
  if (explicitRole) return explicitRole;

  if (managerFlag === 0 || managerFlag === '0' || user.EmployeeID || user.ManagerID) return 'Trình dược viên';
  return 'Chưa xác định';
}

function renderSidebar(activeTab, base) {
  activeTab = activeTab || 'home';
  var collapsed = localStorage.getItem('sidebar-collapsed') === 'true';

  // Get current user info from localStorage
  var user = {};
  try {
    user = JSON.parse(localStorage.getItem('auth_user') || '{}');
  } catch (e) {}
  var tabs = getSidebarTabs(activeTab, user);
  var displayName = user.DisplayName || user.UserName || 'Trình dược viên';
  var roleLabel = getUserRoleLabel(user);
  var avatarSrc = '';
  if (user.Avatar) {
    avatarSrc = user.Avatar.startsWith('data:') ? user.Avatar : 'data:image/jpeg;base64,' + user.Avatar;
  } else {
    avatarSrc = 'https://ui-avatars.com/api/?name=' + encodeURIComponent(displayName) + '&background=0b8a43&color=fff';
  }

  var backdropHTML = '<div class="sidebar-backdrop" id="sidebar-backdrop" onclick="closeSidebarMobile()"></div>';

  return backdropHTML +
    '<aside class="app-sidebar' + (collapsed ? ' collapsed' : '') + '" aria-label="Sidebar navigation">' +
    '<div class="sidebar-brand-wrapper">' +
    '  <div class="sidebar-brand">' +
    '    <img src="images/logo/medstand-icon.png" class="sidebar-logo" alt="Medstand Logo">' +
    '    <span class="sidebar-brand-text">MEDSTAND</span>' +
    '  </div>' +
    '  <button type="button" class="sidebar-toggle" aria-label="Điều khiển thanh điều hướng" onclick="toggleSidebar()">' +
    '    <svg class="icon-collapse" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="11 17 6 12 11 7"/><polyline points="18 17 13 12 18 7"/></svg>' +
    '    <svg class="icon-expand" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="13 17 18 12 13 7"/><polyline points="6 17 11 12 6 7"/></svg>' +
    '    <svg class="icon-close" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>' +
    '  </button>' +
    '</div>' +
    '<div class="sidebar-heading">MENU</div>' +
    '<nav class="sidebar-nav">' +
    tabs.map(function (t) {
      // Map active states based on path/id
      var isActive = (t.id === activeTab);
      if (activeTab === 'customer-management' && t.id === 'customers') isActive = true;
      if (activeTab === 'revenue' && t.id === 'reports') isActive = true;
      if (activeTab === 'rag-admin' && t.id === 'library') isActive = true;
      
      return '<a href="' + t.href + '" class="sidebar-item ' + (isActive ? 'active' : '') + '" data-tab="' + t.id + '" title="' + t.label + '" onclick="if(window.innerWidth<768)closeSidebarMobile()">' +
        '<span class="sidebar-icon">' + t.icon + '</span>' +
        '<span class="sidebar-label">' + t.label + '</span>' +
        '</a>';
    }).join('') +
    '</nav>' +
    '<div class="sidebar-footer">' +
    '  <a href="#/account" class="sidebar-user" title="Tài khoản">' +
    '    <img src="' + avatarSrc + '" class="sidebar-user-avatar" alt="">' +
    '    <div class="sidebar-user-info">' +
    '      <div class="sidebar-user-name">' + displayName + '</div>' +
    '      <div class="sidebar-user-role">' + roleLabel + '</div>' +
    '    </div>' +
    '  </a>' +
    '  <button class="sidebar-logout-btn" onclick="AuthService.logout()">' +
    '    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>' +
    '    <span>Đăng xuất</span>' +
    '  </button>' +
    '</div>' +
    '</aside>';
}

function toggleSidebar() {
  var $sidebar = $('.app-sidebar');
  if (!$sidebar.length) return;

  if (window.innerWidth < 768) {
    // Mobile: slide-in drawer with backdrop
    var isOpen = $sidebar.hasClass('open');
    if (isOpen) {
      closeSidebarMobile();
    } else {
      $sidebar.addClass('open');
      $('#sidebar-backdrop').addClass('active');
      document.body.style.overflow = 'hidden';
    }
  } else {
    // Desktop: collapse/expand icon-only mode
    $sidebar.toggleClass('collapsed');
    var isCollapsed = $sidebar.hasClass('collapsed');
    localStorage.setItem('sidebar-collapsed', isCollapsed);
    if (isCollapsed) {
      $('body').addClass('sidebar-collapsed');
    } else {
      $('body').removeClass('sidebar-collapsed');
    }
  }
}

function closeSidebarMobile() {
  $('.app-sidebar').removeClass('open');
  $('#sidebar-backdrop').removeClass('active');
  document.body.style.overflow = '';
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
  var tabs = getMobileTabs(activeTab);
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
