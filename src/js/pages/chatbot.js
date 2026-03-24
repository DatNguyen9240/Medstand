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
    var mediaRecorder = null;  // Cho ghi âm trực tiếp
    var audioChunks = [];      // Chứa dữ liệu audio
    var recordingMode = 'text'; // 'text' (SpeechAPI) hoặc 'audio' (MediaRecorder)
    var silenceTimer = null;    // Bộ đếm thời gian im lặng
    var silenceDelay = 2500;    // 2.5 giây tự động tắt
    var audioContext = null;    // Theo dõi âm lượng
    var analyser = null;
    var microphone = null;
    var scriptProcessor = null;
    var speechRetryCount = 0;   // Đếm số lần retry Speech API
    var MAX_SPEECH_RETRIES = 3; // Tối đa 3 lần retry

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
            var extra = window.innerWidth <= 768 ? 2 : 0;
            $container.scrollTop = $container.scrollHeight + extra;
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

            // Reset silence timer khi có kết quả mới
            _resetSilenceTimer();
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
            if (e.error === 'no-speech') return;
            
            console.error('[Voice] Recognition error:', e.error);
            isRecording = false;
            $btnMic.classList.remove('recording');

            if (e.error === 'network') {
                if (speechRetryCount < MAX_SPEECH_RETRIES) {
                    speechRetryCount++;
                    console.warn('[Voice] Network error, retrying Speech API (' + speechRetryCount + '/' + MAX_SPEECH_RETRIES + ')...');
                    isRecording = true;
                    $btnMic.classList.add('recording');
                    setTimeout(function() {
                        try {
                            recognition.start();
                        } catch (ex) {
                            console.error('[Voice] Retry failed:', ex);
                            isRecording = false;
                            $btnMic.classList.remove('recording');
                            alert('Không thể nhận diện giọng nói. Vui lòng kiểm tra:\n• Kết nối mạng\n• Trang web đang chạy trên HTTPS\n• Đã cấp quyền micro');
                        }
                    }, 500);
                } else {
                    console.error('[Voice] Speech API failed after ' + MAX_SPEECH_RETRIES + ' retries');
                    speechRetryCount = 0;
                    alert('Không thể nhận diện giọng nói. Vui lòng kiểm tra:\n• Kết nối mạng\n• Trang web đang chạy trên HTTPS\n• Đã cấp quyền micro');
                }
                return;
            }

            if (e.error === 'not-allowed') {
                alert('Vui lòng cho phép truy cập micro để sử dụng ghi âm.');
            }
        });

        $btnMic.addEventListener('click', function () {
            if (isRecording) {
                _stopRecording();
            } else {
                _startRecording();
            }
        });
    } else {
        // Trình duyệt không hỗ trợ Web Speech -> Thử MediaRecorder trực tiếp
        recordingMode = 'audio';
        $btnMic.addEventListener('click', function () {
            if (isRecording) _stopRecording();
            else _startRecording();
        });
    }

    function _startRecording() {
        if (recordingMode === 'text' && recognition) {
            textBeforeRecording = $input.value;
            finalTranscript = '';
            speechRetryCount = 0;  // Reset retry counter
            isRecording = true;
            $btnMic.classList.add('recording');
            try {
                recognition.start();
                _resetSilenceTimer(); // Bắt đầu đếm ngược
            } catch (e) {
                console.error('[Voice] recognition.start fail:', e);
                isRecording = false;
                $btnMic.classList.remove('recording');
                alert('Không thể khởi động nhận diện giọng nói. Vui lòng thử lại.');
            }
        } else {
            _startAudioRecording();
        }
    }

    function _stopRecording() {
        isRecording = false;
        $btnMic.classList.remove('recording');
        
        if (silenceTimer) {
            clearTimeout(silenceTimer);
            silenceTimer = null;
        }

        // Tắt AudioContext nếu có (cho MediaRecorder fallback)
        if (audioContext) {
            audioContext.close();
            audioContext = null;
        }

        if (recordingMode === 'text' && recognition) {
            recognition.stop();
        } else if (mediaRecorder && mediaRecorder.state !== 'inactive') {
            mediaRecorder.stop();
        }
    }

    function _resetSilenceTimer() {
        if (silenceTimer) clearTimeout(silenceTimer);
        silenceTimer = setTimeout(function() {
            console.log('[Voice] Silence timeout reached (2.5s). Stopping...');
            _stopRecording();
        }, silenceDelay);
    }

    function _startAudioRecording() {
        if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
            alert('Trình duyệt của bạn không hỗ trợ ghi âm.');
            return;
        }

        navigator.mediaDevices.getUserMedia({ audio: true })
            .then(function (stream) {
                audioChunks = [];
                mediaRecorder = new MediaRecorder(stream);
                
                // --- Silence Detection bằng AudioContext (cho MediaRecorder) ---
                audioContext = new (window.AudioContext || window.webkitAudioContext)();
                analyser = audioContext.createAnalyser();
                microphone = audioContext.createMediaStreamSource(stream);
                scriptProcessor = audioContext.createScriptProcessor(2048, 1, 1);

                analyser.smoothingTimeConstant = 0.8;
                analyser.fftSize = 1024;

                microphone.connect(analyser);
                analyser.connect(scriptProcessor);
                scriptProcessor.connect(audioContext.destination);

                scriptProcessor.onaudioprocess = function() {
                    var array = new Uint8Array(analyser.frequencyBinCount);
                    analyser.getByteFrequencyData(array);
                    var values = 0;
                    var length = array.length;
                    for (var i = 0; i < length; i++) {
                        values += array[i];
                    }
                    var average = values / length;

                    // Ngưỡng âm thanh (threshold) để coi là đang nói
                    if (average > 15) { 
                        _resetSilenceTimer();
                    }
                };
                // -------------------------------------------------------------

                mediaRecorder.addEventListener('dataavailable', function (e) {
                    audioChunks.push(e.data);
                });
                mediaRecorder.addEventListener('stop', function () {
                    var audioBlob = new Blob(audioChunks, { type: 'audio/webm' });
                    var file = new File([audioBlob], "voice_recording_" + Date.now() + ".webm", { type: 'audio/webm' });
                    
                    // Gán vào selectedFile và gửi luôn
                    selectedFile = file;
                    $fileName.textContent = "Ghi âm giọng nói";
                    $fileSize.textContent = _formatFileSize(file.size);
                    $filePreview.style.display = 'flex';
                    _updateSendBtn();
                    
                    // Tự động gửi sau khi dừng ghi âm file
                    setTimeout(_send, 500);

                    // Tắt stream
                    stream.getTracks().forEach(t => t.stop());
                });

                isRecording = true;
                $btnMic.classList.add('recording');
                mediaRecorder.start();
                console.log('[Voice] MediaRecorder started');
            })
            .catch(function (err) {
                console.error('[Voice] getUserMedia error:', err);
                alert('Không thể truy cập máy ảnh/micro: ' + err.message);
                isRecording = false;
                $btnMic.classList.remove('recording');
            });
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

        // Reset keyboard/scroll sau khi gửi
        if (window.innerWidth <= 768) {
            $input.blur();
        }

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
        _scrollBottom();
    }

    // ── Keyboard / Focus handling ──
    $input.addEventListener('focus', function() {
        // Cuộn xuống cuối để thấy tin nhắn mới nhất
        setTimeout(_scrollBottom, 300);
        
        // Trên iOS/Android, đôi khi cần scrollIntoView cho chính input
        if (window.innerWidth <= 768) {
            setTimeout(function() {
                $input.scrollIntoView({ behavior: 'smooth', block: 'center' });
            }, 400);
        }
    });

    // Theo dõi visualViewport để đẩy UI (cho các trình duyệt hiện đại)
    if (window.visualViewport) {
        window.visualViewport.addEventListener('resize', function() {
            if (document.activeElement === $input) {
                _scrollBottom();
            }
        });
    }

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
        if ($mentionDropdown) return;
        $mentionDropdown = document.createElement('div');
        $mentionDropdown.className = 'mention-dropdown';
        $mentionDropdown.style.display = 'none';
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
    _mentionLoadCategories();
    _renderHistory();

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
        setTimeout(function () {
            $container.scrollTop = $container.scrollHeight + 2;
        }, 300);
    });

    $input.addEventListener('blur', function () {
        // Nếu mention dropdown đang mở, giữ nguyên layout và refocus
        if (mentionState.active) {
            setTimeout(function () { $input.focus(); }, 0);
            return;
        }
        if ($nav) {
            $nav.style.display = '';
            $inputBar.style.bottom = '';
        }
    });

    $input.focus();
})();
