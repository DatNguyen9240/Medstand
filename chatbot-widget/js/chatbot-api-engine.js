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

 *  2. Chọn API → "#tag" trong input, filter panel trượt ln

 *  3. Điền filter (combobox live-search, date, v.v.)

 *  4. Nhấn Gửi → ApiEngine.handleSend() intercept → execute

 * ─────────────────────────────────────────────────────────────────────

 */

(function () {

    'use strict';



    // ── Config ────────────────────────────────────────────────────────

    // Tất cả URL/keys đọc từ api.config.js (API_CONFIG)  KHNG hardcode ở đy

    // Cấu trc API_CONFIG tối thiểu:

    // {

    //   N8N_BASE: 'https://your-n8n-host.com',          // bắt buộc

    //   CHAT_WEBHOOK: '/webhook/hook-ai-dainao',         // bắt buộc

    //   CHAT_API_KEY: 'your-key',                        // bắt buộc

    //   CATALOG_ROOT_API: '@danh_muc',                   // tuỳ project

    //   CART_CUSTOMER_DS: '@danh_muc|@Type=kh|...',      // tuỳ project

    // }

    if (typeof API_CONFIG === 'undefined' || !API_CONFIG.N8N_BASE) {

        console.error('[ApiEngine] API_CONFIG.N8N_BASE chưa được cấu hnh. Widget sẽ khng hoạt động.');

    }

    var _n8n = (typeof API_CONFIG !== 'undefined' && API_CONFIG.N8N_BASE) ? API_CONFIG.N8N_BASE : '';



    var CFG = {

        LIST_URL: _n8n + '/webhook/api-list-active',

        CFG_URL: _n8n + '/webhook/api-get-config',

        EXEC_URL: _n8n + '/webhook/api-execute',

        DS_URL: _n8n + '/webhook/api-datasource',

        META_URL: _n8n + '/webhook/api-get-system-meta',

        // W2 FIX: Giảm từ 10 phút → 2 phút để API mới phản ánh nhanh hơn
        // Dùng ApiEngine.invalidateCache() để force refresh ngay lập tức
        CACHE_TTL: 2 * 60 * 1000,

        CACHE_KEY: 'api_engine_v3_list',



        // --- C thể override từ API_CONFIG ---

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

    var _catalogDsMap = {};      // mapping type -> datasource string

    var _catalogRowsCache = {};  // cache rows per datasource để filter nhanh theo keystroke

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

                if (!text) return {}; // Xử l m lỗi rỗng trả về {} để hệ thống khng sập

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

            SearchKey: keyword || '',

            username: _user()   // Bắt buộc để SQL SP khng bo "User khng tồn tại"

        }).then(function (res) {

            var rows = [];

            // N8N c thể trả về array 2 chiều [ [ ... ] ] từ SQL Execute

            if (Array.isArray(res) && res.length === 1 && Array.isArray(res[0])) { res = res[0]; }

            

            if (Array.isArray(res)) {

                rows = res;

            } else if (res && res.data && Array.isArray(res.data.records)) {

                rows = res.data.records;

            } else if (res && Array.isArray(res.records)) {

                rows = res.records;

            } else if (res && res.data && Array.isArray(res.data)) {

                rows = res.data;

            } else if (res && typeof res === 'object') {

                // Nếu l object đơn lẻ (c chứa cc trường dữ liệu), bọc n vo mảng

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



    // ── Shared Row Field Resolver (100% logic, KHNG hardcode tn field) ──────

    // Dng chung cho mọi nơi cần lấy id/name/type/datasource từ 1 row API

    function _resolveRowFields(r) {

        var raw = r.json || r.raw || r.data || r || {};

        var entries = Object.entries(raw).filter(function (e) {

            return e[1] !== null && e[1] !== undefined && String(e[1]).trim() !== '';

        });



        // Pattern detect: chỉ dòng regex trn TN KEY, khng cần biết tn cụ thể

        var ID_PAT   = /id$|code$|^id$|^code$|^ma$|ma$|^ma[_\s]|^madanhmuc$/i;

        var NAME_PAT = /name|ten|label|title|mo_ta|mo ta|description|display/i;

        var DS_PAT   = /datasourcevalue/i;

        var TYPE_PAT = /type|phanloai|group|category|loai/i;



        function firstMatch(pat, excludePat) {

            for (var i = 0; i < entries.length; i++) {

                var k = entries[i][0], v = String(entries[i][1]);

                if (pat.test(k) && !(excludePat && excludePat.test(k))) return v;

            }

            return null;

        }



        var idVal   = firstMatch(ID_PAT)   || r.type || r.Type || r.value || r.ApiCode || '';

        var nameVal = firstMatch(NAME_PAT, ID_PAT) || r.label || r.Title || r.title || r.Name || r.name || '';

        var phVal   = firstMatch(TYPE_PAT) || '';

        var dsVal   = firstMatch(DS_PAT)   || r.DataSourceValue || r.datasourcevalue || '';



        // Length-sort last-resort: mọi schema lạ (kể cả tiếng Việt c dấu)

        // Di nhất = m tả/tn, ngắn nhất = m định danh

        if (!idVal || !nameVal) {

            var nonNums = entries.filter(function (e) {

                var sv = String(e[1]).trim();

                return sv.length > 1 && isNaN(Number(sv));

            });

            nonNums.sort(function (a, b) { return String(b[1]).length - String(a[1]).length; });

            if (!nameVal && nonNums.length > 0) nameVal = String(nonNums[0][1]);

            if (!idVal) {

                var nonName = nonNums.filter(function (e) { return String(e[1]) !== nameVal; });

                idVal = nonName.length > 0 ? String(nonName[nonName.length - 1][1]) : nameVal;

            }

        }

        if (!nameVal) nameVal = idVal;



        return { id: idVal, name: nameVal, ph: phVal, ds: dsVal };

    }

    // ─────────────────────────────────────────────────────────────────────────



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

        try {

            var authRaw = localStorage.getItem('auth_user') || localStorage.getItem('currentUser');

            if (authRaw) {

                var p = JSON.parse(authRaw);

                var uname = p.Username || p.username || p.UserName || p.sub || p.Name || p.id; // Added p.id in case username is stored as ID

                if (uname) return uname;

            }

        } catch (e) {}

        

        if (typeof _cbGetToken === 'function') {

            var tk = _cbGetToken();

            if (tk) {

                try {

                    var base64Url = tk.split('.')[1];

                    var base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');

                    var jsonPayload = decodeURIComponent(atob(base64).split('').map(function (c) {

                        return '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2);

                    }).join(''));

                    var p2 = JSON.parse(jsonPayload);

                    var uname2 = p2.Username || p2.username || p2.UserName || p2.sub;

                    if (uname2) return uname2;

                } catch (e) {}

            }

        }

        return ''; // Trả về rỗng nếu chưa xc thực (Strict mode - No Hardcode)

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

        function _strip(s) {

            return (s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/đ/g, 'd').replace(/[^a-z0-9]/g, '');

        }

        var q = _strip((query || '').replace(/^@/, ''));

        var filtered = _apiList.filter(function (a) {

            var code = _strip(a.ApiCode || '');

            var name = _strip(a.DisplayName || '');

            return code.indexOf(q) !== -1 || name.indexOf(q) !== -1;

        });



        if (!filtered.length) { _menuHide(); return; }



        var groups = {
            '🔹 Nghiệp vụ cơ bản': [],
            '🚀 Nghiệp vụ nâng cao': [],
            '📋 Khảo sát': []
        };

        var advKeys = ['goi_ydon_hang', 'tuyen_ban_hang', 'cham_diem', 'tich_luy', 'upsell', 'khuyen_mai', 'goi_ydon_thuoc', 'trong_tam', 'tra_cuu_san_pham'];
        var surveyKeys = ['khao_sat', 'khaosat', 'khao sat'];

        filtered.forEach(function (a) {
            var rawStr = ((a.ApiCode || '') + ' ' + (a.DisplayName || '')).toLowerCase();
            var compareStr = rawStr.replace(/_/g, '');

            var isSurvey = surveyKeys.some(function(k) { return rawStr.indexOf(k) > -1 || compareStr.indexOf(k.replace(/_/g, '')) > -1; });
            var isAdv = advKeys.some(function(k) { return rawStr.indexOf(k) > -1 || compareStr.indexOf(k.replace(/_/g, '')) > -1; });

            if (isSurvey) {
                groups['📋 Khảo sát'].push(a);
            } else if (isAdv) {
                groups['🚀 Nghiệp vụ nâng cao'].push(a);
            } else {
                groups['🔹 Nghiệp vụ cơ bản'].push(a);
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

            // KHNG hiện lại tham số đ c trong input

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



            // Kiểm tra xem c đang thực sự g phm '@' khng

            var lastAt = val.lastIndexOf('@');

            // Nếu dấu @ nằm ở cuối hoặc đang g dở th mới ghi đ, 

            // cn nếu đ cch ra (space) th phải chn thm

            if (lastAt !== -1 && lastAt >= val.lastIndexOf(' ')) {

                var prefix = val.slice(0, lastAt);

                _inputEl.value = prefix + insert;

            } else {

                // Chn thm vo cuối nếu khng c dấu @ hợp lệ để ghi đ

                var prefix = val.endsWith(' ') ? val : val + ' ';

                _inputEl.value = prefix + insert;

            }

            _inputEl.dispatchEvent(new Event('input', { bubbles: true }));

            _inputEl.focus();

            _menuHide();



            // Nếu tham số c DataSource hoặc l Ngy, hy hiển thị gợi  gi trị ngay lập tức

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

            // Hm pick khng phn biệt hoa thường

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



            var dispName = pick(['Name', 'ObjectName', 'FullName', 'label', 'ItemName', 'Sản Phẩm', 'Sản phẩm', 'San Pham', 'San pham', 'TenCuaHang', 'Tên cửa hàng']) || r.label || r.value || '';

            var dispId = pick(['MaDanhMuc', 'MaKhachHang', 'MA_KH', 'ID', 'Code', 'CustomerID', 'ItemID', 'DocumentID', 'Mã sp', 'Mã SP', 'Ma sp', 'Ma SP']) || r.value || '';

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





                if (valType) {

                    var dsFromRow = el.getAttribute('data-ds') || '';

                    if (dsFromRow) _catalogDsMap[valType] = dsFromRow;

                    _lastCatalogType = valType;

                    // Bổ sung lại tiền tố '@' để API Engine c thể parse được token ở cc bước sau

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

                // Sau khi chọn danh mục, nếu pha trước c tag API th tự động xổ tiếp menu param (filter)

                setTimeout(function () {

                    var v = _inputEl.value;

                    var tagIdx = v.lastIndexOf('#');

                    var atIdx = v.lastIndexOf('@');

                    // Nếu c tag API v @ vừa chọn nằm sau tag API

                    if (tagIdx !== -1 && atIdx > tagIdx) {

                        _menuShowParams('');

                    }

                }, 80);

            });

        });

    }



    function _menuShowCatalogValues(type, keyword, forceShowAll) {

        console.log('[ApiEngine] _menuShowCatalogValues called type=', type, 'keyword=', keyword, 'forceShowAll=', forceShowAll);

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

            var MAX_ITEMS = 50;

            var displayRows = forceShowAll ? rows : rows.slice(0, MAX_ITEMS);



            displayRows.forEach(function (r, idx) {

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



                var mAD = pickRaw(['MaDanhMuc', 'ObjectID', 'MaKhachHang', 'MA_KH', 'CUSTOMER_ID', 'CustomerCode', 'CustomerID', 'Ma', 'Code', 'ID', 'ItemID', 'DocumentID', 'Mã sp', 'Mã SP', 'Ma sp', 'Ma SP']) || r.value || '';

                var mName = pickRaw(['Name', 'ObjectName', 'FullName', 'HoTen', 'HOTEN', 'TEN_KH', 'TenKhachHang', 'Ten', 'label', 'ItemName', 'Sản Phẩm', 'Sản phẩm', 'San Pham', 'San pham', 'TenCuaHang', 'Tên cửa hàng']) || r.label || r.Name || '';

                var mPL = pickRaw(['PhanLoai', 'type', 'Type']) || '';



                if (!mName) mName = (r.label || r.value || '');

                if (!mAD) mAD = r.value || '';

                

                html += '<div class="ae-menu-item ae-val-item" data-code="' + _esc(mAD) + '" data-phanloai="' + _esc(mPL) + '" data-name="' + _esc(mName) + '" data-madanhmuc="' + _esc(mAD) + '">'

                    + '<span class="ae-val-name">' + _esc(mName) + '</span>'

                    + (mAD ? '<span class="ae-tag">' + _esc(mAD) + '</span>' : '')

                    + '</div>';

            });

            

            if (!forceShowAll && rows.length > MAX_ITEMS) {

                html += '<div class="ae-menu-item ae-val-item" data-code="__SHOW_ALL" data-name="Xem full">'

                    + '<span class="ae-val-name" style="color:var(--color-primary);font-weight:bold;font-style:italic;display:block;text-align:center;width:100%;">⏬ Bấm để tải thm ' + (rows.length - MAX_ITEMS) + ' kết quả nữa...</span>'

                    + '</div>';

            }

            

            _menuEl.innerHTML = html;



            _positionMenu();



            _bindMenuItems(function (el) {

                if (el.getAttribute('data-code') === '__SHOW_ALL') {

                    _menuHide();

                    _dbt = setTimeout(function () {

                        _menuShowCatalogValues(type, keyword, true);

                    }, 50);

                    return;

                }



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

                    // Bổ sung Phn loại vo trước tn

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



    function _showInlineValues(fieldCode, keyword, forceShowAll) {

        if (!_activeApi || !_activeApi.config) return;

        var cfg = _activeApi.config;

        var fields = (cfg.filters && cfg.filters.length > 0) ? cfg.filters : (cfg.fields || []);



        // Tìm config của tham số hiện tại (v dụ: @ObjectID)

        var field = fields.find(function (f) {

            return (f.FieldCode || '').toLowerCase() === fieldCode.toLowerCase();

        });



        // --- BẮT BUỘC P KIỂU LỊCH NẾU DataType l Date ĐỂ CHỐNG CACHE BACKEND ---

        var isDateField = (field && (field.DataType === 'DATE' || field.DataType === 'DATETIME' || field.ControlType === 'date'))

            || (fieldCode || '').toLowerCase() === CFG.SYS_PARAMS.START_DATE

            || (fieldCode || '').toLowerCase() === CFG.SYS_PARAMS.END_DATE;



        if (isDateField) {

            if (!field) field = { FieldCode: fieldCode, FieldName: 'Ngy' };

            field.ControlType = 'date';

        }



        // Nếu tham số l ngy (date), hiển thị bộ chọn lịch Native HTML5 thay v list text

        if (field && (field.ControlType || '').toLowerCase() === 'date') {

            _menuCreate();

            var dValParam = keyword;

            if (!dValParam || dValParam.trim() === '') {

                // Mặc định l ngy hm nay nếu chưa nhập g (trnh lệch timezone khi chuyển toISOString)

                var tzOffset = (new Date()).getTimezoneOffset() * 60000;

                dValParam = (new Date(Date.now() - tzOffset)).toISOString().split('T')[0];

            }



            var html = '<div style="padding:12px; cursor:default; background:var(--ae-bg); border-radius:12px;">'

                + '<div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:12px;">'

                + '<label style="font-size:13px;font-weight:600;color:var(--ae-text);margin:0;">Chọn ngy <span style="font-weight:normal;color:var(--ae-text-muted);">(' + _esc(field.FieldName) + ')</span>:</label>'

                + '<button type="button" id="ae-inline-date-confirm" style="background:var(--ae-accent);color:#fff;border:none;padding:6px 12px;border-radius:6px;cursor:pointer;font-weight:600;font-size:12px;transition:all 0.2s;">Chn</button>'

                + '</div>'

                + '<input type="date" id="ae-inline-date" class="ae-ctrl" value="' + _esc(dValParam) + '" style="width:100%;font-size:15px;padding:10px;box-sizing:border-box;">'

                + '</div>';

            _menuEl.innerHTML = html;

            _positionMenu();



            // Allow focus and click inside the date input (ngăn bị block focus bởi menu)

            var di = document.getElementById('ae-inline-date');

            if (di) {

                di.addEventListener('mousedown', function (e) { e.stopPropagation(); });

                di.addEventListener('click', function (e) { e.stopPropagation(); try { di.showPicker(); } catch(err){} });

                // Tự động chn biến xuống khung nhập liệu khi Lịch được User thay đổi ngy

                di.addEventListener('change', function (e) {

                    var finalDate = di.value;

                    if (finalDate) {

                        _menuHide();

                        _onValueSelected(fieldCode, finalDate, { name: finalDate });

                    }

                });

                // Mở sẵn lịch ngay khi vừa trượt ln (nếu browser hỗ trợ)

                try { di.showPicker(); } catch (e) { }

            }



            var confirmBtn = document.getElementById('ae-inline-date-confirm');

            if (confirmBtn) {

                confirmBtn.addEventListener('click', function (e) {

                    e.stopPropagation();

                    var finalDate = document.getElementById('ae-inline-date').value;

                    _menuHide();

                    _onValueSelected(fieldCode, finalDate, { name: finalDate });

                });

            }

            return;

        }



        // Nếu khng c DataSource, thng bo cho người dòng biết để nhập tay v Enter

        if (!field || (!field.DataSourceType && !field.OptionsJson)) {

            _menuCreate();

            var html = '<div class="ae-menu-item ae-val-item ae-no-pick" style="color:var(--color-primary); font-style:italic;" '

                 + 'data-code="' + _esc(keyword) + '" data-name="Tìm: \'' + _esc(keyword) + '\'">'

                 + '<span class="ae-val-name">✍️ Vui lòng tự nhập nội dung vào đây rồi bấm phím Enter...</span>'

                 + '</div>';

            _menuEl.innerHTML = html;

            _positionMenu();

            return;

        }



        var dsType = field.DataSourceType || (field.OptionsJson ? 'STATIC' : null);

        var dsVal = field.DataSourceValue || field.OptionsJson;



        // ── Inject đ-chọn params vo DataSource pipeline ─────────────────

        // V dụ: @Type=sanpham đ chọn → dsVal "@danh_muc" → "@danh_muc|@Type=sanpham"

        // Support 2 cch:

        // 1. Token substitution: nếu dsVal c "{@Type}" → thay bằng _pillParams['@Type']

        // 2. Fallback: append tất cả _pillParams cn lại vo pipeline (|@key=val)

        if (dsType === 'APICODE' && dsVal && _pillParams && Object.keys(_pillParams).length > 0) {

            var sysUser = (CFG.SYS_PARAMS && CFG.SYS_PARAMS.USERNAME) || '@Username';

            // Bước 1: token substitution {@@FieldCode}

            dsVal = dsVal.replace(/\{(@[\w]+)\}/gi, function (match, pk) {

                return _pillParams[pk] || _pillParams[pk.toLowerCase()] || '';

            });

            // Bước 2: append cc pillParam chưa c mặt trong dsVal vo pipeline

            Object.keys(_pillParams).forEach(function (pk) {

                var pv = _pillParams[pk];

                // Skip username v trường hiện tại đang điền, v param trống

                if (!pv || pk.toLowerCase() === sysUser.toLowerCase()) return;

                if (pk.toLowerCase() === (fieldCode || '').toLowerCase()) return;

                // Chỉ append nếu key chưa c trong dsVal

                if (dsVal.toLowerCase().indexOf(pk.toLowerCase()) === -1) {

                    dsVal = dsVal + '|' + pk + '=' + pv;

                }

            });

        }

        // ──────────────────────────────────────────────────────────────────



        // ── Fallback: dòng catalogDsMap theo @Type đ chọn ────────────────

        // p dụng cả khi keyword rỗng (hiện ton bộ) hoặc khi c keyword (lọc)

        // Trigger khi field khng c dsVal riêng HOẶC keyword rỗng (SP cần keyword)

        if (dsType === 'APICODE' && _pillParams && _catalogDsMap) {

            var sysUserKey = (CFG.SYS_PARAMS && CFG.SYS_PARAMS.USERNAME) || '@Username';

            var catalogFallbackDs = null;

            Object.keys(_pillParams).forEach(function (pk) {

                if (catalogFallbackDs) return;

                if (pk.toLowerCase() === sysUserKey.toLowerCase()) return;

                if (pk.toLowerCase() === (fieldCode || '').toLowerCase()) return;

                var pv = _pillParams[pk];

                var typeKey = (pv || '').replace(/^@/, '').toLowerCase();

                if (typeKey && _catalogDsMap[typeKey]) {

                    catalogFallbackDs = _catalogDsMap[typeKey];

                }

            });

            // Dng fallback nếu: field khng c dsVal (bất kể keyword no)

            if (catalogFallbackDs && !dsVal) {

                console.log('[ApiEngine] _showInlineValues fallback to catalogDsMap:', catalogFallbackDs, 'kw:', keyword);



                // Hm render sau khi c rows (dòng lại cho cả cache v API)

                function renderFallbackRows(allRows) {

                    var rows = allRows;

                    // Client-side filter theo keyword

                    if (keyword) {

                        var kw = keyword.toLowerCase();

                        rows = allRows.filter(function (r) {

                            var raw = r.json || r.raw || r.data || r;

                            return Object.values(raw || {}).some(function (v) {

                                return v !== null && v !== undefined && String(v).toLowerCase().indexOf(kw) !== -1;

                            });

                        });

                    }

                    _menuCreate();

                    var html = '';

                    

                    if (!rows.length) { 

                        // Nếu RAM cache khng c, hiện nt Gợi  tm trn my chủ

                        html += '<div class="ae-menu-item ae-val-item" style="color:var(--color-primary); font-style:italic;" '

                              + 'data-code="' + _esc(keyword) + '" data-name="Tìm: \'' + _esc(keyword) + '\'">'

                              + '<span class="ae-val-name">🔍 Bấm Enter để tm "' + _esc(keyword) + '" trn my chủ...</span>'

                              + '</div>';

                    } else {

                        var MAX_ITEMS = 50;

                        var displayRows = forceShowAll ? rows : rows.slice(0, MAX_ITEMS);



                        displayRows.forEach(function (r) {

                            if (!r) return;

                            var f = _resolveRowFields(r);

                            if (!f.id && !f.name) return;

                            html += '<div class="ae-menu-item ae-val-item" data-code="' + _esc(f.id) + '" data-name="' + _esc(f.name) + '" data-id="' + _esc(f.id) + '">'

                                + '<span class="ae-val-name">' + _esc(f.name) + '</span>'

                                + (f.id && f.id !== f.name ? '<span class="ae-tag">' + _esc(f.id) + '</span>' : '')

                                + '</div>';

                        });



                        if (!forceShowAll && rows.length > MAX_ITEMS) {

                            html += '<div class="ae-menu-item ae-val-item" data-code="__SHOW_ALL" data-name="Xem full">'

                                + '<span class="ae-val-name" style="color:var(--color-primary);font-weight:bold;font-style:italic;display:block;text-align:center;width:100%;">⏬ Bấm để tải thm ' + (rows.length - MAX_ITEMS) + ' kết quả nữa...</span>'

                                + '</div>';

                        }

                        

                        // Lun hiển thị thm tùy chọn tm kiếm ton server ở cuối danh sch (nếu c g chữ)

                        if (keyword) {

                            html += '<div class="ae-menu-item ae-val-item" style="color:var(--color-primary); border-top:1px solid var(--color-border); margin-top:4px; padding-top:8px;" '

                                  + 'data-code="' + _esc(keyword) + '" data-name="Tìm: \'' + _esc(keyword) + '\'">'

                                  + '<span class="ae-val-name">🔍 Tìm tất cả sản phẩm chứa "' + _esc(keyword) + '"...</span>'

                                  + '</div>';

                        }

                    }

                    _menuEl.innerHTML = html;

                    _positionMenu();

                    _bindMenuItems(function (el) {

                        if (el.getAttribute('data-code') === '__SHOW_ALL') {

                            _menuHide();

                            _dbt = setTimeout(function () {

                                _showInlineValues(fieldCode, keyword, true);

                            }, 50);

                            return;

                        }



                        _menuHide();

                        var selCode = el.getAttribute('data-code') || '';

                        var selName = el.getAttribute('data-name') || '';



                        // ── Tự động execute API nền thay v chỉ fill field ──

                        // catalogFallbackDs = "@tra_cuu_san_pham|@TopN=50"

                        // → Extract API code phần trước pipe đầu tin

                        var underlyingApi = catalogFallbackDs.split('|')[0].trim(); // "@tra_cuu_san_pham"

                        var curApiCode = _activeApi && _activeApi.apiCode;



                        if (underlyingApi && underlyingApi !== curApiCode) {

                            var execP = {};

                            execP[fieldCode] = selCode; // e.g. @timkiem = "băng c nhn"

                            

                            // Parse thm cc tham số từ catalogFallbackDs (v dụ: |@TopN=50)

                            var dsParts = catalogFallbackDs.split('|');

                            for (var i = 1; i < dsParts.length; i++) {

                                var pPair = dsParts[i].split('=');

                                if (pPair.length >= 2) {

                                    execP[pPair[0].trim()] = pPair.slice(1).join('=').trim();

                                }

                            }



                            var uMeta = (_apiList || []).find(function (a) { return a.ApiCode === underlyingApi; }) || {};

                            var execType = uMeta.ExecutionType || 'QUERY';

                            var label = (selName || selCode);

                            // Load config của API nền rồi execute

                            _loadConfig(underlyingApi, function (config) {

                                _closeFull(true); // Xa sạch thanh input v reset state để trnh user lỡ bấm Enter lần nữa

                                _executeApi(underlyingApi, execP, label, execType, config);

                            });

                            return;

                        }

                        // ────────────────────────────────────────────────────



                        _onValueSelected(fCode, selCode, {

                            name: selName,

                            id: el.getAttribute('data-id') || selCode,

                            ph: el.getAttribute('data-phanloai')

                        });

                    });

                } // end renderFallbackRows



                // Dng cache nếu đ load trước đ (filter ngay trong RAM = nhanh như Google)

                // Dng cache nếu đ load trước đ (filter ngay trong RAM = nhanh như Google)

                if (_catalogRowsCache[catalogFallbackDs]) {

                    if (_catalogRowsCache[catalogFallbackDs] === 'loading') {

                        // Đang tải từ lần g trước, khng gọi API thm để trnh spam server

                        return;

                    }

                    renderFallbackRows(_catalogRowsCache[catalogFallbackDs]);

                } else {

                    _catalogRowsCache[catalogFallbackDs] = 'loading'; // Kha để trnh gọi đp

                    _loadDataSource('APICODE', catalogFallbackDs, '', function (loadedRows) {

                        if (!loadedRows || !loadedRows.length) { 

                            delete _catalogRowsCache[catalogFallbackDs];

                            _menuHide(); 

                            return; 

                        }

                        _catalogRowsCache[catalogFallbackDs] = loadedRows; // Lưu kết quả



                        // Tự động trigger lại input để render theo keyword MỚI NHẤT m user vừa g (trong lc chờ)

                        if (_inputEl) _inputEl.dispatchEvent(new Event('input', { bubbles: true }));

                    });

                }

                return; // Dừng lại, khng chạy tiếp xuống phần query Datasource chnh

            }

        }

        // ──────────────────────────────────────────────────────────────────



        _loadDataSource(dsType, dsVal, keyword, function (rows) {

            var rList = rows || [];

            if (!rList.length && !keyword) {

                _menuHide();

                return;

            }

            _menuCreate();

            var html = '';



            var MAX_ITEMS = 50;

            var displayRows = forceShowAll ? rList : rList.slice(0, MAX_ITEMS);



            displayRows.forEach(function (r) {

                var f = _resolveRowFields(r);

                var idVal = f.id, nameVal = f.name, phVal = f.ph, rowDsVal = f.ds;



                // Lưu DataSourceValue vo _catalogDsMap để field sau dòng

                if (idVal && rowDsVal) _catalogDsMap[String(idVal).toLowerCase()] = rowDsVal;

                if (nameVal && rowDsVal) _catalogDsMap[String(nameVal).toLowerCase()] = rowDsVal;



                var isObjectLike = (fieldCode || '').toLowerCase() === CFG.SYS_PARAMS.OBJECT_ID || (fieldCode || '').toLowerCase() === CFG.SYS_PARAMS.DOC_ID;

                var rightText = isObjectLike ? idVal : (r.sub || r.value || '');



                html += '<div class="ae-menu-item ae-val-item" data-code="' + _esc(idVal) + '" data-name="' + _esc(nameVal) + '" data-id="' + _esc(idVal) + '" data-phanloai="' + _esc(phVal) + '" data-ds="' + _esc(rowDsVal) + '">'

                    + '<span class="ae-val-name">' + _esc(nameVal) + '</span>'

                    + (idVal ? '<span class="ae-tag">' + _esc(idVal) + '</span>' : '')

                    + '</div>';

            });

            

            if (!forceShowAll && rList.length > MAX_ITEMS) {

                html += '<div class="ae-menu-item ae-val-item" data-code="__SHOW_ALL" data-name="Xem full">'

                    + '<span class="ae-val-name" style="color:var(--color-primary);font-weight:bold;font-style:italic;display:block;text-align:center;width:100%;">⏬ Bấm để tải thm ' + (rList.length - MAX_ITEMS) + ' kết quả nữa...</span>'

                    + '</div>';

            }

            

            // UX Đồng nhất: Hiện lựa chọn sử dụng cứng gi trị user g vo (gip UI giống hệt menu Catalog)

            if (keyword) {

                html += '<div class="ae-menu-item ae-val-item" style="color:var(--color-primary); border-top:1px solid var(--color-border); margin-top:4px; padding-top:8px;" '

                      + 'data-code="' + _esc(keyword) + '" data-name="' + _esc(keyword) + '">'

                      + '<span class="ae-val-name">✔️ Ghi nhận nhập: "' + _esc(keyword) + '"</span>'

                      + '</div>';

            }

            

            _menuEl.innerHTML = html;



            _positionMenu();



            _bindMenuItems(function (el) {

                if (el.getAttribute('data-code') === '__SHOW_ALL') {

                    _menuHide();

                    _dbt = setTimeout(function () {

                        _showInlineValues(fieldCode, keyword, true);

                    }, 50);

                    return;

                }

                

                _menuHide();

                // Lưu DataSourceValue từ data-ds của item được chọn vo catalogDsMap

                var pickedCode = el.getAttribute('data-code') || '';

                var pickedName = el.getAttribute('data-name') || '';

                var pickedDs = el.getAttribute('data-ds') || '';

                if (pickedCode && pickedDs) _catalogDsMap[pickedCode.toLowerCase()] = pickedDs;

                if (pickedName && pickedDs) _catalogDsMap[pickedName.toLowerCase()] = pickedDs;

                

                _onValueSelected(fieldCode, pickedCode, {

                    name: pickedName,

                    id: el.getAttribute('data-id') || pickedCode,

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

            // Trường hợp tham số API hoặc c PhanLoai từ Catalog: Hiện định dạng "PhanLoai Tn(M)"

            try { _pillParams[fieldCode] = pickedVal; } catch (e) { }



            var paramName = (fieldCode || '').replace(/^@/, '');

            var dispName = (selectedMeta && selectedMeta.name) ? selectedMeta.name : paramName;

            var dispId = (selectedMeta && selectedMeta.id) ? selectedMeta.id : pickedVal;



            var fullDisplay = paramName + ' ' + dispName;

            // Chỉ thm m ID vo ngoặc nếu m ID khc với tn

            if (dispId && String(dispId).toLowerCase() !== String(dispName).toLowerCase()) {

                fullDisplay += '(' + dispId + ')';

            }



            // XA TRẠNG THI tra cứu cũ TRƯỚC khi dispatch event để watcher khng bị nhầm

            _lastCatalogType = null;



            // CHỈ CHN GI TRỊ HIỂN THỊ

            var finalValue = (fullDisplay.indexOf(' ') !== -1 || fullDisplay.indexOf('(') !== -1) ? '"' + fullDisplay + '"' : fullDisplay;

            var finalInsert = finalValue + append;

            _inputEl.value = prefix + finalInsert;

        } else {

            // Store real value and insert friendly display (no leading '@')

            try { _pillParams[fieldCode] = pickedVal; } catch (e) { }

            var dispName = (selectedMeta && selectedMeta.name) ? selectedMeta.name : (fieldCode || '').replace(/^@/, '');

            // Chỉ thm id vo trong ngoặc nếu id khc rỗng v khc với name

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

        clearTimeout(_dbt); // Hủy mọi yu cầu mở menu đang chờ xử l

        

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

        var idx = _menuIdx;

        if (idx < 0) {

            idx = 0;

            // Scan for best match based on input keyword

            var qs = '';

            var lastItem = items[items.length - 1];

            if (lastItem && String(lastItem.getAttribute('data-name')).indexOf('Tìm:') === -1) {

                var rawCode = lastItem.getAttribute('data-code');

                if (rawCode && rawCode !== '__SHOW_ALL') {

                    qs = String(rawCode).toLowerCase().trim();

                }

            }

            if (qs) {

                for (var i = 0; i < items.length - 1; i++) {

                    var c = String(items[i].getAttribute('data-code') || '').toLowerCase();

                    if (c === qs || c.indexOf(qs) !== -1) {

                        idx = i;

                        break;

                    }

                }

            }

        }

        if (items[idx]) { 
            if (items[idx].classList.contains('ae-no-pick')) return false;
            items[idx].click(); 
            return true; 
        }

        return false;

    }



    // ── API Selected ──────────────────────────────────────────────────

    function _onApiSelected(apiCode) {

        var found = _apiList.find(function (a) { return a.ApiCode === apiCode; });

        var execType = found ? found.ExecutionType : 'QUERY';
        if (apiCode === '@lap_don_hang') { execType = 'CART'; }

        var dispName = found ? found.DisplayName : apiCode;



        _activeApi = { apiCode: apiCode, dispName: dispName, execType: execType, config: null };

        // Keep API tag state but do not leave visible '#' text: store on input dataset

        _replaceAtTag(apiCode);

        try { if (_inputEl) { _inputEl.dataset.apiTag = apiCode.replace('@', ''); } } catch (e) { }



        // Đảm bảo nt "mở lại panel" được khởi tạo sẵn (chỉ cho CART hoặc khi panel mở)

        if (execType !== 'QUERY') _createTriggerButton();



        _loadConfig(apiCode, function (config) {

            _activeApi.config = config;



            if (execType === 'CART' || execType === 'UPDATE' || execType === 'INSERT') {

                _openPanel(config, execType, dispName);

            } else {

                // QUERY flow: khng hiện panel, nhưng hiển thị tm tắt tham số trong chat

                var fields = (config && config.filters && config.filters.length > 0) ? config.filters : (config ? config.fields || [] : []);

                var visible = fields.filter(function (f) { return !f.IsSystemParam || f.IsSystemParam == 0; });

                if (visible && visible.length) {

                    try {

                        var msg = 'Tham số cho API **' + dispName + '**:\n';

                        visible.forEach(function (f) {

                            var code = f.FieldCode || f.field || '';

                            var name = f.FieldName || f.placeholder || f.placeholderText || '';

                            var req = (f.IsRequired == 1 || f.required) ? ' (Bắt buộc)' : '';

                            msg += '- ' + code + req + (name ? '  ' + name : '') + '\n';

                        });

                        // _cbMsg && _cbMsg('ai', msg); // Tắt in ra chat theo yu cầu của user cho đỡ rối



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



        // Pht sự kiện input để chatbot.js biết gi trị đ thay đổi -> cập nhật nt Gửi

        _inputEl.dispatchEvent(new Event('input', { bubbles: true }));

        _inputEl.focus();

    }



    // ── Filter Panel ──────────────────────────────────────────────────

    function _openPanel(config, execType, dispName) {

        _closePanel(true); // Chỉ xa DOM cũ, khng xa _activeApi



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

            html += '<div class="ae-panel-fields">' + fields.map(_buildField).join('') + '</div>';

        } else if (!fields.length) {

            html += '<div class="ae-panel-empty">Không có tham số  nhấn Gửi để thực hiện.</div>';

        } else {

            html += '<div class="ae-panel-fields">' + fields.map(_buildField).join('') + '</div>';

        }



        // Thêm nt Gửi ngay trn panel

        html += '<div class="ae-panel-footer">'

            + '<button class="ae-panel-send-btn" id="ae-panel-send-btn">'

            + '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="22" y1="2" x2="11" y2="13"></line><polygon points="22 2 15 22 11 13 2 9 22 2"></polygon></svg>'

            + ' Gửi</button>'

            + '</div>';



        _panelEl.innerHTML = html;



        var wrapper = document.querySelector('.chat-container') || document.querySelector('.chatbot-wrapper') || document.body;

        wrapper.appendChild(_panelEl);



        document.body.classList.add('ae-panel-open'); // Đnh dấu để ẩn navbar trn mobile

        _panelEl.querySelector('#ae-panel-min').addEventListener('click', function () {

            // Minimize thay v xa hon ton

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



        // Init DataGrid events cho bất kỳ panel no c .ae-datagrid-field

        _initDataGrid(_panelEl);



        // PRE-FILL cho UPDATE form: load data cũ v điền sẵn vo form

        if (execType === 'UPDATE') { _preFillUpdateForm(_panelEl, config); }



        requestAnimationFrame(function () { _panelEl.classList.add('active'); });

        setTimeout(function () {

            var first = _panelEl.querySelector('input:not([type=hidden]),select,textarea');

            if (first) {

                // Focus m khng bị nhảy (scroll to)

                first.focus({ preventScroll: true });

            }

        }, 200);

    }



    /**

     * _preFillUpdateForm

     * Gọi API hiện tại với key param (đ lưu trong _pillParams)

     * để lấy data hiện tại v điền sẵn vo tất cả fields trong panel.

     */

    function _preFillUpdateForm(panelEl, config) {

        if (!_activeApi) return;

        var keyParams = {};

        (config.filters || []).forEach(function (f) {

            var code = (f.FieldCode || '').replace('@', '');

            if (_pillParams[code] && _pillParams[code] !== '') {

                keyParams[f.FieldCode] = _pillParams[code];

            }

        });

        if (Object.keys(keyParams).length === 0) return;

        var bodyEl = panelEl.querySelector('.ae-panel-body');

        if (bodyEl) bodyEl.style.opacity = '0.4';

        _post(CFG.EXEC_URL, {

            ApiCode: _activeApi.apiCode, StoredProcedure: _activeApi.sp,

            params: keyParams, execType: 'QUERY', username: _user()

        }).then(function (res) {

            if (bodyEl) bodyEl.style.opacity = '';

            var rows = Array.isArray(res) ? res : (res && res.data ? res.data : null);

            if (!rows || rows.length === 0) return;

            var row = rows[0];

            Object.keys(row).forEach(function (col) {

                var val = row[col]; if (val === null || val === undefined) return;

                var inp = panelEl.querySelector('[name="@' + col + '"]')

                       || panelEl.querySelector('[name="' + col + '"]');

                if (!inp) return;

                inp.value = val;

                if (inp.type === 'hidden') {

                    var txt = panelEl.querySelector('#' + inp.id + '_txt');

                    if (txt) txt.value = val;

                }

                inp.dispatchEvent(new Event('change', { bubbles: true }));

            });

        }).catch(function () { if (bodyEl) bodyEl.style.opacity = ''; });

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

                v = v.replace(/#\S+\s*/g, ''); // Xa tag API

                v = v.replace(/@\w+=[^@]*/g, ''); // Xa cc param đang điền

                v = v.replace(/@\w*/g, ''); // Xa k tự @ thừa

                _inputEl.value = v.trim();

            }

            _inputEl.dispatchEvent(new Event('input', { bubbles: true }));

        }



        var triggerBtn = document.getElementById('ae-panel-trigger');

        if (triggerBtn) triggerBtn.style.display = 'none';



    }



    // ── Field Builder ─────────────────────────────────────────────────

    function _buildCartPanel(fields) {
        var html = '<div class="ae-cart-master-container" style="padding:10px; background:#fff; border-radius:8px; display:flex; flex-direction:column; gap:10px;">';
        fields.forEach(function(f) {
            if (f.FieldCode && f.FieldCode.toLowerCase().indexOf('sanpham') !== -1) return; // Skip detail field
            html += _buildField(f);
        });
        html += '</div>';

        html += '<div class="ae-cart-detail-container" style="background:#fff; border-radius:8px; padding:10px; margin-top:10px; border: 1px solid var(--color-border);">';
        html += '<div style="display:flex; justify-content:space-between; align-items:center; margin-bottom: 10px;">';
        html += '<span style="font-size: 14px; font-weight:600; color: var(--color-primary);">📦 Thêm dòng tạo đơn</span>';
        html += '</div>';
        html += '<div style="display:flex; gap:5px; font-size:12px; font-weight:600; color:#555; margin-bottom:8px; border-bottom:1px solid #eee; padding-bottom:4px;">';
        html += '<div style="flex:3;">SẢN PHẨM</div><div style="flex:1; text-align:center;">SL</div><div style="width:30px;text-align:center;"></div>';
        html += '</div>';
        
        html += '<div id="ae-cart-rows">';
        if (!_cartItems || _cartItems.length === 0) {
            html += '<div style="text-align:center; padding: 15px; color:#999; font-style:italic; font-size:13px;">Nhập liệu phía dưới hoặc Chat tự do (VD: "thêm 10 hộp abc")</div>';
        } else {
            _cartItems.forEach(function(item, idx) {
                html += '<div style="display:flex; gap:5px; margin-bottom:5px; align-items:center;">';
                var nameDisp = item.name ? item.name : item.id;
                html += '<div style="flex:3; background:#f0f2f5; padding:6px; border-radius:4px; font-size:13px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">' + _esc(nameDisp) + '</div>';
                html += '<div style="flex:1;"><input type="number" min="1" value="'+item.qty+'" class="ae-ctrl" style="padding:5px; width:100%; text-align:center;" onchange="window.ApiEngine.updateCartQty('+idx+', this.value)"></div>';
                html += '<div style="width:30px; cursor:pointer; text-align:center; font-size:16px; color:#ff4d4f;" onclick="window.ApiEngine.removeCartItem('+idx+')">🗑️</div>';
                html += '</div>';
            });
        }
        html += '</div></div>';
        return html;
    }

    function _buildField(f, _idx, allFields) {

        var code = f.FieldCode || '';
        var title = f.FieldName || code;
        var ph = f.Placeholder || f.Description || '';
        
        if (code === '@DocumentID') { title = 'Mã phiếu'; ph = 'Tự động tạo nếu để trống'; }
        if (code === '@ObjectID') { title = 'Khách hàng'; ph = 'Tìm hoặc chọn khách hàng'; }
        if (code === '@OrderDate') { title = 'Ngày tạo đơn'; }
        if (code === '@Description') { title = 'Ghi chú'; }
        if (code === '@ItemList') { title = ''; } // Hide the ItemList label because the grid has its own header!
        
        if (code.toLowerCase() === '@timkiem') { title = 'Từ khóa tìm kiếm'; ph = 'Gõ tên...'; }
        if (code.toLowerCase() === '@tensanpham') { title = 'Tên Sản Phẩm'; }
        if (code.toLowerCase() === '@itemid') { title = 'Mã Sản Phẩm'; }
        if (code.toLowerCase() === '@tungay') { title = 'Từ ngày'; }
        if (code.toLowerCase() === '@denngay') { title = 'Đến ngày'; }
        if (code.toLowerCase() === '@makhachhang') { title = 'Khách Hàng/Đối Tượng'; }

        var ctrl = f.ControlType || 'text';
        var reqd = f.IsRequired == 1;
        var defVal = _resolveDefault(f.DefaultValue || '');

        // Hide purely technical system params from the UI layer
        if (['@statusid', '@statusname', '@employeeid', '@topn', '@pageindex', '@pagesize'].includes(code.toLowerCase())) {
            var id = 'ae-f-' + code.replace('@', '').replace(/\W/g, '');
            return '<input type="hidden" id="' + id + '" name="' + _esc(code) + '" class="ae-ctrl" value="' + _esc(defVal) + '" data-field="' + id + '">';
        }


        var dsType = f.DataSourceType || null;

        var dsVal = f.DataSourceValue || null;

        var id = 'ae-f-' + code.replace('@', '').replace(/\W/g, '');



        var lbl = '';
        if (title !== '') {
            lbl = '<label class="ae-label" for="' + id + '">'
                + _esc(title) + (reqd ? '<em>*</em>' : '') + '</label>';
        }



        var input = '';



        // var ph = f.Placeholder || '';

        if (!reqd && ph.indexOf('tùy chọn') === -1 && ph.indexOf('tùy chọn') === -1) ph += (ph ? ' ' : '') + '(tùy chọn)';



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

            if (!defVal) {

                var dateFields = (allFields || []).filter(function (x) { return x.ControlType === 'date'; });

                var codeLow = (f.FieldCode || '').toLowerCase();

                var isFrom = codeLow.indexOf('tu') > -1 || codeLow.indexOf('start') > -1 || codeLow.indexOf('from') > -1;

                var isTo = codeLow.indexOf('den') > -1 || codeLow.indexOf('end') > -1 || codeLow.indexOf('to') > -1;

                

                if (dateFields.length === 1) isTo = true; // Chỉ c 1 ngy -> Mặc định l Đến ngy (Hm nay)

                else if (dateFields.length >= 2 && !isFrom && !isTo) {

                    if (dateFields[0].FieldCode === f.FieldCode) isFrom = true;

                    else if (dateFields[1].FieldCode === f.FieldCode) isTo = true;

                }



                var dVal = new Date();

                if (isFrom) { dVal.setMonth(dVal.getMonth() - 1); }

                var mm = (dVal.getMonth() + 1).toString().padStart(2, '0');

                var dd = dVal.getDate().toString().padStart(2, '0');

                defVal = dVal.getFullYear() + '-' + mm + '-' + dd;

            }

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

        else if (ctrl === 'datagrid') {

            // Render khung bảng sản phẩm (DataGrid)

            input = '<div class="ae-datagrid-field" id="' + id + '" data-field="' + id + '" name="' + _esc(code) + '">'

                + '<div class="ae-dg-header">'

                + '<span>Chi tiết sản phẩm</span>'

                + '<button type="button" class="ae-dg-add-btn" data-tgt="' + id + '">＋</button>'

                + '</div>'

                + '<div class="ae-dg-body" id="' + id + '_body"></div>'

                + '<div class="ae-dg-footer">'

                + '<span class="ae-dg-total-lbl">Tổng cộng</span>'

                + '<span class="ae-dg-total-val" id="' + id + '_total">0</span>'

                + '</div>'

                + '</div>';

        }

        else if (ctrl === 'tel') {
            input = '<input type="tel" id="' + id + '" name="' + _esc(code) + '" class="ae-ctrl" value="' + _esc(defVal) + '" placeholder="' + _esc(ph) + '"' + (reqd ? ' required' : '') + ' data-field="' + id + '" oninput="this.value = this.value.replace(/[^0-9]/g, \'\')">';
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

                hid.value = ''; // reset ID khi g lại

                var kw = this.value.trim();



                // STATIC: filter ngay, khng cần debounce

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



            // Xa hết → reset selection

            txt.addEventListener('keydown', function (e) {

                if ((e.key === 'Backspace' || e.key === 'Delete') && !this.value) {

                    hid.value = '';

                    sug.style.display = 'none';

                }

            });



            // Đng khi click ngoi

            var onDocClick = function (e) {

                if (!wrap.contains(e.target)) { sug.style.display = 'none'; }

            };

            document.addEventListener('click', onDocClick);

            _registerCleanup(function () { document.removeEventListener('click', onDocClick); });

        });

    }



    // ── DataGrid Logic ────────────────────────────────────────────────

    function _initDataGrid(container) {

        var grids = container.querySelectorAll('.ae-datagrid-field');

        grids.forEach(function (grid) {

            var gridId = grid.id;

            var addBtn = grid.querySelector('.ae-dg-add-btn');

            if (addBtn) {

                addBtn.addEventListener('click', function () {

                    _addDataGridRow(gridId);

                });

                // Tự tạo 1 dòng trống ban đầu

                _addDataGridRow(gridId);

            }

        });

    }



    window._addDataGridRow = _addDataGridRow;
    function _addDataGridRow(gridId) {

        var body = document.getElementById(gridId + '_body');

        if (!body) return;

        var rowId = 'r' + Date.now() + Math.random().toString(36).substr(2, 5);



        var html = '<div class="ae-dg-row" id="' + rowId + '">'

            + '<div class="ae-dg-col col-name">'

            + '<label>Sản phẩm</label>'

            + '<div class="ae-combo ae-combo-grid" data-ds-type="APICODE" data-ds-val="@tra_cuu_san_pham|@TopN=30|@timkiem={q}">'

            + '<input type="text" class="ae-ctrl ae-combo-txt" placeholder="Tìm hàng..." autocomplete="off">'

            + '<input type="hidden" class="ae-dg-val" data-col="ItemID">'

            + '<div class="ae-combo-sug" style="display:none"></div>'

            + '</div>'

            + '</div>'

            + '<div class="ae-dg-col col-sl"><label>SL</label><input type="number" class="ae-dg-val ae-dg-qty" data-col="Quantity" value="1"></div>'

            + '<div class="ae-dg-col col-price"><label>Gi</label><input type="number" class="ae-dg-val ae-dg-price" data-col="Price" value="0"></div>'

            + '<div class="ae-dg-col col-total"><label>Tổng</label><input type="text" class="ae-dg-total-row" readonly value="0"></div>'

            + '<button type="button" class="ae-dg-del-btn">✕</button>'

            + '</div>';



        var div = document.createElement('div');

        div.innerHTML = html;

        var rowEl = div.firstChild;

        body.appendChild(rowEl);



        // Init DataSource cho riêng dòng ny

        _initDataSourceFields(rowEl);



        // Bind events cho tnh ton

        var qtyIns = rowEl.querySelectorAll('.ae-dg-qty, .ae-dg-price');

        qtyIns.forEach(function (inp) {

            inp.addEventListener('input', function () { _calcDataGrid(gridId); });

        });



        // Xa dòng

        rowEl.querySelector('.ae-dg-del-btn').onclick = function () {

            rowEl.remove();

            _calcDataGrid(gridId);

        };

    }



    function _calcDataGrid(gridId) {

        var body = document.getElementById(gridId + '_body');

        if (!body) return;

        var rows = body.querySelectorAll('.ae-dg-row');

        var grandTotal = 0;

        rows.forEach(function (row) {

            var qty = parseFloat(row.querySelector('.ae-dg-qty').value) || 0;

            var price = parseFloat(row.querySelector('.ae-dg-price').value) || 0;

            var total = qty * price;

            var totalInp = row.querySelector('.ae-dg-total-row');

            if (totalInp) totalInp.value = total.toLocaleString();

            grandTotal += total;

        });

        var totalEl = document.getElementById(gridId + '_total');

        if (totalEl) totalEl.textContent = grandTotal.toLocaleString();

    }



    function _renderComboSug(sug, txt, hid, rows, showAll) {

        console.log('--- RENDER COMBO SUG CALLED ---', sug, rows.length);

        if (!rows || !rows.length) {

            sug.innerHTML = '<div class="ae-sug-empty">Không tìm thấy kết quả</div>';

            sug.style.display = 'block';

            return;

        }

        var limit = showAll ? rows.length : 12;

        var html = '<div class="ae-sug-header"><span class="ae-sug-col-id">M / ID</span><span class="ae-sug-col-name">Thông tin chi tiết</span></div>';

        html += rows.slice(0, limit).map(function (r) {
            // Lấy danh sách keys thật từ Backend, BỎ QUA cột STT (không fix cứng tên cột)
            var keys = Object.keys(r).filter(function(k) { return k.toUpperCase() !== 'STT'; });
            
            // 1. Cố gắng tìm Cột ID (chứa chữ 'id', 'mã', 'ma')
            var vKey = keys.find(function(k) { 
                var kl = k.toLowerCase(); 
                return kl === 'id' || kl.indexOf('id') > -1 || kl.indexOf('ma') === 0 || kl.indexOf('mã') === 0; 
            }) || (keys.length > 0 ? keys[0] : null);
            
            // 2. Cố gắng tìm Cột Label (chứa chữ 'ten', 'tên', 'name')
            var lKey = keys.find(function(k) { 
                var kl = k.toLowerCase(); 
                return (kl.indexOf('ten') === 0 || kl.indexOf('tên') === 0 || kl.indexOf('name') > -1) && k !== vKey; 
            });
            
            if (!lKey && keys.length > 1) {
                // Fallback cột thứ 2 nếu cột 1 đã bị lấy
                lKey = keys.find(function(k) { return k !== vKey; });
            }
            if (!lKey) lKey = vKey;
            
            var val = vKey ? r[vKey] : '';
            var lbl = lKey ? r[lKey] : val;
            
            var subParts = [];
            var rawPrice = 0;
            
            // Từ cột thứ 3 trở đi, tự động quét và format làm dòng Sub
            for (var i = 2; i < keys.length; i++) {
                var col = keys[i];
                var v = r[col];
                if (v !== undefined && v !== null && v !== '') {
                    // Nếu Tên cột có chứa chữ Giá hoặc Price => Tự móc ra làm Đơn Giá (ẩn) để tính toán
                    if (col.toLowerCase().indexOf('gi') > -1 || col.toLowerCase().indexOf('price') > -1 || col.toLowerCase().indexOf('tiền') > -1) {
                         rawPrice = parseFloat(v) || 0;
                         subParts.push(col + ': ' + Number(v).toLocaleString('vi-VN'));
                    } else {
                         subParts.push(col + ': ' + v);
                    }
                }
            }
            
            var subAttr = subParts.join(' | ') || '';

            return '<div class="ae-sug-row" data-val="' + _esc(val) + '" data-lbl="' + _esc(lbl) + '" data-price="' + _esc(rawPrice) + '">'
                + '<div class="ae-sug-col-id"><span class="ae-sug-val">' + _esc(val) + '</span></div>'
                + '<div class="ae-sug-col-name">'
                + '<span class="ae-sug-lbl">' + _esc(lbl) + '</span>'
                + (subAttr ? '<span class="ae-sug-sub">' + _esc(subAttr) + '</span>' : '')

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

                // Tự động điền Giá nếu đang ở trong lưới DataGrid
                var gridRow = txt.closest('.ae-dg-row');
                if (gridRow) {
                    var priceInp = gridRow.querySelector('.ae-dg-price');
                    var priceVal = this.getAttribute('data-price');
                    if (priceInp && priceVal !== null && priceVal !== 'undefined') {
                        priceInp.value = priceVal;
                        
                        // Kích hoạt tính toán Tổng
                        var gridId = gridRow.closest('.ae-datagrid-field') ? gridRow.closest('.ae-datagrid-field').id : null;
                        if (gridId && typeof _calcDataGrid === 'function') {
                            _calcDataGrid(gridId);
                        }
                    }
                }
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

        document.body.classList.remove('ae-panel-open'); // Gỡ bỏ đnh dấu



        // Hiển thị nt "Mũi tn ln" ở thanh chat nếu khng đng hon ton (đng tạm)

        var triggerBtn = document.getElementById('ae-panel-trigger');

        if (triggerBtn) {

            triggerBtn.style.display = silent ? 'none' : 'flex';

        }



        if (silent) return; // Chỉ xa DOM  _activeApi cn nguyn



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

        btn.title = 'Mở lại bảng thao tc';



        // Gắn vo thanh chat

        var inputWrap = document.querySelector('.chat-input-wrap');

        if (inputWrap) {

            inputWrap.insertBefore(btn, inputWrap.querySelector('.chat-send-btn'));

        }



        btn.addEventListener('click', function (e) {

            e.preventDefault();

            this.style.display = 'none';

            if (_panelEl && _activeApi && _activeApi.config) {

                _panelEl.style.display = ''; // Dng '' thay v 'block' để ưu tin display: flex của CSS

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
        var lbl = f.FieldName || code;
        if (code === '@DocumentID') { lbl = 'Mã phiếu'; f.Description = 'Tự động tạo nếu để trống'; }
        if (code === '@ObjectID') { lbl = 'Khách hàng'; f.Description = 'Tìm hoặc chọn khách hàng'; }
        if (code === '@OrderDate') { lbl = 'Ngày hẹn'; }
        if (code === '@Description') { lbl = 'Ghi chú'; }
        if (code === '@ItemList') { lbl = 'Danh sách sản phẩm xuất'; }


                var ctrl = f.ControlType || 'text';

                var fcLow = code.toLowerCase();

                // System params (như @Username) lun auto-fill từ hệ thống

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

                        var finalVal = id || txt || "";

                        if (finalVal !== "") params[code] = finalVal;

                    }

                } else {

                    var el = _panelEl.querySelector('#' + fid);

                    if (el) {

                        if (f.ControlType === 'datagrid') {

                            // Serialize bảng thnh JSON mảng

                            var rows = [];

                            var body = _panelEl.querySelector('#' + fid + '_body');

                            if (body) {

                                body.querySelectorAll('.ae-dg-row').forEach(function (row) {

                                    var item = {};

                                    row.querySelectorAll('.ae-dg-val').forEach(function (inp) {

                                        var col = inp.getAttribute('data-col');
                                        var val = inp.value;
                                        
                                        // Fallback if hidden value is empty, try getting text box value
                                        if (!val && inp.type === 'hidden' && inp.previousElementSibling && inp.previousElementSibling.type === 'text') {
                                            val = inp.previousElementSibling.value;
                                        }

                                        if (col === 'Quantity' || col === 'Price') val = parseFloat(val) || 0;
                                        item[col] = val;
                                    });

                                    // Chỉ lấy dòng có ItemID (hoặc ItemName mà do AI/Text nhập hờm)
                                    if (item.ItemID && item.ItemID.trim() !== '') rows.push(item);

                                });

                            }

                            if (rows.length > 0) params[code] = JSON.stringify(rows);

                            else if (f.IsRequired == 1) { el.classList.add('ae-error'); hasErr = true; }

                        } else {

                            var v = el.value.trim();

                            if (f.IsRequired == 1 && !v) {

                                el.focus(); el.classList.add('ae-error'); hasErr = true;

                            } else {

                                el.classList.remove('ae-error');

                                if (v !== "") params[code] = v;

                            }

                        }

                    }

                }

            });

        }

        // --- TH2: Thu thập từ chuỗi văn bản (In-line/QUERY/CLI) ---

        else {

            var val = _inputEl.value.trim();



            // Kỹ thuật lai tạp: Dng Regex cắt tham số theo Space/Quotes (cho Power User)

            var cfgParams = (_activeApi.config && _activeApi.config.filters && _activeApi.config.filters.length > 0)

                ? _activeApi.config.filters : (_activeApi.config ? _activeApi.config.fields || [] : []);

            var visibleFields = cfgParams.filter(function (f) { return !f.IsSystemParam || f.IsSystemParam == 0; });



            var apiTagPattern = new RegExp('^#' + _activeApi.apiCode.replace(/^@/, '') + '(?:\\s+|$)', 'i');

            var plainInput = val.replace(apiTagPattern, '').trim();



            // 1. Regex tm @Key=Value truyền thống (lấy param v xa n khỏi chuỗi th!)

            var regexKV = /@([\w]+)=([^@]*)/g;

            var matchKV;

            while ((matchKV = regexKV.exec(plainInput)) !== null) {

                var key = matchKV[1];

                var v = matchKV[2].trim();

                if (!key.startsWith('@')) key = '@' + key;

                if (v !== "") params[key] = v;

            }

            

            // Xa sạch cc khai bo @Key=Value khỏi chuỗi để đoạn pha sau khng v tnh bị bắt nhầm

            plainInput = plainInput.replace(/@([\w]+)=([^@]*)/g, '').trim();



            // 2. Kỹ thuật Positional matching cho những tham số CN LẠI (khng c @)

            if (plainInput) {

                var regexTokens = /"([^"\\]*(?:\\.[^"\\]*)*)"|'([^'\\]*(?:\\.[^'\\]*)*)'|([^\s]+)/g;

                var tokens = [];

                var tkMatch;

                while ((tkMatch = regexTokens.exec(plainInput)) !== null) {

                    var tkVal = tkMatch[1] !== undefined ? tkMatch[1] : (tkMatch[2] !== undefined ? tkMatch[2] : tkMatch[3]);

                    tokens.push(tkVal);

                }



                // Map thứ tự token từ mảng vo visibleFields theo vị tr chưa điền

                var pIdx = 0;

                for (var i = 0; i < visibleFields.length && pIdx < tokens.length; i++) {

                    var vField = visibleFields[i];

                    var fCode = vField.FieldCode || vField.field || vField.name || '';

                    if (!fCode) continue;

                    if (!fCode.startsWith('@')) fCode = '@' + fCode;

                    

                    if (!params[fCode]) {

                        if (tokens[pIdx].indexOf('=') === -1) {

                            params[fCode] = tokens[pIdx];

                            pIdx++;

                        } else {

                            pIdx++;

                            i--; // Li field hiện tại lại để nhận token tiếp theo

                        }

                    }

                }

            }



            // Merge any pillParams (selected entities)  do not overwrite existing explicit params

            Object.keys(_pillParams).forEach(function (k) {

                if (!params[k]) { params[k] = _pillParams[k]; return; }

                // If inline text is display token (e.g. "Khch hng(ONL3404)"), keep real ID from hidden state

                if (/\(.+\)/.test(params[k])) params[k] = _pillParams[k];

            });



            // Kiểm tra tham số bắt buộc từ config

            if (_activeApi.config) {

                var cfgParams = (_activeApi.config.filters && _activeApi.config.filters.length > 0)

                    ? _activeApi.config.filters : (_activeApi.config.fields || []);

                cfgParams.forEach(function (f) {

                    var fcLow = (f.FieldCode || '').toLowerCase();

                    // Bypass validate cho cc system param

                    var isUserField = (fcLow === CFG.SYS_PARAMS.USERNAME.toLowerCase() || fcLow === 'username' || fcLow === '@username');

                    if (isUserField) return;



                    // Tự động tnh tham số thời gian cho TH2 (nhập qua Chat)

                    // Chỉ p dụng nếu Field thực sự l kiểu date để trnh bắt nhầm (vd: @TopN c chứa "to")

                    var isStartD = false, isEndD = false;

                    if (f.ControlType === 'date') {

                         isStartD = (fcLow.indexOf('tu') > -1 || fcLow.indexOf('start') > -1 || fcLow.indexOf('from') > -1);

                         isEndD = (fcLow.indexOf('den') > -1 || fcLow.indexOf('end') > -1 || fcLow.indexOf('to') > -1);

                         

                         // Dự đon nếu chỉ c 1 trường date v n khng r rng th n l Đến Ngy

                         var dCount = cfgParams.filter(function(x){ return x.ControlType==='date'; }).length;

                         if (!isStartD && !isEndD) {

                             if (dCount === 1) isEndD = true;

                             else if (cfgParams.indexOf(f) === 0) isStartD = true;

                             else isEndD = true;

                         }

                    }



                    if (!params[f.FieldCode] && (isStartD || isEndD || f.ControlType === 'date')) {

                        var d = new Date();

                        if (isStartD) d.setMonth(d.getMonth() - 1);

                        var mm = (d.getMonth() + 1).toString().padStart(2, '0');

                        var dd = d.getDate().toString().padStart(2, '0');

                        params[f.FieldCode] = d.getFullYear() + '-' + mm + '-' + dd;

                    }



                    if (f.IsRequired == 1 && (!f.IsSystemParam || f.IsSystemParam == 0)) {

                        if (!params[f.FieldCode]) {

                            console.warn('Thiếu tham số bắt buộc (đ bỏ qua chặn): ' + (f.FieldName || f.FieldCode));

                            // hasErr = false; // Bỏ qua chặn lỗi để AI/Backend tự handle

                        }

                    }

                });

            }

        }



        if (hasErr) return null;



        var uKey = CFG.SYS_PARAMS.USERNAME;
        if (!params[uKey]) params[uKey] = _user();

        if (_activeApi.execType === 'CART' && (_activeApi.apiCode === '@lap_don_hang')) {
            var payloadStr = encodeURIComponent(JSON.stringify(params));
            window.parent.location.hash = '/create-order?data=' + payloadStr;
            return null;
        }

        // Cứu cnh: Đảm bảo tham số Ngy lun được gn tự động nếu người dòng chỉ nhập keyword hoặc thiếu config
        var cfgContext = _activeApi.config || (_activeApi.apiConfig ? _activeApi.apiConfig : null);

        if (!cfgContext && window.ApiEngine && window.ApiEngine.CatalogConfig) {
            var tKey = (_activeApi.ApiCode || _activeApi.apiCode || _chatApiCode || '').replace(/^@/, '');

            var matchingConf = window.ApiEngine.CatalogConfig.filter(function(x) { return x.ApiCode.replace(/^@/, '') === tKey; })[0];

            if (matchingConf) cfgContext = matchingConf;

        }



        if (cfgContext) {

             var allFlds = (cfgContext.filters || []).concat(cfgContext.fields || []);

             var dateFields = allFlds.filter(function(x) { return x.ControlType === 'date'; });

             

             allFlds.forEach(function(f) {

                 var fKey = (f.FieldCode || '').startsWith('@') ? f.FieldCode : '@' + (f.FieldCode||'');

                 

                 // Nếu field l date nhưng lỡ nhận rc văn bản (do positional Regex di ngoằng) -> Reset

                 if (f.ControlType === 'date' && params[fKey] && typeof params[fKey] === 'string' && params[fKey].length > 15) {

                     delete params[fKey]; 

                 }

                 

                 if (f.ControlType === 'date' && !params[fKey]) {

                     var d = new Date();

                     var isStart = fKey.toLowerCase().indexOf('tu') > -1 || fKey.toLowerCase().indexOf('start') > -1;

                     if (f.ControlType === 'date' && !isStart && fKey.toLowerCase().indexOf('den') === -1) {

                         if (dateFields.length === 1) isStart = false; 

                         else if (allFlds.indexOf(f) === 0) isStart = true;

                     }

                     if (isStart) d.setMonth(d.getMonth() - 1);

                     var mm = (d.getMonth() + 1).toString().padStart(2, '0');

                     var dd = d.getDate().toString().padStart(2, '0');

                     params[fKey] = d.getFullYear() + '-' + mm + '-' + dd;

                 }

             });

        }



        return params;

    }



    // ── Confirmation Dialog ───────────────────────────────────────────

    function _showConfirm(params, api) {

        var overlay = document.createElement('div');

        overlay.className = 'ae-confirm-overlay';



        var msg = 'Bạn c chắc chắn muốn thực hiện hnh động ny khng?';

        // C thể bổ sung tm tắt params vo đy nếu cần



        overlay.innerHTML = '<div class="ae-confirm-card">'

            + '<div class="ae-confirm-title">Xc nhận yu cầu</div>'

            + '<div class="ae-confirm-msg">' + _esc(msg) + '</div>'

            + '<div class="ae-confirm-btns">'

            + '<button class="ae-confirm-btn ae-btn-cancel" id="ae-cf-no">Hủy bỏ</button>'

            + '<button class="ae-confirm-btn ae-btn-confirm" id="ae-cf-yes">Xc nhận</button>'

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



        // Tạo chuỗi hiển thị: chỉ hiện field người dùng nhập thực sự
        // Lọc: @Username, date macros [THIS_MONTH_START], giá trị rỗng
        var ps = Object.keys(params)
            .filter(function (k) {
                var uKey = CFG.SYS_PARAMS.USERNAME;
                var iKey = CFG.SYS_PARAMS.ITEM_LIST;
                var val = String(params[k] === null ? '' : params[k]);
                if (k === uKey || k === iKey) return false;
                if (val === '' || val === 'null') return false;
                if (/^\[.+\]$/.test(val)) return false; // Date macros nội bộ
                return true;
            })
            .map(function (k) {
                var f = cfgFilters.find(function (x) { return x.FieldCode === k; });
                var label = f ? f.FieldName : k.replace('@', '');
                return label + ': ' + params[k];
            })
            .join(' | ');

        _cbMsg && _cbMsg('user', dispName + (ps ? ' — ' + ps : ''));

        _cbShow && _cbShow();

        _post(CFG.EXEC_URL, { 

            ApiCode: apiCode, 

            StoredProcedure: sp, 

            params: params,

            username: _user() 

        }).then(function (res) {

                _cbHide && _cbHide();

                var r = typeof res === 'string' ? res : (res.reply || res.message || '');



                // --- Tự động render mảng Data ---

                // N8N c thể trả về array 2 chiều [ [ ... ] ]

                if (Array.isArray(res) && res.length === 1 && Array.isArray(res[0])) { res = res[0]; }

                if (res && res.data && Array.isArray(res.data) && res.data.length === 1 && Array.isArray(res.data[0])) { res.data = res.data[0]; }

                

                var arrData = Array.isArray(res) ? res : (res && Array.isArray(res.data) ? res.data : null);

                if (arrData && arrData.length > 0) {

                    var msgRow = arrData.find(function(row) { return row.Msg !== undefined; });

                    if (msgRow && msgRow.MsgType !== undefined) {

                        _cbMsg && _cbMsg('system', '⚠️ ' + msgRow.Msg);

                        return;

                    }

                    var dataRows = arrData.filter(function(row) { 

                        if (row.Msg !== undefined || row.Metadata_UITemplate) return false;

                        

                        // Lọc cc bản ghi CHỈ CHỨA gi trị null, undefined hoặc rỗng (do hm SUM của SQL tạo ra)

                        var valKeys = Object.keys(row).filter(function(k) {

                            var l = k.toLowerCase();

                            return l !== 'rowindex' && l !== 'totalrows' && l !== 'isdeleted' && String(k).indexOf('Metadata_') === -1;

                        });

                        if (valKeys.length === 0) return false;

                        var hasData = valKeys.some(function(k) {

                            var v = row[k];

                            return v !== null && v !== undefined && String(v).trim() !== '';

                        });

                        return hasData;

                    });

                    

                    if (dataRows.length === 0) {

                        _cbMsg && _cbMsg('ai', 'Dạ, em không tìm thấy dữ liệu nào phù hợp với điều kiện vừa lọc ạ.');

                        return;

                    }



                    if (_cbRender && _cbHtml) {

                        var uiTpl = (res.uiTemplate || ApiEngine.getUiTemplate(apiCode) || 'DEFAULT').toUpperCase();

                        var dtToRender = dataRows.length ? dataRows : arrData;

                        var html = _cbRender(dtToRender, r || ('🔍 Tìm thấy ' + dtToRender.length + ' kết quả'), apiCode, {

                            uiTemplate: uiTpl,

                            fieldRoles: ApiEngine.getRoleMapping(),

                            khCode: ''  // engine khng c context khCode, chatbot.js sẽ tự resolve

                        });

                        _cbHtml(html, r || '📊 Kết quả tra cứu');

                    } else {

                        // Fallback Text Markdown (nếu khng c UI mới)

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

                        if (r === '{}' || r === '{\n}' || r === '{\n  \n}') {

                            r = '❌ My chủ khng trả về dữ liệu (hoặc kết nối bị ngắt).';

                        }

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

            clearTimeout(_dbt); // Xa ngay timeout cũ để trnh menu v cớ nhảy ln sau khi xa chữ nhanh



            if (_activeApi) {

                // Live Feedback UI: Xc định Parameter tiếp theo cần điền

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

                        _inputEl.placeholder = 'Đ đủ tham số. Nhấn Enter để Gửi.';

                    }

                } catch (e) { console.error('Live feedback loop error', e); }



                // Kiểm tra tag #ApiCode cn trong input khng

                var tag = '#' + _activeApi.apiCode.replace('@', '');

                var hasTagInInput = (val.indexOf(tag) !== -1);



                if (!hasTagInInput) {

                    _closeFull(); // User đ xa tag -> Đng hon ton luồng API hiện tại

                    return;

                }



                // Nếu g @ khi đ c tag -> hiện menu tham số hoặc suggestion

                var lastAt = val.lastIndexOf('@');

                if (lastAt !== -1) {

                    var query = val.slice(lastAt + 1);

                    var eqPos = query.indexOf('=');



                    // Nếu vẫn đang g tn param (chưa c phần '='), v chuỗi khng chứa khoảng trắng

                    if (eqPos === -1 && !/[\s]/.test(query)) {

                        _dbt = setTimeout(function () {

                            _menuShowParams(query);

                        }, 40); // Đẩy nhanh tốc độ xổ menu param

                        return;

                    }

                    // Nếu đ c phần '=', tức l đang g gi trị cho field

                    else if (eqPos !== -1) {

                        var pCode = '@' + query.slice(0, eqPos).trim();

                        var pVal = query.slice(eqPos + 1).trim();



                        // Cho php người dòng g chuỗi di c dấu cch (v dụ: "băng c nhn"), 

                        // KHNG ngắt list gợi  giữa chừng chỉ v 1 dấu cch.



                        // Nếu l catalog token (@khachhang, @sanpham...) th dòng catalog value dropdown

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

                    // TRƯỜNG HỢP MỚI: Khng c '@' nhưng đang trong API v kết thc bằng dấu cch -> Hiện lại list param

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





            // Nếu đang c token dạng @type=... (v dụ @khachhang=), tự động mở menu thực thể

            if (pos !== -1) {

                var tail = val.slice(pos + 1);

                // If there's nothing after '@' (user deleted back to '@'), reopen catalog suggestions

                if (tail.trim() === '') {

                    console.log('[ApiEngine] detected lone @ at pos', pos, ' reopening catalog/API menu');

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



            // Tnh năng Mention Catalog: Nếu g @ ở giữa chừng cu ni (VD: "Ti muốn mua @para...")

            if (pos > 0 && val.slice(0, pos).trim().length > 0) {

                querySearch = val.slice(pos + 1);

                _dbt = setTimeout(function () {

                    if (_lastCatalogType) {

                        _menuShowCatalogValues(_lastCatalogType, querySearch);

                    } else {

                        _menuShowCatalog(querySearch, pos);

                    }

                }, 120); // delay một cht cho query gọi API ngoi

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

                    e.stopImmediatePropagation(); // Kha chặt luồng nổi bọt

                }

                // Clear the flag shortly after click handler runs

                setTimeout(function () { _suppressNextAt = false; }, 50);

            }

            else if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); _menuHide(); }

        }, true); // Bắt buộc ưu tin chạy trước file chatbot.js (Capture Mode)



        // Đ gỡ bỏ tự động đng khi mất focus theo yu cầu

    }



    // click ngoi panel th thu nhỏ

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
        getActiveApi: function() { return _activeApi; },
        refreshCartUI: function() {
            if (_activeApi && _activeApi.execType === 'CART' && _panelEl) {
                // To simple refresh, re-open panel with current context
                window.ApiEngine.open(_activeApi.apiCode);
            }
        },
        updateCartQty: function(idx, val) {
            if (_cartItems[idx]) { _cartItems[idx].qty = parseFloat(val) || 1; }
        },
        removeCartItem: function(idx) {
            _cartItems.splice(idx, 1);
            window.ApiEngine.refreshCartUI();
        },
        applyFormUpdate: function(res) {
            if (!_activeApi) return;
            
            if (res.action === 'SUBMIT') {
                var btn = document.getElementById('ae-panel-send-btn');
                if (btn) btn.click();
                return;
            }
            
            if (res.items && res.items.length > 0) {
                var grid = _panelEl ? _panelEl.querySelector('.ae-datagrid-field') : document.querySelector('.ae-datagrid-field');
                if (!grid) return;
                var gridId = grid.id;
                var body = document.getElementById(gridId + '_body');
                if (!body) return;

                res.items.forEach(function(it) {
                    var rows = body.querySelectorAll('.ae-dg-row');
                    var targetRow = null;
                    for (var k=0; k<rows.length; k++) {
                        var inpName = rows[k].querySelector('.ae-combo-txt');
                        if (inpName && inpName.value === '') { targetRow = rows[k]; break; }
                    }
                    if (!targetRow) {
                        try { window._addDataGridRow(gridId); } catch(e) { console.error(e); }
                        rows = body.querySelectorAll('.ae-dg-row');
                        targetRow = rows[rows.length - 1];
                    }
                    if (targetRow) {
                        var inName = targetRow.querySelector('.ae-combo-txt');
                        var inQty = targetRow.querySelector('.ae-dg-qty');
                        var inVal = targetRow.querySelector('.ae-dg-val[data-col="ItemID"]');
                        if (inName) inName.value = it.keyword;
                        if (inVal) inVal.value = it.keyword;
                        if (inQty) {
                            inQty.value = parseFloat(it.qty) || 1;
                            // trigger input change to calc prices
                            inQty.dispatchEvent(new Event('input', { bubbles: true }));
                        }
                    }
                });
            }
        },


        init: function (opts) {

            if (!opts || !opts.inputEl) return;
            
            document.body.classList.remove('ae-panel-open');
            window.addEventListener('hashchange', function() {
                if (window.ApiEngine && window.ApiEngine.clearState) {
                    window.ApiEngine.clearState();
                }
            });

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



            // Tự động gắn sự kiện cho nt mở Grid (nếu c)

            var apiBtn = opts.apiBtn || document.getElementById('btn-api');

            if (apiBtn) {

                apiBtn.addEventListener('click', function (e) {

                    e.preventDefault();

                    window.ApiEngine.showMenu(_inputEl);

                });

            }

        },



        // Intercept _send()  trả true nếu ApiEngine xử l

        handleSend: function () {

            if (!_activeApi) return false;

            var params = _collectParams();

            if (params === null) return true; // Validation fail, khng gửi

            var api = _activeApi;



            // ── Catalog Type Redirect khi Send ────────────────────────────

            // Nếu _pillParams c type m _catalogDsMap trỏ sang API khc

            // → Redirect execute sang API đ thay v API hiện tại (trnh lỗi too many args)

            if (_catalogDsMap && _pillParams) {

                var sysUserK = (CFG.SYS_PARAMS && CFG.SYS_PARAMS.USERNAME) || '@Username';

                var redirectDone = false;

                Object.keys(_pillParams).forEach(function (pk) {

                    if (redirectDone) return;

                    if (pk.toLowerCase() === sysUserK.toLowerCase()) return;

                    var pv = (_pillParams[pk] || '').toLowerCase();

                    var catalogDs = _catalogDsMap[pv] || _catalogDsMap[pv.replace(/^@/, '')];

                    if (!catalogDs) return;

                    var underApi = catalogDs.split('|')[0].trim();

                    if (!underApi || underApi === api.apiCode) return;

                    // Redirect: build params chỉ gồm cc key KHNG phải type-selector

                    var redirectP = {};

                    Object.keys(params).forEach(function (rk) {

                        if (rk.toLowerCase() === pk.toLowerCase()) return; // bỏ @Type

                        redirectP[rk] = params[rk];

                    });

                    var uMeta = (_apiList || []).find(function (a) { return a.ApiCode === underApi; }) || {};

                    var rExecType = uMeta.ExecutionType || api.execType || 'QUERY';

                    var rLabel = (uMeta.DisplayName || underApi);

                    console.log('[ApiEngine] handleSend catalog redirect:', api.apiCode, '→', underApi, 'params:', redirectP);

                    _loadConfig(underApi, function (cfg) {

                        _closePanel(false);

                        _executeApi(underApi, redirectP, rLabel, rExecType, cfg);

                        _closeFull(true);

                    });

                    redirectDone = true;

                });

                if (redirectDone) return true;

            }

            // ──────────────────────────────────────────────────────────────



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



        // Dng khi người dòng xa hash tag để giải phng API State

        clearState: function () { _closeFull(true); },



        configure: function (cfg) { Object.assign(CFG, cfg); },

        open: function (code) { _onApiSelected(code); return true; },

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



        // Mở @ menu từ button click (khng cần g @)

        showMenu: function (inputEl) {

            if (inputEl) _inputEl = inputEl;



            if (_activeApi) {

                if (_panelEl) {

                    if (_panelEl.style.display === 'none') {

                        // Đang thu nhỏ -> Mở ln

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

                } else {
                    _closeFull(true);
                }
                if (_panelEl) return; // panel đang mở hoặc ẩn, toggle trạng thi thay v mở menu
            }



            clearTimeout(_hideTimer);



            // Toggle logic: nếu đang hiện th ẩn đi

            if (_menuVis) {

                _menuHide();

                return;

            }



            // Không tự động thm k tự '@'  chỉ focus v mở menu

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
        // Cho php project-specific renderer goi datasource qua n8n
        loadDataSource: _loadDataSource,
        selectApi: _onApiSelected,
        hideMenu: _menuHide,

        // W2 FIX: Force refresh danh sach API (xoa cache sessionStorage)
        // Dung tu console: ApiEngine.invalidateCache()
        // Hoac goi sau khi them API moi ben BE
        invalidateCache: function () {
            try { sessionStorage.removeItem(CFG.CACHE_KEY); } catch(e) {}
            _apiList = [];
            _loadList(null);
            console.log('[ApiEngine] Cache invalidated — danh sach API se duoc tai lai.');
        }
    };

})();



