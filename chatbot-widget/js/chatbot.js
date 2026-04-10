// -- AI Chatbot Page ----------------------------------------------------------
// Cấu hình: đọc từ API_CONFIG (api.config.js) — KHÔNG hardcode URL/key ở đây
(function () {
    var _cfg = (typeof API_CONFIG !== 'undefined') ? API_CONFIG : {};
    var CHAT_API     = (_cfg.N8N_BASE || '') + (_cfg.CHAT_WEBHOOK || '/webhook/hook-ai-dainao');
    var CHAT_API_KEY = _cfg.CHAT_API_KEY || '';
    var CACHE_KEY = 'ai_chat_history';
    var CACHE_TTL = 24 * 60 * 60 * 1000; // 24 giờ
    var USER_PHRASES_KEY = 'ai_user_phrases';
    var MAX_USER_PHRASES = 50;
    var MAX_FILE_SIZE = 10 * 1024 * 1024; // 10 MB

    // Khởi tạo Engine và tải Metadata hệ thống ngay khi load
    if (typeof ApiEngine !== 'undefined') {
        ApiEngine.loadSystemMeta();
    }

    // Get auth token from cookie
    function _getToken() {
        var match = document.cookie.match(/(?:^|; )auth_token=([^;]*)/);
        return match ? match[1] : '';
    }

    // Get or create session ID for chat
    function _getSessionId() {
        var key = 'ai_chat_session_id';
        var sid = sessionStorage.getItem(key);
        if (!sid) {
            sid = 'user_' + Date.now() + '_' + Math.random().toString(36).substring(2, 9);
            sessionStorage.setItem(key, sid);
        }
        return sid;
    }

    // ── LocalStorage cache with TTL (Phase 1) ──
    function _getSessionKey() {
        return CACHE_KEY;
    }

    function _loadCache() {
        try {
            var raw = localStorage.getItem(_getSessionKey());
            if (!raw) return [];
            var data = JSON.parse(raw);
            if (data.ts && (Date.now() - data.ts > CACHE_TTL)) {
                localStorage.removeItem(_getSessionKey());
                return [];
            }
            return data.messages || [];
        } catch (e) { return []; }
    }

    function _saveCache(messages) {
        try {
            var msgsToSave = messages;
            if (messages && messages.length > 100) msgsToSave = messages.slice(-100);
            localStorage.setItem(_getSessionKey(), JSON.stringify({
                ts: Date.now(),
                messages: msgsToSave
            }));
        } catch (e) { }
    }

    function _clearCache() {
        localStorage.removeItem(_getSessionKey());
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
    var $fileInput = document.getElementById('chat-file-input');
    var $filePreview = document.getElementById('chat-file-preview');
    var $fileList = document.getElementById('chat-file-list');

    var chatHistory = _loadCache();
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
        var text = rawHtml ? rawHtml : (role === 'user' ? _esc(content) : _formatAI(content));

        var hasCard = role === 'ai' && (text.indexOf('ai-card') !== -1 || text.indexOf('ai-table') !== -1 || text.indexOf('ai-summary') !== -1);
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

    // Bỏ dấu tiếng Việt — dùng cho search không phân biệt dấu
    function _clearVn(s) {
        if (!s) return '';
        var map = {
            'àáảãạăắặằẵẫâầấậẫẵ': 'a', 'ÀÁẢÃẠĂẮẶẰẴẪÂẦẤẬẪẴ': 'A',
            'èéẻẽẹêềếểễệ': 'e',       'ÈÉẺẼẸÊỀẾỂỄỆ': 'E',
            'ìíỉĩị': 'i',              'ÌÍỈĨỊ': 'I',
            'òóỏõọôồốổỗộơờớởỡợ': 'o', 'ÒÓỎÕỌÔỒỐỔỖỘƠỜỚỞỠỢ': 'O',
            'ùúủũụưừứửữự': 'u',       'ÙÚỦŨỤƯỪỨỬỮỰ': 'U',
            'ỳýỷỹỵ': 'y',             'ỲÝỶỸỴ': 'Y',
            'đ': 'd',                  'Đ': 'D'
        };
        return s.split('').map(function(c) {
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

    function _addMessage(role, content, fileName) {
        var msg = { role: role, content: content, time: Date.now() };
        if (fileName) msg.fileName = fileName;
        chatHistory.push(msg);
        _saveCache(chatHistory);
        $welcome.style.display = 'none';
        $messages.insertAdjacentHTML('beforeend', _bubbleHTML(role, content, msg.time, fileName));
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
        _addMessage('ai', '⏹ Đã dừng phản hồi.');
    }

    function _send() {
        if (window.ApiEngine && ApiEngine.handleSend && ApiEngine.handleSend()) return;
        if (isWaitingAI) { _stopAI(); return; }
        var text = $input.value.trim();
        if (!text && selectedFiles.length === 0) return;

        var fileNames = selectedFiles.map(function (f) { return f.name; });
        var attachedFileName = fileNames.length > 0 ? fileNames.join(', ') : null;
        var displayText = text || ('📎 ' + attachedFileName);

        _saveUserPhrase(text);
        _addMessage('user', displayText, attachedFileName);
        $input.value = '';
        _updateSendBtn();

        _showTyping();
        abortController = new AbortController();
        _setStopMode(true);

        var sessionId = _getSessionId();
        var filesToSend = selectedFiles.slice();
        _clearFiles();

        Promise.all(filesToSend.map(function(file) {
            return new Promise(function (resolve) {
                var reader = new FileReader();
                reader.onload = function () { resolve({ name: file.name, data: reader.result }); };
                reader.readAsDataURL(file);
            });
        })).then(function (fileList) {
            var payload = { action: 'chat', text: text || displayText, session_id: sessionId, files: fileList };
            fetch(CHAT_API, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + _getToken(), 'x-api-key': CHAT_API_KEY },
                body: JSON.stringify(payload),
                signal: abortController.signal
            })
            .then(function (res) { return res.json(); })
            .then(function(data) { _handleReply(data); })
            .catch(function(err) { _handleError(err); });
        });
    }

    function _handleReply(res) {
        console.log('API Response:', res);
        _hideTyping();
        _setStopMode(false);

        // -- Format mới từ K_SieuLuong: { status, message, data:[], count, uiTemplate, intentParams } --
        if (res && res.status === 'success' && Array.isArray(res.data) && res.data.length > 0) {
            // 1. Lọc data (ẩn các field hidden)
            var cleanData = res.data.filter(function(r) { 
                return Object.keys(r).length > 0 && Object.keys(r).some(function(k) { return _getHiddenFields().indexOf(k) === -1; }); 
            });
            
            // 2. Tìm Mã Đối Tượng (Customer Code) từ metadata
            var idF = ApiEngine.getFieldByRole(res.intentParams || {}, 'ID');
            var khCode = idF ? idF.val : '';
            
            // 3. Xác định UI Template & Renderer
            var apiCode = (res.apiCode || '').toLowerCase();
            var uiTpl = (res.uiTemplate || ApiEngine.getUiTemplate(apiCode) || 'DEFAULT').toUpperCase();
            var renderFn = _UI_RENDERERS[uiTpl] || _UI_RENDERERS['DEFAULT'] || _renderCardView;
            // 4. Render — truyền meta đầy đủ (khCode cho CONG_NO/TICH_LUY, uiTemplate cho tất cả)
            var renderMeta = { uiTemplate: uiTpl, fieldRoles: ApiEngine.getRoleMapping(), khCode: khCode };
            var cardHtml = renderFn(cleanData, res.message, khCode || apiCode, renderMeta);
            _addHtmlMessage(cardHtml, '📊 Kết quả');
            return;
        }

        // -- Xử lý Lỗi --
        if (res && res.status === 'error') {
            _addMessage('ai', '❌ ' + (res.message || 'Có lỗi xảy ra.'));
            return;
        }

        // -- Các trường hợp trả về Text (Fallbacks) --
        var reply = '';
        if (typeof res === 'string') {
            reply = res;
        } else if (res && res.response) {
            reply = res.response;
        } else if (res && res.reply) {
            reply = res.reply;
        } else if (res && res.message) {
            reply = res.message;
        } else if (res && res.output) {
            reply = res.output;
        } else if (res && res.data) {
            reply = typeof res.data === 'string' ? res.data : JSON.stringify(res.data);
        } else {
            reply = JSON.stringify(res);
        }
        _addMessage('ai', reply);
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

    // ══════════════════════════════════════════════════════════════
    //  FEATURE 1: QUICK ACTION BUTTONS
    // ══════════════════════════════════════════════════════════════

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
    function _buildActionBar(row) {
        var c = _detectContactFields(row);
        if (!c.phone && !c.name) return '';
        var html = '<div class="ai-sales-action-bar">';
        if (c.phone) {
            html += '<a class="ai-sales-action-btn ai-sales-btn-call" href="tel:' + _esc(c.phone) + '" aria-label="Gọi điện">📞 Gọi</a>';
            html += '<a class="ai-sales-action-btn ai-sales-btn-zalo" href="https://zalo.me/' + _esc(c.phone) + '" target="_blank" rel="noopener noreferrer" aria-label="Nhắn Zalo">💬 Zalo</a>';
        }
        if (c.name) {
            html += '<button class="ai-sales-action-btn ai-sales-btn-order" data-action="len-don" data-name="' + _esc(c.name) + '" type="button" aria-label="Lên đơn hàng">🛒 Lên đơn</button>';
        }
        html += '</div>';
        return html;
    }

    /** Điền "Lên đơn cho [name]" vào ô input (KHÔNG tự gửi) */
    function _handleLenDon(name) {
        $input.value = 'Lên đơn cho ' + name;
        $input.focus();
        _autoResize();
        _updateSendBtn();
    }

    

        function _pickValue(row, role) {
        var f = ApiEngine.getFieldByRole ? ApiEngine.getFieldByRole(row, role) : null;
        return f ? f.val : null;
    }

    function _pickField(row, role) {
        return ApiEngine.getFieldByRole ? ApiEngine.getFieldByRole(row, role) : null;
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
        rows.forEach(function(r) {
            Object.keys(r).forEach(function(k) {
                if (keys.indexOf(k) === -1 && _getHiddenFields().indexOf(k) === -1) keys.push(k);
            });
        });
        return keys;
    }

    /**
     * Renderer ĐỘNG 100%: Tự động nhận diện Role từ Metadata
     * @param {Array}  rows      - mảng data từ API
     * @param {string} headerMsg - tiêu đề kết quả
     * @param {string} apiCode   - mã API (được dùng bởi sub-renderer khác)
     * @param {Object} meta      - { uiTemplate, fieldRoles, khCode } từ ApiEngine
     */
    function _renderCardView(rows, headerMsg, apiCode, meta) {
        var keys = _getKeys(rows);
        var html = '';
        if (headerMsg) html += '<div class="ai-result-header">' + _esc(headerMsg) + '</div>';
        
        var viewId = 'view-' + (++_modalIdCounter);
        html += '<div class="ai-inline-container" id="' + viewId + '">';
        html += '<div class="ai-view-cards">';
        html += '<div class="ai-card-list ' + (rows.length > 5 ? 'accordion' : '') + '">';
        
        rows.forEach(function(row, idx) {
            var titleF = _pickField(row, 'TITLE');
            var idF = _pickField(row, 'ID');
            var badgeF = _pickField(row, 'BADGE');
            var moneyF = _pickField(row, 'MONEY');
            var trendF = _pickField(row, 'TREND');

            var usedKeys = [];
            if (titleF) usedKeys.push(titleF.key);
            if (idF) usedKeys.push(idF.key);
            if (badgeF) usedKeys.push(badgeF.key);

            html += '<div class="ai-card">';
            html += '<div class="ai-card-header">';
            if (titleF) {
                html += '<div class="ai-card-title">' + _esc(String(titleF.val)) + '</div>';
            } else {
                html += '<div class="ai-card-title">Mục ' + (idx + 1) + '</div>';
            }
            html += '<div class="ai-card-meta">';
            if (idF) html += '<span class="ai-card-id">' + _esc(String(idF.val)) + '</span>';
            if (badgeF) html += '<span class="ai-badge ' + _badgeClass(badgeF.val) + '">' + _esc(String(badgeF.val)) + '</span>';
            html += '</div>';
            html += '</div>'; // header

            html += '<div class="ai-card-body">';
            if (moneyF) {
                html += '<div class="ai-card-money">💰 ' + _esc(moneyF.key) + ': <strong>' + _fmtCellVal(moneyF.val) + '</strong></div>';
                usedKeys.push(moneyF.key);
            }
            if (trendF) {
                var tv = String(trendF.val);
                var trendCls = (tv.indexOf('-') !== -1 || tv.indexOf('giảm') !== -1) ? 'ai-trend-down' : 'ai-trend-up';
                html += '<div class="ai-card-trend ' + trendCls + '">📈 ' + _esc(trendF.key) + ': ' + _esc(tv) + '</div>';
                usedKeys.push(trendF.key);
            }

            // Hiện các field còn lại
            keys.forEach(function(k) {
                if (usedKeys.indexOf(k) !== -1) return;
                var val = row[k];
                if (val === null || val === undefined || String(val).trim() === '') return;
                html += '<div class="ai-card-row">';
                html += '<span class="ai-card-label">' + _esc(k) + '</span>';
                html += '<span class="ai-card-value">' + _esc(_fmtCellVal(val)) + '</span>';
                html += '</div>';
            });
            html += '</div>'; // body
            html += _buildActionBar(row);
            html += '</div>'; // card
        });

        html += '</div>'; // card-list
        html += '</div>'; // ai-view-cards

        // Nút toggle bảng
        var toggleText = '📊 Xem dạng bảng';
        html += '<button class="ai-table-btn ai-inline-toggle-btn" data-view-id="' + viewId + '" data-orig-text="' + _esc(toggleText) + '">' + toggleText + '</button>';
        html += '<div class="ai-view-table" style="display:none">';
        html += _buildInlineTable(rows, keys);
        html += '</div>';
        html += '</div>'; // ai-inline-container

        return html;
    }

    // ══════════════════════════════════════════════════════════════
    //  PROJECT-SPECIFIC RENDERERS
    //  Các renderer kinh doanh riêng (CONG_NO, TICH_LUY...) đã được
    //  tách sang: chatbot-renderers-{project}.js
    //  Đăng ký qua: ApiChatbot.registerRenderer('KEY', function(...){})
    // ══════════════════════════════════════════════════════════════

    // ── [CATALOG] renderer — lưới thẻ cho danh mục / sản phẩm ────
    function _renderCatalog(rows, headerMsg, apiCode, meta) {

        var keys = _getKeys(rows);
        var html = '';
        if (headerMsg) html += '<div class="ai-result-header">' + _esc(headerMsg) + '</div>';

        var viewId = 'view-' + (++_modalIdCounter);
        html += '<div class="ai-inline-container" id="' + viewId + '">';
        html += '<div class="ai-catalog-grid">';

        rows.forEach(function(row, idx) {
            var titleF  = _pickField(row, 'TITLE');
            var idF     = _pickField(row, 'ID');
            var badgeF  = _pickField(row, 'BADGE');
            var moneyF  = _pickField(row, 'MONEY');
            var phoneF  = _pickField(row, 'PHONE');

            var usedKeys = [];
            if (titleF)  usedKeys.push(titleF.key);
            if (idF)     usedKeys.push(idF.key);
            if (badgeF)  usedKeys.push(badgeF.key);
            if (moneyF)  usedKeys.push(moneyF.key);
            if (phoneF)  usedKeys.push(phoneF.key);

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

            // Body — fields còn lại
            html += '<div class="ai-catalog-card-body">';
            if (moneyF) {
                html += '<div class="ai-catalog-money">💰 ' + _esc(_fmtCellVal(moneyF.val)) + '</div>';
            }
            keys.forEach(function(k) {
                if (usedKeys.indexOf(k) !== -1) return;
                var val = row[k];
                if (val === null || val === undefined || String(val).trim() === '') return;
                html += '<div class="ai-catalog-row">';
                html += '<span class="ai-catalog-label">' + _esc(k) + '</span>';
                html += '<span class="ai-catalog-value">' + _esc(_fmtCellVal(val)) + '</span>';
                html += '</div>';
            });
            html += '</div>'; // body

            // Action bar (gọi / zalo)
            html += _buildActionBar(row);
            html += '</div>'; // catalog-card
        });

        html += '</div>'; // catalog-grid

        // Toggle sang bảng
        var toggleText = '📊 Xem dạng bảng';
        html += '<button class="ai-table-btn ai-inline-toggle-btn" data-view-id="' + viewId + '" data-orig-text="' + _esc(toggleText) + '">' + toggleText + '</button>';
        html += '<div class="ai-view-table" style="display:none">';
        html += _buildInlineTable(rows, keys);
        html += '</div>';
        html += '</div>'; // ai-inline-container

        return html;
    }

    // ── Registry Registration ─────────────────────────────────────
    // CORE renderers — hoạt động cho mọi project
    _UI_RENDERERS['DEFAULT'] = _renderCardView;
    _UI_RENDERERS['CATALOG'] = _renderCatalog;

    // ── Inline Toggle & Modal table helpers ─────────────────────────

    /**
     * Build full inline table HTML (filter bar + table)
     * rows/keys được attach lên DOM element sau khi insert qua __rows/__keys
     * để filter events có thể dùng lại mà không cần cache global
     */
    function _buildInlineTable(rows, keys) {
        var tbodyId = 'ai-inline-tbody-v' + _modalIdCounter;
        var html = '';

        // ── Phát hiện field phân loại (badge) để tạo filter chip động ──
        var badgeKeyFound = null;
        var badgeValues = {};
        for (var bi = 0; bi < 'BADGE'.length; bi++) {
            var bk = 'BADGE'[bi];
            if (keys.indexOf(bk) !== -1) {
                // Đếm distinct values
                rows.forEach(function(r) {
                    var v = String(r[bk] || '').trim();
                    if (v) badgeValues[v] = (badgeValues[v] || 0) + 1;
                });
                // Chỉ dùng nếu có ≥ 2 giá trị khác nhau và ≤ 6 loại (để chip không quá nhiều)
                var bvKeys = Object.keys(badgeValues);
                if (bvKeys.length >= 2 && bvKeys.length <= 6) {
                    badgeKeyFound = bk;
                    break;
                }
                badgeValues = {}; // reset nếu không phù hợp
            }
        }

        // ── Filter toolbar ──
        var chipsHtml = '<button class="ai-sales-filter-chip active" data-filter="all" type="button">Tất cả</button>';
        if (badgeKeyFound) {
            // Render chip cho từng giá trị phân loại thực tế trong data
            Object.keys(badgeValues).sort().forEach(function(v) {
                var icon = (v === 'A' || v.toUpperCase() === 'VIP') ? '⭐ ' :
                           (v === 'B') ? '🔵 ' :
                           (v === 'C') ? '🔴 ' : '';
                chipsHtml += '<button class="ai-sales-filter-chip" data-filter="badge:' + _esc(v) + '" data-badge-key="' + _esc(badgeKeyFound) + '" type="button">' + icon + _esc(v) + ' (' + badgeValues[v] + ')</button>';
            });
        }
        chipsHtml += '<span class="ai-sales-filter-count">' + rows.length + ' dòng</span>';

        html += '<div class="ai-sales-filter-bar ai-inline-filter">'
            + '<input class="ai-sales-filter-input" type="search" placeholder="🔍 Tìm nhanh trong kết quả..." autocomplete="off" />'
            + '<div class="ai-sales-filter-chips">' + chipsHtml + '</div>'
            + '</div>';

        // ── Table ──
        html += '<div class="ai-inline-table-wrap">';
        html += '<table class="ai-table"><thead><tr>';
        keys.forEach(function(k) { html += '<th>' + _esc(k) + '</th>'; });
        html += '</tr></thead>';
        html += '<tbody id="' + tbodyId + '">' + _renderTableBody(rows, keys) + '</tbody>';
        html += '</table></div>';

        // Lưu data vào cache để filter handler dùng
        _modalDataCache[tbodyId] = { rows: rows, keys: keys, badgeKey: badgeKeyFound };

        return html;
    }


    /** Render chỉ phần <tbody> (tách riêng để re-render khi filter) */

    function _renderTableBody(filteredRows, keys) {
        var MAX = 500;
        var shown = Math.min(filteredRows.length, MAX);
        var html = '';
        for (var i = 0; i < shown; i++) {
            html += '<tr>';
            keys.forEach(function(k) { html += '<td>' + _esc(_fmtCellVal(filteredRows[i][k])) + '</td>'; });
            html += '</tr>';
        }
        if (filteredRows.length > MAX) {
            html += '<tr><td colspan="' + keys.length + '" style="text-align:center;opacity:0.6;font-style:italic">... và ' + (filteredRows.length - MAX) + ' dòng khác</td></tr>';
        }
        return html;
    }

    /** Lọc rows theo search text + filter key (client-side) */
    function _applyModalFilter(allRows, keys, searchText, filterKey, badgeKey) {
        var filtered = allRows;
        // Filter chip: badge:VALUE (ví dụ badge:A, badge:VIP)
        if (filterKey && filterKey.indexOf('badge:') === 0) {
            var targetVal = filterKey.substring(6); // lấy phần sau "badge:"
            filtered = filtered.filter(function(r) {
                // Nếu biết cụ thể field nào (badgeKey) → chỉ lọc field đó
                if (badgeKey) {
                    return String(r[badgeKey] || '').trim() === targetVal;
                }
                // Fallback: tìm trong tất cả keys
                return keys.some(function(k) {
                    return String(r[k] || '').trim() === targetVal;
                });
            });
        }
        // Search text: khớp bất kỳ field nào (case-insensitive, bỏ dấu)

        if (searchText) {
            var kw = _clearVn(searchText.toLowerCase());
            filtered = filtered.filter(function(r) {
                return keys.some(function(k) {
                    return _clearVn(String(r[k] || '')).indexOf(kw) !== -1;
                });
            });
        }
        return filtered;
    }

    // ── Click delegation cho accordion + modal + action bar ────────
    $messages.addEventListener('click', function(e) {
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

                    // Bind filter events (chỉ 1 lần, bọc try-catch để không block display)
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
                                var doFilter2 = function() {
                                    var filtered = _applyModalFilter(allRows, keysF, curSearch, curFilter, curBadgeKey);
                                    if (tbody) tbody.innerHTML = _renderTableBody(filtered, keysF);
                                    if (countEl2) countEl2.textContent = filtered.length + ' dòng';
                                };
                                if (searchEl2) {
                                    var _t2 = null;
                                    searchEl2.addEventListener('input', function() {
                                        clearTimeout(_t2);
                                        var sv = searchEl2.value;
                                        _t2 = setTimeout(function() { curSearch = sv; doFilter2(); }, 200);
                                    });
                                }
                                tableView.querySelectorAll('.ai-sales-filter-chip').forEach(function(chip) {
                                    chip.addEventListener('click', function() {
                                        tableView.querySelectorAll('.ai-sales-filter-chip').forEach(function(c) { c.classList.remove('active'); });
                                        chip.classList.add('active');
                                        curFilter = chip.getAttribute('data-filter');
                                        var chipBk = chip.getAttribute('data-badge-key');
                                        curBadgeKey = chipBk || badgeKeyF;
                                        doFilter2();
                                    });
                                });
                            }
                        } catch(filterErr) {
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
                try { res = JSON.parse(textRes); } catch(e) { res = textRes; }
                
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

    // ══════════════════════════════════════════
    //  @MENTION AUTOCOMPLETE
    // ══════════════════════════════════════════

    // Khởi tạo mặc định ngay — đảm bảo @mention luôn hoạt động
    // Khởi tạo mặc định rỗng — hoàn toàn phụ thuộc vào API
    var MENTION_TRIGGERS = {};
    var mentionKeysPattern = null;
    var MENTION_CACHE_KEY = 'mention_categories';
    var MENTION_CACHE_TTL = 24 * 60 * 60 * 1000; // 24 giờ

    /** Apply categories vào MENTION_TRIGGERS + build regex */
    function _mentionApplyCategories(records) {
        MENTION_TRIGGERS = {};
        records.forEach(function (r) {
            var key = r.type || r.MaDanhMuc || '';
            if (key) {
                MENTION_TRIGGERS[key] = {
                    type: key,
                    label: r.label || r.TenDanhMuc || key,
                    icon: r.icon || r.Icon || '📁'
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
        // 1. Đọc cache trước
        try {
            var cached = JSON.parse(localStorage.getItem(MENTION_CACHE_KEY));
            if (cached && cached.data && (Date.now() - cached.timestamp < MENTION_CACHE_TTL)) {
                _mentionApplyCategories(cached.data);
                return; // cache còn hạn → không cần gọi API
            }
        } catch (e) { /* cache lỗi → bỏ qua, fetch API */ }

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
                } catch (e) { /* localStorage đầy → bỏ qua */ }
            })
            .catch(function () {
                // Fallback nếu API lỗi và chưa có data từ cache
                if (Object.keys(MENTION_TRIGGERS).length === 0) {
                    _mentionApplyCategories([
                        { type: 'sanpham', label: 'Sản phẩm', icon: '💊' },
                        { type: 'khachhang', label: 'Khách hàng', icon: '👤' },
                        { type: 'donhang', label: 'Đơn hàng', icon: '📋' },
                        { type: 'khohang', label: 'Kho hàng', icon: '🏭' },
                        { type: 'nhanvien', label: 'Nhân viên', icon: '👨‍💼' }
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

        // ── JS touch scroll (Android/iOS đều hoạt động) ──
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

        // Phase 1: mới gõ @ (+ optional partial text để lọc category)
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
        // Lọc theo partial text (nếu có)
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

        var html = '<div class="mention-header">📌 Chọn danh mục</div>';
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

    /** Chèn @trigger vào textarea khi chọn category */
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

        // Trigger fetch ngay sau khi chọn category
        mentionState.triggerKey = key;
        mentionState.triggerStart = before.length;
        mentionState.searchText = '';
        mentionState.selectedIndex = -1;
        _mentionFetch(key, '');
    }

    /** Gọi API_DanhMuc_AI — dùng fetch trực tiếp, không hiện global spinner */
    function _mentionFetch(type, searchText) {
        mentionState.loading = true;
        var trigger = MENTION_TRIGGERS[type];
        _mentionShow(
            '<div class="mention-header">' + trigger.icon + ' ' + trigger.label + '</div>'
            + '<div class="mention-loading">Đang tải...</div>'
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

        // Phase 2: đã chọn category → fetch dữ liệu
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
            var selIdx = mentionState.selectedIndex >= 0 ? mentionState.selectedIndex : 0;
            if (mentionState.items.length > 0) {
                // Kiểm tra phase: nếu items là string (category key) thì chọn category
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

    // ══════════════════════════════════════════
    //  INLINE GHOST TEXT (Tab autocomplete)
    // ══════════════════════════════════════════

    var ghostText = '';
    var ghostFull = '';
    var $ghost = null;
    var ghostExternalActive = false; // when set by external helper (API hints)

    function _ghostCreate() {
        $ghost = document.createElement('div');
        $ghost.className = 'chat-ghost-text';
        $ghost.setAttribute('aria-hidden', 'true');
        // Bọc textarea trong wrapper riêng để ghost căn đúng vị trí
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
        // Hiện: phần user gõ (ẩn hoàn toàn) + phần gợi ý (mờ xám)
        // Đồng bộ cuộn tuyệt đối bằng cách gán scrollTop/scrollLeft
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
        if (!ghostText) return; // Không có ghost → bỏ qua
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
        $messages.innerHTML = '';
        $welcome.style.display = '';
        _clearFiles();
        _mentionHide();
    });

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

    // ══════════════════════════════════════════════════════
    //  FEATURE 3: SUGGESTION CHIPS BAR (trên input)
    // ══════════════════════════════════════════════════════

    var _chipsBar = null;

    function _initSuggestionBar() {
        var suggestions = window.CHAT_SUGGESTIONS;
        if (!suggestions || !suggestions.length) return;

        // Xây dựng cấu trúc danh mục
        var categories = {};
        suggestions.forEach(function(s) {
            var cat = s.category || 'Khác';
            if (!categories[cat]) categories[cat] = [];
            categories[cat].push(s);
        });
        
        var catNames = Object.keys(categories);
        // Đẩy tab "Hướng dẫn" xuống cuối cùng
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
            else if (catName === 'Đơn hàng') colorClass = 'chip-vibrant-orders';
            else if (catName === 'Tra cứu') colorClass = 'chip-vibrant-search';
            
            items.forEach(function(s) {
                var btn = document.createElement('button');
                btn.type = 'button';
                btn.className = 'ai-sales-chip ' + colorClass;
                // Hiển thị nội dung cực ngắn đã được tối ưu
                btn.textContent = (s.icon ? s.icon + ' ' : '') + (s.label || s.text);
                btn.addEventListener('click', function() {
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
            catNames.forEach(function(c) {
                var tBtn = document.createElement('button');
                tBtn.type = 'button';
                tBtn.className = 'ai-sales-tab-btn' + (c === lastCat ? ' active' : '');
                tBtn.textContent = c;
                tBtn.addEventListener('click', function() {
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
    _renderHistory();
    _initSuggestionBar();

    // ── API Engine (@api_code menu + DataSource fields) ──
    if (window.ApiEngine) {
        ApiEngine.init({
            inputEl: $input,
            addMessage: _addMessage,
            addHtmlMessage: _addHtmlMessage,
            renderCardView: _renderCardView,
            showTyping: _showTyping,
            hideTyping: _hideTyping
        });
    }

    // Responsive placeholder
    function _updatePlaceholder() {
        $input.placeholder = window.innerWidth <= 480
            ? 'Nhập tin nhắn...'
            : 'Nhập tin nhắn... (@ tra cứu)';
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
    // Rồi gọi:
    //   ApiChatbot.registerRenderer('MY_TEMPLATE', function(rows, msg, apiCode, meta) { ... })
    window.ApiChatbot = {
        registerRenderer: function (key, fn) {
            if (typeof fn !== 'function') { console.warn('[ApiChatbot] registerRenderer: fn phải là function'); return; }
            _UI_RENDERERS[String(key).toUpperCase()] = fn;
        },
        // Helpers dùng cho renderer bên ngoài
        helpers: {
            pickField:      function (row, role) { return _pickField(row, role); },
            pickValue:      function (row, role) { return _pickValue(row, role); },
            fmtCellVal:     function (v)         { return _fmtCellVal(v); },
            esc:            function (s)          { return _esc(s); },
            badgeClass:     function (val)        { return _badgeClass(val); },
            buildActionBar: function (row)        { return _buildActionBar(row); },
            buildInlineTable: function (rows, keys) { return _buildInlineTable(rows, keys); },
            getKeys:        function (rows)       { return _getKeys(rows); },
            isValidPhone:   function (v)          { return _isValidPhone(v); },
            formatTime:     function (ts)         { return _formatTime(ts); },
            clearVn:        function (s)          { return _clearVn(s); },
            nextId:         function ()           { return ++_modalIdCounter; },
            addHtmlMessage: function (html, sum)  { return _addHtmlMessage(html, sum); },
            getToken:       function ()           { return _getToken(); }
        },
        // Debug only
        __internal: {
            handleReply: _handleReply,
            renderCardView: _renderCardView
        }
    };
})();
