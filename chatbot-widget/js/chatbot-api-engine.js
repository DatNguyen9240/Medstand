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

    // ─── CIPHER HELPER (XOR + Base64) ───
    var Cipher = {
        encrypt: function (str, key) {
            key = key || 107;
            var b64 = btoa(unescape(encodeURIComponent(str)));
            var xor = '';
            for (var i = 0; i < b64.length; i++) {
                xor += String.fromCharCode(b64.charCodeAt(i) ^ key);
            }
            return btoa(xor);
        },
        decrypt: function (b64Cipher, key) {
            key = key || 107;
            var xor = atob(b64Cipher);
            var b64 = '';
            for (var i = 0; i < xor.length; i++) {
                b64 += String.fromCharCode(xor.charCodeAt(i) ^ key);
            }
            return decodeURIComponent(escape(atob(b64)));
        }
    };


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

        console.error('[ApiEngine] API_CONFIG.N8N_BASE chưa được cấu hình. Widget sẽ không hoạt động.');

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

        CACHE_KEY: 'api_engine_v4_list',



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

    var _cbMsg, _cbHtml, _cbRender, _cbShow, _cbHide, _cbGetToken, _cbSetWaiting;
    var _activeRequestController = null;

    var _suppressMenuUntil = 0, _suppressNextAt = false;

    var _catalogDsMap = {};      // mapping type -> datasource string

    var _catalogRowsCache = {};  // cache rows per datasource để filter nhanh theo keystroke

    var _catalogTypeOpenTimer = null;

    var _catalogTypeRequestSeq = 0;
    var _catalogTypeRowsCache = null;

    var _prevPlaceholder = '';



    // ── Networking Helpers ────────────────────────────────────────────

    function _post(url, data, signal) {
        var token = typeof _cbGetToken === 'function' ? _cbGetToken() : '';
        var n8nBase = (typeof API_CONFIG !== 'undefined' && API_CONFIG.N8N_BASE) ? API_CONFIG.N8N_BASE : '';
        var relativeUrl = url;
        if (n8nBase && url.indexOf(n8nBase) === 0) {
            relativeUrl = url.substring(n8nBase.length);
        }

        var rawPayload = JSON.stringify({
            method: 'POST',
            endpoint: relativeUrl,
            body: data
        });

        var encryptedData = Cipher.encrypt(rawPayload);
        var gatewayUrl = (typeof API_CONFIG !== 'undefined' && API_CONFIG.GATEWAY_URL) || '/api/gateway';

        return fetch(gatewayUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': token ? 'Bearer ' + token : ''
            },
            body: JSON.stringify({ data: encryptedData }),
            signal: signal
        }).then(function (res) {
            return res.json().then(function(resJson) {
                var decryptedText = Cipher.decrypt(resJson.data);
                var payload = decryptedText ? JSON.parse(decryptedText) : {};
                if (!res.ok) {
                    var gatewayError = new Error(payload.message || ('Gateway error: ' + res.status));
                    gatewayError.code = payload.code || 'GATEWAY_ERROR';
                    gatewayError.response = payload;
                    throw gatewayError;
                }
                return payload;
            });
        });
    }

    function _get(url) {
        var token = typeof _cbGetToken === 'function' ? _cbGetToken() : '';
        var n8nBase = (typeof API_CONFIG !== 'undefined' && API_CONFIG.N8N_BASE) ? API_CONFIG.N8N_BASE : '';
        var relativeUrl = url;
        if (n8nBase && url.indexOf(n8nBase) === 0) {
            relativeUrl = url.substring(n8nBase.length);
        }

        var rawPayload = JSON.stringify({
            method: 'GET',
            endpoint: relativeUrl,
            body: null
        });

        var encryptedData = Cipher.encrypt(rawPayload);
        var gatewayUrl = (typeof API_CONFIG !== 'undefined' && API_CONFIG.GATEWAY_URL) || '/api/gateway';

        return fetch(gatewayUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': token ? 'Bearer ' + token : ''
            },
            body: JSON.stringify({ data: encryptedData })
        }).then(function (res) {
            return res.json().then(function(resJson) {
                var decryptedText = Cipher.decrypt(resJson.data);
                var payload = decryptedText ? JSON.parse(decryptedText) : {};
                if (!res.ok) {
                    var gatewayError = new Error(payload.message || ('Gateway error: ' + res.status));
                    gatewayError.code = payload.code || 'GATEWAY_ERROR';
                    gatewayError.response = payload;
                    throw gatewayError;
                }
                return payload;
            });
        });
    }



    // ── Data Source Logic ─────────────────────────────────────────────

    function _normalizeDataSourceRows(payload) {
        if (payload === null || payload === undefined) return [];

        if (typeof payload === 'string') {
            var text = payload.trim();
            if (!text) return [];
            try {
                return _normalizeDataSourceRows(JSON.parse(text));
            } catch (e) {
                return [];
            }
        }

        if (Array.isArray(payload)) {
            var normalized = [];
            payload.forEach(function (item) {
                if (Array.isArray(item)) {
                    normalized = normalized.concat(_normalizeDataSourceRows(item));
                    return;
                }

                if (item && typeof item === 'object') {
                    var nestedKeys = ['json', 'raw', 'data', 'body', 'output'];
                    for (var nestedIdx = 0; nestedIdx < nestedKeys.length; nestedIdx++) {
                        var nested = item[nestedKeys[nestedIdx]];
                        if (nested !== undefined && nested !== item) {
                            var nestedRows = _normalizeDataSourceRows(nested);
                            if (nestedRows.length) {
                                normalized = normalized.concat(nestedRows);
                                return;
                            }
                        }
                    }
                    normalized.push(item);
                }
            });
            return normalized;
        }

        if (typeof payload === 'object') {
            var wrapperKeys = ['records', 'data', 'result', 'items', 'body', 'output', 'rows'];
            for (var i = 0; i < wrapperKeys.length; i++) {
                var wrapped = payload[wrapperKeys[i]];
                if (wrapped !== undefined && wrapped !== payload) {
                    var wrappedRows = _normalizeDataSourceRows(wrapped);
                    if (wrappedRows.length) return wrappedRows;
                }
            }

            var dataKeys = Object.keys(payload);
            var isDataRow = dataKeys.some(function (key) {
                var normalizedKey = String(key).toLowerCase();
                return normalizedKey === 'phanloai'
                    || normalizedKey === 'type'
                    || normalizedKey === 'name'
                    || normalizedKey === 'label'
                    || normalizedKey === 'madanhmuc'
                    || normalizedKey === 'datasourcevalue';
            });
            if (isDataRow) return [payload];
        }

        return [];
    }

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

            username: _user()   // Bắt buộc để SQL SP không báo "User không tồn tại"

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

            var normalizedRows = _normalizeDataSourceRows(res);
            cb(normalizedRows.length ? normalizedRows : rows);

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

        var cachedConfig = _cfgCache[apiCode];
        if (cachedConfig && Date.now() - Number(cachedConfig.__cachedAt || 0) < 300000) {
            cb(cachedConfig);
            return;
        }

        _post(CFG.CFG_URL, { ApiCode: apiCode }).then(function (res) {

            var incomingVersion = res && res.contract ? res.contract.version : null;
            var staleVersion = Object.keys(_cfgCache).some(function (key) {
                var item = _cfgCache[key];
                return item && item.contract && item.contract.version && incomingVersion
                    && item.contract.version !== incomingVersion;
            });
            if (staleVersion) _cfgCache = {};
            res.__cachedAt = Date.now();
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

                _apiList = _withLocalWriteActions(data.list);

                if (cb) cb(_apiList);

                return;

            }

        }



        _post(CFG.LIST_URL, {}).then(function (res) {

            // P1-04 wraps catalog rows with requestId for end-to-end tracing.
            // Keep backward compatibility with the former array/data shapes.
            _apiList = _withLocalWriteActions(Array.isArray(res) ? res : (res.records || res.data || []));

            sessionStorage.setItem(CFG.CACHE_KEY, JSON.stringify({

                ts: Date.now(),

                list: _apiList

            }));

            if (cb) cb(_apiList);

        }).catch(function (e) { console.error('Load list failed', e); if (cb) cb([]); });

    }

    // These two actions use the authenticated application endpoints that power
    // the existing Customer and Create Order screens. They remain available in
    // the assistant menu even when the read-only AI catalog omits mutations.
    function _withLocalWriteActions(list) {
        var result = Array.isArray(list) ? list.slice() : [];
        var actions = [
            {
                ApiCode: '@khach_hang_insert',
                DisplayName: 'Tạo khách hàng',
                Category: 'Thao tác nhanh',
                UiTemplate: 'FORM',
                ExecutionType: 'INSERT',
                LocalAction: true
            },
            {
                ApiCode: '@lap_don_hang',
                DisplayName: 'Lập đơn hàng',
                Category: 'Thao tác nhanh',
                UiTemplate: 'CART',
                ExecutionType: 'CART',
                LocalAction: true
            }
        ];

        actions.forEach(function (action) {
            var exists = result.some(function (item) {
                return String(item && item.ApiCode || '').toLowerCase() === action.ApiCode;
            });
            if (!exists) result.push(action);
        });
        return result;
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



    function _getApiMenuLabel(api) {
        var code = String(api && api.ApiCode || '').toLowerCase();
        if (code === '@hoa_don_chi_tiet') return 'Chi tiết hóa đơn';
        if (code === '@hoa_don') return 'Hóa đơn';
        if (code === '@san_pham_trong_tam') return 'Sản phẩm trọng tâm';
        if (code === '@de_xuat_khuyen_mai') {
            return _getCurrentUserScope().isManager
                ? 'Sản phẩm cần xem xét khuyến mãi'
                : 'Khuyến mãi công ty';
        }
        return String(api && (api.DisplayName || api.ApiCode) || '');
    }

    function _getApiMenuMeta(api) {
        var code = String(api && api.ApiCode || '').toLowerCase();
        var scope = _getCurrentUserScope();
        var meta = { icon: '⚙️', description: 'Mở chức năng ' + _getApiMenuLabel(api), group: 'other', order: 900 };
        var known = {
            '@khach_hang_insert': ['👤', 'Tạo khách hàng mới và lưu trực tiếp vào hệ thống', 'action', 10],
            '@lap_don_hang': ['🛒', 'Mở màn hình lập đơn và lưu đơn hàng thật', 'action', 20],
            '@doanh_so': ['📊', 'Xem doanh số theo thời gian và phạm vi được phân quyền', 'daily', 10],
            '@hoa_don': ['🧾', 'Tra cứu danh sách hóa đơn', 'daily', 20],
            '@hoa_don_chi_tiet': ['🔎', 'Xem các sản phẩm trong một hóa đơn', 'daily', 21],
            '@don_hang': ['📋', 'Tra cứu đơn hàng và trạng thái xử lý', 'daily', 30],
            '@danh_sach_tonkho': ['📦', 'Kiểm tra số lượng tồn kho', 'daily', 40],
            '@tra_cuu_san_pham': ['💊', 'Tìm sản phẩm và thông tin liên quan', 'daily', 50],
            '@cong_no_khach_hang': ['💰', 'Xem tổng hợp công nợ khách hàng', 'customer', 10],
            '@cong_no_chi_tiet': ['💳', 'Xem chi tiết công nợ của một khách hàng', 'customer', 20],
            '@tuyen_ban_hang': ['🗺️', 'Xem khách hàng và công việc cần ưu tiên', 'customer', 30],
            '@cham_diem_kh': ['⭐', 'Xem đánh giá và phân nhóm khách hàng', 'customer', 40],
            '@tich_luy': ['🎁', 'Xem tiến độ tích lũy và mốc thưởng', 'customer', 50],
            '@goi_ydon_hang': ['🛒', 'Gợi ý sản phẩm phù hợp để lên đơn', 'recommendation', 10],
            '@upsell_goi_y': ['➕', 'Gợi ý sản phẩm bán kèm', 'recommendation', 20],
            '@goi_ydon_thuoc': ['💊', 'Tham khảo nhóm sản phẩm theo nhu cầu', 'recommendation', 30],
            '@san_pham_trong_tam': ['🔥', 'Xem sản phẩm thuộc chương trình trọng tâm đang áp dụng', 'recommendation', 40],
            '@de_xuat_khuyen_mai': ['🏷️', scope.isManager ? 'Xem sản phẩm cần Manager/Admin xem xét khuyến mãi' : 'Xem chương trình khuyến mãi đã được công ty phê duyệt', 'recommendation', 50],
            '@danh_muc': ['🗂️', 'Tra cứu nhanh danh mục hệ thống', 'other', 10],
            '@thong_bao': ['🔔', 'Xem thông báo của tài khoản', 'other', 20],
            '@tim_san_pham_theo_trieu_chung': ['🩺', 'Tìm sản phẩm tham khảo theo triệu chứng', 'other', 30]
        };
        if (known[code]) {
            meta.icon = known[code][0];
            meta.description = known[code][1];
            meta.group = known[code][2];
            meta.order = known[code][3];
        } else if (code.indexOf('khao_sat') !== -1 || code.indexOf('khaosat') !== -1) {
            meta.icon = '📝';
            meta.description = 'Xem và thực hiện nghiệp vụ khảo sát';
            meta.group = 'survey';
        }
        return meta;
    }

    function _menuShow(query) {

        _menuCreate();

        function _strip(s) {

            return (s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/đ/g, 'd').replace(/[^a-z0-9]/g, '');

        }

        var q = _strip((query || '').replace(/^@/, ''));

        var filtered = _apiList.filter(function (a) {

            var code = _strip(a.ApiCode || '');

            var name = _strip(_getApiMenuLabel(a));

            var description = _strip(_getApiMenuMeta(a).description);

            return code.indexOf(q) !== -1 || name.indexOf(q) !== -1 || description.indexOf(q) !== -1;

        });



        var groups = {
            action: { label: 'Thao tác nhanh', items: [] },
            daily: { label: 'Dùng thường xuyên', items: [] },
            customer: { label: 'Khách hàng & công nợ', items: [] },
            recommendation: { label: 'Gợi ý & chương trình', items: [] },
            survey: { label: 'Khảo sát', items: [] },
            other: { label: 'Tra cứu khác', items: [] }
        };

        filtered.forEach(function (a) {
            var meta = _getApiMenuMeta(a);
            (groups[meta.group] || groups.other).items.push(a);
        });



        var html = '';

        if (!filtered.length) {
            html = '<div class="ae-menu-empty"><strong>Không tìm thấy chức năng phù hợp</strong><span>Thử nhập tên nghiệp vụ khác, ví dụ: tồn kho, công nợ hoặc khuyến mãi.</span></div>';
        }

        Object.keys(groups).forEach(function(groupKey) {

            var group = groups[groupKey];

            group.items.sort(function (a, b) {
                return _getApiMenuMeta(a).order - _getApiMenuMeta(b).order || _getApiMenuLabel(a).localeCompare(_getApiMenuLabel(b), 'vi');
            });

            if (group.items.length > 0) {

                html += '<div class="ae-menu-group">' + _esc(group.label) + '</div>';

                group.items.forEach(function (a) {

                    var meta = _getApiMenuMeta(a);

                    html += '<button type="button" class="ae-menu-item" data-code="' + _esc(a.ApiCode) + '">'

                        + '<span class="ae-menu-icon" aria-hidden="true">' + _esc(meta.icon) + '</span>'

                        + '<span class="ae-menu-copy"><strong>' + _esc(_getApiMenuLabel(a)) + '</strong><small>' + _esc(meta.description) + '</small></span>'

                        + '<span class="ae-menu-arrow" aria-hidden="true">›</span>'

                        + '</button>';

                });

            }

        });

        _menuEl.innerHTML = html;

        _positionMenu();



        _bindMenuItems(function (el, e) {

            // Không để click chọn nghiệp vụ nổi lên document và đóng menu
            // tham số mà nghiệp vụ vừa mở (Danh mục -> @Type).
            if (e) {
                e.preventDefault();
                e.stopPropagation();
            }

            var code = el.getAttribute('data-code');

            // Đóng menu chức năng trước, sau đó để API được chọn tự mở
            // menu tham số cần thiết (đặc biệt là Danh mục -> @Type).
            // Nếu ẩn sau _onApiSelected thì menu @Type vừa mở sẽ bị đóng ngay.
            _menuHide();
            _onApiSelected(code);

        });

    }



    function _getCurrentUserScope() {
        try {
            var raw = localStorage.getItem('auth_user') || localStorage.getItem('currentUser');
            var user = raw ? JSON.parse(raw) : {};
            var role = String(user.role || user.Role || user.roleName || user.RoleName || user.roleCode || user.RoleCode || '').toLowerCase();
            var group = String(user.UserGroupID || user.userGroupID || user.UserGroup || '').toLowerCase();
            var isAdmin = role.indexOf('admin') !== -1 || group.indexOf('admin') !== -1;
            var isManager = isAdmin || role.indexOf('manager') !== -1 || role.indexOf('quản lý') !== -1 || role.indexOf('quan ly') !== -1 ||
                group === 'ql' || group.indexOf('manager') !== -1 || group.indexOf('quản lý') !== -1 || group.indexOf('quan ly') !== -1 ||
                Number(user.Manager || user.manager) === 1 || user.IsManager === true || Number(user.IsManager || user.isManager) === 1 ||
                (user.EmployeeID && user.ManagerID && String(user.EmployeeID).toLowerCase() === String(user.ManagerID).toLowerCase());
            return { isAdmin: isAdmin, isManager: isManager };
        } catch (e) {
            return { isAdmin: false, isManager: false };
        }
    }

    function _friendlyApiMessage(message, fallback) {
        var raw = String(message || '').trim();
        if (!raw) return fallback || 'Không thể thực hiện yêu cầu. Vui lòng thử lại.';
        if (/chưa có hóa đơn hoàn tất.*gợi ý bán kèm/i.test(raw)) {
            var upsellCustomer = raw.match(/^Khách\s+(.+?)\s+chưa có hóa đơn hoàn tất/i);
            return (upsellCustomer ? 'Khách ' + upsellCustomer[1] + ' ' : 'Khách hàng ')
                + 'là khách mới hoặc chưa đủ lịch sử mua hàng. Hệ thống chưa gợi ý bán kèm riêng để tránh tư vấn sai. '
                + 'Hãy hỏi sản phẩm khách đang quan tâm, sau đó tìm sản phẩm liên quan và kiểm tra tồn kho trước khi bán.';
        }
        if (/chưa có hóa đơn hoàn tất.*gợi ý đơn hàng/i.test(raw)) {
            var orderCustomer = raw.match(/^Khách\s+(.+?)\s+chưa có hóa đơn hoàn tất/i);
            return (orderCustomer ? 'Khách ' + orderCustomer[1] + ' ' : 'Khách hàng ')
                + 'là khách mới hoặc chưa đủ lịch sử mua hàng. Hệ thống chưa dự đoán đơn hàng để tránh gợi ý sai. '
                + 'Sale nên tìm hiểu nhu cầu thực tế của khách trước khi chọn sản phẩm.';
        }
        if (/IDENTITY_MAPPING_NOT_FOUND|Authenticated identity is not mapped to an internal account/i.test(raw)) {
            return 'Phiên đăng nhập chưa gắn đúng với tài khoản nội bộ. Vui lòng đăng xuất, đăng nhập lại; nếu vẫn lỗi hãy liên hệ quản trị viên.';
        }
        if (/AUTH_TOKEN_INVALID|token could not be verified|token expired|unauthorized|401/i.test(raw)) {
            return 'Phiên đăng nhập đã hết hạn hoặc không hợp lệ. Vui lòng đăng nhập lại.';
        }
        if (/không có quyền|khong co quyen|forbidden|403/i.test(raw)) {
            return 'Bạn không có quyền xem dữ liệu này.';
        }
        if (/missing para|thiếu tham số|thieu tham so|không hợp lệ|khong hop le/i.test(raw)) {
            return raw.indexOf('Mã khách hàng') >= 0 ? raw : 'Thông tin tra cứu chưa đầy đủ hoặc không hợp lệ. Vui lòng kiểm tra lại.';
        }
        if (/timeout|quá thời gian|gateway|internal server|status 500/i.test(raw)) {
            return 'Hệ thống đang tạm thời gián đoạn. Vui lòng thử lại sau.';
        }
        return raw;
    }

    function _menuShowParams(query) {

        if (!_activeApi || !_activeApi.config) { _menuHide(); return; }

        _menuCreate();

        var q = (query || '').toLowerCase().replace(/^@/, '');

        var cfg = _activeApi.config;
        var activeApiCode = String(_activeApi.ApiCode || _activeApi.apiCode || '').toLowerCase();
        var userScope = _getCurrentUserScope();

        var fields = (cfg.filters && cfg.filters.length > 0) ? cfg.filters : (cfg.fields || []);



        var val = _inputEl.value.toLowerCase();

        // Khi người dùng đã chọn loại báo cáo, chỉ giữ lại các bộ lọc liên quan.
        // Nếu chưa chọn, hiển thị loại báo cáo trước để định hướng luồng nhập liệu.
        var reportTypeMatch = val.match(/@loaibaocao\s*=\s*([^\s@]+)/i);
        var reportType = reportTypeMatch ? reportTypeMatch[1].replace(/["']/g, '') : '';
        var reportFilter = String(reportType).toLowerCase();

        var seenSemanticFields = {};
        var filtered = fields.filter(function (f) {

            if (f.IsSystemParam == 1) return false;

            var code = (f.FieldCode || '').toLowerCase();
            // Ẩn mã kỹ thuật khỏi gợi ý UI; BE vẫn nhận và xử lý StatusID.
            if (activeApiCode === '@don_hang' && code === '@statusid') return false;

            if (activeApiCode === '@doanh_so' && reportFilter) {
                var isCustomer = ['@makhachhang', '@objectid', '@objectname'].indexOf(code) >= 0;
                var isEmployee = ['@employeeid', '@tennhanvien', '@employeename'].indexOf(code) >= 0;
                var isProduct = ['@itemid', '@tensanpham', '@itemname'].indexOf(code) >= 0;
                if (reportFilter.indexOf('khach') >= 0 && (isEmployee || isProduct)) return false;
                if (reportFilter.indexOf('nhan') >= 0 && (isCustomer || isProduct)) return false;
                if (reportFilter.indexOf('sanpham') >= 0 && (isCustomer || isEmployee)) return false;
            }

            // Doanh số: TDV không được chọn nhân viên khác; BE vẫn là lớp bảo vệ cuối.
            if (activeApiCode === '@doanh_so' && !userScope.isManager &&
                ['@employeeid', '@tennhanvien', '@employeename'].indexOf(code) >= 0) {
                return false;
            }
            // Đơn hàng: TDV luôn dùng phạm vi của tài khoản đăng nhập.
            if (activeApiCode === '@don_hang' && !userScope.isManager &&
                ['@employeeid', '@tennhanvien', '@employeename'].indexOf(code) >= 0) {
                return false;
            }

            // KHNG hiện lại tham số đ c trong input

            if (val.indexOf(code) !== -1) return false;



            var name = (f.FieldName || '').toLowerCase();

            var q = (query || '').toLowerCase().replace(/^@/, '');

            var matches = code.replace(/^@/, '').indexOf(q) !== -1 || name.indexOf(q) !== -1;
            if (!matches) return false;

            var bare = code.replace(/^@/, '');
            var semantic = bare;
            if (['makhachhang', 'objectid', 'objectname'].indexOf(bare) >= 0) semantic = 'customer';
            if (['employeeid', 'tennhanvien', 'employeename'].indexOf(bare) >= 0) semantic = 'employee';
            if (['itemid', 'tensanpham', 'itemname'].indexOf(bare) >= 0) semantic = 'product';
            if (seenSemanticFields[semantic]) return false;
            seenSemanticFields[semantic] = true;
            return true;

        });



        if (!filtered.length) { _menuHide(); return; }



        var html = '';

        if (activeApiCode === '@doanh_so' && !reportFilter) {
            filtered.sort(function (a, b) {
                var ac = String(a.FieldCode || '').toLowerCase();
                var bc = String(b.FieldCode || '').toLowerCase();
                return (ac === '@loaibaocao' ? -1 : 0) - (bc === '@loaibaocao' ? -1 : 0);
            });
        }

        filtered.forEach(function (f) {

            var displayName = f.FieldName || f.FieldCode;
            if (activeApiCode === '@don_hang') {
                var friendlyOrderLabels = {
                    '@statusname': 'Trạng thái',
                    '@employeeid': 'Mã nhân viên',
                    '@makhachhang': 'Khách hàng',
                    '@timkiem': 'Từ khóa',
                    '@topn': 'Số kết quả',
                    '@soluong': 'Số kết quả'
                };
                displayName = friendlyOrderLabels[String(f.FieldCode || '').toLowerCase()] || displayName;
            }
            if (activeApiCode === '@doanh_so' && String(f.FieldCode || '').toLowerCase() === '@topn') {
                displayName = 'Số kết quả tối đa';
            }
            html += '<div class="ae-menu-item" data-code="' + _esc(f.FieldCode) + '">'

                + '<span class="ae-val-name">' + _esc(displayName) + '</span>'

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



    function _isCatalogTypePrompt() {
        if (!_inputEl) return false;

        var currentInput = String(_inputEl.value || '');
        var catalogTag = '#' + String(CFG.CATALOG_ROOT_API || '@danh_muc').replace(/^@/, '');

        return currentInput.toLowerCase().indexOf(catalogTag.toLowerCase()) !== -1
            && /@type\s*=\s*$/i.test(currentInput);
    }



    function _openCatalogTypePicker(delay) {
        clearTimeout(_catalogTypeOpenTimer);

        _catalogTypeOpenTimer = setTimeout(function () {
            _catalogTypeOpenTimer = null;
            if (!_isCatalogTypePrompt()) return;

            var currentInput = String(_inputEl.value || '');
            var typeAtPos = currentInput.toLowerCase().lastIndexOf('@type=');

            _menuShowCatalog('', typeAtPos >= 0 ? typeAtPos : currentInput.length, {
                fieldCode: '@Type'
            });
        }, Math.max(0, Number(delay) || 0));
    }


    function _loadCatalogTypeRows(query, cb) {
        var catalogApi = CFG.CATALOG_ROOT_API || '@danh_muc';
        var normalizedQuery = String(query || '').trim();

        // Reuse the last successful dynamic response so the picker opens
        // immediately. The request below still refreshes it in the
        // background; no catalog type is hardcoded here.
        if (!normalizedQuery && _catalogTypeRowsCache && _catalogTypeRowsCache.length) {
            cb(_catalogTypeRowsCache.slice());
        }

        function deliver(rows) {
            if (!normalizedQuery && rows && rows.length) {
                _catalogTypeRowsCache = rows.slice();
            }
            cb(rows || []);
        }

        // The catalog root procedure accepts an optional @Type.  Always send
        // the empty value for the root picker so deployments whose API
        // metadata marks @Type as required do not reject the request before
        // the procedure can return its dynamic category rows.
        var rootDataSource = catalogApi + '|@Type=';

        // Primary path: the lightweight datasource endpoint used by inline
        // selectors. Some deployments can temporarily have this workflow
        // unpublished while the approved API Execute workflow is available,
        // so retry through that public API before showing an error.
        _loadDataSource('APICODE', rootDataSource, query, function (rows) {
            if (rows && rows.length) {
                deliver(rows);
                return;
            }

            // Secondary path: use the existing backend catalog endpoint. This
            // keeps the picker working when the n8n datasource workflow is not
            // published, while still reading the categories dynamically from
            // API_DanhMuc_AI instead of defining them in the frontend.
            var catalogEndpoint = window.API_CONFIG
                && window.API_CONFIG.ENDPOINTS
                && window.API_CONFIG.ENDPOINTS.AI
                && window.API_CONFIG.ENDPOINTS.AI.CATALOG;

            if (!catalogEndpoint) {
                _loadCatalogTypeRowsFromExecute(catalogApi, query, deliver);
                return;
            }

            var queryPayload = encodeURIComponent(JSON.stringify({
                Type: '',
                SearchText: query || ''
            }));
            _get(catalogEndpoint + '?q=' + queryPayload).then(function (response) {
                var backendRows = _normalizeDataSourceRows(response);
                if (backendRows.length) {
                    deliver(backendRows);
                    return;
                }
                _loadCatalogTypeRowsFromExecute(catalogApi, query, deliver);
            }).catch(function (error) {
                console.warn('[ApiEngine] Backend catalog endpoint failed', error);
                _loadCatalogTypeRowsFromExecute(catalogApi, query, deliver);
            });
        });
    }

    function _loadCatalogTypeRowsFromExecute(catalogApi, query, cb) {
        // Final path: use the approved API Execute workflow. Do not omit
        // @Type; an empty root value asks the procedure for its category rows.
        var params = { '@Type': '' };
        if (query) params['@timkiem'] = query;

        _post(CFG.EXEC_URL, {
            ApiCode: catalogApi,
            params: params,
            username: _user()
        }).then(function (response) {
            cb(_normalizeDataSourceRows(response));
        }).catch(function (error) {
            console.error('[ApiEngine] Catalog type execute fallback failed', error);
            cb([]);
        });
    }



    function _menuShowCatalog(query, atPos, options) {

        console.log('[ApiEngine] _menuShowCatalog query=', query, 'atPos=', atPos);
        options = options || {};
        var requestSeq = ++_catalogTypeRequestSeq;

        // Show feedback immediately while the catalog datasource is loading.
        _menuCreate();
        _menuEl.innerHTML = '<div class="ae-menu-empty">Đang tải loại danh mục...</div>';
        _positionMenu();

        _loadCatalogTypeRows(query, function (rows) {

            if (requestSeq !== _catalogTypeRequestSeq) return;

            // Bỏ qua phản hồi cũ nếu người dùng đã rời khỏi trường @Type.
            // Việc này tránh một request chậm vẽ đè menu của thao tác mới.
            if (options.fieldCode &&
                String(options.fieldCode).toLowerCase() === '@type') {
                if (!_isCatalogTypePrompt()) return;
            }

            if (!rows || !rows.length) {
                _menuCreate();
                _menuEl.innerHTML = '<div class="ae-menu-empty">Không tải được loại danh mục. Vui lòng thử lại.</div>';
                _positionMenu();
                return;
            }

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

                    if (options.fieldCode) {
                        _lastCatalogType = null;
                        _pillParams[options.fieldCode] = valType;
                        _inputEl.value = prefix + options.fieldCode + '=' + valType + ' ';
                        _suppressMenuUntil = Date.now() + 400;
                    } else {
                        _lastCatalogType = valType;

                    // Bổ sung lại tiền tố '@' để API Engine c thể parse được token ở cc bước sau

                    _inputEl.value = prefix + '@' + valType + '=';

                    // show entity suggestions immediately for chosen catalog

                        setTimeout(function () { console.log('[ApiEngine] triggering _menuShowCatalogValues from click for', valType); _menuShowCatalogValues(valType, ''); }, 80);
                    }

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

        if (!_activeApi) return;
        var activeApiCode = String(_activeApi.ApiCode || _activeApi.apiCode || '').toLowerCase();
        if (activeApiCode === String(CFG.CATALOG_ROOT_API || '@danh_muc').toLowerCase()
            && String(fieldCode || '').toLowerCase() === '@type') {
            _openCatalogTypePicker(0);
            return;
        }

        if (!_activeApi.config) return;

        var cfg = _activeApi.config;

        var fields = (cfg.filters && cfg.filters.length > 0) ? cfg.filters : (cfg.fields || []);



        // Tìm config của tham số hiện tại (v dụ: @ObjectID)

        var field = fields.find(function (f) {

            return (f.FieldCode || '').toLowerCase() === fieldCode.toLowerCase();

        });

        // Older metadata may omit @Type's datasource. Use the configured
        // catalog root endpoint without hard-coding catalog values.
        if (String(fieldCode || '').toLowerCase() === '@type' && CFG.CATALOG_ROOT_API) {
            field = field || { FieldCode: '@Type', FieldName: 'Loại danh mục' };
            if (!field.DataSourceType) field.DataSourceType = 'APICODE';
            if (!field.DataSourceValue) field.DataSourceValue = CFG.CATALOG_ROOT_API + '|@timkiem={q}';
        }

        // Some older metadata omitted the customer datasource. Reuse the
        // centrally configured catalog contract so customer pickers still load.
        var normalizedFieldCode = String(fieldCode || '').toLowerCase();
        if ((normalizedFieldCode === '@makhachhang' || normalizedFieldCode === '@objectid') && CFG.CART_CUSTOMER_DS) {
            field = field || { FieldCode: fieldCode, FieldName: 'Khách hàng' };
            if (!field.DataSourceType) field.DataSourceType = 'APICODE';
            if (!field.DataSourceValue) field.DataSourceValue = CFG.CART_CUSTOMER_DS;
        }



        // --- BẮT BUỘC P KIỂU LỊCH NẾU DataType l Date ĐỂ CHỐNG CACHE BACKEND ---

        var isDateField = (field && (field.DataType === 'DATE' || field.DataType === 'DATETIME' || field.ControlType === 'date'))

            || (fieldCode || '').toLowerCase() === CFG.SYS_PARAMS.START_DATE

            || (fieldCode || '').toLowerCase() === CFG.SYS_PARAMS.END_DATE;



        if (isDateField) {

            if (!field) field = { FieldCode: fieldCode, FieldName: 'Ngày' };

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

                + '<label style="font-size:13px;font-weight:600;color:var(--ae-text);margin:0;">Chọn ngày <span style="font-weight:normal;color:var(--ae-text-muted);">(' + _esc(field.FieldName) + ')</span>:</label>'

                + '<button type="button" id="ae-inline-date-confirm" style="background:var(--ae-accent);color:#fff;border:none;padding:6px 12px;border-radius:6px;cursor:pointer;font-weight:600;font-size:12px;transition:all 0.2s;">Chọn</button>'

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

                            // Tên gợi ý có thể là thành phần/mô tả rất dài.
                            // Bong bóng yêu cầu chỉ nên hiện tên nghiệp vụ; giá trị đã có trong params.
                            var label = _getApiMenuLabel(uMeta) || underlyingApi;

                            // Load config của API nền rồi execute

                            _loadConfig(underlyingApi, function (config) {

                                _closeFull(true); // Xa sạch thanh input v reset state để trnh user lỡ bấm Enter lần nữa

                                _executeApi(underlyingApi, execP, label, execType, config);

                            });

                            return;

                        }

                        // ────────────────────────────────────────────────────



                        _onValueSelected(fieldCode, selCode, {

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

        // Selecting a customer for the focus program completes the action.
        // Query that customer's accumulation immediately instead of leaving
        // the input in a stale API context.
        if (_activeApi && _activeApi.autoSubmitAfterCustomerPick &&
            (bare === 'makhachhang' || bare === 'objectid')) {
            _activeApi.autoSubmitAfterCustomerPick = false;
            setTimeout(function () { window.ApiEngine.handleSend(); }, 0);
            return;
        }

        // Luồng danh mục: chọn Loại xong thì chuyển thẳng sang trường tìm kiếm.
        // Tránh bắt người dùng phải nhấn Space rồi tự chọn @timkiem.
        if (bare === 'type' && _activeApi && _activeApi.config) {
            var nextFields = (_activeApi.config.filters && _activeApi.config.filters.length > 0)
                ? _activeApi.config.filters : (_activeApi.config.fields || []);
            var searchField = nextFields.find(function (f) {
                var nextBare = String(f.FieldCode || '').replace(/^@/, '').toLowerCase();
                return nextBare === 'timkiem' || nextBare === 'searchtext';
            });

            if (searchField && searchField.FieldCode) {
                var nextCode = searchField.FieldCode.charAt(0) === '@'
                    ? searchField.FieldCode : '@' + searchField.FieldCode;
                _inputEl.value = _inputEl.value.replace(/\s+$/, '') + ' ' + nextCode + '=';
                _inputEl.dispatchEvent(new Event('input', { bubbles: true }));
                _inputEl.focus();

                setTimeout(function () {
                    _suppressMenuUntil = 0;
                    // Product lookup requires a keyword. Do not query the
                    // datasource with an empty value (that caused a
                    // validation toast followed by an unfiltered 20-row list).
                    var selectedType = String(_pillParams['@Type'] || '').toLowerCase();
                    if (!(selectedType === 'sanpham' && String(nextCode).toLowerCase() === '@timkiem')) {
                        _showInlineValues(nextCode, '');
                    } else {
                        _menuHide();
                    }
                }, 80);
            }
        }

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

    function _onApiSelected(apiCode, pendingUpdate) {

        apiCode = String(apiCode || '').trim();
        if (!apiCode) return;
        if (apiCode.charAt(0) !== '@') apiCode = '@' + apiCode.replace(/^#/, '');

        var matchedApi = _apiList.find(function (a) {
            return String(a.ApiCode || '').toLowerCase() === apiCode.toLowerCase();
        });
        if (matchedApi) apiCode = matchedApi.ApiCode;

        // Mỗi nghiệp vụ là một truy vấn độc lập. Không mang khách hàng,
        // nhân viên hoặc bộ lọc đã chọn từ API trước sang API mới.
        if (!_activeApi || _activeApi.apiCode !== apiCode) {
            _pillParams = {};
            _cartItems = [];
        }

        var found = matchedApi || _apiList.find(function (a) { return a.ApiCode === apiCode; });

        var execType = found ? found.ExecutionType : 'QUERY';
        if (apiCode === '@lap_don_hang') { execType = 'CART'; }

        var dispName = found ? _getApiMenuLabel(found) : apiCode;



        _activeApi = {
            apiCode: apiCode,
            dispName: dispName,
            execType: execType,
            config: null,
            pendingUpdate: pendingUpdate,
            // A customer picker opened for a specific business action must
            // execute that selected API. Catalog metadata can reference other
            // APIs, but it must not replace the intended action after picking.
            lockSelectedApi: !!(pendingUpdate && pendingUpdate.focusCustomer)
        };

        // Lập đơn nhanh có panel riêng trong khung chat, không dùng metadata
        // config từ catalog AI. Chặn sớm để khỏi gọi thừa một vòng _loadConfig.
        if (apiCode.toLowerCase() === '@lap_don_hang') {
            _replaceAtTag(apiCode);
            _activeApi.config = { info: {}, fields: [], filters: [] };
            _createTriggerButton();
            _openPanel(_activeApi.config, 'CART', dispName);
            return;
        }

        // Customer creation already has a dedicated authenticated form in this
        // widget, so it does not need mutation metadata from the AI catalog.
        if (apiCode.toLowerCase() === '@khach_hang_insert') {
            _replaceAtTag(apiCode);
            _activeApi.config = {
                info: { StoredProcedure: 'API_KhachHang_Insert_AI' },
                fields: [],
                filters: []
            };
            _openPanel(_activeApi.config, 'INSERT', dispName);
            return;
        }

        // Keep API tag state but do not leave visible '#' text: store on input dataset

        if (!(pendingUpdate && pendingUpdate.preserveInput)) {
            _replaceAtTag(apiCode);
        }

        try { if (_inputEl) { _inputEl.dataset.apiTag = apiCode.replace('@', ''); } } catch (e) { }



        // Đảm bảo nt "mở lại panel" được khởi tạo sẵn (chỉ cho CART hoặc khi panel mở)

        // Open the catalog type picker immediately. Values are loaded from
        // the catalog datasource; this intentionally contains no hard-coded
        // category list.
        var isCatalogRoot = apiCode.toLowerCase()
            === String(CFG.CATALOG_ROOT_API || '@danh_muc').toLowerCase();
        if (isCatalogRoot && _inputEl) {
            var catalogTag = '#' + apiCode.replace(/^@/, '');
            var currentCatalogInput = String(_inputEl.value || '');
            var catalogPrefixPos = currentCatalogInput.toLowerCase().indexOf(catalogTag.toLowerCase());

            if (catalogPrefixPos < 0) {
                _inputEl.value = catalogTag + ' @Type=';
            } else if (!/@type\s*=/i.test(currentCatalogInput.slice(catalogPrefixPos))) {
                _inputEl.value = currentCatalogInput.replace(/\s+$/, '') + ' @Type=';
            }

            _inputEl.dispatchEvent(new Event('input', { bubbles: true }));
            _inputEl.focus();

            _openCatalogTypePicker(0);
        }

        if (execType !== 'QUERY') _createTriggerButton();



        _loadConfig(apiCode, function (config) {
            if (!_activeApi) return;
            _activeApi.config = config;

            // The catalog type picker is opened before config loading.
            if (isCatalogRoot) return;

            if (pendingUpdate && pendingUpdate.catalogRoot) {
                setTimeout(function () {
                    var current = _inputEl && _inputEl.value || '';
                    var atPos = current.lastIndexOf('@');
                    if (atPos >= 0) _inputEl.value = current.slice(0, atPos);
                    if (_inputEl && _inputEl.value && !_inputEl.value.endsWith(' ')) {
                        _inputEl.value += ' ';
                    }
                    _menuShowCatalog('', _inputEl ? _inputEl.value.length : 0);
                    if (_inputEl) _inputEl.focus();
                }, 0);
                return;
            }

            if (execType === 'QUERY' && _activeApi.pendingUpdate && _activeApi.pendingUpdate.focusCustomer) {
                delete _activeApi.pendingUpdate;
                var customerFields = (config && config.filters && config.filters.length > 0)
                    ? config.filters : (config ? config.fields || [] : []);
                var customerField = customerFields.find(function (field) {
                    var fieldCode = String(field.FieldCode || field.field || '').toLowerCase();
                    return fieldCode === '@makhachhang' || fieldCode === '@objectid';
                });
                if (customerField && _inputEl) {
                    var customerFieldCode = customerField.FieldCode || customerField.field || '@MaKhachHang';
                    _activeApi.autoSubmitAfterCustomerPick = true;
                    _inputEl.value = '#' + apiCode.replace(/^@/, '') + ' ' + customerFieldCode + '=';
                    _inputEl.dispatchEvent(new Event('input', { bubbles: true }));
                    _inputEl.focus();
                    setTimeout(function () { _showInlineValues(customerFieldCode, ''); }, 0);
                    return;
                }
            }

            if (execType === 'QUERY' && _activeApi.pendingUpdate && _activeApi.pendingUpdate.autoSubmit) {
                delete _activeApi.pendingUpdate;
                setTimeout(function () { window.ApiEngine.handleSend(); }, 0);
                return;
            }



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

                                _inputEl.placeholder = 'Nhập: ' + visible.map(function (f) {
                                    return f.Placeholder || f.FieldName || (f.FieldCode || '').replace(/^@/, '');
                                }).join(' · ');

                            }

                        } catch (e) { }

                    } catch (e) { }

                }



                // Mở ngay menu tham số

                var currentInput = String(_inputEl && _inputEl.value || '');
                var currentAt = currentInput.lastIndexOf('@');
                var currentTail = currentAt >= 0 ? currentInput.slice(currentAt + 1) : '';
                var currentEq = currentTail.indexOf('=');
                if (currentEq >= 0) {
                    _showInlineValues(
                        '@' + currentTail.slice(0, currentEq).trim(),
                        currentTail.slice(currentEq + 1).trim()
                    );
                } else {
                    _menuShowParams('');
                }

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

    function _isCustomerCreateApi() {
        if (!_activeApi) return false;
        var code = (_activeApi.apiCode || '').toLowerCase();
        var sp = (_activeApi.config && _activeApi.config.info && _activeApi.config.info.StoredProcedure || '').toLowerCase();
        return code.indexOf('khach_hang_insert') !== -1 || code.indexOf('khachhang_insert') !== -1 || sp.indexOf('khachhang_insert') !== -1;
    }

    function _customerOptions(rows, valueKey, labelKey) {
        return '<option value="">-- Chọn --</option>' + (rows || []).map(function (r) {
            return '<option value="' + _esc(r[valueKey] || '') + '">' + _esc(r[labelKey] || r[valueKey] || '') + '</option>';
        }).join('');
    }

    function _openCustomerCreatePanel(dispName) {
        _panelEl = document.createElement('div');
        _panelEl.id = 'ae-panel';
        _panelEl.className = 'ae-panel ae-customer-create-panel';
        _panelEl.innerHTML = '<div class="ae-panel-header"><span class="ae-panel-title">' + _esc(dispName || 'Tạo khách hàng nhanh') + '</span>'
            + '<div class="ae-panel-actions"><button class="ae-panel-btn" id="ae-panel-min">−</button><button class="ae-panel-btn" id="ae-panel-close">✕</button></div></div>'
            + '<div class="ae-customer-form">'
            + '<label class="ae-customer-field"><span>Tên khách hàng *</span><input id="ae-customer-name" maxlength="300"></label>'
            + '<label class="ae-customer-field"><span>Số điện thoại *</span><input id="ae-customer-phone" maxlength="20" inputmode="tel"></label>'
            + '<label class="ae-customer-field ae-customer-full"><span>Địa chỉ *</span><input id="ae-customer-address" maxlength="500"></label>'
            + '<label class="ae-customer-field"><span>Loại khách hàng *</span><select id="ae-customer-type"><option value="">-- Chọn --</option><option value="OTC">OTC</option><option value="ETC">ETC</option></select></label>'
            + '<label class="ae-customer-field"><span>Chi nhánh *</span><select id="ae-customer-branch"><option value="">Đang tải...</option></select></label>'
            + '<label class="ae-customer-field"><span>Tỉnh/Thành phố</span><select id="ae-customer-province"><option value="">Đang tải...</option></select></label>'
            + '<label class="ae-customer-field"><span>Quận/Huyện</span><select id="ae-customer-district" disabled><option value="">-- Chọn tỉnh trước --</option></select></label>'
            + '<label class="ae-customer-field"><span>Phường/Xã</span><select id="ae-customer-ward" disabled><option value="">-- Chọn huyện trước --</option></select></label>'
            + '<label class="ae-customer-field"><span>Mã số thuế</span><input id="ae-customer-tax" maxlength="30"></label>'
            + '<label class="ae-customer-field"><span>Nhóm khách hàng</span><select id="ae-customer-group"><option value="">Đang tải...</option></select></label>'
            + '<label class="ae-customer-field"><span>Kênh bán</span><select id="ae-customer-channel"><option value="">Đang tải...</option></select></label>'
            + '<label class="ae-customer-field"><span>Tuyến phụ trách</span><select id="ae-customer-route"><option value="">Đang tải...</option></select></label>'
            + '<div class="ae-customer-error ae-customer-full" id="ae-customer-error" role="alert"></div><div class="ae-customer-review ae-customer-full" id="ae-customer-review" hidden></div></div>'
            + '<div class="ae-panel-footer"><button class="ae-customer-back-btn" id="ae-customer-back" hidden>Chỉnh sửa</button><button class="ae-panel-send-btn" id="ae-panel-send-btn">Kiểm tra thông tin</button></div>';
        var panel = _panelEl;
        document.body.appendChild(panel);
        document.body.classList.add('ae-panel-open');
        requestAnimationFrame(function () { panel.classList.add('active'); });
        var user = {}; try { user = JSON.parse(localStorage.getItem('auth_user') || '{}'); } catch (e) {}
        var errorEl = panel.querySelector('#ae-customer-error');
        function rowsOf(res) { var data = res && (res.data || res); return (data && data.records) || data || []; }
        function load(endpoint, query, selector, valueKey, labelKey) {
            return Http.get(endpoint, { q: JSON.stringify(query || {}) }).then(function (res) {
                var rows = rowsOf(res); panel.querySelector(selector).innerHTML = _customerOptions(rows, valueKey, labelKey); return rows;
            }).catch(function () { panel.querySelector(selector).innerHTML = '<option value="">Không tải được dữ liệu</option>'; errorEl.textContent = 'Không thể tải đầy đủ dữ liệu danh mục.'; return []; });
        }
        load(API_CONFIG.ENDPOINTS.FILTER.BRANCHES, { BranchID: '', SearchText: '' }, '#ae-customer-branch', 'BranchID', 'BranchName').then(function (rows) {
            if (user.BranchID && rows.some(function (r) { return r.BranchID === user.BranchID; })) { var el = panel.querySelector('#ae-customer-branch'); el.value = user.BranchID; el.disabled = true; }
        });
        load(API_CONFIG.ENDPOINTS.FILTER.PROVINCES, { User: user.UserName || '', LocationID: '', SearchText: '' }, '#ae-customer-province', 'LocationID', 'LocationName');
        load(API_CONFIG.ENDPOINTS.FILTER.CUSTOMER_GROUPS, { User: user.UserName || '', SearchText: '' }, '#ae-customer-group', 'ObjectGroupID', 'ObjectGroupName');
        load(API_CONFIG.ENDPOINTS.FILTER.CHANNELS, { KenhBan: '' }, '#ae-customer-channel', 'KenhBan', 'TenKenhBan');
        load(API_CONFIG.ENDPOINTS.FILTER.ROUTE_DAYS, { ThuDiTuyen: '' }, '#ae-customer-route', 'ThuTrongTuan', 'ThuTrongTuan');
        panel.querySelector('#ae-customer-province').onchange = function () { var v = this.value, d = panel.querySelector('#ae-customer-district'), w = panel.querySelector('#ae-customer-ward'); d.disabled = !v; w.disabled = true; w.innerHTML = '<option value="">-- Chọn huyện trước --</option>'; if (v) load(API_CONFIG.ENDPOINTS.FILTER.DISTRICTS, { User: user.UserName || '', LocationID: v, QuanHuyen: '', SearchText: '' }, '#ae-customer-district', 'QuanHuyen', 'QuanHuyen'); };
        panel.querySelector('#ae-customer-district').onchange = function () { var p = panel.querySelector('#ae-customer-province').value, v = this.value, w = panel.querySelector('#ae-customer-ward'); w.disabled = !v; if (v) load(API_CONFIG.ENDPOINTS.FILTER.WARDS, { User: user.UserName || '', LocationID: p, QuanHuyen: v, XaPhuong: '', SearchText: '' }, '#ae-customer-ward', 'XaPhuong', 'XaPhuong'); };
        panel.querySelector('#ae-panel-min').onclick = function () { panel.classList.remove('active'); document.body.classList.remove('ae-panel-open'); setTimeout(function () { panel.style.display = 'none'; }, 200); };
        panel.querySelector('#ae-panel-close').onclick = function () { _closeFull(); };
        var reviewed = false, submit = panel.querySelector('#ae-panel-send-btn'), back = panel.querySelector('#ae-customer-back'), review = panel.querySelector('#ae-customer-review');
        back.onclick = function () { reviewed = false; review.hidden = true; back.hidden = true; submit.textContent = 'Kiểm tra thông tin'; };
        submit.onclick = function () {
            errorEl.textContent = '';
            function val(id) { return panel.querySelector(id).value.trim(); }
            var v = { name: val('#ae-customer-name'), phone: val('#ae-customer-phone').replace(/\s+/g, ''), address: val('#ae-customer-address'), type: val('#ae-customer-type'), branch: val('#ae-customer-branch'), province: val('#ae-customer-province'), district: val('#ae-customer-district'), ward: val('#ae-customer-ward'), tax: val('#ae-customer-tax'), group: val('#ae-customer-group'), channel: val('#ae-customer-channel'), route: val('#ae-customer-route') };
            if (!v.name || !v.phone || !v.address || !v.type || !v.branch) { errorEl.textContent = 'Vui lòng nhập đủ tên, số điện thoại, địa chỉ, loại khách hàng và chi nhánh.'; return; }
            if (!/^(?:\+?84|0)\d{8,10}$/.test(v.phone)) { errorEl.textContent = 'Số điện thoại không đúng định dạng.'; return; }
            if (!reviewed) { reviewed = true; back.hidden = false; submit.textContent = 'Xác nhận tạo khách hàng'; review.hidden = false; review.innerHTML = '<strong>Xác nhận thông tin</strong><span>' + _esc(v.name) + '</span><span>' + _esc(v.phone) + '</span><span>' + _esc(v.address) + '</span>'; return; }
            submit.disabled = true; submit.textContent = 'Đang tạo...';
            var payload = { User: user.UserName || '', ObjectID: '', ObjectName: v.name, Phone: v.phone, Address: v.address, TaxCode: v.tax, LoaiKhachHang: v.type, BranchID: v.branch, ObjectGroupID: v.group, LocationID: v.province, QuanHuyen: v.district, XaPhuong: v.ward, KenhBan: v.channel, ThuDiTuyen: v.route, Birthday: '', AccountNoHD: '', AccountNameHD: '', ChuTaiKhoan: '', Latitude: 0, Longitude: 0 };
            Http.post(API_CONFIG.ENDPOINTS.CUSTOMER.CREATE, payload).then(function (res) { var data = res.data || res, record = Array.isArray(data) ? data[0] : (data.records ? data.records[0] : data); if (record && record.MsgType == 1) throw new Error(record.Msg || 'Không thể tạo khách hàng.'); var id = record && (record.ObjectID || record.NewObjectID || record.MaKhachHang) || ''; _closeFull(true); if (_cbMsg) _cbMsg('ai', 'Đã tạo khách hàng thành công: ' + v.name + (id ? ' (' + id + ')' : '') + '.'); }).catch(function (err) { errorEl.textContent = err.message || 'Không thể tạo khách hàng.'; reviewed = false; review.hidden = true; back.hidden = true; submit.disabled = false; submit.textContent = 'Kiểm tra thông tin'; });
        };
        setTimeout(function () { panel.querySelector('#ae-customer-name').focus(); }, 50);
    }

    function _isOrderCreateApi() {
        if (!_activeApi) return false;
        return String(_activeApi.apiCode || '').toLowerCase() === '@lap_don_hang';
    }

    // Cache dùng chung cho panel lập đơn. Danh sách khách/sản phẩm đổi rất chậm
    // nên tải một lần cho cả phiên, tránh gọi lại mỗi lần mở panel.
    var _orderCustomers = null;
    var _orderProducts = null;

    function _orderRows(res) {
        var data = (res && (res.data || res)) || [];
        return data.records || data || [];
    }

    /**
     * Panel lập đơn nhanh ngay trong khung chat.
     *
     * Sale chỉ nhập bốn thứ: khách hàng, sản phẩm, số lượng, chiết khấu (và diễn
     * giải nếu cần). Số điện thoại, địa chỉ, phường/xã được map tự động từ khách
     * hàng đã chọn; chi nhánh lấy từ tài khoản đang đăng nhập; tuyến thứ do trang
     * đơn hàng tự suy ra từ ngày chứng từ.
     *
     * Panel này KHÔNG ghi đơn. Nhấn xác nhận sẽ chuyển sang trang /create-order
     * với dữ liệu điền sẵn để người dùng soát lại rồi mới lưu thật.
     */
    function _openOrderCreatePanel(dispName, pendingUpdate) {
        var user = {};
        try { user = JSON.parse(localStorage.getItem('auth_user') || '{}'); } catch (e) { }

        _panelEl = document.createElement('div');
        _panelEl.id = 'ae-panel';
        _panelEl.className = 'ae-panel ae-order-create-panel';
        _panelEl.innerHTML = [
            '<div class="ae-panel-header"><span class="ae-panel-title">' + _esc(dispName || 'Lập đơn hàng nhanh') + '</span>',
            '<div class="ae-panel-actions"><button class="ae-panel-btn" id="ae-panel-close" title="Đóng" aria-label="Đóng">✕</button></div></div>',
            '<div class="ae-order-form">',
            '<label class="ae-order-field ae-order-full"><span>Khách hàng *</span>',
            '<span class="ae-order-combo"><input id="ae-order-customer" autocomplete="off" placeholder="Gõ tên hoặc mã khách hàng...">',
            '<span class="ae-order-drop" id="ae-order-customer-drop" hidden></span></span></label>',
            '<div class="ae-order-mapped ae-order-full" id="ae-order-mapped" hidden></div>',
            '<div class="ae-order-full ae-order-items-head"><span>Sản phẩm *</span>',
            '<button type="button" class="ae-order-add" id="ae-order-add">+ Thêm dòng</button></div>',
            '<div class="ae-order-items ae-order-full" id="ae-order-items"></div>',
            '<label class="ae-order-field ae-order-full"><span>Diễn giải</span>',
            '<input id="ae-order-memo" maxlength="500" placeholder="Ghi chú cho đơn (nếu có)"></label>',
            '<div class="ae-order-total ae-order-full" id="ae-order-total">Tạm tính: 0 đ</div>',
            '<div class="ae-customer-error ae-order-full" id="ae-order-error" role="alert"></div></div>',
            '<div class="ae-panel-footer"><button class="ae-panel-send-btn" id="ae-panel-send-btn">Xem lại &amp; tạo đơn</button></div>'
        ].join('');

        var panel = _panelEl;
        document.body.appendChild(panel);
        document.body.classList.add('ae-panel-open');
        requestAnimationFrame(function () { panel.classList.add('active'); });

        var errorEl = panel.querySelector('#ae-order-error');
        var mappedEl = panel.querySelector('#ae-order-mapped');
        var itemsEl = panel.querySelector('#ae-order-items');
        var totalEl = panel.querySelector('#ae-order-total');
        var custInput = panel.querySelector('#ae-order-customer');
        var custDrop = panel.querySelector('#ae-order-customer-drop');
        var selectedCustomer = null;

        panel.querySelector('#ae-panel-close').onclick = function () { _closeFull(); };

        function money(n) {
            var v = Number(n) || 0;
            return v.toLocaleString('vi-VN') + ' đ';
        }

        // ── Nạp danh mục ────────────────────────────────────────────────
        function loadCustomers() {
            if (_orderCustomers) return Promise.resolve(_orderCustomers);
            return Http.get(API_CONFIG.ENDPOINTS.FILTER.CUSTOMERS, {
                q: JSON.stringify({
                    User: user.UserName || '', ManagerID: '', EmployeeID: '', ObjectID: '',
                    LoaiKhachHang: '', KenhBan: '', SearchText: '',
                    SYSManagerID: user.ManagerID || '', SYSEmployeeID: user.EmployeeID || ''
                })
            }).then(function (res) { _orderCustomers = _orderRows(res); return _orderCustomers; })
                .catch(function () { errorEl.textContent = 'Không tải được danh sách khách hàng.'; return []; });
        }

        function loadProducts() {
            if (_orderProducts) return Promise.resolve(_orderProducts);
            return Http.get(API_CONFIG.ENDPOINTS.FILTER.PRODUCTS, {
                q: JSON.stringify({ User: user.UserName || '', ItemID: '', SearchText: '' })
            }).then(function (res) { _orderProducts = _orderRows(res); return _orderProducts; })
                .catch(function () { errorEl.textContent = 'Không tải được danh sách sản phẩm.'; return []; });
        }

        function fold(s) {
            return String(s || '').toLowerCase().normalize('NFD')
                .replace(/[\u0300-\u036f]/g, '').replace(/đ/g, 'd');
        }

        /** Gắn dropdown tìm-khi-gõ cho một ô input. */
        function attachCombo(input, drop, getRows, toLabel, onPick) {
            var open = false;
            function close() { drop.hidden = true; open = false; }
            function render(list) {
                if (!list.length) {
                    drop.innerHTML = '<span class="ae-order-drop-empty">Không tìm thấy</span>';
                } else {
                    drop.innerHTML = list.map(function (r, i) {
                        return '<span class="ae-order-drop-item" data-i="' + i + '">' + _esc(toLabel(r)) + '</span>';
                    }).join('');
                }
                drop.hidden = false;
                open = true;
                drop._list = list;
            }
            function filter() {
                var q = fold(input.value.trim());
                Promise.resolve(getRows()).then(function (rows) {
                    var hit = !q ? rows.slice(0, 30) : rows.filter(function (r) {
                        return fold(toLabel(r)).indexOf(q) > -1;
                    }).slice(0, 30);
                    render(hit);
                });
            }
            input.addEventListener('focus', filter);
            input.addEventListener('input', function () { onPick(null); filter(); });
            drop.addEventListener('pointerdown', function (e) {
                if (!e.target.closest('.ae-order-drop-item')) return;
                // Giữ focus ở ô nhập và không cho handler "bấm ngoài panel"
                // nhận nhầm thao tác chọn trong dropdown.
                e.preventDefault();
                e.stopPropagation();
            });
            drop.addEventListener('click', function (e) {
                var item = e.target.closest('.ae-order-drop-item');
                if (!item) return;
                e.preventDefault();
                e.stopPropagation();
                var row = (drop._list || [])[Number(item.getAttribute('data-i'))];
                if (!row) return;
                input.value = toLabel(row);
                onPick(row);
                close();
            });
            input.addEventListener('blur', function () { setTimeout(close, 150); });
            return { close: close, filter: filter };
        }

        // ── Khách hàng ──────────────────────────────────────────────────
        function customerLabel(c) {
            var id = c.ObjectID || '';
            var name = c.ObjectName || '';
            var phone = c.Phone || '';
            var label = id && name ? id + ' - ' + name : (id || name);
            if (phone && fold(label).indexOf(fold(phone)) === -1) label += ' - ' + phone;
            return label;
        }

        function renderMapped(c) {
            selectedCustomer = c;
            if (!c) { mappedEl.hidden = true; mappedEl.innerHTML = ''; return; }
            var branch = user.BranchID || '';
            mappedEl.innerHTML = [
                '<span class="ae-order-mapped-title">Tự động lấy từ khách hàng</span>',
                '<span><b>SĐT:</b> ' + _esc(c.Phone || '—') + '</span>',
                '<span><b>Địa chỉ:</b> ' + _esc(c.Address || '—') + '</span>',
                '<span><b>Phường/Xã:</b> ' + _esc(c.XaPhuong || '—') + '</span>',
                '<span><b>Chi nhánh:</b> ' + _esc(branch || '—') + '</span>',
                '<span class="ae-order-mapped-note">Tuyến thứ sẽ được trang đơn hàng suy ra từ ngày chứng từ.</span>'
            ].join('');
            mappedEl.hidden = false;
        }

        attachCombo(custInput, custDrop, loadCustomers, customerLabel, renderMapped);

        // ── Dòng sản phẩm ───────────────────────────────────────────────
        function productLabel(p) {
            var name = p.ItemName || p.ItemID || '';
            return p.ItemID && String(name).indexOf(p.ItemID) === -1
                ? name + ' (' + p.ItemID + ')'
                : name;
        }
        function productPrice(p) {
            return Number(p && (p.UnitPrice !== undefined ? p.UnitPrice : p.Price)) || 0;
        }

        function recalc() {
            var sum = 0;
            itemsEl.querySelectorAll('.ae-order-row').forEach(function (row) {
                var p = row._product;
                if (!p) return;
                var qty = Number(row.querySelector('.ae-order-qty').value) || 0;
                var ck = Number(row.querySelector('.ae-order-ck').value) || 0;
                sum += productPrice(p) * qty * (1 - Math.min(Math.max(ck, 0), 100) / 100);
            });
            totalEl.textContent = 'Tạm tính: ' + money(sum);
        }

        function addRow(prefill) {
            var row = document.createElement('div');
            row.className = 'ae-order-row';
            row.innerHTML = [
                '<span class="ae-order-combo ae-order-prodwrap"><input class="ae-order-prod" autocomplete="off" placeholder="Tên hoặc mã sản phẩm">',
                '<span class="ae-order-drop" hidden></span></span>',
                '<input class="ae-order-qty" type="number" min="1" step="1" value="1" title="Số lượng">',
                '<input class="ae-order-ck" type="number" min="0" max="100" step="0.1" value="0" title="Chiết khấu %">',
                '<button type="button" class="ae-order-del" title="Xóa dòng">✕</button>'
            ].join('');
            itemsEl.appendChild(row);

            var pin = row.querySelector('.ae-order-prod');
            var pdrop = row.querySelector('.ae-order-drop');
            attachCombo(pin, pdrop, loadProducts, productLabel, function (p) {
                row._product = p;
                row.classList.toggle('has-product', !!p);
                recalc();
            });
            row.querySelector('.ae-order-qty').addEventListener('input', recalc);
            row.querySelector('.ae-order-ck').addEventListener('input', recalc);
            row.querySelector('.ae-order-del').onclick = function () {
                row.remove();
                if (!itemsEl.querySelector('.ae-order-row')) addRow();
                recalc();
            };

            if (prefill) {
                if (prefill.label) pin.value = prefill.label;
                if (prefill.product) { row._product = prefill.product; row.classList.add('has-product'); }
                if (prefill.qty) row.querySelector('.ae-order-qty').value = prefill.qty;
                if (prefill.discount) row.querySelector('.ae-order-ck').value = prefill.discount;
            }
            recalc();
            return row;
        }

        panel.querySelector('#ae-order-add').onclick = function () { addRow(); };
        addRow();

        // ── Điền sẵn từ hội thoại ("Lên đơn cho khách NDB001") ──────────
        var pre = pendingUpdate || {};
        var preParams = pre.params || {};
        var preCustomer = preParams['@MaKhachHang'] || preParams['@ObjectID'] || '';
        if (pre.message || preCustomer) errorEl.textContent = '';
        if (preCustomer) {
            custInput.value = preCustomer;
            loadCustomers().then(function (rows) {
                var key = fold(preCustomer);
                var c = rows.find(function (x) { return fold(x.ObjectID) === key; })
                    || rows.find(function (x) { return fold(customerLabel(x)).indexOf(key) > -1; });
                if (c) { custInput.value = customerLabel(c); renderMapped(c); }
                else errorEl.textContent = 'Không tìm thấy khách hàng "' + preCustomer + '". Vui lòng chọn lại.';
            });
        }
        if (Array.isArray(pre.items) && pre.items.length) {
            itemsEl.innerHTML = '';
            loadProducts().then(function (prods) {
                pre.items.forEach(function (it) {
                    var key = fold(it.keyword || it.ItemID || it.ItemName || '');
                    var p = prods.find(function (x) { return fold(x.ItemID) === key; })
                        || prods.find(function (x) { return fold(productLabel(x)).indexOf(key) > -1; });
                    addRow({
                        label: p ? productLabel(p) : (it.keyword || ''),
                        product: p || null,
                        qty: it.qty || it.Quantity || 1,
                        discount: it.discount || it.DiscountPercent || 0
                    });
                });
                if (!itemsEl.querySelector('.ae-order-row')) addRow();
            });
        }

        // ── Chuyển sang trang đơn hàng để xác nhận ──────────────────────
        panel.querySelector('#ae-panel-send-btn').onclick = function () {
            errorEl.textContent = '';
            if (!selectedCustomer) {
                errorEl.textContent = 'Vui lòng chọn khách hàng từ danh sách gợi ý.';
                custInput.focus();
                return;
            }
            var items = [];
            var missing = false;
            itemsEl.querySelectorAll('.ae-order-row').forEach(function (row) {
                var p = row._product;
                var typed = row.querySelector('.ae-order-prod').value.trim();
                if (!p) { if (typed) missing = true; return; }
                var qty = Number(row.querySelector('.ae-order-qty').value) || 0;
                if (qty < 1) { missing = true; return; }
                items.push({
                    ItemID: p.ItemID,
                    ItemName: p.ItemName || p.ItemID,
                    Quantity: qty,
                    Price: productPrice(p),
                    DiscountPercent: Number(row.querySelector('.ae-order-ck').value) || 0
                });
            });
            if (missing) {
                errorEl.textContent = 'Có dòng sản phẩm chưa chọn từ danh sách gợi ý hoặc số lượng không hợp lệ.';
                return;
            }
            if (!items.length) {
                errorEl.textContent = 'Vui lòng chọn ít nhất một sản phẩm.';
                return;
            }

            // Trang /create-order nhận đúng ba khóa này (xem src/js/pages/create-order.js).
            var payload = {
                '@ObjectID': selectedCustomer.ObjectID,
                '@Description': panel.querySelector('#ae-order-memo').value.trim(),
                '@ItemList': JSON.stringify(items)
            };
            _closeFull(true);
            if (_cbMsg) {
                _cbMsg('ai', 'Đã dựng đơn cho ' + (selectedCustomer.ObjectName || selectedCustomer.ObjectID)
                    + ' với ' + items.length + ' sản phẩm. Đang mở trang đơn hàng để anh/chị soát lại và xác nhận.');
            }
            window.parent.location.hash = '/create-order?data=' + encodeURIComponent(JSON.stringify(payload));
        };

        setTimeout(function () { custInput.focus(); }, 50);
    }

    function _openPanel(config, execType, dispName) {
        if (_isCustomerCreateApi()) {
            _closePanel(true);
            _openCustomerCreatePanel(dispName);
            return;
        }
        if (_isOrderCreateApi()) {
            _closePanel(true);
            var orderPending = _activeApi && _activeApi.pendingUpdate;
            if (_activeApi) delete _activeApi.pendingUpdate;
            _openOrderCreatePanel(dispName, orderPending);
            return;
        }

        _closePanel(true); // Chỉ xa DOM cũ, khng xa _activeApi



        var useFilters = config && config.filters && config.filters.length > 0;

        var semanticFields = {};
        var fields = (useFilters ? config.filters : (config ? config.fields || [] : []))

            .filter(function (f) {
                if (f.IsSystemParam && f.IsSystemParam != 0) return false;
                var bare = String(f.FieldCode || '').toLowerCase().replace(/^@/, '');
                var semantic = bare;
                if (['makhachhang', 'objectid', 'objectname'].indexOf(bare) >= 0) semantic = 'customer';
                if (['employeeid', 'tennhanvien', 'employeename'].indexOf(bare) >= 0) semantic = 'employee';
                if (['itemid', 'tensanpham', 'itemname'].indexOf(bare) >= 0) semantic = 'product';
                if (semanticFields[semantic]) return false;
                semanticFields[semantic] = true;
                return true;
            });



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



        // A fixed modal must live at document level.  Mounting it in the
        // scrollable chat container lets that container clip it, while the
        // backdrop remains visible — producing a dimmed screen with no panel.
        var panel = _panelEl;
        document.body.appendChild(panel);



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



        requestAnimationFrame(function () {
            if (_panelEl === panel && panel.isConnected) panel.classList.add('active');
        });

        if (_activeApi && _activeApi.pendingUpdate) {
            window.ApiEngine.applyFormUpdate(_activeApi.pendingUpdate);
            delete _activeApi.pendingUpdate;
        }

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
        if (code.toLowerCase() === '@objectname') { title = 'Khách hàng'; ph = 'Tìm theo mã hoặc tên khách hàng'; }
        if (code.toLowerCase() === '@employeeid' || code.toLowerCase() === '@tennhanvien') { title = 'Nhân viên'; ph = 'Tìm theo mã hoặc tên nhân viên'; }

        var ctrl = f.ControlType || 'text';
        var reqd = f.IsRequired == 1;
        var defVal = _resolveDefault(f.DefaultValue || '');

        // Hide purely technical system params from the UI layer
        if (['@statusid', '@statusname', '@topn', '@pageindex', '@pagesize'].includes(code.toLowerCase())) {
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

                + '<div class="ae-combo-status" aria-live="polite"></div>'

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

                wrap.classList.remove('ae-combo-selected');
                var status = wrap.querySelector('.ae-combo-status');
                if (status) { status.textContent = ''; status.className = 'ae-combo-status'; }

                hid.value = ''; // reset ID khi g lại

                var kw = this.value.trim();



                // STATIC: filter ngay, khng cần debounce

                if (dsType === 'STATIC') {

                    _loadDataSource(dsType, dsVal, kw, function (rows) {

                        console.log('--- RENDER SUG (input) ---', rows.length, 'rows');
                        if (!_tryAutoSelectExact(rows, kw, txt, hid)) _renderComboSug(sug, txt, hid, rows, false);

                    });

                    return;

                }



                timer = setTimeout(function () {

                    _loadDataSource(dsType, dsVal, kw, function (rows) {

                        console.log('--- RENDER SUG (input) ---', rows.length, 'rows');
                        if (!_tryAutoSelectExact(rows, kw, txt, hid)) _renderComboSug(sug, txt, hid, rows, false);

                    });

                }, 320);

            });



            // Xa hết → reset selection

            txt.addEventListener('keydown', function (e) {

                if ((e.key === 'Backspace' || e.key === 'Delete') && !this.value) {

                hid.value = '';

                wrap.classList.remove('ae-combo-selected');
                var status = wrap.querySelector('.ae-combo-status');
                if (status) { status.textContent = ''; status.className = 'ae-combo-status'; }

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

            + '<div class="ae-dg-col col-price"><label>Giá</label><input type="number" class="ae-dg-val ae-dg-price" data-col="Price" value="0"></div>'

            + '<div class="ae-dg-col col-dis"><label>CK%</label><input type="number" class="ae-dg-val ae-dg-discount" data-col="DiscountPercent" value="0"></div>'

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

        var qtyIns = rowEl.querySelectorAll('.ae-dg-qty, .ae-dg-price, .ae-dg-discount');

        qtyIns.forEach(function (inp) {

            inp.addEventListener('input', function () { _calcDataGrid(gridId); });

        });



        // Xa dòng

        rowEl.querySelector('.ae-dg-del-btn').onclick = function (e) {

            if (e) e.stopPropagation();

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

            var discountInput = row.querySelector('.ae-dg-discount');
            var discount = discountInput ? (parseFloat(discountInput.value) || 0) : 0;

            var total = qty * price * (1 - discount / 100);

            var totalInp = row.querySelector('.ae-dg-total-row');

            if (totalInp) totalInp.value = total.toLocaleString();

            grandTotal += total;

        });

        var totalEl = document.getElementById(gridId + '_total');

        if (totalEl) totalEl.textContent = grandTotal.toLocaleString();

    }



    function _comboRowMeta(r) {
        var keys = Object.keys(r || {}).filter(function (k) { return k.toUpperCase() !== 'STT'; });
        var vKey = keys.find(function (k) {
            var kl = k.toLowerCase();
            return kl === 'id' || kl.indexOf('id') > -1 || kl.indexOf('ma') === 0;
        }) || (keys.length > 0 ? keys[0] : null);
        var lKey = keys.find(function (k) {
            var kl = k.toLowerCase();
            return (kl.indexOf('ten') === 0 || kl.indexOf('name') > -1) && k !== vKey;
        });
        if (!lKey && keys.length > 1) lKey = keys.find(function (k) { return k !== vKey; });
        if (!lKey) lKey = vKey;
        return {
            value: vKey ? String(r[vKey] == null ? '' : r[vKey]).trim() : '',
            label: lKey ? String(r[lKey] == null ? '' : r[lKey]).trim() : ''
        };
    }

    function _setComboSelection(txt, hid, value, label) {
        txt.value = label || value;
        hid.value = value;
        txt.classList.remove('ae-error');
        var wrap = txt.closest('.ae-combo');
        if (!wrap) return;
        wrap.classList.add('ae-combo-selected');
        var status = wrap.querySelector('.ae-combo-status');
        if (status) {
            status.className = 'ae-combo-status is-selected';
            status.textContent = 'Da chon: ' + value + (label && label !== value ? ' - ' + label : '');
        }
    }

    function _tryAutoSelectExact(rows, keyword, txt, hid) {
        var needle = String(keyword || '').trim().normalize('NFC').toLocaleLowerCase('vi');
        if (!needle || !rows || !rows.length) return false;
        var exact = rows.map(_comboRowMeta).filter(function (m) {
            return m.value.toLocaleLowerCase('vi') === needle
                || m.label.normalize('NFC').toLocaleLowerCase('vi') === needle;
        });
        if (exact.length !== 1) return false;
        _setComboSelection(txt, hid, exact[0].value, exact[0].label);
        var sug = txt.closest('.ae-combo').querySelector('.ae-combo-sug');
        if (sug) sug.style.display = 'none';
        return true;
    }

    function _renderComboSug(sug, txt, hid, rows, showAll) {
        if (!rows || !rows.length) {
            sug.innerHTML = '<div class="ae-sug-empty">Kh\u00f4ng t\u00ecm th\u1ea5y k\u1ebft qu\u1ea3 ph\u00f9 h\u1ee3p.</div>';
            sug.style.display = 'block';
            return;
        }

        var limit = showAll ? rows.length : 12;
        var html = '<div class="ae-sug-header"><span class="ae-sug-col-id">M\u00e3</span><span class="ae-sug-col-name">Kh\u00e1ch h\u00e0ng</span></div>';

        html += rows.slice(0, limit).map(function (r) {
            var meta = _comboRowMeta(r);
            var details = [];
            var price = 0;

            Object.keys(r || {}).forEach(function (key) {
                if (key.toUpperCase() === 'STT') return;
                var value = r[key];
                var keyLower = key.toLowerCase();
                if (value === null || value === undefined || value === '' || typeof value === 'object') return;
                if (/gi|price|ti\u1ec1n/i.test(keyLower)) price = parseFloat(value) || price;

                // API payloads often include ExtraData JSON and internal fields.
                // Keep the selection list to the contact details a user needs.
                if (/extra|json|meta/i.test(keyLower)) {
                    if (typeof value === 'string') {
                        try {
                            var extra = JSON.parse(value);
                            var address = extra.Address || extra.address || extra.DiaChi || extra.diachi;
                            var phone = extra.Phone || extra.phone || extra.DienThoai || extra.dienthoai;
                            if (address) details.push(String(address).trim());
                            if (phone) details.push(String(phone).trim());
                        } catch (ignore) { }
                    }
                    return;
                }
                if (/phanloai|type|tax|disable|branch/i.test(keyLower)) return;
                if (/address|diachi|dia_chi|phone|dienthoai|dien_thoai|mobile|tel/i.test(keyLower)) {
                    details.push(String(value).trim());
                }
            });

            var subtitle = details.slice(0, 2).join(' \u2022 ');
            return '<button type="button" class="ae-sug-row" data-val="' + _esc(meta.value) + '" data-lbl="' + _esc(meta.label) + '" data-price="' + _esc(price) + '">'
                + '<span class="ae-sug-col-id"><span class="ae-sug-val">' + _esc(meta.value) + '</span></span>'
                + '<span class="ae-sug-col-name"><span class="ae-sug-lbl">' + _esc(meta.label) + '</span>'
                + (subtitle ? '<span class="ae-sug-sub">' + _esc(subtitle) + '</span>' : '')
                + '</span></button>';
        }).join('');

        sug.innerHTML = html;
        sug.style.display = 'block';
        sug.querySelectorAll('.ae-sug-row').forEach(function (el) {
            el.addEventListener('mousedown', function (e) { e.preventDefault(); });
            el.addEventListener('click', function () {
                _setComboSelection(txt, hid, this.getAttribute('data-val'), this.getAttribute('data-lbl'));
                sug.style.display = 'none';

                // Preserve the product-grid behavior: a selected product may
                // supply a price that is used to recalculate its line total.
                var gridRow = txt.closest('.ae-dg-row');
                if (gridRow) {
                    var priceInp = gridRow.querySelector('.ae-dg-price');
                    var priceVal = this.getAttribute('data-price');
                    if (priceInp && priceVal !== null && priceVal !== 'undefined') {
                        priceInp.value = priceVal;
                        var grid = gridRow.closest('.ae-datagrid-field');
                        if (grid && typeof _calcDataGrid === 'function') _calcDataGrid(grid.id);
                    }
                }
            });
        });
    }

    function _renderComboSugVerbose(sug, txt, hid, rows, showAll) {

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
                _setComboSelection(txt, hid, this.getAttribute('data-val'), this.getAttribute('data-lbl'));
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

                    var isCustomerCombo = fcLow === '@makhachhang' || fcLow === '@objectid'
                        || fcLow.indexOf('khachhang') > -1 || fcLow.indexOf('customer') > -1 || fcLow.indexOf('makh') > -1;

                    if (isCustomerCombo && txt && !id) {
                        if (txtEl) { txtEl.focus(); txtEl.classList.add('ae-error'); }
                        var comboWrap = txtEl ? txtEl.closest('.ae-combo') : null;
                        var comboStatus = comboWrap ? comboWrap.querySelector('.ae-combo-status') : null;
                        if (comboStatus) {
                            comboStatus.className = 'ae-combo-status is-error';
                            comboStatus.textContent = 'Khong tim thay mot khach hang duy nhat. Vui long chon tu danh sach goi y.';
                        }
                        hasErr = true;
                        return;
                    }

                    if (f.IsRequired == 1 && !id && !txt) {

                        if (txtEl) { txtEl.focus(); txtEl.classList.add('ae-error'); }

                        hasErr = true;

                    } else {

                        if (txtEl) txtEl.classList.remove('ae-error');

                        var finalVal = isCustomerCombo ? id : (id || txt || "");

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

                                        if (col === 'Quantity' || col === 'Price' || col === 'DiscountPercent') val = parseFloat(val) || 0;
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

            // Customer values selected from the friendly picker are displayed as
            // "MaKhachHang Customer name(CODE)". Recover the real code if the
            // hidden selection state was reset while switching API contexts.
            ['@MaKhachHang', '@ObjectID'].forEach(function (customerKey) {
                var customerValue = params[customerKey];
                if (customerValue === undefined || customerValue === null) return;
                var customerMatch = String(customerValue).trim().match(/^MaKhachHang\s+.*\(([^()]+)\)$/i);
                if (customerMatch) params[customerKey] = customerMatch[1].trim();
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

                            console.warn('Thiếu tham số bắt buộc: ' + (f.FieldName || f.FieldCode));
                            hasErr = true;

                        }

                    }

                });

            }

        }



        // Guard cứng cho các API bắt buộc tham số. Guard này vẫn hoạt động khi metadata
        // đang tải, tránh gửi request thiếu tham số rồi mới nhận lỗi 422 chung từ backend.
        var activeValidationCode = String(_activeApi && _activeApi.apiCode || '').toLowerCase();
        if ((activeValidationCode === '@goi_ydon_hang' || activeValidationCode === '@upsell_goi_y')
            && !params['@MaKhachHang'] && !params['@ObjectID']) {
            if (_cbMsg) _cbMsg('ai', activeValidationCode === '@upsell_goi_y'
                ? 'Vui lòng chọn khách hàng trước khi xem gợi ý bán kèm.'
                : 'Vui lòng chọn khách hàng trước khi xem gợi ý đơn hàng.');
            try { _menuShowParams(''); if (_inputEl) _inputEl.focus(); } catch (e) { }
            return null;
        }
        if (activeValidationCode === '@goi_ydon_thuoc'
            && !params['@timkiem'] && !params['@ItemID'] && !params['@itemid']) {
            if (_cbMsg) _cbMsg('ai', 'Vui lòng chọn sản phẩm gốc trước khi xem gợi ý sản phẩm liên quan.');
            try { _menuShowParams(''); if (_inputEl) _inputEl.focus(); } catch (e) { }
            return null;
        }

        var contractValidationMessage = '';
        if (_activeApi && _activeApi.config) {
            var contractFields = (_activeApi.config.filters && _activeApi.config.filters.length > 0)
                ? _activeApi.config.filters : (_activeApi.config.fields || []);
            contractFields.some(function (f) {
                if (f.IsSystemParam || f.SourceOfTruth === 'SERVER_MAPPING') return false;
                var fieldCode = f.FieldCode || '';
                var value = params[fieldCode];
                var rule = String(f.ValidationRule || '');
                if ((f.Required === true || f.IsRequired == 1) && (value === undefined || value === null || String(value).trim() === '')) {
                    contractValidationMessage = 'Vui lòng nhập ' + (f.FieldName || fieldCode) + ' trước khi thực hiện.';
                    return true;
                }
                if (value === undefined || value === null || String(value).trim() === '') return false;
                if (rule.indexOf('ISO_DATE') !== -1 && !/^\d{4}-\d{2}-\d{2}$/.test(String(value))) {
                    contractValidationMessage = (f.FieldName || fieldCode) + ' không đúng định dạng ngày.';
                    return true;
                }
                if (rule.indexOf('POSITIVE_INTEGER') !== -1) {
                    var numberValue = Number(value);
                    var maxMatch = rule.match(/MAX=(\d+)/);
                    if (!Number.isInteger(numberValue) || numberValue < 1 || (maxMatch && numberValue > Number(maxMatch[1]))) {
                        contractValidationMessage = (f.FieldName || fieldCode) + ' không nằm trong giới hạn cho phép.';
                        return true;
                    }
                }
                return false;
            });
        }
        if (contractValidationMessage) {
            if (_cbMsg) _cbMsg('ai', contractValidationMessage);
            return null;
        }

        if (_activeApi && String(_activeApi.apiCode || '').toLowerCase() === '@tim_san_pham_theo_trieu_chung'
            && !params['@Keyword'] && !params['@keyword'] && !params['@timkiem']) {
            if (_cbMsg) _cbMsg('ai', 'Vui lòng nhập từ khóa hoặc triệu chứng cần tìm trước khi tra cứu.');
            return null;
        }

        if (_activeApi && _activeApi.apiCode === '@cong_no_chi_tiet'
            && !params['@MaKhachHang'] && !params['@ObjectID']) {
            if (_cbMsg) {
                _cbMsg('ai', 'Dạ, vui lòng chọn khách hàng trước khi tra cứu công nợ chi tiết. Anh/chị có thể nhập mã khách hàng hoặc gõ @ để chọn từ danh sách gợi ý.');
            }
            if (_inputEl) {
                _inputEl.placeholder = 'Nhập mã khách hàng hoặc gõ @ để chọn';
                _inputEl.focus();
            }
            return null;
        }

        if (hasErr) return null;



        var uKey = CFG.SYS_PARAMS.USERNAME;
        if (!params[uKey]) params[uKey] = _user();

        if (_activeApi && _activeApi.execType === 'CART' && (_activeApi.apiCode === '@lap_don_hang')) {
            var payloadStr = encodeURIComponent(JSON.stringify(params));
            window.parent.location.hash = '/create-order?data=' + payloadStr;
            return null;
        }

        // Cứu cánh: Đảm bảo tham số Ngày luôn được gán tự động nếu người dùng chỉ nhập keyword hoặc thiếu config
        var cfgContext = (_activeApi && _activeApi.config) || (_activeApi && _activeApi.apiConfig ? _activeApi.apiConfig : null);

        if (!cfgContext && window.ApiEngine && window.ApiEngine.CatalogConfig) {
            var tKey = (_activeApi ? (_activeApi.ApiCode || _activeApi.apiCode || '') : (_chatApiCode || '')).replace(/^@/, '');

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

        // Chuẩn hóa giá trị chọn từ menu trước khi gửi BE. UI có thể giữ
        // nhãn dạng "Khách hàng(KhachHang)" để hiển thị, nhưng SQL chỉ
        // nhận mã loại báo cáo chuẩn.
        if (String(apiCode || '').toLowerCase() === '@doanh_so') {
            var reportValue = String(params['@LoaiBaoCao'] || params['@LoaiBaoCao'.toLowerCase()] || '');
            // Bộ chọn inline cũ có thể gán nhầm nhãn LoaiBaoCao vào bộ lọc
            // khách hàng theo vị trí. Không gửi giá trị giao diện này xuống SQL.
            ['@MaKhachHang', '@ObjectName', '@EmployeeID', '@TenNhanVien', '@TenSanPham'].forEach(function (key) {
                var value = String(params[key] || '');
                if (/loaibaocao/i.test(value)) {
                    if (!reportValue) reportValue = value;
                    delete params[key];
                }
            });
            var normalizedReport = reportValue.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/đ/g, 'd');
            if (normalizedReport.indexOf('khachhang') >= 0 || normalizedReport.indexOf('khach hang') >= 0) params['@LoaiBaoCao'] = 'KhachHang';
            else if (normalizedReport.indexOf('nhanvien') >= 0 || normalizedReport.indexOf('nhan vien') >= 0) params['@LoaiBaoCao'] = 'NhanVien';
            else if (normalizedReport.indexOf('sanpham') >= 0 || normalizedReport.indexOf('san pham') >= 0) params['@LoaiBaoCao'] = 'SanPham';
            else if (normalizedReport.indexOf('tatca') >= 0 || normalizedReport.indexOf('tat ca') >= 0) params['@LoaiBaoCao'] = 'TatCa';
        }

        var cfgFilters = (config && config.filters && Array.isArray(config.filters)) ? config.filters : [];



        // Tạo chuỗi hiển thị: chỉ hiện field người dùng nhập thực sự
        // Lọc: @Username, date macros [THIS_MONTH_START], giá trị rỗng
        var seenDisplayFields = {};
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
                var semantic = /tu.?ngay|fromdate|startdate/i.test(k) ? 'fromDate' : (/den.?ngay|todate|enddate/i.test(k) ? 'toDate' : label);
                if (seenDisplayFields[semantic]) return '';
                seenDisplayFields[semantic] = true;
                var displayValue = params[k];
                var isDateField = semantic === 'fromDate'
                    || semantic === 'toDate'
                    || /ngay|date/i.test(k)
                    || (f && (/date/i.test(String(f.DataType || '')) || /date/i.test(String(f.ControlType || ''))));
                if (isDateField) {
                    var dateMatch = String(displayValue || '').match(/^(\d{4})-(\d{2})-(\d{2})/);
                    if (dateMatch) displayValue = dateMatch[3] + '/' + dateMatch[2] + '/' + dateMatch[1];
                }
                return label + ': ' + displayValue;
            })
            .filter(Boolean)
            .join(' | ');

        _cbMsg && _cbMsg('user', dispName + (ps ? ' — ' + ps : ''));

        _cbShow && _cbShow();

        if (_activeRequestController) {
            _activeRequestController.abort();
        }
        var requestController = new AbortController();
        _activeRequestController = requestController;
        _cbSetWaiting && _cbSetWaiting(true);

        _post(CFG.EXEC_URL, {

            ApiCode: apiCode, 

            StoredProcedure: sp, 

            params: params,

            username: _user()

        }, requestController.signal).then(function (res) {

                _cbHide && _cbHide();
                if (_activeRequestController === requestController) {
                    _activeRequestController = null;
                    _cbSetWaiting && _cbSetWaiting(false);
                }

                var r = typeof res === 'string' ? res : (res.message || res.reply || '');
                var responseStatus = String(res && res.status || '').toUpperCase();

                if (res && (res.success === false || res.status === 'error' || responseStatus === 'ERROR')) {
                    var friendlyError = /Missing para or Object not support/i.test(r)
                        ? 'Yêu cầu chưa được hỗ trợ hoặc đang thiếu tham số bắt buộc. Vui lòng kiểm tra lại thông tin tra cứu.'
                        : 'Không thể thực hiện yêu cầu. Vui lòng thử lại hoặc liên hệ quản trị viên.';
                    console.error('[ApiEngine] Execute failed:', r, res);
                    _cbMsg && _cbMsg('ai', _friendlyApiMessage(r, friendlyError));
                    return;
                }



                // --- Tự động render mảng Data ---

                // N8N c thể trả về array 2 chiều [ [ ... ] ]

                if (Array.isArray(res) && res.length === 1 && Array.isArray(res[0])) { res = res[0]; }

                if (res && res.data && Array.isArray(res.data) && res.data.length === 1 && Array.isArray(res.data[0])) { res.data = res.data[0]; }

                

                var arrData = Array.isArray(res) ? res : (res && Array.isArray(res.data) ? res.data : null);

                if (responseStatus !== 'SUCCESS' && ['NO_DATA', 'OUT_OF_SCOPE', 'VALIDATION_ERROR', 'SYSTEM_ERROR'].indexOf(responseStatus) !== -1) {
                    arrData = [];
                }

                if (arrData && arrData.length > 0) {

                    var msgRow = arrData.find(function(row) { return row.Msg !== undefined; });

                    if (msgRow && msgRow.MsgType !== undefined) {

                        _cbMsg && _cbMsg('ai', _friendlyApiMessage(msgRow.Msg));

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

                        var emptyCode = String(res.errorCode ?? res.code ?? 'NO_DATA').toUpperCase();
                        var emptyMessages = {
                            NO_DATA: 'Không có dữ liệu phù hợp với điều kiện tra cứu.',
                            OUT_OF_SCOPE: 'Bạn không có quyền xem dữ liệu này trong phạm vi được giao.',
                            VALIDATION_ERROR: 'Thông tin tra cứu chưa hợp lệ. Vui lòng kiểm tra và thử lại.',
                            SYSTEM_ERROR: 'Hệ thống chưa thể tải dữ liệu. Vui lòng thử lại sau.'
                        };
                        _cbMsg && _cbMsg('ai', emptyMessages[emptyCode] ?? emptyMessages.NO_DATA);

                        return;

                    }



                    if (_cbRender && _cbHtml) {

                        var uiTpl = (res.uiTemplate || ApiEngine.getUiTemplate(apiCode) || 'DEFAULT').toUpperCase();

                        var dtToRender = dataRows.length ? dataRows : arrData;

                        var responseMetadata = res.metadata ?? res.meta ?? {};
                        var html = _cbRender(dtToRender, r || ('🔍 Tìm thấy ' + dtToRender.length + ' kết quả'), apiCode, {

                            uiTemplate: uiTpl,

                            fieldRoles: ApiEngine.getRoleMapping(),

                            queryParams: Object.assign({}, params),

                            khCode: '',  // engine khng c context khCode, chatbot.js sẽ tự resolve
                            responseMetadata: responseMetadata,
                            requestId: res.requestId ?? responseMetadata.requestId ?? null,
                            contractVersion: res.contractVersion ?? responseMetadata.contractVersion ?? null,
                            status: res.errorCode ?? res.code ?? res.status ?? null

                        });

                        _cbHtml(
                            html,
                            r || '📊 Kết quả tra cứu',
                            res.requestId ?? responseMetadata.requestId ?? null
                        );

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
                if (_activeRequestController === requestController) {
                    _activeRequestController = null;
                    _cbSetWaiting && _cbSetWaiting(false);
                }

                if (err && err.name === 'AbortError') return;

                var errorText = err && err.code === 'VALIDATION_ERROR'
                    ? (err.message || 'Yêu cầu đang thiếu thông tin bắt buộc.')
                    : (err.message || err);
                _cbMsg && _cbMsg('ai', _friendlyApiMessage(errorText, 'Không thể thực hiện yêu cầu. Vui lòng thử lại.'));

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


            // Resolve a visible API tag before handling the current API state.
            // This is important when the user switches from one business flow
            // to another by typing/pasting a tag such as "#danh_muc @Type=".
            // Otherwise the previous API can consume the input event and close
            // the new flow before its datasource menu is opened.
            var typedApiMatch = val.match(/(?:^|\s)#([a-z0-9_]+)/i);
            if (typedApiMatch) {
                var typedApiCode = '@' + typedApiMatch[1];
                var typedApi = _apiList.find(function (api) {
                    return String(api.ApiCode || '').toLowerCase() === typedApiCode.toLowerCase();
                });
                var activeApiCode = String(_activeApi && _activeApi.apiCode || '').toLowerCase();
                if (typedApi && activeApiCode !== typedApiCode.toLowerCase()) {
                    _onApiSelected(typedApi.ApiCode, { preserveInput: true });
                    return;
                }
            }



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

                        // Danh mục luôn cần chọn loại danh mục ngay sau @Type=.
                        // Mở trực tiếp datasource động, không phụ thuộc metadata
                        // của API và không hard-code danh sách loại.
                        if (String(_activeApi.apiCode || '').toLowerCase()
                            === String(CFG.CATALOG_ROOT_API || '@danh_muc').toLowerCase()
                            && String(pCode).toLowerCase() === '@type'
                            && !pVal) {
                            _openCatalogTypePicker(0);
                            return;
                        }



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



            // Outside an active API flow, a standalone trailing "@" opens
            // only the dynamic catalog-type picker. The complete function
            // menu remains exclusive to the four-square button.
            if (_isCatalogTypePrompt()) {
                _openCatalogTypePicker(0);
                return;
            }

            var catalogAtPos = val.lastIndexOf('@');
            if (catalogAtPos !== -1) {
                var catalogMentionTail = val.slice(catalogAtPos + 1);
                var catalogMentionBoundary = catalogAtPos === 0
                    || /\s/.test(val.charAt(catalogAtPos - 1));

                if (catalogMentionBoundary && catalogMentionTail.trim() === '') {
                    _menuShowCatalog('', catalogAtPos);
                    return;
                }
            }

            if (_menuVis) _menuHide();
            return;

            var pos = val.lastIndexOf('@');

            var querySearch = val;





            // Nếu đang c token dạng @type=... (v dụ @khachhang=), tự động mở menu thực thể

            if (pos !== -1) {

                var tail = val.slice(pos + 1);

                // If there's nothing after '@' (user deleted back to '@'), reopen catalog suggestions

                if (tail.trim() === '') {

                    console.log('[ApiEngine] detected lone @ at pos', pos, ' reopening catalog/API menu');

                    clearTimeout(_dbt);

                    // A trailing @ in ordinary text uses the same API picker as
                    // the four-square button. Danh mục then opens its @Type step.
                    _dbt = setTimeout(function () {
                        console.log('[ApiEngine] calling _menuShow (API list) from watcher');
                        _menuShow('');
                    }, 80);

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



        // Đóng menu gợi ý khi người dùng bấm ra ngoài bảng và thanh nhập.
        // Click bên trong menu/thanh nhập vẫn giữ nguyên để không cản thao tác chọn.
        document.addEventListener('click', function (e) {
            if (!_menuEl || !_menuVis) return;

            var isInsideMenu = _menuEl.contains(e.target);
            var isInsideInputBar = _inputBarEl && _inputBarEl.contains(e.target);

            if (!isInsideMenu && !isInsideInputBar) {
                _menuHide();
            }
        });

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

            // Autofill regular fields from res.params or res.intentParams
            var paramsToFill = Object.assign({}, res.intentParams || {}, res.params || {});
            
            // Map common aliases
            if (paramsToFill['@MaKhachHang'] && !paramsToFill['@ObjectID']) {
                paramsToFill['@ObjectID'] = paramsToFill['@MaKhachHang'];
            }

            Object.keys(paramsToFill).forEach(function(k) {
                var cleanK = k.replace('@', '').toLowerCase();
                var el = document.getElementById('ae-f-' + cleanK) || 
                         document.querySelector('[name="' + k + '"]') || 
                         document.querySelector('[name="' + k.replace('@', '') + '"]');
                if (el) {
                    var val = paramsToFill[k];
                    if (val !== null && val !== undefined) {
                        var txtEl = document.getElementById(el.id + '_txt');
                        var wrap = el.closest('.ae-combo');
                        if (wrap && txtEl) {
                            // Smart combobox live-lookup
                            var dsType = wrap.getAttribute('data-ds-type');
                            var dsVal = wrap.getAttribute('data-ds-val');
                            (function(hiddenEl, textEl, keyword) {
                                _loadDataSource(dsType, dsVal, keyword, function(rows) {
                                    if (rows && rows.length > 0) {
                                        var r = rows[0];
                                        var keys = Object.keys(r).filter(function(keyCol) { return keyCol.toUpperCase() !== 'STT'; });
                                        var vKey = keys.find(function(keyCol) { 
                                            var kl = keyCol.toLowerCase(); 
                                            return kl === 'id' || kl.indexOf('id') > -1 || kl.indexOf('ma') === 0 || kl.indexOf('mã') === 0; 
                                        }) || (keys.length > 0 ? keys[0] : null);
                                        
                                        var lKey = keys.find(function(keyCol) { 
                                            var kl = keyCol.toLowerCase(); 
                                            return (kl.indexOf('ten') === 0 || kl.indexOf('tên') === 0 || kl.indexOf('name') > -1) && keyCol !== vKey; 
                                        });
                                        if (!lKey && keys.length > 1) {
                                            lKey = keys.find(function(keyCol) { return keyCol !== vKey; });
                                        }
                                        if (!lKey) lKey = vKey;
                                        
                                        var realVal = vKey ? r[vKey] : '';
                                        var realLbl = lKey ? r[lKey] : realVal;
                                        
                                        hiddenEl.value = realVal;
                                        textEl.value = realLbl;
                                        hiddenEl.dispatchEvent(new Event('input', { bubbles: true }));
                                        hiddenEl.dispatchEvent(new Event('change', { bubbles: true }));
                                    } else {
                                        hiddenEl.value = keyword;
                                        textEl.value = keyword;
                                        hiddenEl.dispatchEvent(new Event('input', { bubbles: true }));
                                    }
                                });
                            })(el, txtEl, val);
                        } else {
                            el.value = val;
                            if (txtEl) {
                                txtEl.value = val;
                            }
                            el.dispatchEvent(new Event('input', { bubbles: true }));
                            el.dispatchEvent(new Event('change', { bubbles: true }));
                        }
                    }
                }
            });
            
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
                        var inDiscount = targetRow.querySelector('.ae-dg-discount');
                        
                        if (inQty) {
                            inQty.value = parseFloat(it.qty) || 1;
                            inQty.dispatchEvent(new Event('input', { bubbles: true }));
                        }
                        if (inDiscount && it.discount !== undefined && it.discount !== null) {
                            inDiscount.value = parseFloat(it.discount) || 0;
                            inDiscount.dispatchEvent(new Event('input', { bubbles: true }));
                        }
                        if (inName) {
                            inName.value = it.keyword; // Synchronously mark row as claimed to avoid race condition
                        }
                        
                        var wrap = inName ? inName.closest('.ae-combo') : null;
                        if (wrap && inVal) {
                            var dsType = wrap.getAttribute('data-ds-type');
                            var dsVal = wrap.getAttribute('data-ds-val');
                            (function(hiddenEl, textEl, gridRow, keyword, customPrice) {
                                _loadDataSource(dsType, dsVal, keyword, function(rows) {
                                    if (rows && rows.length > 0) {
                                        var r = rows[0];
                                        var keys = Object.keys(r).filter(function(keyCol) { return keyCol.toUpperCase() !== 'STT'; });
                                        var vKey = keys.find(function(keyCol) { 
                                            var kl = keyCol.toLowerCase(); 
                                            return kl === 'id' || kl.indexOf('id') > -1 || kl.indexOf('ma') === 0 || kl.indexOf('mã') === 0; 
                                        }) || (keys.length > 0 ? keys[0] : null);
                                        
                                        var lKey = keys.find(function(keyCol) { 
                                            var kl = keyCol.toLowerCase(); 
                                            return (kl.indexOf('ten') === 0 || kl.indexOf('tên') === 0 || kl.indexOf('name') > -1) && keyCol !== vKey; 
                                        });
                                        if (!lKey && keys.length > 1) {
                                            lKey = keys.find(function(keyCol) { return keyCol !== vKey; });
                                        }
                                        if (!lKey) lKey = vKey;
                                        
                                        var realVal = vKey ? r[vKey] : '';
                                        var realLbl = lKey ? r[lKey] : realVal;
                                        
                                        hiddenEl.value = realVal;
                                        textEl.value = realLbl;
                                        hiddenEl.dispatchEvent(new Event('input', { bubbles: true }));
                                        hiddenEl.dispatchEvent(new Event('change', { bubbles: true }));
                                        
                                        // Also lookup price if column exists!
                                        var priceInp = gridRow.querySelector('.ae-dg-price');
                                        var priceVal = null;
                                        if (customPrice !== null && customPrice !== undefined) {
                                            priceVal = customPrice;
                                        } else {
                                            for (var i = 2; i < keys.length; i++) {
                                                var col = keys[i];
                                                if (col.toLowerCase().indexOf('gi') > -1 || col.toLowerCase().indexOf('price') > -1 || col.toLowerCase().indexOf('tiền') > -1) {
                                                    priceVal = r[col];
                                                    break;
                                                }
                                            }
                                        }
                                        if (priceInp && priceVal !== null && priceVal !== undefined) {
                                            priceInp.value = priceVal;
                                            var gridId = gridRow.closest('.ae-datagrid-field') ? gridRow.closest('.ae-datagrid-field').id : null;
                                            if (gridId && typeof _calcDataGrid === 'function') {
                                                _calcDataGrid(gridId);
                                            }
                                        }
                                    } else {
                                        hiddenEl.value = keyword;
                                        textEl.value = keyword;
                                        hiddenEl.dispatchEvent(new Event('input', { bubbles: true }));
                                    }
                                });
                            })(inVal, inName, targetRow, it.keyword, it.price);
                        } else {
                            if (inName) inName.value = it.keyword;
                            if (inVal) {
                                inVal.value = it.keyword;
                                inVal.dispatchEvent(new Event('input', { bubbles: true }));
                            }
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

            _cbSetWaiting = opts.setWaiting || null;

            _loadList(function () { console.log('[ApiEngine v3] ' + _apiList.length + ' APIs'); });

            // Warm the dynamic catalog-type cache without blocking chat
            // startup. The @ picker can therefore open immediately on the
            // first user interaction after the catalog response arrives.
            setTimeout(function () {
                _loadCatalogTypeRows('', function () {});
            }, 0);

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

            // Khôi phục nghiệp vụ từ tag đang hiển thị nếu state bị mất do tải config,
            // đổi route hoặc người dùng nhập trực tiếp #api_code.
            if (_inputEl) {
                var tagMatch = _inputEl.value.trim().match(/^#([\w-]+)/);
                if (tagMatch) {
                    var requestedCode = '@' + tagMatch[1];
                    var knownApi = _apiList.find(function (a) {
                        return String(a.ApiCode || '').toLowerCase() === requestedCode.toLowerCase();
                    });
                    var activeCode = String(_activeApi && _activeApi.apiCode || '').toLowerCase();
                    if (knownApi && activeCode !== String(knownApi.ApiCode || '').toLowerCase()) {
                        _onApiSelected(knownApi.ApiCode, { preserveInput: true, autoSubmit: true });
                        return true;
                    }
                }
            }

            // "Tạo khách hàng (mới)" gõ tự nhiên: mở thẳng form tạo khách hàng có
            // sẵn (giống bấm mục "Tạo khách hàng" trong menu). Đây là hành động
            // client-side thuần túy -- panel chỉ hiện form trống, không gọi AI
            // backend, nên không có rủi ro tự ghi dữ liệu từ một câu chat.
            if (!_activeApi && _inputEl) {
                var createCustomerText = _inputEl.value.trim()
                    .toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/đ/g, 'd')
                    .replace(/\s+/g, ' ').trim();
                if (/^(tao|them)\s+(1\s+)?khach\s*hang(\s+moi)?(\s+(nhe|nha|giup|giup toi))?[.!]?$/.test(createCustomerText)) {
                    _onApiSelected('@khach_hang_insert');
                    return true;
                }
            }

            if (!_activeApi) return false;

            // Panel lập đơn có form và nút xác nhận riêng. Nếu người dùng bấm
            // Enter ở ô chat khi panel đang mở, phải chuyển vào đúng nút đó --
            // để rơi xuống _collectParams() sẽ đọc nhầm các field không tồn tại
            // rồi chuyển sang /create-order với payload rỗng, mất hết dữ liệu.
            if (_isOrderCreateApi() && _panelEl) {
                var orderSubmit = _panelEl.querySelector('#ae-panel-send-btn');
                if (orderSubmit) { orderSubmit.click(); return true; }
            }

            var params = _collectParams();

            if (params === null) return true; // Validation fail, khng gửi

            // Product lookup is search-only: an empty keyword must not fall
            // through to the catalog procedure and return an unfiltered list.
            if (String(_activeApi.apiCode || '').toLowerCase() === '@danh_muc'
                && String(params['@Type'] || params['@type'] || '').toLowerCase() === 'sanpham'
                && !String(params['@timkiem'] || params['@TimKiem'] || '').trim()) {
                if (_cbMsg) _cbMsg('ai', 'Vui lòng nhập tên hoặc mã sản phẩm cần tìm trước khi tra cứu.');
                if (_inputEl) _inputEl.focus();
                return true;
            }

            var api = _activeApi;



            // ── Catalog Type Redirect khi Send ────────────────────────────

            // Nếu _pillParams c type m _catalogDsMap trỏ sang API khc

            // → Redirect execute sang API đ thay v API hiện tại (trnh lỗi too many args)

            var catalogTypeOnlyLookup = String(api.apiCode || '').toLowerCase() === '@danh_muc'
                && String(params['@Type'] || params['@type'] || '').trim() !== ''
                && String(params['@timkiem'] || params['@TimKiem'] || '').trim() === '';
            if (!api.lockSelectedApi && !catalogTypeOnlyLookup && _catalogDsMap && _pillParams) {

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

        cancelPending: function () {
            if (!_activeRequestController) return false;
            _activeRequestController.abort();
            _activeRequestController = null;
            _cbHide && _cbHide();
            _cbSetWaiting && _cbSetWaiting(false);
            return true;
        },

        isPending: function () {
            return Boolean(_activeRequestController);
        },



        configure: function (cfg) { Object.assign(CFG, cfg); },

        open: function (code) { _onApiSelected(code); return true; },

        openCustomerPicker: function (code) {
            _onApiSelected(code, { focusCustomer: true });
            return true;
        },

        execute: function (code, params) {
            var apiCode = code && code.charAt(0) === '@' ? code : '@' + code;
            // A catalog type selection without a keyword is a picker request,
            // not a product search. Avoid calling APIs that require @timkiem.
            if (apiCode.toLowerCase() === '@danh_muc' && params &&
                String(params['@Type'] || '').toLowerCase() === 'sanpham' &&
                !String(params['@timkiem'] || '').trim()) {
                params = { '@Type': 'sanpham' };
            }
            var meta = (_apiList || []).find(function (item) { return item.ApiCode === apiCode; }) || {};
            _loadConfig(apiCode, function (cfg) {
                _executeApi(apiCode, params || {}, meta.DisplayName || apiCode, meta.ExecutionType || 'QUERY', cfg);
            });
            return true;
        },

        queryData: function (code, params) {
            var apiCode = code && code.charAt(0) === '@' ? code : '@' + code;
            return _post(CFG.EXEC_URL, {
                ApiCode: apiCode,
                params: params || {},
                username: _user()
            }).then(function (res) {
                var contractStatus = String(res && res.status || '').toUpperCase();
                if (res && (res.success === false || res.status === 'error' || ['OUT_OF_SCOPE', 'VALIDATION_ERROR', 'SYSTEM_ERROR'].indexOf(contractStatus) !== -1)) {
                    var apiError = new Error(res.message || res.reply || 'API error');
                    apiError.code = res.errorCode || res.code || contractStatus || 'API_ERROR';
                    throw apiError;
                }
                if (contractStatus === 'NO_DATA') return [];
                if (Array.isArray(res) && res.length === 1 && Array.isArray(res[0])) res = res[0];
                if (res && Array.isArray(res.data) && res.data.length === 1 && Array.isArray(res.data[0])) res.data = res.data[0];
                var rows = Array.isArray(res) ? res : (res && Array.isArray(res.data) ? res.data : []);
                return rows.filter(function (row) {
                    if (!row || row.Msg !== undefined || row.msg !== undefined) return false;
                    return Object.keys(row).some(function (key) {
                        return String(key).indexOf('Metadata_') !== 0 && row[key] !== null && row[key] !== undefined && String(row[key]).trim() !== '';
                    });
                });
            });
        },

        getUiTemplate: function (apiCode) {

            if (!apiCode) return 'DEFAULT';

            var codeClean = apiCode.startsWith('@') ? apiCode : '@' + apiCode;

            // Debt APIs must use the business-rule renderer even when the
            // remote API catalog has no UiTemplate metadata yet.
            if (codeClean.indexOf('@cong_no') === 0) return 'CONG_NO';

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



            // Danh mục nghiệp vụ là một picker chiếm gần hết màn hình. Nếu để

            // bàn phím ở lại thì trên mobile nó chỉ còn ~280px và bị cắt cụt ở

            // mép trên. App native luôn thu bàn phím khi mở picker → làm y vậy.

            // Chọn xong một mục thì luồng _onApiSelected() focus lại ô nhập nên

            // bàn phím tự quay lên, không mất nhịp thao tác.

            if (_inputEl && window.innerWidth <= 767 && document.activeElement === _inputEl) {

                _inputEl.blur();

            }



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



