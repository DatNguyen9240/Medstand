// -- AI Chatbot Page ----------------------------------------------------------

// Cấu hình: đc từ API_CONFIG (api.config.js) — KHÔNG hardcode URL/key ở đây

(function () {

    var _cfg = (typeof API_CONFIG !== 'undefined') ? API_CONFIG : {};

    var CHAT_API = (_cfg.N8N_BASE || '') + (_cfg.CHAT_WEBHOOK || '/webhook/hook-ai-dainao');

    var CHAT_CASUAL_API = (_cfg.N8N_BASE || '') + (_cfg.CHAT_WEBHOOK || '/webhook/hook-ai-dainao');

    var CHAT_API_KEY = _cfg.CHAT_API_KEY || '';

    var CACHE_KEY = 'ai_chat_history';

    var CACHE_TTL = 8 * 60 * 60 * 1000; // 8 giờ — chat history lưu qua lại trang

    var USER_PHRASES_KEY = 'ai_user_phrases';

    var MAX_USER_PHRASES = 50;

    var MAX_FILE_SIZE = 10 * 1024 * 1024; // 10 MB



    // Khởi tạo Engine và tải Metadata hệ thống ngay khi load

    if (typeof ApiEngine !== 'undefined') {

        ApiEngine.loadSystemMeta();

    }



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
        var savedTheme = localStorage.getItem('ai_chat_theme') || 'light';
        if (savedTheme === 'dark') {
            document.documentElement.setAttribute('data-theme', 'dark');
            document.body.classList.add('dark-theme', 'dark');
            if ($container) $container.classList.add('dark-theme');
            setTimeout(function() {
                var moonIcon = document.getElementById('chatbot-icon-moon');
                var sunIcon = document.getElementById('chatbot-icon-sun');
                if (moonIcon && sunIcon) {
                    moonIcon.style.display = 'none';
                    sunIcon.style.display = '';
                }
            }, 50);
        }
    } catch(e) {}

    // Khởi tạo Chatbot API Engine UI (Nút "Ch n API")

    if (window.ApiEngine) {

        window.ApiEngine.init({

            container: $container,

            apiBtn: $btnApi

        });

    }



    var chatHistory = [];

    var selectedFiles = [];

    var abortController = null;

    var isWaitingAI = false;

    var _modalIdCounter = 0;

    var _UI_RENDERERS = {};

    var _modalDataCache = {}; // Cache cho data bảng/thẻ



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
            text.indexOf('ai-catalog-') !== -1
        );
        if (hasCard) cls += ' has-table';

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



    function _addHtmlMessage(htmlContent, summaryText) {

        var msg = { role: 'ai', content: summaryText || '📊 Kết quả', time: Date.now(), isHtml: true, htmlContent: htmlContent };

        chatHistory.push(msg);

        _saveCache(chatHistory);

        $welcome.style.display = 'none';

        $messages.insertAdjacentHTML('beforeend', _bubbleHTML('ai', msg.content, msg.time, null, htmlContent));

        _scrollBottom();

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

    if ($btnClear) {
        $btnClear.addEventListener('click', function () {
            if (confirm('Sếp có chắc chắn muốn xóa sạch toàn bộ lịch sử trò chuyện này không?')) {
                _clearCache();
                var uname = _user();
                var key = 'ai_chat_session_id' + (uname ? '_' + uname.toLowerCase() : '');
                sessionStorage.removeItem(key); // Xóa session ngầm
                chatHistory = [];
                _renderHistory();
            }
        });
    }

    if ($btnTheme) {
        $btnTheme.addEventListener('click', function () {
            try {
                var currentTheme = document.documentElement.getAttribute('data-theme') || 'light';
                var isDark = currentTheme === 'dark';
                var nextTheme = isDark ? 'light' : 'dark';
                
                document.documentElement.setAttribute('data-theme', nextTheme);
                document.body.classList.toggle('dark-theme', !isDark);
                document.body.classList.toggle('dark', !isDark);
                if ($container) $container.classList.toggle('dark-theme', !isDark);
                localStorage.setItem('ai_chat_theme', nextTheme);

                var moonIcon = document.getElementById('chatbot-icon-moon');
                var sunIcon = document.getElementById('chatbot-icon-sun');
                if (moonIcon && sunIcon) {
                    if (isDark) {
                        moonIcon.style.display = '';
                        sunIcon.style.display = 'none';
                    } else {
                        moonIcon.style.display = 'none';
                        sunIcon.style.display = '';
                    }
                }
            } catch(e) {}
        });
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

        } else {

            $btnSend.innerHTML = SEND_ICON;

            $btnSend.classList.remove('stop-mode');

            _updateSendBtn();

        }

    }



    function _stopAI() {

        if (abortController) {

            abortController.abort();

            abortController = null;

        }

        _hideTyping();

        _setStopMode(false);

        _addMessage('ai', 'Đã dừng phản hồi.');

    }



    function _send() {

        if (window.ApiEngine && ApiEngine.handleSend && ApiEngine.handleSend()) return;

        if (isWaitingAI) { _stopAI(); return; }

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



            var payload = { action: 'chat', text: text || displayText, session_id: sessionId, files: fileList, history: historyStr };

            if (window.ApiEngine && window.ApiEngine.getActiveApi) {
                var activeApiObj = window.ApiEngine.getActiveApi();
                if (activeApiObj && (activeApiObj.execType === 'CART' || activeApiObj.execType === 'UPDATE' || activeApiObj.execType === 'INSERT')) {
                    payload.context = 'FORM_UPDATE';
                    payload.active_api = activeApiObj.apiCode;
                }
            }

            fetch(CHAT_API, {

                method: 'POST',

                headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + _getToken(), 'x-api-key': CHAT_API_KEY },

                body: JSON.stringify(payload),

                signal: abortController.signal

            })

                .then(function (res) {

                    return res.text().then(function (text) {

                        if (!res.ok) throw new Error("Lỗi Server N8N (" + res.status + "): Có thể Workflow bị lỗi ngầm, hãy kiểm tra Excecutions tab trong N8N.");

                        if (!text) throw new Error("Lỗi Server N8N: Trả v dữ liệu trống.");

                        try { return JSON.parse(text); }

                        catch (e) { throw new Error("N8N không trả v JSON: " + text.substring(0, 50)); }

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

        var payload = { action: 'chat', text: text, session_id: _getSessionId(), history: historyStr };

        fetch(CHAT_CASUAL_API, {

            method: 'POST',

            headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + _getToken(), 'x-api-key': CHAT_API_KEY },

            body: JSON.stringify(payload)

        }).then(function (res) {

            return res.json();

        }).then(function (data) {

            _hideTyping();

            if (data && data.message) _addMessage('ai', data.message);

            else _addMessage('ai', "Xin lỗi, tôi chưa thể trả li câu hi này.");

        }).catch(function (err) {

            _hideTyping();

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



        fetch(webhookUrl, {

            method: 'POST',

            headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + _getToken() },

            body: JSON.stringify(payload)

        }).then(function (res) {

            return res.json();

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

            _addMessage('ai', " Lỗi kết nối máy chủ tri thức: " + err.message);

        });

    }



    function _handleReply(res) {

        console.log('API Response:', res);

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



            if (res && res.status === 'success' && Array.isArray(res.data)) {

                // 1. Lc data (ẩn các field hidden & loại dòng toàn null do SQL SUM trả v)

                var cleanData = res.data.filter(function (r) {

                    if (!r) return false;

                    var visibleKeys = Object.keys(r).filter(function (k) { return _getHiddenFields().indexOf(k) === -1 && String(k).indexOf('Metadata_') === -1; });

                    if (visibleKeys.length === 0) return false;

                    return visibleKeys.some(function (k) {

                        var v = r[k];

                        return v !== null && v !== undefined && String(v).trim() !== '';

                    });

                });



                if (cleanData.length === 0) {
                    var isSuccessMsg = res.message && (res.message.indexOf('Tìm thấy') > -1 || res.message.indexOf('kết quả') > -1 || res.message.indexOf('ket qua') > -1);
                    var warnMsg = 'Dạ, hệ thống hiện không tìm thấy dữ liệu nào (hoặc dữ liệu trống) cho yêu cầu này ạ. Sếp kiểm tra lại giúp em nhé!';
                    
                    var isNoDebt = (res.apiCode === '@cong_no_chi_tiet' || (res.message && (res.message.indexOf('nợ') > -1 || res.message.indexOf('hóa đơn') > -1)));
                    
                    if (isNoDebt) {
                        _addMessage('ai', 'Dạ tuyệt vời! Khách hàng này hiện không có bất kỳ hóa đơn nợ nào, Sếp hoàn toàn yên tâm nhé!');
                        return;
                    }
                    
                    if (isSuccessMsg || !res.message) {
                        warnMsg = 'Không tìm thấy dữ liệu hoặc tài khoản của bạn không có quyền truy cập thông tin chéo vùng miền (Miền Bắc/Trung/Nam).';
                    } else {
                        warnMsg = res.message;
                    }

                    _addMessage('ai', warnMsg);
                    return;
                }

                // 2. Tìm Mã  ối Tượng (Customer Code) từ metadata

                var idF = _pickField(res.intentParams || {}, 'ID');

                var khCode = idF ? idF.val : '';



                // 3. Xác định UI Template & Renderer

                var apiCode = (res.apiCode || '').toLowerCase();

                var uiTpl = (res.uiTemplate || ApiEngine.getUiTemplate(apiCode) || 'DEFAULT').toUpperCase();

                var renderFn = _UI_RENDERERS[uiTpl] || _UI_RENDERERS['DEFAULT'] || _renderCardView;

                // 4. Render — truyn meta đầy đủ (khCode cho CONG_NO/TICH_LUY, uiTemplate cho tất cả)

                var renderMeta = { uiTemplate: uiTpl, fieldRoles: ApiEngine.getRoleMapping(), khCode: khCode };

                var cardHtml = renderFn(cleanData, res.message, khCode || apiCode, renderMeta);

                _addHtmlMessage(cardHtml, '📊 Kết quả');

                return;

            }



            // -- Xử lý Lỗi --

            if (res && res.status === 'error') {

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

        if (v === null || v === undefined) return '';

        var s = String(v);

        if (/^\d{4}-\d{2}-\d{2}T/.test(s)) return s.split('T')[0];

        if (!isNaN(v) && Math.abs(Number(v)) >= 10000 && String(v).indexOf('.') === -1) {

            return Number(v).toLocaleString('vi-VN');

        }

        return s;

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

                if (keys.indexOf(k) === -1 && _getHiddenFields().indexOf(k) === -1) keys.push(k);

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



    /**

     * Renderer ỘNG 100%: Tự động nhận dạng Tabs và Render danh sách

     */

    function _renderCardView(rows, headerMsg, apiCode, meta) {

        if (!rows || rows.length === 0) return '';



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

                    return _getHiddenFields().indexOf(k) === -1 && String(k).indexOf('Metadata_') === -1;

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

        if (headerMsg) html += '<div class="ai-result-header">' + _esc(headerMsg) + '</div>';



        if (activeGroups.length > 1) {

            // Render Tabs

            html += '<div class="ai-tabs" style="display:flex; flex-wrap:wrap; gap:8px; margin-bottom:12px; border-bottom: 2px solid var(--color-border); padding-bottom: 8px;">';

            var tabsId = 'tabs-' + (++_modalIdCounter);

            activeGroups.forEach(function (g, idx) {

                var bg = (idx === 0) ? 'var(--color-primary)' : 'var(--color-surface)';

                var cl = (idx === 0) ? '#fff' : 'var(--color-text)';

                var clickJs = "var tp = this.parentElement.parentElement; tp.querySelectorAll('.ai-tab-pane-" + tabsId + "').forEach(function(p){p.style.display='none';}); tp.querySelectorAll('.ai-tab-btn-" + tabsId + "').forEach(function(b){b.style.background='var(--color-surface)'; b.style.color='var(--color-text)';}); this.style.background='var(--color-primary)'; this.style.color='#fff'; tp.querySelector('#" + tabsId + "-pane-" + idx + "').style.display='block';";

                var icon = '';

                html += '<button class="ai-tab-btn-' + tabsId + '" onclick="' + clickJs + '" style="padding:6px 14px; border:none; border-radius:20px; font-weight:600; font-size:13px; background:' + bg + '; color:' + cl + '; cursor:pointer; outline:none; transition: background 0.2s;">' + icon + _esc(g.label) + ' (' + g.rows.length + ')</button>';

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

                html += '<div class="ai-catalog-money">' + _esc(_fmtCellVal(moneyF.val)) + '</div>';

            }

            grp.commonKeys.forEach(function (k) {

                if (usedKeys.indexOf(k) !== -1) return;

                var val = grp.rows[0][k];

                if (val === null || val === undefined || String(val).trim() === '') return;

                html += '<div class="ai-catalog-row">';

                html += '<span class="ai-catalog-label">' + _esc(k) + '</span>';

                html += '<span class="ai-catalog-value">' + _esc(_fmtCellVal(val)) + '</span>';

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

                                html += '<span class="ai-catalog-label-small">' + _esc(k) + '</span>';

                                html += '<span class="ai-catalog-value-small"><strong>' + _esc(_fmtCellVal(val)) + '</strong></span>';

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

                            html += '<span class="ai-catalog-label-small">' + _esc(k) + '</span>';

                            html += '<span class="ai-catalog-value-small"><strong>' + _esc(_fmtCellVal(val)) + '</strong></span>';

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

        html += _buildInlineTable(rows, keys);

        html += '</div>';

        html += '</div>'; // ai-inline-container



        return html;

    }



    // ── Registry Registration ─────────────────────────────────────

    // CORE renderers — hoạt động cho m i project

    _UI_RENDERERS['DEFAULT'] = _renderCardView;

    _UI_RENDERERS['CATALOG'] = _renderCatalog;



    // ── Inline Toggle & Modal table helpers ─────────────────────────

    function _getFriendlyHeader(key) {
        var dict = {
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
            // Order & general document columns translations
            'documentid': 'Mã đơn',
            'documentdate': 'Ngày đặt',
            'objectname': 'Khách hàng',
            'basetotal': 'Tổng tiền',
            'statusname': 'Trạng thái',
            'employeename': 'Nhân viên',
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
            // Tuyen ban hang translations (API_TuyenBanHang_AI)
            'tuyen': 'Tuyến',
            'lichghe': 'Lịch Ghé',
            'lanmuacuoi': 'Lần Mua Cuối',
            'songaykhongmua': 'Số Ngày Không Mua',
            'chukytb': 'Chu Kỳ Mua TB (Ngày)',
            'ngaydudoan': 'Ngày Dự Đoán Hết Hàng',
            'conlai': 'Còn Lại (Ngày)',
            'diemuutien': 'Điểm Ưu Tiên',
            'lydoghe': 'Lý Do Ghé'
        };
        var lower = key.toLowerCase().replace(/_/g, '');
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
            'itemname', 'title', 'name', 'customername', 'custname',
            'canhbaoai', 'canh_bao_ai', 'trend', 'percent',
            'money', 'amount', 'price', 'quantity',
            // Vietnamese normalized equivalents
            'tennv', 'tenkh', 'tensanpham', 'tenkhachhang', 'tendoitac', 'tencuahang', 'tennhanvien',
            'doanhso', 'soluong', 'sotien', 'thanhtien', 'chinhanh',
            'xuhuong', 'trangthai', 'tiendo', 'muctieu',
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

            if (HIGH_PRIORITY.indexOf(normalized) !== -1 || HIGH_PRIORITY.indexOf(lower) !== -1) {
                primary.push(k);
            } else {
                secondary.push(k);
            }
        });

        if (primary.length === 0 && keys.length > 0) {
            primary.push(keys[0]);
            secondary = keys.slice(1);
        }

        var MAX_PRIMARY = 3;
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

    function _isNumCol(k) {
        var lowerK = String(k || '').toLowerCase().replace(/_/g, '');
        var numKeywords = ['doanhso', 'doanhthu', 'soluong', 'tonkho', 'tien', 'gia', 'chietkhau', 'thanhtien', 'dongia', 'amount', 'qty', 'price', 'revenue', 'sales', 'total', 'discount', 'sum', 'val'];
        for (var i = 0; i < numKeywords.length; i++) {
            if (lowerK.indexOf(numKeywords[i]) !== -1) {
                return true;
            }
        }
        return false;
    }

    /**

     * Build full inline table HTML (filter bar + table)

     * rows/keys được attach lên DOM element sau khi insert qua __rows/__keys

     * để filter events có thể dùng lại mà không cần cache global

     */

    function _buildInlineTable(rows, keys) {

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
            'maxfromdate', 'MaxFromDate',
            'doanhsochinhanh', 'DoanhSoChiNhanh',
            'statusbackcolor', 'StatusBackColor',
            'msg', 'Msg', 'msgtype', 'MsgType',
            'objectid', 'ObjectID',
            // Các cột điểm số nội bộ (RFM/Scoring) không cần thiết hiển thị cho user
            'r_score', 'f_score', 'm_score', 'c_score',
            'rscore', 'fscore', 'mscore', 'cscore',
            'diemtonghop', 'diem_tong_hop'
        ];

        // Phát hiện cờ ép hiển thị toàn bộ cột từ SQL trả về (ví dụ cột 'showallcols' hoặc 'fulltable' hoặc 'showall')
        var forceShowAll = false;
        var filteredKeys = [];
        keys.forEach(function (k) {
            var lowerK = k.toLowerCase().replace(/_/g, '');
            if (lowerK === 'showallcols' || lowerK === 'fulltable' || lowerK === 'showall') {
                forceShowAll = true;
            } else if (HIDDEN_COLS.indexOf(k) === -1 && HIDDEN_COLS.indexOf(k.toLowerCase()) === -1) {
                filteredKeys.push(k);
            }
        });
        keys = filteredKeys;

        var tbodyId = 'ai-inline-tbody-v' + _modalIdCounter;

        var html = '';



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

        var chipsHtml = '<button class="ai-sales-filter-chip active" data-filter="all" type="button">Tất cả</button>';

        if (badgeKeyFound) {

            // Render chip cho từng giá trị phân loại thực tế trong data

            Object.keys(badgeValues).sort().forEach(function (v) {

                var icon = (v === 'A' || v.toUpperCase() === 'VIP') ? '  ' :

                    (v === 'B') ? '🔵 ' :

                        (v === 'C') ? '🔴 ' : '';

                chipsHtml += '<button class="ai-sales-filter-chip" data-filter="badge:' + _esc(v) + '" data-badge-key="' + _esc(badgeKeyFound) + '" type="button">' + icon + _esc(v) + ' (' + badgeValues[v] + ')</button>';

            });

        }

        chipsHtml += '<span class="ai-sales-filter-count">' + rows.length + ' dòng</span>';

        if (rows.length > 12) {
            html += '<div class="ai-sales-filter-bar ai-inline-filter">'
                + '<input class="ai-sales-filter-input" type="search" placeholder="Tìm nhanh trong kết quả..." autocomplete="off" />'
                + '<div class="ai-sales-filter-chips">' + chipsHtml + '</div>'
                + '</div>';
        }



        // ── Table ──

        html += '<div class="ai-inline-table-wrap">';

        html += '<table class="ai-table"><thead><tr>';

        var split = _splitKeysSmart(keys, forceShowAll);
        var primaryKeys = split.primary;
        var secondaryKeys = split.secondary;
        var hasDetails = secondaryKeys.length > 0;

        if (hasDetails) {
            html += '<th style="width: 32px; text-align: center;"></th>'; // Cột toggle
        }
        primaryKeys.forEach(function (k) {
            var thClass = _isNumCol(k) ? ' class="ai-num-col"' : '';
            html += '<th' + thClass + '>' + _esc(_getFriendlyHeader(k)) + '</th>';
        });

        html += '</tr></thead>';

        html += '<tbody id="' + tbodyId + '">' + _renderTableBody(rows, keys, forceShowAll) + '</tbody>';

        html += '</table></div>';



        // Lưu data vào cache để filter handler dùng

        _modalDataCache[tbodyId] = { rows: rows, keys: keys, badgeKey: badgeKeyFound, forceShowAll: forceShowAll };



        return html;

    }





    function _renderTableBody(filteredRows, keys, forceShowAll) {

        var MAX = 50;

        var shown = Math.min(filteredRows.length, MAX);

        var html = '';

        var split = _splitKeysSmart(keys, forceShowAll);
        var primaryKeys = split.primary;
        var secondaryKeys = split.secondary;
        var hasDetails = secondaryKeys.length > 0;
        var colSpan = primaryKeys.length + (hasDetails ? 1 : 0);

        for (var i = 0; i < shown; i++) {

            html += '<tr>';

            if (hasDetails) {
                html += '<td style="width: 32px; text-align: center; cursor: pointer;" class="ai-row-toggle">▶</td>';
            }

            primaryKeys.forEach(function (k) {
                var val = filteredRows[i][k];
                var cellHtml = '';
                var lowerK = k.toLowerCase().replace(/_/g, '');

                if (lowerK === 'canhbaoai' || lowerK === 'canh_bao_ai') {
                    cellHtml = '<span class="ai-badge-recommend">' + _esc(_fmtCellVal(val)) + '</span>';
                } else {
                    cellHtml = _esc(_fmtCellVal(val));
                }

                var tdClass = _isNumCol(k) ? ' class="ai-num-col"' : '';
                html += '<td' + tdClass + '>' + cellHtml + '</td>';
            });

            html += '</tr>';

            if (hasDetails) {
                html += '<tr class="ai-table-detail-row" style="display: none;"><td colspan="' + colSpan + '">';
                html += '<div class="ai-table-detail-grid">';
                secondaryKeys.forEach(function (k) {
                    html += '<div class="ai-table-detail-item">';
                    html += '  <div class="ai-table-detail-label">' + _esc(_getFriendlyHeader(k)) + '</div>';
                    html += '  <div class="ai-table-detail-value">' + _esc(_fmtCellVal(filteredRows[i][k])) + '</div>';
                    html += '</div>';
                });
                html += '</div>';
                html += '</td></tr>';
            }

        }

        if (filteredRows.length > MAX) {

            html += '<tr><td colspan="' + colSpan + '" style="text-align:center;opacity:0.6;font-style:italic">... và ' + (filteredRows.length - MAX) + ' dòng khác</td></tr>';

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

    $messages.addEventListener('click', function (e) {

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

                                    var filtered = _applyModalFilter(allRows, keysF, curSearch, curFilter, curBadgeKey);

                                    if (tbody) tbody.innerHTML = _renderTableBody(filtered, keysF);

                                    if (countEl2) countEl2.textContent = filtered.length + ' dòng';

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

                                tableView.querySelectorAll('.ai-sales-filter-chip').forEach(function (chip) {

                                    chip.addEventListener('click', function () {

                                        tableView.querySelectorAll('.ai-sales-filter-chip').forEach(function (c) { c.classList.remove('active'); });

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

                // Fallback nếu API lỗi và chưa có data từ cache

                if (Object.keys(MENTION_TRIGGERS).length === 0) {

                    _mentionApplyCategories([

                        { type: 'sanpham', label: 'Sản phẩm', icon: '💊' },

                        { type: 'khachhang', label: 'Khách hàng', icon: '👤' },

                        { type: 'donhang', label: 'ơn hàng', icon: '📋' },

                        { type: 'khohang', label: 'Kho hàng', icon: '' },

                        { type: 'nhanvien', label: 'Nhân viên', icon: '👨💼' }

                    ]);

                }

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



    $btnClear.addEventListener('click', function () {
        if (!chatHistory.length) return;
        chatHistory = [];
        _clearCache();
        var uname = _user();
        var key = 'ai_chat_session_id' + (uname ? '_' + uname.toLowerCase() : '');
        sessionStorage.removeItem(key); // Clear backend memory too
        $messages.innerHTML = '';
        $welcome.style.display = '';

        _clearFiles();

        _mentionHide();

    });

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
        _renderHistory();
        _updateChipsVisibility();
    });

    // _initSuggestionBar(); // ã ẩn thanh gợi ý the user



    // ── API Engine (@api_code menu + DataSource fields) ──

    if (window.ApiEngine) {

        ApiEngine.init({

            inputEl: $input,

            addMessage: _addMessage,

            addHtmlMessage: _addHtmlMessage,

            renderCardView: function (rows, headerMsg, apiCode, meta) {

                var uiTpl = (meta && meta.uiTemplate) ? meta.uiTemplate.toUpperCase() : 'DEFAULT';

                var renderFn = _UI_RENDERERS[uiTpl] || _UI_RENDERERS['DEFAULT'] || _renderCardView;

                return renderFn(rows, headerMsg, apiCode, meta);

            },

            showTyping: _showTyping,

            hideTyping: _hideTyping,

            getToken: _getToken

        });

    }



    // Responsive placeholder

    function _updatePlaceholder() {

        $input.placeholder = window.innerWidth <= 480

            ? 'Nh\u1eadp tin nh\u1eafn...'

            : 'Nh\u1eadp tin nh\u1eafn... (@ tra c\u1ee9u)';

    }

    _updatePlaceholder();

    window.addEventListener('resize', _updatePlaceholder);

    // Mobile: ẩn navbar khi bàn phím ảo mở (giữ nguyên layout input bar)

    var $nav = document.querySelector('.app-nav');

    var $inputBar = document.getElementById('chat-input-bar');



    $input.addEventListener('focus', function () {

        if (window.innerWidth <= 768 && $nav) {

            $nav.style.display = 'none';

            $inputBar.style.bottom = '0';

        }

    });



    $input.addEventListener('blur', function () {

        // Nếu Panel đang mở, không hiện lại navbar để tránh đè giao diện

        if (document.body.classList.contains('ae-panel-open')) {

            return;

        }

        // Delay để button click (gửi, đính kèm, API) kịp xử lý

        setTimeout(function () {

            if (document.activeElement === $input) return;

            if ($nav) {

                $nav.style.display = '';

            }

            $inputBar.style.bottom = '';

        }, 300);

    });



    _updateSendBtn();

    $input.focus();



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

            esc: function (s) { return _esc(s); },

            badgeClass: function (val) { return _badgeClass(val); },

            buildActionBar: function (row) { return _buildActionBar(row); },

            buildInlineTable: function (rows, keys) { return _buildInlineTable(rows, keys); },

            getKeys: function (rows) { return _getKeys(rows); },

            isValidPhone: function (v) { return _isValidPhone(v); },

            formatTime: function (ts) { return _formatTime(ts); },

            clearVn: function (s) { return _clearVn(s); },

            nextId: function () { return ++_modalIdCounter; },

            addHtmlMessage: function (html, sum) { return _addHtmlMessage(html, sum); },

            getToken: function () { return _getToken(); }

        },

        // Debug only

        __internal: {

            handleReply: _handleReply,

            renderCardView: _renderCardView

        }

    };

})();



