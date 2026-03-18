// -- Notifications Page -------------------------------------------------------
(function () {
    var user = JSON.parse(localStorage.getItem('auth_user') || '{}');
    var userName = user.UserName || '';
    if (!userName) return;

    var $skeleton = $('#notif-skeleton');
    var $list = $('#notif-list');
    var $empty = $('#notif-empty');

    Http.get(API_CONFIG.ENDPOINTS.NOTIFICATION.LIST, { User: userName })
        .then(function (res) {
            var records = res.records || res.data || [];
            if (!Array.isArray(records)) records = [];

            // Hide skeleton
            $skeleton.prop('hidden', true);

            if (records.length === 0) {
                $empty.prop('hidden', false);
                return;
            }

            // Render list
            var html = '';
            records.forEach(function (n) {
                var isUnread = !n.isView;
                var title = n.title || '';
                var body = n.body || '';
                var timeStr = _timeAgo(n.sendTime);
                html += '<li class="notif-page-item' + (isUnread ? ' unread' : '') + '" data-id="' + (n.notify_id || '') + '">'
                    + '<div class="notif-page-dot"></div>'
                    + '<div class="notif-page-content">'
                    + '<p class="notif-page-text">' + (title ? '<strong>' + _esc(title) + '</strong> ' : '') + _esc(body) + '</p>'
                    + '<span class="notif-page-time">' + timeStr + '</span>'
                    + '</div></li>';
            });
            $list.html(html).prop('hidden', false);

            // Update badge on home
            var unreadCount = 0;
            records.forEach(function (n) { if (!n.isView) unreadCount++; });
            var $badge = $('#notif-badge');
            if (unreadCount > 0) {
                $badge.text(unreadCount).prop('hidden', false);
            } else {
                $badge.prop('hidden', true);
            }
        })
        .catch(function () {
            $skeleton.prop('hidden', true);
            $list.html('<li class="notif-page-item" style="text-align:center;color:var(--color-text-muted);padding:24px;">Không thể tải thông báo</li>').prop('hidden', false);
        });

    // Mark all as read
    $('#btn-mark-read').on('click', function () {
        $('.notif-page-item.unread').removeClass('unread');
        $('#notif-badge').prop('hidden', true);
    });

    // Helper: escape HTML
    function _esc(s) {
        var d = document.createElement('div');
        d.appendChild(document.createTextNode(s));
        return d.innerHTML;
    }

    // Helper: time ago
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
