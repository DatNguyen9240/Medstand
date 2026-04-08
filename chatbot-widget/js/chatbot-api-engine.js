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
    // URL lấy từ api.config.js (API_CONFIG.N8N_BASE) — khi đổi tunnel chỉ sửa 1 chỗ
    var _n8n = (typeof API_CONFIG !== 'undefined' && API_CONFIG.N8N_BASE)
        ? API_CONFIG.N8N_BASE
        : 'https://seasonal-homes-portraits-fired.trycloudflare.com'; // fallback

    var CFG = {
        LIST_URL: _n8n + '/webhook/api-list-active',
        CFG_URL:  _n8n + '/webhook/api-get-config',
        EXEC_URL: _n8n + '/webhook/api-execute',
        DS_URL:   _n8n + '/webhook/api-datasource',
        CACHE_TTL: 10 * 60 * 1000,
        CACHE_KEY: 'api_engine_v3_list'
    };

    // ── State ─────────────────────────────────────────────────────────
    var _apiList = [];
    var _cfgCache = {};
    var _menuEl = null;
    var _panelEl = null;
    var _menuVis = false;
    var _menuIdx = -1;
    var _activeApi = null;   // { apiCode, dispName, execType, config }
    var _cartItems = [];
    var _hideTimer = null;
    var _lastCatalogType = null; // remember last selected catalog (sanpham, khachhang, ...)
    var _suppressNextAt = false; // when true, don't append ' @' after selecting a value (used for Tab)
    var _pillParams = {}; // store selected entity params as hidden state: { '@type': 'VALUE' }
    var _suppressMenuUntil = 0; // timestamp to prevent reopening menu immediately after selection

    // Callbacks từ chatbot.js
    var _cbMsg = null;
    var _cbShow = null;
    var _cbHide = null;
    var _inputEl = null;
    var _inputBarEl = null;

    // ── Helpers ───────────────────────────────────────────────────────
    function _tok() { var m = document.cookie.match(/(?:^|; )auth_token=([^;]*)/); return m ? m[1] : ''; }
    function _user() { try { return (JSON.parse(localStorage.getItem('auth_user') || '{}')).UserName || ''; } catch (e) { return ''; } }
    function _esc(s) { var d = document.createElement('div'); d.appendChild(document.createTextNode(String(s || ''))); return d.innerHTML; }
    function _fmtMoney(n) { return Number(n).toLocaleString('vi-VN') + 'đ'; }
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
        // Remove combining diacritics and all spaces/special chars to allow searching "chữ dính vô nhau"
        s = s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]/g, '');
        return s;
    }

    function _resolveDefault(v) {
        if (!v) return '';
        var now = new Date();
        if (v === 'TODAY') return now.toISOString().slice(0, 10);
        if (v === 'THIS_MONTH_START') return new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10);
        if (v === 'LAST_10_DAYS') return new Date(now - 10 * 864e5).toISOString().slice(0, 10);
        if (v === 'LAST_30_DAYS') return new Date(now - 30 * 864e5).toISOString().slice(0, 10);
        if (v === 'LAST_90_DAYS') return new Date(now - 90 * 864e5).toISOString().slice(0, 10);
        return v;
    }

    function _post(url, body) {
        return fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + _tok() },
            body: JSON.stringify(body)
        }).then(function (r) { return r.json(); });
    }

    // ── Load API List ─────────────────────────────────────────────────
    var _FALLBACK_LIST = [
        { ApiCode: '@goi_y_don_hang', DisplayName: '🛒 Gợi ý đơn hàng', Category: 'Bán hàng', ExecutionType: 'QUERY' },
        { ApiCode: '@upsell_goi_y', DisplayName: '✨ Upsell & Gợi ý SP', Category: 'Bán hàng', ExecutionType: 'QUERY' },
        { ApiCode: '@tao_don_hang', DisplayName: '📝 Tạo đơn hàng', Category: 'Bán hàng', ExecutionType: 'CART' },
        { ApiCode: '@goi_y_don_thuoc', DisplayName: '💊 Gợi ý đơn thuốc', Category: 'Bán hàng', ExecutionType: 'QUERY' },
        { ApiCode: '@tuyen_ban_hang', DisplayName: '🗺️ Lịch tuyến bán hàng', Category: 'Khách hàng', ExecutionType: 'QUERY' },
        { ApiCode: '@cham_diem_kh', DisplayName: '⭐ Chấm điểm KH', Category: 'Khách hàng', ExecutionType: 'QUERY' },
        { ApiCode: '@tich_luy', DisplayName: '🎁 Tích lũy chương trình', Category: 'Khuyến mại', ExecutionType: 'QUERY' },
        { ApiCode: '@san_pham_trong_tam', DisplayName: '🔥 Sản phẩm trọng tâm', Category: 'Khuyến mại', ExecutionType: 'QUERY' },
        { ApiCode: '@de_xuat_khuyen_mai', DisplayName: '📢 Đề xuất khuyến mãi', Category: 'Khuyến mại', ExecutionType: 'QUERY' },
        { ApiCode: '@tra_cuu_san_pham', DisplayName: '🔍 Tra cứu sản phẩm', Category: 'Tra cứu', ExecutionType: 'QUERY' },
        { ApiCode: '@ton_kho_list', DisplayName: '🏭 Tồn kho chi tiết', Category: 'Tra cứu', ExecutionType: 'QUERY' },
        { ApiCode: '@xem_hoa_don', DisplayName: '🧾 Xem hóa đơn', Category: 'Tra cứu', ExecutionType: 'QUERY' },
        { ApiCode: '@xem_don_hang', DisplayName: '📋 Xem đơn hàng', Category: 'Tra cứu', ExecutionType: 'QUERY' },
        { ApiCode: '@cong_no_kh', DisplayName: '💳 Công nợ khách hàng', Category: 'Tra cứu', ExecutionType: 'QUERY' },
        { ApiCode: '@cong_no_chi_tiet', DisplayName: '🧾 Chi tiết công nợ', Category: 'Tra cứu', ExecutionType: 'QUERY' },
        { ApiCode: '@danh_muc', DisplayName: '📚 Tra cứu danh mục', Category: 'Tra cứu', ExecutionType: 'QUERY' }
    ];

    function _loadList(cb) {
        try {
            var c = JSON.parse(sessionStorage.getItem(CFG.CACHE_KEY));
            if (c && c.data && c.data.length > 0 && Date.now() - c.ts < CFG.CACHE_TTL) { _apiList = c.data; cb && cb(_apiList); return; }
        } catch (e) { }

        _post(CFG.LIST_URL, { SearchKey: '' })
            .then(function (res) {
                var list = Array.isArray(res) ? res : (res.data || res.records || []);
                _apiList = (list && list.length > 0) ? list : _FALLBACK_LIST;
                try { sessionStorage.setItem(CFG.CACHE_KEY, JSON.stringify({ data: _apiList, ts: Date.now() })); } catch (e) { }
                cb && cb(_apiList);
            })
            .catch(function () {
                _apiList = _FALLBACK_LIST;
                cb && cb(_apiList);
            });
    }

    function _loadConfig(apiCode, cb) {
        if (_cfgCache[apiCode]) { cb(_cfgCache[apiCode]); return; }
        _post(CFG.CFG_URL, { ApiCode: apiCode })
            .then(function (res) {
                // API_GetConfig trả 1 row với FieldsJSON + FiltersJSON (FOR JSON PATH)
                // Backend có thể gói trong: res[0][0] / res.data[0] / res trực tiếp
                var row = null;
                if (Array.isArray(res) && Array.isArray(res[0])) {
                    row = res[0][0]; // [[row]] format
                } else if (Array.isArray(res) && res[0] && !Array.isArray(res[0])) {
                    row = res[0];    // [row] format
                } else if (res && res.data && Array.isArray(res.data)) {
                    row = res.data[0]; // {data:[row]} format
                } else if (res && res.data && !Array.isArray(res.data)) {
                    row = res.data;    // {data:row} format
                } else if (res && res.ApiCode) {
                    row = res;         // raw row format
                }

                var c;
                if (row && (row.FieldsJSON !== undefined || row.FiltersJSON !== undefined)) {
                    // Format mới: FOR JSON PATH — parse JSON string
                    c = {
                        info: row,
                        fields:  _parseJson(row.FieldsJSON),
                        filters: _parseJson(row.FiltersJSON)
                    };
                } else {
                    // Fallback format cũ: multi-resultset array
                    c = {
                        info:    Array.isArray(res[0]) ? res[0][0] : (res.api || {}),
                        fields:  Array.isArray(res[1]) ? res[1]    : (res.fields  || []),
                        filters: Array.isArray(res[2]) ? res[2]    : (res.filters || [])
                    };
                }
                _cfgCache[apiCode] = c;
                cb(c);
            })
            .catch(function () { cb(null); });
    }

    function _parseJson(str) {
        if (!str) return [];
        if (Array.isArray(str)) return str;
        try { return JSON.parse(str); } catch(e) { return []; }
    }

    // ── DataSource Loader ─────────────────────────────────────────────
    /**
     * Load options từ DataSource
     * @param {string} dsType   STATIC | SQL | APICODE
     * @param {string} dsValue  JSON | SP_Name | "@apicode|@Param=val"
     * @param {string} keyword  Search keyword
     * @param {function} cb     callback([ {value, label, sub} ])
     */
    function _loadDataSource(dsType, dsValue, keyword, cb) {
        if (!dsType || !dsValue) { cb([]); return; }

        // ── STATIC: parse JSON array ──────────────────────────────────
        if (dsType === 'STATIC') {
            var opts;
            try { opts = typeof dsValue === 'string' ? JSON.parse(dsValue) : dsValue; }
            catch (e) { opts = []; }
            if (keyword) {
                var kw = _clearVn(keyword);
                opts = opts.filter(function (o) {
                    return _clearVn(o.label || '').indexOf(kw) !== -1;
                });
            }
            cb(opts.slice(0, 20));
            return;
        }

        // ── SQL: gọi /api-datasource endpoint ────────────────────────
        if (dsType === 'SQL') {
            _post(CFG.DS_URL, {
                DataSourceType: 'SQL',
                DataSourceValue: dsValue,
                SearchKey: keyword || ''
            })
                .then(function (res) {
                    console.log('--- API RESPONSE ---', res);
                    var rawData = Array.isArray(res) ? res : (res.data || res.records || []);
                    console.log('--- EXTRACTED DATA ---', rawData, 'isArray:', Array.isArray(rawData));
                    cb(_normalizeDs(rawData));
                })
                .catch(function () { cb([]); });
            return;
        }

        // ── APICODE: "@apicode|@Param1=val1|@Param2=val2" ────────────
        if (dsType === 'APICODE') {
            var parts = dsValue.split('|');
            var apiCode = parts[0];        // @danh_muc
            var params = {};

            for (var i = 1; i < parts.length; i++) {
                var eq = parts[i].indexOf('=');
                if (eq > 0) params[parts[i].slice(0, eq)] = parts[i].slice(eq + 1);
            }
            // Thêm keyword làm search param
            if (keyword) params['@SearchText'] = keyword;

            _post(CFG.EXEC_URL, { ApiCode: apiCode, params: params })
                .then(function (res) {
                    console.log('--- API RESPONSE ---', res);
                    var rawData = Array.isArray(res) ? res : (res.data || res.records || []);
                    console.log('--- EXTRACTED DATA ---', rawData, 'isArray:', Array.isArray(rawData));
                    cb(_normalizeDs(rawData));
                })
                .catch(function () { cb([]); });
            return;
        }

        // ── API: external URL ─────────────────────────────────────────
        if (dsType === 'API') {
            var url = dsValue + (dsValue.indexOf('?') >= 0 ? '&' : '?') + 'q=' + encodeURIComponent(keyword || '');
            fetch(url).then(function (r) { return r.json(); })
                .then(function (res) { cb(_normalizeDs(Array.isArray(res) ? res : (res.data || []))); })
                .catch(function () { cb([]); });
            return;
        }

        cb([]);
    }

    // Mapping from catalog type -> APICODE to fetch entities
    var _CATALOG_APICODE = {
        'sanpham': '@tra_cuu_san_pham|@TopN=50',
        'khachhang': '@danh_muc|@Type=khachhang',
        'donhang': '@xem_don_hang',
        'khohang': '@ton_kho_list',
        'nhanvien': '@danh_muc|@Type=nhanvien'
    };

    /** Normalize response rows → [{value, label, sub}] */
    function _normalizeDs(rows) {
        function pick(obj, keys) {
            for (var i = 0; i < keys.length; i++) {
                var k = keys[i];
                if (obj === null || obj === undefined) break;
                if (obj[k] !== undefined && obj[k] !== null) return obj[k];
            }
            return '';
        }

        return rows.map(function (r) {
            // common keys (include Vietnamese column names returned by some SPs)
            var value = pick(r, ['value', 'Value', 'type', 'Type', 'MaDanhMuc', 'MaSP', 'Mã sp', 'MãSP', 'ObjectID', 'ItemID', 'ID']);
            var label = pick(r, ['label', 'Label', 'TenDanhMuc', 'PhanLoai', 'Sản Phẩm', 'SảnPhẩm', 'ItemName', 'ItemName', 'ObjectName', 'Name', 'EmployeeName']);
            var sub = pick(r, ['sub', 'Sub', 'SubText', 'icon', 'Icon', 'Address', 'Phone', 'Email', 'EMail', 'TaxCode', 'Taxcode', 'Code', 'Tồn Kho', 'TonKho', 'DonGia', 'Đơn Giá', 'DonGia', 'UnitPrice']);

            // Ensure strings
            value = value === undefined || value === null ? '' : String(value);
            label = label === undefined || label === null ? '' : String(label);
            sub = sub === undefined || sub === null ? '' : String(sub);

            return { value: value, label: label, sub: sub, raw: r };
        });
    }

    // ── @ Dropdown Menu ───────────────────────────────────────────────
    function _menuCreate() {
        if (_menuEl) return;
        _menuEl = document.createElement('div');
        _menuEl.id = 'ae-menu';
        _menuEl.className = 'ae-menu';
        _menuEl.style.display = 'none';

        var bar = _inputBarEl || document.getElementById('chat-input-bar');
        if (bar) bar.appendChild(_menuEl);
        else document.body.appendChild(_menuEl);
    }

    function _menuShow(query) {
        _menuCreate();
        var list = query
            ? _apiList.filter(function (a) {
                var q = _clearVn(query);
                var q2 = q.replace(/sp/g, 'sanpham').replace(/kh/g, 'khachhang').replace(/dh/g, 'donhang');
                var ac = _clearVn(a.ApiCode);
                var dn = _clearVn(a.DisplayName || '');
                return ac.indexOf(q) !== -1 || dn.indexOf(q) !== -1 || ac.indexOf(q2) !== -1 || dn.indexOf(q2) !== -1;
            })
            : _apiList;
        if (!list.length) { _menuHide(); return; }

        var groups = {}, order = [];
        list.forEach(function (a) {
            var cat = a.Category || 'Khác';
            if (!groups[cat]) { groups[cat] = []; order.push(cat); }
            groups[cat].push(a);
        });

        var html = '';
        order.forEach(function (cat) {
            html += '<div class="ae-menu-group">' + _esc(cat) + '</div>';
            groups[cat].forEach(function (a) {
                html += '<div class="ae-menu-item" data-code="' + _esc(a.ApiCode) + '">'
                    + '<span>' + _esc(a.DisplayName) + '</span>'
                    + '<span class="ae-tag">' + _esc(a.ExecutionType) + '</span>'
                    + '</div>';
            });
        });
        _menuEl.innerHTML = html;

        var wrap = document.querySelector('.chat-input-wrap');
        var bar = _inputBarEl || document.getElementById('chat-input-bar');
        var wrapRect = wrap ? wrap.getBoundingClientRect() : _inputEl.getBoundingClientRect();
        var barRect = bar ? bar.getBoundingClientRect() : wrapRect;

        _menuEl.style.display = 'block';
        // Vì đã là absolute bên trong bar, ta chỉ cần chỉnh left/width theo wrap
        _menuEl.style.bottom = '100%';
        _menuEl.style.left = (wrapRect.left - barRect.left) + 'px';
        _menuEl.style.width = wrapRect.width + 'px';
        _menuEl.style.borderRadius = '12px 12px 0 0';
        _menuVis = true; _menuIdx = -1;

        _menuEl.querySelectorAll('.ae-menu-item').forEach(function (el) {
            el.addEventListener('mousedown', function (e) { e.preventDefault(); });
            el.addEventListener('click', function () {
                _menuHide();
                _onApiSelected(this.getAttribute('data-code'));
            });
        });
    }

    function _menuHide() { if (_menuEl) _menuEl.style.display = 'none'; _menuVis = false; _menuIdx = -1; clearTimeout(_hideTimer); clearTimeout(_dbt); }

    function _showSelectionCard(meta) {
        try {
            var card = document.getElementById('ae-selection-card');
            if (!card) {
                card = document.createElement('div');
                card.id = 'ae-selection-card';
                card.className = 'ae-selection-card';
                var bar = _inputBarEl || document.getElementById('chat-input-bar');
                if (bar) bar.appendChild(card); else document.body.appendChild(card);
            }
            var ph = meta.ph || '';
            var name = meta.name || '';
            var id = meta.id || '';
            card.innerHTML = '<div class="ae-sel-left">' + _esc(ph) + '</div>'
                + '<div class="ae-sel-main">' + _esc(name) + (id ? ' (' + _esc(id) + ')' : '') + '</div>';
            card.style.display = 'block';
        } catch (e) { console.warn('showSelectionCard err', e); }
    }

    function _showSelectionPill(meta) {
        try {
            // pill displayed inside input bar after selection: PhanLoai(MaDanhMuc)
            var pill = document.getElementById('ae-selection-pill');
            if (!pill) {
                pill = document.createElement('div');
                pill.id = 'ae-selection-pill';
                pill.className = 'ae-selection-pill';
                var bar = _inputBarEl || document.getElementById('chat-input-bar');
                if (bar) bar.insertBefore(pill, (bar.firstChild || null)); else document.body.appendChild(pill);
            }
            var ph = meta.ph || '';
            var id = meta.id || '';
            var label = ph ? ph + (id ? ' (' + id + ')' : '') : (meta.name || id);
            pill.textContent = label;
            pill.style.display = 'flex';
        } catch (e) { console.warn('showSelectionPill err', e); }
    }

    // remove selection card when hiding menu/panel
    var _old_menuHide = _menuHide;
    _menuHide = function() {
        if (_menuEl) { _menuEl.style.display = 'none'; _menuEl.innerHTML = ''; }
        _menuVis = false; _menuIdx = -1; clearTimeout(_hideTimer); clearTimeout(_dbt);
        var c = document.getElementById('ae-selection-card'); if (c && c.parentNode) c.parentNode.removeChild(c);
        // keep selection pill visible until full close/clear
    };

    function _menuShowParams(query) {
        if (!_activeApi || !_activeApi.config) return;
        _menuCreate();
        
        var cfg = _activeApi.config;
        var fields = (cfg.filters && cfg.filters.length > 0) ? cfg.filters : (cfg.fields || []);
        // Bỏ system params
        fields = fields.filter(function(f) { return !f.IsSystemParam || f.IsSystemParam == 0; });

        var q = _clearVn(query);
        var list = q
            ? fields.filter(function (f) {
                return _clearVn(f.FieldCode).indexOf(q) !== -1 ||
                    _clearVn(f.FieldName || '').indexOf(q) !== -1;
            })
            : fields;

        if (!list.length) { _menuHide(); return; }

        var html = '';
        list.forEach(function (f) {
            html += '<div class="ae-menu-item ae-param-item" data-code="' + _esc(f.FieldCode) + '">'
                + '<span>' + _esc(f.FieldName || f.FieldCode) + '</span>'
                + '<span class="ae-tag">' + _esc(f.FieldCode) + '</span>'
                + '</div>';
        });
        _menuEl.innerHTML = html;

        var wrap = document.querySelector('.chat-input-wrap');
        var bar = _inputBarEl || document.getElementById('chat-input-bar');
        var wrapRect = wrap ? wrap.getBoundingClientRect() : _inputEl.getBoundingClientRect();
        var barRect = bar ? bar.getBoundingClientRect() : wrapRect;

        _menuEl.style.display = 'block';
        _menuEl.style.bottom = '100%';
        _menuEl.style.left = (wrapRect.left - barRect.left) + 'px';
        _menuEl.style.width = wrapRect.width + 'px';
        _menuVis = true; _menuIdx = -1;

        _menuEl.querySelectorAll('.ae-menu-item').forEach(function (el) {
            el.addEventListener('mousedown', function (e) { e.preventDefault(); });
            el.addEventListener('click', function () {
                _menuHide();
                _onParamSelected(this.getAttribute('data-code'));
            });
        });
    }

    function _onParamSelected(fieldCode) {
        var val = _inputEl.value;
        var atPos = val.lastIndexOf('@');
        
        // Nếu sau dấu @ cuối cùng đã có dấu '=' (tức là param trước đã hoàn thành)
        // hoặc chưa có @ nào, ta sẽ append (nối tiếp) thay vì replace (thay thế).
        var afterAt = atPos !== -1 ? val.slice(atPos) : '';
        var prefix = val;
        
        if (atPos !== -1 && afterAt.indexOf('=') === -1) {
            // Đang gõ dở @tham_so, thay thế phần đang gõ dở đó
            prefix = val.slice(0, atPos);
        }

        // Đảm bảo có dấu cách trước @ nếu cần
        if (prefix && !prefix.endsWith(' ')) prefix += ' ';
        _inputEl.value = prefix + fieldCode + '=';
        
        _inputEl.dispatchEvent(new Event('input', { bubbles: true }));
        _inputEl.focus();

        // Kỹ thuật mới: Tự động tải luôn danh sách gợi ý giá trị ngay sau khi chọn Param
        setTimeout(function () {
             _showInlineValues(fieldCode, '');
        }, 150);
    }

    function _menuShowCatalog(query, atPos) {
        console.log('[ApiEngine] _menuShowCatalog query=', query, 'atPos=', atPos);
        _loadDataSource('APICODE', '@danh_muc', query, function(rows) {
            if (!rows || !rows.length) { _menuHide(); return; }
            _menuCreate();
            var html = '';
            
                    rows.forEach(function(r) {
                             // include value as data-val so we can detect type (sanpham, khachhang...)
                             var rawType = (r.value || r.type || r.Value || r.MaDanhMuc || '') || '';
                             var valType = String(rawType).replace(/^@/, '').toLowerCase();
                             html += '<div class="ae-menu-item ae-val-item" data-lbl="' + _esc(r.label) + '" data-val="' + _esc(valType) + '">'
                                + '<span>' + _esc(r.label) + '</span>'
                                + (r.sub || valType ? '<span class="ae-tag">' + _esc(r.sub || valType) + '</span>' : '')
                                + '</div>';
                            });
            _menuEl.innerHTML = html;
            
            var wrap = document.querySelector('.chat-input-wrap');
            var bar = _inputBarEl || document.getElementById('chat-input-bar');
            var wrapRect = wrap ? wrap.getBoundingClientRect() : _inputEl.getBoundingClientRect();
            var barRect = bar ? bar.getBoundingClientRect() : wrapRect;

            _menuEl.style.display = 'block';
            _menuEl.style.bottom = '100%';
            _menuEl.style.left = (wrapRect.left - barRect.left) + 'px';
            _menuEl.style.width = wrapRect.width + 'px';
            _menuVis = true; _menuIdx = -1;

            _menuEl.querySelectorAll('.ae-menu-item').forEach(function (el) {
                el.addEventListener('mousedown', function (e) { e.preventDefault(); });
                el.addEventListener('click', function (e) {
                    e.preventDefault();
                    e.stopPropagation();
                    console.log('[ApiEngine] catalog clicked, data-lbl=', this.getAttribute('data-lbl'), 'data-val=', this.getAttribute('data-val'));
                    var lbl = this.getAttribute('data-lbl');
                    var valType = (this.getAttribute('data-val') || '').replace(/^@/, '').toLowerCase();
                    var val = _inputEl.value;
                    var prefix = val.slice(0, atPos);
                    // Dán lại text dưới dạng tag text thông thường — if possible insert canonical type and '='
                    if (valType) {
                        _lastCatalogType = valType;
                        _inputEl.value = prefix + '@' + valType + '=';
                        // show entity suggestions immediately for chosen catalog
                        setTimeout(function() { console.log('[ApiEngine] triggering _menuShowCatalogValues from click for', valType); _menuShowCatalogValues(valType, ''); }, 80);
                    } else {
                        _lastCatalogType = null;
                        _inputEl.value = prefix + '@' + lbl + ' ';
                    }
                    _inputEl.dispatchEvent(new Event('input', { bubbles: true }));
                    _inputEl.focus();
                    _menuHide();
                    // Sau khi chọn danh mục, nếu phía trước có tag API thì tự động xổ tiếp menu param (filter)
                    setTimeout(function() {
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
        });
    }

    function _menuShowCatalogValues(type, keyword) {
        console.log('[ApiEngine] _menuShowCatalogValues called type=', type, 'keyword=', keyword);
        if (!type) return;
        // normalize type (strip leading @ and lowercase)
        type = String(type).replace(/^@/, '').toLowerCase();
        var ds = _CATALOG_APICODE[type] || ('@danh_muc|@Type=' + type);
        console.log('[ApiEngine] resolved dsValue=', ds, 'for type=', type);
        _loadDataSource('APICODE', ds, keyword, function(rows) {
            if (!rows || !rows.length) { _menuHide(); return; }
            // DEBUG: print a sample of raw rows so we can see actual backend field names
            try { console.log('[ApiEngine] RAW ROWS SAMPLE:', (rows.slice ? rows.slice(0,5) : rows)); } catch(e) {}
            _menuCreate();
            var html = '';
            rows.forEach(function(r) {
                var raw = r.raw || r;
                function pickRaw(keys) {
                    for (var i = 0; i < keys.length; i++) {
                        var k = keys[i];
                        if (raw && raw[k] !== undefined && raw[k] !== null && String(raw[k]).trim() !== '') return raw[k];
                    }
                    return null;
                }

                // Right-side ID (MaDanhMuc) candidates
                var mAD = pickRaw(['MaDanhMuc','MaSP','MaKhachHang','Code','ObjectID','ItemID','ID','CustomerCode','ExternalCode']) || r.value || '';
                // Left-side name candidates (prefer actual name fields)
                var mName = pickRaw(['Name','FullName','HoTen','HOTEN','TenKhachHang','TEN_KH','Ten','CustomerName','ObjectName','ItemName','DisplayName','label']) || '';
                var mPhanLoai = pickRaw(['PhanLoai','type','Type']) || '';

                // If mName is missing or equals generic type label (e.g., 'Khách hàng'), try address/company fields
                var lowName = String(mName || '').toLowerCase();
                if (!mName || lowName === 'khách hàng' || lowName === 'khachhang' || lowName === (mPhanLoai || '').toLowerCase()) {
                    mName = pickRaw(['Address','DiaChi','AddressLine','Street','Company','CompanyName','AccountName','FullAddress','TenDiaChi']) || mName || r.label || '';
                }

                if (!mName) mName = r.label || '';

                html += '<div class="ae-menu-item ae-val-item" data-code="' + _esc(r.value) + '" data-phanloai="' + _esc(mPhanLoai) + '" data-name="' + _esc(mName) + '" data-madanhmuc="' + _esc(mAD) + '">'
                    + '<span class="ae-val-name">' + _esc(mName) + '</span>'
                    + (mAD ? '<span class="ae-val-id">' + _esc(mAD) + '</span>' : '')
                    + '</div>';
            });
            _menuEl.innerHTML = html;

            var wrap = document.querySelector('.chat-input-wrap');
            var bar = _inputBarEl || document.getElementById('chat-input-bar');
            var wrapRect = wrap ? wrap.getBoundingClientRect() : _inputEl.getBoundingClientRect();
            var barRect = bar ? bar.getBoundingClientRect() : wrapRect;

            _menuEl.style.display = 'block';
            _menuEl.style.bottom = '100%';
            _menuEl.style.left = (wrapRect.left - barRect.left) + 'px';
            _menuEl.style.width = wrapRect.width + 'px';
            _menuVis = true; _menuIdx = -1;

            _menuEl.querySelectorAll('.ae-menu-item').forEach(function (el) {
                el.addEventListener('mousedown', function (e) { e.preventDefault(); });
                el.addEventListener('click', function () {
                    // read meta
                    var ph = this.getAttribute('data-phanloai') || '';
                    var nm = this.getAttribute('data-name') || this.getAttribute('data-code') || '';
                    var md = this.getAttribute('data-madanhmuc') || this.getAttribute('data-code') || '';

                    // Insert selected catalog value visibly into the input text (no external pill)
                    try {
                        var code = this.getAttribute('data-code') || '';
                        var v = _inputEl.value || '';
                        var re = new RegExp('@' + type + '=[^@\s]*\s?', 'i');
                        var insert = '@' + type + '=' + code + ' ';
                        if (re.test(v)) {
                            v = v.replace(re, insert);
                        } else {
                            // try to find last occurrence of '@type' and replace from there, else append
                            var atIdx = v.toLowerCase().lastIndexOf('@' + type);
                            if (atIdx !== -1) {
                                // keep text before @type and replace rest
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
                });
            });
        });
    }

    function _showInlineValues(fieldCode, keyword) {
        if (!_activeApi || !_activeApi.config) return;
        var cfg = _activeApi.config;
        var fields = (cfg.filters && cfg.filters.length > 0) ? cfg.filters : (cfg.fields || []);
        
        // Tìm config của tham số hiện tại (ví dụ: @ObjectID)
        var field = fields.find(function(f) { 
            return (f.FieldCode || '').toLowerCase() === fieldCode.toLowerCase(); 
        });
        
        // Nếu không có DataSource (không cần load danh sách) thì ẩn đi
        if (!field || (!field.DataSourceType && !field.OptionsJson)) {
            _menuHide();
            return;
        }

        var dsType = field.DataSourceType || (field.OptionsJson ? 'STATIC' : null);
        var dsVal = field.DataSourceValue || field.OptionsJson;

        _loadDataSource(dsType, dsVal, keyword, function(rows) {
            if (!rows || !rows.length) {
                _menuHide();
                return;
            }
            _menuCreate();
            var html = '';
            
            rows.forEach(function(r) {
                 html += '<div class="ae-menu-item ae-val-item" data-code="' + _esc(r.value) + '">'
                    + '<span>' + _esc(r.label) + '</span>'
                    + (r.sub || r.value ? '<span class="ae-tag">' + _esc(r.sub || r.value) + '</span>' : '')
                    + '</div>';
            });
            _menuEl.innerHTML = html;
            
            var wrap = document.querySelector('.chat-input-wrap');
            var bar = _inputBarEl || document.getElementById('chat-input-bar');
            var wrapRect = wrap ? wrap.getBoundingClientRect() : _inputEl.getBoundingClientRect();
            var barRect = bar ? bar.getBoundingClientRect() : wrapRect;

            _menuEl.style.display = 'block';
            _menuEl.style.bottom = '100%';
            _menuEl.style.left = (wrapRect.left - barRect.left) + 'px';
            _menuEl.style.width = wrapRect.width + 'px';
            _menuVis = true; _menuIdx = -1;

            _menuEl.querySelectorAll('.ae-menu-item').forEach(function (el) {
                el.addEventListener('mousedown', function (e) { e.preventDefault(); });
                el.addEventListener('click', function () {
                    _menuHide();
                    _onValueSelected(fieldCode, this.getAttribute('data-code'));
                });
            });
        });
    }

    function _onValueSelected(fieldCode, pickedVal) {
        var val = _inputEl.value;
        var atPos = val.lastIndexOf('@');
        var prefix = (atPos !== -1 ? val.slice(0, atPos) : val);
        
        // Determine selection type
        var bare = (fieldCode || '').replace(/^@/, '').toLowerCase();
        var isCatalogEntity = !!_CATALOG_APICODE[bare];
        var isApiParam = false;
        if (_activeApi && _activeApi.config) {
            var cfgParams = (_activeApi.config.filters && _activeApi.config.filters.length > 0)
                ? _activeApi.config.filters : (_activeApi.config.fields || []);
            isApiParam = cfgParams.some(function(f) { return (f.FieldCode || '').toLowerCase() === (fieldCode || '').toLowerCase(); });
        }

        // Decide what to append after the picked value:
        // - If user used Tab to accept -> single space
        // - If selection is a catalog entity -> single space
        // - If selection is an API param value -> append ' @' to continue selecting next param
        // - Otherwise -> single space
        var append = ' ';
        if (_suppressNextAt) append = ' ';
        else if (isCatalogEntity) append = ' ';
        else if (isApiParam) append = ' @';
        else append = ' ';

        _inputEl.value = prefix + fieldCode + '=' + pickedVal + append;
        
        // Suppress menu reopening for a short moment to avoid flicker
        _suppressMenuUntil = Date.now() + 300;
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
        _replaceAtTag(apiCode);

        // Đảm bảo nút "mở lại panel" được khởi tạo sẵn (chỉ cho CART hoặc khi panel mở)
        if (execType !== 'QUERY') _createTriggerButton();

        _loadConfig(apiCode, function (config) {
            _activeApi.config = config;
            _cartItems = [];
            
            if (execType === 'CART') {
                _openPanel(config, execType, dispName);
            } else {
                // QUERY flow: không hiện panel, tự động hiện menu tham số
                // Thêm @ vào cuối nếu chưa có để kích hoạt menu
                if (!_inputEl.value.trim().endsWith('@')) {
                    _inputEl.value = _inputEl.value.trim() + ' @';
                    _inputEl.dispatchEvent(new Event('input', { bubbles: true }));
                }
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
        _panelEl.querySelector('#ae-panel-min').addEventListener('click', function() {
            // Minimize thay vì xóa hoàn toàn
            _panelEl.classList.remove('active');
            document.body.classList.remove('ae-panel-open'); // Tắt nền mờ
            setTimeout(function() { _panelEl.style.display = 'none'; }, 200);
            
            var triggerBtn = document.getElementById('ae-panel-trigger');
            if (triggerBtn) triggerBtn.style.display = 'flex';
        });
        _panelEl.querySelector('#ae-panel-close').addEventListener('click', function() {
            _closeFull();
        });
        _panelEl.querySelector('#ae-panel-send-btn').addEventListener('click', function() {
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
        _menuHide();
        if (_panelEl) {
            _panelEl.classList.remove('active');
            var p = _panelEl;
            setTimeout(function () { if (p.parentNode) p.parentNode.removeChild(p); }, 250);
            _panelEl = null;
        }
        document.body.classList.remove('ae-panel-open');
        _activeApi = null;
        _cartItems = [];
        _lastCatalogType = null;
        _pillParams = {};
        var p = document.getElementById('ae-selection-pill'); if (p && p.parentNode) p.parentNode.removeChild(p);
        
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
            document.addEventListener('click', function (e) {
                if (!wrap.contains(e.target)) { sug.style.display = 'none'; }
            });
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
    function _buildCartPanel(fields) {
        var khFields = (fields || []).filter(function (f) {
            var c = (f.FieldCode || '').toLowerCase();
            return c === '@objectid' || c === '@documentid';
        });
        return '<div class="ae-panel-fields">' + khFields.map(_buildField).join('') + '</div>'
            + '<div class="ae-cart-wrap">'
            + '<div class="ae-cart-search-row">'
            + '<input type="text" id="ae-cart-q" class="ae-ctrl" placeholder="🔍 Tìm sản phẩm...">'
            + '<div id="ae-cart-sug" class="ae-cart-sug" style="display:none"></div>'
            + '</div>'
            + '<div id="ae-cart-list" class="ae-cart-list"><p class="ae-sug-empty">Chưa có sản phẩm.</p></div>'
            + '<div id="ae-cart-total" class="ae-cart-total">Tổng: <strong>0đ</strong></div>'
            + '</div>';
    }

    function _initCartEvents() {
        var q = _panelEl.querySelector('#ae-cart-q');
        var sug = _panelEl.querySelector('#ae-cart-sug');
        var list = _panelEl.querySelector('#ae-cart-list');
        var tot = _panelEl.querySelector('#ae-cart-total');
        var t = null;

        q.addEventListener('input', function () {
            clearTimeout(t);
            var kw = this.value.trim();
            if (!kw) { sug.style.display = 'none'; return; }
            t = setTimeout(function () {
                _loadDataSource('APICODE', '@tra_cuu_san_pham|@SearchText=' + kw + '&@TopN=10', kw, function (rows) {
                    if (!rows.length) { sug.style.display = 'none'; return; }
                    var html = '<div class="ae-sug-header"><span class="ae-sug-col-id">Mã SP</span><span class="ae-sug-col-name">Tên sản phẩm</span></div>';
                    html += rows.map(function (r) {
                        return '<div class="ae-sug-row" data-val="' + _esc(r.value) + '" data-lbl="' + _esc(r.label) + '" data-price="' + _esc(r.price || 0) + '">'
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
                        el.addEventListener('click', function () {
                            _cartItems.push({ ItemID: this.getAttribute('data-val'), ItemName: this.getAttribute('data-lbl'), UnitPrice: parseFloat(this.getAttribute('data-price')) || 0, Quantity: 1 });
                            q.value = ''; sug.style.display = 'none';
                            _cartRender(list, tot);
                        });
                    });
                });
            }, 350);
        });

        document.addEventListener('click', function (e) {
            if (sug && !sug.contains(e.target) && e.target !== q) sug.style.display = 'none';
        });
    }

    function _cartAdd(item) {
        var ex = _cartItems.find(function (i) { return i.ItemID === item.ItemID; });
        if (ex) ex.Quantity++; else _cartItems.push(Object.assign({}, item));
    }

    function _cartRender(listEl, totEl) {
        if (!listEl) return;
        if (!_cartItems.length) {
            listEl.innerHTML = '<p class="ae-sug-empty">Chưa có sản phẩm.</p>';
            if (totEl) totEl.innerHTML = 'Tổng: <strong>0đ</strong>';
            return;
        }
        var total = 0;
        listEl.innerHTML = _cartItems.map(function (it, i) {
            total += (it.UnitPrice || 0) * it.Quantity;
            return '<div class="ae-cart-row">'
                + '<span class="ae-cart-name">' + _esc(it.ItemName) + '</span>'
                + '<input type="number" class="ae-cart-qty" data-i="' + i + '" value="' + it.Quantity + '" min="1">'
                + '<span class="ae-cart-price">' + _fmtMoney((it.UnitPrice || 0) * it.Quantity) + '</span>'
                + '<button class="ae-cart-del" data-i="' + i + '">✕</button>'
                + '</div>';
        }).join('');
        if (totEl) totEl.innerHTML = 'Tổng: <strong>' + _fmtMoney(total) + '</strong>';

        listEl.querySelectorAll('.ae-cart-qty').forEach(function (inp) {
            inp.addEventListener('change', function () {
                _cartItems[+this.getAttribute('data-i')].Quantity = Math.max(1, +this.value || 1);
                _cartRender(listEl, totEl);
            });
        });
        listEl.querySelectorAll('.ae-cart-del').forEach(function (btn) {
            btn.addEventListener('click', function () {
                _cartItems.splice(+this.getAttribute('data-i'), 1);
                _cartRender(listEl, totEl);
            });
        });
    }

    // ── Close Panel ───────────────────────────────────────────────────
    function _closePanel(silent) {
        if (_panelEl) {
            _panelEl.classList.remove('active');
            var p = _panelEl;
            setTimeout(function () { if (p.parentNode) p.parentNode.removeChild(p); }, 250);
            _panelEl = null;
        }
        document.body.classList.remove('ae-panel-open'); // Gỡ bỏ đánh dấu
        _cartItems = [];

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

        btn.addEventListener('click', function(e) {
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
                if (f.IsSystemParam == 1) {
                    if (code.toLowerCase() === '@username') params[code] = _user();
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
        // --- TH2: Thu thập từ chuỗi văn bản (In-line/QUERY) ---
        else {
            var val = _inputEl.value;
            // Regex tìm @Key=Value cho đến chữ @ tiếp theo hoặc hết chuỗi
            var regex = /@([\w]+)=([^@]*)/g;
            var match;
            while ((match = regex.exec(val)) !== null) {
                var key = match[1];
                var v = match[2].trim();
                if (!key.startsWith('@')) key = '@' + key;
                params[key] = v;
            }

            // Merge any pillParams (selected entities) — do not overwrite existing explicit params
            Object.keys(_pillParams).forEach(function(k) {
                if (!params[k]) params[k] = _pillParams[k];
            });

            // Kiểm tra tham số bắt buộc từ config
            if (_activeApi.config) {
                var cfgParams = (_activeApi.config.filters && _activeApi.config.filters.length > 0)
                    ? _activeApi.config.filters : (_activeApi.config.fields || []);
                cfgParams.forEach(function(f) {
                    if (f.IsRequired == 1 && (!f.IsSystemParam || f.IsSystemParam == 0)) {
                        if (!params[f.FieldCode]) {
                            alert('Thiếu tham số bắt buộc: ' + (f.FieldName || f.FieldCode));
                            hasErr = true;
                        }
                    }
                });
            }
        }

        if (hasErr) return null;
        if (!params['@Username']) params['@Username'] = _user();

        if (_activeApi.execType === 'CART') {
            if (!_cartItems.length) { alert('Vui lòng thêm ít nhất 1 sản phẩm.'); return null; }
            params['@ItemList'] = JSON.stringify(_cartItems.map(function (it) {
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

        // Tạo chuỗi hiển thị: chỉ hiện các field có giá trị
        var ps = Object.keys(params)
            .filter(function (k) {
                return k !== '@Username' && k !== '@ItemList' && params[k] !== "" && params[k] !== null;
            })
            .map(function (k) {
                // Tìm label của field để hiển thị cho thân thiện
                var f = config.filters.find(function (x) { return x.FieldCode === k });
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
                
                // --- Tự động render mảng Data thành Bảng Markdown (Table) ---
                if (res && res.data && Array.isArray(res.data) && res.data.length > 0) {
                    var arr = res.data;
                    // Lấy tiêu đề cột (bỏ các cột hệ thống dư thừa nếu có)
                    var keys = Object.keys(arr[0]).filter(function(k) { 
                        var l = k.toLowerCase();
                        return l !== 'rowindex' && l !== 'totalrows' && l !== 'isdeleted'; 
                    });
                    
                    if (keys.length > 0) {
                        var tb = '\n\n| ' + keys.join(' | ') + ' |\n';
                        tb += '|' + keys.map(function() { return '---'; }).join('|') + '|\n';
                        arr.forEach(function(item) {
                            tb += '| ' + keys.map(function(k) { 
                                var v = item[k]; 
                                if (v === null || v === undefined) return '';
                                return String(v).replace(/\|/g, '-').replace(/\n/g, ' '); 
                            }).join(' | ') + ' |\n';
                        });
                        r += tb;
                    }
                } else if (!r && typeof res === 'object') {
                    r = JSON.stringify(res, null, 2);
                }
                
                _cbMsg && _cbMsg('ai', r);
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
                // Kiểm tra tag #ApiCode còn trong input không
                var tag = '#' + _activeApi.apiCode.replace('@', '');
                if (val.indexOf(tag) === -1) {
                    _closeFull(); // Xóa tag -> Đóng hoàn toàn
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

                        _dbt = setTimeout(function () {
                            _showInlineValues(pCode, pVal);
                        }, 250); // Đợi load DataSource nhanh
                        return;
                    }
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
                if (tokenName && _CATALOG_APICODE[tokenName]) {
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

    // ── Public API ────────────────────────────────────────────────────
    window.ApiEngine = {
        init: function (opts) {
            if (!opts || !opts.inputEl) return;
            _inputEl = opts.inputEl;
            _inputBarEl = opts.inputBarEl || document.getElementById('chat-input-bar');
            _cbMsg = opts.addMessage || null;
            _cbShow = opts.showTyping || null;
            _cbHide = opts.hideTyping || null;
            _loadList(function () { console.log('[ApiEngine v3] ' + _apiList.length + ' APIs'); });
            _watchInput(_inputEl);
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
        clearState: function() { _closeFull(true); },

        configure: function (cfg) { Object.assign(CFG, cfg); },
        open: function (code) { _onApiSelected(code); },

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
                        setTimeout(function() { _panelEl.style.display = 'none'; }, 200);
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

            // Tự động thêm @ nếu chưa có
            var val = _inputEl.value;
            if (!/@\S*$/.test(val)) {
                _inputEl.value = (val && !val.endsWith(' ') ? val + ' ' : val) + '@';
            }
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
        }
    };

})();
