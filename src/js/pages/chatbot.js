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

    // ── Events ──
    $input.addEventListener('input', function () {
        _autoResize();
        _updateSendBtn();
    });

    $input.addEventListener('keydown', function (e) {
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
