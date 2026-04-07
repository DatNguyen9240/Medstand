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
    var CFG = {
        LIST_URL: 'https://highways-robbie-outdoors-jefferson.trycloudflare.com/webhook/api-list-active',
        CFG_URL: 'https://highways-robbie-outdoors-jefferson.trycloudflare.com/webhook/api-get-config',
        EXEC_URL: 'https://highways-robbie-outdoors-jefferson.trycloudflare.com/webhook/api-execute',
        DS_URL: 'https://highways-robbie-outdoors-jefferson.trycloudflare.com/webhook/api-datasource',
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
        // Remove combining diacritics as a fallback
        s = s.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
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
    function _loadList(cb) {
        try {
            var c = JSON.parse(sessionStorage.getItem(CFG.CACHE_KEY));
            if (c && c.data && Date.now() - c.ts < CFG.CACHE_TTL) { _apiList = c.data; cb && cb(_apiList); return; }
        } catch (e) { }

        _post(CFG.LIST_URL, { SearchKey: '' })
            .then(function (res) {
                _apiList = Array.isArray(res) ? res : (res.data || res.records || []);
                try { sessionStorage.setItem(CFG.CACHE_KEY, JSON.stringify({ data: _apiList, ts: Date.now() })); } catch (e) { }
                cb && cb(_apiList);
            })
            .catch(function () {
                _apiList = [
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
                cb && cb(_apiList);
            });
    }

    function _loadConfig(apiCode, cb) {
        if (_cfgCache[apiCode]) { cb(_cfgCache[apiCode]); return; }
        _post(CFG.CFG_URL, { ApiCode: apiCode })
            .then(function (res) {
                var c = {
                    info: Array.isArray(res[0]) ? res[0][0] : (res.api || {}),
                    fields: Array.isArray(res[1]) ? res[1] : (res.fields || []),
                    filters: Array.isArray(res[2]) ? res[2] : (res.filters || [])
                };
                _cfgCache[apiCode] = c; cb(c);
            })
            .catch(function () { cb(null); });
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
                    cb(_normalizeDs(Array.isArray(res) ? res : (res.data || res.records || [])));
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
                    cb(_normalizeDs(Array.isArray(res) ? res : (res.data || res.records || [])));
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

    /** Normalize response rows → [{value, label, sub}] */
    function _normalizeDs(rows) {
        return rows.map(function (r) {
            return {
                value: r.value || r.Value || r.MaDanhMuc || r.ObjectID || r.ItemID || r.EmployeeID || r.ID || '',
                label: r.label || r.Label || r.TenDanhMuc || r.ObjectName || r.ItemName || r.EmployeeName || r.Name || '',
                sub: r.sub || r.Sub || r.SubText || r.Address || r.Phone || r.Code || ''
            };
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
                return _clearVn(a.ApiCode).indexOf(q) !== -1 ||
                    _clearVn(a.DisplayName || '').indexOf(q) !== -1;
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

    function _menuHide() { if (_menuEl) _menuEl.style.display = 'none'; _menuVis = false; _menuIdx = -1; clearTimeout(_hideTimer); }

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
        if (!_menuEl || !_menuVis || _menuIdx < 0) return false;
        var items = _menuEl.querySelectorAll('.ae-menu-item');
        if (items[_menuIdx]) { items[_menuIdx].click(); return true; }
        return false;
    }

    // ── API Selected ──────────────────────────────────────────────────
    function _onApiSelected(apiCode) {
        var found = _apiList.find(function (a) { return a.ApiCode === apiCode; });
        var execType = found ? found.ExecutionType : 'QUERY';
        var dispName = found ? found.DisplayName : apiCode;

        _replaceAtTag(apiCode);

        // Set ngay (sync) để block @ menu trigger trong lúc load config
        _activeApi = { apiCode: apiCode, dispName: dispName, execType: execType, config: null };

        _loadConfig(apiCode, function (config) {
            _activeApi.config = config;
            _cartItems = [];
            _openPanel(config, execType, dispName);
            // Safety net
            if (!_activeApi)
                _activeApi = { apiCode: apiCode, dispName: dispName, execType: execType, config: config };
        });
    }

    function _replaceAtTag(apiCode) {
        var val = _inputEl.value;
        var atPos = val.lastIndexOf('@');
        var tag = '#' + apiCode.replace('@', '') + ' ';
        _inputEl.value = (atPos !== -1 ? val.slice(0, atPos) : val) + tag;

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
            + '<button class="ae-panel-close" id="ae-panel-close">✕</button>'
            + '</div>';

        if (execType === 'CART') {
            html += _buildCartPanel(fields);
        } else if (!fields.length) {
            html += '<div class="ae-panel-empty">Không có tham số — nhấn Gửi để thực hiện.</div>';
        } else {
            html += '<div class="ae-panel-fields">' + fields.map(_buildField).join('') + '</div>';
        }

        _panelEl.innerHTML = html;

        var bar = document.getElementById('chat-input-bar');
        if (bar) bar.prepend(_panelEl);
        else document.body.appendChild(_panelEl);

        document.body.classList.add('ae-panel-open'); // Đánh dấu để ẩn navbar trên mobile
        _panelEl.querySelector('#ae-panel-close').addEventListener('click', _closePanel.bind(null, false));

        // Init DataSource fields
        _initDataSourceFields(_panelEl);

        if (execType === 'CART') _initCartEvents();

        requestAnimationFrame(function () { _panelEl.classList.add('active'); });
        setTimeout(function () {
            var first = _panelEl.querySelector('input:not([type=hidden]),select,textarea');
            if (first) first.focus();
        }, 200);
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
                if (!this.value && dsType === 'STATIC') {
                    _loadDataSource(dsType, dsVal, '', function (rows) {
                        _renderComboSug(sug, txt, hid, rows, true);
                    });
                }
            });

            txt.addEventListener('input', function () {
                clearTimeout(timer);
                hid.value = ''; // reset ID khi gõ lại
                var kw = this.value.trim();

                // STATIC: filter ngay, không cần debounce
                if (dsType === 'STATIC') {
                    _loadDataSource(dsType, dsVal, kw, function (rows) {
                        _renderComboSug(sug, txt, hid, rows, false);
                    });
                    return;
                }

                // SQL/APICODE: cần ít nhất 2 ký tự để search
                if (kw.length < 2) { sug.style.display = 'none'; return; }

                timer = setTimeout(function () {
                    _loadDataSource(dsType, dsVal, kw, function (rows) {
                        _renderComboSug(sug, txt, hid, rows, false);
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
        if (!rows || !rows.length) {
            sug.innerHTML = '<div class="ae-sug-empty">Không tìm thấy kết quả</div>';
            sug.style.display = 'block';
            return;
        }
        var limit = showAll ? rows.length : 12;
        sug.innerHTML = rows.slice(0, limit).map(function (r) {
            return '<div class="ae-sug-row" data-val="' + _esc(r.value) + '" data-lbl="' + _esc(r.label) + '">'
                + '<span class="ae-sug-lbl">' + _esc(r.label) + '</span>'
                + (r.sub ? '<span class="ae-sug-sub">' + _esc(r.sub) + '</span>' : '')
                + '</div>';
        }).join('');
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
                    sug.innerHTML = rows.map(function (r) {
                        return '<div class="ae-sug-row" data-val="' + _esc(r.value) + '" data-lbl="' + _esc(r.label) + '" data-price="' + _esc(r.price || 0) + '">'
                            + '<span class="ae-sug-lbl">' + _esc(r.label) + '</span>'
                            + (r.sub ? '<span class="ae-sug-sub">' + _esc(r.sub) + '</span>' : '')
                            + '</div>';
                    }).join('');
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

        if (silent) return; // Chỉ xóa DOM — _activeApi còn nguyên

        // Full close
        _activeApi = null;
        if (_inputEl) _inputEl.value = _inputEl.value.replace(/#\S+\s*/g, '').trim();
    }

    // ── Collect Params ────────────────────────────────────────────────
    function _collectParams() {
        var params = {}, hasErr = false;
        if (!_panelEl || !_activeApi) return params;

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
                // Combobox: lấy hidden input (value/ID)
                var hidEl = _panelEl.querySelector('#' + fid);
                var txtEl = _panelEl.querySelector('#' + fid + '_txt');
                var id = hidEl ? hidEl.value.trim() : '';
                var txt = txtEl ? txtEl.value.trim() : '';
                if (f.IsRequired == 1 && !id && !txt) {
                    if (txtEl) { txtEl.focus(); txtEl.classList.add('ae-error'); }
                    hasErr = true;
                } else {
                    if (txtEl) txtEl.classList.remove('ae-error');
                    params[code] = id || txt || ""; // Nếu trống thì gửi chuỗi rỗng
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
                var r = typeof res === 'string' ? res : (res.reply || res.message || JSON.stringify(res, null, 2));
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

            if (_activeApi) {
                // Nếu đang mở Panel, kiểm tra xem tag #ApiCode còn trong input không
                var tag = '#' + _activeApi.apiCode.replace('@', '');
                if (val.indexOf(tag) === -1) {
                    _closePanel(false); // Xóa tag -> Đóng panel
                }

                // Nếu gõ thêm @ khi đang mở panel -> xóa @ thừa
                if (/@\s*$/.test(val)) {
                    this.value = val.replace(/@\s*$/, '');
                    _menuHide();
                }
                return;
            }

            var pos = val.lastIndexOf('@');
            if (pos === -1) {
                if (_menuVis) _menuHide();
                return;
            }
            var after = val.slice(pos + 1);
            if (/\s/.test(after)) { _menuHide(); return; }

            clearTimeout(_dbt);
            _dbt = setTimeout(function () {
                if (!_apiList.length) _loadList(function () { _menuShow(after); });
                else _menuShow(after);
            }, 120);
        });

        inp.addEventListener('keydown', function (e) {
            if (!_menuVis) return;
            if (e.key === 'ArrowDown') { e.preventDefault(); _menuNav(1); }
            else if (e.key === 'ArrowUp') { e.preventDefault(); _menuNav(-1); }
            else if (e.key === 'Enter' || e.key === 'Tab') {
                if (_menuPick()) {
                    e.preventDefault();
                    e.stopPropagation();
                }
            }
            else if (e.key === 'Escape') { _menuHide(); }
        });

        // Đã gỡ bỏ tự động đóng khi mất focus theo yêu cầu
    }

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
                _closePanel(false);
                _executeApi(api.apiCode, params, api.dispName, api.execType, api.config);
            }
            return true;
        },

        configure: function (cfg) { Object.assign(CFG, cfg); },
        open: function (code) { _onApiSelected(code); },

        // Mở @ menu từ button click (không cần gõ @)
        showMenu: function (inputEl) {
            if (_activeApi) return; // panel đang mở
            if (inputEl) _inputEl = inputEl;

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
