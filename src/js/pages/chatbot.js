// -- AI Chatbot Page ----------------------------------------------------------
(function () {
    var CHAT_API = 'https://danggg.app.n8n.cloud/webhook/api-nha-thuoc';
    var CHAT_API_KEY = 'test123456';
    var CACHE_KEY = 'ai_chat_history';
    var CACHE_TTL = 30 * 60 * 1000; // 30 phút

    var user = JSON.parse(localStorage.getItem('auth_user') || '{}');
    var userName = user.UserName || '';

    // Get auth token from cookie
    function _getToken() {
        var match = document.cookie.match(/(?:^|; )auth_token=([^;]*)/);
        return match ? match[1] : '';
    }

    // ── SessionStorage cache with TTL ──
    function _loadCache() {
        try {
            var raw = sessionStorage.getItem(CACHE_KEY);
            if (!raw) return [];
            var data = JSON.parse(raw);
            // Check TTL
            if (data.ts && (Date.now() - data.ts > CACHE_TTL)) {
                sessionStorage.removeItem(CACHE_KEY);
                return [];
            }
            return data.messages || [];
        } catch (e) { return []; }
    }

    function _saveCache(messages) {
        try {
            sessionStorage.setItem(CACHE_KEY, JSON.stringify({
                ts: Date.now(),
                messages: messages
            }));
        } catch (e) { }
    }

    function _clearCache() {
        sessionStorage.removeItem(CACHE_KEY);
    }

    // ── DOM ──
    var $container = document.getElementById('chat-container');
    var $messages = document.getElementById('chat-messages');
    var $welcome = document.getElementById('chat-welcome');
    var $input = document.getElementById('chat-input');
    var $btnSend = document.getElementById('btn-send');
    var $btnClear = document.getElementById('btn-clear-chat');

    var chatHistory = _loadCache();

    // ── Render cached messages ──
    function _renderHistory() {
        if (chatHistory.length === 0) {
            $welcome.style.display = '';
            $messages.innerHTML = '';
            return;
        }
        $welcome.style.display = 'none';
        var html = '';
        chatHistory.forEach(function (msg) {
            html += _bubbleHTML(msg.role, msg.content, msg.time);
        });
        $messages.innerHTML = html;
        _scrollBottom();
    }

    function _bubbleHTML(role, content, time) {
        var cls = role === 'user' ? 'user' : 'ai';
        var timeStr = time ? _formatTime(time) : '';
        // Escape HTML for user messages, allow basic formatting for AI
        var text = role === 'user' ? _esc(content) : _formatAI(content);
        return '<div class="chat-bubble ' + cls + '">'
            + '<div class="chat-bubble-body">' + text + '</div>'
            + (timeStr ? '<span class="chat-bubble-time">' + timeStr + '</span>' : '')
            + '</div>';
    }

    function _formatAI(text) {
        // Basic markdown-lite: **bold**, newlines → <br>
        return _esc(text)
            .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
            .replace(/\n/g, '<br>');
    }

    function _esc(s) {
        var d = document.createElement('div');
        d.appendChild(document.createTextNode(s));
        return d.innerHTML;
    }

    function _formatTime(ts) {
        var d = new Date(ts);
        var h = d.getHours();
        var m = d.getMinutes();
        return (h < 10 ? '0' : '') + h + ':' + (m < 10 ? '0' : '') + m;
    }

    function _scrollBottom() {
        setTimeout(function () {
            $container.scrollTop = $container.scrollHeight;
        }, 50);
    }

    // ── Add message ──
    function _addMessage(role, content) {
        var msg = { role: role, content: content, time: Date.now() };
        chatHistory.push(msg);
        _saveCache(chatHistory);

        $welcome.style.display = 'none';
        $messages.insertAdjacentHTML('beforeend', _bubbleHTML(role, content, msg.time));
        _scrollBottom();
    }

    // ── Typing indicator ──
    function _showTyping() {
        var html = '<div class="chat-typing" id="chat-typing">'
            + '<div class="chat-typing-dot"></div>'
            + '<div class="chat-typing-dot"></div>'
            + '<div class="chat-typing-dot"></div>'
            + '</div>';
        $messages.insertAdjacentHTML('beforeend', html);
        _scrollBottom();
    }

    function _hideTyping() {
        var el = document.getElementById('chat-typing');
        if (el) el.remove();
    }

    // ── Send message ──
    function _send() {
        var text = $input.value.trim();
        if (!text) return;

        // Add user message
        _addMessage('user', text);
        $input.value = '';
        _autoResize();
        $btnSend.disabled = true;

        // Show typing
        _showTyping();

        // API call
        fetch(CHAT_API, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': 'Bearer ' + _getToken(),
                'x-api-key': CHAT_API_KEY
            },
            body: JSON.stringify({
                action: 'chat',
                username: userName || 'Demo',
                text: text
            })
        })
            .then(function (res) { return res.json().catch(function () { return res.text(); }); })
            .then(function (res) {
                _hideTyping();
                var reply = '';
                if (typeof res === 'string') {
                    reply = res;
                } else if (res && res.reply) {
                    reply = res.reply;
                } else if (res && res.message) {
                    reply = res.message;
                } else if (res && res.data) {
                    reply = typeof res.data === 'string' ? res.data : JSON.stringify(res.data);
                } else {
                    reply = JSON.stringify(res);
                }
                _addMessage('ai', reply);
            })
            .catch(function () {
                _hideTyping();
                _addMessage('ai', 'Xin lỗi, tôi không thể phản hồi lúc này. Vui lòng thử lại sau.');
            });
    }

    // ── Auto-resize textarea ──
    function _autoResize() {
        $input.style.height = 'auto';
        $input.style.height = Math.min($input.scrollHeight, 120) + 'px';
    }

    // ── Events ──
    $input.addEventListener('input', function () {
        _autoResize();
        $btnSend.disabled = !$input.value.trim();
    });

    $input.addEventListener('keydown', function (e) {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            if ($input.value.trim()) _send();
        }
    });

    $btnSend.addEventListener('click', _send);

    $btnClear.addEventListener('click', function () {
        if (!chatHistory.length) return;
        chatHistory = [];
        _clearCache();
        $messages.innerHTML = '';
        $welcome.style.display = '';
    });

    // ── Suggestion chips ──
    document.querySelectorAll('.chat-chip').forEach(function (chip) {
        chip.addEventListener('click', function () {
            var msg = chip.getAttribute('data-msg');
            if (msg) {
                $input.value = msg;
                _send();
            }
        });
    });

    // ── Init ──
    _renderHistory();
    $input.focus();
})();
