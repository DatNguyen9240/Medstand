    AuthService.syncUserDisplay('.profile-name', '.profile-avatar');

    // Chặn luồng: Hiển thị Quản lý RAG nếu người dùng là admin
    try {
        var userStr = localStorage.getItem('auth_user');
        if (userStr) {
            var user = JSON.parse(userStr);
            var isRoleAdmin = user.Role && user.Role.toString().toLowerCase().includes('admin');
            var isNameAdmin = user.DisplayName && user.DisplayName.toLowerCase().includes('admin');
            var isUserAdmin = user.UserName && user.UserName.toLowerCase().includes('admin');
            
            if (isRoleAdmin || isNameAdmin || isUserAdmin || user.Admin === 1) {
                var $ragLink = document.getElementById('admin-rag-link');
                if ($ragLink) $ragLink.style.display = 'flex';
            }
        }
    } catch(e) {}

    document.getElementById('btn-logout').addEventListener('click', function (e) {
      e.preventDefault();
      document.getElementById('logout-overlay').classList.add('active');
    });

    document.getElementById('btn-cancel-logout').addEventListener('click', function () {
      document.getElementById('logout-overlay').classList.remove('active');
    });

    document.getElementById('btn-confirm-logout').addEventListener('click', function () {
      AuthService.logout();
    });

    document.getElementById('logout-overlay').addEventListener('click', function (e) {
      if (e.target === this) this.classList.remove('active');
    });
