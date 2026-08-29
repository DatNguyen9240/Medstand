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

    var telegramLinkButton = document.getElementById('btn-telegram-link');
    var telegramOverlay = document.getElementById('telegram-link-overlay');
    var telegramCloseButton = document.getElementById('btn-close-telegram-link');
    var telegramGenerateButton = document.getElementById('btn-generate-telegram-code');
    var telegramResult = document.getElementById('telegram-link-result');
    var telegramCode = document.getElementById('telegram-link-code');
    var telegramCommand = document.getElementById('telegram-link-command');
    var telegramExpiry = document.getElementById('telegram-link-expiry');
    var telegramCountdownTimer = null;

    function stopTelegramCountdown() {
      if (telegramCountdownTimer) clearInterval(telegramCountdownTimer);
      telegramCountdownTimer = null;
    }

    function closeTelegramLink() {
      stopTelegramCountdown();
      if (telegramOverlay) telegramOverlay.classList.remove('active');
    }

    function startTelegramCountdown(seconds) {
      stopTelegramCountdown();
      var remaining = Math.max(0, Number(seconds || 300));
      function render() {
        if (!telegramExpiry) return;
        if (remaining <= 0) {
          telegramExpiry.textContent = 'Mã đã hết hạn. Hãy tạo mã mới.';
          if (telegramCode) telegramCode.classList.add('expired');
          stopTelegramCountdown();
          return;
        }
        var minutes = Math.floor(remaining / 60);
        var secondsPart = String(remaining % 60).padStart(2, '0');
        telegramExpiry.textContent = 'Hết hạn sau ' + minutes + ':' + secondsPart;
        remaining -= 1;
      }
      render();
      telegramCountdownTimer = setInterval(render, 1000);
    }

    if (telegramLinkButton && telegramOverlay) {
      telegramLinkButton.addEventListener('click', function () {
        telegramOverlay.classList.add('active');
      });
      telegramCloseButton.addEventListener('click', closeTelegramLink);
      telegramOverlay.addEventListener('click', function (event) {
        if (event.target === telegramOverlay) closeTelegramLink();
      });
    }

    if (telegramGenerateButton) {
      telegramGenerateButton.addEventListener('click', function () {
        telegramGenerateButton.disabled = true;
        telegramGenerateButton.textContent = 'Đang tạo mã…';
        Http.post('/webhook/telegram-link-code-issue', {})
          .then(function (response) {
            var payload = response && response.data && !response.linkCode ? response.data : response;
            var code = String(payload && payload.linkCode || '');
            if (!payload || payload.success !== true || !/^\d{6}$/.test(code)) {
              throw new Error(payload && payload.message || 'Không thể tạo mã liên kết Telegram.');
            }
            telegramCode.textContent = code;
            telegramCode.classList.remove('expired');
            telegramCommand.textContent = '/login ' + code;
            telegramResult.hidden = false;
            telegramGenerateButton.textContent = 'Tạo mã mới';
            startTelegramCountdown(payload.expiresInSeconds || 300);
          })
          .catch(function (error) {
            telegramGenerateButton.textContent = 'Thử tạo lại';
            Alert.error(error.message || 'Không thể tạo mã liên kết Telegram.');
          })
          .finally(function () {
            telegramGenerateButton.disabled = false;
          });
      });
    }

    if (telegramCode) {
      telegramCode.addEventListener('click', function () {
        var value = String(telegramCode.textContent || '').trim();
        if (!/^\d{6}$/.test(value) || telegramCode.classList.contains('expired')) return;
        if (navigator.clipboard && navigator.clipboard.writeText) {
          navigator.clipboard.writeText('/login ' + value)
            .then(function () { Alert.success('Đã sao chép lệnh /login.'); })
            .catch(function () {});
        }
      });
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
