    $('#sidebar-container').html(renderSidebar('account', ''));
    $('#nav-container').html(renderNavBar('account', ''));
    $('#theme-toggle-container').html(renderThemeToggle());
    AuthService.syncUserDisplay('.profile-name', '.profile-avatar');

    document.getElementById('btn-logout').addEventListener('click', function (e) {
      e.preventDefault();
      document.getElementById('logout-overlay').classList.add('active');
    });

    document.getElementById('btn-cancel-logout').addEventListener('click', function () {
      document.getElementById('logout-overlay').classList.remove('active');
    });

    document.getElementById('btn-confirm-logout').addEventListener('click', function () {
      localStorage.removeItem('auth_token');
      localStorage.removeItem('auth_user');
      fetch(API_CONFIG.BASE_URL + API_CONFIG.ENDPOINTS.AUTH.LOGOUT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      }).catch(function () { });
      window.location.href = 'login.html';
    });

    document.getElementById('logout-overlay').addEventListener('click', function (e) {
      if (e.target === this) this.classList.remove('active');
    });
