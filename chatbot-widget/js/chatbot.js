// -- AI Chatbot Page ----------------------------------------------------------
// Cáº¥u hÃ¬nh: Ä‘á»c tá»« API_CONFIG (api.config.js) â€” KHÃ”NG hardcode URL/key á»Ÿ Ä‘Ã¢y
(function () {
    var _cfg = (typeof API_CONFIG !== 'undefined') ? API_CONFIG : {};
    var CHAT_API = (_cfg.N8N_BASE || '') + (_cfg.CHAT_WEBHOOK || '/webhook/hook-ai-dainao');
    var CHAT_CASUAL_API = (_cfg.N8N_BASE || '') + '/webhook/hook-ai-casual';
    var CHAT_API_KEY = _cfg.CHAT_API_KEY || '';
    var CACHE_KEY = 'ai_chat_history';
    var CACHE_TTL = 0 //24 * 60 * 60 * 1000; // 24 giá»
    var USER_PHRASES_KEY = 'ai_user_phrases';
    var MAX_USER_PHRASES = 50;
    var MAX_FILE_SIZE = 10 * 1024 * 1024; // 10 MB

    // Khá»Ÿi táº¡o Engine vÃ  táº£i Metadata há»‡ thá»‘ng ngay khi load
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

    // â”€â”€ LocalStorage cache with TTL (Phase 1) â”€â”€
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

    // â”€â”€ User Phrase Cache (localStorage, persistent) â”€â”€
    function _loadUserPhrases() {
        try {
            var raw = localStorage.getItem(USER_PHRASES_KEY);
            return raw ? JSON.parse(raw) : [];
        } catch (e) { return []; }
    }

    function _saveUserPhrase(text) {
        if (!text || text.length < 3) return;
        if (text.charAt(0) === 'ðŸ“Ž') return;
        try {
            var phrases = _loadUserPhrases();
            var lower = text.toLowerCase();
            phrases = phrases.filter(function (p) { return p.toLowerCase() !== lower; });
            phrases.unshift(text);
            if (phrases.length > MAX_USER_PHRASES) phrases = phrases.slice(0, MAX_USER_PHRASES);
            localStorage.setItem(USER_PHRASES_KEY, JSON.stringify(phrases));
        } catch (e) { }
    }

    // â”€â”€ DOM â”€â”€
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
    var $btnApi = document.getElementById('btn-api');

    // Khá»Ÿi táº¡o Chatbot API Engine UI (NÃºt "Chá»n API")
    if (window.ApiEngine) {
        window.ApiEngine.init({
            container: $container,
            apiBtn: $btnApi
        });
    }

    var chatHistory = _loadCache();
    var selectedFiles = [];
    var abortController = null;
    var isWaitingAI = false;
    var _modalIdCounter = 0;
    var _UI_RENDERERS = {};
    var _modalDataCache = {}; // Cache cho data báº£ng/tháº»

    // â”€â”€ Render cached messages â”€â”€
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
                return l.trim() === '' || /^(\s*[-*â€¢]\s|^\s*\d+[.)]\s)/.test(l);
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
            var content = trimmed.replace(/^[-*â€¢]\s+/, '').replace(/^\d+[.)]\s+/, '');
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

    // Bá» dáº¥u tiáº¿ng Viá»‡t â€” dÃ¹ng cho search khÃ´ng phÃ¢n biá»‡t dáº¥u
    function _clearVn(s) {
        if (!s) return '';
        var map = {
            'Ã Ã¡áº£Ã£áº¡Äƒáº¯áº·áº±áºµáº«Ã¢áº§áº¥áº­áº«áºµ': 'a', 'Ã€Ãáº¢Ãƒáº Ä‚áº®áº¶áº°áº´áºªÃ‚áº¦áº¤áº¬áºªáº´': 'A',
            'Ã¨Ã©áº»áº½áº¹Ãªá»áº¿á»ƒá»…á»‡': 'e', 'ÃˆÃ‰áººáº¼áº¸ÃŠá»€áº¾á»‚á»„á»†': 'E',
            'Ã¬Ã­á»‰Ä©á»‹': 'i', 'ÃŒÃá»ˆÄ¨á»Š': 'I',
            'Ã²Ã³á»Ãµá»Ã´á»“á»‘á»•á»—á»™Æ¡á»á»›á»Ÿá»¡á»£': 'o', 'Ã’Ã“á»ŽÃ•á»ŒÃ”á»’á»á»”á»–á»˜Æ á»œá»šá»žá» á»¢': 'O',
            'Ã¹Ãºá»§Å©á»¥Æ°á»«á»©á»­á»¯á»±': 'u', 'Ã™Ãšá»¦Å¨á»¤Æ¯á»ªá»¨á»¬á»®á»°': 'U',
            'á»³Ã½á»·á»¹á»µ': 'y', 'á»²Ãá»¶á»¸á»´': 'Y',
            'Ä‘': 'd', 'Ä': 'D'
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
        var msg = { role: 'ai', content: summaryText || 'ðŸ“Š Káº¿t quáº£', time: Date.now(), isHtml: true, htmlContent: htmlContent };
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
                + '<button type="button" class="chat-file-item-remove" data-idx="' + i + '" aria-label="XÃ³a">'
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
        _addMessage('ai', 'â¹ ÄÃ£ dá»«ng pháº£n há»“i.');
    }

    function _send() {
        if (window.ApiEngine && ApiEngine.handleSend && ApiEngine.handleSend()) return;
        if (isWaitingAI) { _stopAI(); return; }
        var text = $input.value.trim();
        if (!text && selectedFiles.length === 0) return;

        // Táº¯t dropdown náº¿u gá»­i báº±ng free chat
        if (window.ApiEngine && window.ApiEngine.hideMenu) window.ApiEngine.hideMenu();

        var fileNames = selectedFiles.map(function (f) { return f.name; });
        var attachedFileName = fileNames.length > 0 ? fileNames.join(', ') : null;
        var displayText = text || ('ðŸ“Ž ' + attachedFileName);

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

        Promise.all(filesToSend.map(function (file) {
            return new Promise(function (resolve) {
                var reader = new FileReader();
                reader.onload = function () { resolve({ name: file.name, data: reader.result, blob: file }); };
                reader.readAsDataURL(file);
            });
        })).then(function (fileList) {
            
            // --- KIá»‚M TRA Lá»†NH Há»ŽI TÃ€I LIá»†U RAG ---
            var normalizedText = String(text).trim().toLowerCase();
            if (normalizedText.indexOf('/há»i') === 0 || normalizedText.indexOf('/hoi') === 0 || normalizedText.indexOf('/searchrag') === 0) {
                var queryText = String(text).replace(/^\/(há»i|hoi|searchrag)/i, '').trim();
                
                if (!queryText) {
                    _hideTyping(); _setStopMode(false);
                    _addMessage('ai', 'Dáº¡ sáº¿p muá»‘n tÃ¬m kiáº¿m thÃ´ng tin gÃ¬ trong kho tÃ i liá»‡u áº¡? (VÃ­ dá»¥: `/há»i Quy Ä‘á»‹nh Ä‘á»•i tráº£ thuá»‘c`)');
                    return;
                }

                _addMessage('ai', 'â³ Äang bá»›i mÃ³c kho dá»¯ liá»‡u tÃ i liá»‡u RAG...');
                _doRAGSearch(queryText);
                
                $input.value = '';
                _updateSendBtn();
                return; // Ngáº¯t luá»“ng chat
            }

            // --- KIá»‚M TRA Lá»†NH Náº P RAG Tá»ª Äá»ŠNH Dáº NG TEXT ---
            // CÃº phÃ¡p: /náº¡p [TiÃªu Ä‘á» báº¯t buá»™c] | [NgÃ y háº¿t háº¡n (Tuá»³ chá»n)]
            if (String(text).trim().toLowerCase().indexOf('/náº¡p') === 0 || String(text).trim().toLowerCase().indexOf('/rag') === 0) {
                if (fileList.length === 0) {
                    _hideTyping(); _setStopMode(false);
                    _addMessage('ai', 'âŒ Äá»ƒ sá»­ dá»¥ng lá»‡nh `/náº¡p`, báº¡n cáº§n Ä‘Ã­nh kÃ¨m Ã­t nháº¥t 1 file Ä‘á»‹nh dáº¡ng vÄƒn báº£n (PDF, DOCX, XLSX).');
                    return;
                }

                var titleText = String(text).substring(4).trim();
                var extractedExpiry = 'never'; // Báº£n N8N khÃ´ng há»— trá»£ Auto-Extract, máº·c Ä‘á»‹nh lÃ  never
                
                // Náº¿u khÃ¡ch cÃ³ gáº¡ch dá»c "TiÃªu Ä‘á» | 2026-10-15"
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
                        role = 'admin'; // Override cho phÃ©p vÆ°á»£t rÃ o dá»±a trÃªn hint displayname
                    }
                }

                // Gá»­i báº±ng form data tá»›i webhook admin-upload
                var doUpload = function(fileBlob) {
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
                    .then(function(res) { return res.json(); })
                    .then(function(result) {
                        _hideTyping(); _setStopMode(false);
                        var data = Array.isArray(result) ? result[0] : result;
                        if (data && data.status !== "error") {
                            let expiredText = data.expiryDate === 'never' ? 'VÄ©nh viá»…n' : data.expiryDate;
                            let serverMsg = data.message || 'ÄÃ£ náº¡p thÃ nh cÃ´ng!';
                            _addMessage('ai', 'âœ… **' + serverMsg + '**\n\n- File: `' + fileList[0].name + '`\n- TiÃªu Ä‘á»: **' + (data.title || titleText) + '**\n- Háº¿t háº¡n: **' + expiredText + '**');
                        } else {
                            _addMessage('ai', 'âŒ KhÃ´ng thá»ƒ náº¡p tÃ i liá»‡u: ' + (data.error || data.message || 'Lá»—i há»‡ thá»‘ng'));
                        }
                    })
                    .catch(function(err) {
                        _hideTyping(); _setStopMode(false);
                        _addMessage('ai', 'âŒ Táº£i lÃªn tháº¥t báº¡i: ' + err.message);
                    });
                };

                var origFile = fileList[0].blob;
                var ext = fileList[0].name.split('.').pop().toLowerCase();
                
                if (ext === 'xls' || ext === 'xlsx') {
                    _addMessage('ai', 'â³ Äang bÃ³c tÃ¡ch dá»¯ liá»‡u tá»« file ' + ext.toUpperCase() + '...');
                    if (!window.XLSX) {
                        var script = document.createElement('script');
                        script.src = 'https://cdn.sheetjs.com/xlsx-latest/package/dist/xlsx.full.min.js';
                        script.onload = function() { processExcel(origFile); };
                        document.head.appendChild(script);
                    } else {
                        processExcel(origFile);
                    }

                    function processExcel(f) {
                        var r = new FileReader();
                        r.onload = function(e) {
                            try {
                                var data = new Uint8Array(e.target.result);
                                var workbook = XLSX.read(data, {type: 'array'});
                                var firstSheet = workbook.Sheets[workbook.SheetNames[0]];
                                var csvStr = XLSX.utils.sheet_to_csv(firstSheet);
                                var b = new Blob([csvStr], {type: 'text/csv'});
                                var newF = new File([b], fileList[0].name.replace(/\.[^/.]+$/, "") + ".csv", {type: "text/csv"});
                                doUpload(newF);
                            } catch(err) {
                                _hideTyping(); _setStopMode(false);
                                _addMessage('ai', 'âŒ Lá»—i Ä‘á»c Excel: Äá»‹nh dáº¡ng cá»• bá»‹ há»ng hoáº·c file cÃ³ bá»c máº­t kháº©u.');
                            }
                        };
                        r.readAsArrayBuffer(f);
                    }
                } else {
                    doUpload(origFile);
                }

                return; // NGáº®T luá»“ng gá»­i chat
            }

            // -- RÃºt trÃ­ch Lá»‹ch sá»­ 10 cÃ¢u gáº§n nháº¥t dá»“n vÃ o payload --
            var pastMsgs = chatHistory.slice(-11, -1); // Láº¥y 10 cÃ¢u trÆ°á»›c (chá»«a cÃ¢u hiá»‡n táº¡i)
            var historyStr = pastMsgs.map(function(m) { return (m.role === 'user' ? 'User: ' : 'AI: ') + String(m.content).replace(/\n/g, ' '); }).join('\n');

            var payload = { action: 'chat', text: text || displayText, session_id: sessionId, files: fileList, history: historyStr };
            fetch(CHAT_API, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + _getToken(), 'x-api-key': CHAT_API_KEY },
                body: JSON.stringify(payload),
                signal: abortController.signal
            })
                .then(function (res) {
                    return res.text().then(function (text) {
                        if (!res.ok) throw new Error("Lá»—i Server N8N (" + res.status + "): CÃ³ thá»ƒ Workflow bá»‹ lá»—i ngáº§m, hÃ£y kiá»ƒm tra Excecutions tab trong N8N.");
                        if (!text) throw new Error("Lá»—i Server N8N: Tráº£ vá» dá»¯ liá»‡u trá»‘ng.");
                        try { return JSON.parse(text); }
                        catch (e) { throw new Error("N8N khÃ´ng tráº£ vá» JSON: " + text.substring(0, 50)); }
                    });
                })
                .then(function (data) { _handleReply(data); })
                .catch(function (err) { _handleError(err); });
        });
    }

    function _callCasualChatFallback(lastText) {
        var text = $input.value.trim() || lastText || "Xin chÃ o";
        var pastMsgs = chatHistory.slice(-11, -1);
        var historyStr = pastMsgs.map(function(m) { return (m.role === 'user' ? 'User: ' : 'AI: ') + String(m.content).replace(/\n/g, ' '); }).join('\n');

        _showTyping();
        var payload = { action: 'chat', text: text, session_id: _getSessionId(), history: historyStr };
        fetch(CHAT_CASUAL_API, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + _getToken(), 'x-api-key': CHAT_API_KEY },
            body: JSON.stringify(payload)
        }).then(function(res) {
            return res.json();
        }).then(function(data) {
            _hideTyping();
            if (data && data.message) _addMessage('ai', data.message);
            else _addMessage('ai', "Xin lá»—i, tÃ´i chÆ°a thá»ƒ tráº£ lá»i cÃ¢u há»i nÃ y.");
        }).catch(function(err) {
            _hideTyping();
            _addMessage('ai', "Lá»—i káº¿t ná»‘i luá»“ng Ä‘Ã m thoáº¡i NLP: " + err.message);
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

        // Feature 4: Timeout UX Chá»‘ng treo giáº£ sau 8s
        var searchingTimeout = setTimeout(function() {
            _addMessage('ai', 'Dáº¡ em váº«n Ä‘ang lá»¥c láº¡i cÃ¡c chÃ­nh sÃ¡ch liÃªn quan, sáº¯p cÃ³ káº¿t quáº£ rá»“i áº¡! â³');
            _showTyping(); // Reload typing bá»t
        }, 8000);

        fetch(webhookUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + _getToken() },
            body: JSON.stringify(payload)
        }).then(function(res) {
            return res.json();
        }).then(function(data) {
            data = Array.isArray(data) ? data[0] : data;
            clearTimeout(searchingTimeout);
            _hideTyping(); _setStopMode(false);
            if (data && data.status !== "error" && data.message) {
                _addMessage('ai', data.message);
            } else {
                _addMessage('ai', "âŒ Lá»—i tra cá»©u tÃ i liá»‡u: " + (data.error || data.message || "Luá»“ng webhook khÃ´ng pháº£n há»“i Ä‘Ãºng Ä‘á»‹nh dáº¡ng"));
            }
        }).catch(function(err) {
            clearTimeout(searchingTimeout);
            _hideTyping(); _setStopMode(false);
            _addMessage('ai', "âŒ Lá»—i káº¿t ná»‘i mÃ¡y chá»§ tri thá»©c: " + err.message);
        });
    }

    function _handleReply(res) {
        console.log('API Response:', res);
        _hideTyping();
        _setStopMode(false);

        try {
            // -- Format má»›i tá»« K_SieuLuong: { status, message, data:[], count, uiTemplate, intentParams } --
            if (res && res.action_code === 'OPEN_API_PANEL') {
                if (res.message) { _addMessage('ai', res.message); }
                if (window.ApiEngine && window.ApiEngine.open) {
                    // Fallback to open since openPanelWithData doesn't exist
                    window.ApiEngine.open(res.api_name);
                } else {
                    _addMessage('ai', 'Thiáº¿u hÃ m má»Ÿ Panel: ' + res.api_name);
                }
                return;
            }

            if (res && res.action_code === 'ASK_CLARIFICATION') {
                // Nháº­n dáº¡ng Ä‘Æ°á»£c cÃ¢u chat vu vÆ¡ ngoÃ i ngá»¯ cáº£nh SQL (vÃ­ dá»¥: Hello, khoáº» khÃ´ng)
                var lastUsrMsg = chatHistory.slice().reverse().find(function(m) { return m.role === 'user'; });
                _callCasualChatFallback(lastUsrMsg ? lastUsrMsg.content : '');
                return;
            }

            if (res && res.status === 'doc_search') {
                if (res.message) _addMessage('ai', res.message);
                var lastUserQ = chatHistory.slice().reverse().find(function(m) { return m.role === 'user'; });
                _doRAGSearch(lastUserQ ? lastUserQ.content : '');
                return;
            }

            if (res && res.status === 'success' && Array.isArray(res.data) && res.data.length > 0) {
                // 1. Lá»c data (áº©n cÃ¡c field hidden & loáº¡i dÃ²ng toÃ n null do SQL SUM tráº£ vá»)
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
                _addMessage('ai', 'Dáº¡, em Ä‘Ã£ tra cá»©u nhÆ°ng hiá»‡n táº¡i khÃ´ng cÃ³ dá»¯ liá»‡u nÃ o phÃ¹ há»£p vá»›i yÃªu cáº§u cá»§a anh/chá»‹ áº¡. ðŸ™‡â€â™€ï¸');
                return;
            }

            // 2. TÃ¬m MÃ£ Äá»‘i TÆ°á»£ng (Customer Code) tá»« metadata
            var idF = _pickField(res.intentParams || {}, 'ID');
            var khCode = idF ? idF.val : '';

            // 3. XÃ¡c Ä‘á»‹nh UI Template & Renderer
            var apiCode = (res.apiCode || '').toLowerCase();
            var uiTpl = (res.uiTemplate || ApiEngine.getUiTemplate(apiCode) || 'DEFAULT').toUpperCase();
            var renderFn = _UI_RENDERERS[uiTpl] || _UI_RENDERERS['DEFAULT'] || _renderCardView;
            // 4. Render â€” truyá»n meta Ä‘áº§y Ä‘á»§ (khCode cho CONG_NO/TICH_LUY, uiTemplate cho táº¥t cáº£)
            var renderMeta = { uiTemplate: uiTpl, fieldRoles: ApiEngine.getRoleMapping(), khCode: khCode };
            var cardHtml = renderFn(cleanData, res.message, khCode || apiCode, renderMeta);
            _addHtmlMessage(cardHtml, 'ðŸ“Š Káº¿t quáº£');
            return;
        }

        // -- Xá»­ lÃ½ Lá»—i --
        if (res && res.status === 'error') {
            var errorMsg = (res.message && res.message.length < 100) ? res.message : 'Dáº¡ há»‡ thá»‘ng Ä‘ang báº­n hoáº·c dá»¯ liá»‡u chÆ°a sáºµn sÃ ng áº¡.';
            _addMessage('ai', 'âŒ ' + errorMsg);
            return;
        }

            // -- CÃ¡c trÆ°á»ng há»£p tráº£ vá» Text (Fallbacks) --
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
                if (Object.keys(res).length === 0) reply = "KhÃ´ng cÃ³ thÃ´ng bÃ¡o lá»—i tá»« mÃ¡y chá»§. (Lá»—i 500)";
                else reply = res.message || res.msg || JSON.stringify(res);
            } else {
                reply = JSON.stringify(res);
            }
            
            if (reply === '[]' || reply === '{}') reply = 'Dáº¡, em khÃ´ng tÃ¬m tháº¥y káº¿t quáº£ nÃ o, danh sÃ¡ch hiá»‡n Ä‘ang trá»‘ng áº¡. ðŸ™‡â€â™€ï¸';

            _addMessage('ai', reply);
        } catch (err) {
            console.error(err);
            _addMessage('ai', 'âŒ Lá»—i hiá»ƒn thá»‹ dá»¯ liá»‡u: ' + err.message);
        }
    }

    function _getHiddenFields() {
        return ApiEngine.getFieldsByRole ? ApiEngine.getFieldsByRole('HIDDEN') : ['_debug_llm'];
    }

    /** Valiate sá»‘ Ä‘iá»‡n thoáº¡i VN Ä‘Æ¡n giáº£n â€” trÃ¡nh XSS qua href */
    function _isValidPhone(v) {
        return /^\+?[\d]{8,15}$/.test(String(v).replace(/[\s\-\.]/g, ''));
    }

    function _normalizePhone(v) {
        return String(v).replace(/[\s\-\.]/g, '');
    }

    // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
    //  FEATURE 1: QUICK ACTION BUTTONS
    // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•

    /** TÃ¬m phone vÃ  name tá»« 1 row JSON (DÃ¹ng Metadata SQL) */
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
            html += '<a class="ai-sales-action-btn ai-sales-btn-call" href="tel:' + _esc(c.phone) + '" aria-label="Gá»i Ä‘iá»‡n">ðŸ“ž Gá»i</a>';
            html += '<a class="ai-sales-action-btn ai-sales-btn-zalo" href="https://zalo.me/' + _esc(c.phone) + '" target="_blank" rel="noopener noreferrer" aria-label="Nháº¯n Zalo">ðŸ’¬ Zalo</a>';
        }
        if (c.name && !isFinanceContext) {
            html += '<button class="ai-sales-action-btn ai-sales-btn-order" data-action="len-don" data-name="' + _esc(c.name) + '" type="button" aria-label="LÃªn Ä‘Æ¡n hÃ ng">ðŸ›’ LÃªn Ä‘Æ¡n</button>';
        }
        html += '</div>';
        return html;
    }

    /** Äiá»n "LÃªn Ä‘Æ¡n cho [name]" vÃ o Ã´ input (KHÃ”NG tá»± gá»­i) */
    function _handleLenDon(name) {
        $input.value = 'LÃªn Ä‘Æ¡n cho ' + name;
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

        // --- Dá»± phÃ²ng nháº­n diá»‡n AI tá»± Ä‘á»™ng khi thiáº¿u Metadata tá»« Backend ---
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

        if (role === 'TITLE') {
            return findKey(['itemname', 'objectname', 'tendoitac', 'tenkhachhang', 'tencuahang', 'employeename', 'name', 'fullname', 'hoten', 'ten', 'title', 'tieu_de', 'diengiai', 'noidung', 'ghichu']);
        }
        if (role === 'ID') {
            return findKey(['itemid', 'objectid', 'employeeid', 'makhachhang', 'code', 'ma', 'id', 'docno', 'documentid', 'macode', 'mahd', 'khachhang', 'sanpham', 'nhanvien', 'khohang']);
        }
        if (role === 'BADGE') {
            return findKey(['phanloai', 'nhom', 'trangthai', 'status', 'loai', 'badge']);
        }
        if (role === 'MONEY') {
            return findKey(['doanhso', 'tongtien', 'tongno', 'doanhthu', 'tonkho', 'dongia', 'sotien', 'tien']);
        }
        if (role === 'TREND') {
            return findKey(['ngay', 'date', 'thoigian', 'trend', 'loinhacai', 'loinhac']);
        }
        if (role === 'COUNT') {
            return findKey(['tongsohoadon', 'sohd', 'soluong', 'count']);
        }
        if (role === 'PERCENT') {
            return findKey(['hoanthanh', 'tyle', 'percent', 'percentage']);
        }
        if (role === 'TARGET') {
            return findKey(['muctieu', 'target']);
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
        rows.forEach(function (r) {
            Object.keys(r).forEach(function (k) {
                if (keys.indexOf(k) === -1 && _getHiddenFields().indexOf(k) === -1) keys.push(k);
            });
        });
        return keys;
    }

    /**
     * Renderer Äá»˜NG 100%: Tá»± Ä‘á»™ng nháº­n diá»‡n Role tá»« Metadata
     * @param {Array}  rows      - máº£ng data tá»« API
     * @param {string} headerMsg - tiÃªu Ä‘á» káº¿t quáº£
     * @param {string} apiCode   - mÃ£ API (Ä‘Æ°á»£c dÃ¹ng bá»Ÿi sub-renderer khÃ¡c)
     * @param {Object} meta      - { uiTemplate, fieldRoles, khCode } tá»« ApiEngine
     */
    function _renderSingleGroup(rows, apiCode, meta) {
        var keys = _getKeys(rows);
        var html = '';

        var viewId = 'view-' + (++_modalIdCounter);
        html += '<div class="ai-inline-container" id="' + viewId + '">';
        html += '<div class="ai-view-cards">';
        html += '<div class="ai-card-list ' + (rows.length > 5 ? 'accordion' : '') + '">';

        var MAX_CARDS = 30;
        rows.forEach(function (row, idx) {
            if (idx === MAX_CARDS) {
                html += '</div>';
                html += '<details style="margin-top:10px;">';
                html += '<summary style="cursor:pointer; padding:10px; text-align:center; color:var(--color-primary); font-weight:bold; background:rgba(var(--color-primary-rgb), 0.1); border-radius:8px; margin-bottom:10px; list-style:none;">â¬ Xem thÃªm ' + (rows.length - MAX_CARDS) + ' tháº» ná»¯a (Tá»•ng ' + rows.length + ')</summary>';
                html += '<div class="ai-card-list ' + (rows.length > 5 ? 'accordion' : '') + '">';
            }
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
                html += '<div class="ai-card-title">Má»¥c ' + (idx + 1) + '</div>';
            }
            html += '<div class="ai-card-meta">';
            if (idF) html += '<span class="ai-card-id">' + _esc(String(idF.val)) + '</span>';
            if (badgeF) html += '<span class="ai-badge ' + _badgeClass(badgeF.val) + '">' + _esc(String(badgeF.val)) + '</span>';
            html += '</div>';
            html += '</div>'; // header

            html += '<div class="ai-card-body">';
            if (moneyF) {
                html += '<div class="ai-card-money">ðŸ’° ' + _esc(moneyF.key) + ': <strong>' + _fmtCellVal(moneyF.val) + '</strong></div>';
                usedKeys.push(moneyF.key);
            }
            if (trendF) {
                var tv = String(trendF.val);
                var trendCls = (tv.indexOf('-') !== -1 || tv.indexOf('giáº£m') !== -1) ? 'ai-trend-down' : 'ai-trend-up';
                html += '<div class="ai-card-trend ' + trendCls + '">ðŸ“ˆ ' + _esc(trendF.key) + ': ' + _esc(tv) + '</div>';
                usedKeys.push(trendF.key);
            }

            // Hiá»‡n cÃ¡c field cÃ²n láº¡i
            keys.forEach(function (k) {
                if (usedKeys.indexOf(k) !== -1) return;
                var val = row[k];
                if (val === null || val === undefined || String(val).trim() === '') return;
                html += '<div class="ai-card-row">';
                html += '<span class="ai-card-label">' + _esc(k) + '</span>';
                html += '<span class="ai-card-value">' + _esc(_fmtCellVal(val)) + '</span>';
                html += '</div>';
            });
            html += '</div>'; // body
            html += _buildActionBar(row, apiCode);
            html += '</div>'; // card
        });

        html += '</div>'; // card-list
        if (rows.length > MAX_CARDS) html += '</details>';
        html += '</div>'; // ai-view-cards

        // NÃºt toggle báº£ng
        var toggleText = 'ðŸ“Š Xem dáº¡ng báº£ng';
        html += '<button class="ai-table-btn ai-inline-toggle-btn" data-view-id="' + viewId + '" data-orig-text="' + _esc(toggleText) + '">' + toggleText + '</button>';
        html += '<div class="ai-view-table" style="display:none">';
        html += _buildInlineTable(rows, keys);
        html += '</div>';
        html += '</div>'; // ai-inline-container

        return html;
    }

    /**
     * Renderer Äá»˜NG 100%: Tá»± Ä‘á»™ng nháº­n dáº¡ng Tabs vÃ  Render danh sÃ¡ch
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

        // PhÃ¢n loáº¡i rows 100% Äá»˜NG
        rows.forEach(function (r) {
            var sig = '';
            var groupVal = '';

            if (useBadgeGrouping) {
                groupVal = String(r[badgeKey] || 'KhÃ¡c').trim();
                sig = 'GROUP|' + groupVal;
            } else {
                // Láº¥y danh sÃ¡ch keys há»£p lá»‡ lÃ m chá»¯ kÃ½ cáº¥u trÃºc
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

        // Chuyá»ƒn object sang array vÃ  táº¡o tá»± Ä‘á»™ng nhÃ£n (Label) cho Tab
        var activeGroups = Object.keys(groupsMap).map(function (k) { return groupsMap[k]; });

        // Sort activegroups if badge grouping is used
        if (useBadgeGrouping) {
            activeGroups.sort(function (a, b) {
                return String(a.groupVal).localeCompare(String(b.groupVal));
            });
        }

        activeGroups.forEach(function (g, idx) {
            if (useBadgeGrouping) {
                g.label = g.groupVal || 'ChÆ°a phÃ¢n loáº¡i';
            } else {
                var sampleRow = g.rows[0];
                var titleF = _pickField(sampleRow, 'TITLE');
                if (titleF && titleF.key) {
                    g.label = 'Theo ' + titleF.key;
                } else {
                    var lk = Object.keys(sampleRow).map(function (k) { return k.toLowerCase(); });
                    if (lk.indexOf('employeename') !== -1 || lk.indexOf('tennhanvien') !== -1) g.label = 'Theo NV';
                    else if (lk.indexOf('objectname') !== -1 || lk.indexOf('tenkhachhang') !== -1 || lk.indexOf('tencuahang') !== -1) g.label = 'Theo KhÃ¡ch';
                    else if (lk.indexOf('itemname') !== -1 || lk.indexOf('tensanpham') !== -1) g.label = 'Theo SP';
                    else if (lk.indexOf('tongtien') !== -1) g.label = 'Tá»•ng káº¿t';
                    else if (lk.indexOf('soluong') !== -1) g.label = 'Sá»‘ lÆ°á»£ng';
                    else if (lk.indexOf('docno') !== -1) g.label = 'Chá»©ng tá»«';
                    else g.label = 'NhÃ³m ' + (idx + 1);
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
                var icon = (idx === 0) ? 'ðŸ“Œ ' : 'ðŸ“‹ ';
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

    // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
    //  PROJECT-SPECIFIC RENDERERS
    //  CÃ¡c renderer kinh doanh riÃªng (CONG_NO, TICH_LUY...) Ä‘Ã£ Ä‘Æ°á»£c
    //  tÃ¡ch sang: chatbot-renderers-{project}.js
    //  ÄÄƒng kÃ½ qua: ApiChatbot.registerRenderer('KEY', function(...){})
    // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•

    // â”€â”€ [CATALOG] renderer â€” lÆ°á»›i tháº» cho danh má»¥c / sáº£n pháº©m â”€â”€â”€â”€
    function _renderCatalog(rows, headerMsg, apiCode, meta) {

        var keys = _getKeys(rows);
        var html = '';
        if (headerMsg) html += '<div class="ai-result-header">' + _esc(headerMsg) + '</div>';

        var viewId = 'view-' + (++_modalIdCounter);
        html += '<div class="ai-inline-container" id="' + viewId + '">';
        html += '<div class="ai-catalog-grid">';

        var MAX_CARDS = 30;

        // --- BÆ¯á»šC 1: GROUPING ---
        var groups = [];
        var groupMap = {};
        
        rows.forEach(function (row, idx) {
            var titleF = _pickField(row, 'TITLE');
            var idF = _pickField(row, 'ID');
            var tVal = titleF && titleF.val ? String(titleF.val).trim() : '';
            var idVal = idF && idF.val ? String(idF.val).trim() : '';
            var gKey = tVal + '::' + idVal;
            // Náº¿u khÃ´ng cÃ³ cáº£ title vÃ  id, fallback khÃ´ng gom nhÃ³m
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

        // TÃ¬m cÃ¡c key chung vÃ  key biáº¿n Ä‘á»•i cho tá»«ng nhÃ³m
        groups.forEach(function(g) {
            g.commonKeys = [];
            g.varyingKeys = [];
            keys.forEach(function(k) {
                var firstVal = g.rows[0][k];
                var isVarying = g.rows.some(function(r) { return r[k] !== firstVal; });
                if (isVarying) g.varyingKeys.push(k);
                else g.commonKeys.push(k);
            });
        });

        // --- BÆ¯á»šC 2: RENDER CÃC NHÃ“M ---
        groups.forEach(function (grp, idx) {
            if (idx === MAX_CARDS) {
                html += '</div>';
                html += '<details style="margin-top:10px;">';
                html += '<summary style="cursor:pointer; padding:10px; text-align:center; color:var(--color-primary); font-weight:bold; background:rgba(var(--color-primary-rgb), 0.1); border-radius:8px; margin-bottom:10px; list-style:none;">â¬ Xem thÃªm ' + (groups.length - MAX_CARDS) + ' tháº» ná»¯a (Tá»•ng ' + groups.length + ')</summary>';
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
                html += '<div class="ai-catalog-card-name">Má»¥c ' + (idx + 1) + '</div>';
            }
            if (idF) html += '<div class="ai-catalog-card-id">' + _esc(String(idF.val)) + '</div>';
            html += '</div>'; // info
            if (badgeF) {
                html += '<span class="ai-badge ' + _badgeClass(badgeF.val) + '">' + _esc(String(badgeF.val)) + '</span>';
            }
            html += '</div>'; // top

            // Body â€” CÃ¡c fields CÃ“ CÃ™NG GIÃ TRá»Š (commonKeys)
            html += '<div class="ai-catalog-card-body">';
            if (moneyF && grp.commonKeys.indexOf(moneyF.key) !== -1) {
                html += '<div class="ai-catalog-money">ðŸ’° ' + _esc(_fmtCellVal(moneyF.val)) + '</div>';
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
                html += '<summary class="ai-catalog-summary">â¬ Hiá»ƒn thá»‹ ' + grp.rows.length + ' phÃ¢n loáº¡i (Kho/LÃ´...)</summary>';
                html += '<div class="ai-catalog-details-content">';
                
                var storehouseKeys = grp.varyingKeys.filter(function(k) { return /storehouse|kho$|makho/i.test(k); });
                
                if (storehouseKeys.length > 0) {
                     var shKey = storehouseKeys[0];
                     var shGroups = {};
                     grp.rows.forEach(function(r) {
                         var shVal = String(r[shKey] || 'KhÃ¡c');
                         if (!shGroups[shVal]) shGroups[shVal] = [];
                         shGroups[shVal].push(r);
                     });
                     
                     Object.keys(shGroups).forEach(function(shVal) {
                         html += '<div class="ai-catalog-subgroup-title">ðŸ“ Kho: <strong>' + _esc(shVal) + '</strong> (' + shGroups[shVal].length + ' má»¥c)</div>';
                         shGroups[shVal].forEach(function(r, sIdx) {
                              html += '<div class="ai-catalog-subgroup-item">';
                              grp.varyingKeys.forEach(function(k) {
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
                     grp.rows.forEach(function(r, sIdx) {
                          html += '<div class="ai-catalog-subgroup-item">';
                          html += '<div class="ai-catalog-subgroup-title">Má»¥c ' + (sIdx+1) + '</div>';
                          grp.varyingKeys.forEach(function(k) {
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

            // Action bar (gá»i / zalo) - use first row for triggers
            html += _buildActionBar(grp.rows[0], apiCode);
            html += '</div>'; // catalog-card
        });

        html += '</div>'; // catalog-grid
        if (groups.length > MAX_CARDS) html += '</details>';

        // Toggle sang báº£ng
        var toggleText = 'ðŸ“Š Xem dáº¡ng báº£ng';
        html += '<button class="ai-table-btn ai-inline-toggle-btn" data-view-id="' + viewId + '" data-orig-text="' + _esc(toggleText) + '">' + toggleText + '</button>';
        html += '<div class="ai-view-table" style="display:none">';
        html += _buildInlineTable(rows, keys);
        html += '</div>';
        html += '</div>'; // ai-inline-container

        return html;
    }

    // â”€â”€ Registry Registration â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    // CORE renderers â€” hoáº¡t Ä‘á»™ng cho má»i project
    _UI_RENDERERS['DEFAULT'] = _renderCardView;
    _UI_RENDERERS['CATALOG'] = _renderCatalog;

    // â”€â”€ Inline Toggle & Modal table helpers â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

    /**
     * Build full inline table HTML (filter bar + table)
     * rows/keys Ä‘Æ°á»£c attach lÃªn DOM element sau khi insert qua __rows/__keys
     * Ä‘á»ƒ filter events cÃ³ thá»ƒ dÃ¹ng láº¡i mÃ  khÃ´ng cáº§n cache global
     */
    function _buildInlineTable(rows, keys) {
        var tbodyId = 'ai-inline-tbody-v' + _modalIdCounter;
        var html = '';

        // â”€â”€ PhÃ¡t hiá»‡n field phÃ¢n loáº¡i (badge) Ä‘á»ƒ táº¡o filter chip Ä‘á»™ng â”€â”€
        var badgeKeyFound = null;
        var badgeValues = {};
        for (var bi = 0; bi < 'BADGE'.length; bi++) {
            var bk = 'BADGE'[bi];
            if (keys.indexOf(bk) !== -1) {
                // Äáº¿m distinct values
                rows.forEach(function (r) {
                    var v = String(r[bk] || '').trim();
                    if (v) badgeValues[v] = (badgeValues[v] || 0) + 1;
                });
                // Chá»‰ dÃ¹ng náº¿u cÃ³ â‰¥ 2 giÃ¡ trá»‹ khÃ¡c nhau vÃ  â‰¤ 6 loáº¡i (Ä‘á»ƒ chip khÃ´ng quÃ¡ nhiá»u)
                var bvKeys = Object.keys(badgeValues);
                if (bvKeys.length >= 2 && bvKeys.length <= 6) {
                    badgeKeyFound = bk;
                    break;
                }
                badgeValues = {}; // reset náº¿u khÃ´ng phÃ¹ há»£p
            }
        }

        // â”€â”€ Filter toolbar â”€â”€
        var chipsHtml = '<button class="ai-sales-filter-chip active" data-filter="all" type="button">Táº¥t cáº£</button>';
        if (badgeKeyFound) {
            // Render chip cho tá»«ng giÃ¡ trá»‹ phÃ¢n loáº¡i thá»±c táº¿ trong data
            Object.keys(badgeValues).sort().forEach(function (v) {
                var icon = (v === 'A' || v.toUpperCase() === 'VIP') ? 'â­ ' :
                    (v === 'B') ? 'ðŸ”µ ' :
                        (v === 'C') ? 'ðŸ”´ ' : '';
                chipsHtml += '<button class="ai-sales-filter-chip" data-filter="badge:' + _esc(v) + '" data-badge-key="' + _esc(badgeKeyFound) + '" type="button">' + icon + _esc(v) + ' (' + badgeValues[v] + ')</button>';
            });
        }
        chipsHtml += '<span class="ai-sales-filter-count">' + rows.length + ' dÃ²ng</span>';

        html += '<div class="ai-sales-filter-bar ai-inline-filter">'
            + '<input class="ai-sales-filter-input" type="search" placeholder="ðŸ” TÃ¬m nhanh trong káº¿t quáº£..." autocomplete="off" />'
            + '<div class="ai-sales-filter-chips">' + chipsHtml + '</div>'
            + '</div>';

        // â”€â”€ Table â”€â”€
        html += '<div class="ai-inline-table-wrap">';
        html += '<table class="ai-table"><thead><tr>';
        keys.forEach(function (k) { html += '<th>' + _esc(k) + '</th>'; });
        html += '</tr></thead>';
        html += '<tbody id="' + tbodyId + '">' + _renderTableBody(rows, keys) + '</tbody>';
        html += '</table></div>';

        // LÆ°u data vÃ o cache Ä‘á»ƒ filter handler dÃ¹ng
        _modalDataCache[tbodyId] = { rows: rows, keys: keys, badgeKey: badgeKeyFound };

        return html;
    }


    /** Render chá»‰ pháº§n <tbody> (tÃ¡ch riÃªng Ä‘á»ƒ re-render khi filter) */

    function _renderTableBody(filteredRows, keys) {
        var MAX = 50;
        var shown = Math.min(filteredRows.length, MAX);
        var html = '';
        for (var i = 0; i < shown; i++) {
            html += '<tr>';
            keys.forEach(function (k) { html += '<td>' + _esc(_fmtCellVal(filteredRows[i][k])) + '</td>'; });
            html += '</tr>';
        }
        if (filteredRows.length > MAX) {
            html += '<tr><td colspan="' + keys.length + '" style="text-align:center;opacity:0.6;font-style:italic">... vÃ  ' + (filteredRows.length - MAX) + ' dÃ²ng khÃ¡c</td></tr>';
        }
        return html;
    }

    /** Lá»c rows theo search text + filter key (client-side) */
    function _applyModalFilter(allRows, keys, searchText, filterKey, badgeKey) {
        var filtered = allRows;
        // Filter chip: badge:VALUE (vÃ­ dá»¥ badge:A, badge:VIP)
        if (filterKey && filterKey.indexOf('badge:') === 0) {
            var targetVal = filterKey.substring(6); // láº¥y pháº§n sau "badge:"
            filtered = filtered.filter(function (r) {
                // Náº¿u biáº¿t cá»¥ thá»ƒ field nÃ o (badgeKey) â†’ chá»‰ lá»c field Ä‘Ã³
                if (badgeKey) {
                    return String(r[badgeKey] || '').trim() === targetVal;
                }
                // Fallback: tÃ¬m trong táº¥t cáº£ keys
                return keys.some(function (k) {
                    return String(r[k] || '').trim() === targetVal;
                });
            });
        }
        // Search text: khá»›p báº¥t ká»³ field nÃ o (case-insensitive, bá» dáº¥u)

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

    // â”€â”€ Click delegation cho accordion + modal + action bar â”€â”€â”€â”€â”€â”€â”€â”€
    $messages.addEventListener('click', function (e) {
        // Accordion expand
        var expandBtn = e.target.closest('.ai-card-expand-btn');
        if (expandBtn) {
            var card = expandBtn.closest('.ai-card');
            if (card) {
                var detail = card.querySelector('.ai-card-detail');
                if (detail) {
                    var isOpen = !detail.hidden;
                    detail.hidden = isOpen;
                    expandBtn.textContent = isOpen ? 'â–¾' : 'â–´';
                    card.classList.toggle('expanded', !isOpen);
                }
            }
            return;
        }
        // Inline toggle (thay tháº¿ modal)
        var tableBtn = e.target.closest('.ai-inline-toggle-btn');
        if (tableBtn) {
            var vid = tableBtn.getAttribute('data-view-id');
            var container = document.getElementById(vid);
            if (!container) return;
            var cardView = container.querySelector('.ai-view-cards');
            var tableView = container.querySelector('.ai-view-table');
            var isShowingTable = tableView && tableView.style.display !== 'none';

            if (isShowingTable) {
                // â”€â”€ Quay láº¡i Card view â”€â”€
                if (cardView) cardView.style.display = '';
                if (tableView) tableView.style.display = 'none';
                // Restore text gá»‘c tá»« data attribute (trÃ¡nh encoding mismatch)
                var origText = tableBtn.getAttribute('data-orig-text') || 'ðŸ“Š Xem dáº¡ng báº£ng';
                tableBtn.textContent = origText;
            } else {
                // â”€â”€ Chuyá»ƒn sang Table view â”€â”€
                if (cardView) cardView.style.display = 'none';
                tableBtn.textContent = 'ðŸŽ¨ Xem dáº¡ng tháº»';

                if (tableView) {
                    tableView.style.display = 'block';
                    tableView.style.animation = 'ai-inline-fadein 0.25s ease';

                    // Bind filter events (chá»‰ 1 láº§n, bá»c try-catch Ä‘á»ƒ khÃ´ng block display)
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
                                    if (countEl2) countEl2.textContent = filtered.length + ' dÃ²ng';
                                };
                                if (searchEl2) {
                                    var _t2 = null;
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
                            // Filter binding failed nhÆ°ng table váº«n hiá»‡n Ä‘Æ°á»£c â€” khÃ´ng sao
                            console.warn('[Chatbot] Filter binding error:', filterErr);
                        }
                    }
                }
            }
            return;
        }
        // â”€â”€ Feature 1: LÃªn Ä‘Æ¡n button â”€â”€
        var lenDonBtn = e.target.closest('[data-action="len-don"]');
        if (lenDonBtn) {
            var name = lenDonBtn.getAttribute('data-name') || '';
            if (name) _handleLenDon(name);
            return;
        }
    });



    function _handleError(err) {
        // Náº¿u bá»‹ abort (user báº¥m dá»«ng) â†’ khÃ´ng hiá»‡n lá»—i
        if (err && err.name === 'AbortError') return;
        _hideTyping();
        _setStopMode(false);
        _addMessage('ai', 'Xin lá»—i, tÃ´i khÃ´ng thá»ƒ pháº£n há»“i lÃºc nÃ y. Vui lÃ²ng thá»­ láº¡i sau.');
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
                    var msg = 'Tham sá»‘ cho ' + apiCode + ':\n';
                    fields.forEach(function (f) {
                        var code = f.FieldCode || f.field || f.name || '';
                        var name = f.FieldName || f.placeholder || f.placeholderText || '';
                        var req = f.IsRequired || f.required ? ' (báº¯t buá»™c)' : '';
                        msg += '- ' + code + req + (name ? ' â€” ' + name : '') + '\n';
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

    // â”€â”€ Auto-resize textarea â”€â”€
    function _autoResize() {
        $input.style.height = 'auto';
        $input.style.height = Math.min($input.scrollHeight, 120) + 'px';
        _scrollBottom();
    }

    // â”€â”€ Keyboard / Focus handling â”€â”€
    // interactive-widget=resizes-content Ä‘Ã£ tá»± thu viewport khi keyboard má»Ÿ
    // â†’ chá»‰ cáº§n scroll xuá»‘ng cuá»‘i, KHÃ”NG Ä‘áº©y input bar thá»§ cÃ´ng
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
        // Cuá»™n xuá»‘ng cuá»‘i â€” Ä‘á»£i keyboard má»Ÿ xong
        setTimeout(_scrollBottom, 400);
        setTimeout(_scrollBottom, 800);
    });

    // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
    //  @MENTION AUTOCOMPLETE
    // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•

    // Khá»Ÿi táº¡o máº·c Ä‘á»‹nh ngay â€” Ä‘áº£m báº£o @mention luÃ´n hoáº¡t Ä‘á»™ng
    // Khá»Ÿi táº¡o máº·c Ä‘á»‹nh rá»—ng â€” hoÃ n toÃ n phá»¥ thuá»™c vÃ o API
    var MENTION_TRIGGERS = {};
    var mentionKeysPattern = null;
    var MENTION_CACHE_KEY = 'mention_categories';
    var MENTION_CACHE_TTL = 24 * 60 * 60 * 1000; // 24 giá»

    /** Apply categories vÃ o MENTION_TRIGGERS + build regex */
    function _mentionApplyCategories(records) {
        MENTION_TRIGGERS = {};
        records.forEach(function (r) {
            var key = r.type || r.MaDanhMuc || '';
            if (key) {
                MENTION_TRIGGERS[key] = {
                    type: key,
                    label: r.label || r.TenDanhMuc || key,
                    icon: r.icon || r.Icon || 'ðŸ“'
                };
            }
        });
        var keys = Object.keys(MENTION_TRIGGERS);
        if (keys.length) {
            mentionKeysPattern = new RegExp('@(' + keys.join('|') + ')(\\s(.*))?$', 'i');
        }
    }

    /** Load categories â€” Æ°u tiÃªn cache, fetch API náº¿u háº¿t háº¡n */
    function _mentionLoadCategories() {
        // 1. Äá»c cache trÆ°á»›c
        try {
            var cached = JSON.parse(localStorage.getItem(MENTION_CACHE_KEY));
            if (cached && cached.data && (Date.now() - cached.timestamp < MENTION_CACHE_TTL)) {
                _mentionApplyCategories(cached.data);
                return; // cache cÃ²n háº¡n â†’ khÃ´ng cáº§n gá»i API
            }
        } catch (e) { /* cache lá»—i â†’ bá» qua, fetch API */ }

        // 2. Fetch tá»« API
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

                // LÆ°u cache
                try {
                    localStorage.setItem(MENTION_CACHE_KEY, JSON.stringify({
                        data: records,
                        timestamp: Date.now()
                    }));
                } catch (e) { /* localStorage Ä‘áº§y â†’ bá» qua */ }
            })
            .catch(function () {
                // Fallback náº¿u API lá»—i vÃ  chÆ°a cÃ³ data tá»« cache
                if (Object.keys(MENTION_TRIGGERS).length === 0) {
                    _mentionApplyCategories([
                        { type: 'sanpham', label: 'Sáº£n pháº©m', icon: 'ðŸ’Š' },
                        { type: 'khachhang', label: 'KhÃ¡ch hÃ ng', icon: 'ðŸ‘¤' },
                        { type: 'donhang', label: 'ÄÆ¡n hÃ ng', icon: 'ðŸ“‹' },
                        { type: 'khohang', label: 'Kho hÃ ng', icon: 'ðŸ­' },
                        { type: 'nhanvien', label: 'NhÃ¢n viÃªn', icon: 'ðŸ‘¨â€ðŸ’¼' }
                    ]);
                }
            });
    }
    var MENTION_DEBOUNCE = 300;
    var MENTION_MAX_ITEMS = 8;

    var mentionState = {
        active: false,       // Ä‘ang hiá»ƒn thá»‹ dropdown
        triggerKey: '',       // 'sanpham' | 'khachhang' | 'donhang'
        triggerStart: -1,     // vá»‹ trÃ­ @ trong textarea
        searchText: '',       // text sau @trigger
        items: [],            // káº¿t quáº£ API
        selectedIndex: -1,    // keyboard nav index
        loading: false
    };
    var mentionTimer = null;
    var $mentionDropdown = null;

    function _mentionCreate() {
        // ApiEngine thay tháº¿ toÃ n bá»™ @ system â†’ khÃ´ng cáº§n mention dropdown
        if (window.ApiEngine) return;

        if ($mentionDropdown) return;
        $mentionDropdown = document.createElement('div');
        $mentionDropdown.className = 'mention-dropdown';
        $mentionDropdown.style.display = 'none';

        // â”€â”€ JS touch scroll (Android/iOS Ä‘á»u hoáº¡t Ä‘á»™ng) â”€â”€
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

        // Desktop: giá»¯ focus trÃªn textarea
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
            // Giá»›i háº¡n max-height theo khÃ´ng gian cÃ²n láº¡i (trá»« 60px cho thanh tráº¡ng thÃ¡i)
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

    /** Parse textarea text â†’ tÃ¬m @trigger pattern HOáº¶C @ chÆ°a hoÃ n táº¥t */
    function _mentionParse() {
        var text = $input.value;
        var cursor = $input.selectionStart;
        var before = text.substring(0, cursor);

        // Phase 2: Ä‘Ã£ gÃµ Ä‘áº§y Ä‘á»§ @trigger (+ optional search text)
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

        // Phase 1: má»›i gÃµ @ (+ optional partial text Ä‘á»ƒ lá»c category)
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

    /** Hiá»ƒn thá»‹ danh sÃ¡ch category gá»£i Ã½ khi gÃµ @ */
    function _mentionShowCategories(partialText) {
        var keys = Object.keys(MENTION_TRIGGERS);
        // Lá»c theo partial text (náº¿u cÃ³)
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

        var html = '<div class="mention-header">ðŸ“Œ Chá»n danh má»¥c</div>';
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

    /** ChÃ¨n @trigger vÃ o textarea khi chá»n category */
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

        // Trigger fetch ngay sau khi chá»n category
        mentionState.triggerKey = key;
        mentionState.triggerStart = before.length;
        mentionState.searchText = '';
        mentionState.selectedIndex = -1;
        _mentionFetch(key, '');
    }

    /** Gá»i API_DanhMuc_AI â€” dÃ¹ng fetch trá»±c tiáº¿p, khÃ´ng hiá»‡n global spinner */
    function _mentionFetch(type, searchText) {
        mentionState.loading = true;
        var trigger = MENTION_TRIGGERS[type];
        _mentionShow(
            '<div class="mention-header">' + trigger.icon + ' ' + trigger.label + '</div>'
            + '<div class="mention-loading">Äang táº£i...</div>'
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
                    + '<div class="mention-empty">Lá»—i táº£i dá»¯ liá»‡u</div>'
                );
            });
    }

    /** Render danh sÃ¡ch káº¿t quáº£ */
    function _mentionRender(type) {
        var trigger = MENTION_TRIGGERS[type];
        var items = mentionState.items;

        if (!items.length) {
            _mentionShow(
                '<div class="mention-header">' + trigger.icon + ' ' + trigger.label + '</div>'
                + '<div class="mention-empty">KhÃ´ng tÃ¬m tháº¥y</div>'
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
                    + Number(item.UnitPrice).toLocaleString('vi-VN') + 'Ä‘</span>';
            }
            if (item.BaseTotal !== undefined) {
                rightHtml += '<span class="mention-item-price">'
                    + Number(item.BaseTotal).toLocaleString('vi-VN') + 'Ä‘</span>';
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

    /** ChÃ¨n káº¿t quáº£ vÃ o textarea */
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
        // Scroll vÃ o view
        if (items[idx]) items[idx].scrollIntoView({ block: 'nearest' });
    }

    /** Input handler â€” detect @mention */
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
            // Phase 1: hiá»‡n danh sÃ¡ch category gá»£i Ã½
            _mentionShowCategories(parsed.partialText);
            return;
        }

        // Phase 2: Ä‘Ã£ chá»n category â†’ fetch dá»¯ liá»‡u
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
                // Kiá»ƒm tra phase: náº¿u items lÃ  string (category key) thÃ¬ chá»n category
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

    // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
    //  INLINE GHOST TEXT (Tab autocomplete)
    // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•

    var ghostText = '';
    var ghostFull = '';
    var $ghost = null;
    var ghostExternalActive = false; // when set by external helper (API hints)

    function _ghostCreate() {
        $ghost = document.createElement('div');
        $ghost.className = 'chat-ghost-text';
        $ghost.setAttribute('aria-hidden', 'true');
        // Bá»c textarea trong wrapper riÃªng Ä‘á»ƒ ghost cÄƒn Ä‘Ãºng vá»‹ trÃ­
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

        // 2. Náº¿u khÃ´ng tÃ¬m tháº¥y â†’ tÃ¬m trong user phrases cache
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
        // Hiá»‡n: pháº§n user gÃµ (áº©n hoÃ n toÃ n) + pháº§n gá»£i Ã½ (má» xÃ¡m)
        // Äá»“ng bá»™ cuá»™n tuyá»‡t Ä‘á»‘i báº±ng cÃ¡ch gÃ¡n scrollTop/scrollLeft
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



    // â”€â”€ Events â”€â”€
    $input.addEventListener('input', function () {
        _autoResize();
        _updateSendBtn();
        // _mentionOnInput();
        _ghostUpdate();
    });

    $input.addEventListener('keydown', function (e) {
        // if (_mentionOnKeydown(e)) return;

        // Tab â†’ accept ghost text
        if (e.key === 'Tab' && ghostText) {
            e.preventDefault();
            _ghostAccept();
            return;
        }

        // Escape â†’ clear ghost
        if (e.key === 'Escape' && ghostText) {
            _ghostClear();
        }

        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            _ghostClear();
            if ($input.value.trim() || selectedFiles.length > 0) _send();
        }
    });

    // â”€â”€ Double-tap trÃªn mobile â†’ accept ghost text (giá»‘ng Tab trÃªn PC) â”€â”€
    var _lastTapTime = 0;
    $input.addEventListener('touchend', function (e) {
        if (!ghostText) return; // KhÃ´ng cÃ³ ghost â†’ bá» qua
        var now = Date.now();
        var gap = now - _lastTapTime;
        _lastTapTime = now;
        if (gap < 300 && gap > 30) {
            // Double-tap detected!
            e.preventDefault();
            _ghostAccept();
        }
    }, { passive: false });

    // â”€â”€ Double-click trÃªn Desktop â†’ accept ghost text â”€â”€
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

    // â”€â”€ Suggestion chips (welcome screen) â”€â”€
    document.querySelectorAll('.chat-chip').forEach(function (chip) {
        chip.addEventListener('click', function () {
            var msg = chip.getAttribute('data-msg');
            if (msg) {
                $input.value = msg;
                _send();
            }
        });
    });

    // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
    //  FEATURE 3: SUGGESTION CHIPS BAR (trÃªn input)
    // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•

    var _chipsBar = null;

    function _initSuggestionBar() {
        var suggestions = window.CHAT_SUGGESTIONS;
        if (!suggestions || !suggestions.length) return;

        // XÃ¢y dá»±ng cáº¥u trÃºc danh má»¥c
        var categories = {};
        suggestions.forEach(function (s) {
            var cat = s.category || 'KhÃ¡c';
            if (!categories[cat]) categories[cat] = [];
            categories[cat].push(s);
        });

        var catNames = Object.keys(categories);
        // Äáº©y tab "HÆ°á»›ng dáº«n" xuá»‘ng cuá»‘i cÃ¹ng
        var idxHd = catNames.indexOf('HÆ°á»›ng dáº«n');
        if (idxHd > -1) {
            catNames.splice(idxHd, 1);
            catNames.push('HÆ°á»›ng dáº«n');
        }

        // Load tab dÃ£ lÆ°u tá»« localStorage hoáº·c máº·c Ä‘á»‹nh tab Má»Ÿ Ä‘áº§u
        var lastCat = localStorage.getItem('ai_sales_last_tab');
        if (!lastCat || catNames.indexOf(lastCat) === -1) {
            lastCat = catNames[0];
        }

        _chipsBar = document.createElement('div');
        _chipsBar.className = 'ai-sales-chips-bar';
        _chipsBar.id = 'ai-sales-chips';

        // 1. Táº§ng Tab (Categories)
        var tabBar = document.createElement('div');
        tabBar.className = 'ai-sales-chips-tabs ai-sales-chips-scroll';
        _chipsBar.appendChild(tabBar);

        // 2. Táº§ng Data (Chips)
        var scroll = document.createElement('div');
        scroll.className = 'ai-sales-chips-list ai-sales-chips-scroll';
        _chipsBar.appendChild(scroll);

        // HÃ m render Chips cho 1 Category
        function renderChips(catName) {
            scroll.innerHTML = ''; // reset
            var items = categories[catName] || [];

            // Map mÃ u sáº¯c Vibrant cho tá»«ng Tab
            var colorClass = '';
            if (catName === 'PhÃ¢n tÃ­ch') colorClass = 'chip-vibrant-analytics';
            else if (catName === 'CÃ´ng ná»£') colorClass = 'chip-vibrant-debt';
            else if (catName === 'Kho hÃ ng') colorClass = 'chip-vibrant-inventory';
            else if (catName === 'ÄÆ¡n hÃ ng') colorClass = 'chip-vibrant-orders';
            else if (catName === 'Tra cá»©u') colorClass = 'chip-vibrant-search';

            items.forEach(function (s) {
                var btn = document.createElement('button');
                btn.type = 'button';
                btn.className = 'ai-sales-chip ' + colorClass;
                // Hiá»ƒn thá»‹ ná»™i dung cá»±c ngáº¯n Ä‘Ã£ Ä‘Æ°á»£c tá»‘i Æ°u
                btn.textContent = (s.icon ? s.icon + ' ' : '') + (s.label || s.text);
                btn.addEventListener('click', function () {
                    $input.value = s.text; // Text Ä‘áº§y Ä‘á»§ Ä‘á»ƒ AI hiá»ƒu
                    _autoResize();
                    _updateSendBtn();
                    _send();
                });
                scroll.appendChild(btn);
            });
        }

        // HÃ m render UI Tabs
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
                    renderTabs(); // Cáº­p nháº­t class active
                    renderChips(c);
                });
                tabBar.appendChild(tBtn);
            });
        }

        renderTabs();
        renderChips(lastCat);

        // Inject vÃ o trong #chat-input-bar (á»Ÿ vá»‹ trÃ­ trÃªn cÃ¹ng)
        var $inputBar = document.getElementById('chat-input-bar');
        if ($inputBar) {
            $inputBar.insertBefore(_chipsBar, $inputBar.firstChild);
        }

        // áº¨n chips náº¿u Ä‘Ã£ cÃ³ lá»‹ch sá»­ chat (tá»‘i Æ°u UI)
        _updateChipsVisibility();
    }

    function _updateChipsVisibility() {
        if (!_chipsBar) return;
        // áº¨n khi Ä‘ang cÃ³ tin nháº¯n (history > 0)
        _chipsBar.style.display = (chatHistory.length > 0) ? 'none' : '';
    }

    // â”€â”€ Init â”€â”€
    _ghostCreate();
    _renderHistory();
    // _initSuggestionBar(); // ÄÃ£ áº©n thanh gá»£i Ã½ the user

    // â”€â”€ API Engine (@api_code menu + DataSource fields) â”€â”€
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
    // Mobile: áº©n navbar khi bÃ n phÃ­m áº£o má»Ÿ (giá»¯ nguyÃªn layout input bar)
    var $nav = document.querySelector('.app-nav');
    var $inputBar = document.getElementById('chat-input-bar');

    $input.addEventListener('focus', function () {
        if (window.innerWidth <= 768 && $nav) {
            $nav.style.display = 'none';
            $inputBar.style.bottom = '0';
        }
    });

    $input.addEventListener('blur', function () {
        // Náº¿u Panel Ä‘ang má»Ÿ, khÃ´ng hiá»‡n láº¡i navbar Ä‘á»ƒ trÃ¡nh Ä‘Ã¨ giao diá»‡n
        if (document.body.classList.contains('ae-panel-open')) {
            return;
        }
        // Delay Ä‘á»ƒ button click (gá»­i, Ä‘Ã­nh kÃ¨m, API) ká»‹p xá»­ lÃ½
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

    // â”€â”€ Public API â€” dÃ¹ng cho project-specific renderers vÃ  debug â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    // Náº¡p file renderer riÃªng SAU khi chatbot.js load:
    //   <script src="chatbot-renderers-myproject.js"></script>
    // Rá»“i gá»i:
    //   ApiChatbot.registerRenderer('MY_TEMPLATE', function(rows, msg, apiCode, meta) { ... })
    window.ApiChatbot = {
        registerRenderer: function (key, fn) {
            if (typeof fn !== 'function') { console.warn('[ApiChatbot] registerRenderer: fn pháº£i lÃ  function'); return; }
            _UI_RENDERERS[String(key).toUpperCase()] = fn;
        },
        // Helpers dÃ¹ng cho renderer bÃªn ngoÃ i
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

