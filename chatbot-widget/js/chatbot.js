// -- AI Chatbot Page ----------------------------------------------------------

// Cấu hình: đc từ API_CONFIG (api.config.js) — KHÔNG hardcode URL/key ở đây

(function () {

    // ─── CIPHER HELPER (XOR + Base64) ───
    var Cipher = {
        encrypt: function (str, key) {
            key = key || 107;
            var b64 = btoa(unescape(encodeURIComponent(str)));
            var xor = '';
            for (var i = 0; i < b64.length; i++) {
                xor += String.fromCharCode(b64.charCodeAt(i) ^ key);
            }
            return btoa(xor);
        },
        decrypt: function (b64Cipher, key) {
            key = key || 107;
            var xor = atob(b64Cipher);
            var b64 = '';
            for (var i = 0; i < xor.length; i++) {
                b64 += String.fromCharCode(xor.charCodeAt(i) ^ key);
            }
            return decodeURIComponent(escape(atob(b64)));
        }
    };

    var _cfg = (typeof API_CONFIG !== 'undefined') ? API_CONFIG : {};

    var CHAT_API = (_cfg.N8N_BASE || '') + (_cfg.CHAT_WEBHOOK || '/webhook/hook-ai-dainao');

    var CHAT_CASUAL_API = (_cfg.N8N_BASE || '') + (_cfg.CHAT_WEBHOOK || '/webhook/hook-ai-dainao');

    var CHAT_API_KEY = _cfg.CHAT_API_KEY || '';

    var CACHE_KEY = 'ai_chat_history';

    var CACHE_TTL = 8 * 60 * 60 * 1000; // 8 giờ — chat history lưu qua lại trang

    var USER_PHRASES_KEY = 'ai_user_phrases';

    var MAX_USER_PHRASES = 50;

    var MAX_FILE_SIZE = 10 * 1024 * 1024; // 10 MB



    // Khởi tạo Engine: loadSystemMeta sẽ được gọi SAU init() để đảm bảo
    // _cbGetToken đã được set trước khi gửi request (tránh 401 không có token).



    // Get logged in username dynamically

    function _user() {

        try {

            var authRaw = localStorage.getItem('auth_user') || localStorage.getItem('currentUser');

            if (authRaw) {

                var p = JSON.parse(authRaw);

                return p.UserName || p.Username || p.username || p.sub || p.Name || p.id || '';

            }

        } catch (e) { }

        return '';

    }



    // Get auth token from cookie

    function _getToken() {

        var match = document.cookie.match(/(?:^|; )auth_token=([^;]*)/);

        return match ? match[1] : '';

    }



    // Get or create session ID for chat

    function _getSessionId() {

        var uname = _user();

        var key = 'ai_chat_session_id' + (uname ? '_' + uname.toLowerCase() : '');

        var sid = sessionStorage.getItem(key);

        if (!sid) {

            sid = 'user_' + Date.now() + '_' + Math.random().toString(36).substring(2, 9);

            sessionStorage.setItem(key, sid);

        }

        return sid;

    }

    // P0A: each browser tab owns one conversation ID. The server derives its
    // own session fingerprint from the verified token; the client never sends it.
    function _getConversationId() {
        return _getSessionId();
    }

    function _contextResetKey() {
        var uname = _user();
        return 'ai_chat_reset_context' + (uname ? '_' + uname.toLowerCase() : '');
    }

    function _markConversationForReset(conversationId) {
        if (conversationId) sessionStorage.setItem(_contextResetKey(), conversationId);
    }

    function _consumeConversationReset() {
        var key = _contextResetKey();
        var previous = sessionStorage.getItem(key) || '';
        if (previous) sessionStorage.removeItem(key);
        return previous;
    }



    // ── LocalStorage cache with TTL (Phase 1) ──

    function _getSessionKey() {

        var uname = _user();

        return CACHE_KEY + (uname ? '_' + uname.toLowerCase() : '');

    }



    // ── IndexedDB Storage Core ──
    function _initDB() {
        return new Promise(function(resolve, reject) {
            try {
                var request = indexedDB.open('MedstandChatDB', 1);
                request.onupgradeneeded = function(e) {
                    var db = e.target.result;
                    if (!db.objectStoreNames.contains('history')) {
                        db.createObjectStore('history', { keyPath: 'sessionKey' });
                    }
                };
                request.onsuccess = function(e) { resolve(e.target.result); };
                request.onerror = function(e) { reject(e.target.error); };
            } catch(err) {
                reject(err);
            }
        });
    }

    function _loadCacheAsync() {
        return new Promise(function(resolve) {
            _initDB().then(function(db) {
                var transaction = db.transaction(['history'], 'readonly');
                var store = transaction.objectStore('history');
                var request = store.get(_getSessionKey());
                request.onsuccess = function(e) {
                    var data = e.target.result;
                    if (!data) return resolve([]);
                    if (data.ts && (Date.now() - data.ts > CACHE_TTL)) {
                        _clearCache();
                        var uname = _user();
                        var key = 'ai_chat_session_id' + (uname ? '_' + uname.toLowerCase() : '');
                        sessionStorage.removeItem(key);
                        return resolve([]);
                    }
                    resolve(data.messages || []);
                };
                request.onerror = function() { resolve([]); };
            }).catch(function() {
                try {
                    var raw = localStorage.getItem(_getSessionKey());
                    if (!raw) return resolve([]);
                    var data = JSON.parse(raw);
                    if (data.ts && (Date.now() - data.ts > CACHE_TTL)) {
                        localStorage.removeItem(_getSessionKey());
                        return resolve([]);
                    }
                    resolve(data.messages || []);
                } catch(e) { resolve([]); }
            });
        });
    }

    function _saveCacheAsync(messages) {
        _initDB().then(function(db) {
            var msgsToSave = messages || [];
            if (msgsToSave.length > 200) msgsToSave = msgsToSave.slice(-200);
            var transaction = db.transaction(['history'], 'readwrite');
            var store = transaction.objectStore('history');
            store.put({
                sessionKey: _getSessionKey(),
                ts: Date.now(),
                messages: msgsToSave
            });
        }).catch(function() {
            try {
                var msgsToSave = messages || [];
                if (msgsToSave.length > 100) msgsToSave = msgsToSave.slice(-100);
                localStorage.setItem(_getSessionKey(), JSON.stringify({
                    ts: Date.now(),
                    messages: msgsToSave
                }));
            } catch(e) {}
        });
    }

    function _clearCacheAsync() {
        _initDB().then(function(db) {
            var transaction = db.transaction(['history'], 'readwrite');
            var store = transaction.objectStore('history');
            store.delete(_getSessionKey());
        }).catch(function() {});
        try { localStorage.removeItem(_getSessionKey()); } catch(e) {}
    }

    // ── Synchronous wrappers for caller compatibility ──
    function _loadCache() {
        return [];
    }

    function _saveCache(messages) {
        _saveCacheAsync(messages);
    }

    function _clearCache() {
        _clearCacheAsync();
    }



    // ── User Phrase Cache (localStorage, persistent) ──

    function _loadUserPhrases() {

        try {

            var raw = localStorage.getItem(USER_PHRASES_KEY);

            return raw ? JSON.parse(raw) : [];

        } catch (e) { return []; }

    }



    function _saveUserPhrase(text) {

        if (!text || text.length < 3) return;

        if (text.charAt(0) === '📎') return;

        try {

            var phrases = _loadUserPhrases();

            var lower = text.toLowerCase();

            phrases = phrases.filter(function (p) { return p.toLowerCase() !== lower; });

            phrases.unshift(text);

            if (phrases.length > MAX_USER_PHRASES) phrases = phrases.slice(0, MAX_USER_PHRASES);

            localStorage.setItem(USER_PHRASES_KEY, JSON.stringify(phrases));

        } catch (e) { }

    }



    // ── DOM ──

    var $container = document.getElementById('chat-container');

    var $messages = document.getElementById('chat-messages');

    var $welcome = document.getElementById('chat-welcome');

    var $input = document.getElementById('chat-input');

    var $btnSend = document.getElementById('btn-send');

    var $btnAttach = document.getElementById('btn-attach');

    var $btnClear = document.getElementById('btn-clear-chat');
    var $btnTheme = document.getElementById('btn-theme-chatbot');

    var $fileInput = document.getElementById('chat-file-input');

    var $filePreview = document.getElementById('chat-file-preview');
    var $fileList = document.getElementById('chat-file-list');

    var $btnApi = document.getElementById('btn-api');

    // Load theme preference on startup
    try {
        var savedTheme = localStorage.getItem('medstand-theme') || localStorage.getItem('ai_chat_theme') || 'light';
        if (savedTheme === 'dark') {
            document.documentElement.setAttribute('data-theme', 'dark');
            document.body.classList.add('dark-theme', 'dark');
            setTimeout(function() {
                var containerEl = document.getElementById('chat-container');
                if (containerEl) containerEl.classList.add('dark-theme');
                
                var moonIcon = document.getElementById('chatbot-icon-moon');
                var sunIcon = document.getElementById('chatbot-icon-sun');
                if (moonIcon && sunIcon) {
                    moonIcon.style.display = 'none';
                    sunIcon.style.display = '';
                }
            }, 80);
        }
    } catch(e) {}

    var chatHistory = [];

    var selectedFiles = [];

    var abortController = null;

    var isWaitingAI = false;

    var _modalIdCounter = 0;

    var _UI_RENDERERS = {};

    var _modalDataCache = {}; // Cache cho data bảng/thẻ
    var _renderedRequestIds = new Set();

    function _claimResponseRequestId(requestId) {
        var normalized = requestId === null || requestId === undefined
            ? ''
            : String(requestId).trim();
        if (!normalized) return true;
        if (_renderedRequestIds.has(normalized)) {
            console.warn('[DUPLICATE_RESPONSE_SUPPRESSED]', { requestId: normalized });
            return false;
        }
        _renderedRequestIds.add(normalized);
        if (_renderedRequestIds.size > 100) {
            _renderedRequestIds.delete(_renderedRequestIds.values().next().value);
        }
        return true;
    }



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

            html += _bubbleHTML(msg.role, msg.content, msg.time, msg.fileName, msg.htmlContent);

        });

        $messages.innerHTML = html;

        _scrollBottom();

    }



    function _bubbleHTML(role, content, time, fileName, rawHtml) {
        var cls = role === 'user' ? 'user' : 'ai';
        var timeStr = time ? _formatTime(time) : '';

        var suggestionsHtml = '';
        var processedContent = content || '';

        if (role === 'ai' && typeof processedContent === 'string') {
            // Chuẩn hóa tiếng Việt có dấu, không có emoji/icon
            if (processedContent.indexOf('Tim thay ') === 0 && processedContent.indexOf(' ket qua.') !== -1) {
                processedContent = processedContent.replace('Tim thay ', 'Tìm thấy ').replace(' ket qua.', ' kết quả.');
            } else if (processedContent.indexOf('Đã tìm thấy ') === 0 && processedContent.indexOf(' kết quả.') !== -1) {
                processedContent = processedContent.replace('Đã tìm thấy ', 'Tìm thấy ');
            }
            if (processedContent === 'Khong tim thay du lieu') {
                processedContent = 'Không tìm thấy dữ liệu.';
            }

            var suggestMatch = processedContent.match(/<suggest>(.*?)<\/suggest>/i);
            if (suggestMatch) {
                var buttons = suggestMatch[1].split('|');
                suggestionsHtml = '<div class="ai-quick-replies" style="margin-top:10px; display:flex; flex-wrap:wrap; gap:5px;">';
                buttons.forEach(function (btn) {
                    var btnText = btn.trim();
                    if (btnText) {
                        suggestionsHtml += '<button type="button" style="background:#f0f4f8; border:1px solid #cce4f7; padding:6px 12px; border-radius:15px; font-size:13px; color:#1976d2; cursor:pointer;" onclick="var i=document.getElementById(\'chat-input\'); if(i){i.value=\'' + _esc(btnText) + '\'; i.focus();}">[ ' + _esc(btnText) + ' ]</button>';
                    }
                });
                suggestionsHtml += '</div>';
                processedContent = processedContent.replace(/<suggest>.*?<\/suggest>/ig, '');
            }

            processedContent = processedContent.replace(/\[Nguồn:\s*(.*?)\]/ig, function (match, sourceName) {
                return '<span class="ai-citation" style="display:inline-block; background:#e8f5e9; border:1px solid #c8e6c9; color:#2e7d32; font-size:12px; padding:2px 8px; border-radius:12px; margin:0 4px; cursor:pointer;" onclick="alert(\'Nguồn trích dẫn: ' + _esc(sourceName) + '\\n(Tính năng Split-view PDF sẽ được kích hoạt ở bản cập nhật sau)\');">[ Nguồn: ' + _esc(sourceName) + ' ]</span>';
            });
        }

        var text = rawHtml ? rawHtml : (role === 'user' ? _esc(processedContent) : _formatAI(processedContent));

        var hasCard = role === 'ai' && (
            text.indexOf('ai-card') !== -1 || 
            text.indexOf('ai-table') !== -1 || 
            text.indexOf('ai-summary') !== -1 || 
            text.indexOf('ai-sales-') !== -1 || 
            text.indexOf('ai-loyalty-') !== -1 ||
            text.indexOf('ai-catalog-') !== -1 ||
            text.indexOf('ai-focus-products') !== -1
        );
        if (hasCard) cls += ' has-table';
        if (role === 'ai' && text.indexOf('ai-sales-dashboard') !== -1) {
            cls += ' chat-message--data chat-message--dashboard';
        } else if (hasCard) {
            cls += ' chat-message--data';
        } else {
            cls += ' chat-message--text';
        }

        // Doanh số là ngữ cảnh báo cáo; hiển thị câu truy vấn như một chip lọc
        // gọn thay vì một toast xanh lớn tách khỏi dashboard.
        if (role === 'user' && /(?:@doanh_so|doanh\s*số)/i.test(String(processedContent || ''))) {
            cls += ' chat-query-sales';
        }

        var isErrorMessage = role === 'ai' && typeof processedContent === 'string' && (
            processedContent.indexOf('Xin lỗi, tôi không thể phản hồi') !== -1 ||
            processedContent.indexOf('Lỗi kết nối') !== -1 ||
            processedContent.indexOf('Lỗi hệ thống') !== -1 ||
            processedContent.indexOf('Không thể tải') !== -1
        );
        if (isErrorMessage) cls += ' error';

        var fileTag = '';
        if (fileName) {
            fileTag = '<div style="display:flex;align-items:center;gap:6px;margin-bottom:6px;font-size:12px;opacity:0.85">'
                + '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">'
                + '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>'
                + '<polyline points="14 2 14 8 20 8"></polyline></svg>'
                + '<span>' + _esc(fileName) + '</span></div>';
        }

        return '<div class="chat-bubble ' + cls + '">'
            + fileTag
            + '<div class="chat-bubble-body">' + text + '</div>'
            + suggestionsHtml
            + (timeStr ? '<span class="chat-bubble-time">' + timeStr + '</span>' : '')
            + '</div>';
    }
    function _formatAI(text) {

        var parts = text.split(/(```[\s\S]*?```)/g);

        var html = '';

        for (var i = 0; i < parts.length; i++) {

            if (parts[i].match(/^```/)) {

                var code = parts[i].replace(/^```(\w*)\n?/, '').replace(/\n?```$/, '');

                html += '<pre class="ai-code-block"><code>' + _esc(code) + '</code></pre>';

            } else {

                html += _formatAIBlock(parts[i]);

            }

        }

        return html;

    }



    function _formatAIBlock(text) {

        var paragraphs = text.split(/\n\n+/);

        var result = [];

        paragraphs.forEach(function (para) {

            para = para.trim();

            if (!para) return;

            var lines = para.split('\n');

            if (lines.length >= 2 && lines[0].indexOf('|') !== -1 && lines[1].match(/^\s*\|[\s\-:|]+\|\s*$/)) {

                result.push(_formatTable(lines));

                return;

            }

            var isList = lines.every(function (l) {

                return l.trim() === '' || /^(\s*[-*•]\s|^\s*\d+[.)]\s)/.test(l);

            });

            if (isList && lines.length > 0) {

                result.push(_formatList(lines));

                return;

            }

            var lineResults = [];

            lines.forEach(function (line) {

                var trimmed = line.trim();

                if (!trimmed) return;

                if (/^[-*_]{3,}$/.test(trimmed)) {

                    lineResults.push('<hr class="ai-hr">');

                    return;

                }

                var hMatch = trimmed.match(/^(#{1,6})\s+(.*)/);

                if (hMatch) {

                    var level = hMatch[1].length;

                    lineResults.push('<h' + level + ' class="ai-heading">' + _inlineFormat(hMatch[2]) + '</h' + level + '>');

                    return;

                }

                lineResults.push(_inlineFormat(trimmed));

            });

            if (lineResults.length > 0) {

                result.push('<p class="ai-para">' + lineResults.join('<br>') + '</p>');

            }

        });

        return result.join('');

    }



    function _inlineFormat(text) {

        return _esc(text)

            .replace(/\*\*\*(.*?)\*\*\*/g, '<strong><em>$1</em></strong>')

            .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')

            .replace(/\*(.*?)\*/g, '<em>$1</em>')

            .replace(/`([^`]+)`/g, '<code class="ai-inline-code">$1</code>');

    }



    function _formatList(lines) {

        var isOrdered = /^\s*\d+[.)]\s/.test(lines[0].trim());

        var tag = isOrdered ? 'ol' : 'ul';

        var items = [];

        lines.forEach(function (line) {

            var trimmed = line.trim();

            if (!trimmed) return;

            var content = trimmed.replace(/^[-*•]\s+/, '').replace(/^\d+[.)]\s+/, '');

            items.push('<li>' + _inlineFormat(content) + '</li>');

        });

        return '<' + tag + ' class="ai-list">' + items.join('') + '</' + tag + '>';

    }



    function _formatTable(lines) {

        var html = '<div class="ai-table-wrap"><table class="ai-table">';

        var headers = lines[0].split('|').map(function (c) { return c.trim(); }).filter(function (c) { return c !== ''; });

        html += '<thead><tr>';

        headers.forEach(function (h) { html += '<th>' + _inlineFormat(h) + '</th>'; });

        html += '</tr></thead><tbody>';

        for (var i = 2; i < lines.length; i++) {

            var cells = lines[i].split('|').map(function (c) { return c.trim(); }).filter(function (c) { return c !== ''; });

            if (cells.length === 0) continue;

            html += '<tr>';

            cells.forEach(function (c) { html += '<td>' + _inlineFormat(c) + '</td>'; });

            html += '</tr>';

        }

        html += '</tbody></table></div>';

        return html;

    }



    function _esc(s) {

        var d = document.createElement('div');

        d.appendChild(document.createTextNode(s));

        return d.innerHTML;

    }



    // B dấu tiếng Việt — dùng cho search không phân biệt dấu

    function _clearVn(s) {

        if (!s) return '';

        var map = {

            'àáảãạăắặằẵẫâầấậẫẵ': 'a', 'ÀẢÃẠĂẮẶẰẴẪÂẦẤẬẪẴ': 'A',

            'èéẻẽẹêếểễệ': 'e', 'ÈÉẺẼẸÊỀẾỂỄỆ': 'E',

            'ìíỉĩị': 'i', 'ÌỈĨỊ': 'I',

            'òóõôồốổỗộơớởỡợ': 'o', 'ÒÓỎÕỌÔỒỔỖỘƠỜỚỞỠỢ': 'O',

            'ùúủũụưừứửữự': 'u', 'ÙÚỦŨỤƯỪỨỬỮỰ': 'U',

            'ỳýỷỹỵ': 'y', 'ỲỶỸỴ': 'Y',

            'đ': 'd', '': 'D'

        };

        return s.split('').map(function (c) {

            for (var group in map) {

                if (group.indexOf(c) !== -1) return map[group];

            }

            return c;

        }).join('').toLowerCase();

    }





    function _formatTime(ts) {

        var d = new Date(ts);

        var h = d.getHours();

        var m = d.getMinutes();

        return (h < 10 ? '0' : '') + h + ':' + (m < 10 ? '0' : '') + m;

    }



    function _formatFileSize(bytes) {

        if (bytes < 1024) return bytes + ' B';

        if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';

        return (bytes / (1024 * 1024)).toFixed(1) + ' MB';

    }



    function _scrollBottom() {

        requestAnimationFrame(function () {

            setTimeout(function () { $container.scrollTop = $container.scrollHeight; }, 80);

        });

    }



    function _addMessage(role, content, fileName, noTypewriter) {
        var msg = { role: role, content: content, time: Date.now() };
        if (fileName) msg.fileName = fileName;
        chatHistory.push(msg);
        _saveCache(chatHistory);
        $welcome.style.display = 'none';

        if (false) { // Disabled typewriter effect per user request
            var emptyBubble = _bubbleHTML(role, "", msg.time, fileName);
            $messages.insertAdjacentHTML('beforeend', emptyBubble);

            var textEls = $messages.querySelectorAll('.chat-bubble-body');
            var targetEl = textEls[textEls.length - 1];
            if (targetEl) {
                var i = 0;
                var textToType = content || '';
                function typeWriter() {
                    if (i < textToType.length) {
                        var charToType = textToType.charAt(i);
                        var currentText = textToType.substring(0, i + 1);
                        targetEl.innerHTML = _esc(currentText).replace(/\\n/g, '<br/>');
                        i++;
                        setTimeout(typeWriter, 15);
                        _scrollBottom();
                    }
                }
                typeWriter();
            } else {
                $messages.insertAdjacentHTML('beforeend', _bubbleHTML(role, content, msg.time, fileName));
            }
        } else {
            $messages.insertAdjacentHTML('beforeend', _bubbleHTML(role, content, msg.time, fileName));
        }
        _scrollBottom();
    }



    function _addHtmlMessage(htmlContent, summaryText, requestId) {

        if (!_claimResponseRequestId(requestId)) return false;

        var msg = { role: 'ai', content: summaryText || '📊 Kết quả', time: Date.now(), isHtml: true, htmlContent: htmlContent };
        if (requestId !== null && requestId !== undefined && String(requestId).trim()) {
            msg.requestId = String(requestId).trim();
        }

        chatHistory.push(msg);

        _saveCache(chatHistory);

        $welcome.style.display = 'none';

        $messages.insertAdjacentHTML('beforeend', _bubbleHTML('ai', msg.content, msg.time, null, htmlContent));

        _scrollBottom();

        return true;

    }



    function _showTyping() {

        var html = '<div class="chat-typing" id="chat-typing"><div class="chat-typing-dot"></div><div class="chat-typing-dot"></div><div class="chat-typing-dot"></div></div>';

        $messages.insertAdjacentHTML('beforeend', html);

        _scrollBottom();

    }



    function _hideTyping() {

        var el = document.getElementById('chat-typing');

        if (el) el.remove();

    }



    function _updateSendBtn() {

        var hasText = $input.value.trim().length > 0;

        var hasFile = selectedFiles.length > 0;

        $btnSend.disabled = !(hasText || hasFile || isWaitingAI);

    }



    function _renderFileList() {

        if (selectedFiles.length === 0) {

            $filePreview.style.display = 'none';

            $fileList.innerHTML = '';

            return;

        }

        $filePreview.style.display = 'block';

        $fileList.innerHTML = selectedFiles.map(function (f, i) {

            return '<div class="chat-file-item" data-idx="' + i + '">'

                + '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline></svg>'

                + '<span class="chat-file-item-name">' + _esc(f.name) + '</span>'

                + '<span class="chat-file-item-size">' + _formatFileSize(f.size) + '</span>'

                + '<button type="button" class="chat-file-item-remove" data-idx="' + i + '" aria-label="Xóa">'

                + '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>'

                + '</button></div>';

        }).join('');



        $fileList.querySelectorAll('.chat-file-item-remove').forEach(function (btn) {

            btn.addEventListener('click', function () {

                var idx = parseInt(this.getAttribute('data-idx'), 10);

                selectedFiles.splice(idx, 1);

                _renderFileList();

                _updateSendBtn();

            });

        });

    }



    function _clearFiles() {

        selectedFiles = [];

        if ($fileInput) $fileInput.value = '';

        _renderFileList();

        _updateSendBtn();

    }

    // Expose functions globally to avoid event listener attachment issues in SPA router
    window.ChatbotPage = {
        clearChat: function () {
            if (confirm('Sếp có chắc chắn muốn xóa sạch toàn bộ lịch sử trò chuyện này không?')) {
                _clearCache();
                var uname = _user();
                var key = 'ai_chat_session_id' + (uname ? '_' + uname.toLowerCase() : '');
                _markConversationForReset(_getSessionId());
                sessionStorage.removeItem(key); // Xóa session ngầm
                chatHistory = [];
                _renderHistory();
            }
        },
        toggleTheme: function () {
            try {
                // 1. Gọi hàm toggleTheme toàn cục của hệ thống trước để thay đổi trạng thái theme toàn cục
                if (typeof window.toggleTheme === 'function') {
                    window.toggleTheme();
                } else {
                    // Nếu không có theme manager toàn cục (fallback)
                    var currentTheme = document.documentElement.getAttribute('data-theme') || 'light';
                    var nextTheme = (currentTheme === 'dark') ? 'light' : 'dark';
                    document.documentElement.setAttribute('data-theme', nextTheme);
                    localStorage.setItem('medstand-theme', nextTheme);
                }

                // 2. Lấy trạng thái theme mới sau khi đã toggle
                var nextTheme = document.documentElement.getAttribute('data-theme') || 'light';
                var isDark = nextTheme === 'dark';
                
                // 3. Cập nhật các class cho body và container của chatbot
                document.body.classList.toggle('dark-theme', isDark);
                document.body.classList.toggle('dark', isDark);
                
                var containerEl = document.getElementById('chat-container');
                if (containerEl) {
                    containerEl.classList.toggle('dark-theme', isDark);
                }
                
                localStorage.setItem('ai_chat_theme', nextTheme);

                // 4. Cập nhật icon mặt trăng / mặt trời
                var moonIcon = document.getElementById('chatbot-icon-moon');
                var sunIcon = document.getElementById('chatbot-icon-sun');
                if (moonIcon && sunIcon) {
                    if (isDark) {
                        moonIcon.style.display = 'none';
                        sunIcon.style.display = '';
                    } else {
                        moonIcon.style.display = '';
                        sunIcon.style.display = 'none';
                    }
                }
            } catch(e) {}
        }
    };

    if ($btnClear) {
        $btnClear.onclick = window.ChatbotPage.clearChat;
    }

    $btnAttach.addEventListener('click', function () { $fileInput.click(); });

    $fileInput.addEventListener('change', function () {

        var files = $fileInput.files;

        if (!files) return;

        for (var i = 0; i < files.length; i++) {

            if (files[i].size <= MAX_FILE_SIZE) selectedFiles.push(files[i]);

        }

        _renderFileList();

        _updateSendBtn();

    });



    var STOP_ICON = '<svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="6" width="12" height="12" rx="2"></rect></svg>';

    var SEND_ICON = $btnSend.innerHTML;



    function _setStopMode(on) {

        isWaitingAI = on;

        if (on) {

            $btnSend.innerHTML = STOP_ICON;

            $btnSend.disabled = false;

            $btnSend.classList.add('stop-mode');
            $btnSend.setAttribute('aria-label', 'Dừng phản hồi');
            $btnSend.setAttribute('title', 'Dừng phản hồi');

        } else {

            $btnSend.innerHTML = SEND_ICON;

            $btnSend.classList.remove('stop-mode');
            $btnSend.setAttribute('aria-label', 'Gửi');
            $btnSend.removeAttribute('title');

            _updateSendBtn();

        }

    }



    function _stopAI() {

        if (window.ApiEngine && typeof window.ApiEngine.cancelPending === 'function') {
            window.ApiEngine.cancelPending();
        }

        if (abortController) {

            abortController.abort();

            abortController = null;

        }

        _hideTyping();

        _setStopMode(false);

        _addMessage('ai', 'Đã dừng phản hồi.');

    }



    function _send() {

        if (isWaitingAI) { _stopAI(); return; }

        if (window.ApiEngine && ApiEngine.handleSend && ApiEngine.handleSend()) return;

        var text = $input.value.trim();

        if (!text && selectedFiles.length === 0) return;



        // Tắt dropdown nếu gửi bằng free chat

        if (window.ApiEngine && window.ApiEngine.hideMenu) window.ApiEngine.hideMenu();
        if (typeof _mentionHide === 'function') _mentionHide();
        if (typeof _ghostClear === 'function') _ghostClear();



        var fileNames = selectedFiles.map(function (f) { return f.name; });

        var attachedFileName = fileNames.length > 0 ? fileNames.join(', ') : null;

        var displayText = text || ('📎 ' + attachedFileName);



        _saveUserPhrase(text);

        _addMessage('user', displayText, attachedFileName);

        $input.value = '';
        _autoResize();

        _updateSendBtn();



        _showTyping();
        abortController = new AbortController();
        _setStopMode(true);



        var sessionId = _getSessionId();

        var filesToSend = selectedFiles.slice();

        _clearFiles();



        Promise.all(filesToSend.map(function (file) {

            return new Promise(function (resolve) {

                var reader = new FileReader();

                reader.onload = function () { resolve({ name: file.name, data: reader.result, blob: file }); };

                reader.readAsDataURL(file);

            });

        })).then(function (fileList) {



            // --- KIỂM TRA LỆNH HỎI TÀI LIỆU RAG ---

            var normalizedText = String(text).trim().toLowerCase();

            if (normalizedText.indexOf('/h i') === 0 || normalizedText.indexOf('/hoi') === 0 || normalizedText.indexOf('/searchrag') === 0) {

                var queryText = String(text).replace(/^\/(h i|hoi|searchrag)/i, '').trim();



                if (!queryText) {

                    _hideTyping(); _setStopMode(false);

                    _addMessage('ai', 'Dạ sếp muốn tìm kiếm thông tin gì trong kho tài liệu ạ? (Ví dụ: `/h i Quy định đổi trả thuốc`)');

                    return;

                }



                _addMessage('ai', '   ang bới móc kho dữ liệu tài liệu RAG...');

                _doRAGSearch(queryText);



                $input.value = '';
                _autoResize();

                _updateSendBtn();

                return; // Ngắt luồng chat

            }



            // --- KIỂM TRA LỆNH NẠP RAG TỪ ỊNH DẠNG TEXT ---

            // Cú pháp: /nạp [Tiêu đ bắt buộc] | [Ngày hết hạn (Tuỳ chn)]

            var isUploadCommand = String(text).trim().toLowerCase().indexOf('/nạp') === 0 || String(text).trim().toLowerCase().indexOf('/rag') === 0;

            if (fileList.length > 0 && !isUploadCommand) {
                isUploadCommand = true;
                text = '/nạp ' + String(text).trim();
            }

            if (isUploadCommand) {

                if (fileList.length === 0) {

                    _hideTyping(); _setStopMode(false);

                    _addMessage('ai', ' ể sử dụng lệnh `/nạp`, bạn cần đính kèm ít nhất 1 file định dạng văn bản (PDF, DOCX, XLSX).');

                    return;

                }



                var titleText = String(text).substring(4).trim();

                var extractedExpiry = 'never'; // Bản N8N không hỗ trợ Auto-Extract, mặc định là never



                // Nếu khách có gạch dc "Tiêu đ | 2026-10-15"

                if (titleText.indexOf('|') !== -1) {

                    var parts = titleText.split('|');

                    titleText = parts[0].trim();

                    extractedExpiry = parts[1].trim();

                } else if (titleText.length === 0) {

                    titleText = fileList[0].name.split('.')[0];

                }



                var userStr = localStorage.getItem('auth_user');

                var role = 'user';

                var username = '';

                if (userStr) {

                    var u = JSON.parse(userStr);

                    role = u.Role || 'user';

                    username = u.UserName || u.Username || u.username || '';

                    if (u.Admin === 1 || String(u.DisplayName).toLowerCase().includes('admin') || String(u.UserName).toLowerCase().includes('admin')) {

                        role = 'admin'; // Override cho phép vượt rào dựa trên hint displayname

                    }

                }



                // Gửi bằng form data tới webhook admin-upload

                var doUpload = function (fileBlob) {

                    var formData = new FormData();

                    formData.append('file', fileBlob);

                    formData.append('title', titleText);

                    formData.append('expiryDate', extractedExpiry);

                    formData.append('role', role);

                    formData.append('username', username);



                    var webhookUrl = (_cfg.N8N_BASE || '') + (_cfg.ENDPOINTS && _cfg.ENDPOINTS.AI && _cfg.ENDPOINTS.AI.ADMIN_UPLOAD ? _cfg.ENDPOINTS.AI.ADMIN_UPLOAD : '/webhook/admin-upload');



                    fetch(webhookUrl, {

                        method: 'POST',

                        body: formData,

                        signal: abortController.signal

                    })

                        .then(function (res) { return res.json(); })

                        .then(function (result) {

                            _hideTyping(); _setStopMode(false);

                            var data = Array.isArray(result) ? result[0] : result;

                            if (data && data.status !== "error") {

                                let expiredText = data.expiryDate === 'never' ? 'Vĩnh viễn' : data.expiryDate;

                                let serverMsg = data.message || 'ã nạp thành công!';

                                _addMessage('ai', '✅ **' + serverMsg + '**\n\n- File: `' + fileList[0].name + '`\n- Tiêu đ: **' + (data.title || titleText) + '**\n- Hết hạn: **' + expiredText + '**');

                            } else {

                                _addMessage('ai', ' Không thể nạp tài liệu: ' + (data.error || data.message || 'Lỗi hệ thống'));

                            }

                        })

                        .catch(function (err) {

                            _hideTyping(); _setStopMode(false);

                            _addMessage('ai', ' Tải lên thất bại: ' + err.message);

                        });

                };



                var origFile = fileList[0].blob;

                var ext = fileList[0].name.split('.').pop().toLowerCase();



                if (ext === 'xls' || ext === 'xlsx') {

                    _addMessage('ai', ' ang bóc tách dữ liệu từ file ' + ext.toUpperCase() + '...');

                    if (!window.XLSX) {

                        var script = document.createElement('script');

                        script.src = 'https://cdn.sheetjs.com/xlsx-latest/package/dist/xlsx.full.min.js';

                        script.onload = function () { processExcel(origFile); };

                        document.head.appendChild(script);

                    } else {

                        processExcel(origFile);

                    }



                    function processExcel(f) {

                        var r = new FileReader();

                        r.onload = function (e) {

                            try {

                                var data = new Uint8Array(e.target.result);

                                var workbook = XLSX.read(data, { type: 'array' });

                                var firstSheet = workbook.Sheets[workbook.SheetNames[0]];

                                var csvStr = XLSX.utils.sheet_to_csv(firstSheet);

                                var b = new Blob([csvStr], { type: 'text/csv' });

                                var newF = new File([b], fileList[0].name.replace(/\.[^/.]+$/, "") + ".csv", { type: "text/csv" });

                                doUpload(newF);

                            } catch (err) {

                                _hideTyping(); _setStopMode(false);

                                _addMessage('ai', ' Lỗi đc Excel: ịnh dạng cổ bị hng hoặc file có bc mật khẩu.');

                            }

                        };

                        r.readAsArrayBuffer(f);

                    }

                } else {

                    doUpload(origFile);

                }



                return; // NGẮT luồng gửi chat

            }



            // -- Rút trích Lịch sử 10 câu gần nhất dồn vào payload --

            var pastMsgs = chatHistory.slice(-11, -1); // Lấy 10 câu trước (chừa câu hiện tại)

            var historyStr = pastMsgs.map(function (m) { return (m.role === 'user' ? 'User: ' : 'AI: ') + String(m.content).replace(/\n/g, ' '); }).join('\n');



            var conversationId = sessionId || _getConversationId();
            var payload = {
                action: 'chat',
                text: text || displayText,
                session_id: conversationId,
                conversationId: conversationId,
                resetConversationId: _consumeConversationReset(),
                files: fileList,
                history: historyStr
            };

            if (window.ApiEngine && window.ApiEngine.getActiveApi) {
                var activeApiObj = window.ApiEngine.getActiveApi();
                if (activeApiObj && (activeApiObj.execType === 'CART' || activeApiObj.execType === 'UPDATE' || activeApiObj.execType === 'INSERT')) {
                    payload.context = 'FORM_UPDATE';
                    payload.active_api = activeApiObj.apiCode;
                }
            }

            var relativeUrl = CHAT_API.replace(_cfg.N8N_BASE || '', '');
            var rawPayload = JSON.stringify({
                method: 'POST',
                endpoint: relativeUrl,
                body: payload
            });
            var encryptedData = Cipher.encrypt(rawPayload);
            var gatewayUrl = _cfg.GATEWAY_URL || '/api/gateway';

            fetch(gatewayUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + _getToken() },
                body: JSON.stringify({ data: encryptedData }),
                signal: abortController.signal
            })
                .then(function (res) {
                    return res.json().then(function (resJson) {
                        if (!res.ok) throw new Error("Lỗi Server Gateway (" + res.status + ")");
                        var decryptedText = Cipher.decrypt(resJson.data);
                        if (!decryptedText) throw new Error("Trả về dữ liệu trống.");
                        try { return JSON.parse(decryptedText); }
                        catch (e) { throw new Error("Dữ liệu không phải JSON: " + decryptedText.substring(0, 50)); }
                    });
                })
                .then(function (data) { _handleReply(data); })

                .catch(function (err) { _handleError(err); });

        });

    }



    function _callCasualChatFallback(lastText) {
        var text = $input.value.trim() || lastText || "Xin chào";
        var pastMsgs = chatHistory.slice(-11, -1);
        var historyStr = pastMsgs.map(function (m) { return (m.role === 'user' ? 'User: ' : 'AI: ') + String(m.content).replace(/\n/g, ' '); }).join('\n');

        _showTyping();
        abortController = new AbortController();
        _setStopMode(true);
        var conversationId = _getConversationId();
        var payload = {
            action: 'chat', text: text,
            session_id: conversationId,
            conversationId: conversationId,
            resetConversationId: _consumeConversationReset(),
            history: historyStr
        };

        var relativeUrl = CHAT_CASUAL_API.replace(_cfg.N8N_BASE || '', '');
        var rawPayload = JSON.stringify({
            method: 'POST',
            endpoint: relativeUrl,
            body: payload
        });
        var encryptedData = Cipher.encrypt(rawPayload);
        var gatewayUrl = _cfg.GATEWAY_URL || '/api/gateway';

        fetch(gatewayUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + _getToken() },
            body: JSON.stringify({ data: encryptedData }),
            signal: abortController.signal
        }).then(function (res) {
            return res.json();
        }).then(function (resJson) {
            _hideTyping();
            _setStopMode(false);
            var decryptedText = Cipher.decrypt(resJson.data);
            var data = JSON.parse(decryptedText);
            if (data && data.message) _addMessage('ai', data.message);

        }).catch(function (err) {

            _hideTyping();
            _setStopMode(false);

            if (err && err.name === 'AbortError') return;

            _addMessage('ai', "Lỗi kết nối luồng đàm thoại NLP: " + err.message);

        });

    }



    function _doRAGSearch(query) {

        _showTyping();

        var webhookUrl = (_cfg.N8N_BASE || '') + (_cfg.ENDPOINTS && _cfg.ENDPOINTS.AI && _cfg.ENDPOINTS.AI.RAG_QUERY ? _cfg.ENDPOINTS.AI.RAG_QUERY : '/webhook/hook-ai-rag');

        var payload = { query: query, history: typeof chatHistory !== 'undefined' ? chatHistory.slice(-8) : [] };



        var userStr = localStorage.getItem('auth_user');

        if (userStr) {

            var u = JSON.parse(userStr);

            payload.username = u.UserName || u.Username || u.username || '';

            payload.role = u.Role || 'user';

        }



        // Feature 4: Timeout UX Chống treo giả sau 8s

        var searchingTimeout = setTimeout(function () {

            _addMessage('ai', 'Dạ em vẫn đang lục lại các chính sách liên quan, sắp có kết quả rồi ạ! ');

            _showTyping(); // Reload typing bt

        }, 8000);



        var relativeUrl = webhookUrl.replace(_cfg.N8N_BASE || '', '');
        var rawPayload = JSON.stringify({
            method: 'POST',
            endpoint: relativeUrl,
            body: payload
        });
        var encryptedData = Cipher.encrypt(rawPayload);
        var gatewayUrl = _cfg.GATEWAY_URL || '/api/gateway';

        fetch(gatewayUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + _getToken() },
            body: JSON.stringify({ data: encryptedData }),
            signal: abortController ? abortController.signal : undefined
        }).then(function (res) {
            return res.json();
        }).then(function (resJson) {
            var decryptedText = Cipher.decrypt(resJson.data);
            return JSON.parse(decryptedText);

        }).then(function (data) {

            data = Array.isArray(data) ? data[0] : data;

            clearTimeout(searchingTimeout);

            _hideTyping(); _setStopMode(false);

            if (data && data.status !== "error" && data.message) {

                _addMessage('ai', data.message);

            } else {

                _addMessage('ai', " Lỗi tra cứu tài liệu: " + (data.error || data.message || "Luồng webhook không phản hồi đúng định dạng"));

            }

        }).catch(function (err) {

            clearTimeout(searchingTimeout);

            _hideTyping(); _setStopMode(false);

            if (err && err.name === 'AbortError') return;

            _addMessage('ai', " Lỗi kết nối máy chủ tri thức: " + err.message);

        });

    }



    function _handleReply(res) {

        console.log('API Response:', res);

        if (res && res.ApiCode && !res.apiCode) res.apiCode = res.ApiCode;

        var responseStatus = String(res && res.status || '').toUpperCase();

        _hideTyping();

        _setStopMode(false);



        try {
            // Auto-detect and normalize form actions (e.g. @lap_don_hang)
            if (res && res.apiCode === '@lap_don_hang') {
                if (!res.action) res.action = 'ADD';

                if (res.data && res.data.length > 0) {
                    res.params = Object.assign({}, res.params || {});
                    if (res.data[0].MaKhachHang) {
                        res.params['@MaKhachHang'] = res.data[0].MaKhachHang;
                        res.params['@ObjectID'] = res.data[0].MaKhachHang;
                    }
                    if (res.data[0].ItemList) {
                        try {
                            var itemsArr = typeof res.data[0].ItemList === 'string' ? JSON.parse(res.data[0].ItemList) : res.data[0].ItemList;
                            if (Array.isArray(itemsArr) && itemsArr.length > 0) {
                                res.items = itemsArr.map(function(it) {
                                    return {
                                        keyword: it.ItemID || it.ItemName || it.keyword || '',
                                        qty: it.Quantity || it.qty || 1,
                                        price: it.Price !== undefined ? it.Price : null,
                                        discount: it.DiscountPercent !== undefined ? it.DiscountPercent : (it.discount !== undefined ? it.discount : 0)
                                    };
                                });
                            }
                        } catch(e) {
                            console.error('Lỗi parse ItemList từ n8n response:', e);
                        }
                    }
                }

                // If items are not present, extract them from user query
                if (!res.items || res.items.length === 0) {
                    var lastUsrMsg = chatHistory.slice().reverse().find(function (m) { return m.role === 'user'; });
                    var queryText = lastUsrMsg ? lastUsrMsg.content : '';
                    res.items = _extractCartItemsFromText(queryText);
                }

                // If the panel is not open, open it first!
                if (window.ApiEngine) {
                    var activeApi = window.ApiEngine.getActiveApi ? window.ApiEngine.getActiveApi() : null;
                    if (!activeApi || activeApi.apiCode !== res.apiCode) {
                        window.ApiEngine.selectApi(res.apiCode, res);
                        if (res.message) _addMessage('ai', res.message);
                        return;
                    }
                }
            }

            // -- Format mới từ K_SieuLuong: { status, message, data:[], count, uiTemplate, intentParams } --

            if (res && (res.action === 'ADD' || res.action === 'UPDATE' || res.action === 'SUBMIT')) {
                if (window.ApiEngine && window.ApiEngine.applyFormUpdate) {
                    window.ApiEngine.applyFormUpdate(res);
                    if (res.message) _addMessage('ai', res.message);
                } else {
                    _addMessage('ai', 'Dạ, giao diện Form hiện tại chưa hỗ trợ đồng bộ dữ liệu này ạ.');
                }
                return;
            }

            if (res && res.action_code === 'OPEN_API_PANEL') {

                if (res.message) { _addMessage('ai', res.message); }

                if (window.ApiEngine && window.ApiEngine.open) {

                    // Fallback to open since openPanelWithData doesn't exist

                    window.ApiEngine.open(res.api_name);

                } else {

                    _addMessage('ai', 'Thiếu hàm mở Panel: ' + res.api_name);

                }

                return;

            }



            if (res && res.action_code === 'ASK_CLARIFICATION') {
                // Nhận dạng được câu chat ngoài ngữ cảnh SQL -> Tự động chuyển qua tìm kiếm RAG
                var lastUsrMsg = chatHistory.slice().reverse().find(function (m) { return m.role === 'user'; });
                _addMessage('ai', 'Dạ, em đang tìm kiếm thông tin này trong kho tài liệu...');
                _doRAGSearch(lastUsrMsg ? lastUsrMsg.content : '');
                return;
            }



            if (res && res.status === 'doc_search') {

                if (res.message) _addMessage('ai', res.message);

                var lastUserQ = chatHistory.slice().reverse().find(function (m) { return m.role === 'user'; });

                _doRAGSearch(lastUserQ ? lastUserQ.content : '');

                return;

            }



            if (res && (res.status === 'success' || responseStatus === 'SUCCESS' || responseStatus === 'NO_DATA' || responseStatus === 'OUT_OF_SCOPE' || responseStatus === 'VALIDATION_ERROR' || responseStatus === 'SYSTEM_ERROR') && Array.isArray(res.data)) {

                // 1. Lc data (ẩn các field hidden & loại dòng toàn null do SQL SUM trả v)

                var cleanData = res.data.filter(function (r) {

                    if (!r) return false;

                    var visibleKeys = Object.keys(r).filter(function (k) { return _getHiddenFields().indexOf(k) === -1 && !_isTechnicalRuleField(k) && String(k).indexOf('Metadata_') === -1; });

                    if (visibleKeys.length === 0) return false;

                    return visibleKeys.some(function (k) {

                        var v = r[k];

                        return v !== null && v !== undefined && String(v).trim() !== '';

                    });

                });



                if (responseStatus !== 'SUCCESS' && ['NO_DATA', 'OUT_OF_SCOPE', 'VALIDATION_ERROR', 'SYSTEM_ERROR'].indexOf(responseStatus) !== -1) {
                    cleanData = [];
                }

                if (cleanData.length === 0) {
                    var emptyCode = String(res.errorCode ?? res.code ?? responseStatus ?? 'NO_DATA').toUpperCase();
                    var emptyApiCode = String(res.apiCode ?? res.ApiCode ?? '').toLowerCase();
                    var emptyRequestId = res.requestId ?? res.metadata?.requestId ?? res.meta?.requestId ?? null;
                    var emptyMessages = {
                        NO_DATA: 'Không có dữ liệu phù hợp với điều kiện tra cứu.',
                        OUT_OF_SCOPE: 'Bạn không có quyền xem dữ liệu này trong phạm vi được giao.',
                        VALIDATION_ERROR: 'Thông tin tra cứu chưa hợp lệ. Vui lòng kiểm tra và thử lại.',
                        SYSTEM_ERROR: 'Hệ thống chưa thể tải dữ liệu. Vui lòng thử lại sau.'
                    };
                    if (emptyApiCode === '@san_pham_trong_tam') {
                        emptyMessages.NO_DATA = 'Không có sản phẩm trọng tâm phù hợp.';
                        emptyMessages.OUT_OF_SCOPE = 'Tài khoản không có quyền xem dữ liệu này.';
                        emptyMessages.VALIDATION_ERROR = 'Thông tin tra cứu sản phẩm trọng tâm còn thiếu hoặc chưa hợp lệ.';
                        emptyMessages.SYSTEM_ERROR = 'Hệ thống chưa thể tải sản phẩm trọng tâm. Vui lòng thử lại sau.' + (emptyRequestId ? ' Mã yêu cầu: ' + emptyRequestId : '');
                    }
                    _addMessage('ai', emptyMessages[emptyCode] ?? emptyMessages.NO_DATA);
                    return;
                }

                // 2. Tìm Mã  ối Tượng (Customer Code) từ metadata

                var idF = _pickField(res.intentParams || {}, 'ID');

                var khCode = idF ? idF.val : '';



                // 3. Xác định UI Template & Renderer

                var apiCode = (res.apiCode || res.ApiCode || '').toLowerCase();

                var isDebtApi = apiCode.indexOf('@cong_no') === 0;
                var uiTpl = isDebtApi ? 'CONG_NO' : (res.uiTemplate || ApiEngine.getUiTemplate(apiCode) || 'DEFAULT').toUpperCase();
                var catalogAllowedTypes = ['sanpham', 'khachhang', 'donhang', 'khohang', 'nhanvien'];
                var isCatalogRoot = cleanData.length > 0 && cleanData.every(function (row) {
                    if (!row) return false;
                    var type = String(row.Type ?? row.TYPE ?? row.type ?? '').toLowerCase();
                    var hasLabel = row.Label !== undefined || row.LABEL !== undefined || row.label !== undefined;
                    return hasLabel && catalogAllowedTypes.indexOf(type) >= 0;
                });

                var isFocusProducts = apiCode === '@san_pham_trong_tam';
                var renderFn = isFocusProducts && ApiChatbot.__internal && typeof ApiChatbot.__internal.renderFocusProducts === 'function'
                    ? ApiChatbot.__internal.renderFocusProducts
                    : isCatalogRoot && ApiChatbot.__internal && typeof ApiChatbot.__internal.renderCatalog === 'function'
                    ? ApiChatbot.__internal.renderCatalog
                    : apiCode === '@doanh_so'
                    ? _renderSalesDashboard
                    : (_UI_RENDERERS[uiTpl] || _UI_RENDERERS['DEFAULT'] || _renderCardView);

                // 4. Render — truyn meta đầy đủ (khCode cho CONG_NO/TICH_LUY, uiTemplate cho tất cả)

                var responseMetadata = res.metadata ?? res.meta ?? {};
                var renderMeta = {
                    uiTemplate: uiTpl,
                    fieldRoles: ApiEngine.getRoleMapping(),
                    khCode: khCode,
                    queryParams: Object.assign({}, res.intentParams || {}),
                    responseMetadata: responseMetadata,
                    requestId: res.requestId ?? responseMetadata.requestId ?? null,
                    contractVersion: res.contractVersion ?? responseMetadata.contractVersion ?? null,
                    status: res.errorCode ?? res.code ?? res.status ?? null
                };

                var cardHtml = renderFn(cleanData, res.message, isCatalogRoot ? '@danh_muc' : apiCode, renderMeta);
                if (apiCode === '@danh_muc' && !isCatalogRoot && ApiChatbot.__internal && typeof ApiChatbot.__internal.renderCatalogFooter === 'function') {
                    var catalogParams = res.intentParams ?? res.params ?? {};
                    var catalogType = catalogParams['@Type'] ?? catalogParams['@type'] ?? catalogParams.type ?? '';
                    cardHtml += ApiChatbot.__internal.renderCatalogFooter(catalogType);
                }

                _addHtmlMessage(cardHtml, '📊 Kết quả', renderMeta.requestId);

                return;

            }



            // -- Xử lý Lỗi --

            if (res && (res.status === 'error' || responseStatus === 'ERROR' || responseStatus === 'SYSTEM_ERROR' || responseStatus === 'VALIDATION_ERROR' || responseStatus === 'OUT_OF_SCOPE')) {

                var errorMsg = (res.message && res.message.length < 200) ? res.message : 'Dạ hệ thống đang bận hoặc dữ liệu chưa sẵn sàng ạ. Sếp vui lòng thử lại sau nhé!';
                _addMessage('ai', 'Lỗi hệ thống: ' + errorMsg);
                return;
            }



            // -- Các trưng hợp trả v Text (Fallbacks) --

            var reply = '';

            if (typeof res === 'string') {

                reply = res;

            } else if (res && res.response) {

                reply = res.response;

            } else if (res && res.reply) {

                reply = (typeof res.reply === 'object') ? (res.reply.message || res.reply.msg || JSON.stringify(res.reply)) : res.reply;

            } else if (res && res.message) {

                reply = res.message;

            } else if (res && res.output) {

                reply = res.output;

            } else if (res && res.data) {

                reply = typeof res.data === 'string' ? res.data : JSON.stringify(res.data);

            } else if (typeof res === 'object') {

                if (Object.keys(res).length === 0) reply = "Không có thông báo lỗi từ máy chủ. (Lỗi 500)";

                else reply = res.message || res.msg || JSON.stringify(res);

            } else {

                reply = JSON.stringify(res);

            }



            if (reply === '[]' || reply === '{}') reply = 'Dạ, em không tìm thấy kết quả nào, danh sách hiện đang trống ạ.';



            _addMessage('ai', reply);

        } catch (err) {

            console.error(err);

            _addMessage('ai', ' Lỗi hiển thị dữ liệu: ' + err.message);

        }

    }



    function _isTechnicalRuleField(key) {

        // Rule metadata vẫn nằm trong response để audit nhưng không phải thông tin
        // nghiệp vụ dành cho Sale/Manager, nên không render ở bất kỳ bảng/thẻ nào.
        var normalized = String(key || '').toLowerCase().replace(/[^a-z0-9]/g, '');
        return normalized.indexOf('rule') === 0;

    }



    function _getHiddenFields() {

        return ApiEngine.getFieldsByRole ? ApiEngine.getFieldsByRole('HIDDEN') : ['_debug_llm'];

    }



    /** Valiate số điện thoại VN đơn giản — tránh XSS qua href */

    function _isValidPhone(v) {

        return /^\+?[\d]{8,15}$/.test(String(v).replace(/[\s\-\.]/g, ''));

    }



    function _normalizePhone(v) {

        return String(v).replace(/[\s\-\.]/g, '');

    }



    function _extractCartItemsFromText(text) {
        if (!text) return [];
        var items = [];
        
        // Strip bracketed text/parentheses (e.g. (HYA107)) and customer codes (e.g. HYA107)
        var cleanText = text.replace(/\([^)]*\)/g, '').replace(/\[[^\]]*\]/g, '');
        cleanText = cleanText.replace(/\b[A-Za-z]{3,}\d+\b/gi, '');
        
        // Split by comma, "và", "cộng", "+"
        var segments = cleanText.split(/,|và|cộng|\+/i);
        segments.forEach(function (seg) {
            seg = seg.trim();
            if (!seg) return;

            // Strip leading action prefixes
            seg = seg.replace(/^(lên đơn|đặt đơn|đặt|mua|thêm|bán|lấy|cần|giúp|hộ)\s+/i, '');

            // Find any number in the segment
            var numMatch = seg.match(/(\d+(?:\.\d+)?)/);
            if (numMatch) {
                var qty = parseFloat(numMatch[1]);
                var numIdx = seg.indexOf(numMatch[1]);

                var afterPart = seg.substring(numIdx + numMatch[1].length).trim();
                var beforePart = seg.substring(0, numIdx).trim();

                // Clean unit from afterPart
                var afterClean = afterPart.replace(/^(hộp|chai|vỉ|ống|gói|viên|lon|tuýp|cái|chiếc|pcs|lọ|thùng|hộp thuốc|thuốc)\s+/i, '');

                var namePart = '';
                if (afterClean.replace(/[^a-zA-Z0-9]/g, '').length >= 3) {
                    namePart = afterClean;
                } else {
                    namePart = beforePart;
                }

                // Clean up namePart (remove common words)
                var cleanKeyword = namePart
                    .replace(/^(hộp|chai|vỉ|ống|gói|viên|lon|tuýp|cái|chiếc|pcs|lọ|thùng|hộp thuốc|thuốc)\s+/i, '')
                    .replace(/\s+(hộp|chai|vỉ|ống|gói|viên|lon|tuýp|cái|chiếc|pcs|lọ|thùng)$/i, '')
                    .replace(/^(lên đơn|đặt|thêm|mua|lấy|cần)\s+/i, '')
                    .replace(/\s+(cho|cho khách|khách hàng|cho nhà thuốc|cho quầy thuốc|nhà thuốc|quầy thuốc|đại lý).*$/i, '')
                    .trim();

                if (cleanKeyword && cleanKeyword.length >= 2) {
                    // Capitalize first letter of keyword
                    cleanKeyword = cleanKeyword.charAt(0).toUpperCase() + cleanKeyword.slice(1);
                    items.push({ keyword: cleanKeyword, qty: qty });
                }
            }
        });
        return items;
    }



    // 

    //  FEATURE 1: QUICK ACTION BUTTONS

    // 



    /** Tìm phone và name từ 1 row JSON (Dùng Metadata SQL) */

    function _detectContactFields(row) {

        var phone = null, name = null;

        var phoneFields = ApiEngine.getFieldsByRole ? ApiEngine.getFieldsByRole('PHONE') : [];

        var nameFields = ApiEngine.getFieldsByRole ? ApiEngine.getFieldsByRole('NAME') : [];



        for (var i = 0; i < phoneFields.length; i++) {

            var v = row[phoneFields[i]];

            if (v && _isValidPhone(String(v))) { phone = _normalizePhone(String(v)); break; }

        }

        for (var j = 0; j < nameFields.length; j++) {

            var nv = row[nameFields[j]];

            if (nv && String(nv).trim()) { name = String(nv).trim(); break; }

        }

        return { phone: phone, name: name };

    }



    /** Render action bar HTML cho 1 card */

    function _buildActionBar(row, apiCode) {

        var c = _detectContactFields(row);

        if (!c.phone && !c.name) return '';



        var isFinanceContext = false;

        var safeApiCode = String(apiCode || '');

        if (safeApiCode.indexOf('@doanh_so') !== -1 || safeApiCode.indexOf('@cong_no') !== -1 || safeApiCode.indexOf('FIN-') !== -1 || safeApiCode.indexOf('HR-') !== -1) {

            isFinanceContext = true;

        }



        var html = '<div class="ai-sales-action-bar">';

        if (c.phone) {

            html += '<a class="ai-sales-action-btn ai-sales-btn-call" href="tel:' + _esc(c.phone) + '" aria-label="Gi điện">📞 Gi</a>';

            html += '<a class="ai-sales-action-btn ai-sales-btn-zalo" href="https://zalo.me/' + _esc(c.phone) + '" target="_blank" rel="noopener noreferrer" aria-label="Nhắn Zalo">💬 Zalo</a>';

        }

        if (c.name && !isFinanceContext) {

            html += '<button class="ai-sales-action-btn ai-sales-btn-order" data-action="len-don" data-name="' + _esc(c.name) + '" type="button" aria-label="Lên đơn hàng">🛒 Lên đơn</button>';

        }

        html += '</div>';

        return html;

    }



    /** in "Lên đơn cho [name]" vào ô input (KHÔNG tự gửi) */

    function _handleLenDon(name) {

        $input.value = 'Lên đơn cho ' + name;

        $input.focus();

        _autoResize();

        _updateSendBtn();

    }







    function _pickValue(row, role) {

        var f = _pickField(row, role);

        return f ? f.val : null;

    }



    function _pickField(row, role) {

        var f = ApiEngine.getFieldByRole ? ApiEngine.getFieldByRole(row, role) : null;

        if (f) return f;



        // --- Dự phòng nhận diện AI tự động khi thiếu Metadata từ Backend ---

        if (!row) return null;

        var keys = Object.keys(row);

        var lowerKeys = keys.map(function (k) { return k.toLowerCase(); });



        function findKey(targets) {

            for (var i = 0; i < targets.length; i++) {
                var idx = lowerKeys.indexOf(targets[i]);
                if (idx !== -1) return { key: keys[idx], val: row[keys[idx]] };
            }
            return null;
        }

        if (role === 'TITLE' || role === 'NAME') {
            return findKey(['ten', 'name', 'title', 'label', 'hoten', 'tensanpham', 'tenkhachhang', 'tennhanvien', 'diengiai', 'dien_giai', 'mota', 'mo_ta']);
        }
        if (role === 'MONEY' || role === 'VALUE' || role === 'AMOUNT') {
            return findKey(['money', 'value', 'amount', 'sotien', 'so_tien', 'thanhtien', 'thanh_tien', 'tongtien', 'tong_tien', 'doanhthu', 'doanh_thu', 'duyet', 'no', 'congno', 'cong_no']);
        }
        if (role === 'COUNT' || role === 'QTY') {
            return findKey(['count', 'qty', 'quantity', 'soluong', 'so_luong', 'sohd', 'so_hd', 'hoadon', 'hoa_don']);
        }
        if (role === 'TREND' || role === 'DATE') {
            return findKey(['trend', 'date', 'ngay', 'ngayhd', 'ngay_hd', 'documentdate', 'ngay_lap', 'ngaylap', 'timeline']);
        }
        if (role === 'BADGE' || role === 'STATUS') {
            return findKey(['badge', 'status', 'trangthai', 'trang_thai', 'qua', 'quatang', 'qua_tang', 'statusname', 'phanhang', 'phan_hang']);
        }
        if (role === 'ID' || role === 'CODE') {
            return findKey(['id', 'code', 'ma', 'makhachhang', 'ma_khachhang', 'masanpham', 'ma_sanpham', 'manhanvien', 'ma_nhanvien', 'documentid', 'mahd', 'ma_hd']);
        }
        if (role === 'PERCENT' || role === 'PERCENTAGE') {
            return findKey(['percent', 'percentage', 'tile', 'ti_le', 'phantram', 'phan_tram']);
        }

        return findKey([role.toLowerCase()]);
    }

    function _fmtCellVal(v) {

        if (v === null || v === undefined) return '—';

        var s = String(v);

        if (/^\d{4}-\d{2}-\d{2}T/.test(s)) return s.split('T')[0];

        if (!isNaN(v) && Math.abs(Number(v)) >= 10000 && String(v).indexOf('.') === -1) {

            return Number(v).toLocaleString('vi-VN');

        }

        return s;

    }

    function _formatVietnameseDate(value) {
        var text = String(value || '').trim();
        var match = text.match(/^(\d{4})-(\d{2})-(\d{2})/);
        return match ? match[3] + '/' + match[2] + '/' + match[1] : text;
    }

    function _formatPhoneNumber(value) {
        var raw = String(value || '').trim();
        var digits = raw.replace(/\D/g, '');
        if (digits.length === 9 && digits.charAt(0) !== '0') digits = '0' + digits;
        if (digits.length === 10 && digits.charAt(0) === '0') {
            return digits.slice(0, 4) + ' ' + digits.slice(4, 7) + ' ' + digits.slice(7);
        }
        return raw;
    }

    function _formatCurrencyVnd(value) {
        var amount = Number(value);
        return Number.isFinite(amount) ? amount.toLocaleString('vi-VN') + ' ₫' : String(value || '');
    }

    function _formatOrderDocumentId(value) {
        var text = String(value || '').trim();
        var match = text.match(/^UAT(?:ALL|\d+)?_ORD_(.+)$/i);
        return match ? 'ORD-' + match[1] : text;
    }

    function _formatBusinessCell(key, value, apiCode) {
        var normalizedKey = String(key || '').toLowerCase().replace(/[_\s]/g, '');
        var isOrder = String(apiCode || '').toLowerCase() === '@don_hang';
        var isInvoice = ['@hoa_don', '@hoa_don_chi_tiet'].indexOf(String(apiCode || '').toLowerCase()) !== -1;
        if (value === null || value === undefined || String(value).trim() === '') {
            if (normalizedKey === 'physicalstock') return 'Chưa truy vấn kho';
            if (normalizedKey === 'availablestock') return 'Chưa kiểm tra kho';
            if (isOrder && normalizedKey === 'deliverdate') return 'Chưa xác định';
            if (isOrder && normalizedKey === 'depositamount') return 'Chưa có';
            if (isOrder && normalizedKey === 'notes') return 'Không có';
            return '—';
        }

        if (normalizedKey === 'phone' || normalizedKey === 'customerphone') {
            return _formatPhoneNumber(value);
        }
        if (['documentdate', 'deliverdate', 'datecreate', 'expiredate', 'handung', 'asofdate', 'ngay', 'ngaytao'].indexOf(normalizedKey) !== -1) {
            return _formatVietnameseDate(value);
        }
        if (normalizedKey === 'documentid' && isOrder) return _formatOrderDocumentId(value);
        if (['employeeid', 'objectid', 'itemid', 'storehouseid', 'lot', 'statusid'].indexOf(normalizedKey) !== -1) {
            return String(value);
        }
        if (isOrder && ['basetotal', 'depositamount'].indexOf(normalizedKey) !== -1) {
            if (normalizedKey === 'depositamount' && Number(value) === 0) return 'Chưa có';
            return _formatCurrencyVnd(value);
        }
        if (isInvoice && ['unitprice', 'amount', 'totalamount', 'basetotal', 'discountamount', 'taxamount'].indexOf(normalizedKey) !== -1) {
            return _formatCurrencyVnd(value);
        }

        var normalizedValue = String(value).trim().toUpperCase();
        var statuses = {
            'PHYSICAL_ONLY_UNVERIFIED': 'Có số tồn kho nhưng chưa xác minh số có thể bán',
            'PHYSICAL_STOCK_NOT_QUERIED': 'Chưa kiểm tra kho cho kết quả này',
            'PHYSICAL_AS_SELLABLE_TEMPORARY': 'Theo tồn kho hiện tại',
            'EXPIRED_NOT_SELLABLE': 'Hết hạn - không được bán',
            'STOCK_RECONCILIATION_REQUIRED': 'Cần đối soát kho',
            'WAREHOUSE_SCOPE_UNAVAILABLE': 'Tài khoản chưa được phân quyền kho',
            'NO_STOCK_RECORD': 'Chưa có phát sinh tồn kho',
            'NO_SELLABLE_STOCK': 'Không còn hàng có thể bán',
            'CHECKIN_SOURCE_UNAVAILABLE': 'Chưa có dữ liệu ghé',
            'REFERENCE_ONLY_APPROVAL_REQUIRED': 'Chỉ tham khảo, cần phê duyệt',
            'REFERENCE_ONLY_MEDICAL_REVIEW_REQUIRED': 'Chỉ tham khảo, cần người có chuyên môn xem xét',
            'PERSONAL_CYCLE_ELIGIBLE': 'Đủ dữ liệu tính chu kỳ cá nhân',
            'INSUFFICIENT_HISTORY': 'Chưa đủ lịch sử giao dịch',
            'DUE_DATE_UNKNOWN': 'Chưa xác định hạn thanh toán',
            'NEW_CUSTOMER': 'Khách hàng mới',
            'HIGH': 'Cao',
            'MEDIUM': 'Vừa',
            'LOW': 'Thấp',
            'LARGE': 'Lớn',
            'SMALL': 'Nhỏ'
        };
        return statuses[normalizedValue] || _fmtCellVal(value);
    }



    function _badgeClass(val) {

        var v = String(val).trim().toUpperCase();

        if (v === 'A' || v === 'VIP' || v === 'ACTIVE') return 'ai-badge-green';

        if (v === 'B' || v === 'NORMAL') return 'ai-badge-blue';

        if (v === 'C' || v === 'AT RISK' || v.indexOf('NGUY') !== -1) return 'ai-badge-red';

        return 'ai-badge-gray';

    }



    function _getKeys(rows) {

        var keys = [];

        rows.forEach(function (r) {

            Object.keys(r).forEach(function (k) {

                if (keys.indexOf(k) === -1 && _getHiddenFields().indexOf(k) === -1 && !_isTechnicalRuleField(k)) keys.push(k);

            });

        });

        return keys;

    }



    /**

     * Renderer ĐỘNG 100%: Tự động nhận diện Role từ Metadata

     * @param {Array}  rows      - mảng data từ API

     * @param {string} apiCode   - mã API

     * @param {Object} meta      - { uiTemplate, fieldRoles, khCode } từ ApiEngine

     */

    function _renderSingleGroup(rows, apiCode, meta) {

        var keys = _getKeys(rows);

        var html = '';



        var viewId = 'view-' + (++_modalIdCounter);

        html += '<div class="ai-inline-container" id="' + viewId + '">';

        html += '<div class="ai-view-table" style="display: block;">';

        html += _buildInlineTable(rows, keys, apiCode);

        html += '</div>';

        html += '</div>'; // ai-inline-container



        return html;

    }

    function _renderSalesDashboard(rows, headerMsg, apiCode, meta) {
        function normalizeKey(value) {
            return String(value || '').toLowerCase().normalize('NFD')
                .replace(/[\u0300-\u036f]/g, '').replace(/đ/g, 'd').replace(/[^a-z0-9]/g, '');
        }

        function findKey(preferred, valueType) {
            var keys = _getKeys(rows);
            for (var p = 0; p < preferred.length; p++) {
                for (var k = 0; k < keys.length; k++) {
                    if (normalizeKey(keys[k]) === preferred[p]) return keys[k];
                }
            }
            for (var i = 0; i < keys.length; i++) {
                for (var r = 0; r < rows.length; r++) {
                    var value = rows[r][keys[i]];
                    if (valueType === 'number' && value !== '' && value !== null && isFinite(Number(String(value).replace(/,/g, '')))) return keys[i];
                    if (valueType === 'date' && /\d{4}-\d{2}-\d{2}|\d{2}\/\d{2}\/\d{4}/.test(String(value || ''))) return keys[i];
                }
            }
            return '';
        }

        function numberValue(value) {
            var parsed = Number(String(value == null ? '' : value).replace(/,/g, ''));
            return isFinite(parsed) ? parsed : 0;
        }

        function currentUserIsManager() {
            try {
                var raw = localStorage.getItem('auth_user') || localStorage.getItem('currentUser');
                var user = raw ? JSON.parse(raw) : {};
                var role = normalizeKey(user.role || user.Role || user.roleName || user.RoleName || user.roleCode || user.RoleCode || '');
                var group = normalizeKey(user.UserGroupID || user.userGroupID || user.UserGroup || '');
                return role.indexOf('manager') !== -1 || role.indexOf('quanly') !== -1 || role.indexOf('admin') !== -1 ||
                    group.indexOf('admin') !== -1 || Number(user.Manager || user.manager) === 1 ||
                    user.IsManager === true || Number(user.IsManager || user.isManager) === 1 ||
                    (user.EmployeeID && user.ManagerID && String(user.EmployeeID).toLowerCase() === String(user.ManagerID).toLowerCase());
            } catch (e) {
                return false;
            }
        }

        var resultKeys = _getKeys(rows);
        var normalizedResultKeys = resultKeys.map(function (key) { return normalizeKey(key); });
        var reportMode = normalizedResultKeys.some(function (key) { return /tenkhachhang|objectname|customername/.test(key); }) ? 'customer' :
            (normalizedResultKeys.some(function (key) { return /tennhanvien|tennv|employeename/.test(key); }) ? 'employee' :
                (normalizedResultKeys.some(function (key) { return /tensanpham|itemname|productname/.test(key); }) ? 'product' :
                    (normalizedResultKeys.indexOf('nhom') !== -1 && normalizedResultKeys.indexOf('ten') !== -1 ? 'mixed' : 'daily')));
        var isBreakdownReport = reportMode !== 'daily';
        var exactDateKey = resultKeys.find(function (key) {
            return ['documentdate', 'ngay', 'date', 'ngaylap', 'columndate'].indexOf(normalizeKey(key)) !== -1;
        }) || '';
        var dateKey = exactDateKey || (!isBreakdownReport ? findKey(['documentdate', 'ngay', 'date', 'ngaylap', 'columndate'], 'date') : '');
        var revenueKey = findKey(['doanhso', 'doanhthu', 'basetotal', 'amount', 'thanhtien', 'tongtien', 'column1', 'value', 'giatri'], 'number');
        var orderKey = findKey(['sodonhang', 'ordercount', 'soluongdon', 'donhang'], '');
        var isManager = currentUserIsManager();
        var total = 0;
        var dashboardTotal = 0;
        var orderTotal = 0;

        rows.forEach(function (row) {
            var amount = revenueKey ? numberValue(row[revenueKey]) : 0;
            if (!isBreakdownReport) {
                total += amount;
                if (orderKey) orderTotal += numberValue(row[orderKey]);
            }
        });
        dashboardTotal = total;

        var dashboardUid = Date.now() + '-' + (++_modalIdCounter) + '-' + Math.random().toString(36).slice(2, 8);
        var relatedId = 'sales-dashboard-related-' + dashboardUid;
        var orderKpiId = 'sales-dashboard-orders-' + dashboardUid;
        var averageOrderKpiId = 'sales-dashboard-average-order-' + dashboardUid;
        var reportOrderKpiId = 'sales-report-orders-' + dashboardUid;
        var reportAverageOrderKpiId = 'sales-report-average-order-' + dashboardUid;
        var reportTotalKpiId = 'sales-report-total-' + dashboardUid;
        var reportTargetKpiId = 'sales-report-target-' + dashboardUid;
        var reportTargetBarId = 'sales-report-target-bar-' + dashboardUid;
        var reportTargetMetaId = 'sales-report-target-meta-' + dashboardUid;
        function toIsoDate(value) {
            var raw = String(value || '').trim();
            var match = raw.match(/^(\d{4})-(\d{2})-(\d{2})/);
            if (match) return match[1] + '-' + match[2] + '-' + match[3];
            match = raw.match(/^(\d{2})\/(\d{2})\/(\d{4})/);
            if (match) return match[3] + '-' + match[2] + '-' + match[1];
            return '';
        }

        var fromDateKey = resultKeys.find(function (key) { return ['tungay', 'fromdate'].indexOf(normalizeKey(key)) !== -1; });
        var toDateKey = resultKeys.find(function (key) { return ['denngay', 'todate'].indexOf(normalizeKey(key)) !== -1; });
        var dateValues = dateKey ? rows.map(function (row) { return toIsoDate(row[dateKey]); }).filter(Boolean).sort() : [];
        var fromDate = dateValues.length ? dateValues[0] : '';
        var toDate = dateValues.length ? dateValues[dateValues.length - 1] : fromDate;
        if (isBreakdownReport && rows[0]) {
            fromDate = toIsoDate(fromDateKey ? rows[0][fromDateKey] : '') || fromDate;
            toDate = toIsoDate(toDateKey ? rows[0][toDateKey] : '') || fromDate;
        }

        function displayDate(value) {
            var match = String(value || '').match(/^(\d{4})-(\d{2})-(\d{2})/);
            return match ? match[3] + '/' + match[2] + '/' + match[1] : String(value || '');
        }

        function formatCompactMoney(value) {
            var amount = numberValue(value);
            var abs = Math.abs(amount);
            if (abs >= 1000000000) return (amount / 1000000000).toLocaleString('vi-VN', { maximumFractionDigits: 2 }) + ' tỷ';
            if (abs >= 1000000) return (amount / 1000000).toLocaleString('vi-VN', { maximumFractionDigits: 2 }) + ' triệu';
            return _fmtCellVal(amount) + ' ₫';
        }

        function exactResultKey(preferred) {
            for (var p = 0; p < preferred.length; p++) {
                for (var k = 0; k < resultKeys.length; k++) {
                    if (normalizeKey(resultKeys[k]) === preferred[p]) return resultKeys[k];
                }
            }
            return '';
        }

        function buildManagementDetail() {
            if (!rows.length || reportMode === 'daily') {
                return { intro: '', table: _buildInlineTable(rows, resultKeys, apiCode) };
            }

            var groupKey = exactResultKey(['nhom', 'reportgroup', 'group']);
            var codeKey = exactResultKey(['ma', 'entityid', 'manv', 'manhanvien', 'employeeid', 'makh', 'objectid', 'masp', 'itemid']);
            var nameKey = exactResultKey(['ten', 'displayname', 'tennv', 'tennhanvien', 'employeename', 'tenkhachhang', 'objectname', 'tensanpham', 'itemname']);
            var quantityKey = exactResultKey(['soluong', 'quantity', 'qty']);
            if (!nameKey || !revenueKey) {
                return { intro: '', table: _buildInlineTable(rows, resultKeys, apiCode) };
            }

            var defaultGroup = reportMode === 'employee' ? 'Nhân viên' :
                (reportMode === 'customer' ? 'Khách hàng' : (reportMode === 'product' ? 'Sản phẩm' : 'Khác'));
            var groupTotals = {};
            var groupCounts = {};
            rows.forEach(function (row) {
                var group = String(groupKey ? row[groupKey] : defaultGroup || 'Khác').trim() || defaultGroup || 'Khác';
                groupTotals[group] = (groupTotals[group] || 0) + numberValue(row[revenueKey]);
                groupCounts[group] = (groupCounts[group] || 0) + 1;
            });

            var detailedRows = rows.map(function (row) {
                var group = String(groupKey ? row[groupKey] : defaultGroup || 'Khác').trim() || defaultGroup || 'Khác';
                var amount = numberValue(row[revenueKey]);
                var share = groupTotals[group] ? amount / groupTotals[group] * 100 : 0;
                return {
                    'Nhóm phân tích': group,
                    'Mã đối tượng': codeKey ? row[codeKey] : '—',
                    'Tên đối tượng': row[nameKey],
                    'Số lượng bán': quantityKey && row[quantityKey] != null && String(row[quantityKey]).trim() !== '' ? row[quantityKey] : '—',
                    'Doanh số': formatCompactMoney(amount),
                    'Tỷ trọng trong danh sách': share.toLocaleString('vi-VN', { maximumFractionDigits: 1 }) + '%',
                    showallcols: true
                };
            });

            var groupNames = Object.keys(groupTotals);
            var activeGroup = reportMode === 'mixed' && groupNames.length ? groupNames[0] : '';
            var groupSummary = groupNames.map(function (group, index) {
                return '<button type="button" class="ai-sales-group-card' + (index === 0 && activeGroup ? ' active' : '') + '" data-sales-group="' + _esc(group) + '" aria-pressed="' + (index === 0 && activeGroup ? 'true' : 'false') + '"><strong>' + _esc(group) + '</strong><small>' + groupCounts[group] + ' đối tượng · Bấm để xem chi tiết</small></button>';
            }).join('');
            var intro = '<div class="ai-sales-breakdown-explainer"><p><strong>Cách đọc:</strong> Chọn một nhóm bên dưới để xem ai/bên nào/mặt hàng nào tạo ra doanh số. Tỷ trọng được tính trên các dòng API trả về trong nhóm đang chọn; số tổng chính thức nằm ở KPI Tổng doanh số phía trên.</p><div class="ai-sales-breakdown-groups">' + groupSummary + '</div></div>';
            var initiallyVisibleRows = activeGroup ? detailedRows.filter(function (row) { return row['Nhóm phân tích'] === activeGroup; }) : detailedRows;
            return {
                intro: intro,
                table: _buildInlineTable(initiallyVisibleRows, Object.keys(detailedRows[0]), apiCode, detailedRows),
                initialLabel: activeGroup ? activeGroup + ': ' + initiallyVisibleRows.length + ' dòng' : detailedRows.length + ' dòng'
            };
        }

        var periodDays = 0;
        if (fromDate && toDate) {
            var fromTime = new Date(fromDate + 'T00:00:00').getTime();
            var toTime = new Date(toDate + 'T00:00:00').getTime();
            if (!isNaN(fromTime) && !isNaN(toTime)) periodDays = Math.floor((toTime - fromTime) / 86400000) + 1;
        }
        var rangeText = fromDate ? ' (' + displayDate(fromDate) + (toDate && toDate !== fromDate ? ' – ' + displayDate(toDate) : '') + ')' : '';
        var roleClass = isManager ? 'manager' : 'tdv';
        var html = '<section class="ai-sales-dashboard ' + roleClass + '" data-dashboard-role="' + roleClass + '">';
        var scopeTitle = isManager ? 'Doanh số đội ngũ' : 'Doanh số cá nhân';
        var scopeDescription = isManager ? 'Theo dõi kết quả kinh doanh của đội ngũ trong kỳ' : 'Theo dõi kết quả doanh số cá nhân trong kỳ';
        var updatedAt = new Date().toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' });
        html += '<header class="ai-sales-report-header"><div class="ai-sales-report-heading"><span class="ai-sales-dashboard-eyebrow">' + _esc(scopeTitle) + '</span><h3>' + _esc(scopeTitle) + '</h3><p>' + _esc(scopeDescription) + '</p></div>';
        html += '<div class="ai-sales-report-meta"><span class="ai-sales-dashboard-role">' + (isManager ? 'Manager' : 'Trình dược viên') + '</span><span class="ai-sales-updated">Cập nhật lúc ' + updatedAt + '</span></div>';
        html += '<div class="ai-sales-report-filter"><span>Khoảng thời gian</span><strong>' + _esc(displayDate(fromDate) + (toDate && toDate !== fromDate ? ' → ' + displayDate(toDate) : '')) + '</strong><em>Dữ liệu thực tế</em></div></header>';
        html += '<div class="ai-sales-dashboard-card ai-sales-report-summary"><div class="ai-sales-card-title"><strong>Tổng quan ' + (periodDays > 0 && periodDays <= 7 ? 'tuần' : 'kỳ') + _esc(rangeText) + '</strong><span>Dữ liệu thực tế</span></div><div class="ai-sales-kpi-grid">';
        html += '<div class="ai-sales-kpi"><span class="ai-sales-kpi-icon">₫</span><span>Tổng doanh số</span><strong id="' + reportTotalKpiId + '" title="' + _esc(isBreakdownReport ? '' : _fmtCellVal(total) + ' ₫') + '">' + (isBreakdownReport ? 'Đang tải…' : _esc(formatCompactMoney(total))) + '</strong><small>Toàn bộ phạm vi báo cáo</small></div>';
        html += '<div class="ai-sales-kpi"><span class="ai-sales-kpi-icon">#</span><span>Số lượng đơn hàng</span><strong id="' + reportOrderKpiId + '">' + (orderKey ? _esc(_fmtCellVal(orderTotal)) : 'Đang tải…') + '</strong><small>Đơn thực tế</small></div>';
        html += '<div class="ai-sales-kpi"><span class="ai-sales-kpi-icon">↗</span><span>Đơn trung bình</span><strong id="' + reportAverageOrderKpiId + '">' + (orderKey && orderTotal ? _esc(formatCompactMoney(Math.round(total / orderTotal))) : 'Đang tải…') + '</strong><small>Doanh số / đơn</small></div>';
        html += '<div class="ai-sales-kpi ai-sales-target-kpi"><span class="ai-sales-kpi-icon">✓</span><span>Hoàn thành chỉ tiêu</span><strong id="' + reportTargetKpiId + '">Đang tải…</strong><div class="ai-sales-target-progress"><i id="' + reportTargetBarId + '"></i></div><small id="' + reportTargetMetaId + '">Đang tải chỉ tiêu…</small></div></div></div>';
        html += '<div id="' + relatedId + '" class="ai-sales-related"' + (isManager ? ' hidden' : '') + '>' + (isManager ? '' : '<div class="ai-sales-dashboard-card ai-sales-related-loading">Đang tải dữ liệu liên quan…</div>') + '</div>';

        var detailTitle = reportMode === 'customer' ? 'Top ' + rows.length + ' khách hàng theo doanh số' :
            (reportMode === 'employee' ? 'Top ' + rows.length + ' nhân viên theo doanh số' :
                (reportMode === 'product' ? 'Top ' + rows.length + ' sản phẩm theo doanh số' :
                    (reportMode === 'mixed' ? 'Chi tiết nguồn tạo doanh số' : 'Chi tiết doanh số theo ngày')));
        var managementDetail = buildManagementDetail();
        if (isManager || rows.length > 1 || isBreakdownReport) html += '<div class="ai-sales-dashboard-card ai-sales-management-detail' + (reportMode === 'product' ? ' ai-sales-show-quantity' : '') + '"><div class="ai-sales-card-title"><strong>' + _esc(detailTitle) + '</strong><span class="ai-sales-detail-count">' + _esc(managementDetail.initialLabel || rows.length + ' dòng phân tích') + '</span></div>' + managementDetail.intro + managementDetail.table + '</div>';
        if (!isManager) {
            html += '<div class="ai-sales-dashboard-card ai-sales-next"><div class="ai-sales-card-title"><strong>Gợi ý tiếp theo</strong></div><div class="ai-sales-next-grid">';
            html += '<button type="button" onclick="document.getElementById(\'chat-input\').value=\'@don_hang \';document.getElementById(\'chat-input\').focus()">Xem đơn hàng</button>';
            html += '<button type="button" onclick="document.getElementById(\'chat-input\').value=\'@danh_sach_tonkho \';document.getElementById(\'chat-input\').focus()">Kiểm tra tồn kho</button>';
            html += '</div></div>';
        }
        html += '</section>';

        setTimeout(function () {
            var target = document.getElementById(relatedId);
            if (!target || !window.ApiEngine || typeof window.ApiEngine.queryData !== 'function') return;

            function loadSalesPlan() {
                try {
                    if (typeof Http === 'undefined' || typeof API_CONFIG === 'undefined' || !API_CONFIG.ENDPOINTS || !API_CONFIG.ENDPOINTS.SALES || !API_CONFIG.ENDPOINTS.SALES.PLAN) return Promise.resolve([]);
                    return Http.get(API_CONFIG.ENDPOINTS.SALES.PLAN, {
                        q: JSON.stringify({ FromDate: fromDate, ToDate: toDate })
                    }).then(function (response) {
                        var data = response && (response.data || response);
                        return data && Array.isArray(data.records) ? data.records : [];
                    }).catch(function () { return []; });
                } catch (e) {
                    return Promise.resolve([]);
                }
            }

            function loadDailySummary() {
                if (!isBreakdownReport) return Promise.resolve(rows);
                if (!fromDate || !toDate) return Promise.resolve([]);
                var summaryParams = {};
                var originalParams = meta && meta.queryParams ? meta.queryParams : {};
                Object.keys(originalParams).forEach(function (key) {
                    var normalized = normalizeKey(key);
                    if (String(key).charAt(0) === '@' && ['tungay', 'denngay', 'fromdate', 'todate', 'loaibaocao', 'topn'].indexOf(normalized) === -1) {
                        summaryParams[key] = originalParams[key];
                    }
                });
                summaryParams['@FromDate'] = fromDate;
                summaryParams['@ToDate'] = toDate;
                summaryParams['@LoaiBaoCao'] = 'TatCa';
                return window.ApiEngine.queryData('@doanh_so', summaryParams).catch(function () { return []; });
            }

            function findRecordKey(records, preferred) {
                if (!records.length) return '';
                var keys = Object.keys(records[0]);
                for (var p = 0; p < preferred.length; p++) {
                    var matched = keys.find(function (key) { return normalizeKey(key) === preferred[p]; });
                    if (matched) return matched;
                }
                return '';
            }

            function updateDailyDashboard(dailyRows) {
                var records = Array.isArray(dailyRows) ? dailyRows : [];
                var totalEl = document.getElementById(reportTotalKpiId);
                var dailyDateKey = findRecordKey(records, ['ngay', 'documentdate', 'date', 'ngaylap', 'columndate']);
                var dailyRevenueKey = findRecordKey(records, ['amount', 'doanhso', 'doanhthu', 'basetotal', 'thanhtien', 'tongtien', 'value', 'giatri']);
                if (!dailyDateKey || !dailyRevenueKey) {
                    if (totalEl && isBreakdownReport) {
                        totalEl.textContent = '—';
                        totalEl.title = 'Không tải được dữ liệu tổng hợp theo ngày';
                    }
                    return;
                }
                dashboardTotal = 0;
                records.forEach(function (row) {
                    var amount = numberValue(row[dailyRevenueKey]);
                    dashboardTotal += amount;
                });
                if (totalEl) {
                    totalEl.textContent = formatCompactMoney(dashboardTotal);
                    totalEl.title = _fmtCellVal(dashboardTotal) + ' ₫';
                }
            }

            function updateTargetKpi(plans) {
                var targetEl = document.getElementById(reportTargetKpiId);
                var barEl = document.getElementById(reportTargetBarId);
                var metaEl = document.getElementById(reportTargetMetaId);
                if (!targetEl || !barEl || !metaEl) return;
                var records = Array.isArray(plans) ? plans : [];
                var planKeys = records.length ? Object.keys(records[0]) : [];
                var targetKey = planKeys.find(function (key) { return /doanhsokehoach|target|quota|muctieu/i.test(normalizeKey(key)); });
                var actualKey = planKeys.find(function (key) { return /doanhsothuchien|actual/i.test(normalizeKey(key)); });
                var percentKey = planKeys.find(function (key) { return /phantramthuchiends|completion|progress/i.test(normalizeKey(key)); });
                var targetTotal = targetKey ? records.reduce(function (sum, row) { return sum + numberValue(row[targetKey]); }, 0) : 0;
                var actualTotal = actualKey ? records.reduce(function (sum, row) { return sum + numberValue(row[actualKey]); }, 0) : dashboardTotal;
                var weightedPercent = percentKey ? records.reduce(function (sum, row) {
                    var percent = numberValue(row[percentKey]);
                    var weight = targetKey ? numberValue(row[targetKey]) : 1;
                    return sum + percent * (weight || 1);
                }, 0) : 0;
                var completion = targetTotal > 0 ? (percentKey ? weightedPercent / targetTotal : actualTotal / targetTotal * 100) : (percentKey && records.length ? weightedPercent / records.length : 0);
                if (!targetTotal && !percentKey) {
                    targetEl.textContent = '—';
                    barEl.style.width = '0%';
                    metaEl.textContent = 'Chưa có chỉ tiêu từ API';
                    return;
                }
                completion = Math.max(0, Math.round(completion));
                targetEl.textContent = completion + '%';
                barEl.style.width = Math.min(completion, 100) + '%';
                metaEl.textContent = targetTotal > 0 ? 'Mục tiêu: ' + formatCompactMoney(targetTotal) : 'Theo dữ liệu thực tế từ API';
            }

            function updateOrderKpis(invoices) {
                var orderCount = Array.isArray(invoices) ? invoices.length : 0;
                if (orderCount && invoices[0]) {
                    var totalRowsKey = Object.keys(invoices[0]).find(function (key) {
                        return /totalrows|tongdong|tongso/i.test(normalizeKey(key));
                    });
                    if (totalRowsKey) orderCount = numberValue(invoices[0][totalRowsKey]) || orderCount;
                }
                var orderElement = document.getElementById(orderKpiId);
                var averageElement = document.getElementById(averageOrderKpiId);
                var reportOrderElement = document.getElementById(reportOrderKpiId);
                var reportAverageElement = document.getElementById(reportAverageOrderKpiId);
                if (orderElement) orderElement.textContent = _fmtCellVal(orderCount);
                if (averageElement) averageElement.textContent = orderCount ? _fmtCellVal(Math.round(dashboardTotal / orderCount)) : '—';
                if (reportOrderElement) reportOrderElement.textContent = _fmtCellVal(orderCount);
                if (reportAverageElement) reportAverageElement.textContent = orderCount ? formatCompactMoney(Math.round(dashboardTotal / orderCount)) : '—';
            }

            var dailySummaryReady = loadDailySummary().then(function (dailyRows) {
                if (isBreakdownReport) updateDailyDashboard(dailyRows);
                return dailyRows;
            });

            if (isManager) {
                Promise.all([
                    window.ApiEngine.queryData('@hoa_don', { '@TuNgay': fromDate, '@DenNgay': toDate }).catch(function () { return []; }),
                    loadSalesPlan(),
                    dailySummaryReady
                ]).then(function (result) {
                    updateOrderKpis(result[0]);
                    updateTargetKpi(result[1]);
                    target.innerHTML = '';
                }).catch(function () {
                    updateOrderKpis([]);
                    updateTargetKpi([]);
                    target.innerHTML = '';
                });
            } else {
                Promise.all([
                    window.ApiEngine.queryData('@hoa_don', { '@TuNgay': fromDate, '@DenNgay': toDate }).catch(function () { return []; }),
                    loadSalesPlan(),
                    dailySummaryReady
                ]).then(function (result) {
                    var invoices = result[0];
                    updateOrderKpis(invoices);
                    updateTargetKpi(result[1]);
                    var invoiceHtml = '<div class="ai-sales-dashboard-card"><div class="ai-sales-card-title"><strong>Chi tiết đơn hàng ' + (fromDate === toDate ? 'hôm nay' : 'trong kỳ') + '</strong><span>' + invoices.length + ' đơn</span></div>';
                    invoiceHtml += invoices.length ? _buildInlineTable(invoices, _getKeys(invoices), '@hoa_don') : '<p class="ai-sales-empty">Không có đơn hàng trong thời gian này.</p>';
                    invoiceHtml += '</div>';
                    target.innerHTML = invoiceHtml;
                }).catch(function () {
                    updateOrderKpis([]);
                    target.innerHTML = '<div class="ai-sales-dashboard-card"><p class="ai-sales-empty">Không thể tải chi tiết đơn hàng.</p></div>';
                });
            }
        }, 120);
        return html;
    }



    /**

     * Renderer ỘNG 100%: Tự động nhận dạng Tabs và Render danh sách

     */

    function _renderCardView(rows, headerMsg, apiCode, meta) {

        if (!rows || rows.length === 0) return '';

        if (String(apiCode || '').toLowerCase() === '@de_xuat_khuyen_mai') {
            var promotionMode = String(rows[0] && rows[0].ViewMode || '').toUpperCase();
            headerMsg = promotionMode === 'MANAGER_REVIEW'
                ? 'Sản phẩm cần xem xét khuyến mãi (' + rows.length + ')'
                : 'Chương trình khuyến mãi công ty (' + rows.length + ')';
        }

        if (String(apiCode || '').toLowerCase() === '@doanh_so') {
            return _renderSalesDashboard(rows, headerMsg, apiCode, meta);
        }



        // 1. Find if we should group by BADGE (PhanLoai, Nhom...) or dynamically by data signature

        var badgeKey = null;

        var distinctBadges = 0;

        if (rows.length > 0) {

            var sampleBadge = _pickField(rows[0], 'BADGE');

            if (sampleBadge) {

                badgeKey = sampleBadge.key;

                var badgeValues = {};

                rows.forEach(function (r) {

                    var v = String(r[badgeKey] || '').trim();

                    badgeValues[v] = true;

                });

                distinctBadges = Object.keys(badgeValues).length;

            }

        }



        var useBadgeGrouping = badgeKey && distinctBadges >= 1 && distinctBadges <= 15;

        var groupsMap = {};



        // Phân loại rows 100% ỘNG

        rows.forEach(function (r) {

            var sig = '';

            var groupVal = '';



            if (useBadgeGrouping) {

                groupVal = String(r[badgeKey] || 'Khác').trim();

                sig = 'GROUP|' + groupVal;

            } else {

                // Lấy danh sách keys hợp lệ làm chữ ký cấu trúc

                var keys = Object.keys(r).filter(function (k) {

                    return _getHiddenFields().indexOf(k) === -1 && !_isTechnicalRuleField(k) && String(k).indexOf('Metadata_') === -1;

                }).sort();

                sig = keys.join('|');

            }



            if (!groupsMap[sig]) {

                groupsMap[sig] = { rows: [], sig: sig, groupVal: groupVal };

            }

            groupsMap[sig].rows.push(r);

        });



        // Chuyển object sang array và tạo tự động nhãn (Label) cho Tab

        var activeGroups = Object.keys(groupsMap).map(function (k) { return groupsMap[k]; });



        // Sort activegroups if badge grouping is used

        if (useBadgeGrouping) {

            activeGroups.sort(function (a, b) {

                return String(a.groupVal).localeCompare(String(b.groupVal));

            });

        }



        activeGroups.forEach(function (g, idx) {

            if (useBadgeGrouping) {

                g.label = g.groupVal || 'Chưa phân loại';

            } else {

                var sampleRow = g.rows[0];

                var titleF = _pickField(sampleRow, 'TITLE');

                if (titleF && titleF.key) {

                    g.label = 'Theo ' + titleF.key;

                } else {

                    var lk = Object.keys(sampleRow).map(function (k) { return k.toLowerCase(); });

                    if (lk.indexOf('employeename') !== -1 || lk.indexOf('tennhanvien') !== -1) g.label = 'Theo NV';

                    else if (lk.indexOf('objectname') !== -1 || lk.indexOf('tenkhachhang') !== -1 || lk.indexOf('tencuahang') !== -1) g.label = 'Theo Khách';

                    else if (lk.indexOf('itemname') !== -1 || lk.indexOf('tensanpham') !== -1) g.label = 'Theo SP';

                    else if (lk.indexOf('tongtien') !== -1) g.label = 'Tổng kết';

                    else if (lk.indexOf('soluong') !== -1) g.label = 'Số lượng';

                    else if (lk.indexOf('docno') !== -1) g.label = 'Chứng từ';

                    else g.label = 'Nhóm ' + (idx + 1);

                }

            }

        });



        var html = '';

        if (headerMsg) {
            // Chuẩn hóa chuỗi "Tìm thấy X kết quả." sang "Kết quả tìm kiếm (X)"
            var match = headerMsg.match(/Tìm thấy\s+(\d+)\s+kết quả\.?/i);
            if (match) {
                headerMsg = 'Kết quả tìm kiếm (' + match[1] + ')';
            }
            html += '<div class="ai-result-header">' + _esc(headerMsg) + '</div>';
        }

        if (activeGroups.length > 1) {

            // Render Tabs

            html += '<div class="ai-tabs" style="display:flex; flex-wrap:wrap; gap:16px; margin-bottom:16px; border-bottom: 1px solid var(--color-border); padding-bottom: 0;">';

            var tabsId = 'tabs-' + (++_modalIdCounter);

            activeGroups.forEach(function (g, idx) {

                var borderBottom = (idx === 0) ? '2px solid var(--color-primary)' : '2px solid transparent';

                var cl = (idx === 0) ? 'var(--color-primary)' : 'var(--color-text-muted)';

                var clickJs = "var tp = this.parentElement.parentElement; tp.querySelectorAll('.ai-tab-pane-" + tabsId + "').forEach(function(p){p.style.display='none';}); tp.querySelectorAll('.ai-tab-btn-" + tabsId + "').forEach(function(b){b.style.borderBottom='2px solid transparent'; b.style.color='var(--color-text-muted)';}); this.style.borderBottom='2px solid var(--color-primary)'; this.style.color='var(--color-primary)'; tp.querySelector('#" + tabsId + "-pane-" + idx + "').style.display='block';";

                var icon = '';

                html += '<button class="ai-tab-btn-' + tabsId + '" onclick="' + clickJs + '" style="padding:10px 16px; border:none; background:none; font-weight:600; font-size:13px; border-bottom:' + borderBottom + '; color:' + cl + '; cursor:pointer; outline:none; transition: all 0.2s; border-radius:0; margin-bottom:-1px;">' + icon + _esc(g.label) + ' (' + g.rows.length + ')</button>';

            });

            html += '</div>';



            html += '<div class="ai-tabs-content" style="position:relative;">';

            activeGroups.forEach(function (g, idx) {

                var disp = (idx === 0) ? 'block' : 'none';

                html += '<div class="ai-tab-pane-' + tabsId + '" id="' + tabsId + '-pane-' + idx + '" style="display:' + disp + '">';

                html += _renderSingleGroup(g.rows, apiCode, meta);

                html += '</div>';

            });

            html += '</div>';

        } else {

            html += _renderSingleGroup(rows, apiCode, meta);

        }

        return html;

    }



    // 

    //  PROJECT-SPECIFIC RENDERERS

    //  Các renderer kinh doanh riêng (CONG_NO, TICH_LUY...) đã được

    //  tách sang: chatbot-renderers-{project}.js

    //  ăng ký qua: ApiChatbot.registerRenderer('KEY', function(...){})

    // 



    // ── [CATALOG] renderer — lưới thẻ cho danh mục / sản phẩm ────

    function _renderCatalog(rows, headerMsg, apiCode, meta) {



        var keys = _getKeys(rows);

        var html = '';

        if (headerMsg) html += '<div class="ai-result-header">' + _esc(headerMsg) + '</div>';



        var viewId = 'view-' + (++_modalIdCounter);
        html += '<div class="ai-inline-container" id="' + viewId + '">';
        html += '<div class="ai-view-cards" style="display:none">';
        html += '<div class="ai-catalog-grid">';



        var MAX_CARDS = 30;



        // --- BƯỚC 1: GROUPING ---

        var groups = [];

        var groupMap = {};



        rows.forEach(function (row, idx) {

            var titleF = _pickField(row, 'TITLE');

            var idF = _pickField(row, 'ID');

            var tVal = titleF && titleF.val ? String(titleF.val).trim() : '';

            var idVal = idF && idF.val ? String(idF.val).trim() : '';

            var gKey = tVal + '::' + idVal;

            // Nếu không có cả title và id, fallback không gom nhóm

            if (!tVal && !idVal) gKey = 'ROW::' + idx;



            if (!groupMap[gKey]) {

                groupMap[gKey] = {

                    titleF: titleF,

                    idF: idF,

                    badgeF: _pickField(row, 'BADGE'),

                    moneyF: _pickField(row, 'MONEY'),

                    phoneF: _pickField(row, 'PHONE'),

                    rows: []

                };

                groups.push(groupMap[gKey]);

            }

            groupMap[gKey].rows.push(row);

        });



        // Tìm các key chung và key biến đổi cho từng nhóm

        groups.forEach(function (g) {

            g.commonKeys = [];

            g.varyingKeys = [];

            keys.forEach(function (k) {

                var firstVal = g.rows[0][k];

                var isVarying = g.rows.some(function (r) { return r[k] !== firstVal; });

                if (isVarying) g.varyingKeys.push(k);

                else g.commonKeys.push(k);

            });

        });



        // --- BƯỚC 2: RENDER CC NHÓM ---

        groups.forEach(function (grp, idx) {

            if (idx === MAX_CARDS) {

                html += '</div>';

                html += '<details style="margin-top:10px;">';

                html += '<summary style="cursor:pointer; padding:10px; text-align:center; color:var(--color-primary); font-weight:bold; background:rgba(var(--color-primary-rgb), 0.1); border-radius:8px; margin-bottom:10px; list-style:none;"> Xem thêm ' + (groups.length - MAX_CARDS) + ' thẻ nữa (Tổng ' + groups.length + ')</summary>';

                html += '<div class="ai-catalog-grid">';

            }



            var titleF = grp.titleF;

            var idF = grp.idF;

            var badgeF = grp.badgeF;

            var moneyF = grp.moneyF;

            var phoneF = grp.phoneF;



            var usedKeys = [];

            if (titleF) usedKeys.push(titleF.key);

            if (idF) usedKeys.push(idF.key);

            if (badgeF) usedKeys.push(badgeF.key);

            if (moneyF) usedKeys.push(moneyF.key);

            if (phoneF) usedKeys.push(phoneF.key);



            html += '<div class="ai-catalog-card">';



            // Header

            html += '<div class="ai-catalog-card-top">';

            var initials = titleF ? String(titleF.val).charAt(0).toUpperCase() : (idx + 1);

            html += '<div class="ai-catalog-avatar">' + _esc(String(initials)) + '</div>';

            html += '<div class="ai-catalog-card-info">';

            if (titleF) {

                html += '<div class="ai-catalog-card-name">' + _esc(String(titleF.val)) + '</div>';

            } else {

                html += '<div class="ai-catalog-card-name">Mục ' + (idx + 1) + '</div>';

            }

            if (idF) html += '<div class="ai-catalog-card-id">' + _esc(String(idF.val)) + '</div>';

            html += '</div>'; // info

            if (badgeF) {

                html += '<span class="ai-badge ' + _badgeClass(badgeF.val) + '">' + _esc(String(badgeF.val)) + '</span>';

            }

            html += '</div>'; // top



            // Body — Các fields CÓ CÙNG GI TRỊ (commonKeys)

            html += '<div class="ai-catalog-card-body">';

            if (moneyF && grp.commonKeys.indexOf(moneyF.key) !== -1) {

                html += '<div class="ai-catalog-money">' + _esc(_formatBusinessCell(moneyF.key, moneyF.val)) + '</div>';

            }

            grp.commonKeys.forEach(function (k) {

                if (usedKeys.indexOf(k) !== -1) return;

                var val = grp.rows[0][k];

                if (val === null || val === undefined || String(val).trim() === '') return;

                html += '<div class="ai-catalog-row">';

                html += '<span class="ai-catalog-label">' + _esc(_getFriendlyHeader(k)) + '</span>';

                html += '<span class="ai-catalog-value">' + _esc(_formatBusinessCell(k, val)) + '</span>';

                html += '</div>';

            });

            html += '</div>'; // body



            // THE EXPANDABLE DETAIL PART (Varying fields)

            if (grp.rows.length > 1) {

                html += '<details class="ai-catalog-details">';

                html += '<summary class="ai-catalog-summary"> Hiển thị ' + grp.rows.length + ' phân loại (Kho/Lô...)</summary>';

                html += '<div class="ai-catalog-details-content">';



                var storehouseKeys = grp.varyingKeys.filter(function (k) { return /storehouse|kho$|makho/i.test(k); });



                if (storehouseKeys.length > 0) {

                    var shKey = storehouseKeys[0];

                    var shGroups = {};

                    grp.rows.forEach(function (r) {

                        var shVal = String(r[shKey] || 'Khác');

                        if (!shGroups[shVal]) shGroups[shVal] = [];

                        shGroups[shVal].push(r);

                    });



                    Object.keys(shGroups).forEach(function (shVal) {

                        html += '<div class="ai-catalog-subgroup-title"> Kho: <strong>' + _esc(shVal) + '</strong> (' + shGroups[shVal].length + ' mục)</div>';

                        shGroups[shVal].forEach(function (r, sIdx) {

                            html += '<div class="ai-catalog-subgroup-item">';

                            grp.varyingKeys.forEach(function (k) {

                                if (k === shKey || usedKeys.indexOf(k) !== -1) return;

                                var val = r[k];

                                if (val === null || val === undefined || String(val).trim() === '') return;

                                html += '<div class="ai-catalog-row-small">';

                                html += '<span class="ai-catalog-label-small">' + _esc(_getFriendlyHeader(k)) + '</span>';

                                html += '<span class="ai-catalog-value-small"><strong>' + _esc(_formatBusinessCell(k, val)) + '</strong></span>';

                                html += '</div>';

                            });

                            html += '</div>';

                        });

                    });

                } else {

                    grp.rows.forEach(function (r, sIdx) {

                        html += '<div class="ai-catalog-subgroup-item">';

                        html += '<div class="ai-catalog-subgroup-title">Mục ' + (sIdx + 1) + '</div>';

                        grp.varyingKeys.forEach(function (k) {

                            if (usedKeys.indexOf(k) !== -1) return;

                            var val = r[k];

                            if (val === null || val === undefined || String(val).trim() === '') return;

                            html += '<div class="ai-catalog-row-small">';

                            html += '<span class="ai-catalog-label-small">' + _esc(_getFriendlyHeader(k)) + '</span>';

                            html += '<span class="ai-catalog-value-small"><strong>' + _esc(_formatBusinessCell(k, val)) + '</strong></span>';

                            html += '</div>';

                        });

                        html += '</div>';

                    });

                }

                html += '</div></details>';

            }



            // Action bar (g i / zalo) - use first row for triggers

            html += _buildActionBar(grp.rows[0], apiCode);

            html += '</div>'; // catalog-card

        });



        html += '</div>'; // catalog-grid
        if (groups.length > MAX_CARDS) html += '</details>';
        html += '</div>'; // ai-view-cards

        // Toggle sang bảng
        var toggleText = '📊 Xem dạng bảng';

        html += '<button class="ai-table-btn ai-inline-toggle-btn" data-view-id="' + viewId + '" data-orig-text="' + _esc(toggleText) + '" style="display:none">' + toggleText + '</button>';

        html += '<div class="ai-view-table">';

        html += _buildInlineTable(rows, keys, apiCode);

        html += '</div>';

        html += '</div>'; // ai-inline-container



        return html;

    }



    // ── Registry Registration ─────────────────────────────────────

    // CORE renderers — hoạt động cho m i project

    _UI_RENDERERS['DEFAULT'] = _renderCardView;

    _UI_RENDERERS['CATALOG'] = _renderCatalog;



    // ── Inline Toggle & Modal table helpers ─────────────────────────

    function _getFriendlyHeader(key, apiCode) {
        var dict = {
            'unitprice': 'Đơn giá',
            'totalamount': 'Thành tiền',
            'discountpercent': 'Tỷ lệ giảm giá',
            'discountamount': 'Tiền giảm giá',
            'taxpercent': 'Thuế suất',
            'taxamount': 'Tiền thuế',
            'itemid': 'Mã SP',
            'itemname': 'Sản phẩm',
            'unit': 'ĐVT',
            'canhbaoai': 'Gợi ý AI',
            'canh_bao_ai': 'Gợi ý AI',
            'price': 'Đơn giá',
            'quantity': 'Số lượng',
            'amount': 'Thành tiền',
            'money': 'Số tiền',
            'customername': 'Khách hàng',
            'custname': 'Khách hàng',
            'date': 'Ngày',
            'status': 'Trạng thái',
            'trend': 'Xu hướng',
            'percent': 'Tiến độ',
            'target': 'Mục tiêu',
            'title': 'Tiêu đề',
            'id': 'Mã',
            'name': 'Tên',
            'phone': 'Số ĐT',
            'address': 'Địa chỉ',
            'username': 'Tài khoản',
            // Inventory columns
            'storehouseid': 'Mã kho',
            'storehousename': 'Tên kho',
            'lot': 'Số lô',
            'expiredate': 'Hạn sử dụng',
            'nhap': 'Nhập',
            'xuat': 'Xuất',
            'toncuoi': 'Tồn ERP',
            'tonkho': 'Tồn ERP',
            'donvitinh': 'Đơn vị tính',
            // Order & general document columns translations
            'documentid': 'Mã đơn',
            'documentdate': 'Ngày đặt',
            'objectname': 'Khách hàng',
            'basetotal': 'Tổng tiền',
            'statusname': 'Trạng thái',
            'employeename': 'Nhân viên',
            'employeeid': 'Mã nhân viên',
            'datecreate': 'Ngày tạo trên hệ thống',
            'notes': 'Ghi chú',
            'docno': 'Số CT',
            'customerphone': 'Số ĐT KH',
            'deliverdate': 'Ngày giao',
            'depositamount': 'Đặt cọc',
            'diemtichluy': 'Tích lũy',
            // Column translations for total debt report (API_CongNoKhachHang_AI)
            'tenkh': 'Tên KH',
            'tongno': 'Tổng nợ',
            'makh': 'Mã KH',
            'phanloai': 'Phân loại',
            // Survey translations (API_DanhSachCauHoiKhaoSat_AI)
            'macauhoi': 'Mã câu hỏi',
            'tencauhoi': 'Tên câu hỏi',
            'noidung': 'Nội dung',
            'noidungcauhoi': 'Nội dung câu hỏi',
            // Tuyen ban hang translations (API_TuyenBanHang_AI)
            'tuyen': 'Tuyến',
            'lichghe': 'Lịch Ghé',
            'lanmuacuoi': 'Lần Mua Cuối',
            'songaykhongmua': 'Số Ngày Không Mua',
            'chukytb': 'Chu Kỳ Mua TB (Ngày)',
            'ngaydudoan': 'Ngày Dự Đoán Hết Hàng',
            'conlai': 'Còn Lại (Ngày)',
            'diemuutien': 'Điểm Ưu Tiên',
            'lydoghe': 'Lý Do Ghé',
            'physicalstock': 'Tồn ERP',
            'availablestock': 'Tồn khả dụng tham khảo',
            'stockdatastatus': 'Trạng thái dữ liệu tồn kho',
            'freshnessstatus': 'Độ mới dữ liệu',
            'stockupdatedat': 'Cập nhật tồn kho lúc',
            'revenuebasis': 'Cơ sở tính doanh số',
            'revenuerecognition': 'Cách ghi nhận doanh số',
            'doanhsodaxuat': 'Doanh số đã xuất/giao',
            'doanhthudathu': 'Doanh thu đã thu',
            'risklevel': 'Mức rủi ro',
            'valuesegment': 'Phân khúc giá trị',
            'customertier': 'Hạng khách hàng',
            'dotincay': 'Độ tin cậy',
            'lastpurchasesource': 'Nguồn lần mua cuối',
            'lastvisitstatus': 'Trạng thái dữ liệu ghé',
            'actionstatus': 'Trạng thái phê duyệt',
            'programstatus': 'Trạng thái chương trình',
            'recommendationreason': 'Lý do đề xuất',
            'recommendationstatus': 'Trạng thái khuyến nghị',
            'medicaldisclaimer': 'Cảnh báo chuyên môn',
            'datawindow': 'Khoảng dữ liệu',
            'paymentstatus': 'Trạng thái thanh toán',
            'duestatus': 'Trạng thái hạn thanh toán',
            'debtsize': 'Quy mô công nợ',
            'asofdate': 'Dữ liệu đến ngày',
            'datasource': 'Nguồn dữ liệu',
            'totaldebt': 'Tổng công nợ',
            'customerid': 'Mã khách hàng',
            'handung': 'Hạn sử dụng',
            'loaidexuat': 'Đề xuất xem xét',
            'proposalreason': 'Lý do cần xem xét'
        };
        var lower = key.toLowerCase().replace(/_/g, '');
        var api = String(apiCode || (typeof window !== 'undefined' ? window.__medstandFriendlyApiCode : '')).toLowerCase();
        if (api === '@hoa_don' || api === '@hoa_don_chi_tiet') {
            var invoiceDict = {
                'documentid': 'Mã hóa đơn',
                'documentdate': 'Ngày hóa đơn',
                'itemid': 'Mã sản phẩm',
                'itemname': 'Sản phẩm',
                'quantity': 'Số lượng',
                'amount': 'Tiền hàng',
                'unitprice': 'Đơn giá',
                'totalamount': 'Thành tiền',
                'donvitinh': 'Đơn vị tính',
                'storehouseid': 'Mã kho',
                'storehousename': 'Tên kho'
            };
            if (invoiceDict[lower]) return invoiceDict[lower];
        }
        if (api === '@de_xuat_khuyen_mai') {
            var promotionDict = {
                'itemid': 'Mã sản phẩm',
                'itemname': 'Sản phẩm',
                'availablestock': 'Số lượng còn hạn',
                'handung': 'Hạn sử dụng',
                'loaidexuat': 'Mức độ cần xem xét'
            };
            if (promotionDict[lower]) return promotionDict[lower];
        }
        if (api === '@goi_ydon_hang') {
            var orderSuggestionDict = {
                'physicalstock': 'Tồn kho hiện tại',
                'availablestock': 'Số lượng có thể bán',
                'stockdatastatus': 'Tình trạng tồn kho'
            };
            if (orderSuggestionDict[lower]) return orderSuggestionDict[lower];
        }
        return dict[lower] || key;
    }

    function _splitKeysSmart(keys, forceShowAll) {
        if (forceShowAll || keys.length <= 5) {
            return {
                primary: keys,
                secondary: []
            };
        }

        var HIGH_PRIORITY = [
            'itemid', 'masp', 'itemname', 'sanpham', 'title', 'name', 'customername', 'custname',
            'canhbaoai', 'canh_bao_ai', 'trend', 'percent',
            'money', 'amount', 'price', 'dongia', 'quantity', 'tonkho',
            // Vietnamese normalized equivalents
            'tennv', 'tenkh', 'tensanpham', 'tenkhachhang', 'tendoitac', 'tencuahang', 'tennhanvien',
            'doanhso', 'soluong', 'sotien', 'thanhtien', 'chinhanh',
            'xuhuong', 'trangthai', 'tiendo', 'muctieu',
            'risklevel', 'diemtonghop', 'lydochinh',
            'physicalstock', 'availablestock', 'stockdatastatus', 'actionstatus', 'lastvisitstatus', 'dotincay',
            // Order & general document columns
            'documentid', 'documentdate', 'objectname', 'basetotal', 'statusname', 'employeename', 'docno'
        ];

        var primary = [];
        var secondary = [];

        keys.forEach(function (k) {
            var lower = k.toLowerCase().replace(/_/g, '').replace(/\s/g, '');
            // Convert Vietnamese to unsigned/diacritic-free lowercase for smart matching
            var normalized = lower
                .replace(/[àáạảãâầấậẩẫăằắặẳẵ]/g, 'a')
                .replace(/[èéẹẻẽêềếệểễ]/g, 'e')
                .replace(/[ìíịỉĩ]/g, 'i')
                .replace(/[òóọỏõôồốộổỗơờớợởỡ]/g, 'o')
                .replace(/[ùúụủũưừứựửữ]/g, 'u')
                .replace(/[ỳýỵỷỹ]/g, 'y')
                .replace(/đ/g, 'd');

            if (normalized !== 'stt' && (HIGH_PRIORITY.indexOf(normalized) !== -1 || HIGH_PRIORITY.indexOf(lower) !== -1)) {
                primary.push(k);
            } else {
                secondary.push(k);
            }
        });

        if (primary.length === 0 && keys.length > 0) {
            primary.push(keys[0]);
            secondary = keys.slice(1);
        }

        var MAX_PRIMARY = 4;
        if (primary.length > MAX_PRIMARY) {
            var extra = primary.slice(MAX_PRIMARY);
            primary = primary.slice(0, MAX_PRIMARY);
            secondary = extra.concat(secondary);
        }

        return {
            primary: primary,
            secondary: secondary
        };
    }

    function _splitKeysForApi(keys, forceShowAll, apiCode) {
        var normalizedApiCode = String(apiCode || '').toLowerCase();
        if (normalizedApiCode === '@tuyen_ban_hang') {
            var routePrimaryOrder = [
                'tencuahang', 'lydoghe', 'songaykhongmua', 'lichghe'
            ];
            var routePrimary = [];
            routePrimaryOrder.forEach(function (wanted) {
                var matched = keys.find(function (key) {
                    return String(key || '').toLowerCase().replace(/[_\s]/g, '') === wanted;
                });
                if (matched && routePrimary.indexOf(matched) === -1) routePrimary.push(matched);
            });
            if (!routePrimary.length && keys.length) routePrimary.push(keys[0]);
            return {
                primary: routePrimary,
                secondary: keys.filter(function (key) { return routePrimary.indexOf(key) === -1; })
            };
        }

        if (normalizedApiCode === '@danh_sach_tonkho') {
            var inventoryPrimaryOrder = [
                'itemid', 'itemname', 'storehousename', 'lot', 'physicalstock', 'availablestock'
            ];
            var inventoryPrimary = [];
            inventoryPrimaryOrder.forEach(function (wanted) {
                var matched = keys.find(function (key) {
                    return String(key || '').toLowerCase().replace(/[_\s]/g, '') === wanted;
                });
                if (matched && inventoryPrimary.indexOf(matched) === -1) inventoryPrimary.push(matched);
            });
            if (!inventoryPrimary.length && keys.length) inventoryPrimary.push(keys[0]);
            return {
                primary: inventoryPrimary,
                secondary: keys.filter(function (key) { return inventoryPrimary.indexOf(key) === -1; })
            };
        }

        if (normalizedApiCode !== '@de_xuat_khuyen_mai') {
            return _splitKeysSmart(keys, forceShowAll);
        }

        var primaryOrder = ['itemid', 'itemname', 'availablestock', 'handung', 'loaidexuat'];
        var primary = [];
        primaryOrder.forEach(function (wanted) {
            var matched = keys.find(function (key) {
                return String(key || '').toLowerCase().replace(/[_\s]/g, '') === wanted;
            });
            if (matched && primary.indexOf(matched) === -1) primary.push(matched);
        });

        if (!primary.length && keys.length) primary.push(keys[0]);
        return {
            primary: primary,
            secondary: keys.filter(function (key) { return primary.indexOf(key) === -1; })
        };
    }

        function _isNumCol(k) {
        var lowerK = String(k || '').toLowerCase().replace(/_/g, '');
        var numKeywords = ['doanhso', 'doanhthu', 'soluong', 'tonkho', 'physicalstock', 'availablestock', 'toncuoi', 'tien', 'gia', 'chietkhau', 'thanhtien', 'dongia', 'amount', 'qty', 'price', 'revenue', 'sales', 'total', 'discount', 'sum', 'val'];
        for (var i = 0; i < numKeywords.length; i++) {
            if (lowerK.indexOf(numKeywords[i]) !== -1) {
                return true;
            }
        }
            return false;
        }

        function _isNegativeStockCell(key, value) {
            var normalized = String(key || '').toLowerCase().replace(/[_\s]/g, '');
            if (['physicalstock', 'toncuoi', 'tonkho'].indexOf(normalized) === -1) return false;
            var number = Number(value);
            return Number.isFinite(number) && number < 0;
        }

    /**

     * Build full inline table HTML (filter bar + table)

     * rows/keys được attach lên DOM element sau khi insert qua __rows/__keys

     * để filter events có thể dùng lại mà không cần cache global

     */

    function _buildInlineTable(rows, keys, apiCode, cacheRows) {
        if (typeof window !== 'undefined') window.__medstandFriendlyApiCode = apiCode || '';

        // Ẩn các cột nội bộ không nên hiển thị cho user
        var HIDDEN_COLS = [
            'datasourcevalue', 'DataSourceValue', 'datasource_value',
            'extradata', 'ExtraData', 'extra_data',
            'icon', 'Icon', 'ICON',
            'isactive', 'IsActive', 'is_active',
            'orderindex', 'OrderIndex',
            'metadata_uitemplate',
            'branchid', 'BranchID',
            'managerid', 'ManagerID',
            'stt', 'STT',
            'statusid', 'StatusID',
            'maxfromdate', 'MaxFromDate',
            'doanhsochinhanh', 'DoanhSoChiNhanh',
            'statusbackcolor', 'StatusBackColor',
            'msg', 'Msg', 'msgtype', 'MsgType',
            'objectid', 'ObjectID',
            'totalrows', 'TotalRows', 'page', 'Page', 'pagesize', 'PageSize'
        ];

        // Phát hiện cờ ép hiển thị toàn bộ cột từ SQL trả về (ví dụ cột 'showallcols' hoặc 'fulltable' hoặc 'showall')
        var forceShowAll = false;
        var filteredKeys = [];
        var hasAmountColumn = keys.some(function (key) { return String(key).toLowerCase() === 'amount'; });
        keys.forEach(function (k) {
            var lowerK = k.toLowerCase().replace(/_/g, '');
            var normalizedK = k.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]/g, '');
            if (lowerK === 'showallcols' || lowerK === 'fulltable' || lowerK === 'showall') {
                forceShowAll = true;
            } else if (_isTechnicalRuleField(k)) {
                return;
            } else if (String(apiCode || '').toLowerCase() === '@doanh_so' && (normalizedK === 'ngayban' || (normalizedK === 'doanhso' && hasAmountColumn))) {
                return;
            } else if (HIDDEN_COLS.indexOf(k) === -1 && HIDDEN_COLS.indexOf(k.toLowerCase()) === -1) {
                filteredKeys.push(k);
            }
        });
        keys = filteredKeys;

        var tbodyId = 'ai-inline-tbody-v' + _modalIdCounter;

        var html = '';

        var isTierScoringTable = String(apiCode || '').toLowerCase() === '@cham_diem_kh';
        var tierPage = rows.length ? Number(rows[0].Page || rows[0].page || 1) : 1;
        var tierPageSize = rows.length ? Number(rows[0].PageSize || rows[0].pagesize || 10) : 10;
        var tierTotalRows = rows.length ? Number(rows[0].TotalRows || rows[0].totalRows || rows.length) : 0;
        if (!Number.isFinite(tierPage) || tierPage < 1) tierPage = 1;
        if (!Number.isFinite(tierPageSize) || tierPageSize < 1) tierPageSize = 10;
        if (!Number.isFinite(tierTotalRows) || tierTotalRows < 0) tierTotalRows = rows.length;

        var normalizedStockKeys = keys.map(function (key) {
            return String(key || '').toLowerCase().replace(/[_\s]/g, '');
        });
        var hasAvailableStock = normalizedStockKeys.indexOf('availablestock') !== -1;
        var stockNeedsVerification = rows.some(function (row) {
            var available = row.AvailableStock ?? row.availableStock ?? row.availablestock;
            return hasAvailableStock && (available === null || available === undefined || available === '');
        });
        if (stockNeedsVerification) {
            html += '<aside class="ai-stock-guidance" role="note">'
                + '<div><strong>Chưa có số lượng có thể bán</strong>'
                + '<span>Đây không phải là hết hàng. Hãy kiểm tra tồn kho trước khi báo khách hoặc chốt đơn.</span></div>'
                + '<button type="button" class="ai-stock-check-btn">Kiểm tra tồn kho</button>'
                + '</aside>';
        }



        // ── Phát hiện field phân loại (badge) để tạo filter chip động ──
        var badgeKeyFound = null;
        var badgeValues = {};
        if (rows.length > 0) {
            // Sử dụng hàm helper _pickField chuẩn để tìm cột có Role là BADGE (hoặc Phân loại)
            var sampleBadge = _pickField(rows[0], 'BADGE');
            if (sampleBadge) {
                var bk = sampleBadge.key;
                rows.forEach(function (r) {
                    var v = String(r[bk] || '').trim();
                    if (v) badgeValues[v] = (badgeValues[v] || 0) + 1;
                });
                var bvKeys = Object.keys(badgeValues);
                if (bvKeys.length >= 2 && bvKeys.length <= 6) {
                    badgeKeyFound = bk;
                } else {
                    badgeValues = {};
                }
            }
        }



        // ── Filter toolbar ──

        var chipsHtml = '';

        if (isTierScoringTable) {
            chipsHtml += '<button class="ai-sales-filter-chip active" data-server-tier="" type="button">Tất cả</button>';
            chipsHtml += '<button class="ai-sales-filter-chip" data-server-tier="A" type="button">Nhóm A</button>';
            chipsHtml += '<button class="ai-sales-filter-chip" data-server-tier="B" type="button">Nhóm B</button>';
            chipsHtml += '<button class="ai-sales-filter-chip" data-server-tier="C" type="button">Nhóm C</button>';
        } else {
            chipsHtml = '<button class="ai-sales-filter-chip active" data-filter="all" type="button">' + (String(apiCode || '').toLowerCase() === '@don_hang' ? 'Tất cả trạng thái' : 'Tất cả') + '</button>';
        }

        if (!isTierScoringTable && badgeKeyFound) {

            // Render chip cho từng giá trị phân loại thực tế trong data

            var sortedBadgeValues = Object.keys(badgeValues);
            if (String(apiCode || '').toLowerCase() === '@don_hang') {
                var orderStatusFlow = [
                    'đơn nháp', 'tdv kiểm tra lại', 'chờ duyệt', 'nhận đơn',
                    'đơn đã xử lý chưa chuyển kho', 'đã chuyển xuống kho', 'đã xuất hàng',
                    'đã đi gửi hàng', 'khách đã nhận hàng', 'đã thu tiền', 'đã hủy'
                ];
                sortedBadgeValues.sort(function (left, right) {
                    var leftRank = orderStatusFlow.indexOf(String(left).trim().toLowerCase());
                    var rightRank = orderStatusFlow.indexOf(String(right).trim().toLowerCase());
                    if (leftRank === -1) leftRank = orderStatusFlow.length;
                    if (rightRank === -1) rightRank = orderStatusFlow.length;
                    return leftRank - rightRank || String(left).localeCompare(String(right), 'vi');
                });
            } else {
                sortedBadgeValues.sort();
            }

            sortedBadgeValues.forEach(function (v) {

                var icon = (v === 'A' || v.toUpperCase() === 'VIP') ? '  ' :

                    (v === 'B') ? '🔵 ' :

                        (v === 'C') ? '🔴 ' : '';

                chipsHtml += '<button class="ai-sales-filter-chip" data-filter="badge:' + _esc(v) + '" data-badge-key="' + _esc(badgeKeyFound) + '" type="button">' + icon + _esc(v) + ' (' + badgeValues[v] + ')</button>';

            });

        }

        if (!isTierScoringTable) {
            chipsHtml += '<span class="ai-sales-filter-count">' + rows.length + ' dòng</span>';
        }

        var filterRowCount = cacheRows ? cacheRows.length : rows.length;
        if (filterRowCount > 12 || isTierScoringTable) {
            html += '<div class="ai-sales-filter-bar ai-inline-filter">'
                + '<input class="ai-sales-filter-input" type="search" placeholder="Tìm nhanh trong kết quả..." autocomplete="off" />'
                + '<div class="ai-sales-filter-chips"' + (isTierScoringTable ? ' data-tier-controls="true"' : '') + '>' + chipsHtml + '</div>'
                + '</div>';
        }



        // ── Table ──

        var tableWrapClass = 'ai-inline-table-wrap';
        if (String(apiCode || '').toLowerCase() === '@doanh_so' && filterRowCount > 10) tableWrapClass += ' ai-inline-table-scroll';
        html += '<div class="' + tableWrapClass + '">';

        html += '<table class="ai-table"><thead><tr>';

        var split = _splitKeysForApi(keys, forceShowAll, apiCode);
        var primaryKeys = split.primary;
        var secondaryKeys = split.secondary;
        var hasDetails = secondaryKeys.length > 0;

        if (hasDetails) {
            html += '<th style="width: 32px; text-align: center;"></th>'; // Cột toggle
        }
        if (apiCode === '@hoa_don') {
            html += '<th style="width: 112px; text-align: center;">Thao tác</th>';
        }
        primaryKeys.forEach(function (k) {
            var thClass = _isNumCol(k) ? ' class="ai-num-col"' : '';
            var friendlyHeader = String(apiCode || '').toLowerCase() === '@doanh_so' && String(k).toLowerCase() === 'amount' ? 'Doanh số' : _getFriendlyHeader(k, apiCode);
            html += '<th' + thClass + '>' + _esc(friendlyHeader) + '</th>';
        });

        html += '</tr></thead>';

        var tablePageSize = isTierScoringTable ? tierPageSize : 25;
        var tablePage = isTierScoringTable ? tierPage : 1;
        html += '<tbody id="' + tbodyId + '">' + _renderTableBody(rows, keys, forceShowAll, apiCode, tablePage, tablePageSize) + '</tbody>';

        html += '</table></div>';



        // Lưu data vào cache để filter handler dùng

        _modalDataCache[tbodyId] = {
            rows: cacheRows || rows,
            visibleRows: rows,
            keys: keys,
            badgeKey: badgeKeyFound,
            forceShowAll: forceShowAll,
            apiCode: apiCode,
            isTierScoring: isTierScoringTable,
            currentTier: '',
            currentPage: tierPage,
            pageSize: tierPageSize,
            totalRows: tierTotalRows,
            currentTablePage: tablePage,
            tablePageSize: tablePageSize,
            loading: false
        };



        return html;

    }





    function _buildOrderDetail(row) {
        var orderId = _formatBusinessCell('DocumentID', row.DocumentID, '@don_hang');
        var statusName = _formatBusinessCell('StatusName', row.StatusName, '@don_hang');
        var total = _formatBusinessCell('BaseTotal', row.BaseTotal, '@don_hang');
        var points = row.DiemTichLuy === null || row.DiemTichLuy === undefined ? '0' : String(row.DiemTichLuy);
        var employeeName = _formatBusinessCell('EmployeeName', row.EmployeeName, '@don_hang');
        var employeeId = _formatBusinessCell('EmployeeID', row.EmployeeID, '@don_hang');
        var employee = employeeName + (employeeId !== '—' ? ' · ' + employeeId : '');

        var html = '<div class="ai-order-detail-panel">';
        html += '<div class="ai-order-detail-heading">'
            + '<div><span>Mã đơn</span><strong>' + _esc(orderId) + '</strong></div>'
            + '<span class="ai-order-status-pill">' + _esc(statusName) + '</span>'
            + '</div>';
        html += '<section class="ai-order-detail-section ai-order-overview">'
            + '<h4>Tổng quan</h4>'
            + '<div class="ai-order-overview-grid">'
            + '<div><span>Tổng tiền</span><strong>' + _esc(total) + '</strong></div>'
            + '<div><span>Tích lũy</span><strong>' + _esc(points) + '</strong></div>'
            + '<div><span>Ngày tạo trên hệ thống</span><strong>' + _esc(_formatBusinessCell('DateCreate', row.DateCreate, '@don_hang')) + '</strong></div>'
            + '</div></section>';
        html += '<div class="ai-order-detail-groups">';
        html += '<section class="ai-order-detail-section"><h4>Khách hàng và phụ trách</h4><dl>'
            + '<div><dt>Số điện thoại</dt><dd>' + _esc(_formatBusinessCell('CustomerPhone', row.CustomerPhone, '@don_hang')) + '</dd></div>'
            + '<div><dt>Nhân viên</dt><dd>' + _esc(employee) + '</dd></div>'
            + '</dl></section>';
        html += '<section class="ai-order-detail-section"><h4>Giao hàng và thanh toán</h4><dl>'
            + '<div><dt>Ngày đặt</dt><dd>' + _esc(_formatBusinessCell('DocumentDate', row.DocumentDate, '@don_hang')) + '</dd></div>'
            + '<div><dt>Ngày giao</dt><dd>' + _esc(_formatBusinessCell('DeliverDate', row.DeliverDate, '@don_hang')) + '</dd></div>'
            + '<div><dt>Đặt cọc</dt><dd>' + _esc(_formatBusinessCell('DepositAmount', row.DepositAmount, '@don_hang')) + '</dd></div>'
            + '<div><dt>Ghi chú</dt><dd>' + _esc(_formatBusinessCell('Notes', row.Notes, '@don_hang')) + '</dd></div>'
            + '</dl></section>';
        html += '</div></div>';
        return html;
    }

    function _buildTierScoringDetail(row) {
        var customerId = row.ObjectID || row.CustomerID || row.MaKH || '';
        var customerName = row.TenCuaHang || row.CustomerName || row.ObjectName || 'Khách hàng';
        var tier = String(row.Nhom || row.ValueSegment || '').toUpperCase();
        var tierName = tier === 'A' ? 'Khách VIP' : (tier === 'B' ? 'Khách hàng thường' : 'Khách giá trị thấp');
        var risk = String(row.RiskLevel || '').toUpperCase();
        var riskLabel = risk === 'HIGH' ? 'Rủi ro cao' : (risk === 'MEDIUM' ? 'Rủi ro vừa' : 'Rủi ro thấp');
        var riskClass = risk === 'HIGH' ? 'high' : (risk === 'MEDIUM' ? 'medium' : 'low');
        var reason = row.LyDoChinh || 'Chưa có lý do cảnh báo';
        var trend = row.XuHuong || 'Chưa xác định';
        var phone = _formatBusinessCell('Phone', row.Phone);
        var lastPurchase = _formatBusinessCell('LanMuaCuoi', row.LanMuaCuoi);
        var daysWithoutPurchase = row.SoNgayKhongMua === null || row.SoNgayKhongMua === undefined ? '—' : String(row.SoNgayKhongMua) + ' ngày';
        var revenue12 = row.DoanhSo12Thang === null || row.DoanhSo12Thang === undefined ? '—' : _formatCurrencyVnd(row.DoanhSo12Thang);
        var revenue3 = row.DoanhSo3ThangGan === null || row.DoanhSo3ThangGan === undefined ? '—' : _formatCurrencyVnd(row.DoanhSo3ThangGan);
        var score = row.DiemTongHop === null || row.DiemTongHop === undefined ? '—' : String(row.DiemTongHop) + '/100';
        var daysValue = Number(row.SoNgayKhongMua);
        var rScore = Number(row.R_Score);
        var fScore = Number(row.F_Score);
        var mScore = Number(row.M_Score);
        var scoreMeaning = function (value, high, middle) {
            if (!Number.isFinite(value)) return 'Chưa xác định';
            return value >= high ? 'Tốt' : (value >= middle ? 'Khá' : 'Cần chú ý');
        };
        // Hiển thị nghiệp vụ dựa trên số ngày thực tế; không suy diễn ngược từ R_SCORE.
        var rMeaning = Number.isFinite(daysValue) ? (daysValue >= 90 ? 'Cần chú ý' : (daysValue >= 45 ? 'Theo dõi' : 'Tốt')) : scoreMeaning(rScore, 70, 40);
        var fMeaning = scoreMeaning(fScore, 70, 40);
        var mMeaning = scoreMeaning(mScore, 70, 40);
        var detail = '<div class="ai-tier-detail">';
        detail += '<div class="ai-tier-detail-head"><div><strong>' + _esc(customerName) + '</strong><span>' + _esc(phone) + '</span></div>'
            + '<div class="ai-tier-detail-badges"><span class="ai-tier-badge tier-' + _esc(tier.toLowerCase()) + '">Nhóm ' + _esc(tier || '—') + ' · ' + _esc(tierName) + '</span>'
            + '<span class="ai-tier-badge risk-' + riskClass + '">' + _esc(riskLabel) + '</span></div></div>';
        detail += '<div class="ai-tier-alert" role="note"><strong>⚠ Lý do cảnh báo</strong><span>' + _esc(reason) + '</span><small>Doanh số 3 tháng gần nhất: ' + _esc(revenue3) + ' · Xu hướng: ' + _esc(trend) + '</small></div>';
        detail += '<div class="ai-tier-interpretations"><div><span>Hoạt động mua gần đây</span><strong>' + _esc(rMeaning) + '</strong><small>' + _esc(daysWithoutPurchase) + ' chưa phát sinh đơn</small></div>'
            + '<div><span>Tần suất mua</span><strong>' + _esc(fMeaning) + '</strong><small>Dựa trên số lần mua trong kỳ</small></div>'
            + '<div><span>Giá trị mua hàng</span><strong>' + _esc(mMeaning) + '</strong><small>Doanh số 12 tháng: ' + _esc(revenue12) + '</small></div>'
            + '<div><span>Nguy cơ giảm mua</span><strong>' + _esc(riskLabel) + '</strong><small>Xu hướng: ' + _esc(trend) + '</small></div></div>';
        detail += '<div class="ai-tier-metrics"><div><span>Lần mua cuối</span><strong>' + _esc(lastPurchase) + '</strong></div>'
            + '<div><span>Doanh số 12 tháng</span><strong>' + _esc(revenue12) + '</strong></div>'
            + '<div><span>Doanh số 3 tháng gần nhất</span><strong>' + _esc(revenue3) + '</strong></div>'
            + '<div><span>Số ngày chưa mua</span><strong>' + _esc(daysWithoutPurchase) + '</strong></div>'
            + '<div><span>Điểm tổng hợp</span><strong>' + _esc(score) + '</strong></div></div>';
        detail += '<div class="ai-tier-actions"><button type="button" data-tier-action="history" data-customer-id="' + _esc(customerId) + '">Xem lịch sử mua</button>'
            + '<button type="button" data-tier-action="order-suggestion" data-customer-id="' + _esc(customerId) + '">Gợi ý đơn hàng</button>'
            + '<button type="button" data-tier-action="debt" data-customer-id="' + _esc(customerId) + '">Xem công nợ</button></div>';
        detail += '<details class="ai-tier-scoring-details"><summary>Chi tiết cách tính</summary><div>'
            + '<span>Mức độ mua gần đây (R): <b>' + _esc(row.R_Score ?? '—') + '/100</b></span>'
            + '<span>Tần suất mua (F): <b>' + _esc(row.F_Score ?? '—') + '/100</b></span>'
            + '<span>Giá trị mua hàng (M): <b>' + _esc(row.M_Score ?? '—') + '/100</b></span>'
            + '<span>Chỉ số bổ sung (C, cần xác nhận ý nghĩa): <b>' + _esc(row.C_Score ?? '—') + '/100</b></span></div></details></div>';
        return detail;
    }

    function _buildSalesRouteDetail(row) {
        var customerName = row.TenCuaHang || row.CustomerName || row.ObjectName || 'Khách hàng';
        var reason = row.LyDoGhe || 'Theo lịch chăm sóc khách hàng';
        var priority = Number(row.DiemUuTien);
        var daysWithoutPurchase = Number(row.SoNgayKhongMua);
        var nextAction = row.LanMuaCuoi === 'N/A' || !row.LanMuaCuoi
            ? 'Liên hệ làm quen, xác nhận nhu cầu và cập nhật thông tin khách hàng.'
            : (Number.isFinite(daysWithoutPurchase) && daysWithoutPurchase >= 30
                ? 'Ưu tiên liên hệ hoặc ghé chăm sóc; kiểm tra nhu cầu trước khi gợi ý sản phẩm.'
                : 'Thực hiện theo lịch tuyến và ghi nhận kết quả chăm sóc.');
        var priorityLabel = Number.isFinite(priority) && priority >= 100
            ? 'Ưu tiên rất cao'
            : (Number.isFinite(priority) && priority >= 70 ? 'Ưu tiên cao' : 'Theo dõi');

        var html = '<div class="ai-route-detail">';
        html += '<div class="ai-route-detail-head"><div><strong>' + _esc(customerName) + '</strong>'
            + '<span>' + _esc(row.Phone || 'Chưa có số điện thoại') + '</span></div>'
            + '<span class="ai-route-priority">' + _esc(priorityLabel) + '</span></div>';
        html += '<div class="ai-route-reason"><strong>Lý do cần chăm sóc</strong><span>' + _esc(reason) + '</span></div>';
        html += '<div class="ai-route-metrics">'
            + '<div><span>Lần mua gần nhất</span><strong>' + _esc(row.LanMuaCuoi || 'Chưa có đơn hoàn tất') + '</strong></div>'
            + '<div><span>Số ngày chưa mua</span><strong>' + _esc(Number.isFinite(daysWithoutPurchase) ? daysWithoutPurchase + ' ngày' : 'Khách hàng mới') + '</strong></div>'
            + '<div><span>Lịch tuyến</span><strong>' + _esc(row.LichGhe || 'Chưa có lịch') + '</strong></div>'
            + '<div><span>Tuyến phụ trách</span><strong>' + _esc(row.Tuyen || 'Chưa xác định') + '</strong></div>'
            + '</div>';
        html += '<div class="ai-route-next-action"><strong>Việc nên làm tiếp theo</strong><span>' + _esc(nextAction) + '</span></div>';
        if (row.Address) {
            html += '<div class="ai-route-address"><strong>Địa chỉ:</strong> ' + _esc(row.Address) + '</div>';
        }
        html += '</div>';
        return html;
    }

    function _translateRecommendationReasons(value) {
        var labels = {
            'NEW_CUSTOMER': 'Khách hàng mới',
            'INSUFFICIENT_HISTORY': 'Chưa đủ lịch sử mua hàng',
            'REORDER_OVERDUE': 'Đã đến hoặc quá thời điểm thường mua lại',
            'REORDER_WINDOW': 'Sắp đến thời điểm thường mua lại',
            'CYCLE_STABLE': 'Chu kỳ mua đang ổn định',
            'FOCUS_ITEM': 'Sản phẩm trọng tâm',
            'SEASONAL': 'Phù hợp mùa vụ',
            'ACTIVE_PROMOTION_REFERENCE': 'Có chương trình khuyến mãi đang áp dụng'
        };
        return String(value || '').split('|').map(function (part) {
            var key = String(part || '').trim().toUpperCase();
            return labels[key] || '';
        }).filter(Boolean).join(' · ') || 'Chưa có lý do cụ thể';
    }

    function _buildOrderSuggestionDetail(row) {
        var customer = row.TenKhachHang || row.CustomerName || 'Khách hàng';
        var product = row.TenSanPham || row.ItemName || 'Sản phẩm';
        var status = row.TrangThai || 'Chưa xác định';
        var confidence = _formatBusinessCell('DoTinCay', row.DoTinCay, '@goi_ydon_hang');
        var purchaseCount = Number(row.SoLanMua || 0);
        var totalPurchased = row.TongDaMua === null || row.TongDaMua === undefined ? '—' : _formatCurrencyVnd(row.TongDaMua);
        var lastPurchase = row.LanMuaCuoi || '—';
        var cycle = Number(row.ChuKyNgay);
        var remaining = Number(row.ConLaiNgay);
        var cycleText = Number.isFinite(cycle) && cycle > 0
            ? 'Thường mua lại sau khoảng ' + cycle + ' ngày' + (Number.isFinite(remaining) ? ' · Còn khoảng ' + remaining + ' ngày' : '')
            : 'Chưa đủ dữ liệu để dự kiến thời điểm mua lại';
        var explanation = String(row.ChiTiet || '').replace(/\s*\|\s*/g, ' · ') || 'Chưa có giải thích bổ sung';
        var reasons = _translateRecommendationReasons(row.RecommendationReason || row.LyDoDeXuat);
        var html = '<div class="ai-order-suggestion-detail">';
        html += '<div class="ai-order-suggestion-head"><div><strong>' + _esc(product) + '</strong><span>Khách hàng: ' + _esc(customer) + '</span></div>'
            + '<div><span class="ai-suggestion-badge">' + _esc(status) + '</span><span class="ai-suggestion-badge neutral">' + _esc(confidence) + '</span></div></div>';
        html += '<div class="ai-order-suggestion-metrics"><div><span>Số lần đã mua</span><strong>' + purchaseCount + ' lần</strong></div>'
            + '<div><span>Tổng giá trị đã mua</span><strong>' + _esc(totalPurchased) + '</strong></div>'
            + '<div><span>Lần mua gần nhất</span><strong>' + _esc(lastPurchase) + '</strong></div></div>';
        html += '<div class="ai-order-suggestion-reason"><strong>Vì sao hệ thống gợi ý?</strong><span>' + _esc(reasons) + '</span><small>' + _esc(explanation) + '</small></div>';
        html += '<div class="ai-order-suggestion-cycle"><strong>Dự kiến mua lại</strong><span>' + _esc(cycleText) + '</span></div>';
        html += '<small class="ai-order-suggestion-window">Dữ liệu tham khảo: 6 tháng gần nhất; nếu chưa đủ, hệ thống sử dụng thêm lịch sử mua trước đó.</small></div>';
        return html;
    }

    function _buildPromotionReviewDetail(row) {
        var product = row.ItemName || row.TenSanPham || 'Sản phẩm';
        var itemId = row.ItemID || row.MaSP || '';
        var proposalType = row.LoaiDeXuat || 'Cần theo dõi';
        var approval = String(row.ApprovalStatus || '').toUpperCase() === 'PENDING_COMPANY_APPROVAL'
            ? 'Chờ công ty phê duyệt'
            : 'Chưa xác định trạng thái phê duyệt';
        var physicalStock = row.PhysicalStock ?? row.TonKho;
        var availableStock = row.AvailableStock;
        var expiry = _formatBusinessCell('ExpireDate', row.HanDung || row.NearestExpireDate);
        var unit = row.Unit || row.DVT || row.DonViTinh || '';
        var reason = row.ProposalReason || 'Chưa có lý do cụ thể';
        var discount = row.PhanTramDeXuat === null || row.PhanTramDeXuat === undefined
            ? 'Chưa đề xuất mức giảm'
            : String(row.PhanTramDeXuat) + '%';
        var physicalLabel = physicalStock === null || physicalStock === undefined || physicalStock === ''
            ? 'Chưa xác định'
            : _fmtCellVal(physicalStock) + (unit ? ' ' + unit : '');
        var availableLabel = availableStock === null || availableStock === undefined || availableStock === ''
            ? 'Chưa xác định'
            : _fmtCellVal(availableStock) + (unit ? ' ' + unit : '');
        var html = '<div class="ai-promotion-review-detail">';
        html += '<div class="ai-promotion-review-head"><div><strong>' + _esc(product) + '</strong><span>Mã sản phẩm: ' + _esc(itemId || '—') + '</span></div>'
            + '<div><span class="ai-promotion-review-badge urgent">' + _esc(proposalType) + '</span><span class="ai-promotion-review-badge">' + _esc(approval) + '</span></div></div>';
        html += '<div class="ai-promotion-review-metrics"><div><span>Tồn kho hiện tại</span><strong>' + _esc(physicalLabel) + '</strong></div>'
            + '<div><span>Tồn còn hạn để tham khảo</span><strong>' + _esc(availableLabel) + '</strong></div>'
            + '<div><span>Hạn dùng gần nhất</span><strong>' + _esc(expiry) + '</strong></div>'
            + '<div><span>Mức giảm dự kiến</span><strong>' + _esc(discount) + '</strong></div></div>';
        html += '<div class="ai-promotion-review-reason"><strong>Vì sao cần xem xét?</strong><span>' + _esc(reason) + '</span></div>';
        html += '<div class="ai-promotion-review-next"><strong>Bước tiếp theo</strong><span>Quản lý hoặc quản trị viên kiểm tra tồn kho, lô hàng và chính sách trước khi gửi người có thẩm quyền quyết định. Hệ thống không tự áp dụng giảm giá.</span></div>';
        html += '</div>';
        return html;
    }

    function _renderTableBody(filteredRows, keys, forceShowAll, apiCode, pageNumber, pageSize) {

        var DEFAULT_PAGE_SIZE = 25;
        var isTierScoringTable = String(apiCode || '').toLowerCase() === '@cham_diem_kh';
        // Tương thích với call cũ truyền boolean showAllRows.
        if (typeof pageNumber === 'boolean') pageNumber = 1;
        pageNumber = Number(pageNumber);
        pageSize = Number(pageSize);
        if (!Number.isFinite(pageNumber) || pageNumber < 1) pageNumber = 1;
        if (!Number.isFinite(pageSize) || pageSize < 1) pageSize = DEFAULT_PAGE_SIZE;

        var tierTotalRows = isTierScoringTable && filteredRows.length
            ? Number(filteredRows[0].TotalRows || filteredRows[0].totalRows || filteredRows.length)
            : filteredRows.length;
        if (!Number.isFinite(tierTotalRows) || tierTotalRows < 0) tierTotalRows = filteredRows.length;
        var totalPages = Math.max(1, Math.ceil(tierTotalRows / pageSize));
        if (pageNumber > totalPages) pageNumber = totalPages;
        var startIndex = (pageNumber - 1) * pageSize;
        // API chấm điểm đã trả đúng dữ liệu của trang hiện tại.
        var pageRows = isTierScoringTable
            ? filteredRows.slice(0, pageSize)
            : filteredRows.slice(startIndex, startIndex + pageSize);
        var shown = pageRows.length;

        var html = '';

        var split = _splitKeysForApi(keys, forceShowAll, apiCode);
        var primaryKeys = split.primary;
        var secondaryKeys = split.secondary;
        var hasDetails = secondaryKeys.length > 0;
        var isInvoiceList = apiCode === '@hoa_don';
        var isOrderList = String(apiCode || '').toLowerCase() === '@don_hang';
        var isOrderSuggestionTable = String(apiCode || '').toLowerCase() === '@goi_ydon_hang';
        var isPromotionReviewTable = String(apiCode || '').toLowerCase() === '@de_xuat_khuyen_mai';
        var isSalesRouteTable = String(apiCode || '').toLowerCase() === '@tuyen_ban_hang';
        var colSpan = primaryKeys.length + (hasDetails ? 1 : 0) + (isInvoiceList ? 1 : 0);

        for (var i = 0; i < shown; i++) {

            var row = pageRows[i];
            html += '<tr>';

            if (hasDetails) {
                html += '<td style="width: 32px; text-align: center; cursor: pointer;" class="ai-row-toggle">▶</td>';
            }

            primaryKeys.forEach(function (k) {
                var val = row[k];
                var cellHtml = '';
                var lowerK = k.toLowerCase().replace(/_/g, '');

                if (lowerK === 'stockdatastatus' && String(val || '').trim().toUpperCase() === 'STOCK_RECONCILIATION_REQUIRED') {
                    cellHtml = '<span class="ai-stock-status-warning">' + _esc(_formatBusinessCell(k, val, apiCode)) + '</span>';
                } else if (_isNegativeStockCell(k, val)) {
                    cellHtml = '<span class="ai-stock-negative" title="Tồn ERP đang âm; cần đối soát trước khi bán.">' + _esc(_formatBusinessCell(k, val, apiCode)) + '</span>';
                } else if (lowerK === 'canhbaoai' || lowerK === 'canh_bao_ai') {
                    cellHtml = '<span class="ai-badge-recommend">' + _esc(_formatBusinessCell(k, val, apiCode)) + '</span>';
                } else {
                    cellHtml = _esc(_formatBusinessCell(k, val, apiCode));
                }

                var tdClass = _isNumCol(k) ? 'ai-num-col' : '';
                if (_isNegativeStockCell(k, val)) tdClass += ' ai-stock-negative-cell';
                tdClass = tdClass ? ' class="' + tdClass + '"' : '';
                html += '<td' + tdClass + '>' + cellHtml + '</td>';
            });

            if (isInvoiceList) {
                var invoiceId = row.DocumentID || row.MaHoaDon || '';
                html += '<td style="text-align:center"><button type="button" class="ai-table-btn ai-invoice-detail-btn" data-document-id="' + _esc(invoiceId) + '"' + (invoiceId ? '' : ' disabled') + '>Xem chi tiết</button></td>';
            }

            html += '</tr>';

            if (hasDetails) {
                html += '<tr class="ai-table-detail-row" style="display: none;"><td colspan="' + colSpan + '">';
                if (isTierScoringTable) {
                    html += _buildTierScoringDetail(row);
                } else if (isOrderSuggestionTable) {
                    html += _buildOrderSuggestionDetail(row);
                } else if (isPromotionReviewTable) {
                    html += _buildPromotionReviewDetail(row);
                } else if (isSalesRouteTable) {
                    html += _buildSalesRouteDetail(row);
                } else if (isOrderList) {
                    html += _buildOrderDetail(row);
                } else {
                    html += '<div class="ai-table-detail-grid">';
                    secondaryKeys.forEach(function (k) {
                        html += '<div class="ai-table-detail-item">';
                        html += '  <div class="ai-table-detail-label">' + _esc(_getFriendlyHeader(k)) + '</div>';
                        html += '  <div class="ai-table-detail-value">' + _esc(_formatBusinessCell(k, row[k], apiCode)) + '</div>';
                        html += '</div>';
                    });
                    html += '</div>';
                }
                html += '</td></tr>';
            }

        }

        if (isTierScoringTable && tierTotalRows > 0) {
            var tierEndIndex = Math.min(startIndex + shown, tierTotalRows);
            var tierPagination = '<div class="ai-table-pagination">'
                + '<span class="ai-table-pagination-range">Hiển thị ' + (startIndex + 1) + ' - ' + tierEndIndex + ' / ' + tierTotalRows + ' khách hàng</span>'
                + '<label class="ai-table-page-size-label">'
                + '<span>Dòng/trang</span>'
                + '<select class="ai-tier-page-size" aria-label="Số khách hàng mỗi trang">'
                + '<option value="10"' + (pageSize === 10 ? ' selected' : '') + '>10</option>'
                + '<option value="25"' + (pageSize === 25 ? ' selected' : '') + '>25</option>'
                + '<option value="50"' + (pageSize === 50 ? ' selected' : '') + '>50</option>'
                + '</select></label>'
                + '<div class="ai-table-page-controls" aria-label="Phân trang khách hàng">'
                + '<button type="button" class="ai-table-page-btn ai-table-page-arrow" data-tier-page-action="prev"' + (pageNumber <= 1 ? ' disabled' : '') + ' aria-label="Trang trước">‹</button>';

            var tierPageStart = Math.max(1, pageNumber - 2);
            var tierPageEnd = Math.min(totalPages, pageNumber + 2);
            if (tierPageStart > 1) {
                tierPagination += '<button type="button" class="ai-table-page-btn" data-tier-page-number="1">1</button>';
                if (tierPageStart > 2) tierPagination += '<span class="ai-table-page-ellipsis">…</span>';
            }
            for (var tierPageNumber = tierPageStart; tierPageNumber <= tierPageEnd; tierPageNumber++) {
                tierPagination += '<button type="button" class="ai-table-page-btn' + (tierPageNumber === pageNumber ? ' active' : '') + '" data-tier-page-number="' + tierPageNumber + '" aria-current="' + (tierPageNumber === pageNumber ? 'page' : 'false') + '">' + tierPageNumber + '</button>';
            }
            if (tierPageEnd < totalPages) {
                if (tierPageEnd < totalPages - 1) tierPagination += '<span class="ai-table-page-ellipsis">…</span>';
                tierPagination += '<button type="button" class="ai-table-page-btn" data-tier-page-number="' + totalPages + '">' + totalPages + '</button>';
            }
            tierPagination += '<button type="button" class="ai-table-page-btn ai-table-page-arrow" data-tier-page-action="next"' + (pageNumber >= totalPages ? ' disabled' : '') + ' aria-label="Trang sau">›</button>'
                + '</div></div>';
            html += '<tr class="ai-table-page-row"><td colspan="' + colSpan + '">' + tierPagination + '</td></tr>';
        } else if (filteredRows.length > pageSize) {
            var endIndex = Math.min(startIndex + pageSize, filteredRows.length);
            var paginationUnit = keys.some(function (key) {
                return String(key || '').toLowerCase().replace(/[_\s]/g, '') === 'availablestock';
            }) ? 'sản phẩm' : 'dòng';
            var pagination = '<div class="ai-table-pagination">'
                + '<span class="ai-table-pagination-range">Hiển thị ' + (startIndex + 1) + ' - ' + endIndex + ' / ' + filteredRows.length + ' ' + paginationUnit + '</span>'
                + '<label class="ai-table-page-size-label">'
                + '<span>Dòng/trang</span>'
                + '<select class="ai-table-page-size" aria-label="Số dòng mỗi trang">'
                + '<option value="10"' + (pageSize === 10 ? ' selected' : '') + '>10</option>'
                + '<option value="25"' + (pageSize === 25 ? ' selected' : '') + '>25</option>'
                + '<option value="50"' + (pageSize === 50 ? ' selected' : '') + '>50</option>'
                + '</select></label>'
                + '<div class="ai-table-page-controls" aria-label="Phân trang">'
                + '<button type="button" class="ai-table-page-btn ai-table-page-arrow" data-table-page-action="prev"' + (pageNumber <= 1 ? ' disabled' : '') + ' aria-label="Trang trước">‹</button>';

            var pageStart = Math.max(1, pageNumber - 2);
            var pageEnd = Math.min(totalPages, pageNumber + 2);
            if (pageStart > 1) {
                pagination += '<button type="button" class="ai-table-page-btn" data-table-page-number="1">1</button>';
                if (pageStart > 2) pagination += '<span class="ai-table-page-ellipsis">…</span>';
            }
            for (var page = pageStart; page <= pageEnd; page++) {
                pagination += '<button type="button" class="ai-table-page-btn' + (page === pageNumber ? ' active' : '') + '" data-table-page-number="' + page + '" aria-current="' + (page === pageNumber ? 'page' : 'false') + '">' + page + '</button>';
            }
            if (pageEnd < totalPages) {
                if (pageEnd < totalPages - 1) pagination += '<span class="ai-table-page-ellipsis">…</span>';
                pagination += '<button type="button" class="ai-table-page-btn" data-table-page-number="' + totalPages + '">' + totalPages + '</button>';
            }
            pagination += '<button type="button" class="ai-table-page-btn ai-table-page-arrow" data-table-page-action="next"' + (pageNumber >= totalPages ? ' disabled' : '') + ' aria-label="Trang sau">›</button>'
                + '</div></div>';
            html += '<tr class="ai-table-page-row"><td colspan="' + colSpan + '">' + pagination + '</td></tr>';
        }

        return html;

    }



    /** Lc rows theo search text + filter key (client-side) */

    function _applyModalFilter(allRows, keys, searchText, filterKey, badgeKey) {

        var filtered = allRows;

        // Filter chip: badge:VALUE (ví dụ badge:A, badge:VIP)

        if (filterKey && filterKey.indexOf('badge:') === 0) {

            var targetVal = filterKey.substring(6); // lấy phần sau "badge:"

            filtered = filtered.filter(function (r) {

                // Nếu biết cụ thể field nào (badgeKey) → chỉ lc field đó

                if (badgeKey) {

                    return String(r[badgeKey] || '').trim() === targetVal;

                }

                // Fallback: tìm trong tất cả keys

                return keys.some(function (k) {

                    return String(r[k] || '').trim() === targetVal;

                });

            });

        }

        // Search text: khớp bất kỳ field nào (case-insensitive, b dấu)



        if (searchText) {

            var kw = _clearVn(searchText.toLowerCase());

            filtered = filtered.filter(function (r) {

                return keys.some(function (k) {

                    return _clearVn(String(r[k] || '')).indexOf(kw) !== -1;

                });

            });

        }

        return filtered;

    }



    // ── Click delegation cho accordion + modal + action bar ────────

    function _applySalesManagementFilter(container) {
        if (!container) return;
        var tbody = container.querySelector('tbody');
        var cached = tbody ? _modalDataCache[tbody.id] : null;
        if (!tbody || !cached || !cached.rows || !cached.keys) return;
        var activeCard = container.querySelector('.ai-sales-group-card.active');
        var activeGroup = activeCard ? activeCard.getAttribute('data-sales-group') : '';
        container.classList.toggle('ai-sales-show-quantity', activeGroup === 'Sản phẩm');
        var searchInput = container.querySelector('.ai-sales-filter-input');
        var searchText = searchInput ? searchInput.value : '';
        var filtered = cached.rows.filter(function (row) {
            return !activeGroup || String(row['Nhóm phân tích'] || '') === activeGroup;
        });
        filtered = _applyModalFilter(filtered, cached.keys, searchText, 'all', null);
        cached.visibleRows = filtered;
        cached.currentTablePage = 1;
        tbody.innerHTML = _renderTableBody(filtered, cached.keys, cached.forceShowAll, cached.apiCode, cached.currentTablePage, cached.tablePageSize);
        var count = container.querySelector('.ai-sales-detail-count');
        if (count) count.textContent = (activeGroup ? activeGroup + ': ' : '') + filtered.length + ' dòng';
        var filterCount = container.querySelector('.ai-sales-filter-count');
        if (filterCount) filterCount.textContent = filtered.length + ' dòng';
    }

    function _syncTierScoringControls(container, cache) {
        if (!container || !cache) return;
        var pageCount = Math.max(1, Math.ceil(Number(cache.totalRows || 0) / Number(cache.pageSize || 10)));
        container.querySelectorAll('[data-server-tier]').forEach(function (button) {
            button.classList.toggle('active', String(button.getAttribute('data-server-tier') || '') === String(cache.currentTier || ''));
            button.disabled = Boolean(cache.loading);
        });
        var previous = container.querySelector('[data-tier-page-action="prev"]');
        var next = container.querySelector('[data-tier-page-action="next"]');
        if (previous) previous.disabled = Boolean(cache.loading) || Number(cache.currentPage || 1) <= 1;
        if (next) next.disabled = Boolean(cache.loading) || Number(cache.currentPage || 1) >= pageCount;
        container.querySelectorAll('[data-tier-page-number], .ai-tier-page-size').forEach(function (control) {
            control.disabled = Boolean(cache.loading);
        });
        var pageLabel = container.querySelector('.ai-tier-page-label');
        if (pageLabel) pageLabel.textContent = cache.loading
            ? 'Đang tải...'
            : 'Trang ' + Number(cache.currentPage || 1) + ' / ' + pageCount;
        var count = container.querySelector('.ai-sales-filter-count');
        if (count) {
            count.textContent = cache.loadError
                ? 'Không tải được dữ liệu'
                : Number((cache.rows || []).length) + ' / ' + Number(cache.totalRows || 0) + ' khách';
        }
    }

    function _loadTierScoringPage(control, tier, page) {
        var container = control ? control.closest('.ai-view-table') : null;
        var tbody = container ? container.querySelector('tbody') : null;
        var cache = tbody ? _modalDataCache[tbody.id] : null;
        if (!container || !tbody || !cache || cache.loading) return;
        if (!window.ApiEngine || typeof window.ApiEngine.queryData !== 'function') return;

        var targetTier = String(tier || '').toUpperCase();
        var targetPage = Math.max(1, Number(page || 1));
        var pageCount = Math.max(1, Math.ceil(Number(cache.totalRows || 0) / Number(cache.pageSize || 10)));
        if (targetPage > pageCount && targetTier === String(cache.currentTier || '')) return;

        cache.loading = true;
        cache.loadError = false;
        _syncTierScoringControls(container, cache);

        var params = {
            '@Page': targetPage,
            '@PageSize': Number(cache.pageSize || 10)
        };
        if (targetTier) params['@NhomFilter'] = targetTier;

        window.ApiEngine.queryData('@cham_diem_kh', params).then(function (newRows) {
            newRows = Array.isArray(newRows) ? newRows : [];
            cache.rows = newRows;
            cache.visibleRows = newRows;
            cache.currentTier = targetTier;
            cache.currentPage = targetPage;
            cache.totalRows = newRows.length
                ? Number(newRows[0].TotalRows || newRows[0].totalRows || newRows.length)
                : 0;
            cache.currentTablePage = targetPage;
            cache.tablePageSize = Number(cache.pageSize || 10);
            var search = container.querySelector('.ai-sales-filter-input');
            if (search) search.value = '';
            tbody.innerHTML = newRows.length
                ? _renderTableBody(newRows, cache.keys, cache.forceShowAll, cache.apiCode, cache.currentPage, cache.pageSize)
                : '<tr><td colspan="99" class="ai-tier-empty">Không có khách hàng trong nhóm này.</td></tr>';
        }).catch(function (error) {
            cache.loadError = true;
            console.error('[Chatbot] Tier pagination failed:', error);
        }).finally(function () {
            cache.loading = false;
            _syncTierScoringControls(container, cache);
        });
    }

    $messages.addEventListener('click', function (e) {
        var stockCheckBtn = e.target.closest('.ai-stock-check-btn');
        if (stockCheckBtn) {
            e.preventDefault();
            e.stopPropagation();
            $input.value = '@danh_sach_tonkho ';
            $input.dispatchEvent(new Event('input', { bubbles: true }));
            $input.focus();
            return;
        }

        var tierAction = e.target.closest('[data-tier-action]');
        if (tierAction) {
            e.preventDefault();
            e.stopPropagation();
            var customerId = tierAction.getAttribute('data-customer-id') || '';
            if (!customerId || !window.ApiEngine || typeof window.ApiEngine.execute !== 'function') return;
            var action = tierAction.getAttribute('data-tier-action');
            var today = new Date();
            var todayIso = today.toISOString().slice(0, 10);
            var from = new Date(today);
            from.setFullYear(from.getFullYear() - 1);
            var fromIso = from.toISOString().slice(0, 10);
            var apiCode = action === 'history' ? '@hoa_don' : (action === 'order-suggestion' ? '@goi_ydon_hang' : '@cong_no_chi_tiet');
            var params = { '@MaKhachHang': customerId };
            if (action === 'history') {
                params['@TuNgay'] = fromIso;
                params['@DenNgay'] = todayIso;
            } else if (action === 'debt') {
                params['@DenNgay'] = todayIso;
            }
            tierAction.disabled = true;
            tierAction.setAttribute('aria-busy', 'true');
            window.ApiEngine.execute(apiCode, params);
            setTimeout(function () {
                tierAction.disabled = false;
                tierAction.removeAttribute('aria-busy');
            }, 900);
            return;
        }

        var tierControl = e.target.closest('[data-server-tier], [data-tier-page-action], [data-tier-page-number]');
        if (tierControl) {
            e.preventDefault();
            e.stopPropagation();
            var tierContainer = tierControl.closest('.ai-view-table');
            var tierTbody = tierContainer ? tierContainer.querySelector('tbody') : null;
            var tierCache = tierTbody ? _modalDataCache[tierTbody.id] : null;
            if (!tierCache) return;
            if (tierControl.hasAttribute('data-server-tier')) {
                _loadTierScoringPage(tierControl, tierControl.getAttribute('data-server-tier'), 1);
            } else if (tierControl.hasAttribute('data-tier-page-number')) {
                _loadTierScoringPage(tierControl, tierCache.currentTier, Number(tierControl.getAttribute('data-tier-page-number')) || 1);
            } else {
                var direction = tierControl.getAttribute('data-tier-page-action');
                var nextPage = Number(tierCache.currentPage || 1) + (direction === 'prev' ? -1 : 1);
                _loadTierScoringPage(tierControl, tierCache.currentTier, nextPage);
            }
            return;
        }

        var tablePageControl = e.target.closest('.ai-table-page-btn, .ai-table-page-size');
        if (tablePageControl) {
            e.preventDefault();
            e.stopPropagation();
            var pageTbody = tablePageControl.closest('tbody');
            var pageCache = pageTbody ? _modalDataCache[pageTbody.id] : null;
            if (!pageTbody || !pageCache) return;
            var pageRows = pageCache.visibleRows || pageCache.rows || [];
            var pageSize = pageCache.tablePageSize || 25;
            var currentPage = pageCache.currentTablePage || 1;
            if (tablePageControl.classList.contains('ai-table-page-size')) {
                pageSize = Number(tablePageControl.value) || 25;
                currentPage = 1;
            } else if (tablePageControl.hasAttribute('data-table-page-number')) {
                currentPage = Number(tablePageControl.getAttribute('data-table-page-number')) || 1;
            } else {
                var pageAction = tablePageControl.getAttribute('data-table-page-action');
                currentPage += pageAction === 'prev' ? -1 : 1;
            }
            var totalPages = Math.max(1, Math.ceil(pageRows.length / pageSize));
            currentPage = Math.max(1, Math.min(currentPage, totalPages));
            pageCache.currentTablePage = currentPage;
            pageCache.tablePageSize = pageSize;
            pageTbody.innerHTML = _renderTableBody(pageRows, pageCache.keys, pageCache.forceShowAll, pageCache.apiCode, currentPage, pageSize);
            return;
        }

        var salesGroupCard = e.target.closest('.ai-sales-group-card');
        if (salesGroupCard) {
            e.preventDefault();
            var managementDetail = salesGroupCard.closest('.ai-sales-management-detail');
            if (!managementDetail) return;
            managementDetail.querySelectorAll('.ai-sales-group-card').forEach(function (card) {
                var selected = card === salesGroupCard;
                card.classList.toggle('active', selected);
                card.setAttribute('aria-pressed', selected ? 'true' : 'false');
            });
            _applySalesManagementFilter(managementDetail);
            return;
        }
        var invoiceDetailBtn = e.target.closest('.ai-invoice-detail-btn');
        if (invoiceDetailBtn) {
            e.preventDefault();
            e.stopPropagation();
            var documentId = invoiceDetailBtn.getAttribute('data-document-id');
            if (!documentId || !window.ApiEngine || typeof window.ApiEngine.execute !== 'function') return;

            invoiceDetailBtn.disabled = true;
            invoiceDetailBtn.textContent = 'Đang tải...';
            Promise.resolve(window.ApiEngine.execute('@hoa_don_chi_tiet', {
                '@DocumentID': documentId
            })).finally(function () {
                invoiceDetailBtn.disabled = false;
                invoiceDetailBtn.textContent = 'Xem chi tiết';
            });
            return;
        }

        // Table row detail toggle (Hỗ trợ click cả dòng cực nhạy trên Mobile)
        var targetTr = e.target.closest('tr');
        if (targetTr && !targetTr.classList.contains('ai-table-detail-row')) {
            var rowToggle = targetTr.querySelector('.ai-row-toggle');
            // Đảm bảo không trigger khi click vào thẻ link hoặc button hành động
            if (rowToggle && !e.target.closest('a') && !e.target.closest('button') && !e.target.closest('.ai-row-toggle')) {
                var nextTr = targetTr.nextElementSibling;
                if (nextTr && nextTr.classList.contains('ai-table-detail-row')) {
                    var isHidden = nextTr.style.display === 'none';
                    nextTr.style.display = isHidden ? '' : 'none';
                    rowToggle.textContent = isHidden ? '▼' : '▶';
                    targetTr.classList.toggle('expanded', isHidden);
                }
                return;
            }
        }

        var rowToggle = e.target.closest('.ai-row-toggle');
        if (rowToggle) {
            var tr = rowToggle.closest('tr');
            var nextTr = tr ? tr.nextElementSibling : null;
            if (nextTr && nextTr.classList.contains('ai-table-detail-row')) {
                var isHidden = nextTr.style.display === 'none';
                nextTr.style.display = isHidden ? '' : 'none';
                rowToggle.textContent = isHidden ? '▼' : '▶';
                tr.classList.toggle('expanded', isHidden);
            }
            return;
        }

        // Accordion expand

        var expandBtn = e.target.closest('.ai-card-expand-btn');

        if (expandBtn) {

            var card = expandBtn.closest('.ai-card');

            if (card) {

                var detail = card.querySelector('.ai-card-detail');

                if (detail) {

                    var isOpen = !detail.hidden;

                    detail.hidden = isOpen;

                    expandBtn.textContent = isOpen ? '▾' : '▴';

                    card.classList.toggle('expanded', !isOpen);

                }

            }

            return;

        }

        // Inline toggle (thay thế modal)

        var tableBtn = e.target.closest('.ai-inline-toggle-btn');

        if (tableBtn) {

            var vid = tableBtn.getAttribute('data-view-id');

            var container = document.getElementById(vid);

            if (!container) return;

            var cardView = container.querySelector('.ai-view-cards');

            var tableView = container.querySelector('.ai-view-table');

            var isShowingTable = tableView && tableView.style.display !== 'none';



            if (isShowingTable) {

                // ── Quay lại Card view ──

                if (cardView) cardView.style.display = '';

                if (tableView) tableView.style.display = 'none';

                // Restore text gốc từ data attribute (tránh encoding mismatch)

                var origText = tableBtn.getAttribute('data-orig-text') || '📊 Xem dạng bảng';

                tableBtn.textContent = origText;

            } else {

                // ── Chuyển sang Table view ──

                if (cardView) cardView.style.display = 'none';

                tableBtn.textContent = '🎨 Xem dạng thẻ';



                if (tableView) {

                    tableView.style.display = 'block';

                    tableView.style.animation = 'ai-inline-fadein 0.25s ease';



                    // Bind filter events (chỉ 1 lần, bc try-catch để không block display)

                    if (!tableView.dataset.filterBound) {

                        tableView.dataset.filterBound = '1';

                        try {

                            var tbody = tableView.querySelector('tbody');

                            var tbodyId = tbody ? tbody.id : null;

                            var cached = tbodyId ? _modalDataCache[tbodyId] : null;

                            var allRows = cached ? cached.rows : null;

                            var keysF = cached ? cached.keys : null;

                            var badgeKeyF = cached ? cached.badgeKey : null;

                            if (allRows && keysF) {

                                var searchEl2 = tableView.querySelector('.ai-sales-filter-input');

                                var countEl2 = tableView.querySelector('.ai-sales-filter-count');

                                var curFilter = 'all';

                                var curSearch = '';

                                var curBadgeKey = badgeKeyF;

                                var doFilter2 = function () {

                                    var currentRows = cached && cached.rows ? cached.rows : allRows;
                                    var filtered = _applyModalFilter(currentRows, keysF, curSearch, curFilter, curBadgeKey);

                                    if (cached) {
                                        cached.visibleRows = filtered;
                                        cached.currentTablePage = 1;
                                    }
                                    if (tbody) tbody.innerHTML = _renderTableBody(filtered, keysF, cached && cached.forceShowAll, cached && cached.apiCode, 1, cached && cached.tablePageSize);

                                    if (countEl2 && !(cached && cached.isTierScoring)) countEl2.textContent = filtered.length + ' dòng';

                                };

                                if (searchEl2) {

                                    var _t2 = null;

                                    searchEl2.addEventListener('mousedown', function (e) { e.stopPropagation(); });
                                    searchEl2.addEventListener('click', function (e) { e.stopPropagation(); });

                                    searchEl2.addEventListener('input', function () {

                                        clearTimeout(_t2);

                                        var sv = searchEl2.value;

                                        _t2 = setTimeout(function () { curSearch = sv; doFilter2(); }, 200);

                                    });

                                }

                                tableView.querySelectorAll('.ai-sales-filter-chip:not([data-server-tier])').forEach(function (chip) {

                                    chip.addEventListener('click', function () {

                                        tableView.querySelectorAll('.ai-sales-filter-chip:not([data-server-tier])').forEach(function (c) { c.classList.remove('active'); });

                                        chip.classList.add('active');

                                        curFilter = chip.getAttribute('data-filter');

                                        var chipBk = chip.getAttribute('data-badge-key');

                                        curBadgeKey = chipBk || badgeKeyF;

                                        doFilter2();

                                    });

                                });

                            }

                        } catch (filterErr) {

                            // Filter binding failed nhưng table vẫn hiện được — không sao

                            console.warn('[Chatbot] Filter binding error:', filterErr);

                        }

                    }

                }

            }

            return;

        }

        // ── Feature 1: Lên đơn button ──

        var lenDonBtn = e.target.closest('[data-action="len-don"]');

        if (lenDonBtn) {

            var name = lenDonBtn.getAttribute('data-name') || '';

            if (name) _handleLenDon(name);

            return;

        }

    });

    $messages.addEventListener('change', function (e) {
        var tierPageSizeControl = e.target.closest('.ai-tier-page-size');
        if (tierPageSizeControl) {
            var tierContainer = tierPageSizeControl.closest('.ai-view-table');
            var tierTbody = tierContainer ? tierContainer.querySelector('tbody') : null;
            var tierCache = tierTbody ? _modalDataCache[tierTbody.id] : null;
            if (!tierCache) return;
            tierCache.pageSize = Number(tierPageSizeControl.value) || 10;
            tierCache.tablePageSize = tierCache.pageSize;
            _loadTierScoringPage(tierPageSizeControl, tierCache.currentTier, 1);
            return;
        }
        var pageSizeControl = e.target.closest('.ai-table-page-size');
        if (!pageSizeControl) return;
        var pageTbody = pageSizeControl.closest('tbody');
        var pageCache = pageTbody ? _modalDataCache[pageTbody.id] : null;
        if (!pageTbody || !pageCache) return;
        var pageRows = pageCache.visibleRows || pageCache.rows || [];
        var pageSize = Number(pageSizeControl.value) || 25;
        pageCache.currentTablePage = 1;
        pageCache.tablePageSize = pageSize;
        pageTbody.innerHTML = _renderTableBody(pageRows, pageCache.keys, pageCache.forceShowAll, pageCache.apiCode, 1, pageSize);
    });

    $messages.addEventListener('input', function (e) {
        if (!e.target.classList.contains('ai-sales-filter-input')) return;
        var managementDetail = e.target.closest('.ai-sales-management-detail');
        if (managementDetail) _applySalesManagementFilter(managementDetail);
    });







    function _handleError(err) {

        // Nếu bị abort (user bấm dừng) → không hiện lỗi

        if (err && err.name === 'AbortError') return;

        _hideTyping();

        _setStopMode(false);

        _addMessage('ai', 'Xin lỗi, tôi không thể phản hồi lúc này. Vui lòng thử lại sau.');

    }



    function _getApiConfig(apiCode) {

        console.log('Fetching config for:', apiCode);

        var url = API_CONFIG.N8N_BASE + '/webhook/api-get-config';

        var body = { ApiCode: '@' + apiCode };

        fetch(url, {

            method: 'POST',

            headers: {

                'Content-Type': 'application/json',

                'Authorization': 'Bearer ' + _getToken()

            },

            body: JSON.stringify(body)

        })

            .then(function (r) {

                console.log('Config API Raw Response Status:', r.status);

                return r.text();

            })

            .then(function (textRes) {

                var res = null;

                try { res = JSON.parse(textRes); } catch (e) { res = textRes; }



                var fields = null;

                if (res && res.data && !Array.isArray(res.data) && (res.data.FieldCode || res.data.field || res.data.name)) {

                    fields = [res.data];

                }

                else if (res && res.data && Array.isArray(res.data.fields)) fields = res.data.fields;

                else if (res && res.data && Array.isArray(res.data)) fields = res.data;

                else if (res && Array.isArray(res.fields)) fields = res.fields;

                else if (res && Array.isArray(res)) fields = res;



                if (fields && fields.length > 0) {

                    var msg = 'Tham số cho ' + apiCode + ':\n';

                    fields.forEach(function (f) {

                        var code = f.FieldCode || f.field || f.name || '';

                        var name = f.FieldName || f.placeholder || f.placeholderText || '';

                        var req = f.IsRequired || f.required ? ' (bắt buộc)' : '';

                        msg += '- ' + code + req + (name ? ' — ' + name : '') + '\n';

                    });

                    _addMessage('ai', msg);



                    if (window._ghostSet) {

                        var hint = fields.map(function (f) { return (f.FieldCode || f.field || '').replace(/^@/, '') + ':'; }).join(' ');

                        window._ghostSet('@' + apiCode + ' ' + hint + ' ');

                    }

                }

            })

            .catch(function (err) {

                console.error('Fetch config error:', err);

            });

    }



    // ── Auto-resize textarea ──

    function _autoResize() {

        $input.style.height = 'auto';

        $input.style.height = Math.min($input.scrollHeight, 120) + 'px';

        _scrollBottom();

    }



    // ── Keyboard / Focus handling ──

    // interactive-widget=resizes-content đã tự thu viewport khi keyboard mở

    // → chỉ cần scroll xuống cuối, KHÔNG đẩy input bar thủ công

    if (window.visualViewport) {

        var _lastVH = window.visualViewport.height;

        window.visualViewport.addEventListener('resize', function () {

            var newVH = window.visualViewport.height;

            var grew = newVH - _lastVH;

            _lastVH = newVH;



            if (document.activeElement === $input) {

                if (grew > 100) {

                    // Keyboard closed via Back button

                    $input.blur();

                } else {

                    // Keyboard might be opening or other resize

                    _scrollBottom();

                }

            } else if (grew > 100) {

                // Một số trình duyệt Android đóng bàn phím mà không phát blur.

                _setMobileKeyboardLayout(false);

            }

        });

    }



    $input.addEventListener('focus', function () {

        // Cuộn xuống cuối — đợi keyboard mở xong

        setTimeout(_scrollBottom, 400);

        setTimeout(_scrollBottom, 800);

    });



    // 

    //  @MENTION AUTOCOMPLETE

    // 



    // Khởi tạo mặc định ngay — đảm bảo @mention luôn hoạt động

    // Khởi tạo mặc định rỗng — hoàn toàn phụ thuộc vào API

    var MENTION_TRIGGERS = {};

    var mentionKeysPattern = null;

    var MENTION_CACHE_KEY = 'mention_categories';

    var MENTION_CACHE_TTL = 24 * 60 * 60 * 1000; // 24 gi



    /** Apply categories vào MENTION_TRIGGERS + build regex */

    function _mentionApplyCategories(records) {

        MENTION_TRIGGERS = {};

        records.forEach(function (r) {

            var key = r.type || r.MaDanhMuc || '';

            if (key) {

                MENTION_TRIGGERS[key] = {

                    type: key,

                    label: r.label || r.TenDanhMuc || key,

                    icon: r.icon || r.Icon || ''

                };

            }

        });

        var keys = Object.keys(MENTION_TRIGGERS);

        if (keys.length) {

            mentionKeysPattern = new RegExp('@(' + keys.join('|') + ')(\\s(.*))?$', 'i');

        }

    }



    /** Load categories — ưu tiên cache, fetch API nếu hết hạn */

    function _mentionLoadCategories() {

        // 1. c cache trước

        try {

            var cached = JSON.parse(localStorage.getItem(MENTION_CACHE_KEY));

            if (cached && cached.data && (Date.now() - cached.timestamp < MENTION_CACHE_TTL)) {

                _mentionApplyCategories(cached.data);

                return; // cache còn hạn → không cần gi API

            }

        } catch (e) { /* cache lỗi → b qua, fetch API */ }



        // 2. Fetch từ API

        var qs = encodeURIComponent(JSON.stringify({ Type: 'categories', SearchText: '' }));

        var url = API_CONFIG.BASE_URL + API_CONFIG.ENDPOINTS.AI.CATALOG + '?q=' + qs;

        var token = _getToken();



        fetch(url, {

            method: 'GET',

            headers: token ? { 'Authorization': 'Bearer ' + token } : {}

        })

            .then(function (r) { return r.json(); })

            .then(function (res) {

                var records = [];

                if (res && res.data && Array.isArray(res.data.records)) records = res.data.records;

                else if (res && Array.isArray(res.records)) records = res.records;

                else if (Array.isArray(res.data)) records = res.data;

                else if (Array.isArray(res)) records = res;



                _mentionApplyCategories(records);



                // Lưu cache

                try {

                    localStorage.setItem(MENTION_CACHE_KEY, JSON.stringify({

                        data: records,

                        timestamp: Date.now()

                    }));

                } catch (e) { /* localStorage đầy → b qua */ }

            })

            .catch(function () {

                // Không tự định nghĩa loại danh mục ở frontend. Danh sách
                // phải được trả về từ API_DanhMuc_AI để luôn khớp nghiệp vụ.
                console.warn('[Chatbot] Không tải được danh sách loại danh mục.');

            });

    }

    var MENTION_DEBOUNCE = 300;

    var MENTION_MAX_ITEMS = 8;



    var mentionState = {

        active: false,       // đang hiển thị dropdown

        triggerKey: '',       // 'sanpham' | 'khachhang' | 'donhang'

        triggerStart: -1,     // vị trí @ trong textarea

        searchText: '',       // text sau @trigger

        items: [],            // kết quả API

        selectedIndex: -1,    // keyboard nav index

        loading: false

    };

    var mentionTimer = null;

    var $mentionDropdown = null;



    function _mentionCreate() {

        // ApiEngine thay thế toàn bộ @ system → không cần mention dropdown

        if (window.ApiEngine) return;



        if ($mentionDropdown) return;

        $mentionDropdown = document.createElement('div');

        $mentionDropdown.className = 'mention-dropdown';

        $mentionDropdown.style.display = 'none';



        // ── JS touch scroll (Android/iOS đu hoạt động) ──

        var touchY = 0;

        var scrollY = 0;

        var isSwiping = false;



        $mentionDropdown.addEventListener('touchstart', function (e) {

            touchY = e.touches[0].clientY;

            scrollY = $mentionDropdown.scrollTop;

            isSwiping = false;

        }, { passive: true });



        $mentionDropdown.addEventListener('touchmove', function (e) {

            e.preventDefault();

            e.stopPropagation();

            isSwiping = true;

            var dy = touchY - e.touches[0].clientY;

            $mentionDropdown.scrollTop = scrollY + dy;

        }, { passive: false });



        // Desktop: giữ focus trên textarea

        $mentionDropdown.addEventListener('mousedown', function (e) {

            e.preventDefault();

        });



        // Append to body

        document.body.appendChild($mentionDropdown);

    }



    function _mentionPosition() {

        if (!$mentionDropdown) return;

        var bar = document.getElementById('chat-input-bar');

        if (bar) {

            var rect = bar.getBoundingClientRect();

            var bottomOffset = window.innerHeight - rect.top + 4;

            $mentionDropdown.style.bottom = bottomOffset + 'px';

            // Giới hạn max-height theo không gian còn lại (trừ 60px cho thanh trạng thái)

            var available = rect.top - 60;

            $mentionDropdown.style.maxHeight = Math.min(260, Math.max(120, available)) + 'px';

        }

    }



    function _mentionShow(html) {

        $mentionDropdown.innerHTML = html;

        $mentionDropdown.style.display = '';

        mentionState.active = true;

        _mentionPosition();

    }



    function _mentionHide() {

        if (!$mentionDropdown) return;

        $mentionDropdown.style.display = 'none';

        $mentionDropdown.innerHTML = '';

        mentionState.active = false;

        mentionState.selectedIndex = -1;

        mentionState.items = [];

        if (mentionTimer) { clearTimeout(mentionTimer); mentionTimer = null; }

    }



    /** Parse textarea text → tìm @trigger pattern HOẶC @ chưa hoàn tất */

    function _mentionParse() {

        var text = $input.value;

        var cursor = $input.selectionStart;

        var before = text.substring(0, cursor);



        // Phase 2: đã gõ đầy đủ @trigger (+ optional search text)

        if (mentionKeysPattern) {

            var fullMatch = before.match(mentionKeysPattern);

            if (fullMatch) {

                return {

                    phase: 'search',

                    triggerKey: fullMatch[1].toLowerCase(),

                    triggerStart: before.lastIndexOf('@'),

                    searchText: (fullMatch[3] || '').trim(),

                    fullMatch: fullMatch[0]

                };

            }

        }



        // Phase 1: mới gõ @ (+ optional partial text để lc category)

        var partialMatch = before.match(/@([a-zA-Z]*)$/);

        if (partialMatch) {

            return {

                phase: 'category',

                partialText: partialMatch[1].toLowerCase(),

                triggerStart: before.lastIndexOf('@')

            };

        }



        return null;

    }



    /** Hiển thị danh sách category gợi ý khi gõ @ */

    function _mentionShowCategories(partialText) {

        var keys = Object.keys(MENTION_TRIGGERS);

        // Lc theo partial text (nếu có)

        if (partialText) {

            keys = keys.filter(function (k) {

                return k.indexOf(partialText) === 0

                    || MENTION_TRIGGERS[k].label.toLowerCase().indexOf(partialText) !== -1;

            });

        }



        if (!keys.length) {

            _mentionHide();

            return;

        }



        mentionState.items = keys;

        mentionState.selectedIndex = -1;



        var html = '<div class="mention-header">📌 Chn danh mục</div>';

        keys.forEach(function (key, idx) {

            var t = MENTION_TRIGGERS[key];

            var activeCls = idx === mentionState.selectedIndex ? ' active' : '';

            html += '<div class="mention-item mention-category-item' + activeCls + '" data-key="' + key + '" data-idx="' + idx + '">'

                + '<span class="mention-item-name">' + t.icon + ' ' + t.label + '</span>'

                + '<span class="mention-item-code" style="opacity:0.5">@' + key + '</span>'

                + '</div>';

        });



        _mentionShow(html);



        // Click handler cho category items

        $mentionDropdown.querySelectorAll('.mention-category-item').forEach(function (el) {

            el.addEventListener('click', function () {

                var key = el.getAttribute('data-key');

                _mentionSelectCategory(key);

            });

        });

    }



    /** Chèn @trigger vào textarea khi chn category */

    function _mentionSelectCategory(key) {

        var text = $input.value;

        var before = text.substring(0, mentionState.triggerStart);

        var after = text.substring($input.selectionStart);

        var insertText = '@' + key + ' ';

        $input.value = before + insertText + after;

        var newPos = before.length + insertText.length;

        $input.setSelectionRange(newPos, newPos);

        $input.focus();

        _autoResize();

        _updateSendBtn();



        // Trigger fetch ngay sau khi chn category

        mentionState.triggerKey = key;

        mentionState.triggerStart = before.length;

        mentionState.searchText = '';

        mentionState.selectedIndex = -1;

        _mentionFetch(key, '');

    }



    /** Gi API_DanhMuc_AI — dùng fetch trực tiếp, không hiện global spinner */

    function _mentionFetch(type, searchText) {

        mentionState.loading = true;

        var trigger = MENTION_TRIGGERS[type];

        _mentionShow(

            '<div class="mention-header">' + trigger.icon + ' ' + trigger.label + '</div>'

            + '<div class="mention-loading">ang tải...</div>'

        );



        var qs = encodeURIComponent(JSON.stringify({ Type: type, SearchText: searchText }));

        var url = API_CONFIG.BASE_URL + API_CONFIG.ENDPOINTS.AI.CATALOG + '?q=' + qs;

        var token = _getToken();



        fetch(url, {

            method: 'GET',

            headers: token ? { 'Authorization': 'Bearer ' + token } : {}

        })

            .then(function (r) { return r.json(); })

            .then(function (res) {

                mentionState.loading = false;

                var records = [];

                if (res && res.data && Array.isArray(res.data.records)) {

                    records = res.data.records;

                } else if (res && Array.isArray(res.records)) {

                    records = res.records;

                } else if (Array.isArray(res.data)) {

                    records = res.data;

                } else if (Array.isArray(res)) {

                    records = res;

                }

                mentionState.items = records.slice(0, MENTION_MAX_ITEMS);

                _mentionRender(type);

            }).catch(function () {

                mentionState.loading = false;

                _mentionShow(

                    '<div class="mention-header">' + trigger.icon + ' ' + trigger.label + '</div>'

                    + '<div class="mention-empty">Lỗi tải dữ liệu</div>'

                );

            });

    }



    /** Render danh sách kết quả */

    function _mentionRender(type) {

        var trigger = MENTION_TRIGGERS[type];

        var items = mentionState.items;



        if (!items.length) {

            _mentionShow(

                '<div class="mention-header">' + trigger.icon + ' ' + trigger.label + '</div>'

                + '<div class="mention-empty">Không tìm thấy</div>'

            );

            return;

        }



        var html = '<div class="mention-header">' + trigger.icon + ' ' + trigger.label + '</div>';

        items.forEach(function (item, idx) {

            var name = item.Name || item.ObjectName || item.ItemName || '';

            var code = item.MaDanhMuc || item.Code || item.ObjectID || item.ItemID || item.DocumentID || '';

            var rightHtml = '<span class="mention-item-code">' + _esc(code) + '</span>';



            if (item.UnitPrice) {

                rightHtml += '<span class="mention-item-price">'

                    + Number(item.UnitPrice).toLocaleString('vi-VN') + 'đ</span>';

            }

            if (item.BaseTotal !== undefined) {

                rightHtml += '<span class="mention-item-price">'

                    + Number(item.BaseTotal).toLocaleString('vi-VN') + 'đ</span>';

            }



            var activeCls = idx === mentionState.selectedIndex ? ' active' : '';

            html += '<div class="mention-item' + activeCls + '" data-idx="' + idx + '">'

                + '<span class="mention-item-name">' + _esc(name) + '</span>'

                + '<div class="mention-item-right">' + rightHtml + '</div>'

                + '</div>';

        });



        _mentionShow(html);



        // Click handler cho items

        $mentionDropdown.querySelectorAll('.mention-item').forEach(function (el) {

            el.addEventListener('click', function () {

                var idx = parseInt(el.getAttribute('data-idx'));

                _mentionSelect(idx);

            });

        });

    }



    /** Chèn kết quả vào textarea */

    function _mentionSelect(idx) {

        var item = mentionState.items[idx];

        if (!item) return;



        var name = item.Name || item.ObjectName || item.ItemName || '';

        var code = item.MaDanhMuc || item.Code || item.ObjectID || item.ItemID || item.DocumentID || '';

        var insertText = name + ' (' + code + ')';



        var text = $input.value;

        var before = text.substring(0, mentionState.triggerStart);

        var after = text.substring($input.selectionStart);

        $input.value = before + insertText + ' ' + after;
        _autoResize();

        // Set cursor after inserted text

        var newPos = before.length + insertText.length + 1;

        $input.setSelectionRange(newPos, newPos);

        $input.focus();



        _mentionHide();

        _autoResize();

        _updateSendBtn();

    }



    /** Highlight item trong dropdown */

    function _mentionHighlight(idx) {

        mentionState.selectedIndex = idx;

        var items = $mentionDropdown.querySelectorAll('.mention-item');

        items.forEach(function (el, i) {

            el.classList.toggle('active', i === idx);

        });

        // Scroll vào view

        if (items[idx]) items[idx].scrollIntoView({ block: 'nearest' });

    }



    /** Input handler — detect @mention */

    function _mentionOnInput() {

        // ApiEngine handles @: bail out to avoid dual dropdowns

        if (window.ApiEngine) { _mentionHide(); return; }



        var parsed = _mentionParse();

        if (!parsed) {

            _mentionHide();

            return;

        }



        mentionState.triggerStart = parsed.triggerStart;

        mentionState.selectedIndex = -1;



        if (parsed.phase === 'category') {

            // Phase 1: hiện danh sách category gợi ý

            _mentionShowCategories(parsed.partialText);

            return;

        }



        // Phase 2: đã chn category → fetch dữ liệu

        mentionState.triggerKey = parsed.triggerKey;

        mentionState.searchText = parsed.searchText;



        // Debounce API call

        if (mentionTimer) clearTimeout(mentionTimer);

        mentionTimer = setTimeout(function () {

            _mentionFetch(parsed.triggerKey, parsed.searchText);

        }, MENTION_DEBOUNCE);

    }



    /** Keyboard handler cho mention dropdown */

    function _mentionOnKeydown(e) {

        // ApiEngine handles keyboard navigation

        if (window.ApiEngine) return false;



        if (!mentionState.active) return false;



        if (e.key === 'ArrowDown') {

            e.preventDefault();

            var next = mentionState.selectedIndex + 1;

            if (next >= mentionState.items.length) next = 0;

            _mentionHighlight(next);

            return true;

        }

        if (e.key === 'ArrowUp') {

            e.preventDefault();

            var prev = mentionState.selectedIndex - 1;

            if (prev < 0) prev = mentionState.items.length - 1;

            _mentionHighlight(prev);

            return true;

        }

        if (e.key === 'Enter' || e.key === 'Tab') {

            e.preventDefault();

            var selIdx = mentionState.selectedIndex; if (selIdx < 0) { selIdx = 0; var qs = (mentionState.searchText || '').toLowerCase().trim(); if (qs) { for (var i = 0; i < mentionState.items.length; i++) { var c = (mentionState.items[i].MaDanhMuc || mentionState.items[i].Code || mentionState.items[i].ObjectID || mentionState.items[i].ItemID || mentionState.items[i].DocumentID || '').toLowerCase(); if (c === qs || c.indexOf(qs) !== -1) { selIdx = i; break; } } } }

            if (mentionState.items.length > 0) {

                // Kiểm tra phase: nếu items là string (category key) thì chn category

                if (typeof mentionState.items[0] === 'string') {

                    _mentionSelectCategory(mentionState.items[selIdx]);

                } else {

                    _mentionSelect(selIdx);

                }

            }

            return true;

        }

        if (e.key === 'Escape') {

            e.preventDefault();

            _mentionHide();

            return true;

        }

        return false;

    }



    // Close dropdown on click outside

    document.addEventListener('click', function (e) {

        if ($mentionDropdown && !$mentionDropdown.contains(e.target) && e.target !== $input) {

            _mentionHide();

        }

    });



    // 

    //  INLINE GHOST TEXT (Tab autocomplete)

    // 



    var ghostText = '';

    var ghostFull = '';

    var $ghost = null;

    var ghostExternalActive = false; // when set by external helper (API hints)



    function _ghostCreate() {

        $ghost = document.createElement('div');

        $ghost.className = 'chat-ghost-text';

        $ghost.setAttribute('aria-hidden', 'true');

        // Bc textarea trong wrapper riêng để ghost căn đúng vị trí

        var $ghostWrap = document.createElement('div');

        $ghostWrap.className = 'chat-input-ghost-wrap';

        $input.parentNode.insertBefore($ghostWrap, $input);

        $ghostWrap.appendChild($input);

        $ghostWrap.appendChild($ghost);

    }



    // External helper for setting ghost hint from other modules (e.g. API config)

    window._ghostSet = function (text) {

        try {

            if (!$ghost) _ghostCreate();

            ghostExternalActive = true;

            ghostFull = text || '';

            var inputVal = $input.value || '';

            ghostText = ghostFull.indexOf(inputVal) === 0 ? ghostFull.substring(inputVal.length) : ghostFull;

            $ghost.innerHTML = '<span style="visibility:hidden;white-space:pre-wrap">' + _esc(inputVal) + '</span>' + _esc(ghostText);

            $ghost.style.display = '';

            $ghost.scrollTop = $input.scrollTop;

            $ghost.scrollLeft = $input.scrollLeft;

        } catch (e) { }

    };



    window._ghostClear = function () {

        ghostExternalActive = false;

        _ghostClear();

    };



    function _ghostUpdate() {

        if (ghostExternalActive) return; // keep external ghost hint visible

        if (mentionState.active) { _ghostClear(); return; }

        var text = $input.value;

        if (text.length < 2 || text.charAt(0) === '@') { _ghostClear(); return; }

        var suggestions = window.CHAT_SUGGESTIONS || [];

        var matchText = null;

        var kw = _clearVn(text);

        for (var i = 0; i < suggestions.length; i++) {

            if (_clearVn(suggestions[i].text).indexOf(kw) === 0) {

                matchText = suggestions[i].text; break;

            }

        }



        // 2. Nếu không tìm thấy → tìm trong user phrases cache

        if (!matchText) {

            var phrases = _loadUserPhrases();

            for (var j = 0; j < phrases.length; j++) {

                if (_clearVn(phrases[j]).indexOf(kw) === 0 && phrases[j].length > text.length) {

                    matchText = phrases[j]; break;

                }

            }

        }



        if (!matchText) { _ghostClear(); return; }

        ghostFull = matchText;

        ghostText = matchText.substring(text.length);

        // Hiện: phần user gõ (ẩn hoàn toàn) + phần gợi ý (m xám)

        // ồng bộ cuộn tuyệt đối bằng cách gán scrollTop/scrollLeft

        $ghost.innerHTML = '<span style="visibility:hidden;white-space:pre-wrap">' + _esc(text) + '</span>' + _esc(ghostText);

        $ghost.style.display = '';

        $ghost.scrollTop = $input.scrollTop;

        $ghost.scrollLeft = $input.scrollLeft;

    }



    $input.addEventListener('scroll', function () {

        if ($ghost && $ghost.style.display !== 'none') {

            $ghost.scrollTop = $input.scrollTop;

            $ghost.scrollLeft = $input.scrollLeft;

        }

    });



    function _ghostAccept() {

        if (!ghostText) return false;

        var pos = ghostFull.length;

        $input.value = ghostFull;

        _ghostClear();

        _autoResize();

        _updateSendBtn();

        $input.setSelectionRange(pos, pos);

        return true;

    }



    function _ghostClear() {

        ghostText = '';

        ghostFull = '';

        if ($ghost) { $ghost.innerHTML = ''; $ghost.style.display = 'none'; }

    }







    // ── Events ──

    $input.addEventListener('input', function () {

        _autoResize();

        _updateSendBtn();

        // _mentionOnInput();

        _ghostUpdate();

    });



    $input.addEventListener('keydown', function (e) {

        // if (_mentionOnKeydown(e)) return;



        // Tab → accept ghost text

        if (e.key === 'Tab' && ghostText) {

            e.preventDefault();

            _ghostAccept();

            return;

        }



        // Escape → clear ghost

        if (e.key === 'Escape' && ghostText) {

            _ghostClear();

        }



        if (e.key === 'Enter' && !e.shiftKey) {

            e.preventDefault();

            _ghostClear();

            if ($input.value.trim() || selectedFiles.length > 0) _send();

        }

    });



    // ── Double-tap trên mobile → accept ghost text (giống Tab trên PC) ──

    var _lastTapTime = 0;

    $input.addEventListener('touchend', function (e) {

        if (!ghostText) return; // Không có ghost → b qua

        var now = Date.now();

        var gap = now - _lastTapTime;

        _lastTapTime = now;

        if (gap < 300 && gap > 30) {

            // Double-tap detected!

            e.preventDefault();

            _ghostAccept();

        }

    }, { passive: false });



    // ── Double-click trên Desktop → accept ghost text ──

    $input.addEventListener('dblclick', function (e) {

        if (!ghostText) return;

        _ghostAccept();

    });



    $btnSend.addEventListener('click', _send);



    if ($btnClear) {
        $btnClear.addEventListener('click', function () {
            if (!chatHistory.length) return;
            if (!confirm('Sếp có chắc chắn muốn xóa sạch toàn bộ lịch sử trò chuyện này không?')) return;
            chatHistory = [];
            _clearCache();
            var uname = _user();
            var key = 'ai_chat_session_id' + (uname ? '_' + uname.toLowerCase() : '');
            _markConversationForReset(_getSessionId());
            sessionStorage.removeItem(key);
            $messages.innerHTML = '';
            $welcome.style.display = '';
            _clearFiles();
            _mentionHide();
        });
    }

    if ($btnTheme) {
        var moon = document.getElementById('chatbot-icon-moon');
        var sun = document.getElementById('chatbot-icon-sun');

        function syncIcons() {
            var isDark = document.documentElement.getAttribute('data-theme') === 'dark';
            if (moon) moon.style.display = isDark ? 'none' : '';
            if (sun) sun.style.display = isDark ? '' : 'none';
        }

        syncIcons();
        window.addEventListener('themechanged', syncIcons);

        $btnTheme.addEventListener('click', function () {
            if (typeof toggleTheme === 'function') {
                toggleTheme();
            } else {
                console.warn('[Chatbot] toggleTheme is not defined in global scope. Cannot change theme.');
            }
        });
    }

    // ── Suggestion chips (welcome screen) ──

    document.querySelectorAll('.chat-chip').forEach(function (chip) {

        chip.addEventListener('click', function () {

            var msg = chip.getAttribute('data-msg');

            if (msg) {

                $input.value = msg;

                _send();

            }

        });

    });



    // 

    //  FEATURE 3: SUGGESTION CHIPS BAR (trên input)

    // 



    var _chipsBar = null;



    function _initSuggestionBar() {

        var suggestions = window.CHAT_SUGGESTIONS;

        if (!suggestions || !suggestions.length) return;



        // Xây dựng cấu trúc danh mục

        var categories = {};

        suggestions.forEach(function (s) {

            var cat = s.category || 'Khác';

            if (!categories[cat]) categories[cat] = [];

            categories[cat].push(s);

        });



        var catNames = Object.keys(categories);

        // ẩy tab "Hướng dẫn" xuống cuối cùng

        var idxHd = catNames.indexOf('Hướng dẫn');

        if (idxHd > -1) {

            catNames.splice(idxHd, 1);

            catNames.push('Hướng dẫn');

        }



        // Load tab dã lưu từ localStorage hoặc mặc định tab Mở đầu

        var lastCat = localStorage.getItem('ai_sales_last_tab');

        if (!lastCat || catNames.indexOf(lastCat) === -1) {

            lastCat = catNames[0];

        }



        _chipsBar = document.createElement('div');

        _chipsBar.className = 'ai-sales-chips-bar';

        _chipsBar.id = 'ai-sales-chips';



        // 1. Tầng Tab (Categories)

        var tabBar = document.createElement('div');

        tabBar.className = 'ai-sales-chips-tabs ai-sales-chips-scroll';

        _chipsBar.appendChild(tabBar);



        // 2. Tầng Data (Chips)

        var scroll = document.createElement('div');

        scroll.className = 'ai-sales-chips-list ai-sales-chips-scroll';

        _chipsBar.appendChild(scroll);



        // Hàm render Chips cho 1 Category

        function renderChips(catName) {

            scroll.innerHTML = ''; // reset

            var items = categories[catName] || [];



            // Map màu sắc Vibrant cho từng Tab

            var colorClass = '';

            if (catName === 'Phân tích') colorClass = 'chip-vibrant-analytics';

            else if (catName === 'Công nợ') colorClass = 'chip-vibrant-debt';

            else if (catName === 'Kho hàng') colorClass = 'chip-vibrant-inventory';

            else if (catName === 'ơn hàng') colorClass = 'chip-vibrant-orders';

            else if (catName === 'Tra cứu') colorClass = 'chip-vibrant-search';



            items.forEach(function (s) {

                var btn = document.createElement('button');

                btn.type = 'button';

                btn.className = 'ai-sales-chip ' + colorClass;

                // Hiển thị nội dung cực ngắn đã được tối ưu

                btn.textContent = (s.icon ? s.icon + ' ' : '') + (s.label || s.text);

                btn.addEventListener('click', function () {

                    $input.value = s.text; // Text đầy đủ để AI hiểu

                    _autoResize();

                    _updateSendBtn();

                    _send();

                });

                scroll.appendChild(btn);

            });

        }



        // Hàm render UI Tabs

        function renderTabs() {

            tabBar.innerHTML = '';

            catNames.forEach(function (c) {

                var tBtn = document.createElement('button');

                tBtn.type = 'button';

                tBtn.className = 'ai-sales-tab-btn' + (c === lastCat ? ' active' : '');

                tBtn.textContent = c;

                tBtn.addEventListener('click', function () {

                    lastCat = c;

                    localStorage.setItem('ai_sales_last_tab', c);

                    renderTabs(); // Cập nhật class active

                    renderChips(c);

                });

                tabBar.appendChild(tBtn);

            });

        }



        renderTabs();

        renderChips(lastCat);



        // Inject vào trong #chat-input-bar (ở vị trí trên cùng)

        var $inputBar = document.getElementById('chat-input-bar');

        if ($inputBar) {

            $inputBar.insertBefore(_chipsBar, $inputBar.firstChild);

        }



        // Ẩn chips nếu đã có lịch sử chat (tối ưu UI)

        _updateChipsVisibility();

    }



    function _updateChipsVisibility() {

        if (!_chipsBar) return;

        // Ẩn khi đang có tin nhắn (history > 0)

        _chipsBar.style.display = (chatHistory.length > 0) ? 'none' : '';

    }



    // ── Init ──

    _ghostCreate();

    _loadCacheAsync().then(function(loadedHistory) {
        chatHistory = loadedHistory || [];
        chatHistory.forEach(function (message) {
            if (message && message.requestId) {
                _renderedRequestIds.add(String(message.requestId));
            }
        });
        _renderHistory();
        _updateChipsVisibility();
        
        // Auto-run search query parameter 'q' if passed
        var q = window._routeParams && window._routeParams.q;
        if (!q) {
            var hash = location.hash || '';
            var qMatch = hash.match(/[?&]q=([^&]*)/);
            if (qMatch) q = decodeURIComponent(qMatch[1]);
        }
        if (q) {
            if (window._routeParams) delete window._routeParams.q;
            var cleanHash = location.hash.split('?')[0];
            history.replaceState(null, null, cleanHash);
            
            $input.value = q;
            _updateSendBtn();
            _send();
        }
    });

    // _initSuggestionBar(); // ã ẩn thanh gợi ý the user



    // ── API Engine (@api_code menu + DataSource fields) ──

    if (window.ApiEngine) {

        ApiEngine.init({

            inputEl: $input,

            apiBtn: $btnApi,

            addMessage: _addMessage,

            addHtmlMessage: _addHtmlMessage,

            renderCardView: function (rows, headerMsg, apiCode, meta) {

                var uiTpl = (meta && meta.uiTemplate) ? meta.uiTemplate.toUpperCase() : 'DEFAULT';
                var debtCode = String(apiCode || '').toLowerCase();
                var isDebtApi = debtCode.indexOf('@cong_no') === 0;

                // @san_pham_trong_tam is commonly executed through ApiEngine's
                // direct @command path. Do not let a missing/legacy UiTemplate
                // send its mixed product + program result to the generic grouper.
                if (debtCode === '@san_pham_trong_tam' && window.ApiChatbot && window.ApiChatbot.__internal && typeof window.ApiChatbot.__internal.renderFocusProducts === 'function') {
                    return window.ApiChatbot.__internal.renderFocusProducts(rows, headerMsg, debtCode, meta);
                }

                if (String(apiCode || '').toLowerCase() === '@doanh_so') {
                    return _renderSalesDashboard(rows, headerMsg, '@doanh_so', meta);
                }

                // Catalog responses can arrive without ApiCode or with lowercase
                // field names. Detect the frozen five-row root contract before the
                // generic TYPE/LABEL table renderer gets a chance to handle it.
                var catalogAllowedTypes = ['sanpham', 'khachhang', 'donhang', 'khohang', 'nhanvien'];
                var catalogRows = Array.isArray(rows) ? rows : [];
                var isCatalogRoot = catalogRows.length > 0 && catalogRows.every(function (row) {
                    if (!row) return false;
                    var type = String(row.Type ?? row.TYPE ?? row.type ?? '').toLowerCase();
                    var hasLabel = row.Label !== undefined || row.LABEL !== undefined || row.label !== undefined;
                    return hasLabel && catalogAllowedTypes.indexOf(type) >= 0;
                });
                if (isCatalogRoot && window.ApiChatbot && window.ApiChatbot.__internal && typeof window.ApiChatbot.__internal.renderCatalog === 'function') {
                    return window.ApiChatbot.__internal.renderCatalog(catalogRows, headerMsg, '@danh_muc', meta);
                }

                if (isDebtApi) uiTpl = 'CONG_NO';

                var renderFn = _UI_RENDERERS[uiTpl] || _UI_RENDERERS['DEFAULT'] || _renderCardView;

                return renderFn(rows, headerMsg, apiCode, meta);

            },

            showTyping: _showTyping,

            hideTyping: _hideTyping,

            getToken: _getToken,

            setWaiting: _setStopMode

        });

    }



    // Responsive placeholder

    function _updatePlaceholder() {

        $input.placeholder = window.innerWidth <= 480

            ? 'Nh\u1eadp tin nh\u1eafn... (@ tra c\u1ee9u)'

            : 'Nh\u1eadp tin nh\u1eafn... (@ tra c\u1ee9u)';

    }

    _updatePlaceholder();

    window.addEventListener('resize', _updatePlaceholder);

    // Mobile: ẩn navbar khi bàn phím ảo mở (giữ nguyên layout input bar)

    var $nav = document.querySelector('.app-nav');

    var $inputBar = document.getElementById('chat-input-bar');

    var $chatbotPage = document.querySelector('.chatbot-page');



    function _setMobileKeyboardLayout(isOpen) {

        if (window.innerWidth > 768) return;

        document.body.classList.toggle('chatbot-keyboard-open', Boolean(isOpen));

        if ($chatbotPage) {

            $chatbotPage.classList.toggle('chatbot-nav-hidden', Boolean(isOpen));

        }

        if ($nav) {

            $nav.style.display = isOpen ? 'none' : '';

        }

        if ($inputBar) {

            $inputBar.style.bottom = isOpen ? '0' : '';

        }

    }



    $input.addEventListener('focus', function () {

        _setMobileKeyboardLayout(true);

    });



    $input.addEventListener('blur', function () {

        // Nếu Panel đang mở, không hiện lại navbar để tránh đè giao diện

        if (document.body.classList.contains('ae-panel-open')) {

            return;

        }

        // Delay để button click (gửi, đính kèm, API) kịp xử lý

        setTimeout(function () {

            if (document.activeElement === $input) return;

            _setMobileKeyboardLayout(false);

        }, 300);

    });



    _updateSendBtn();

    // Desktop có thể focus sẵn để nhập nhanh. Trên mobile, focus tự động sẽ
    // ẩn thanh điều hướng dù người dùng chưa chạm vào ô nhập.
    if (window.innerWidth > 768) {

        $input.focus();

    }



    // ── Public API — dùng cho project-specific renderers và debug ────────────

    // Nạp file renderer riêng SAU khi chatbot.js load:

    //   <script src="chatbot-renderers-myproject.js"></script>

    // Rồi gi:

    //   ApiChatbot.registerRenderer('MY_TEMPLATE', function(rows, msg, apiCode, meta) { ... })

    window.ApiChatbot = {

        registerRenderer: function (key, fn) {

            if (typeof fn !== 'function') { console.warn('[ApiChatbot] registerRenderer: fn phải là function'); return; }

            _UI_RENDERERS[String(key).toUpperCase()] = fn;

        },

        // Helpers dùng cho renderer bên ngoài

        helpers: {

            pickField: function (row, role) { return _pickField(row, role); },

            pickValue: function (row, role) { return _pickValue(row, role); },

            fmtCellVal: function (v) { return _fmtCellVal(v); },

            formatBusinessCell: function (key, v) { return _formatBusinessCell(key, v); },

            esc: function (s) { return _esc(s); },

            badgeClass: function (val) { return _badgeClass(val); },

            buildActionBar: function (row) { return _buildActionBar(row); },

            buildInlineTable: function (rows, keys) { return _buildInlineTable(rows, keys); },

            getKeys: function (rows) { return _getKeys(rows); },

            isValidPhone: function (v) { return _isValidPhone(v); },

            formatTime: function (ts) { return _formatTime(ts); },

            clearVn: function (s) { return _clearVn(s); },

            nextId: function () { return ++_modalIdCounter; },

            addHtmlMessage: function (html, sum, requestId) { return _addHtmlMessage(html, sum, requestId); },

            getToken: function () { return _getToken(); }

        },

        // Debug only

        __internal: {

            handleReply: _handleReply,

            renderCardView: _renderCardView

        }

    };

})();



