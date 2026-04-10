// -- AI Chatbot Page ----------------------------------------------------------
(function () {
    var CHAT_API = 'https://bridges-duplicate-hiv-aside.trycloudflare.com/webhook/hook-ai-dainao';
    var CHAT_API_KEY = 'test123456';
    var CACHE_KEY = 'ai_chat_history';
    var CACHE_TTL = 24 * 60 * 60 * 1000; // 24 giờ (Phase 1 MVP)
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

    // ── LocalStorage cache with TTL (Phase 1) ──
    function _getSessionKey() {
        return CACHE_KEY + '_' + (userName || 'anonymous');
    }

    function _loadCache() {
        // Fallback: Migrate logic sessionStorage nếu có user đang mở tab cũ
        try {
            var oldRaw = sessionStorage.getItem(CACHE_KEY);
            if (oldRaw) {
                var oldData = JSON.parse(oldRaw);
                if (oldData.messages && oldData.messages.length > 0) {
                    _saveCache(oldData.messages);
                }
                sessionStorage.removeItem(CACHE_KEY);
            }
        } catch(e) {}

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
    var _modalDataCache = {};   // Cache dữ liệu cho modal bảng
    var _modalIdCounter = 0;    // ID counter cho modal

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
            if (msg.isHtml && msg.htmlContent) {
                html += _bubbleHTML(msg.role, msg.content, msg.time, msg.fileName, msg.htmlContent);
            } else {
                html += _bubbleHTML(msg.role, msg.content, msg.time, msg.fileName);
            }
        });
        $messages.innerHTML = html;
        _scrollBottom();
    }

    function _bubbleHTML(role, content, time, fileName, rawHtml) {
        var cls = role === 'user' ? 'user' : 'ai';
        var timeStr = time ? _formatTime(time) : '';
        var text;
        if (rawHtml) {
            // rawHtml: bypass _formatAI/_esc hoàn toàn
            text = rawHtml;
        } else {
            text = role === 'user' ? _esc(content) : _formatAI(content);
        }

        // Mở rộng bubble khi có card/table
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
        if (typeof _updateChipsVisibility === 'function') _updateChipsVisibility();
        $messages.insertAdjacentHTML('beforeend', _bubbleHTML(role, content, msg.time, fileName));
        _scrollBottom();
    }

    // ── Add HTML message (bypasses _formatAI, inserts raw HTML) ──
    function _addHtmlMessage(htmlContent, summaryText) {
        var msg = {
            role: 'ai',
            content: summaryText || '📊 Kết quả',
            time: Date.now(),
            isHtml: true,
            htmlContent: htmlContent
        };
        chatHistory.push(msg);
        _saveCache(chatHistory);
        $welcome.style.display = 'none';
        if (typeof _updateChipsVisibility === 'function') _updateChipsVisibility();
        $messages.insertAdjacentHTML('beforeend', _bubbleHTML('ai', msg.content, msg.time, null, htmlContent));
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
        // Nếu đang đợi AI (đang hiện nút Stop) thì không được disabled nút
        $btnSend.disabled = !(hasText || hasFile || isWaitingAI);
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
        // Nếu người dùng nhập lệnh bắt đầu bằng '#code' → hiển thị tham số API thay vì gửi chat
        var hashMatch = text.match(/^#\s*([@A-Za-z0-9_\-]+)/);
        if (hashMatch) {
            var apiCode = hashMatch[1].replace(/^@/, '');
            _fetchApiConfigAndShow(apiCode);
            return;
        }
        if (!text && selectedFiles.length === 0) return;


        var fileNames = selectedFiles.map(function (f) { return f.name; });
        var attachedFileName = fileNames.length > 0 ? fileNames.join(', ') : null;
        var displayText = text || ('📎 ' + attachedFileName);

        _saveUserPhrase(text);
        _addMessage('user', displayText, attachedFileName);
        $input.value = '';
        _autoResize();

        if (window.ApiEngine && window.ApiEngine.clearState) {
            window.ApiEngine.clearState();
        }

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

            // -- Phase 1: Error Recovery (Exponential Backoff Wrapper) --
            var MAX_RETRIES = 3;
            var INITIAL_DELAY = 2000;

            function _sleep(ms) { return new Promise(function(resolve) { setTimeout(resolve, ms); }); }
            function _updateRetryUI(currentAttempt, maxAttempts) {
                var msg = '⏳ Đang kết nối mạng lại (' + currentAttempt + '/' + maxAttempts + ')...';
                var retryMsgDiv = document.getElementById('chat-retry-message');
                if (retryMsgDiv) {
                    retryMsgDiv.textContent = msg;
                } else {
                    $messages.insertAdjacentHTML('beforeend', '<div class="chat-bubble ai" id="chat-retry-message" style="opacity: 0.8; font-style: italic; font-size: 13px;">' + msg + '</div>');
                    _scrollBottom();
                }
            }
            function _removeRetryUI() {
                var retryMsgDiv = document.getElementById('chat-retry-message');
                if (retryMsgDiv) retryMsgDiv.parentNode.removeChild(retryMsgDiv);
            }

            function _fetchWithRetry(url, options, retryCount) {
                if (retryCount === undefined) retryCount = 0;
                return fetch(url, options)
                    .then(function(response) {
                        if (!response.ok) throw new Error('HTTP Error ' + response.status);
                        _removeRetryUI();
                        return response;
                    })
                    .catch(function(error) {
                        if (error.name === 'AbortError' || (options.signal && options.signal.aborted)) {
                            _removeRetryUI();
                            throw error; // User pressed stop
                        }
                        if (retryCount < MAX_RETRIES) {
                            var delay = INITIAL_DELAY * Math.pow(2, retryCount);
                            console.warn('⚠️ Fetch retry ' + (retryCount + 1) + '/' + MAX_RETRIES + ' in ' + delay + 'ms');
                            _updateRetryUI(retryCount + 1, MAX_RETRIES);
                            return _sleep(delay).then(function() {
                                return _fetchWithRetry(url, options, retryCount + 1);
                            });
                        }
                        _removeRetryUI();
                        throw error;
                    });
            }

            _fetchWithRetry(CHAT_API, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': 'Bearer ' + _getToken(),
                    'x-api-key': CHAT_API_KEY
                },
                body: JSON.stringify(payload),
                signal: abortController.signal
            })
                .then(function (res) {
                    console.log('API Raw Response Status:', res.status);
                    return res.text().then(function(text) {
                        try {
                            return JSON.parse(text);
                        } catch(e) {
                            return { error: true, message: 'Server returned non-JSON', raw: text };
                        }
                    });
                })
                .then(function(data) {
                    console.log('API Parsed Data:', data);
                    _handleReply(data);
                })
                .catch(function(err) {
                    console.error('Fetch chain error:', err);
                    _handleError(err);
                });
        });
    }

    function _handleReply(res) {
        console.log('API Response:', res);
        _hideTyping();
        _setStopMode(false);

        // -- Format moi tu K_SieuLuong: { status, message, data:[], count } --
        if (res && res.status === 'success' && Array.isArray(res.data) && res.data.length > 0) {
            // Loại bỏ row rác kiểu [{}] do SQL query empty trả về
            var cleanData = res.data.filter(function(r) { return Object.keys(r).length > 0 && Object.keys(r).some(function(k) { return HIDDEN_FIELDS.indexOf(k) === -1; }); });
            
            var apiCode = res.apiCode || '';
            var isCongNo = apiCode === '@cong_no_chi_tiet' || (cleanData.length > 0 && cleanData[0].hasOwnProperty('TongTienNoThucTe') && cleanData[0].hasOwnProperty('MaHD'));
            var isTichLuy = apiCode === '@tich_luy' || (cleanData.length > 0 && cleanData[0].hasOwnProperty('TichLuyDatDuoc'));
            
            var khCode = (res.intentParams && res.intentParams['@khachhang']) || '';
            
            var cardHtml = '';
            if (isCongNo) cardHtml = _renderCongNoChiTiet(cleanData, res.message, khCode);
            else if (isTichLuy) cardHtml = _renderTichLuy(cleanData, res.message, khCode);
            else cardHtml = _renderCardView(cleanData, res.message || ('✅ Tìm thấy ' + cleanData.length + ' kết quả.'), apiCode);
            
            _addHtmlMessage(cardHtml, res.message || ('✅ Giao dịch thành công.'));
            return;
        }

        // -- Loi --
        if (res && res.status === 'error') {
            _addMessage('ai', '❌ ' + (res.message || 'Có lỗi xảy ra.'));
            return;
        }

        // -- Fallbacks --
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
        } else if (res && Array.isArray(res.data) && res.data.length > 0) {
            var cleanData2 = res.data.filter(function(r) { return Object.keys(r).length > 0 && Object.keys(r).some(function(k) { return HIDDEN_FIELDS.indexOf(k) === -1; }); });
            var apiCode2 = res.apiCode || '';
            var isCongNo2 = apiCode2 === '@cong_no_chi_tiet' || (cleanData2.length > 0 && cleanData2[0].hasOwnProperty('TongTienNoThucTe') && cleanData2[0].hasOwnProperty('MaHD'));
            var khCode2 = (res.intentParams && res.intentParams['@khachhang']) || '';
            var cardHtml2 = isCongNo2 ? _renderCongNoChiTiet(cleanData2, '', khCode2) : _renderCardView(cleanData2, '', apiCode2);
            _addHtmlMessage(cardHtml2, '📊 Kết quả');
            return;
        } else if (res && res.data) {
            reply = typeof res.data === 'string' ? res.data : JSON.stringify(res.data);
        } else {
            reply = JSON.stringify(res);
        }
        _addMessage('ai', reply);
    }

    // ══════════════════════════════════════════════════════════════
    //  CARD VIEW — Mobile-first data rendering
    // ══════════════════════════════════════════════════════════════

    var HIDDEN_FIELDS = ['_debug_llm', 'JSON_F52E2B61-18A1-11d1-B105-00805F49916B'];

    // ══════════════════════════════════════════════════════════════
    //  FEATURE 1: QUICK ACTION BUTTONS
    // ══════════════════════════════════════════════════════════════

    var PHONE_FIELDS = ['SoDienThoai', 'DienThoai', 'Phone', 'Tel', 'Mobile', 'SoDT', 'DT', 'SDT', 'PhoneNumber', 'CellPhone'];
    var NAME_FIELDS  = ['TenKhachHang', 'CustomerName', 'ObjectName', 'DisplayName', 'FullName', 'HoTen', 'Ten', 'Name', 'TenKH'];

    /** Validate số điện thoại VN đơn giản — tránh XSS qua href */
    function _isValidPhone(v) {
        return /^\+?[\d]{8,15}$/.test(String(v).replace(/[\s\-\.]/g, ''));
    }

    function _normalizePhone(v) {
        return String(v).replace(/[\s\-\.]/g, '');
    }

    /** Tìm phone và name từ 1 row JSON */
    function _detectContactFields(row) {
        var phone = null, name = null;
        for (var i = 0; i < PHONE_FIELDS.length; i++) {
            var v = row[PHONE_FIELDS[i]];
            if (v && _isValidPhone(String(v))) { phone = _normalizePhone(String(v)); break; }
        }
        for (var j = 0; j < NAME_FIELDS.length; j++) {
            var nv = row[NAME_FIELDS[j]];
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

    // Ưu tiên detect field theo vai trò
    var FIELD_ROLES = {
        title: ['TenKhachHang', 'TenCuaHang', 'TenNhaCungCap', 'TenSanPham', 'EmployeeName', 'ItemName',
                'DisplayName', 'Name', 'TenDanhMuc', 'ObjectName', 'FullName', 'HoTen', 'Ten', 'CustomerName',
                'TenNhanVien', 'TenHang', 'TenDoiTac', 'TenKho', 'TenDonHang', 'MaHD', 'DocumentID'],
        id: ['MaKhachHang', 'EmployeeID', 'ItemID', 'MaSP', 'Code', 'ObjectID', 'ExternalCode', 'CustomerCode', 'MaDanhMuc', 'ID'],
        badge: ['PhanLoai', 'NhomKH', 'Type', 'Category', 'TrangThai', 'Status', 'LoaiKH'],
        money: ['DoanhSo', 'TongNo', 'TonKho', 'DonGia', 'SoTien', 'GiaTri', 'TongTien', 'DoanhThu', 'GiaBan',
                'DoanhSoTBThang', 'DoanhSo3Thang', 'DoanhSoThang'],
        trend: ['XuHuong', 'TangGiam', 'PhanTram', 'TyLe', 'CanhBao', 'NhanXet']
    };

    function _pickField(row, candidates) {
        for (var i = 0; i < candidates.length; i++) {
            if (row[candidates[i]] !== undefined && row[candidates[i]] !== null && String(row[candidates[i]]).trim() !== '') {
                return { key: candidates[i], val: row[candidates[i]] };
            }
        }
        return null;
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
                if (keys.indexOf(k) === -1 && HIDDEN_FIELDS.indexOf(k) === -1) keys.push(k);
            });
        });
        return keys;
    }

    // ── Mode 1: Full Card (count ≤ 5) ──────────────────────────────
    function _renderFullCards(rows, headerMsg) {
        var keys = _getKeys(rows);
        var html = '';
        if (headerMsg) html += '<div class="ai-result-header">' + _esc(headerMsg) + '</div>';
        html += '<div class="ai-card-list">';
        rows.forEach(function(row, idx) {
            var titleF = _pickField(row, FIELD_ROLES.title);
            var idF = _pickField(row, FIELD_ROLES.id);
            var badgeF = _pickField(row, FIELD_ROLES.badge);
            var moneyF = _pickField(row, FIELD_ROLES.money);
            var trendF = _pickField(row, FIELD_ROLES.trend);

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
            // Hiện money nổi bật
            if (moneyF) {
                html += '<div class="ai-card-money">💰 ' + _esc(moneyF.key) + ': <strong>' + _fmtCellVal(moneyF.val) + '</strong></div>';
                usedKeys.push(moneyF.key);
            }
            // Trend
            if (trendF) {
                var tv = String(trendF.val);
                var trendCls = (tv.indexOf('-') !== -1 || tv.indexOf('giảm') !== -1 || tv.indexOf('Giam') !== -1) ? 'ai-trend-down' : 'ai-trend-up';
                html += '<div class="ai-card-trend ' + trendCls + '">📈 ' + _esc(trendF.key) + ': ' + _esc(tv) + '</div>';
                usedKeys.push(trendF.key);
            }
            // Các field còn lại
            keys.forEach(function(k) {
                if (usedKeys.indexOf(k) !== -1) return;
                if (row[k] === null || row[k] === undefined || String(row[k]).trim() === '') return;
                html += '<div class="ai-card-row">';
                html += '<span class="ai-card-label">' + _esc(k) + '</span>';
                html += '<span class="ai-card-value">' + _esc(_fmtCellVal(row[k])) + '</span>';
                html += '</div>';
            });
            html += '</div>'; // body
            // ── Feature 1: Action Bar ──
            html += _buildActionBar(row);
            html += '</div>'; // card
        });
        html += '</div>'; // card-list
        return html;
    }

    // ── Mode 2: Accordion (count 6-20) ─────────────────────────────
    function _renderAccordion(rows, headerMsg) {
        var keys = _getKeys(rows);
        var viewId = 'view-' + (++_modalIdCounter);

        var html = '';
        if (headerMsg) html += '<div class="ai-result-header">' + _esc(headerMsg) + '</div>';
        html += '<div class="ai-inline-container" id="' + viewId + '">';

        // ── Phần card (mặc định hiện) ──
        html += '<div class="ai-view-cards">';
        html += '<div class="ai-card-list accordion">';
        rows.forEach(function(row, idx) {
            var titleF = _pickField(row, FIELD_ROLES.title);
            var idF = _pickField(row, FIELD_ROLES.id);
            var badgeF = _pickField(row, FIELD_ROLES.badge);
            var moneyF = _pickField(row, FIELD_ROLES.money);
            var trendF = _pickField(row, FIELD_ROLES.trend);

            var usedKeys = [];
            if (titleF) usedKeys.push(titleF.key);
            if (idF) usedKeys.push(idF.key);
            if (badgeF) usedKeys.push(badgeF.key);
            if (moneyF) usedKeys.push(moneyF.key);
            if (trendF) usedKeys.push(trendF.key);

            html += '<div class="ai-card ai-card-compact">';
            html += '<div class="ai-card-summary">';
            html += '<div class="ai-card-sum-main">';
            html += '<div class="ai-card-title">' + _esc(titleF ? String(titleF.val) : 'Mục ' + (idx+1)) + '</div>';
            html += '<div class="ai-card-meta">';
            if (idF) html += '<span class="ai-card-id">' + _esc(String(idF.val)) + '</span>';
            if (badgeF) html += '<span class="ai-badge ' + _badgeClass(badgeF.val) + '">' + _esc(String(badgeF.val)) + '</span>';
            html += '</div>';
            html += '</div>'; // sum-main
            if (moneyF) {
                html += '<div class="ai-card-sum-value">💰' + _esc(_fmtCellVal(moneyF.val)) + '</div>';
            } else if (trendF) {
                var tv = String(trendF.val);
                var tCls = tv.indexOf('-') !== -1 ? 'ai-trend-down' : 'ai-trend-up';
                html += '<div class="ai-card-sum-value ' + tCls + '">' + _esc(tv) + '</div>';
            }
            html += '<button class="ai-card-expand-btn" aria-label="Xem chi tiết">▾</button>';
            html += '</div>'; // summary
            html += '<div class="ai-card-detail" hidden>';
            keys.forEach(function(k) {
                if (usedKeys.indexOf(k) !== -1) return;
                if (row[k] === null || row[k] === undefined || String(row[k]).trim() === '') return;
                html += '<div class="ai-card-row">';
                html += '<span class="ai-card-label">' + _esc(k) + '</span>';
                html += '<span class="ai-card-value">' + _esc(_fmtCellVal(row[k])) + '</span>';
                html += '</div>';
            });
            html += _buildActionBar(row);
            html += '</div>'; // detail
            html += '</div>'; // card
        });
        html += '</div>'; // card-list
        html += '</div>'; // ai-view-cards

        // ── Nút toggle ──
        // Lưu text gốc vào data attribute để restore khi toggle-back
        var toggleText = '📊 Xem toàn bộ dạng bảng';
        html += '<button class="ai-table-btn ai-inline-toggle-btn" data-view-id="' + viewId + '" data-orig-text="' + _esc(toggleText) + '">' + toggleText + '</button>';

        // ── Inline table (mặc định ẩn) ──
        html += '<div class="ai-view-table" style="display:none">';
        html += _buildInlineTable(rows, keys);
        html += '</div>';

        html += '</div>'; // ai-inline-container
        return html;
    }

    // ── Mode 3: Summary + Modal (count > 20) ───────────────────────
    function _renderSummary(rows, headerMsg) {
        var keys = _getKeys(rows);
        var viewId = 'view-' + (++_modalIdCounter);

        // Đếm theo badge field nếu có
        var groups = {};
        var badgeKey = null;
        if (rows.length > 0) {
            var bf = _pickField(rows[0], FIELD_ROLES.badge);
            if (bf) {
                badgeKey = bf.key;
                rows.forEach(function(r) {
                    var v = String(r[badgeKey] || 'Khác').trim();
                    groups[v] = (groups[v] || 0) + 1;
                });
            }
        }

        var html = '<div class="ai-inline-container" id="' + viewId + '">';

        // ── Summary box (hiện mặc định) ──
        html += '<div class="ai-view-cards">';
        html += '<div class="ai-summary-box">';
        html += '<div class="ai-summary-icon">📊</div>';
        html += '<div class="ai-summary-content">';
        html += '<div class="ai-summary-title">' + _esc(headerMsg || ('Tìm thấy ' + rows.length + ' kết quả')) + '</div>';
        if (badgeKey && Object.keys(groups).length > 0) {
            html += '<div class="ai-summary-groups">';
            Object.keys(groups).forEach(function(g) {
                html += '<span class="ai-badge ' + _badgeClass(g) + '">' + _esc(g) + ' <strong>' + groups[g] + '</strong></span> ';
            });
            html += '</div>';
        }
        html += '</div>';
        html += '</div>'; // summary-box
        html += '</div>'; // ai-view-cards

        // ── Nút toggle ──
        var toggleText2 = '📋 Xem bảng chi tiết';
        html += '<button class="ai-table-btn ai-table-btn-primary ai-inline-toggle-btn" data-view-id="' + viewId + '" data-orig-text="' + _esc(toggleText2) + '">' + toggleText2 + '</button>';

        // ── Inline table (mặc định ẩn) ──
        html += '<div class="ai-view-table" style="display:none">';
        html += _buildInlineTable(rows, keys);
        html += '</div>';

        html += '</div>'; // ai-inline-container
        return html;
    }


    // ── Custom View: Công Nợ Chi Tiết (Financial Report) ──
    function _renderCongNoChiTiet(rows, headerMsg, khachHangCode) {
        var safeRows = (rows && rows.length > 0) ? rows : [];
        var tongNo = safeRows.length > 0 ? (safeRows[0].TongTienNoThucTe || 0) : 0;
        var tongHD = safeRows.length > 0 ? (safeRows[0].TongSoHoaDon || safeRows.length) : 0;
        var phatSinhDuong = 0;
        var phatSinhAm = 0;
        var hasReturn = false;
        
        var cardId = 'congno-async-' + Date.now() + Math.floor(Math.random()*1000);

        safeRows.forEach(function(r) {
            var tien = Number(r.SoTien || 0);
            if (tien > 0) phatSinhDuong += tien;
            else phatSinhAm += tien;
            var dg = (r.DienGiai || '').toLowerCase();
            if (tien < 0 && (dg.indexOf('trả') >= 0 || dg.indexOf('lỗi') >= 0 || dg.indexOf('hỏng') >= 0)) {
                hasReturn = true; 
            }
        });

        // Heuristics for AI & Summary
        var nhanXet = tongNo > 0 ? 'Khách hàng CÒN NỢ công ty.' : (tongNo < 0 ? 'Công ty nợ lại khách hàng.' : 'Đã thanh toán hết công nợ.');
        var aiStatusIcon = tongNo > 0 ? '⚠️' : '✅';
        
        var deXuatAI = '';
        if (hasReturn) {
            deXuatAI = 'Khách thường xuyên có giao dịch trả lại hàng hóa/âm công nợ → Đề xuất: Phối hợp bộ phận QA/Kho để kiểm tra chất lượng sản phẩm kỹ lưỡng trước khi giao.';
        } else if (tongNo > 50000000) {
            deXuatAI = 'Khách hàng có công nợ vượt ngưỡng an toàn (>50tr) → Đề xuất: Ưu tiên đôn đốc thu hồi nợ trước khi xuất các đơn hàng mới trong kỳ tới.';
        } else if (tongNo === 0) {
            deXuatAI = 'Khách hàng có lịch sử thanh toán rất tốt và đúng hạn → Đề xuất: Đẩy mạnh các chương trình khuyến mãi và up-sale để tăng trưởng doanh số nhanh hơn.';
        } else {
            deXuatAI = 'Giao dịch và thanh toán phát sinh tương đối đều đặn → Đề xuất: Thường xuyên liên hệ chăm sóc khách hàng để duy trì mức mua ổn định.';
        }

        var html = '<div class="ai-sales-debt-card" id="' + cardId + '">';
        
        // 1. Header (Tổng quan Tài chính)
        html += '<div class="ai-sales-debt-header" id="hdr-' + cardId + '">';
        html += '<div class="ai-sales-debt-title">Đang xác định khách hàng...</div>';
        html += '<div class="ai-sales-debt-inforow">Mã khách: <b>' + _esc(khachHangCode || 'Chưa rõ') + '</b></div>';
        html += '<div class="ai-sales-debt-inforow">Tổng nợ hiện tại: <b class="' + (tongNo > 0 ? 'ai-sales-positive' : 'ai-sales-negative') + '">' + _fmtCellVal(tongNo) + '</b></div>';
        html += '<div class="ai-sales-debt-inforow">Số lượng hóa đơn: <b>' + tongHD + '</b></div>';
        html += '<div class="ai-sales-debt-conclusion">' + aiStatusIcon + ' ' + nhanXet + '</div>';
        html += '</div>';

        // Toggle Expand
        html += '<button class="ai-sales-toggle-btn" onclick="var e = document.getElementById(\'list-' + cardId + '\'); if(e) { e.style.display = e.style.display === \'none\' ? \'block\' : \'none\'; }">📄 Tùy chỉnh Xem / Ẩn chi tiết hóa đơn (Collapse)</button>';

        // 2. Danh sách chi tiết
        html += '<div class="ai-sales-debt-list" id="list-' + cardId + '" style="display:none;">';
        safeRows.forEach(function(r) {
            var tien = Number(r.SoTien || 0);

            html += '<div class="ai-sales-debt-item">';
            html += '<div class="ai-sales-debt-item-top">';
            html += '<span class="ai-sales-item-id">Mã: <b>' + _esc(r.MaHD || '') + '</b></span>';
            html += '<span class="ai-sales-item-date">' + _esc(r.Ngay || '') + '</span>';
            html += '</div>';
            html += '<div class="ai-sales-debt-item-middle">' + _esc(r.DienGiai || '') + '</div>';
            html += '<div class="ai-sales-debt-item-bottom">';
            html += '<span class="ai-sales-item-amount ' + (tien > 0 ? 'ai-sales-positive' : 'ai-sales-negative') + '">' + _fmtCellVal(tien) + '</span>';
            html += '</div>';
            
            // Item Action Bar
            html += '<div class="ai-sales-item-actions">';
            html += '<button class="ai-sales-mini-btn" onclick="alert(\'Đang đợi tải số điện thoại khách hàng\')">📞 Liên hệ khách</button>';
            html += '<button class="ai-sales-mini-btn" onclick="alert(\'Đang đợi tải số điện thoại khách hàng\')">💬 Nhắc thanh toán</button>';
            html += '<button class="ai-sales-mini-btn" onclick="alert(\'Tính năng xuất PDF hóa đơn đang phát triển\')">📄 Xuất PDF</button>';
            html += '</div>';
            
            html += '</div>';
        });
        html += '</div>';

        // 3. Đề xuất kinh doanh từ AI
        html += '<div class="ai-sales-debt-ai-recommend">';
        html += '<div class="ai-recommend-title">💡 Đề Xuất Kinh Doanh (AI)</div>';
        html += '<div class="ai-recommend-text">' + deXuatAI + '</div>';
        html += '</div>';

        // 4. Kết luận cuối báo cáo
        html += '<div class="ai-sales-debt-footer">';
        html += '<div class="ai-sales-debt-summary">';
        html += '<b>TỔNG KẾT KỲ:</b><br>';
        html += 'Phát sinh nợ (+): <b>' + _fmtCellVal(phatSinhDuong) + '</b><br>';
        html += 'Thanh toán/Trả hàng (-): <b>' + _fmtCellVal(Math.abs(phatSinhAm)) + '</b><br>';
        html += '<hr style="margin: 8px 0; border: none; border-top: 1px dashed var(--ai-border);"/>';
        html += 'Khuyến nghị: ' + (tongNo > 0 ? 'Cần tổ chức đối chiếu công nợ và đôn đốc thu hồi sớm để đảm bảo vòng quay vốn tối ưu.' : 'Duy trì chính sách công nợ hiện tại vì rủi ro thấp.');
        html += '</div>';
        
        // Main Action Bar (Kế thừa Hydration)
        html += '<div class="ai-sales-action-bar" id="act-' + cardId + '">';
        html += '<button class="ai-sales-action-btn ai-sales-btn-disabled" disabled>Đang tải sđt...</button>';
        html += '</div>';

        html += '</div>'; // debt-footer
        html += '</div>'; // debt-card
        
        // 5. Fire Async Fetch
        if (khachHangCode && typeof API_CONFIG !== 'undefined') {
            setTimeout(function() {
                var qs = encodeURIComponent(JSON.stringify({ Type: 'all', SearchText: khachHangCode }));
                var url = API_CONFIG.BASE_URL + API_CONFIG.ENDPOINTS.AI.CATALOG + '?q=' + qs;
                fetch(url, { headers: _getToken() ? { 'Authorization': 'Bearer ' + _getToken() } : {} })
                .then(function(r) { return r.json(); })
                .then(function(jsonRes) {
                    var dataArr = Array.isArray(jsonRes) ? jsonRes : (jsonRes.data || []);
                    var matchedObj = dataArr.find(function(c) { 
                        return String(c.MaDanhMuc).toLowerCase() === String(khachHangCode).toLowerCase() || 
                               String(c.Code || '').toLowerCase() === String(khachHangCode).toLowerCase() ||
                               String(c.ObjectID || '').toLowerCase() === String(khachHangCode).toLowerCase();
                    }) || dataArr[0];
                    
                    var tenKH = matchedObj ? (matchedObj.Name || matchedObj.ObjectName || khachHangCode) : khachHangCode;
                    var sdt = matchedObj ? (matchedObj.Phone || matchedObj.Tel || matchedObj.DienThoai) : null;
                    
                    var hdrEl = document.getElementById('hdr-' + cardId);
                    if (hdrEl) hdrEl.querySelector('.ai-sales-debt-title').innerText = '👤 Khách: ' + _esc(tenKH);
                    
                    var actEl = document.getElementById('act-' + cardId);
                    if (sdt && _isValidPhone(sdt)) {
                        var safeSdt = _esc(sdt);
                        if (actEl) {
                            var newActs = '<a class="ai-sales-action-btn ai-sales-btn-call" href="tel:' + safeSdt + '" aria-label="Gọi khách">📞 Liên hệ TCT</a>';
                            newActs += '<a class="ai-sales-action-btn ai-sales-btn-zalo" href="https://zalo.me/' + safeSdt + '" target="_blank">💬 Nhắc Zalo</a>';
                            newActs += '<button class="ai-sales-action-btn ai-sales-btn-pdf" type="button" onclick="alert(\'Tính năng đang phát triển\')">📄 Xuất báo cáo</button>';
                            actEl.innerHTML = newActs;
                        }
                        
                        // Cập nhật cả nút Action con trong từng Item Hóa Đơn
                        var miniBtns = document.getElementById('list-' + cardId).querySelectorAll('.ai-sales-mini-btn');
                        miniBtns.forEach(function(btn) {
                            if (btn.innerText.indexOf('Liên hệ') >= 0) {
                                btn.onclick = function() { window.location.href = 'tel:' + safeSdt; };
                            } else if (btn.innerText.indexOf('Nhắc thanh toán') >= 0) {
                                btn.onclick = function() { window.open('https://zalo.me/' + safeSdt, '_blank'); };
                            }
                        });
                    } else if (actEl) {
                        var noPhoneBtn = '<button class="ai-sales-action-btn ai-sales-btn-disabled" disabled>📞 KH ko rõ SDT</button>';
                        noPhoneBtn += '<button class="ai-sales-action-btn ai-sales-btn-pdf" type="button" onclick="alert(\'Tính năng đang phát triển\')">📄 Xuất báo cáo</button>';
                        actEl.innerHTML = noPhoneBtn;
                    }
                }).catch(function(e) { console.warn("Fetch Error", e); });
            }, 50);
        } else {
            setTimeout(function() {
                var hdrEl = document.getElementById('hdr-' + cardId);
                if (hdrEl) hdrEl.querySelector('.ai-sales-debt-title').innerText = '👤 Khách hàng: ' + _esc(khachHangCode || 'Chưa rõ');
                var actEl = document.getElementById('act-' + cardId);
                if (actEl) {
                    var fallbackActs = '<button class="ai-sales-action-btn ai-sales-btn-disabled" disabled>📞 KH ko rõ SDT</button>';
                    fallbackActs += '<button class="ai-sales-action-btn ai-sales-btn-pdf" type="button" onclick="alert(\'Tính năng đang phát triển\')">📄 Xuất báo cáo</button>';
                    actEl.innerHTML = fallbackActs;
                }
            }, 50);
        }

        return html;
    }

    // ── Custom View: Tích Lũy / Milestone (Financial Progress) ──
    function _renderTichLuy(rows, headerMsg, khachHangCode) {
        var safeRows = (rows && rows.length > 0) ? rows : [];
        if (safeRows.length === 0) return '<p class="ai-para">📭 Không có dữ liệu tích lũy cho đối tượng này.</p>';
        
        var r0 = safeRows[0];
        var pct = Math.min(100, Math.max(0, parseInt(r0.Percentage || 0)));
        var datDuoc = r0.TichLuyDatDuoc || 0;
        var mucTieu = r0.MucTieu || 0;
        var cardId = 'tichluy-async-' + Date.now() + Math.floor(Math.random()*1000);

        var html = '<div class="ai-sales-milestone-card" id="' + cardId + '">';
        
        // 1. Header & Customer
        html += '<div class="ai-sales-milestone-header" id="hdr-' + cardId + '">';
        html += '<div class="ai-sales-milestone-title">Đang xác định khách hàng...</div>';
        html += '<div class="ai-sales-milestone-subtitle">Mã khách: <b>' + _esc(khachHangCode || 'Chưa rõ') + '</b></div>';
        html += '</div>';

        // 2. Progress Section
        html += '<div class="ai-sales-progress-container">';
        html += '<div class="ai-sales-progress-labels">';
        html += '<span class="ai-sales-progress-current">' + _fmtCellVal(datDuoc) + '</span>';
        html += '<span class="ai-sales-progress-target">Mục tiêu: ' + _fmtCellVal(mucTieu) + '</span>';
        html += '</div>';
        
        var barClass = pct >= 100 ? 'success' : (pct >= 70 ? 'warning' : 'danger');
        html += '<div class="ai-sales-progress-bar-bg">';
        html += '<div class="ai-sales-progress-bar-fill ' + barClass + '" style="width:' + pct + '%"></div>';
        html += '</div>';
        
        html += '<div class="ai-sales-progress-pct">' + pct + '% Hoàn thành</div>';
        html += '</div>';

        // 3. Achievement Boxes
        html += '<div class="ai-sales-milestone-stats">';
        html += '<div class="ai-sales-stat-box">';
        html += '<div class="ai-stat-val">' + _esc(r0.QuaDaDat || 'Chưa đạt') + '</div>';
        html += '<div class="ai-stat-label">🎁 Quà tặng hiện tại</div>';
        html += '</div>';
        html += '<div class="ai-sales-stat-box">';
        html += '<div class="ai-stat-val">' + (r0.SoPhanQua || 0) + '</div>';
        html += '<div class="ai-stat-label">🎫 Số phần quà</div>';
        html += '</div>';
        html += '</div>';

        // 4. AI Reminder Box
        html += '<div class="ai-sales-milestone-reminder">';
        html += '<div class="ai-reminder-title">📢 Lời nhắc từ AI</div>';
        html += '<div class="ai-reminder-text">' + _esc(r0.LoiNhacAI || 'Tiếp tục nỗ lực để đạt mốc cao hơn!') + '</div>';
        html += '</div>';

        // 5. Action Bar (Main Hydration)
        html += '<div class="ai-sales-action-bar" id="act-' + cardId + '">';
        html += '<button class="ai-sales-action-btn ai-sales-btn-disabled" disabled>Đang tải sđt...</button>';
        html += '</div>';

        html += '</div>'; // milestone-card

        // Same Fetch logic as CongNo to hydrate phone and name
        if (khachHangCode && typeof API_CONFIG !== 'undefined') {
            setTimeout(function() {
                var qs = encodeURIComponent(JSON.stringify({ Type: 'all', SearchText: khachHangCode }));
                var url = API_CONFIG.BASE_URL + API_CONFIG.ENDPOINTS.AI.CATALOG + '?q=' + qs;
                fetch(url, { headers: _getToken() ? { 'Authorization': 'Bearer ' + _getToken() } : {} })
                .then(function(r) { return r.json(); })
                .then(function(jsonRes) {
                    var dataArr = Array.isArray(jsonRes) ? jsonRes : (jsonRes.data || []);
                    var matchedObj = dataArr.find(function(c) { 
                        return String(c.MaDanhMuc).toLowerCase() === String(khachHangCode).toLowerCase() || 
                               String(c.Code || '').toLowerCase() === String(khachHangCode).toLowerCase() ||
                               String(c.ObjectID || '').toLowerCase() === String(khachHangCode).toLowerCase();
                    }) || dataArr[0];
                    
                    var tenKH = matchedObj ? (matchedObj.Name || matchedObj.ObjectName || khachHangCode) : khachHangCode;
                    var sdt = matchedObj ? (matchedObj.Phone || matchedObj.Tel || matchedObj.DienThoai) : null;
                    
                    var hdrEl = document.getElementById('hdr-' + cardId);
                    if (hdrEl) hdrEl.querySelector('.ai-sales-milestone-title').innerText = '🏆 Tích lũy: ' + _esc(tenKH);
                    
                    var actEl = document.getElementById('act-' + cardId);
                    if (sdt && _isValidPhone(sdt)) {
                        var safeSdt = _esc(sdt);
                        if (actEl) {
                            var newActs = '<a class="ai-sales-action-btn ai-sales-btn-call" href="tel:' + safeSdt + '" aria-label="Gọi khách">📞 Liên hệ ngay</a>';
                            newActs += '<a class="ai-sales-action-btn ai-sales-btn-zalo" href="https://zalo.me/' + safeSdt + '" target="_blank">💬 Nhắc thanh toán</a>';
                            actEl.innerHTML = newActs;
                        }
                    } else if (actEl) {
                        actEl.innerHTML = '<button class="ai-sales-action-btn ai-sales-btn-disabled" disabled>📞 KH ko rõ SDT</button>';
                    }
                }).catch(function(e) { console.warn("Fetch Error", e); });
            }, 50);
        } else {
            setTimeout(function() {
                var hdrEl = document.getElementById('hdr-' + cardId);
                if (hdrEl) hdrEl.querySelector('.ai-sales-milestone-title').innerText = '🏆 Tích lũy khách hàng';
                var actEl = document.getElementById('act-' + cardId);
                if (actEl) actEl.innerHTML = '<button class="ai-sales-action-btn ai-sales-btn-disabled" disabled>📞 KH ko rõ SDT</button>';
            }, 50);
        }

        return html;
    }

    // ── Router ─────────────────────────────────────────────────────
    function _renderCardView(rows, headerMsg, apiCode) {
        if (!rows || rows.length === 0) {
            return '<p class="ai-para">📭 ' + _esc(headerMsg || 'Không tìm thấy dữ liệu.') + '</p>';
        }
        if (rows.length <= 5) return _renderFullCards(rows, headerMsg);
        if (rows.length <= 20) return _renderAccordion(rows, headerMsg);
        return _renderSummary(rows, headerMsg);
    }

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
        for (var bi = 0; bi < FIELD_ROLES.badge.length; bi++) {
            var bk = FIELD_ROLES.badge[bi];
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

    function _showTableModal(rows) {
        var existing = document.getElementById('ai-table-modal');
        if (existing) existing.remove();

        var keys = _getKeys(rows);
        var currentFilter = 'all';
        var currentSearch = '';

        // Build toolbar HTML
        var toolbarHtml = '<div class="ai-sales-filter-bar">'
            + '<input class="ai-sales-filter-input" id="ai-modal-search" type="search" placeholder="🔍 Tìm nhanh trong kết quả..." autocomplete="off" />'
            + '<div class="ai-sales-filter-chips">'
            + '<button class="ai-sales-filter-chip active" data-filter="all" type="button">Tất cả</button>'
            + '<button class="ai-sales-filter-chip" data-filter="vip" type="button">⭐ Khách VIP</button>'
            + '<span class="ai-sales-filter-count" id="ai-modal-count">' + rows.length + ' dòng</span>'
            + '</div></div>';

        // Build table HTML (only header, body will be rendered separately)
        var tableHtml = '<div class="ai-table-wrap"><table class="ai-table" id="ai-modal-table"><thead><tr>';
        keys.forEach(function(k) { tableHtml += '<th>' + _esc(k) + '</th>'; });
        tableHtml += '</tr></thead><tbody id="ai-modal-tbody">' + _renderTableBody(rows, keys) + '</tbody></table></div>';

        var modal = document.createElement('div');
        modal.id = 'ai-table-modal';
        modal.className = 'ai-modal-overlay';
        modal.innerHTML = '<div class="ai-modal">'
            + '<div class="ai-modal-header">'
            + '<span>📊 Bảng kết quả (' + rows.length + ' dòng)</span>'
            + '<button class="ai-modal-close" id="ai-modal-close-btn">✕</button>'
            + '</div>'
            + '<div class="ai-modal-body">' + toolbarHtml + tableHtml + '</div>'
            + '</div>';
        document.body.appendChild(modal);
        requestAnimationFrame(function() { modal.classList.add('active'); });

        // ── Filter logic ──
        function _doFilter() {
            var filtered = _applyModalFilter(rows, keys, currentSearch, currentFilter);
            var tbody = document.getElementById('ai-modal-tbody');
            var countEl = document.getElementById('ai-modal-count');
            if (tbody) tbody.innerHTML = _renderTableBody(filtered, keys);
            if (countEl) countEl.textContent = filtered.length + ' dòng';
        }

        // Search input
        var searchEl = document.getElementById('ai-modal-search');
        if (searchEl) {
            var _searchTimer = null;
            searchEl.addEventListener('input', function() {
                clearTimeout(_searchTimer);
                var val = searchEl.value;
                _searchTimer = setTimeout(function() {
                    currentSearch = val;
                    _doFilter();
                }, 200);
            });
        }

        // Filter chips
        modal.querySelectorAll('.ai-sales-filter-chip').forEach(function(chip) {
            chip.addEventListener('click', function() {
                modal.querySelectorAll('.ai-sales-filter-chip').forEach(function(c) { c.classList.remove('active'); });
                chip.classList.add('active');
                currentFilter = chip.getAttribute('data-filter');
                _doFilter();
            });
        });

        // Close
        document.getElementById('ai-modal-close-btn').addEventListener('click', function() {
            modal.classList.remove('active');
            setTimeout(function() { modal.remove(); }, 300);
        });
        modal.addEventListener('click', function(e) {
            if (e.target === modal) {
                modal.classList.remove('active');
                setTimeout(function() { modal.remove(); }, 300);
            }
        });
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

    // Nếu user nhập '#code' thì gọi n8n webhook 'api-get-config' để lấy cấu hình tham số và hiển thị
    function _fetchApiConfigAndShow(apiCode) {
        if (!apiCode) {
            _addMessage('ai', 'Không tìm thấy mã API. Vui lòng nhập ví dụ: #goi_y_don_hang');
            return;
        }
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
                // Safe text parsing first to avoid body consumption errors
                return r.text();
            })
            .then(function (textRes) {
                console.log('Config API raw text:', textRes);
                var res = null;
                try {
                    res = JSON.parse(textRes);
                } catch(e) {
                    res = textRes; // fall back to string if not JSON
                }
                console.log('Config API parsed res:', res);

                var msg = '';
                var fields = null;
                if (res && res.data && !Array.isArray(res.data) && (res.data.FieldCode || res.data.field || res.data.name)) {
                    fields = [res.data];
                }
                else if (res && res.data && Array.isArray(res.data.fields)) fields = res.data.fields;
                else if (res && res.data && Array.isArray(res.data)) fields = res.data;
                else if (res && Array.isArray(res.fields)) fields = res.fields;
                else if (res && Array.isArray(res)) fields = res;

                if (!fields || fields.length === 0) {
                    msg = 'Không có cấu hình tham số cho API: ' + apiCode;
                } else {
                    msg = 'Tham số cho ' + apiCode + ':\n';
                    fields.forEach(function (f) {
                        var code = f.FieldCode || f.field || f.name || '';
                        var name = f.FieldName || f.placeholder || f.placeholderText || '';
                        var req = f.IsRequired || f.required ? ' (bắt buộc)' : '';
                        msg += '- ' + code + req + (name ? ' — ' + name : '') + '\n';
                    });
                }
                console.log('Final config message to add:', msg);
                _addMessage('ai', msg);

                try {
                    if (window._ghostSet && fields && fields.length) {
                        var hint = fields.map(function (f) { return (f.FieldCode || f.field || '').replace(/^@/, '') + ':'; }).join(' ');
                        window._ghostSet('@' + apiCode + ' ' + hint + ' ');
                    }
                } catch (e) { console.error('Ghost set error:', e); }
            })
            .catch(function (err) {
                console.error('Fetch config error:', err);
                _addMessage('ai', 'Không thể lấy cấu hình API.');
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
    var CHIPS_MAX = 8;

    function _initSuggestionBar() {
        var suggestions = window.CHAT_SUGGESTIONS;
        if (!suggestions || !suggestions.length) return;

        _chipsBar = document.createElement('div');
        _chipsBar.className = 'ai-sales-chips-bar';
        _chipsBar.id = 'ai-sales-chips';

        var scroll = document.createElement('div');
        scroll.className = 'ai-sales-chips-scroll';

        var shown = suggestions.slice(0, CHIPS_MAX);
        shown.forEach(function(s) {
            var btn = document.createElement('button');
            btn.type = 'button';
            btn.className = 'ai-sales-chip';
            // textContent an toàn, không cần _esc
            btn.textContent = (s.icon ? s.icon + ' ' : '') + s.text;
            btn.addEventListener('click', function() {
                $input.value = s.text;
                _autoResize();
                _updateSendBtn();
                _send();
            });
            scroll.appendChild(btn);
        });

        _chipsBar.appendChild(scroll);

        // Inject ngay trên #chat-input-bar
        var $inputBar = document.getElementById('chat-input-bar');
        if ($inputBar && $inputBar.parentNode) {
            $inputBar.parentNode.insertBefore(_chipsBar, $inputBar);
        }

        // Ẩn chips nếu đã có lịch sử chat
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

    // ── DEBUG hook (ch\u1ec9 d\u00f9ng cho test, x\u00f3a sau khi x\u00e1c nh\u1eadn) \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500
    window.__TEST_CHATBOT = {
        handleReply: _handleReply,
        renderCardView: _renderCardView,
        addHtmlMessage: _addHtmlMessage
    };
})();
