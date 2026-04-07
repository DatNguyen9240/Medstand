// -- AI Chatbot Page ----------------------------------------------------------
(function () {
    var CHAT_API = 'https://highways-robbie-outdoors-jefferson.trycloudflare.com/webhook/hook-ai-dainao';
    var CHAT_API_KEY = 'test123456';
    var CACHE_KEY = 'ai_chat_history';
    var CACHE_TTL = 30 * 60 * 1000; // 30 phút
    var USER_PHRASES_KEY = 'ai_user_phrases';
    var MAX_USER_PHRASES = 50;
    var MAX_FILE_SIZE = 10 * 1024 * 1024; // 10 MB

    var user = JSON.parse(localStorage.getItem('auth_user') || '{}');
    var userName = user.UserName || '';

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
            sid = userName + '_' + Date.now() + '_' + Math.random().toString(36).substring(2, 9);
            sessionStorage.setItem(key, sid);
        }
        return sid;
    }

    // ── SessionStorage cache with TTL ──
    function _loadCache() {
        try {
            var raw = sessionStorage.getItem(CACHE_KEY);
            if (!raw) return [];
            var data = JSON.parse(raw);
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

    // ── User Phrase Cache (localStorage, persistent) ──
    function _loadUserPhrases() {
        try {
            var raw = localStorage.getItem(USER_PHRASES_KEY);
            return raw ? JSON.parse(raw) : [];
        } catch (e) { return []; }
    }

    function _saveUserPhrase(text) {
        if (!text || text.length < 3) return;
        // Bỏ qua nếu chỉ là file attachment
        if (text.charAt(0) === '📎') return;
        try {
            var phrases = _loadUserPhrases();
            // Xóa duplicate (case-insensitive)
            var lower = text.toLowerCase();
            phrases = phrases.filter(function (p) { return p.toLowerCase() !== lower; });
            // Thêm vào đầu (mới nhất trước)
            phrases.unshift(text);
            // Giới hạn số lượng
            if (phrases.length > MAX_USER_PHRASES) phrases = phrases.slice(0, MAX_USER_PHRASES);
            localStorage.setItem(USER_PHRASES_KEY, JSON.stringify(phrases));
        } catch (e) { /* localStorage đầy */ }
    }

    // ── DOM ──
    var $container = document.getElementById('chat-container');
    var $messages = document.getElementById('chat-messages');
    var $welcome = document.getElementById('chat-welcome');
    var $input = document.getElementById('chat-input');
    var $btnSend = document.getElementById('btn-send');
    var $btnClear = document.getElementById('btn-clear-chat');
    var $btnAttach = document.getElementById('btn-attach');
    var $fileInput = document.getElementById('chat-file-input');
    var $filePreview = document.getElementById('chat-file-preview');
    var $fileList = document.getElementById('chat-file-list');

    var chatHistory = _loadCache();
    var selectedFiles = [];    // Danh sách file đang chọn (multi)
    var abortController = null; // AbortController cho fetch
    var isWaitingAI = false;    // Đang chờ AI phản hồi

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
            html += _bubbleHTML(msg.role, msg.content, msg.time, msg.fileName);
        });
        $messages.innerHTML = html;
        _scrollBottom();
    }

    function _bubbleHTML(role, content, time, fileName) {
        var cls = role === 'user' ? 'user' : 'ai';
        var timeStr = time ? _formatTime(time) : '';
        var text = role === 'user' ? _esc(content) : _formatAI(content);

        // Nếu AI trả về bảng → mở rộng bubble hết màn hình
        var hasTable = role === 'ai' && text.indexOf('ai-table') !== -1;
        if (hasTable) cls += ' has-table';

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
        // Split by code blocks first to avoid formatting inside them
        var parts = text.split(/(```[\s\S]*?```)/g);
        var html = '';
        for (var i = 0; i < parts.length; i++) {
            if (parts[i].match(/^```/)) {
                // Code block
                var code = parts[i].replace(/^```(\w*)\n?/, '').replace(/\n?```$/, '');
                html += '<pre class="ai-code-block"><code>' + _esc(code) + '</code></pre>';
            } else {
                html += _formatAIBlock(parts[i]);
            }
        }
        return html;
    }

    function _formatAIBlock(text) {
        // Split into paragraphs by double newline
        var paragraphs = text.split(/\n\n+/);
        var result = [];

        paragraphs.forEach(function (para) {
            para = para.trim();
            if (!para) return;

            // Check if it's a table block
            var lines = para.split('\n');
            if (lines.length >= 2 && lines[0].indexOf('|') !== -1 && lines[1].match(/^\s*\|[\s\-:|]+\|\s*$/)) {
                result.push(_formatTable(lines));
                return;
            }

            // Check if it's a list block (all lines start with - or * or 1.)
            var isList = lines.every(function (l) {
                return l.trim() === '' || /^(\s*[-*•]\s|^\s*\d+[.)]\s)/.test(l);
            });
            if (isList && lines.length > 0) {
                result.push(_formatList(lines));
                return;
            }

            // Process line by line for headers & normal text
            var lineResults = [];
            lines.forEach(function (line) {
                var trimmed = line.trim();
                if (!trimmed) return;

                // Horizontal rule
                if (/^[-*_]{3,}$/.test(trimmed)) {
                    lineResults.push('<hr class="ai-hr">');
                    return;
                }

                // Headers
                var hMatch = trimmed.match(/^(#{1,6})\s+(.*)/);
                if (hMatch) {
                    var level = hMatch[1].length;
                    lineResults.push('<h' + level + ' class="ai-heading">' + _inlineFormat(hMatch[2]) + '</h' + level + '>');
                    return;
                }

                // Normal line
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
            // Bold + italic
            .replace(/\*\*\*(.*?)\*\*\*/g, '<strong><em>$1</em></strong>')
            // Bold
            .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
            // Italic
            .replace(/\*(.*?)\*/g, '<em>$1</em>')
            // Inline code
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
        // Header row
        var headers = lines[0].split('|').map(function (c) { return c.trim(); }).filter(function (c) { return c !== ''; });
        html += '<thead><tr>';
        headers.forEach(function (h) {
            html += '<th>' + _inlineFormat(h) + '</th>';
        });
        html += '</tr></thead><tbody>';
        // Data rows (skip separator line at index 1)
        for (var i = 2; i < lines.length; i++) {
            var cells = lines[i].split('|').map(function (c) { return c.trim(); }).filter(function (c) { return c !== ''; });
            if (cells.length === 0) continue;
            html += '<tr>';
            cells.forEach(function (c) {
                html += '<td>' + _inlineFormat(c) + '</td>';
            });
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

    function _formatTime(ts) {
        var d = new Date(ts);
        var h = d.getHours();
        var m = d.getMinutes();
        return (h < 10 ? '0' : '') + h + ':' + (m < 10 ? '0' : '') + m;
    }

    function _clearVn(s) {
        if (!s) return '';
        s = String(s).toLowerCase();
        s = s.replace(/[àáạảãâầấậẩẫăằắặẳẵ]/g, 'a');
        s = s.replace(/[èéẹẻẽêềếệểễ]/g, 'e');
        s = s.replace(/[ìíịỉĩ]/g, 'i');
        s = s.replace(/[òóọỏõôồốộổỗơờớợởỡ]/g, 'o');
        s = s.replace(/[ùúụủũưừứựửữ]/g, 'u');
        s = s.replace(/[ỳýỵỷỹ]/g, 'y');
        s = s.replace(/đ/g, 'd');
        s = s.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
        return s;
    }

    function _formatFileSize(bytes) {
        if (bytes < 1024) return bytes + ' B';
        if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
        return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
    }

    function _scrollBottom() {
        requestAnimationFrame(function () {
            setTimeout(function () {
                $container.scrollTop = $container.scrollHeight;
            }, 80);
        });
    }

    // ── Add message ──
    function _addMessage(role, content, fileName) {
        var msg = { role: role, content: content, time: Date.now() };
        if (fileName) msg.fileName = fileName;
        chatHistory.push(msg);
        _saveCache(chatHistory);

        $welcome.style.display = 'none';
        $messages.insertAdjacentHTML('beforeend', _bubbleHTML(role, content, msg.time, fileName));
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

    // ── Update send button state ──
    function _updateSendBtn() {
        var hasText = $input.value.trim().length > 0;
        var hasFile = selectedFiles.length > 0;
        $btnSend.disabled = !(hasText || hasFile);
    }

    // ══════════════════════════════════════════
    //  FILE UPLOAD
    // ══════════════════════════════════════════

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
                + '</button>'
                + '</div>';
        }).join('');

        // Gán sự kiện cho các nút xóa
        $fileList.querySelectorAll('.chat-file-item-remove').forEach(function (btn) {
            btn.addEventListener('mousedown', function (e) { e.preventDefault(); }); // Giữ keyboard focus
            btn.addEventListener('click', function () {
                var idx = parseInt(this.getAttribute('data-idx'), 10);
                selectedFiles.splice(idx, 1);
                _renderFileList();
                _updateSendBtn();
                $input.focus();
            });
        });
    }

    function _clearFiles() {
        selectedFiles = [];
        if ($fileInput) $fileInput.value = '';
        _renderFileList();
        _updateSendBtn();
    }

    $btnAttach.addEventListener('click', function () {
        $fileInput.click();
    });

    $fileInput.addEventListener('change', function () {
        var files = $fileInput.files;
        if (!files || files.length === 0) return;

        var oversized = [];
        for (var i = 0; i < files.length; i++) {
            if (files[i].size > MAX_FILE_SIZE) {
                oversized.push(files[i].name);
            } else {
                selectedFiles.push(files[i]);
            }
        }

        if (oversized.length > 0) {
            alert('File quá lớn (tối đa 10 MB): ' + oversized.join(', '));
        }

        $fileInput.value = ''; // Reset để có thể chọn lại cùng 1 file
        _renderFileList();
        _updateSendBtn();
    });

    // ── Drag & Drop Logic ──
    var _dragCounter = 0;
    var $dropOverlay = document.createElement('div');
    $dropOverlay.className = 'chat-drop-overlay';
    $dropOverlay.innerHTML = '<div class="chat-drop-inner">'
        + '<svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">'
        + '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>'
        + '<span>Thả tập tin vào đây</span></div>';
    $container.style.position = 'relative';
    $container.appendChild($dropOverlay);

    function _addDroppedFiles(fileList) {
        var oversized = [];
        for (var i = 0; i < fileList.length; i++) {
            if (fileList[i].size > MAX_FILE_SIZE) {
                oversized.push(fileList[i].name);
            } else {
                selectedFiles.push(fileList[i]);
            }
        }
        if (oversized.length > 0) alert('File quá lớn: ' + oversized.join(', '));
        _renderFileList();
        _updateSendBtn();
    }

    $container.addEventListener('dragenter', function (e) {
        e.preventDefault();
        _dragCounter++;
        if (_dragCounter === 1) $dropOverlay.classList.add('active');
    });

    $container.addEventListener('dragleave', function (e) {
        _dragCounter--;
        if (_dragCounter === 0) $dropOverlay.classList.remove('active');
    });

    $container.addEventListener('dragover', function (e) {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'copy';
    });

    $container.addEventListener('drop', function (e) {
        e.preventDefault();
        _dragCounter = 0;
        $dropOverlay.classList.remove('active');
        if (e.dataTransfer && e.dataTransfer.files.length > 0) {
            _addDroppedFiles(e.dataTransfer.files);
        }
    });

    // ══════════════════════════════════════════
    //  API BUTTON — mở ApiEngine @ menu
    // ══════════════════════════════════════════
    var $btnApi = document.getElementById('btn-api');
    if ($btnApi) {
        $btnApi.addEventListener('click', function () {
            if (window.ApiEngine) {
                ApiEngine.showMenu($input);
            }
        });
    }

    // ══════════════════════════════════════════
    //  SEND MESSAGE
    // ══════════════════════════════════════════

    // ── Stop AI icon SVG ──
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
        // ApiEngine intercept: panel đang mở → thu params & execute
        if (window.ApiEngine && ApiEngine.handleSend && ApiEngine.handleSend()) return;

        if (isWaitingAI) {
            _stopAI();
            return;
        }

        var text = $input.value.trim();
        if (!text && selectedFiles.length === 0) return;

        if (isRecording && recognition) recognition.stop();

        var fileNames = selectedFiles.map(function (f) { return f.name; });
        var attachedFileName = fileNames.length > 0 ? fileNames.join(', ') : null;
        var displayText = text || ('📎 ' + attachedFileName);

        _saveUserPhrase(text);
        _addMessage('user', displayText, attachedFileName);
        $input.value = '';
        _autoResize();

        if (window.innerWidth <= 768) $input.blur();

        _showTyping();
        abortController = new AbortController();
        _setStopMode(true);

        var sessionId = _getSessionId();

        // Helper: Nén ảnh
        function _compressImage(file, maxSize, quality, callback) {
            var img = new Image();
            var url = URL.createObjectURL(file);
            img.onload = function () {
                URL.revokeObjectURL(url);
                var w = img.width, h = img.height;
                if (w > maxSize || h > maxSize) {
                    if (w > h) { h = Math.round(h * maxSize / w); w = maxSize; }
                    else { w = Math.round(w * maxSize / h); h = maxSize; }
                }
                var canvas = document.createElement('canvas');
                canvas.width = w; canvas.height = h;
                canvas.getContext('2d').drawImage(img, 0, 0, w, h);
                callback(canvas.toDataURL('image/jpeg', quality));
            };
            img.onerror = function () {
                URL.revokeObjectURL(url);
                var reader = new FileReader();
                reader.onload = function () { callback(reader.result); };
                reader.readAsDataURL(file);
            };
            img.src = url;
        }

        // Helper: Đọc file sang base64
        function _readFile(file) {
            return new Promise(function (resolve) {
                var type = file.type.startsWith('image/') ? 'image' : (file.type.startsWith('audio/') ? 'audio' : 'file');
                if (type === 'image') {
                    _compressImage(file, 1024, 0.7, function (base64) {
                        resolve({ name: file.name, type: type, data: base64 });
                    });
                } else {
                    var reader = new FileReader();
                    reader.onload = function () { resolve({ name: file.name, type: type, data: reader.result }); };
                    reader.onerror = function () { resolve({ name: file.name, type: type, data: null }); };
                    reader.readAsDataURL(file);
                }
            });
        }

        var filesToSend = selectedFiles.slice();
        _clearFiles();

        Promise.all(filesToSend.map(_readFile)).then(function (fileList) {
            var firstFile = fileList.length > 0 ? fileList[0] : null;
            var payload = {
                action: 'chat',
                chatInput: text || displayText,
                text: text || displayText,
                username: userName || 'Demo',
                session_id: sessionId,
                files: fileList
            };
            // Backward compatibility
            if (firstFile) {
                payload.image_url = firstFile.data;
                payload.file_type = firstFile.type;
            }

            fetch(CHAT_API, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': 'Bearer ' + _getToken(),
                    'x-api-key': CHAT_API_KEY
                },
                body: JSON.stringify(payload),
                signal: abortController.signal
            })
                .then(function (res) { return res.json().catch(function () { return res.text(); }); })
                .then(_handleReply)
                .catch(_handleError);
        });
    }

    function _handleReply(res) {
        _hideTyping();
        _setStopMode(false);
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
    }

    function _handleError(err) {
        // Nếu bị abort (user bấm dừng) → không hiện lỗi
        if (err && err.name === 'AbortError') return;
        _hideTyping();
        _setStopMode(false);
        _addMessage('ai', 'Xin lỗi, tôi không thể phản hồi lúc này. Vui lòng thử lại sau.');
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
    var MENTION_TRIGGERS = {
        'sanpham': { type: 'sanpham', label: 'Sản phẩm', icon: '💊' },
        'khachhang': { type: 'khachhang', label: 'Khách hàng', icon: '👤' },
        'donhang': { type: 'donhang', label: 'Đơn hàng', icon: '📋' },
        'khohang': { type: 'khohang', label: 'Kho hàng', icon: '🏭' },
        'nhanvien': { type: 'nhanvien', label: 'Nhân viên', icon: '👨‍💼' }
    };
    var mentionKeysPattern = /@(sanpham|khachhang|donhang|khohang|nhanvien)(\s(.*))?$/i;
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

    function _ghostUpdate() {
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

    _ghostCreate();

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
    _ghostCreate();
    _renderHistory();

    // ── API Engine (@api_code menu + DataSource fields) ──
    if (window.ApiEngine) {
        ApiEngine.init({
            inputEl: $input,
            addMessage: _addMessage,
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

    $input.focus();
})();
