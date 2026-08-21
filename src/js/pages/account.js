    AuthService.syncUserDisplay('.profile-name', '.profile-avatar');

    var pushButton = document.getElementById('btn-push-toggle');
    var pushLabel = document.getElementById('push-toggle-label');
    function refreshPushState() {
      if (!pushButton || typeof NotificationPushService === 'undefined' || !NotificationPushService.supported()) {
        if (pushButton) pushButton.style.display = 'none';
        return Promise.resolve();
      }
      return NotificationPushService.currentSubscription().then(function (subscription) {
        pushLabel.textContent = subscription ? 'Tắt thông báo thiết bị' : 'Bật thông báo thiết bị';
        pushButton.setAttribute('aria-pressed', subscription ? 'true' : 'false');
      });
    }
    if (pushButton) {
      pushButton.addEventListener('click', function () {
        pushButton.disabled = true;
        NotificationPushService.currentSubscription()
          .then(function (subscription) {
            return subscription ? NotificationPushService.unsubscribe() : NotificationPushService.subscribe();
          })
          .then(refreshPushState)
          .catch(function (error) { Alert.error(error.message || 'Không thể cập nhật thông báo thiết bị.'); })
          .finally(function () { pushButton.disabled = false; });
      });
      refreshPushState().catch(function () {});
    }

    // Chặn luồng: Hiển thị Quản lý RAG nếu người dùng là admin
    try {
        var userStr = localStorage.getItem('auth_user');
        if (userStr) {
            var user = JSON.parse(userStr);
            var isRoleAdmin = user.Role && user.Role.toString().toLowerCase().includes('admin');
            var isNameAdmin = user.DisplayName && user.DisplayName.toLowerCase().includes('admin');
            var isUserAdmin = user.UserName && user.UserName.toLowerCase().includes('admin');
            
            // Trang này giờ gồm cả Quản lý Tri thức (RAG, chỉ admin) và Quản lý CTBH
            // (mở rộng cho cấp quản lý — khớp guard SQL của API_PromotionProgram_*_AI).
            // Mỗi phần bên trong trang vẫn được API riêng chặn quyền đúng theo vai trò;
            // hiện link ở đây chỉ là điều hướng, không thay cho việc chặn quyền phía server.
            var isManagerOrAbove = typeof isManagerNavUser === 'function' && isManagerNavUser(user);
            if (isRoleAdmin || isNameAdmin || isUserAdmin || user.Admin === 1 || isManagerOrAbove) {
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
