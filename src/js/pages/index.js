        $('#sidebar-container').html(renderSidebar('home', ''));
        $('#theme-toggle-container').html(renderThemeToggle());

        // ── Notification: load from API ──────────────────────────────────────
        (function loadNotifications() {
            var user = JSON.parse(localStorage.getItem('auth_user') || '{}');
            var userName = user.UserName || '';
            if (!userName) return;

            Http.get(API_CONFIG.ENDPOINTS.NOTIFICATION.LIST, { User: userName })
                .then(function (res) {
                    var records = res.records || res.data || [];
                    if (!Array.isArray(records)) records = [];
                    var $list = $('#notif-list');
                    var $badge = $('#notif-badge');

                    if (records.length === 0) {
                        $list.html('<li class="notif-item" style="text-align:center;color:var(--color-text-muted);padding:16px;">Không có thông báo</li>');
                        $badge.prop('hidden', true);
                        return;
                    }

                    // Đếm chưa đọc
                    var unreadCount = 0;
                    records.forEach(function (n) { if (!n.isView) unreadCount++; });

                    // Hiển thị badge
                    if (unreadCount > 0) {
                        $badge.text(unreadCount).prop('hidden', false);
                    } else {
                        $badge.prop('hidden', true);
                    }

                    // Render danh sách
                    var html = '';
                    records.forEach(function (n) {
                        var isUnread = !n.isView;
                        var title = n.title || '';
                        var body = n.body || '';
                        var timeStr = _timeAgo(n.sendTime);
                        html += '<li class="notif-item' + (isUnread ? ' unread' : '') + '" data-id="' + (n.notify_id || '') + '">'
                            + '<div class="notif-dot"></div>'
                            + '<div class="notif-content">'
                            + '<p class="notif-text">' + (title ? '<strong>' + _esc(title) + '</strong> ' : '') + _esc(body) + '</p>'
                            + '<span class="notif-time">' + timeStr + '</span>'
                            + '</div></li>';
                    });
                    $list.html(html);
                })
                .catch(function () {
                    $('#notif-list').html('<li class="notif-item" style="text-align:center;color:var(--color-text-muted);padding:16px;">Không thể tải thông báo</li>');
                });

            // Helper: escape HTML
            function _esc(s) {
                var d = document.createElement('div');
                d.appendChild(document.createTextNode(s));
                return d.innerHTML;
            }

            // Helper: tính thời gian trước
            function _timeAgo(dateStr) {
                if (!dateStr) return '';
                var d = new Date(dateStr);
                var now = new Date();
                var diff = Math.floor((now - d) / 1000);
                if (diff < 60) return 'Vừa xong';
                if (diff < 3600) return Math.floor(diff / 60) + ' phút trước';
                if (diff < 86400) return Math.floor(diff / 3600) + ' giờ trước';
                if (diff < 172800) return 'Hôm qua';
                return Math.floor(diff / 86400) + ' ngày trước';
            }
        })();

        // Notification toggle
        $('#btn-notif').on('click', function (e) {
            e.stopPropagation();
            $('#notif-dropdown').toggleClass('active');
        });

        $('#btn-mark-read').on('click', function () {
            $('.notif-item.unread').removeClass('unread');
            $('#notif-badge').prop('hidden', true);
        });

        // Close dropdown when clicking outside
        $(document).on('click', function (e) {
            var $wrapper = $('.header-notification');
            var $dd = $('#notif-dropdown');
            if ($wrapper.length && $dd.length && !$wrapper[0].contains(e.target)) {
                $dd.removeClass('active');
            }
        });
