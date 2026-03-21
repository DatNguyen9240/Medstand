// -- AI Chatbot Page ----------------------------------------------------------
(function () {
    var CHAT_API = 'https://chienthangg.app.n8n.cloud/webhook/api-nha-thuoc';
    var CHAT_API_KEY = 'test123456';
    var CACHE_KEY = 'ai_chat_history';
    var CACHE_TTL = 30 * 60 * 1000; // 30 phút
    var MAX_FILE_SIZE = 10 * 1024 * 1024; // 10 MB

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
    var $btnAttach = document.getElementById('btn-attach');
    var $btnMic = document.getElementById('btn-mic');
    var $fileInput = document.getElementById('chat-file-input');
    var $filePreview = document.getElementById('chat-file-preview');
    var $fileName = document.getElementById('chat-file-name');
    var $fileSize = document.getElementById('chat-file-size');
    var $fileRemove = document.getElementById('chat-file-remove');

    var chatHistory = _loadCache();
    var selectedFile = null;   // File object đang chọn
    var recognition = null;    // SpeechRecognition instance
    var isRecording = false;

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

    function _formatFileSize(bytes) {
        if (bytes < 1024) return bytes + ' B';
        if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
        return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
    }

    function _scrollBottom() {
        setTimeout(function () {
            $container.scrollTop = $container.scrollHeight;
        }, 50);
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
        var hasFile = !!selectedFile;
        $btnSend.disabled = !(hasText || hasFile);
    }

    // ══════════════════════════════════════════
    //  FILE UPLOAD
    // ══════════════════════════════════════════

    function _clearFile() {
        selectedFile = null;
        $fileInput.value = '';
        $filePreview.style.display = 'none';
        _updateSendBtn();
    }

    $btnAttach.addEventListener('click', function () {
        $fileInput.click();
    });

    $fileInput.addEventListener('change', function () {
        var file = $fileInput.files && $fileInput.files[0];
        if (!file) return;

        // Kiểm tra kích thước
        if (file.size > MAX_FILE_SIZE) {
            alert('File quá lớn! Tối đa 10 MB.');
            $fileInput.value = '';
            return;
        }

        selectedFile = file;
        $fileName.textContent = file.name;
        $fileSize.textContent = _formatFileSize(file.size);
        $filePreview.style.display = 'flex';
        _updateSendBtn();
    });

    $fileRemove.addEventListener('click', _clearFile);

    // ══════════════════════════════════════════
    //  VOICE RECORDING (Web Speech API)
    // ══════════════════════════════════════════

    var SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    var textBeforeRecording = '';  // Text có sẵn trước khi bắt đầu ghi
    var finalTranscript = '';      // Text đã xác nhận (final)

    if (SpeechRecognition) {
        recognition = new SpeechRecognition();
        recognition.lang = 'vi-VN';
        recognition.interimResults = true;   // Hiển thị real-time khi đang nói
        recognition.continuous = true;       // Ghi liên tục cho đến khi bấm dừng
        recognition.maxAlternatives = 3;     // Chọn kết quả chính xác nhất

        recognition.addEventListener('result', function (e) {
            var interim = '';
            for (var i = e.resultIndex; i < e.results.length; i++) {
                var text = e.results[i][0].transcript;
                if (e.results[i].isFinal) {
                    // Kết quả đã xác nhận → lưu vĩnh viễn
                    finalTranscript += (finalTranscript ? ' ' : '') + text;
                } else {
                    // Kết quả tạm → hiển thị preview (sẽ bị thay thế)
                    interim += text;
                }
            }

            // Cập nhật textarea: text cũ + final + interim (preview)
            var display = textBeforeRecording;
            if (finalTranscript) {
                display += (display ? ' ' : '') + finalTranscript;
            }
            if (interim) {
                display += (display ? ' ' : '') + interim;
            }
            $input.value = display;
            _autoResize();
            _updateSendBtn();
        });

        recognition.addEventListener('end', function () {
            if (isRecording) {
                // Bị ngắt do im lặng → tự restart để tiếp tục ghi
                try {
                    recognition.start();
                } catch (e) {
                    // Nếu không restart được thì dừng hẳn
                    isRecording = false;
                    $btnMic.classList.remove('recording');
                }
                return;
            }
            // Người dùng bấm dừng → kết thúc
            $btnMic.classList.remove('recording');
        });

        recognition.addEventListener('error', function (e) {
            if (e.error === 'no-speech') {
                // Im lặng quá lâu → bỏ qua, sẽ auto-restart ở event 'end'
                return;
            }
            isRecording = false;
            $btnMic.classList.remove('recording');
            if (e.error === 'not-allowed') {
                alert('Vui lòng cho phép truy cập micro để sử dụng ghi âm.');
            }
        });

        $btnMic.addEventListener('click', function () {
            if (isRecording) {
                // Dừng ghi
                isRecording = false;
                recognition.stop();
            } else {
                // Bắt đầu ghi
                textBeforeRecording = $input.value;
                finalTranscript = '';
                isRecording = true;
                $btnMic.classList.add('recording');
                try {
                    recognition.start();
                } catch (e) {
                    isRecording = false;
                    $btnMic.classList.remove('recording');
                }
            }
        });
    } else {
        // Trình duyệt không hỗ trợ → ẩn nút mic
        $btnMic.style.display = 'none';
    }

    // ══════════════════════════════════════════
    //  SEND MESSAGE
    // ══════════════════════════════════════════

    function _send() {
        var text = $input.value.trim();
        if (!text && !selectedFile) return;

        // Dừng ghi âm nếu đang ghi
        if (isRecording && recognition) {
            recognition.stop();
        }

        var attachedFileName = selectedFile ? selectedFile.name : null;
        var displayText = text || ('📎 ' + attachedFileName);

        // Add user message
        _addMessage('user', displayText, attachedFileName);
        $input.value = '';
        _autoResize();
        $btnSend.disabled = true;

        // Show typing
        _showTyping();

        // Gửi request
        if (selectedFile) {
            // Gửi qua FormData nếu có file
            var formData = new FormData();
            formData.append('action', 'chat');
            formData.append('username', userName || 'Demo');
            formData.append('text', text || '');
            formData.append('file', selectedFile);

            _clearFile();

            fetch(CHAT_API, {
                method: 'POST',
                headers: {
                    'Authorization': 'Bearer ' + _getToken(),
                    'x-api-key': CHAT_API_KEY
                },
                body: formData
            })
                .then(function (res) { return res.json().catch(function () { return res.text(); }); })
                .then(_handleReply)
                .catch(_handleError);
        } else {
            // Gửi JSON như cũ
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
                .then(_handleReply)
                .catch(_handleError);
        }
    }

    function _handleReply(res) {
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
    }

    function _handleError() {
        _hideTyping();
        _addMessage('ai', 'Xin lỗi, tôi không thể phản hồi lúc này. Vui lòng thử lại sau.');
    }

    // ── Auto-resize textarea ──
    function _autoResize() {
        $input.style.height = 'auto';
        $input.style.height = Math.min($input.scrollHeight, 120) + 'px';
    }

    // ══════════════════════════════════════════
    //  @MENTION AUTOCOMPLETE
    // ══════════════════════════════════════════

    var MENTION_TRIGGERS = {
        'sanpham': { type: 'sanpham', label: 'Sản phẩm', icon: '💊' },
        'khachhang': { type: 'khachhang', label: 'Khách hàng', icon: '👤' },
        'donhang': { type: 'donhang', label: 'Đơn hàng', icon: '📋' },
        'khohang': { type: 'khohang', label: 'Kho hàng', icon: '🏭' }
    };
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
        if ($mentionDropdown) return;
        $mentionDropdown = document.createElement('div');
        $mentionDropdown.className = 'mention-dropdown';
        $mentionDropdown.style.display = 'none';
        $mentionDropdown.addEventListener('mousedown', function (e) {
            e.preventDefault(); // giữ focus trên textarea
        });
        document.querySelector('.chat-input-bar').appendChild($mentionDropdown);
    }

    function _mentionShow(html) {
        $mentionDropdown.innerHTML = html;
        $mentionDropdown.style.display = '';
        mentionState.active = true;
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

    /** Parse textarea text → tìm @trigger pattern */
    function _mentionParse() {
        var text = $input.value;
        var cursor = $input.selectionStart;
        // Tìm @ gần nhất trước cursor
        var before = text.substring(0, cursor);
        var match = before.match(/@(sanpham|khachhang|donhang|khohang)(\s(.*))?$/i);
        if (!match) return null;
        return {
            triggerKey: match[1].toLowerCase(),
            triggerStart: before.lastIndexOf('@'),
            searchText: (match[3] || '').trim(),
            fullMatch: match[0]
        };
    }

    /** Gọi API_DanhMuc_AI */
    function _mentionFetch(type, searchText) {
        mentionState.loading = true;
        var trigger = MENTION_TRIGGERS[type];
        _mentionShow(
            '<div class="mention-header">' + trigger.icon + ' ' + trigger.label + '</div>'
            + '<div class="mention-loading">Đang tải...</div>'
        );

        Http.get(API_CONFIG.ENDPOINTS.AI.CATALOG, {
            q: JSON.stringify({ Type: type, SearchText: searchText })
        }).then(function (res) {
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
        var parsed = _mentionParse();
        if (!parsed) {
            _mentionHide();
            return;
        }

        mentionState.triggerKey = parsed.triggerKey;
        mentionState.triggerStart = parsed.triggerStart;
        mentionState.searchText = parsed.searchText;
        mentionState.selectedIndex = -1;

        // Debounce API call
        if (mentionTimer) clearTimeout(mentionTimer);
        mentionTimer = setTimeout(function () {
            _mentionFetch(parsed.triggerKey, parsed.searchText);
        }, MENTION_DEBOUNCE);
    }

    /** Keyboard handler cho mention dropdown */
    function _mentionOnKeydown(e) {
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
        if (e.key === 'Enter') {
            e.preventDefault();
            if (mentionState.selectedIndex >= 0) {
                _mentionSelect(mentionState.selectedIndex);
            } else if (mentionState.items.length > 0) {
                _mentionSelect(0);
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

    // ── Events ──
    $input.addEventListener('input', function () {
        _autoResize();
        _updateSendBtn();
        _mentionOnInput();
    });

    $input.addEventListener('keydown', function (e) {
        // Mention dropdown intercepts keys first
        if (_mentionOnKeydown(e)) return;

        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            if ($input.value.trim() || selectedFile) _send();
        }
    });

    $btnSend.addEventListener('click', _send);

    $btnClear.addEventListener('click', function () {
        if (!chatHistory.length) return;
        chatHistory = [];
        _clearCache();
        $messages.innerHTML = '';
        $welcome.style.display = '';
        _clearFile();
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
    _mentionCreate();
    _renderHistory();
    $input.focus();
})();
