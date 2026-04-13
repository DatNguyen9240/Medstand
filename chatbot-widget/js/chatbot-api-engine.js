/**
 * chatbot-api-engine.js  v3
 * ─────────────────────────────────────────────────────────────────────
 * DataSource-driven field rendering
 *
 * ControlType:
 *   combobox  → searchable dropdown, data từ DataSource
 *   select    → dropdown từ DataSource=STATIC
 *   date      → date picker
 *   number    → number input
 *   text      → text input
 *   textarea  → multiline
 *
 * DataSourceType:
 *   STATIC  → DataSourceValue = JSON string [{value, label}]
 *   SQL     → DataSourceValue = SP_Name → gọi /api-datasource
 *   APICODE → DataSourceValue = "@apicode|@Param=val|..." → gọi EXEC_URL
 *
 * UX Flow:
 *  1. "@" → API dropdown (API_ListActive)
 *  2. Chọn API → "#tag" trong input, filter panel trượt lên
 *  3. Điền filter (combobox live-search, date, v.v.)
 *  4. Nhấn Gửi → ApiEngine.handleSend() intercept → execute
 * ─────────────────────────────────────────────────────────────────────
 */
(function () {
    'use strict';

    // ── Config ────────────────────────────────────────────────────────
    // Tất cả URL/keys đọc từ api.config.js (API_CONFIG) — KHÔNG hardcode ở đây
    // Cấu trúc API_CONFIG tối thiểu:
    // {
    //   N8N_BASE: 'https://your-n8n-host.com',          // bắt buộc
    //   CHAT_WEBHOOK: '/webhook/hook-ai-dainao',         // bắt buộc
    //   CHAT_API_KEY: 'your-key',                        // bắt buộc
    //   CATALOG_ROOT_API: '@danh_muc',                   // tuỳ project
    //   CART_CUSTOMER_DS: '@danh_muc|@Type=kh|...',      // tuỳ project
    // }
    if (typeof API_CONFIG === 'undefined' || !API_CONFIG.N8N_BASE) {
        console.error('[ApiEngine] API_CONFIG.N8N_BASE chưa được cấu hình. Widget sẽ không hoạt động.');
    }
    var _n8n = (typeof API_CONFIG !== 'undefined' && API_CONFIG.N8N_BASE) ? API_CONFIG.N8N_BASE : '';

    var CFG = {
        LIST_URL: _n8n + '/webhook/api-list-active',
        CFG_URL: _n8n + '/webhook/api-get-config',
        EXEC_URL: _n8n + '/webhook/api-execute',
        DS_URL: _n8n + '/webhook/api-datasource',
        META_URL: _n8n + '/webhook/api-get-system-meta',
        CACHE_TTL: 10 * 60 * 1000,
        CACHE_KEY: 'api_engine_v3_list',

        // --- Có thể override từ API_CONFIG ---
        CATALOG_ROOT_API: (typeof API_CONFIG !== 'undefined' && API_CONFIG.CATALOG_ROOT_API) || '',
        CART_CUSTOMER_DS: (typeof API_CONFIG !== 'undefined' && API_CONFIG.CART_CUSTOMER_DS) || '',

        // --- Tham số hệ thống mặc định ---
        SYS_PARAMS: {
            USERNAME: (typeof API_CONFIG !== 'undefined' && API_CONFIG.SYS_PARAM_USERNAME) || '@Username'
        }
    };

    // ── Internal State ────────────────────────────────────────────────
    var _inputEl, _inputBarEl, _panelEl, _menuEl;
    var _apiList = [], _cfgCache = {}, _sysMeta = {};
    var _activeApi = null, _lastCatalogType = null;
    var _pillParams = {}, _cartItems = [];
    var _menuVis = false, _menuIdx = -1;
    var _dbt = null, _hideTimer = null, _registerCleanupQueue = [];
    var _cbMsg, _cbHtml, _cbRender, _cbShow, _cbHide, _cbGetToken;
    var _suppressMenuUntil = 0, _suppressNextAt = false;
    var _catalogDsMap = {}; // mapping type -> datasource string
    var _prevPlaceholder = '';

    // ── Networking Helpers ────────────────────────────────────────────
    function _post(url, data) {
        var key = (typeof API_CONFIG !== 'undefined') ? API_CONFIG.CHAT_API_KEY : '';
        var token = typeof _cbGetToken === 'function' ? _cbGetToken() : '';
        return fetch(url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'x-api-key': key,
                'Authorization': 'Bearer ' + token
            },
            body: JSON.stringify(data || {})
        }).then(function (res) {
            return res.text().then(function(text) {
                if (!res.ok) throw new Error('Network error: ' + res.status + ' | ' + text.substring(0, 50));
                if (!text) return {}; // Xử lý êm lỗi rỗng trả về {} để hệ thống không sập
                try { return JSON.parse(text); } 
                catch(e) { throw new Error('Invalid JSON: ' + text.substring(0, 50)); }
            });
        });
    }

    function _get(url) {
        var key = (typeof API_CONFIG !== 'undefined') ? API_CONFIG.CHAT_API_KEY : '';
        var token = typeof _cbGetToken === 'function' ? _cbGetToken() : '';
        return fetch(url, {
            headers: { 
                'x-api-key': key,
                'Authorization': 'Bearer ' + token
            }
        }).then(function (res) {
            return res.text().then(function(text) {
                if (!res.ok) throw new Error('Network error: ' + res.status + ' | ' + text.substring(0, 50));
                if (!text) return {}; 
                try { return JSON.parse(text); } 
                catch(e) { throw new Error('Invalid JSON: ' + text.substring(0, 50)); }
            });
        });
    }

    // ── Data Source Logic ─────────────────────────────────────────────
    function _loadDataSource(dsType, dsVal, keyword, cb) {
        console.log('[ApiEngine] _loadDataSource type=', dsType, 'val=', dsVal, 'kw=', keyword);
        if (!dsType || !dsVal) { cb([]); return; }

        if (dsType === 'STATIC') {
            try {
                var rows = typeof dsVal === 'string' ? JSON.parse(dsVal) : dsVal;
                if (keyword) {
                    var kw = String(keyword).toLowerCase();
                    rows = rows.filter(function (r) {
                        return String(r.label || '').toLowerCase().indexOf(kw) !== -1 ||
                            String(r.value || '').toLowerCase().indexOf(kw) !== -1;
                    });
                }
                cb(rows);
            } catch (e) { console.error('Parse STATIC DS err', e); cb([]); }
            return;
        }

        // Với SQL hoặc APICODE -> gọi qua n8n datasource webhook
        _post(CFG.DS_URL, {
            DataSourceType: dsType,
            DataSourceValue: dsVal,
            SearchKey: keyword || ''
        }).then(function (res) {
            var rows = [];
            if (Array.isArray(res)) {
                rows = res;
            } else if (res && res.data && Array.isArray(res.data.records)) {
                rows = res.data.records;
            } else if (res && Array.isArray(res.records)) {
                rows = res.records;
            } else if (res && res.data && Array.isArray(res.data)) {
                rows = res.data;
            } else if (res && typeof res === 'object') {
                // Nếu là object đơn lẻ (có chứa các trường dữ liệu), bọc nó vào mảng
                if (res.PhanLoai || res.Name || res.label || res.MaDanhMuc) {
                    rows = [res];
                }
            }
            cb(rows);
        }).catch(function (e) {
            console.error('Load DS failed', e);
            cb([]);
        });
    }

    function _isCatalogToken(token) {
        if (!token) return false;
        var t = String(token).replace(/^@/, '').toLowerCase();
        // Check list cache
        var inList = _apiList.some(function (a) {
            return a.ExecutionType === 'CATALOG' && a.ApiCode.replace(/^@/, '').toLowerCase() === t;
        });
        if (inList) return true;
        // Check known catalog types
        return !!_catalogDsMap[t];
    }

    function _resolveCatalogDataSource(type) {
        var t = String(type).replace(/^@/, '').toLowerCase();
        return _catalogDsMap[t] || '';
    }

    // ── Config & List Logic ───────────────────────────────────────────
    function _loadConfig(apiCode, cb) {
        if (_cfgCache[apiCode]) { cb(_cfgCache[apiCode]); return; }
        _post(CFG.CFG_URL, { ApiCode: apiCode }).then(function (res) {
            _cfgCache[apiCode] = res;
            cb(res);
        }).catch(function (e) { console.error('Load config failed', e); cb(null); });
    }

    function _loadList(cb) {
        // Cache list for 10 mins
        var cached = sessionStorage.getItem(CFG.CACHE_KEY);
        if (cached) {
            var data = JSON.parse(cached);
            if (Date.now() - data.ts < CFG.CACHE_TTL) {
                _apiList = data.list;
                if (cb) cb(_apiList);
                return;
            }
        }

        _post(CFG.LIST_URL, {}).then(function (res) {
            _apiList = Array.isArray(res) ? res : (res.data || []);
            sessionStorage.setItem(CFG.CACHE_KEY, JSON.stringify({
                ts: Date.now(),
                list: _apiList
            }));
            if (cb) cb(_apiList);
        }).catch(function (e) { console.error('Load list failed', e); if (cb) cb([]); });
    }

    // ── Utility Helpers ───────────────────────────────────────────────
    function _esc(s) {
        if (!s) return '';
        return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    }

    function _user() {
        return localStorage.getItem('fullname') || 'Guest';
    }

    function _resolveDefault(v) {
        if (!v) return '';
        var s = String(v);
        if (s.indexOf('{{TODAY}}') !== -1) {
            return (new Date()).toISOString().split('T')[0];
        }
        if (s.indexOf('{{USERNAME}}') !== -1) return _user();
        return s;
    }

    function _registerCleanup(fn) {
        if (typeof fn === 'function') _registerCleanupQueue.push(fn);
    }

    function _runCleanup() {
        while (_registerCleanupQueue.length > 0) {
            var fn = _registerCleanupQueue.shift();
            try { fn(); } catch (e) { }
        }
    }

    // ── Menu UI Logic ─────────────────────────────────────────────────
    function _menuCreate() {
        if (_menuEl) return;
        _menuEl = document.createElement('div');
        _menuEl.id = 'ae-menu';
        _menuEl.className = 'ae-menu';
        _inputBarEl.appendChild(_menuEl);
        _menuVis = true;
    }

    function _menuHide() {
        if (_menuEl) {
            _menuEl.parentNode.removeChild(_menuEl);
            _menuEl = null;
        }
        _menuVis = false;
        _menuIdx = -1;
    }

    function _positionMenu() {
        if (!_menuEl || !_inputEl) return;
        _menuEl.style.display = 'block';
        _menuVis = true;
    }

    function _bindMenuItems(onPick) {
        if (!_menuEl) return;
        var items = _menuEl.querySelectorAll('.ae-menu-item');
        items.forEach(function (el, idx) {
            el.addEventListener('click', function (e) {
                onPick(el, e);
            });
            el.addEventListener('mouseenter', function () {
                _menuIdx = idx;
                _menuNav(0);
            });
        });
    }

    function _menuNav(dir) {
        if (!_menuEl) return;
        var items = _menuEl.querySelectorAll('.ae-menu-item');
        if (!items.length) return;

        items.forEach(function (el) { el.classList.remove('active'); });
        _menuIdx += dir;
        if (_menuIdx < 0) _menuIdx = items.length - 1;
        if (_menuIdx >= items.length) _menuIdx = 0;

        var active = items[_menuIdx];
        if (active) {
            active.classList.add('active');
            active.scrollIntoView({ block: 'nearest' });
        }
    }

    function _menuPick() {
        if (!_menuEl || _menuIdx === -1) return false;
        var items = _menuEl.querySelectorAll('.ae-menu-item');
        var active = items[_menuIdx];
        if (active) {
            active.click();
            return true;
        }
        return false;
    }

    function _menuShow(query) {
        _menuCreate();
        var q = (query || '').toLowerCase().replace(/^@/, '');
        var filtered = _apiList.filter(function (a) {
            var code = (a.ApiCode || '').toLowerCase().replace(/^@/, '');
            var name = (a.DisplayName || '').toLowerCase();
            return code.indexOf(q) !== -1 || name.indexOf(q) !== -1;
        });

        if (!filtered.length) { _menuHide(); return; }

        var groups = {
            '🔹 Chức năng chung (Common)': [],
            '🚀 Module nâng cao (Advanced)': []
        };

        // Các từ khóa thuộc file 'Module common'
        var commonKeys = ['congno', 'danhmuc', 'tonkho', 'doanhso', 'donhang', 'hoadon', 'themkhachhang'];

        filtered.forEach(function (a) {
            // Nối cả ApiCode và DisplayName, bỏ hết dấu gạch dưới, khoảng trắng, ký tự đặc biệt để so sánh
            var n = ((a.ApiCode || '') + (a.DisplayName || '')).toLowerCase().replace(/[^a-z0-9]/g, '');
            
            var isCommon = commonKeys.some(function(k) { return n.indexOf(k) !== -1; });
            
            if (isCommon) {
                groups['🔹 Chức năng chung (Common)'].push(a);
            } else {
                groups['🚀 Module nâng cao (Advanced)'].push(a);
            }
        });

        var html = '';
        Object.keys(groups).forEach(function(gName) {
            if (groups[gName].length > 0) {
                html += '<div class="ae-menu-group">' + gName + '</div>';
                groups[gName].forEach(function (a) {
                    html += '<div class="ae-menu-item" data-code="' + _esc(a.ApiCode) + '">'
                        + '<span class="ae-val-name">' + _esc(a.DisplayName || a.ApiCode) + '</span>'
                        + '<span class="ae-tag">' + _esc(a.ApiCode) + '</span>'
                        + '</div>';
                });
            }
        });
        _menuEl.innerHTML = html;
        _positionMenu();

        _bindMenuItems(function (el) {
            var code = el.getAttribute('data-code');
            _onApiSelected(code);
            _menuHide();
        });
    }

    function _menuShowParams(query) {
        if (!_activeApi || !_activeApi.config) { _menuHide(); return; }
        _menuCreate();
        var q = (query || '').toLowerCase().replace(/^@/, '');
        var cfg = _activeApi.config;
        var fields = (cfg.filters && cfg.filters.length > 0) ? cfg.filters : (cfg.fields || []);

        var val = _inputEl.value.toLowerCase();
        var filtered = fields.filter(function (f) {
            if (f.IsSystemParam == 1) return false;
            var code = (f.FieldCode || '').toLowerCase();
            // KHÔNG hiện lại tham số đã có trong input
            if (val.indexOf(code) !== -1) return false;

            var name = (f.FieldName || '').toLowerCase();
            var q = (query || '').toLowerCase().replace(/^@/, '');
            return code.replace(/^@/, '').indexOf(q) !== -1 || name.indexOf(q) !== -1;
        });

        if (!filtered.length) { _menuHide(); return; }

        var html = '';
        filtered.forEach(function (f) {
            html += '<div class="ae-menu-item" data-code="' + _esc(f.FieldCode) + '">'
                + '<span class="ae-val-name">' + _esc(f.FieldName || f.FieldCode) + '</span>'
                + '<span class="ae-tag">' + _esc(f.FieldCode) + '</span>'
                + '</div>';
        });
        _menuEl.innerHTML = html;
        _positionMenu();

        _bindMenuItems(function (el) {
            var code = el.getAttribute('data-code');
            var val = _inputEl.value;
            var insert = (code.startsWith('@') ? code : '@' + code) + '=';

            // Kiểm tra xem có đang thực sự gõ phím '@' không
            var lastAt = val.lastIndexOf('@');
            // Nếu dấu @ nằm ở cuối hoặc đang gõ dở thì mới ghi đè, 
            // còn nếu đã cách ra (space) thì phải chèn thêm
            if (lastAt !== -1 && lastAt >= val.lastIndexOf(' ')) {
                var prefix = val.slice(0, lastAt);
                _inputEl.value = prefix + insert;
            } else {
                // Chèn thêm vào cuối nếu không có dấu @ hợp lệ để ghi đè
                var prefix = val.endsWith(' ') ? val : val + ' ';
                _inputEl.value = prefix + insert;
            }
            _inputEl.dispatchEvent(new Event('input', { bubbles: true }));
            _inputEl.focus();
            _menuHide();

            // Nếu tham số có DataSource hoặc là Ngày, hãy hiển thị gợi ý giá trị ngay lập tức
            setTimeout(function () {
                _showInlineValues(code, '');
            }, 50);
        });
    }

    function _menuShowCatalog(query, atPos) {
        console.log('[ApiEngine] _menuShowCatalog query=', query, 'atPos=', atPos);
        _loadDataSource('APICODE', CFG.CATALOG_ROOT_API, query, function (rows) {
            if (!rows || !rows.length) { _menuHide(); return; }
            _menuCreate();
            var html = '';

        rows.forEach(function (r, idx) {
            var raw = r.json || r.raw || r.data || r;
            // Hàm pick không phân biệt hoa thường
            function pick(keys) {
                var rawKeys = Object.keys(raw || {});
                for (var i = 0; i < keys.length; i++) {
                    var target = keys[i].toLowerCase();
                    for (var j = 0; j < rawKeys.length; j++) {
                        if (rawKeys[j].toLowerCase() === target) {
                            var val = raw[rawKeys[j]];
                            if (val !== undefined && val !== null && String(val).trim() !== '') return val;
                        }
                    }
                }
                return null;
            }

            var dispName = pick(['Name', 'ObjectName', 'FullName', 'label']) || r.label || r.value || '';
            var dispId = pick(['MaDanhMuc', 'MaKhachHang', 'MA_KH', 'ID', 'Code', 'CustomerID']) || r.value || '';
            var pl = pick(['PhanLoai', 'type', 'Type']) || '';

            var vType = String(pl || (r.value || r.type || '')).replace(/^@/, '').toLowerCase();
            var dsVal = raw.DataSourceValue || raw.datasourcevalue || '';
            if (vType && dsVal) _catalogDsMap[vType] = String(dsVal);
            
            var tagLabel = dispId || vType;
            
            html += '<div class="ae-menu-item ae-val-item" data-lbl="' + _esc(dispName) + '" data-val="' + _esc(vType) + '" data-ds="' + _esc(dsVal) + '">'
                + '<span class="ae-val-name">' + _esc(dispName) + '</span>'
                + (tagLabel ? '<span class="ae-tag">' + _esc(tagLabel) + '</span>' : '')
                + '</div>';
        });
            _menuEl.innerHTML = html;

            _positionMenu();

            _bindMenuItems(function (el, e) {
                e.preventDefault();
                e.stopPropagation();
                console.log('[ApiEngine] catalog clicked, data-lbl=', el.getAttribute('data-lbl'), 'data-val=', el.getAttribute('data-val'));
                var lbl = el.getAttribute('data-lbl');
                var valType = (el.getAttribute('data-val') || '').replace(/^@/, '').toLowerCase();
                var val = _inputEl.value;
                var prefix = val.slice(0, atPos);
                // Dán lại text dưới dạng tag text thông thường — if possible insert canonical type and '='
                if (valType) {
                    var dsFromRow = el.getAttribute('data-ds') || '';
                    if (dsFromRow) _catalogDsMap[valType] = dsFromRow;
                    _lastCatalogType = valType;
                    // Bổ sung lại tiền tố '@' để API Engine có thể parse được token ở các bước sau
                    _inputEl.value = prefix + '@' + valType + '=';
                    // show entity suggestions immediately for chosen catalog
                    setTimeout(function () { console.log('[ApiEngine] triggering _menuShowCatalogValues from click for', valType); _menuShowCatalogValues(valType, ''); }, 80);
                } else {
                    _lastCatalogType = null;
                    _inputEl.value = prefix + lbl + ' ';
                }
                _inputEl.dispatchEvent(new Event('input', { bubbles: true }));
                _inputEl.focus();
                _menuHide();
                // Sau khi chọn danh mục, nếu phía trước có tag API thì tự động xổ tiếp menu param (filter)
                setTimeout(function () {
                    var v = _inputEl.value;
                    var tagIdx = v.lastIndexOf('#');
                    var atIdx = v.lastIndexOf('@');
                    // Nếu có tag API và @ vừa chọn nằm sau tag API
                    if (tagIdx !== -1 && atIdx > tagIdx) {
                        _menuShowParams('');
                    }
                }, 80);
            });
        });
    }

    function _menuShowCatalogValues(type, keyword) {
        console.log('[ApiEngine] _menuShowCatalogValues called type=', type, 'keyword=', keyword);
        if (!type) return;
        // normalize type (strip leading @ and lowercase)
        type = String(type).replace(/^@/, '').toLowerCase();
        var ds = _resolveCatalogDataSource(type);
        console.log('[ApiEngine] resolved dsValue=', ds, 'for type=', type);
        _loadDataSource('APICODE', ds, keyword, function (rows) {
            if (!rows || !rows.length) { _menuHide(); return; }
            // DEBUG: print a sample of raw rows so we can see actual backend field names
            try { console.log('[ApiEngine] RAW ROWS SAMPLE:', (rows.slice ? rows.slice(0, 5) : rows)); } catch (e) { }
            _menuCreate();
            var html = '';
            rows.forEach(function (r, idx) {
                var raw = r.json || r.raw || r.data || r;
                function pickRaw(keys) {
                    var rawKeys = Object.keys(raw || {});
                    for (var i = 0; i < keys.length; i++) {
                        var target = keys[i].toLowerCase();
                        for (var j = 0; j < rawKeys.length; j++) {
                            if (rawKeys[j].toLowerCase() === target) {
                                var val = raw[rawKeys[j]];
                                if (val !== undefined && val !== null && String(val).trim() !== '') return val;
                            }
                        }
                    }
                    return null;
                }

                var mAD = pickRaw(['MaDanhMuc', 'ObjectID', 'MaKhachHang', 'MA_KH', 'CUSTOMER_ID', 'CustomerCode', 'CustomerID', 'Ma', 'Code', 'ID']) || r.value || '';
                var mName = pickRaw(['Name', 'ObjectName', 'FullName', 'HoTen', 'HOTEN', 'TEN_KH', 'TenKhachHang', 'Ten', 'label']) || r.label || r.Name || '';
                var mPL = pickRaw(['PhanLoai', 'type', 'Type']) || '';

                if (!mName) mName = (r.label || r.value || '');
                if (!mAD) mAD = r.value || '';
                
                html += '<div class="ae-menu-item ae-val-item" data-code="' + _esc(mAD) + '" data-phanloai="' + _esc(mPL) + '" data-name="' + _esc(mName) + '" data-madanhmuc="' + _esc(mAD) + '">'
                    + '<span class="ae-val-name">' + _esc(mName) + '</span>'
                    + (mAD ? '<span class="ae-tag">' + _esc(mAD) + '</span>' : '')
                    + '</div>';
            });
            _menuEl.innerHTML = html;

            _positionMenu();

            _bindMenuItems(function (el) {
                // read meta
                var ph = el.getAttribute('data-phanloai') || '';
                var nm = el.getAttribute('data-name') || el.getAttribute('data-code') || '';
                var md = el.getAttribute('data-madanhmuc') || el.getAttribute('data-code') || '';

                // Insert selected catalog value visibly into the input text (no leading '@')
                try {
                    var code = el.getAttribute('data-code') || '';
                    var v = _inputEl.value || '';
                    var ph = el.getAttribute('data-phanloai') || '';
                    var nm = el.getAttribute('data-name') || el.getAttribute('data-code') || '';
                    var md = el.getAttribute('data-madanhmuc') || el.getAttribute('data-code') || '';

                    var display = (nm || code || '');
                    if (md && md !== display) display = display + '(' + md + ')';
                    // Bổ sung Phân loại vào trước tên
                    if (ph) display = ph + ' ' + display;
                    
                    var insert = '"' + display + '" ';
                    try { _pillParams['@' + type] = code; } catch (e) { }

                    var reAt = new RegExp('@' + type + '=[^@\\s]*\\s?', 'i');
                    var reNoAt = new RegExp(type + '=[^@\\s]*\\s?', 'i');
                    if (reAt.test(v)) {
                        v = v.replace(reAt, insert);
                    } else if (reNoAt.test(v)) {
                        v = v.replace(reNoAt, insert);
                    } else {
                        var atIdx = v.toLowerCase().lastIndexOf(type);
                        if (atIdx !== -1) {
                            v = v.slice(0, atIdx) + insert;
                        } else {
                            if (v && !v.endsWith(' ')) v += ' ';
                            v += insert;
                        }
                    }
                    _inputEl.value = v;
                } catch (e) { console.warn('insert catalog into input err', e); }

                // clear last catalog type after use
                _lastCatalogType = null;
                // hide menu after selection
                _menuHide();
                // Nếu đang trong luồng API, mở lại menu param để chọn tiếp
                if (_activeApi && _activeApi.config) {
                    setTimeout(function () { _menuShowParams(''); }, 100);
                }
            });
        });
    }

    function _showInlineValues(fieldCode, keyword) {
        if (!_activeApi || !_activeApi.config) return;
        var cfg = _activeApi.config;
        var fields = (cfg.filters && cfg.filters.length > 0) ? cfg.filters : (cfg.fields || []);

        // Tìm config của tham số hiện tại (ví dụ: @ObjectID)
        var field = fields.find(function (f) {
            return (f.FieldCode || '').toLowerCase() === fieldCode.toLowerCase();
        });

        // --- BẮT BUỘC ÉP KIỂU LỊCH NẾU DataType là Date ĐỂ CHỐNG CACHE BACKEND ---
        var isDateField = (field && (field.DataType === 'DATE' || field.DataType === 'DATETIME' || field.ControlType === 'date'))
            || (fieldCode || '').toLowerCase() === CFG.SYS_PARAMS.START_DATE
            || (fieldCode || '').toLowerCase() === CFG.SYS_PARAMS.END_DATE;

        if (isDateField) {
            if (!field) field = { FieldCode: fieldCode, FieldName: 'Ngày' };
            field.ControlType = 'date';
        }

        // Nếu tham số là ngày (date), hiển thị bộ chọn lịch Native HTML5 thay vì list text
        if (field && (field.ControlType || '').toLowerCase() === 'date') {
            _menuCreate();
            var dValParam = keyword;
            if (!dValParam || dValParam.trim() === '') {
                // Mặc định là ngày hôm nay nếu chưa nhập gì (tránh lệch timezone khi chuyển toISOString)
                var tzOffset = (new Date()).getTimezoneOffset() * 60000;
                dValParam = (new Date(Date.now() - tzOffset)).toISOString().split('T')[0];
            }

            var html = '<div style="padding:12px; cursor:default; background:var(--ae-bg); border-radius:12px;">'
                + '<div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:12px;">'
                + '<label style="font-size:13px;font-weight:600;color:var(--ae-text);margin:0;">Chọn ngày <span style="font-weight:normal;color:var(--ae-text-muted);">(' + _esc(field.FieldName) + ')</span>:</label>'
                + '<button type="button" id="ae-inline-date-confirm" style="background:var(--ae-primary);color:#fff;border:none;padding:6px 12px;border-radius:6px;cursor:pointer;font-weight:600;font-size:12px;transition:all 0.2s;">Chèn</button>'
                + '</div>'
                + '<input type="date" id="ae-inline-date" class="ae-ctrl" value="' + _esc(dValParam) + '" style="width:100%;font-size:15px;padding:10px;box-sizing:border-box;">'
                + '</div>';
            _menuEl.innerHTML = html;
            _positionMenu();

            // Allow focus and click inside the date input (ngăn bị block focus bởi menu)
            var di = document.getElementById('ae-inline-date');
            if (di) {
                di.addEventListener('mousedown', function (e) { e.stopPropagation(); });
                di.addEventListener('click', function (e) { e.stopPropagation(); });
                // Tự động chèn biến xuống khung nhập liệu khi Lịch được User thay đổi ngày
                di.addEventListener('change', function (e) {
                    var finalDate = di.value;
                    if (finalDate) {
                        _menuHide();
                        _onValueSelected(fieldCode, finalDate, { name: finalDate });
                    }
                });
                // Mở sẵn lịch ngay khi vừa trượt lên (nếu browser hỗ trợ)
                try { di.showPicker(); } catch (e) { }
            }

            _bindMenuItems(function (el) {
                if (el.id === 'ae-inline-date-confirm') {
                    var finalDate = document.getElementById('ae-inline-date').value;
                    _menuHide();
                    _onValueSelected(fieldCode, finalDate, { name: finalDate });
                }
            });
            return;
        }

        // Nếu không có DataSource, không hiển thị menu gợi ý (Tuân thủ No-Hardcode)
        if (!field || (!field.DataSourceType && !field.OptionsJson)) {
            _menuHide();
            return;
        }

        var dsType = field.DataSourceType || (field.OptionsJson ? 'STATIC' : null);
        var dsVal = field.DataSourceValue || field.OptionsJson;

        _loadDataSource(dsType, dsVal, keyword, function (rows) {
            if (!rows || !rows.length) {
                _menuHide();
                return;
            }
            _menuCreate();
            var html = '';

            rows.forEach(function (r) {
                var raw = r.json || r.raw || r.data || r;
                // Hàm pick không phân biệt hoa thường
                function pick(keys) {
                    var rawKeys = Object.keys(raw || {});
                    for (var i = 0; i < keys.length; i++) {
                        var target = keys[i].toLowerCase();
                        for (var j = 0; j < rawKeys.length; j++) {
                            if (rawKeys[j].toLowerCase() === target) {
                                var val = raw[rawKeys[j]];
                                if (val !== undefined && val !== null && String(val).trim() !== '') return val;
                            }
                        }
                    }
                    return null;
                }

                var idVal = pick(['MaDanhMuc', 'ObjectID', 'MaKhachHang', 'MA_KH', 'CUSTOMER_ID', 'CustomerCode', 'CustomerID', 'Ma', 'Code', 'ID', 'ExternalCode', 'PartnerID']) || r.value || '';
                var nameVal = pick(['Name', 'ObjectName', 'FullName', 'HoTen', 'HOTEN', 'TEN_KH', 'TenKhachHang', 'Ten', 'label']) || r.label || r.Name || '';
                var phVal = pick(['PhanLoai', 'Type', 'type', 'Group']) || '';

                var isObjectLike = (fieldCode || '').toLowerCase() === CFG.SYS_PARAMS.OBJECT_ID || (fieldCode || '').toLowerCase() === CFG.SYS_PARAMS.DOC_ID;
                var rightText = isObjectLike ? idVal : (r.sub || r.value || '');

                html += '<div class="ae-menu-item ae-val-item" data-code="' + _esc(idVal) + '" data-name="' + _esc(nameVal) + '" data-id="' + _esc(idVal) + '" data-phanloai="' + _esc(phVal) + '">'
                    + '<span class="ae-val-name">' + _esc(nameVal) + '</span>'
                    + (idVal ? '<span class="ae-tag">' + _esc(idVal) + '</span>' : '')
                    + '</div>';
            });
            _menuEl.innerHTML = html;

            _positionMenu();

            _bindMenuItems(function (el) {
                _menuHide();
                _onValueSelected(fieldCode, el.getAttribute('data-code'), {
                    name: el.getAttribute('data-name') || '',
                    id: el.getAttribute('data-id') || el.getAttribute('data-code') || '',
                    ph: el.getAttribute('data-phanloai') || ''
                });
            });
        });
    }

    function _onValueSelected(fieldCode, pickedVal, selectedMeta) {
        var val = _inputEl.value;
        var atPos = val.lastIndexOf('@');
        var prefix = (atPos !== -1 ? val.slice(0, atPos) : val);

        // Determine selection type
        var bare = (fieldCode || '').replace(/^@/, '').toLowerCase();
        var isCatalogEntity = _isCatalogToken(bare);
        var isApiParam = false;
        if (_activeApi && _activeApi.config) {
            var cfgParams = (_activeApi.config.filters && _activeApi.config.filters.length > 0)
                ? _activeApi.config.filters : (_activeApi.config.fields || []);
            isApiParam = cfgParams.some(function (f) { return (f.FieldCode || '').toLowerCase() === (fieldCode || '').toLowerCase(); });
        }

        // Decide what to append after the picked value:
        // - If user used Tab to accept -> single space
        // - If selection is a catalog entity -> single space
        // - If selection is an API param value -> append ' @' to continue selecting next param
        // - Otherwise -> single space
        var append = '';
        if (_suppressNextAt) append = '';
        else if (isCatalogEntity) append = '';
        else if (isApiParam) append = '';
        else append = '';
        var phVal = (selectedMeta && selectedMeta.ph) || '';

        if (isApiParam || phVal) {
            // Trường hợp tham số API hoặc có PhanLoai từ Catalog: Hiện định dạng "PhanLoai Tên(Mã)"
            try { _pillParams[fieldCode] = pickedVal; } catch (e) { }

            var ph = (selectedMeta && selectedMeta.ph) ? selectedMeta.ph + ' ' : '';
            var dispName = (selectedMeta && selectedMeta.name) ? selectedMeta.name : (fieldCode || '').replace(/^@/, '');
            var dispId = (selectedMeta && selectedMeta.id) ? selectedMeta.id : pickedVal;

            var fullDisplay = ph + dispName;
            // Chỉ thêm mã ID vào ngoặc nếu mã ID khác với tên
            if (dispId && dispId !== dispName) fullDisplay += '(' + dispId + ')';

            // XÓA TRẠNG THÁI tra cứu cũ TRƯỚC khi dispatch event để watcher không bị nhầm
            _lastCatalogType = null;

            // CHỈ CHÈN GIÁ TRỊ HIỂN THỊ
            var finalValue = (fullDisplay.indexOf(' ') !== -1 || fullDisplay.indexOf('(') !== -1) ? '"' + fullDisplay + '"' : fullDisplay;
            var finalInsert = finalValue + append;
            _inputEl.value = prefix + finalInsert;
        } else {
            // Store real value and insert friendly display (no leading '@')
            try { _pillParams[fieldCode] = pickedVal; } catch (e) { }
            var dispName = (selectedMeta && selectedMeta.name) ? selectedMeta.name : (fieldCode || '').replace(/^@/, '');
            // Chỉ thêm id vào trong ngoặc nếu id khác rỗng và khác với name
            var display = dispName;
            if (selectedMeta && selectedMeta.id && selectedMeta.id !== dispName && selectedMeta.id !== pickedVal) {
                display += '(' + selectedMeta.id + ')';
            } else if (!selectedMeta || !selectedMeta.name || pickedVal !== dispName) {
                display += '(' + pickedVal + ')';
            }
            _inputEl.value = prefix + '"' + display + '"' + append;
        }

        // Suppress menu reopening for a short moment to avoid flicker
        _suppressMenuUntil = Date.now() + 500;
        clearTimeout(_dbt); // Hủy mọi yêu cầu mở menu đang chờ xử lý
        
        _inputEl.dispatchEvent(new Event('input', { bubbles: true }));
        // Ensure menu is hidden and cleared immediately after selection
        _menuHide();
        _inputEl.focus();
    }

    function _menuNav(dir) {
        if (!_menuEl || !_menuVis) return false;
        var items = _menuEl.querySelectorAll('.ae-menu-item');
        if (!items.length) return false;
        items.forEach(function (el) { el.classList.remove('active'); });
        _menuIdx = Math.max(0, Math.min(items.length - 1, _menuIdx + dir));
        items[_menuIdx].classList.add('active');
        items[_menuIdx].scrollIntoView({ block: 'nearest' });
        return true;
    }

    function _menuPick() {
        if (!_menuEl || !_menuVis) return false;
        var items = _menuEl.querySelectorAll('.ae-menu-item');
        if (!items.length) return false;
        var idx = _menuIdx < 0 ? 0 : _menuIdx; // Tự động chọn dòng đầu tiên nếu chưa cuộn phím mũi tên
        if (items[idx]) { items[idx].click(); return true; }
        return false;
    }

    // ── API Selected ──────────────────────────────────────────────────
    function _onApiSelected(apiCode) {
        var found = _apiList.find(function (a) { return a.ApiCode === apiCode; });
        var execType = found ? found.ExecutionType : 'QUERY';
        var dispName = found ? found.DisplayName : apiCode;

        _activeApi = { apiCode: apiCode, dispName: dispName, execType: execType, config: null };
        // Keep API tag state but do not leave visible '#' text: store on input dataset
        _replaceAtTag(apiCode);
        try { if (_inputEl) { _inputEl.dataset.apiTag = apiCode.replace('@', ''); } } catch (e) { }

        // Đảm bảo nút "mở lại panel" được khởi tạo sẵn (chỉ cho CART hoặc khi panel mở)
        if (execType !== 'QUERY') _createTriggerButton();

        _loadConfig(apiCode, function (config) {
            _activeApi.config = config;

            if (execType === 'CART') {
                _openPanel(config, execType, dispName);
            } else {
                // QUERY flow: không hiện panel, nhưng hiển thị tóm tắt tham số trong chat
                var fields = (config && config.filters && config.filters.length > 0) ? config.filters : (config ? config.fields || [] : []);
                var visible = fields.filter(function (f) { return !f.IsSystemParam || f.IsSystemParam == 0; });
                if (visible && visible.length) {
                    try {
                        var msg = 'Tham số cho API **' + dispName + '**:\n';
                        visible.forEach(function (f) {
                            var code = f.FieldCode || f.field || '';
                            var name = f.FieldName || f.placeholder || f.placeholderText || '';
                            var req = (f.IsRequired == 1 || f.required) ? ' (Bắt buộc)' : '';
                            msg += '- ' + code + req + (name ? ' — ' + name : '') + '\n';
                        });
                        // _cbMsg && _cbMsg('ai', msg); // Tắt in ra chat theo yêu cầu của user cho đỡ rối

                        // Do not clear the input text so user retains `#api_code` tag visually.
                        // Just set the placeholder for when they delete it.
                        try {
                            _prevPlaceholder = _inputEl.placeholder || '';
                            if (_inputEl) {
                                _inputEl.placeholder = 'Nhập: ' + visible.map(function (f) { return (f.FieldCode || '').replace(/^@/, '') + '='; }).join(' ');
                            }
                        } catch (e) { }
                    } catch (e) { }
                }

                // Mở ngay menu tham số
                _menuShowParams('');
            }
        });
    }

    function _replaceAtTag(apiCode) {
        var val = _inputEl.value;
        var atPos = val.lastIndexOf('@');
        var tag = '#' + apiCode.replace('@', '') + ' ';
        _inputEl.value = (atPos !== -1 ? val.slice(0, atPos) : '') + tag;

        // Phát sự kiện input để chatbot.js biết giá trị đã thay đổi -> cập nhật nút Gửi
        _inputEl.dispatchEvent(new Event('input', { bubbles: true }));
        _inputEl.focus();
    }

    // ── Filter Panel ──────────────────────────────────────────────────
    function _openPanel(config, execType, dispName) {
        _closePanel(true); // Chỉ xóa DOM cũ, không xóa _activeApi

        var useFilters = config && config.filters && config.filters.length > 0;
        var fields = (useFilters ? config.filters : (config ? config.fields || [] : []))
            .filter(function (f) { return !f.IsSystemParam || f.IsSystemParam == 0; });

        _panelEl = document.createElement('div');
        _panelEl.id = 'ae-panel';
        _panelEl.className = 'ae-panel';

        var html = '<div class="ae-panel-header">'
            + '<span class="ae-panel-title">' + _esc(dispName) + '</span>'
            + '<div class="ae-panel-actions">'
            + '<button class="ae-panel-btn" id="ae-panel-min">−</button>'
            + '<button class="ae-panel-btn" id="ae-panel-close">✕</button>'
            + '</div>'
            + '</div>';

        if (execType === 'CART') {
            html += _buildCartPanel(fields);
        } else if (!fields.length) {
            html += '<div class="ae-panel-empty">Không có tham số — nhấn Gửi để thực hiện.</div>';
        } else {
            html += '<div class="ae-panel-fields">' + fields.map(_buildField).join('') + '</div>';
        }

        // Thêm nút Gửi ngay trên panel
        html += '<div class="ae-panel-footer">'
            + '<button class="ae-panel-send-btn" id="ae-panel-send-btn">'
            + '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="22" y1="2" x2="11" y2="13"></line><polygon points="22 2 15 22 11 13 2 9 22 2"></polygon></svg>'
            + ' Gửi</button>'
            + '</div>';

        _panelEl.innerHTML = html;

        var wrapper = document.querySelector('.chat-container') || document.querySelector('.chatbot-wrapper') || document.body;
        wrapper.appendChild(_panelEl);

        document.body.classList.add('ae-panel-open'); // Đánh dấu để ẩn navbar trên mobile
        _panelEl.querySelector('#ae-panel-min').addEventListener('click', function () {
            // Minimize thay vì xóa hoàn toàn
            _panelEl.classList.remove('active');
            document.body.classList.remove('ae-panel-open'); // Tắt nền mờ
            setTimeout(function () { _panelEl.style.display = 'none'; }, 200);

            var triggerBtn = document.getElementById('ae-panel-trigger');
            if (triggerBtn) triggerBtn.style.display = 'flex';
        });
        _panelEl.querySelector('#ae-panel-close').addEventListener('click', function () {
            _closeFull();
        });
        _panelEl.querySelector('#ae-panel-send-btn').addEventListener('click', function () {
            window.ApiEngine.handleSend();
        });

        // Init DataSource fields
        _initDataSourceFields(_panelEl);

        if (execType === 'CART') _initCartEvents();

        requestAnimationFrame(function () { _panelEl.classList.add('active'); });
        setTimeout(function () {
            var first = _panelEl.querySelector('input:not([type=hidden]),select,textarea');
            if (first) {
                // Focus mà không bị nhảy (scroll to)
                first.focus({ preventScroll: true });
            }
        }, 200);
    }

    function _closeFull(clearAll) {
        _runCleanup();
        _menuHide();
        if (_panelEl) {
            _panelEl.classList.remove('active');
            var p = _panelEl;
            setTimeout(function () { if (p.parentNode) p.parentNode.removeChild(p); }, 250);
            _panelEl = null;
        }
        document.body.classList.remove('ae-panel-open');
        _activeApi = null;
        _lastCatalogType = null;
        _pillParams = {};
        // selection pill UI removed
        // remove dataset tag and restore placeholder
        try { if (_inputEl) { delete _inputEl.dataset.apiTag; _inputEl.placeholder = _prevPlaceholder || ''; _prevPlaceholder = ''; } } catch (e) { }

        if (_inputEl) {
            if (clearAll === true) {
                _inputEl.value = '';
            } else {
                var v = _inputEl.value;
                v = v.replace(/#\S+\s*/g, ''); // Xóa tag API
                v = v.replace(/@\w+=[^@]*/g, ''); // Xóa các param đang điền
                v = v.replace(/@\w*/g, ''); // Xóa ký tự @ thừa
                _inputEl.value = v.trim();
            }
            _inputEl.dispatchEvent(new Event('input', { bubbles: true }));
        }

        var triggerBtn = document.getElementById('ae-panel-trigger');
        if (triggerBtn) triggerBtn.style.display = 'none';

    }

    // ── Field Builder ─────────────────────────────────────────────────
    function _buildField(f) {
        var code = f.FieldCode || '';
        var name = f.FieldName || code;
        var ctrl = f.ControlType || 'text';
        var reqd = f.IsRequired == 1;
        var defVal = _resolveDefault(f.DefaultValue || '');
        var ph = f.Placeholder || '';
        var dsType = f.DataSourceType || null;
        var dsVal = f.DataSourceValue || null;
        var id = 'ae-f-' + code.replace('@', '').replace(/\W/g, '');

        var lbl = '<label class="ae-label" for="' + id + '">'
            + _esc(name) + (reqd ? '<em>*</em>' : '') + '</label>';

        var input = '';

        var ph = f.Placeholder || '';
        if (!reqd) ph += (ph ? ' ' : '') + '(tùy chọn)';

        // ── combobox: DataSource driven (SQL/APICODE/STATIC large list) ──
        if (ctrl === 'combobox' && dsType) {
            input = '<div class="ae-combo" data-ds-type="' + _esc(dsType) + '" data-ds-val="' + _esc(dsVal) + '">'
                + '<input type="text" id="' + id + '_txt" class="ae-ctrl ae-combo-txt" placeholder="' + _esc(ph || 'Gõ để tìm...') + '" autocomplete="off"' + (reqd ? ' required' : '') + ' data-field="' + id + '">'
                + '<input type="hidden" id="' + id + '" name="' + _esc(code) + '">'
                + '<div class="ae-combo-sug" style="display:none"></div>'
                + '</div>';
        }
        // ── select: STATIC small list ──
        else if ((ctrl === 'select' || ctrl === 'combobox') && dsType === 'STATIC' && dsVal) {
            var opts; try { opts = JSON.parse(dsVal); } catch (e) { opts = []; }
            input = '<select id="' + id + '" name="' + _esc(code) + '" class="ae-ctrl">';
            opts.forEach(function (o) {
                input += '<option value="' + _esc(o.value) + '"' + (o.value === defVal ? ' selected' : '') + '>' + _esc(o.label) + '</option>';
            });
            input += '</select>';
        }
        else if (ctrl === 'date') {
            input = '<input type="date" id="' + id + '" name="' + _esc(code) + '" class="ae-ctrl" value="' + _esc(defVal) + '"' + (reqd ? ' required' : '') + ' data-field="' + id + '">';
        }
        else if (ctrl === 'number') {
            input = '<input type="number" id="' + id + '" name="' + _esc(code) + '" class="ae-ctrl" value="' + _esc(defVal) + '" placeholder="' + _esc(ph) + '"'
                + (f.MinValue ? ' min="' + _esc(f.MinValue) + '"' : '') + (f.MaxValue ? ' max="' + _esc(f.MaxValue) + '"' : '')
                + (reqd ? ' required' : '') + ' data-field="' + id + '">';
        }
        else if (ctrl === 'textarea') {
            input = '<textarea id="' + id + '" name="' + _esc(code) + '" class="ae-ctrl ae-ctrl-ta" placeholder="' + _esc(ph) + '"' + (reqd ? ' required' : '') + '>' + _esc(defVal) + '</textarea>';
        }
        else {
            input = '<input type="text" id="' + id + '" name="' + _esc(code) + '" class="ae-ctrl" value="' + _esc(defVal) + '" placeholder="' + _esc(ph) + '"' + (reqd ? ' required' : '') + ' data-field="' + id + '">';
        }

        return '<div class="ae-field"><div class="ae-field-inner">' + lbl + input + '</div></div>';
    }

    // ── Init DataSource Comboboxes ─────────────────────────────────────
    function _initDataSourceFields(container) {
        container.querySelectorAll('.ae-combo').forEach(function (wrap) {
            var dsType = wrap.getAttribute('data-ds-type');
            var dsVal = wrap.getAttribute('data-ds-val');
            var txt = wrap.querySelector('.ae-combo-txt');
            var hid = wrap.querySelector('input[type=hidden]');
            var sug = wrap.querySelector('.ae-combo-sug');
            var timer = null;

            // Mở suggest khi focus (STATIC: hiện tất cả; SQL/APICODE: load)
            txt.addEventListener('focus', function () {
                var kw = this.value.trim();
                _loadDataSource(dsType, dsVal, kw, function (rows) {
                    console.log('--- RENDER SUG (focus) ---', rows.length, 'rows'); _renderComboSug(sug, txt, hid, rows, true);
                });
            });

            txt.addEventListener('input', function () {
                clearTimeout(timer);
                hid.value = ''; // reset ID khi gõ lại
                var kw = this.value.trim();

                // STATIC: filter ngay, không cần debounce
                if (dsType === 'STATIC') {
                    _loadDataSource(dsType, dsVal, kw, function (rows) {
                        console.log('--- RENDER SUG (input) ---', rows.length, 'rows'); _renderComboSug(sug, txt, hid, rows, false);
                    });
                    return;
                }

                timer = setTimeout(function () {
                    _loadDataSource(dsType, dsVal, kw, function (rows) {
                        console.log('--- RENDER SUG (input) ---', rows.length, 'rows'); _renderComboSug(sug, txt, hid, rows, false);
                    });
                }, 320);
            });

            // Xóa hết → reset selection
            txt.addEventListener('keydown', function (e) {
                if ((e.key === 'Backspace' || e.key === 'Delete') && !this.value) {
                    hid.value = '';
                    sug.style.display = 'none';
                }
            });

            // Đóng khi click ngoài
            var onDocClick = function (e) {
                if (!wrap.contains(e.target)) { sug.style.display = 'none'; }
            };
            document.addEventListener('click', onDocClick);
            _registerCleanup(function () { document.removeEventListener('click', onDocClick); });
        });
    }

    function _renderComboSug(sug, txt, hid, rows, showAll) {
        console.log('--- RENDER COMBO SUG CALLED ---', sug, rows.length);
        if (!rows || !rows.length) {
            sug.innerHTML = '<div class="ae-sug-empty">Không tìm thấy kết quả</div>';
            sug.style.display = 'block';
            return;
        }
        var limit = showAll ? rows.length : 12;
        var html = '<div class="ae-sug-header"><span class="ae-sug-col-id">Mã / ID</span><span class="ae-sug-col-name">Thông tin chi tiết</span></div>';
        html += rows.slice(0, limit).map(function (r) {
            return '<div class="ae-sug-row" data-val="' + _esc(r.value) + '" data-lbl="' + _esc(r.label) + '">'
                + '<div class="ae-sug-col-id"><span class="ae-sug-val">' + _esc(r.value) + '</span></div>'
                + '<div class="ae-sug-col-name">'
                + '<span class="ae-sug-lbl">' + _esc(r.label) + '</span>'
                + (r.sub ? '<span class="ae-sug-sub">' + _esc(r.sub) + '</span>' : '')
                + '</div>'
                + '</div>';
        }).join('');
        sug.innerHTML = html;
        sug.style.display = 'block';

        sug.querySelectorAll('.ae-sug-row').forEach(function (el) {
            el.addEventListener('mousedown', function (e) { e.preventDefault(); });
            el.addEventListener('click', function () {
                txt.value = this.getAttribute('data-lbl');  // hiển thị label
                hid.value = this.getAttribute('data-val');  // gửi value (ID)
                sug.style.display = 'none';
                txt.classList.remove('ae-error');
            });
        });
    }

    // ── Cart Panel ─────────────────────────────────────────────────────

    // ── Close Panel ───────────────────────────────────────────────────
    function _closePanel(silent) {
        _runCleanup();
        if (_panelEl) {
            _panelEl.classList.remove('active');
            var p = _panelEl;
            setTimeout(function () { if (p.parentNode) p.parentNode.removeChild(p); }, 250);
            _panelEl = null;
        }
        document.body.classList.remove('ae-panel-open'); // Gỡ bỏ đánh dấu

        // Hiển thị nút "Mũi tên lên" ở thanh chat nếu không đóng hoàn toàn (đóng tạm)
        var triggerBtn = document.getElementById('ae-panel-trigger');
        if (triggerBtn) {
            triggerBtn.style.display = silent ? 'none' : 'flex';
        }

        if (silent) return; // Chỉ xóa DOM — _activeApi còn nguyên

        // Full close
        if (!silent) {
            _closeFull();
        }
    }

    function _createTriggerButton() {
        if (document.getElementById('ae-panel-trigger')) return;

        var btn = document.createElement('button');
        btn.id = 'ae-panel-trigger';
        btn.className = 'ae-panel-trigger-btn';
        btn.innerHTML = '<svg viewBox="0 0 24 24" width="16" height="16" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"><polyline points="18 15 12 9 6 15"></polyline></svg>';
        btn.style.display = 'none';
        btn.title = 'Mở lại bảng thao tác';

        // Gắn vào thanh chat
        var inputWrap = document.querySelector('.chat-input-wrap');
        if (inputWrap) {
            inputWrap.insertBefore(btn, inputWrap.querySelector('.chat-send-btn'));
        }

        btn.addEventListener('click', function (e) {
            e.preventDefault();
            this.style.display = 'none';
            if (_panelEl && _activeApi && _activeApi.config) {
                _panelEl.style.display = ''; // Dùng '' thay vì 'block' để ưu tiên display: flex của CSS
                document.body.classList.add('ae-panel-open'); // Bật lại nền mờ
                requestAnimationFrame(function () { _panelEl.classList.add('active'); });
            } else if (_activeApi && _activeApi.config) {
                _openPanel(_activeApi.config, _activeApi.execType, _activeApi.dispName);
            }
        });
    }

    // ── Collect Params ────────────────────────────────────────────────
    function _collectParams() {
        var params = {}, hasErr = false;
        if (!_activeApi) return params;

        // --- TH1: Thu thập từ Panel UI ---
        if (_panelEl) {
            var cfg = _activeApi.config;
            var fields = cfg && cfg.filters && cfg.filters.length > 0 ? cfg.filters : (cfg ? cfg.fields || [] : []);

            fields.forEach(function (f) {
                var code = f.FieldCode || '';
                var ctrl = f.ControlType || 'text';
                var fcLow = code.toLowerCase();
                // System params (như @Username) luôn auto-fill từ hệ thống
                var isUserParam = (fcLow === CFG.SYS_PARAMS.USERNAME.toLowerCase() || fcLow === 'username' || fcLow === '@username');

                if (f.IsSystemParam || isUserParam) {
                    if (isUserParam) params[code] = _user();
                    return;
                }

                var fid = 'ae-f-' + code.replace('@', '').replace(/\W/g, '');

                if (ctrl === 'combobox') {
                    var hidEl = _panelEl.querySelector('#' + fid);
                    var txtEl = _panelEl.querySelector('#' + fid + '_txt');
                    var id = hidEl ? hidEl.value.trim() : '';
                    var txt = txtEl ? txtEl.value.trim() : '';
                    if (f.IsRequired == 1 && !id && !txt) {
                        if (txtEl) { txtEl.focus(); txtEl.classList.add('ae-error'); }
                        hasErr = true;
                    } else {
                        if (txtEl) txtEl.classList.remove('ae-error');
                        params[code] = id || txt || "";
                    }
                } else {
                    var el = _panelEl.querySelector('#' + fid);
                    if (el) {
                        var v = el.value.trim();
                        // Tự động gán mặc định cho các tham số ngày (nếu trống)
                        if (!v && (fcLow.indexOf('tu_ngay') > -1 || fcLow.indexOf('tungay') > -1 || fcLow.indexOf('den_ngay') > -1 || fcLow.indexOf('denngay') > -1)) {
                            var d = new Date();
                            if (fcLow.indexOf('tu') > -1) d.setMonth(d.getMonth() - 1);
                            var mm = (d.getMonth() + 1).toString().padStart(2, '0');
                            var dd = d.getDate().toString().padStart(2, '0');
                            v = d.getFullYear() + '-' + mm + '-' + dd;
                            el.value = v; // Hiện lên UI luôn
                        }

                        if (f.IsRequired == 1 && !v) {
                            el.focus(); el.classList.add('ae-error'); hasErr = true;
                        } else {
                            el.classList.remove('ae-error');
                            params[code] = v || "";
                        }
                    }
                }
            });
        }
        // --- TH2: Thu thập từ chuỗi văn bản (In-line/QUERY/CLI) ---
        else {
            var val = _inputEl.value.trim();

            // Kỹ thuật lai tạp: Dùng Regex cắt tham số theo Space/Quotes (cho Power User)
            var cfgParams = (_activeApi.config && _activeApi.config.filters && _activeApi.config.filters.length > 0)
                ? _activeApi.config.filters : (_activeApi.config ? _activeApi.config.fields || [] : []);
            var visibleFields = cfgParams.filter(function (f) { return !f.IsSystemParam || f.IsSystemParam == 0; });

            var apiTagPattern = new RegExp('^#' + _activeApi.apiCode.replace(/^@/, '') + '(?:\\s+|$)', 'i');
            var plainInput = val.replace(apiTagPattern, '').trim();

            if (plainInput) {
                var regexTokens = /"([^"\\]*(?:\\.[^"\\]*)*)"|'([^'\\]*(?:\\.[^'\\]*)*)'|([^\s]+)/g;
                var tokens = [];
                var tkMatch;
                while ((tkMatch = regexTokens.exec(plainInput)) !== null) {
                    var tkVal = tkMatch[1] !== undefined ? tkMatch[1] : (tkMatch[2] !== undefined ? tkMatch[2] : tkMatch[3]);
                    tokens.push(tkVal);
                }

                // Map thứ tự token từ mảng vào visibleFields
                for (var i = 0; i < tokens.length && i < visibleFields.length; i++) {
                    var vField = visibleFields[i];
                    var fCode = vField.FieldCode || vField.field || vField.name || '';
                    if (fCode) {
                        if (!fCode.startsWith('@')) fCode = '@' + fCode;
                        if (tokens[i].indexOf('=') === -1) {
                            params[fCode] = tokens[i];
                        }
                    }
                }
            }

            // Regex tìm @Key=Value truyền thống (ghi đè nếu có)
            var regex = /@([\w]+)=([^@]*)/g;
            var match;
            while ((match = regex.exec(val)) !== null) {
                var key = match[1];
                var v = match[2].trim();
                if (!key.startsWith('@')) key = '@' + key;
                params[key] = v;
            }

            // Merge any pillParams (selected entities) — do not overwrite existing explicit params
            Object.keys(_pillParams).forEach(function (k) {
                if (!params[k]) { params[k] = _pillParams[k]; return; }
                // If inline text is display token (e.g. "Khách hàng(ONL3404)"), keep real ID from hidden state
                if (/\(.+\)/.test(params[k])) params[k] = _pillParams[k];
            });

            // Kiểm tra tham số bắt buộc từ config
            if (_activeApi.config) {
                var cfgParams = (_activeApi.config.filters && _activeApi.config.filters.length > 0)
                    ? _activeApi.config.filters : (_activeApi.config.fields || []);
                cfgParams.forEach(function (f) {
                    var fcLow = (f.FieldCode || '').toLowerCase();
                    // Bypass validate cho các system param
                    var isUserField = (fcLow === CFG.SYS_PARAMS.USERNAME.toLowerCase() || fcLow === 'username' || fcLow === '@username');
                    if (isUserField) return;

                    // Tự động tính tham số thời gian cho TH2 (nhập qua Chat)
                    var isStartD = (fcLow === CFG.SYS_PARAMS.START_DATE || fcLow.indexOf('tu_ngay') > -1);
                    var isEndD = (fcLow === CFG.SYS_PARAMS.END_DATE || fcLow.indexOf('den_ngay') > -1);

                    if (!params[f.FieldCode] && (isStartD || isEndD)) {
                        var d = new Date();
                        if (isStartD) d.setMonth(d.getMonth() - 1);
                        var mm = (d.getMonth() + 1).toString().padStart(2, '0');
                        var dd = d.getDate().toString().padStart(2, '0');
                        params[f.FieldCode] = d.getFullYear() + '-' + mm + '-' + dd;
                    }

                    if (f.IsRequired == 1 && (!f.IsSystemParam || f.IsSystemParam == 0)) {
                        if (!params[f.FieldCode]) {
                            console.warn('Thiếu tham số bắt buộc (đã bỏ qua chặn): ' + (f.FieldName || f.FieldCode));
                            // hasErr = false; // Bỏ qua chặn lỗi để AI/Backend tự handle
                        }
                    }
                });
            }
        }

        if (hasErr) return null;

        var uKey = CFG.SYS_PARAMS.USERNAME;
        if (!params[uKey]) params[uKey] = _user();

        if (_activeApi.execType === 'CART') {
            if (!_cartItems.length) { alert('Vui lòng thêm ít nhất 1 sản phẩm.'); return null; }
            var iKey = CFG.SYS_PARAMS.ITEM_LIST;
            params[iKey] = JSON.stringify(_cartItems.map(function (it) {
                return { ItemID: it.ItemID, Quantity: it.Quantity };
            }));
        }

        return params;
    }

    // ── Confirmation Dialog ───────────────────────────────────────────
    function _showConfirm(params, api) {
        var overlay = document.createElement('div');
        overlay.className = 'ae-confirm-overlay';

        var msg = 'Bạn có chắc chắn muốn thực hiện hành động này không?';
        // Có thể bổ sung tóm tắt params vào đây nếu cần

        overlay.innerHTML = '<div class="ae-confirm-card">'
            + '<div class="ae-confirm-title">Xác nhận yêu cầu</div>'
            + '<div class="ae-confirm-msg">' + _esc(msg) + '</div>'
            + '<div class="ae-confirm-btns">'
            + '<button class="ae-confirm-btn ae-btn-cancel" id="ae-cf-no">Hủy bỏ</button>'
            + '<button class="ae-confirm-btn ae-btn-confirm" id="ae-cf-yes">Xác nhận</button>'
            + '</div>'
            + '</div>';

        var target = _panelEl || _inputBarEl || document.body;
        target.appendChild(overlay);

        overlay.querySelector('#ae-cf-no').onclick = function () { overlay.remove(); };
        overlay.querySelector('#ae-cf-yes').onclick = function () {
            overlay.remove();
            _closePanel(false);
            _executeApi(api.apiCode, params, api.dispName, api.execType, api.config);
        };
    }

    // ── Execute ───────────────────────────────────────────────────────
    function _executeApi(apiCode, params, dispName, execType, config) {
        var sp = config && config.info ? config.info.StoredProcedure : '';
        var cfgFilters = (config && config.filters && Array.isArray(config.filters)) ? config.filters : [];

        // Tạo chuỗi hiển thị: chỉ hiện các field có giá trị
        var ps = Object.keys(params)
            .filter(function (k) {
                var uKey = CFG.SYS_PARAMS.USERNAME;
                var iKey = CFG.SYS_PARAMS.ITEM_LIST;
                return k !== uKey && k !== iKey && params[k] !== "" && params[k] !== null;
            })
            .map(function (k) {
                // Tìm label của field để hiển thị cho thân thiện
                var f = cfgFilters.find(function (x) { return x.FieldCode === k; });
                var label = f ? f.FieldName : k.replace('@', '');
                return label + ': ' + params[k];
            })
            .join(' | ');

        _cbMsg && _cbMsg('user', '📡 ' + dispName + (ps ? '\n' + ps : ''));
        _cbShow && _cbShow();
        _post(CFG.EXEC_URL, { ApiCode: apiCode, StoredProcedure: sp, params: params })
            .then(function (res) {
                _cbHide && _cbHide();
                var r = typeof res === 'string' ? res : (res.reply || res.message || '');

                // --- Tự động render mảng Data ---
                var arrData = Array.isArray(res) ? res : (res && Array.isArray(res.data) ? res.data : null);
                if (arrData && arrData.length > 0) {
                    var msgRow = arrData.find(function(row) { return row.Msg !== undefined; });
                    if (msgRow && msgRow.MsgType !== undefined) {
                        _cbMsg && _cbMsg('system', '⚠️ ' + msgRow.Msg);
                        return;
                    }
                    var dataRows = arrData.filter(function(row) { return row.Msg === undefined && !row.Metadata_UITemplate; });
                    if (_cbRender && _cbHtml) {
                        var uiTpl = (res.uiTemplate || ApiEngine.getUiTemplate(apiCode) || 'DEFAULT').toUpperCase();
                        var dtToRender = dataRows.length ? dataRows : arrData;
                        var html = _cbRender(dtToRender, r || ('🔍 Tìm thấy ' + dtToRender.length + ' kết quả'), apiCode, {
                            uiTemplate: uiTpl,
                            fieldRoles: ApiEngine.getRoleMapping(),
                            khCode: ''  // engine không có context khCode, chatbot.js sẽ tự resolve
                        });
                        _cbHtml(html, r || '📊 Kết quả tra cứu');
                    } else {
                        // Fallback Text Markdown (nếu không có UI mới)
                        var arr = res.data;
                        var keys = Object.keys(arr[0]).filter(function (k) {
                            var l = k.toLowerCase();
                            return l !== 'rowindex' && l !== 'totalrows' && l !== 'isdeleted';
                        });

                        if (keys.length > 0) {
                            var tb = '\n\n| ' + keys.join(' | ') + ' |\n';
                            tb += '|' + keys.map(function () { return '---'; }).join('|') + '|\n';
                            arr.forEach(function (item) {
                                tb += '| ' + keys.map(function (k) {
                                    var v = item[k];
                                    if (v === null || v === undefined) return '';
                                    return String(v).replace(/\|/g, '-').replace(/\n/g, ' ');
                                }).join(' | ') + ' |\n';
                            });
                            r += tb;
                        }
                        _cbMsg && _cbMsg('ai', r);
                    }
                } else {
                    if (!r && typeof res === 'object') {
                        r = JSON.stringify(res, null, 2);
                    }
                    _cbMsg && _cbMsg('ai', r);
                }
            })
            .catch(function (err) {
                _cbHide && _cbHide();
                _cbMsg && _cbMsg('ai', '❌ Lỗi: ' + (err.message || err));
            });
    }

    // ── Input Watcher ─────────────────────────────────────────────────
    var _dbt = null;
    function _watchInput(inp) {
        if (!inp) return;
        inp.addEventListener('input', function () {
            // if user started typing, restore previous placeholder (remove ghost)
            try {
                if (_prevPlaceholder && this.value.trim() !== '') {
                    _inputEl.placeholder = _prevPlaceholder;
                    _prevPlaceholder = '';
                }
            } catch (e) { }
            var val = this.value;
            // If we just selected a value, suppress watcher to avoid reopening menu
            if (Date.now() < _suppressMenuUntil) {
                // Allow processing if user currently has a trailing '@' (wants suggestions)
                var _pos_check = val.lastIndexOf('@');
                var _tail_check = _pos_check !== -1 ? val.slice(_pos_check + 1) : '';
                if (_tail_check.trim() !== '') {
                    console.log('[ApiEngine] input suppressed but trailing token present, allow processing');
                } else {
                    console.log('[ApiEngine] input suppressed (until)', _suppressMenuUntil, 'now', Date.now());
                    clearTimeout(_dbt); return;
                }
            }
            clearTimeout(_dbt); // Xóa ngay timeout cũ để tránh menu vô cớ nhảy lên sau khi xóa chữ nhanh

            if (_activeApi) {
                // Live Feedback UI: Xác định Parameter tiếp theo cần điền
                try {
                    var cfgParams = (_activeApi.config && _activeApi.config.filters && _activeApi.config.filters.length > 0)
                        ? _activeApi.config.filters : (_activeApi.config ? _activeApi.config.fields || [] : []);
                    var visibleFields = cfgParams.filter(function (f) { return !f.IsSystemParam || f.IsSystemParam == 0; });
                    var apiTagPattern = new RegExp('^#' + _activeApi.apiCode.replace(/^@/, '') + '(?:\\s+|$)', 'i');
                    var plainInput = val.replace(apiTagPattern, '');

                    var regexTokens = /"[^"\\]*(?:\\.[^"\\]*)*"|'[^'\\]*(?:\\.[^'\\]*)*'|[^\s]+/g;
                    var tokens = [];
                    if (plainInput) {
                        var tkMatch;
                        while ((tkMatch = regexTokens.exec(plainInput)) !== null) {
                            tokens.push(tkMatch[0]);
                        }
                    }

                    var isTypingIncompleteToken = plainInput.length > 0 && !plainInput.endsWith(' ') && !plainInput.endsWith('"');
                    var completedTokensCount = isTypingIncompleteToken ? Math.max(0, tokens.length - 1) : tokens.length;

                    if (completedTokensCount < visibleFields.length) {
                        var nextF = visibleFields[completedTokensCount];
                        var fName = nextF.FieldName || nextF.FieldCode;
                        _inputEl.placeholder = 'Tham số ' + (completedTokensCount + 1) + ': Nhập ' + fName + (nextF.IsRequired == 1 ? ' *' : '');
                    } else if (visibleFields.length > 0) {
                        _inputEl.placeholder = 'Đã đủ tham số. Nhấn Enter để Gửi.';
                    }
                } catch (e) { console.error('Live feedback loop error', e); }

                // Kiểm tra tag #ApiCode còn trong input không
                var tag = '#' + _activeApi.apiCode.replace('@', '');
                var hasTagInInput = (val.indexOf(tag) !== -1);

                if (!hasTagInInput) {
                    _closeFull(); // User đã xóa tag -> Đóng hoàn toàn luồng API hiện tại
                    return;
                }

                // Nếu gõ @ khi đã có tag -> hiện menu tham số hoặc suggestion
                var lastAt = val.lastIndexOf('@');
                if (lastAt !== -1) {
                    var query = val.slice(lastAt + 1);
                    var eqPos = query.indexOf('=');

                    // Nếu vẫn đang gõ tên param (chưa có phần '='), và chuỗi không chứa khoảng trắng
                    if (eqPos === -1 && !/[\s]/.test(query)) {
                        _dbt = setTimeout(function () {
                            _menuShowParams(query);
                        }, 40); // Đẩy nhanh tốc độ xổ menu param
                        return;
                    }
                    // Nếu đã có phần '=', tức là đang gõ giá trị cho field
                    else if (eqPos !== -1) {
                        var pCode = '@' + query.slice(0, eqPos).trim();
                        var pVal = query.slice(eqPos + 1).trim();

                        // Chặn load value dropdown nếu param kết thúc bằng khoảng trắng (tức là đã điền xong)
                        if (val.endsWith(' ')) {
                            _dbt = setTimeout(function () {
                                _menuShowParams(''); // Hiện lại danh sách chọn param tiếp theo
                            }, 40); // Đẩy nhanh tốc độ
                            return;
                        }

                        // Nếu là catalog token (@khachhang, @sanpham...) thì dùng catalog value dropdown
                        if (_isCatalogToken(pCode.replace(/^@/, '').toLowerCase())) {
                            var _bareToken = pCode.replace(/^@/, '').toLowerCase();
                            var _kwToken = pVal;
                            _dbt = setTimeout(function () {
                                _menuShowCatalogValues(_bareToken, _kwToken);
                            }, 80);
                            return;
                        }

                        _dbt = setTimeout(function () {
                            _showInlineValues(pCode, pVal);
                        }, 250); // Đợi load DataSource nhanh
                        return;
                    }
                } else if (_activeApi && val.endsWith(' ')) {
                    // TRƯỜNG HỢP MỚI: Không có '@' nhưng đang trong API và kết thúc bằng dấu cách -> Hiện lại list param
                    _dbt = setTimeout(function () {
                        _menuShowParams('');
                    }, 40);
                    return;
                }

                if (_menuVis) _menuHide();
                return;
            }

            var pos = val.lastIndexOf('@');
            var querySearch = val;

            // Nếu đang có token dạng @type=... (ví dụ @khachhang=), tự động mở menu thực thể
            if (pos !== -1) {
                var tail = val.slice(pos + 1);
                // If there's nothing after '@' (user deleted back to '@'), reopen catalog suggestions
                if (tail.trim() === '') {
                    console.log('[ApiEngine] detected lone @ at pos', pos, '— reopening catalog/API menu');
                    clearTimeout(_dbt);
                    if (pos > 0 && val.slice(0, pos).trim().length > 0) {
                        _dbt = setTimeout(function () { console.log('[ApiEngine] calling _menuShowCatalog from watcher'); _menuShowCatalog('', pos); }, 80);
                    } else {
                        _dbt = setTimeout(function () { console.log('[ApiEngine] calling _menuShow (API list) from watcher'); _menuShow(''); }, 80);
                    }
                    return;
                }

                var eq = tail.indexOf('=');
                var tokenName = (eq !== -1 ? tail.slice(0, eq) : tail).split(/\s/)[0];
                tokenName = (tokenName || '').replace(/^@/, '').toLowerCase();
                if (tokenName && _isCatalogToken(tokenName)) {
                    var kw = '';
                    if (eq !== -1) kw = tail.slice(eq + 1).trim();
                    console.log('[ApiEngine] detected catalog tokenName=', tokenName, 'kw=', kw);
                    _lastCatalogType = tokenName;
                    clearTimeout(_dbt);
                    _dbt = setTimeout(function () { console.log('[ApiEngine] calling _menuShowCatalogValues from watcher for', tokenName); _menuShowCatalogValues(tokenName, kw); }, 80);
                    return;
                }
            }

            // Tính năng Mention Catalog: Nếu gõ @ ở giữa chừng câu nói (VD: "Tôi muốn mua @para...")
            if (pos > 0 && val.slice(0, pos).trim().length > 0) {
                querySearch = val.slice(pos + 1);
                _dbt = setTimeout(function () {
                    if (_lastCatalogType) {
                        _menuShowCatalogValues(_lastCatalogType, querySearch);
                    } else {
                        _menuShowCatalog(querySearch, pos);
                    }
                }, 120); // delay một chút cho query gọi API ngoài
                return;
            }

            if (pos !== -1) {
                querySearch = val.slice(pos + 1);
            } else if (val.trim() === '') {
                _menuHide();
                return;
            }

            _dbt = setTimeout(function () {
                if (!_apiList.length) _loadList(function () { _menuShow(querySearch); });
                else _menuShow(querySearch);
            }, 120);
        });

        inp.addEventListener('keydown', function (e) {
            if (!_menuVis) return;
            if (e.key === 'ArrowDown') { e.preventDefault(); e.stopPropagation(); _menuNav(1); }
            else if (e.key === 'ArrowUp') { e.preventDefault(); e.stopPropagation(); _menuNav(-1); }
            else if (e.key === 'Enter' || e.key === 'Tab') {
                // If Tab was used to pick, suppress auto-inserting the next '@'
                _suppressNextAt = (e.key === 'Tab');
                if (_menuPick()) {
                    e.preventDefault();
                    e.stopPropagation();
                    e.stopImmediatePropagation(); // Khóa chặt luồng nổi bọt
                }
                // Clear the flag shortly after click handler runs
                setTimeout(function () { _suppressNextAt = false; }, 50);
            }
            else if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); _menuHide(); }
        }, true); // Bắt buộc ưu tiên chạy trước file chatbot.js (Capture Mode)

        // Đã gỡ bỏ tự động đóng khi mất focus theo yêu cầu
    }

    // click ngoài panel thì thu nhỏ
    document.addEventListener('click', function (e) {
        if (_panelEl && _panelEl.classList.contains('active')) {
            var minBtn = document.getElementById('ae-panel-min');
            var isInside = _panelEl.contains(e.target);
            var triggerBtn = document.getElementById('ae-panel-trigger');
            var isTrigger = triggerBtn && triggerBtn.contains(e.target);
            var apiBtn = document.getElementById('btn-api');
            var isApiBtn = apiBtn && apiBtn.contains(e.target);

            if (!isInside && !isTrigger && !isApiBtn) {
                if (minBtn) minBtn.click();
            }
        }
    });

    /** Lay vai tro cua mot field tu Metadata SQL */
    function _getFieldRole(fieldName) {
        return _sysMeta[fieldName] || null;
    }

    /** Tim field trong row theo vai tro (Role) */
    function _getFieldByRole(row, targetRole) {
        if (!row) return null;
        for (var k in row) {
            if (_sysMeta[k] === targetRole) return { key: k, val: row[k] };
        }
        return null;
    }

    /** Lay danh sach fields theo vai tro */
    function _getFieldsByRole(role) {
        var keys = [];
        for (var k in _sysMeta) {
            if (_sysMeta[k] === role) keys.push(k);
        }
        return keys;
    }

    /** Tai metadata he thong tu n8n/SQL */
    function _loadSystemMeta() {
        return _post(CFG.META_URL, {}).then(function (res) {
            var data = Array.isArray(res) ? res : (res.data || []);
            _sysMeta = {};
            data.forEach(function (item) {
                if (item.FieldName && item.FieldRole) {
                    _sysMeta[item.FieldName] = item.FieldRole.toUpperCase();
                }
            });
            console.log('[ApiEngine] System Meta Loaded:', Object.keys(_sysMeta).length, 'rules');
            return _sysMeta;
        }).catch(function (e) {
            console.warn('[ApiEngine] Load System Meta failed:', e);
            return {};
        });
    }

    // ── Public API ────────────────────────────────────────────────────
    window.ApiEngine = {
        init: function (opts) {
            if (!opts || !opts.inputEl) return;
            _inputEl = opts.inputEl;
            _inputBarEl = opts.inputBarEl || document.getElementById('chat-input-bar');
            _cbMsg = opts.addMessage || null;
            _cbHtml = opts.addHtmlMessage || null;
            _cbRender = opts.renderCardView || null;
            _cbShow = opts.showTyping || null;
            _cbHide = opts.hideTyping || null;
            _cbGetToken = opts.getToken || null;
            _loadList(function () { console.log('[ApiEngine v3] ' + _apiList.length + ' APIs'); });
            _watchInput(_inputEl);

            // Tự động gắn sự kiện cho nút mở Grid (nếu có)
            var apiBtn = opts.apiBtn || document.getElementById('btn-api');
            if (apiBtn) {
                apiBtn.addEventListener('click', function (e) {
                    e.preventDefault();
                    window.ApiEngine.showMenu(_inputEl);
                });
            }
        },

        // Intercept _send() — trả true nếu ApiEngine xử lý
        handleSend: function () {
            if (!_activeApi) return false;
            var params = _collectParams();
            if (params === null) return true; // Validation fail, không gửi
            var api = _activeApi;

            // Kiểm tra IsConfirm từ metadata
            var isConfirm = api.config && api.config.info && (api.config.info.IsConfirm == 1 || api.config.info.IsConfirm === true);

            if (isConfirm) {
                _showConfirm(params, api);
            } else {
                _executeApi(api.apiCode, params, api.dispName, api.execType, api.config);
                // Clear state sau khi gọi xong
                _closeFull(true);
            }
            return true;
        },

        // Dùng khi người dùng xóa hash tag để giải phóng API State
        clearState: function () { _closeFull(true); },

        configure: function (cfg) { Object.assign(CFG, cfg); },
        open: function (code) { _onApiSelected(code); },
        getUiTemplate: function (apiCode) {
            if (!apiCode) return 'DEFAULT';
            var codeClean = apiCode.startsWith('@') ? apiCode : '@' + apiCode;
            // 1. Check in config cache
            if (_cfgCache[codeClean] && _cfgCache[codeClean].uiTemplate) return _cfgCache[codeClean].uiTemplate;
            // 2. Check in list cache
            var found = _apiList.find(function (a) { return a.ApiCode === codeClean; });
            return (found && found.UiTemplate) || 'DEFAULT';
        },
        getConfig: function (apiCode, cb) { _loadConfig(apiCode, cb); },

        // Mở @ menu từ button click (không cần gõ @)
        showMenu: function (inputEl) {
            if (inputEl) _inputEl = inputEl;

            if (_activeApi) {
                if (_panelEl) {
                    if (_panelEl.style.display === 'none') {
                        // Đang thu nhỏ -> Mở lên
                        _panelEl.style.display = '';
                        document.body.classList.add('ae-panel-open');
                        requestAnimationFrame(function () { _panelEl.classList.add('active'); });
                        var triggerBtn = document.getElementById('ae-panel-trigger');
                        if (triggerBtn) triggerBtn.style.display = 'none';
                    } else {
                        // Đang mở -> Thu nhỏ lại
                        _panelEl.classList.remove('active');
                        document.body.classList.remove('ae-panel-open');
                        setTimeout(function () { _panelEl.style.display = 'none'; }, 200);
                        var triggerBtn = document.getElementById('ae-panel-trigger');
                        if (triggerBtn) triggerBtn.style.display = 'flex';
                    }
                }
                return; // panel đang mở hoặc ẩn, toggle trạng thái thay vì mở menu
            }

            clearTimeout(_hideTimer);

            // Toggle logic: nếu đang hiện thì ẩn đi
            if (_menuVis) {
                _menuHide();
                return;
            }

            // Không tự động thêm ký tự '@' — chỉ focus và mở menu
            _inputEl.focus();

            if (!_apiList.length) {
                _loadList(function () { _menuShow(''); });
            } else {
                _menuShow('');
            }
        },

        refresh: function () {
            sessionStorage.removeItem(CFG.CACHE_KEY);
            _cfgCache = {};
            _loadList();
        },

        loadSystemMeta: _loadSystemMeta,
        getRoleMapping: function () { return _sysMeta; },
        getFieldRole: _getFieldRole,
        getFieldByRole: _getFieldByRole,
        getFieldsByRole: _getFieldsByRole,
        // Cho phép project-specific renderer gọi datasource qua n8n
        // Signature: loadDataSource(apiCode, dsString, keyword, callback)
        loadDataSource: _loadDataSource
    };
})();

