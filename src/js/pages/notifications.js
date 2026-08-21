// -- Notifications Page -------------------------------------------------------
(function () {
    var $skeleton = $('#notif-skeleton');
    var $list = $('#notif-list');
    var $empty = $('#notif-empty');
    var $error = $('#notif-error');
    var $status = $('#notif-status');
    var $prev = $('#notif-prev');
    var $next = $('#notif-next');
    var $pageLabel = $('#notif-page-label');
    var $unreadOnly = $('#notif-unread-only');
    var $modal = $('#notif-detail-modal');
    var page = 1;
    var pageSize = 20;
    var totalCount = 0;

    function recordsOf(res) {
        var data = res && res.data !== undefined ? res.data : res;
        if (data && Array.isArray(data.records)) return data.records;
        if (Array.isArray(data)) return data;
        if (res && Array.isArray(res.records)) return res.records;
        return [];
    }

    function valueOf(record, names, fallback) {
        for (var i = 0; i < names.length; i += 1) {
            if (record && record[names[i]] !== undefined && record[names[i]] !== null) {
                return record[names[i]];
            }
        }
        return fallback;
    }

    function setBadge(count) {
        var value = Math.max(0, Number(count) || 0);
        var $badge = $('#notif-badge');
        if (value > 0) $badge.text(value).prop('hidden', false);
        else $badge.prop('hidden', true);
    }

    function requestId() {
        if (window.crypto && typeof window.crypto.randomUUID === 'function') {
            return 'req-' + window.crypto.randomUUID();
        }
        return 'req-noti-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2);
    }

    function loadList() {
        $skeleton.prop('hidden', false);
        $list.prop('hidden', true).empty();
        $empty.prop('hidden', true);
        $error.prop('hidden', true);
        $status.text('');

        return Http.get(API_CONFIG.ENDPOINTS.NOTIFICATION.LIST, {
            Action: 'LIST',
            Page: page,
            PageSize: pageSize,
            UnreadOnly: $unreadOnly.prop('checked') ? 1 : 0
        }, { cache: false })
            .then(function (res) {
                var records = recordsOf(res);
                var first = records[0] || {};
                totalCount = Number(valueOf(first, ['TotalCount', 'totalCount'], records.length)) || 0;
                var unreadCount = Number(valueOf(first, ['UnreadCount', 'unreadCount'], 0)) || 0;
                var totalPages = Math.max(1, Math.ceil(totalCount / pageSize));

                if (page > totalPages) {
                    page = totalPages;
                    return loadList();
                }

                $skeleton.prop('hidden', true);
                $pageLabel.text('Trang ' + page + '/' + totalPages);
                $prev.prop('disabled', page <= 1);
                $next.prop('disabled', page >= totalPages);
                setBadge(unreadCount);

                if (!records.length) {
                    $empty.prop('hidden', false);
                    return;
                }

                var html = '';
                records.forEach(function (record) {
                    var id = Number(valueOf(record, ['NotificationID', 'notificationId'], 0)) || 0;
                    var isUnread = !valueOf(record, ['IsView', 'isView'], false);
                    var title = String(valueOf(record, ['Title', 'title'], ''));
                    var summary = String(valueOf(record, ['Summary', 'summary', 'Body', 'body'], ''));
                    var type = String(valueOf(record, ['NotificationType', 'notificationType'], 'ANNOUNCEMENT'));
                    var priority = Number(valueOf(record, ['Priority', 'priority'], 50)) || 50;
                    var effectiveAt = valueOf(record, ['EffectiveFromUtc', 'effectiveFromUtc'], '');

                    html += '<li class="notif-page-item' + (isUnread ? ' unread' : '') + '">' +
                        '<button type="button" class="notif-page-button" data-notification-id="' + id + '">' +
                        '<span class="notif-page-dot" aria-hidden="true"></span>' +
                        '<span class="notif-page-content">' +
                        '<span class="notif-page-meta"><span>' + esc(type) + '</span>' +
                        (priority <= 10 ? '<span class="notif-priority">Khẩn</span>' : '') + '</span>' +
                        '<strong class="notif-page-title">' + esc(title) + '</strong>' +
                        '<span class="notif-page-text">' + esc(summary) + '</span>' +
                        '<span class="notif-page-time">' + esc(timeAgo(effectiveAt)) + '</span>' +
                        '</span></button></li>';
                });
                $list.html(html).prop('hidden', false);
            })
            .catch(function (error) {
                console.warn('[Notifications] Failed to load list:', error);
                $skeleton.prop('hidden', true);
                $error.prop('hidden', false);
            });
    }

    function openDetail(notificationId, $row) {
        if (!notificationId) return;
        $status.text('Đang tải chi tiết...');

        Http.get(API_CONFIG.ENDPOINTS.NOTIFICATION.DETAIL, {
            Action: 'DETAIL',
            NotificationID: notificationId
        }, { cache: false })
            .then(function (res) {
                var record = recordsOf(res)[0];
                if (!record) throw new Error('Không tìm thấy thông báo.');

                $('#notif-detail-title').text(valueOf(record, ['Title', 'title'], 'Thông báo'));
                $('#notif-detail-meta').text(timeAgo(valueOf(record, ['EffectiveFromUtc', 'effectiveFromUtc'], '')));
                $('#notif-detail-body').text(valueOf(record, ['Body', 'body'], ''));
                $modal.prop('hidden', false);
                document.body.style.overflow = 'hidden';
                $('#notif-detail-close').trigger('focus');
                $status.text('');

                if (!valueOf(record, ['IsView', 'isView'], false)) {
                    return markRead(notificationId, $row);
                }
            })
            .catch(function (error) {
                console.warn('[Notifications] Failed to load detail:', error);
                $status.text(error.message || 'Không thể tải chi tiết thông báo.');
            });
    }

    function markRead(notificationId, $row) {
        var idempotencyKey = requestId();
        return Http.post(API_CONFIG.ENDPOINTS.NOTIFICATION.MARK_READ, {
            Action: 'MARK_READ',
            NotificationID: notificationId,
            RequestID: idempotencyKey
        }, { idempotencyKey: idempotencyKey })
            .then(function () {
                $row.removeClass('unread');
                return Http.get(API_CONFIG.ENDPOINTS.NOTIFICATION.UNREAD_COUNT, {}, { cache: false });
            })
            .then(function (res) {
                var record = recordsOf(res)[0] || (res && res.data) || res || {};
                setBadge(valueOf(record, ['UnreadCount', 'unreadCount'], 0));
            })
            .catch(function (error) {
                console.warn('[Notifications] Failed to mark read:', error);
            });
    }

    function closeDetail() {
        $modal.prop('hidden', true);
        document.body.style.overflow = '';
    }

    function esc(value) {
        var node = document.createElement('div');
        node.appendChild(document.createTextNode(String(value || '')));
        return node.innerHTML;
    }

    function timeAgo(dateValue) {
        if (!dateValue) return '';
        var date = new Date(dateValue);
        if (isNaN(date.getTime())) return '';
        var seconds = Math.floor((new Date() - date) / 1000);
        if (seconds < 0) return date.toLocaleString('vi-VN');
        if (seconds < 60) return 'Vừa xong';
        if (seconds < 3600) return Math.floor(seconds / 60) + ' phút trước';
        if (seconds < 86400) return Math.floor(seconds / 3600) + ' giờ trước';
        if (seconds < 172800) return 'Hôm qua';
        return Math.floor(seconds / 86400) + ' ngày trước';
    }

    $list.on('click', '.notif-page-button', function () {
        var $row = $(this).closest('.notif-page-item');
        openDetail(Number($(this).attr('data-notification-id')), $row);
    });
    $prev.on('click', function () { if (page > 1) { page -= 1; loadList(); } });
    $next.on('click', function () { if (page * pageSize < totalCount) { page += 1; loadList(); } });
    $unreadOnly.on('change', function () { page = 1; loadList(); });
    $('#notif-retry').on('click', loadList);
    $('#notif-detail-close').on('click', closeDetail);
    $modal.on('click', function (event) { if (event.target === this) closeDetail(); });
    $(document).on('keydown.noti001', function (event) {
        if (event.key === 'Escape' && !$modal.prop('hidden')) closeDetail();
    });

    window._pageCleanupHooks = window._pageCleanupHooks || [];
    window._pageCleanupHooks.push(function () {
        $(document).off('keydown.noti001');
        document.body.style.overflow = '';
    });

    loadList();
})();
