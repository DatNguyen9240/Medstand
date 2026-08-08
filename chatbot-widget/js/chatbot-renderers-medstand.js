// ============================================================
//  Medstand — Project-Specific Renderers
//  Load SAU chatbot.js và chatbot-api-engine.js:
//    <script src="chatbot.js"></script>
//    <script src="chatbot-renderers-medstand.js"></script>
//
//  Sử dụng ApiChatbot.helpers để truy cập utility functions
//  từ chatbot.js mà không phá vỡ encapsulation.
// ============================================================
(function () {
    'use strict';

    // Guard: đảm bảo chatbot.js đã load
    if (typeof window.ApiChatbot === 'undefined' || typeof window.ApiChatbot.registerRenderer !== 'function') {
        console.error('[Medstand Renderers] ApiChatbot chưa sẵn sàng. Hãy load chatbot.js trước.');
        return;
    }

    var h = window.ApiChatbot.helpers; // shorthand

    // ── Lấy config entity lookup từ API_CONFIG ────────────────────
    // API_CONFIG.ENTITY_LOOKUP_DS: datasource n8n để hydrate tên/SĐT từ code
    // Nếu không cấu hình → bỏ qua hydration (không crash)
    var _cfg = (typeof API_CONFIG !== 'undefined') ? API_CONFIG : {};
    var _entityLookupDs = _cfg.ENTITY_LOOKUP_DS || ''; // ví dụ: '@danh_muc'

    // ── Hàm hydrate entity (tên/SĐT) async ───────────────────────
    // Lookup qua n8n datasource thay vì gọi REST endpoint cứng
    function _hydrateEntity(code, onSuccess) {
        if (!code || !_entityLookupDs || typeof ApiEngine === 'undefined') {
            onSuccess(null); return;
        }
        ApiEngine.loadDataSource('APICODE', _entityLookupDs.replace('{q}', code), code, function (rows) {
            if (!rows || !rows.length) { onSuccess(null); return; }
            // Dùng field roles: TITLE = tên, PHONE = SĐT
            var row = rows[0];
            var nameF  = h.pickField(row, 'TITLE');
            var phoneF = h.pickField(row, 'PHONE');
            onSuccess({
                name:  nameF  ? String(nameF.val)  : (code || ''),
                phone: phoneF ? String(phoneF.val) : null
            });
        });
    }

    // ════════════════════════════════════════════════════════════════
    //  RENDERER: TICH_LUY — Milestone / Progress Bar
    // ════════════════════════════════════════════════════════════════
    function _renderTichLuy(rows, headerMsg, apiCode, meta) {
        var khCode = (meta && meta.khCode) ? meta.khCode : '';
        var safeRows = (rows && rows.length > 0) ? rows : [];
        if (!khCode && safeRows.length > 0) {
            khCode = h.pickValue(safeRows[0], 'CUSTOMER') || safeRows[0].ObjectID || safeRows[0].MaKH || safeRows[0].CustomerCode || '';
        }
        if (safeRows.length === 0) {
            return '<p class="ai-para">📭 Không có dữ liệu tích lũy.</p>';
        }

        var r0 = safeRows[0];
        var achieved = _focusNumber(_focusValue(r0, ['TichLuyDatDuoc', 'Achieved'])) || 0;
        var target = _focusNumber(_focusValue(r0, ['MucTieu', 'Target'])) || 0;
        var remainingValue = _focusNumber(_focusValue(r0, ['Remaining']));
        var remaining = remainingValue === null ? Math.max(0, target - achieved) : Math.max(0, remainingValue);
        var rawPercent = _focusNumber(_focusValue(r0, ['Percentage']));
        var pct = rawPercent === null ? (target > 0 ? Math.round(achieved / target * 100) : 0) : Math.round(rawPercent);
        pct = Math.min(100, Math.max(0, pct));

        var customerName = _focusValue(r0, ['TenCuaHang', 'CustomerName', 'ObjectName']) || khCode || 'Khách hàng';
        var programName = _focusValue(r0, ['ProgramName', 'TenChuongTrinh', 'Chương Trình']) || 'Chương trình tích lũy đang áp dụng';
        var programStatus = String(_focusValue(r0, ['ProgramStatus']) || '').toUpperCase();
        var statusLabel = programStatus === 'EXPIRED' ? 'Đã kết thúc' : (programStatus === 'NO_DATA' ? 'Chưa có chương trình' : 'Đang áp dụng');
        var statusClass = programStatus === 'EXPIRED' ? 'is-ended' : (programStatus === 'NO_DATA' ? 'is-empty' : 'is-active');
        var fromDate = _focusValue(r0, ['EffectiveFrom', 'TuNgay']);
        var toDate = _focusValue(r0, ['EffectiveTo', 'DenNgay']);
        var period = fromDate || toDate ? _focusDate(fromDate) + ' – ' + _focusDate(toDate) : 'Theo kỳ chương trình hiện tại';
        var nextGift = _focusValue(r0, ['QuaMocTiepTheo', 'NextGift']);
        if (!nextGift) nextGift = remaining > 0 ? 'Chưa có thông tin quà mốc tiếp theo' : (_focusValue(r0, ['QuaDaDat']) || 'Đã đạt mốc cao nhất');
        var reminder = remaining > 0
            ? 'Còn thiếu ' + _focusMoney(remaining) + ' để đạt mốc tiếp theo.'
            : 'Khách hàng đã đạt mốc cao nhất của chương trình.';
        var cardId = 'tichluy-' + h.nextId() + '-' + Date.now();
        var html = '<article class="ai-loyalty-card" id="' + h.esc(cardId) + '">';

        html += '<header class="ai-loyalty-header" id="hdr-' + h.esc(cardId) + '">'
            + '<span class="ai-loyalty-icon" aria-hidden="true">★</span>'
            + '<div class="ai-loyalty-heading"><span>Tiến độ tích lũy doanh số</span><h3>' + h.esc(String(customerName)) + '</h3>'
            + '<p>Mã khách hàng: <strong>' + h.esc(khCode || 'Chưa xác định') + '</strong></p></div>'
            + '<span class="ai-loyalty-status ' + statusClass + '">' + statusLabel + '</span></header>';

        html += '<section class="ai-loyalty-program"><div><span>Chương trình</span><strong>' + h.esc(String(programName)) + '</strong></div>'
            + '<div><span>Thời gian áp dụng</span><strong>' + h.esc(period) + '</strong></div></section>';

        html += '<section class="ai-loyalty-metrics">'
            + '<div><span>Đã tích lũy</span><strong>' + h.esc(_focusMoney(achieved)) + '</strong></div>'
            + '<div><span>Mốc kế tiếp</span><strong>' + h.esc(target > 0 ? _focusMoney(target) : 'Chưa xác định') + '</strong></div>'
            + '<div><span>Còn thiếu</span><strong>' + h.esc(target > 0 ? _focusMoney(remaining) : 'Chưa xác định') + '</strong></div></section>';

        html += '<section class="ai-loyalty-progress"><div><span>Tiến độ</span><strong>' + pct + '%</strong></div>'
            + '<div class="ai-loyalty-progress-track" role="progressbar" aria-label="Tiến độ tích lũy" aria-valuemin="0" aria-valuemax="100" aria-valuenow="' + pct + '">'
            + '<span style="width:' + pct + '%"></span></div></section>';

        html += '<section class="ai-loyalty-next"><span class="ai-loyalty-gift-icon" aria-hidden="true">🎁</span><div><span>Quà ở mốc tiếp theo</span><strong>' + h.esc(String(nextGift)) + '</strong></div></section>';
        html += '<p class="ai-loyalty-reminder">' + h.esc(reminder) + '</p>';
        html += '<footer class="ai-loyalty-footer"><div class="ai-loyalty-actions">'
            + '<button type="button" data-loyalty-action="invoices">Xem hóa đơn</button>'
            + '<button type="button" data-loyalty-action="program">Xem chương trình</button></div>'
            + '<small>Cập nhật: ' + h.esc(_focusDateTime(new Date())) + '</small></footer></article>';

        setTimeout(function () {
            var root = document.getElementById(cardId);
            if (!root) return;

            _hydrateEntity(khCode, function (entity) {
                var hdrEl = document.getElementById('hdr-' + cardId);
                var titleEl = hdrEl ? hdrEl.querySelector('h3') : null;
                if (titleEl && entity && entity.name) titleEl.textContent = entity.name;
            });

            root.addEventListener('click', function (event) {
                var actionButton = event.target.closest('[data-loyalty-action]');
                if (!actionButton || !window.ApiEngine || typeof window.ApiEngine.execute !== 'function') return;
                var action = actionButton.getAttribute('data-loyalty-action');
                actionButton.disabled = true;
                actionButton.setAttribute('aria-busy', 'true');
                if (action === 'invoices') {
                    var invoiceParams = { '@MaKhachHang': khCode };
                    if (fromDate) invoiceParams['@TuNgay'] = String(fromDate).slice(0, 10);
                    if (toDate) invoiceParams['@DenNgay'] = String(toDate).slice(0, 10);
                    window.ApiEngine.execute('@hoa_don', invoiceParams);
                } else {
                    window.ApiEngine.execute('@san_pham_trong_tam', { '@MaKhachHang': khCode });
                }
                setTimeout(function () {
                    actionButton.disabled = false;
                    actionButton.removeAttribute('aria-busy');
                }, 900);
            });
        }, 50);

        return html;
    }

    
    // ════════════════════════════════════════════════════════════════
    //  RENDERER: DYNAMIC METRIC CARD (Thẻ Chỉ Số Nhanh)
    // ════════════════════════════════════════════════════════════════
    function _renderMetricCard(rows, headerMsg, apiCode, meta) {
        if (!rows || rows.length === 0) return '';
        var r0 = rows[0];
        var keys = Object.keys(r0);
        
        var numKey = null, strKey = null;
        for(var i=0; i<keys.length; i++) {
            var val = r0[keys[i]];
            if (typeof val === 'number' && !numKey) numKey = keys[i];
            else if (typeof val === 'string' && !strKey) strKey = keys[i];
        }
        if (!numKey) numKey = keys[0];
        if (!strKey) strKey = keys.find(function(k){return k!==numKey;}) || '';
        
        var valToShow = r0[numKey];
        var title = numKey.replace(/_/g, ' ').toUpperCase();
        
        var html = '<div class="ai-sales-debt-card" style="text-align:center; padding:25px 15px; border-top: 4px solid #2196f3; background: linear-gradient(180deg, #f0f8ff 0%, #ffffff 100%);">';
        html += '<div style="font-size:14px; color:#555; text-transform:uppercase; letter-spacing:1px; margin-bottom:5px;">' + h.esc(title) + '</div>';
        html += '<div style="font-size:36px; font-weight:800; color:#1976d2; margin:10px 0;">' + h.fmtCellVal(valToShow) + '</div>';
        if (strKey && r0[strKey]) {
            html += '<div style="font-size:13px; color:#888; background:#e3f2fd; padding:4px 10px; border-radius:12px; display:inline-block;">' + h.esc(String(r0[strKey])) + '</div>';
        }
        html += '</div>';
        return html;
    }

    // ════════════════════════════════════════════════════════════════
    //  RENDERER: DYNAMIC ALERT CARD (Thẻ Cảnh Báo)
    // ════════════════════════════════════════════════════════════════
    function _renderAlertCard(rows, headerMsg, apiCode, meta) {
        if (!rows || rows.length === 0) return '';
        var html = '<div class="ai-sales-debt-card" style="border: 1px solid #ffcdd2; border-left: 5px solid #f44336; background:#fff9f9;">';
        html += '<div style="color:#c62828; font-weight:bold; font-size:15px; margin-bottom:15px; padding-bottom:10px; border-bottom:1px solid #ffebee;">CẢNH BÁO TỪ HỆ THỐNG</div>';
        
        rows.forEach(function(r) {
            html += '<div style="background:#ffffff; border:1px solid #ffcdd2; margin-bottom:10px; padding:12px; border-radius:8px; box-shadow:0 1px 3px rgba(0,0,0,0.05);">';
            var keys = Object.keys(r);
            if(keys.length > 0) {
                html += '<div style="font-weight:bold; color:#b71c1c; font-size:15px;">' + h.esc(String(r[keys[0]])) + '</div>';
                html += '<ul style="margin:8px 0 0 0; padding-left:22px; font-size:13px; color:#444; line-height:1.6;">';
                for(var i=1; i<keys.length; i++) {
                    html += '<li><b>' + h.esc(keys[i]) + ':</b> ' + h.esc(String(r[keys[i]])) + '</li>';
                }
                html += '</ul>';
            }
            html += '</div>';
        });
        html += '</div>';
        return html;
    }

    // ════════════════════════════════════════════════════════════════
    //  RENDERER: DYNAMIC BAR CHART (Biểu đồ ngang cho Mobile)
    // ════════════════════════════════════════════════════════════════
    function _renderBarChart(rows, headerMsg, apiCode, meta) {
        if (!rows || rows.length === 0) return '';
        var cardId = 'chart-' + h.nextId() + '-' + Date.now();
        
        // Thuật toán bóc tách trục X và Y tự động
        var keys = Object.keys(rows[0]);
        var labelKey = keys.find(function(k){return typeof rows[0][k] === 'string';}) || keys[0];
        var dataKey = keys.find(function(k){return typeof rows[0][k] === 'number';}) || keys[1] || keys[0];
        
        var labels = [];
        var dataVals = [];
        rows.forEach(function(r) {
            labels.push(String(r[labelKey]).substring(0,25) + '...'); 
            dataVals.push(Number(r[dataKey]) || 0);
        });
        
        var chartHeight = Math.max(200, rows.length * 45); // Chiều cao động giãn theo số cột
        
        var html = '<div class="ai-sales-debt-card" style="padding:15px; overflow:hidden;">';
        html += '<div style="font-weight:bold; font-size:15px; margin-bottom:15px; color:#333;">Phân tích: ' + h.esc(dataKey) + '</div>';
        html += '<div style="position:relative; width:100%; height:' + chartHeight + 'px;">';
        html += '<canvas id="' + cardId + '"></canvas>';
        html += '</div></div>';
        
        // Delay vẽ biểu đồ chờ DOM load
        setTimeout(function() {
            var canvas = document.getElementById(cardId);
            if (!canvas) return;
            if (typeof Chart === 'undefined') {
                canvas.parentNode.innerHTML += '<div style="color:red; font-size:12px;">Hệ thống đang thiếu thư viện Chart.js</div>';
                return;
            }
            new Chart(canvas, {
                type: 'bar',
                data: {
                    labels: labels,
                    datasets: [{
                        label: dataKey,
                        data: dataVals,
                        backgroundColor: 'rgba(54, 162, 235, 0.7)',
                        borderColor: 'rgba(54, 162, 235, 1)',
                        borderWidth: 1,
                        borderRadius: 4
                    }]
                },
                options: {
                    indexAxis: 'y', // Ép ngang cho Mobile
                    responsive: true,
                    maintainAspectRatio: false,
                    plugins: { legend: { display: false } },
                    scales: {
                        x: { beginAtZero: true, ticks: { font: { size: 10 } } },
                        y: { ticks: { font: { size: 11 } } }
                    }
                }
            });
        }, 150);
        
        return html;
    }

    // ── Đăng ký vào hệ thống ─────────────────────────────────────
    function _debtFirst(row, names) {
        var source = row || {};
        for (var i = 0; i < names.length; i += 1) {
            if (Object.prototype.hasOwnProperty.call(source, names[i])) {
                var value = source[names[i]];
                if (value !== null && value !== undefined && value !== '') return value;
            }
        }
        return null;
    }

    function _debtNumber(value) {
        if (value === null || value === undefined || value === '') return null;
        var parsed = Number(value);
        return isFinite(parsed) ? parsed : null;
    }

    function _debtDate(value) {
        if (value === null || value === undefined || value === '') return '—';
        var text = String(value).trim();
        var vn = text.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
        if (vn) return String(vn[1]).padStart(2, '0') + '/' + String(vn[2]).padStart(2, '0') + '/' + vn[3];
        // Business dates must keep the calendar date returned by the API.
        // Parsing an end-of-day timestamp as UTC can otherwise shift it to tomorrow.
        var iso = text.match(/^(\d{4})-(\d{2})-(\d{2})(?:[T\s]|$)/);
        if (iso) return iso[3] + '/' + iso[2] + '/' + iso[1];
        var parsed = new Date(text);
        return isNaN(parsed.getTime()) ? text : parsed.toLocaleDateString('vi-VN');
    }

    function _debtStatus(value) {
        var normalized = String(value ?? '').trim().toUpperCase();
        var map = {
            OVERDUE: { key: 'OVERDUE', label: 'Quá hạn', cls: 'overdue' },
            'ĐÃ QUÁ HẠN': { key: 'OVERDUE', label: 'Quá hạn', cls: 'overdue' },
            'QUÁ HẠN': { key: 'OVERDUE', label: 'Quá hạn', cls: 'overdue' },
            DUE_SOON: { key: 'DUE_SOON', label: 'Sắp đến hạn', cls: 'due-soon' },
            'SẮP ĐẾN HẠN': { key: 'DUE_SOON', label: 'Sắp đến hạn', cls: 'due-soon' },
            NOT_DUE: { key: 'NOT_DUE', label: 'Chưa đến hạn', cls: 'not-due' },
            'CHƯA ĐẾN HẠN': { key: 'NOT_DUE', label: 'Chưa đến hạn', cls: 'not-due' },
            DUE_DATE_UNKNOWN: { key: 'DUE_DATE_UNKNOWN', label: 'Chưa xác định hạn', cls: 'unknown' },
            'CHƯA XÁC ĐỊNH HẠN': { key: 'DUE_DATE_UNKNOWN', label: 'Chưa xác định hạn', cls: 'unknown' },
            PAID: { key: 'PAID', label: 'Đã thanh toán', cls: 'paid' },
            'ĐÃ THANH TOÁN': { key: 'PAID', label: 'Đã thanh toán', cls: 'paid' },
            PARTIALLY_PAID: { key: 'PARTIALLY_PAID', label: 'Thanh toán một phần', cls: 'partially-paid' },
            'THANH TOÁN MỘT PHẦN': { key: 'PARTIALLY_PAID', label: 'Thanh toán một phần', cls: 'partially-paid' },
            UNPAID: { key: 'UNPAID', label: 'Chưa thanh toán', cls: 'unpaid' },
            'CHƯA THANH TOÁN': { key: 'UNPAID', label: 'Chưa thanh toán', cls: 'unpaid' },
            CREDIT: { key: 'CREDIT', label: 'Dư có', cls: 'credit' }
        };
        return map[normalized] || { key: 'DUE_DATE_UNKNOWN', label: 'Chưa xác định hạn', cls: 'unknown' };
    }

    function _debtItemType(value) {
        var key = String(value ?? '').trim().toUpperCase();
        if (key === 'INVOICE') return { key: key, label: 'Hóa đơn' };
        if (key === 'OPENING_BALANCE') return { key: key, label: 'Số dư đầu kỳ' };
        if (key === 'OTHER_RECEIVABLE') return { key: key, label: 'Khoản phải thu khác' };
        return { key: key || 'UNKNOWN', label: 'Khoản công nợ chưa phân loại' };
    }

    function _recordDebtDrift(apiCode, field, row, meta, reason) {
        var drift = {
            type: 'CONTRACT_DRIFT',
            ApiCode: apiCode || '',
            field: field,
            ObjectType: row && row.ObjectType !== undefined ? row.ObjectType : null,
            ObjectID: row ? (row.CustomerID ?? row.ObjectID ?? row.MaKH ?? null) : null,
            requestId: (meta && meta.requestId) ?? null,
            contractVersion: (meta && meta.contractVersion) ?? null,
            reason: reason || 'MISSING_OR_INVALID_FIELD'
        };
        window.__MEDSTAND_CONTRACT_DRIFTS__ = window.__MEDSTAND_CONTRACT_DRIFTS__ || [];
        window.__MEDSTAND_CONTRACT_DRIFTS__.push(drift);
        console.warn('[CONTRACT_DRIFT]', drift);
        if (typeof window.CustomEvent === 'function' && typeof window.dispatchEvent === 'function') {
            window.dispatchEvent(new window.CustomEvent('medstand:contract-drift', { detail: drift }));
        }
        return drift;
    }

    function _debtSafeState(title, message, cssClass) {
        return '<section class="ai-sales-debt-state is-' + h.esc(cssClass || 'warning') + '" role="status" aria-live="polite">'
            + '<strong>' + h.esc(title) + '</strong><span>' + h.esc(message) + '</span></section>';
    }

    // Silent near-realtime refresh for the latest current debt-detail card.
    // This is intentionally not exposed as a user-facing toggle. Historical
    // snapshots never start a timer, and only one debt card may poll at a time.
    var _activeDebtRefreshStop = null;
    var _debtAutoRefreshEnabled = _cfg.DEBT_AUTO_REFRESH_ENABLED !== false;
    var _debtAutoRefreshMs = Math.max(30000, Number(_cfg.DEBT_AUTO_REFRESH_MS) || 60000);
    var _debtAutoRefreshMaxFailures = Math.max(1, Number(_cfg.DEBT_AUTO_REFRESH_MAX_FAILURES) || 3);

    function _debtLocalDateKey(date) {
        var value = date instanceof Date ? date : new Date(date);
        if (isNaN(value.getTime())) return '';
        var pad = function (part) { return String(part).padStart(2, '0'); };
        return value.getFullYear() + '-' + pad(value.getMonth() + 1) + '-' + pad(value.getDate());
    }

    function _debtDateKey(value) {
        if (value === null || value === undefined || value === '') return '';
        var text = String(value).trim();
        var iso = text.match(/^(\d{4})-(\d{2})-(\d{2})/);
        if (iso) return iso[1] + '-' + iso[2] + '-' + iso[3];
        var vn = text.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
        if (vn) return vn[3] + '-' + String(vn[2]).padStart(2, '0') + '-' + String(vn[1]).padStart(2, '0');
        return _debtLocalDateKey(text);
    }

    function _debtRefreshFingerprint(rows) {
        var ignored = { AsOfDate: true, NgayChot: true };
        return JSON.stringify((Array.isArray(rows) ? rows : []).map(function (row) {
            return Object.keys(row || {}).filter(function (key) { return !ignored[key]; }).sort().map(function (key) {
                return [key, row[key]];
            });
        }));
    }

    function _debtShouldAutoRefresh(meta, asOfDate) {
        if (!_debtAutoRefreshEnabled || !window.ApiEngine || typeof window.ApiEngine.queryData !== 'function') return false;
        var queryParams = meta && meta.queryParams ? meta.queryParams : {};
        var requestedDate = queryParams['@DenNgay'] || queryParams.DenNgay || asOfDate;
        var requestedKey = _debtDateKey(requestedDate);
        return !requestedKey || requestedKey === _debtLocalDateKey(new Date());
    }

    function _startDebtAutoRefresh(root, context) {
        if (!root || !_debtShouldAutoRefresh(context.meta, context.asOfDate)) return;
        if (typeof _activeDebtRefreshStop === 'function') _activeDebtRefreshStop();

        var timer = null;
        var stopped = false;
        var inFlight = false;
        var failures = 0;
        var emptyResponses = 0;
        var fingerprint = _debtRefreshFingerprint(context.rows);

        function stop() {
            stopped = true;
            if (timer) clearTimeout(timer);
            timer = null;
            if (_activeDebtRefreshStop === stop) _activeDebtRefreshStop = null;
        }

        function schedule(delay) {
            if (stopped) return;
            if (timer) clearTimeout(timer);
            timer = setTimeout(refresh, delay);
        }

        function replaceCard(nextRows) {
            var nextMeta = Object.assign({}, context.meta || {}, { queryParams: Object.assign({}, context.params) });
            var markup = _renderCongNoChiTiet(nextRows, context.headerMsg, context.apiCode, nextMeta);
            var holder = document.createElement('div');
            holder.innerHTML = String(markup || '').trim();
            var nextRoot = holder.firstElementChild;
            if (!nextRoot || !root.isConnected) return false;
            root.replaceWith(nextRoot);
            stop();
            return true;
        }

        function refresh() {
            timer = null;
            if (stopped || !root.isConnected || root.hidden) { stop(); return; }
            if (document.visibilityState && document.visibilityState !== 'visible') { schedule(_debtAutoRefreshMs); return; }
            if (inFlight) { schedule(_debtAutoRefreshMs); return; }

            inFlight = true;
            window.ApiEngine.queryData('@cong_no_chi_tiet', Object.assign({}, context.params)).then(function (nextRows) {
                failures = 0;
                if (!Array.isArray(nextRows) || nextRows.length === 0) {
                    emptyResponses += 1;
                    // Require two consecutive empty responses before replacing
                    // valid data, protecting the card from a transient empty read.
                    if (emptyResponses >= 2) {
                        replaceCard([]);
                        return;
                    }
                    schedule(_debtAutoRefreshMs);
                    return;
                }

                emptyResponses = 0;
                var nextFingerprint = _debtRefreshFingerprint(nextRows);
                if (nextFingerprint !== fingerprint && replaceCard(nextRows)) return;
                fingerprint = nextFingerprint;
                schedule(_debtAutoRefreshMs);
            }).catch(function (error) {
                failures += 1;
                var errorText = String(error && (error.code || error.message) || '');
                if (/AUTH|TOKEN|UNAUTHORIZED|401/i.test(errorText) || failures >= _debtAutoRefreshMaxFailures) {
                    stop();
                    return;
                }
                schedule(Math.min(_debtAutoRefreshMs * Math.pow(2, failures), 5 * 60 * 1000));
            }).finally(function () {
                inFlight = false;
            });
        }

        _activeDebtRefreshStop = stop;
        schedule(_debtAutoRefreshMs);
    }

    function _renderCongNoDanhSach(rows, headerMsg, apiCode, meta) {
        var sourceRows = Array.isArray(rows) ? rows : [];
        var validRows = [];
        var drifts = [];

        sourceRows.forEach(function (row) {
            var objectType = _debtFirst(row, ['ObjectType']);
            if (objectType && String(objectType).toUpperCase() !== 'CUSTOMER') {
                drifts.push(_recordDebtDrift(apiCode, 'ObjectType', row, meta,
                    'NON_CUSTOMER_RECORD'));
                return;
            }
            var normalized = {
                customerId: _debtFirst(row, ['CustomerID', 'MaKH', 'ObjectID']),
                customerName: _debtFirst(row, ['CustomerName', 'TenKH', 'ObjectName']),
                totalDebt: _debtNumber(_debtFirst(row, ['TotalDebt', 'TongNo'])),
                paymentStatus: _debtFirst(row, ['PaymentStatus', 'DueStatus']),
                debtSize: _debtFirst(row, ['DebtSize', 'PhanLoai']),
                asOfDate: _debtFirst(row, ['AsOfDate']),
                raw: row
            };
            var missing = [];
            if (!normalized.customerId) missing.push('CustomerID/MaKH');
            if (!normalized.customerName) missing.push('CustomerName/TenKH');
            if (normalized.totalDebt === null) missing.push('TotalDebt/TongNo');
            if (missing.length) {
                missing.forEach(function (field) { drifts.push(_recordDebtDrift(apiCode, field, row, meta)); });
                return;
            }
            validRows.push(normalized);
        });

        if (!validRows.length) {
            return _debtSafeState(
                drifts.length ? 'Dữ liệu công nợ chưa đúng contract' : 'Không có dữ liệu công nợ',
                drifts.length
                    ? 'API thiếu mã khách hàng, tên khách hàng hoặc tổng công nợ.'
                    : 'Không có khách hàng phù hợp với điều kiện tra cứu.',
                drifts.length ? 'warning' : 'empty'
            );
        }

        var cardId = 'debt-list-' + h.nextId() + '-' + Date.now();

        function rowHtml(row) {
            var status = row.paymentStatus ? _debtStatus(row.paymentStatus) : null;
            var detailLabel = 'Xem chi tiết công nợ ' + row.customerName;
            var detailAsOfDate = row.asOfDate ? String(row.asOfDate).slice(0, 10) : '';
            return '<tr>'
                + '<td><strong>' + h.esc(String(row.customerName)) + '</strong></td>'
                + '<td>' + h.esc(String(row.customerId)) + '</td>'
                + '<td class="ai-sales-debt-number">' + h.fmtCellVal(row.totalDebt) + '</td>'
                + '<td>' + (row.debtSize == null ? '—' : h.esc(String(row.debtSize))) + '</td>'
                + '<td>' + (status ? '<span class="ai-sales-debt-status is-' + status.cls + '">' + h.esc(status.label) + '</span>' : '—') + '</td>'
                + '<td><button type="button" class="ai-sales-debt-detail-btn" data-debt-customer="' + h.esc(String(row.customerId)) + '" data-debt-as-of="' + h.esc(detailAsOfDate) + '" aria-label="' + h.esc(detailLabel) + '">Xem chi tiết</button></td>'
                + '</tr>';
        }

        function mobileRowHtml(row) {
            var status = row.paymentStatus ? _debtStatus(row.paymentStatus) : null;
            var detailAsOfDate = row.asOfDate ? String(row.asOfDate).slice(0, 10) : '';
            return '<article class="ai-sales-debt-mobile-item">'
                + '<div><strong>' + h.esc(String(row.customerName)) + '</strong><small>' + h.esc(String(row.customerId)) + '</small></div>'
                + '<dl><div><dt>Tổng nợ</dt><dd>' + h.fmtCellVal(row.totalDebt) + '</dd></div>'
                + '<div><dt>Phân loại</dt><dd>' + (row.debtSize == null ? '—' : h.esc(String(row.debtSize))) + '</dd></div></dl>'
                + (status ? '<span class="ai-sales-debt-status is-' + status.cls + '">' + h.esc(status.label) + '</span>' : '')
                + '<button type="button" class="ai-sales-debt-detail-btn" data-debt-customer="' + h.esc(String(row.customerId)) + '" data-debt-as-of="' + h.esc(detailAsOfDate) + '" aria-label="Xem chi tiết công nợ ' + h.esc(String(row.customerName)) + '">Xem chi tiết</button>'
                + '</article>';
        }

        var first = validRows[0];
        var html = '<section class="ai-sales-debt-portfolio" id="' + h.esc(cardId) + '" aria-labelledby="' + h.esc(cardId) + '-title">';
        html += '<header class="ai-sales-debt-portfolio-header"><div><h3 id="' + h.esc(cardId) + '-title">Công nợ khách hàng</h3>'
            + '<p>' + validRows.length + ' khách hàng'
            + (first.asOfDate ? ' · Đến ngày ' + h.esc(_debtDate(first.asOfDate)) : '')
            + '</p></div></header>';
        if (drifts.length) html += '<div class="ai-sales-debt-drift" role="status">Đã bỏ qua ' + drifts.length + ' bản ghi không đúng contract.</div>';
        html += '<div class="ai-sales-debt-customer-table-wrap"><table class="ai-sales-debt-customer-table"><thead><tr>'
            + '<th>Khách hàng</th><th>Mã khách hàng</th><th>Tổng nợ</th><th>Phân loại</th><th>Trạng thái hạn</th><th>Thao tác</th>'
            + '</tr></thead><tbody>' + validRows.map(rowHtml).join('') + '</tbody></table></div>';
        html += '<div class="ai-sales-debt-mobile-list">' + validRows.map(mobileRowHtml).join('') + '</div>';
        html += '</section>';

        setTimeout(function () {
            var root = document.getElementById(cardId);
            if (!root) return;
            root.addEventListener('click', function (event) {
                var detail = event.target.closest('[data-debt-customer]');
                if (detail && !detail.disabled) {
                    detail.disabled = true;
                    detail.setAttribute('aria-busy', 'true');
                    var customerId = detail.getAttribute('data-debt-customer');
                    var asOfDate = detail.getAttribute('data-debt-as-of');
                    if (window.ApiEngine && typeof window.ApiEngine.execute === 'function') {
                        var detailParams = { '@MaKhachHang': customerId };
                        if (asOfDate) detailParams['@DenNgay'] = asOfDate;
                        window.ApiEngine.execute('@cong_no_chi_tiet', detailParams);
                    }
                    setTimeout(function () {
                        detail.disabled = false;
                        detail.removeAttribute('aria-busy');
                    }, 800);
                }
            });
        }, 50);

        return html;
    }

    function _renderCongNoChiTiet(rows, headerMsg, apiCode, meta) {
        var safeRows = Array.isArray(rows) ? rows : [];
        if (!safeRows.length) return _debtSafeState('Không có chi tiết công nợ', 'API không trả khoản công nợ nào cho khách hàng này.', 'empty');
        var firstRow = safeRows[0] || {};
        var drifts = [];
        var objectType = firstRow.ObjectType;
        if (objectType !== undefined && String(objectType).toUpperCase() !== 'CUSTOMER') {
            _recordDebtDrift(apiCode, 'ObjectType', firstRow, meta, 'NON_CUSTOMER_RECORD');
            return _debtSafeState('Sai loại đối tượng công nợ', 'Chi tiết đã được chặn vì bản ghi không phải CUSTOMER.', 'warning');
        }

        // Explicit compatibility with the current @cong_no_chi_tiet response.
        var customerId = (meta && meta.khCode) || _debtFirst(firstRow, ['CustomerID', 'ObjectID', 'MaKH']);
        var customerName = _debtFirst(firstRow, ['CustomerName', 'TenKH']);
        var phone = _debtFirst(firstRow, ['Phone', 'SoDienThoai']);
        var asOfDate = _debtFirst(firstRow, ['AsOfDate', 'NgayChot']);

        [['CustomerID/ObjectID', customerId], ['CustomerName/TenKH', customerName]].forEach(function (entry) {
            if (entry[1] === null || entry[1] === undefined || entry[1] === '') {
                drifts.push(_recordDebtDrift(apiCode, entry[0], firstRow, meta));
            }
        });
        if (drifts.length) return _debtSafeState('Dữ liệu chi tiết chưa đúng contract', 'API thiếu mã hoặc tên khách hàng.', 'warning');

        var totalOutstanding = _debtNumber(_debtFirst(firstRow, ['TotalOutstanding', 'TongTienNoThucTe']));
        var invoiceCount = _debtNumber(_debtFirst(firstRow, ['InvoiceCount', 'TongSoHoaDon']));
        var debtItemCount = _debtNumber(_debtFirst(firstRow, ['DebtItemCount', 'TongSoKhoanCongNo']));
        var debitTotal = _debtNumber(_debtFirst(firstRow, ['TotalDebitAmount', 'TongGiaTriBanDau']));
        var creditTotal = _debtNumber(_debtFirst(firstRow, ['TotalCreditAmount', 'TongDaThanhToanTra']));

        var debtItems = safeRows.map(function (row) {
            var statusRaw = _debtFirst(row, ['CollectionStatus', 'TrangThaiThanhToan', 'PaymentStatus', 'TrangThaiCongNo']);
            var dueStatusRaw = _debtFirst(row, ['PaymentStatus', 'DueStatus', 'TrangThaiCongNo']);
            var dueDate = _debtFirst(row, ['DueDate', 'NgayDenHan']);
            if (!dueDate && !statusRaw) drifts.push(_recordDebtDrift(apiCode, 'DueDate/PaymentStatus', row, meta));
            return {
                id: _debtFirst(row, ['InvoiceNumber', 'MaHD', 'DocumentID', 'MaChungTu']) ?? '—',
                documentType: _debtItemType(_debtFirst(row, ['DocumentType', 'LoaiKhoanCongNo'])),
                matchStatus: _debtFirst(row, ['DocumentMatchStatus']),
                debtDate: _debtFirst(row, ['DebtDate', 'NgayKhoanCongNo', 'InvoiceDate', 'NgayHoaDon', 'Ngay']),
                dueDate: dueDate,
                debit: _debtNumber(_debtFirst(row, ['DebitAmount', 'GiaTriBanDau'])),
                credit: _debtNumber(_debtFirst(row, ['CreditAmount', 'DaThanhToanTra'])),
                remaining: _debtNumber(_debtFirst(row, ['RemainingAmount', 'SoTien'])),
                overdueDays: _debtNumber(_debtFirst(row, ['OverdueDays', 'SoNgayQuaHan'])),
                status: statusRaw ? _debtStatus(statusRaw) : null,
                dueStatus: dueStatusRaw ? _debtStatus(dueStatusRaw) : null,
                description: _debtFirst(row, ['Description', 'DienGiai'])
            };
        });

        var cardId = 'debt-detail-' + h.nextId() + '-' + Date.now();

        function moneyOrUnknown(value) { return value === null ? 'Chưa xác định' : h.fmtCellVal(value); }
        function queryTimestamp() {
            var now = new Date();
            var pad = function (value) { return String(value).padStart(2, '0'); };
            return pad(now.getDate()) + '/' + pad(now.getMonth() + 1) + '/' + now.getFullYear() + ' ' + pad(now.getHours()) + ':' + pad(now.getMinutes());
        }
        function debtItemRow(item) {
            var invoice = item.documentType.key === 'INVOICE';
            var title = invoice ? 'Hóa đơn số ' + String(item.id) : (item.documentType.key === 'OPENING_BALANCE' ? 'Số dư đầu kỳ' : 'Khoản công nợ khác');
            var subtitle = invoice
                ? 'Ngày hóa đơn: ' + _debtDate(item.debtDate)
                : (item.description || 'Khoản công nợ khác');
            var typeHint = invoice ? 'Đối chiếu theo hóa đơn' : 'Khoản công nợ khác';
            return '<tr><td><strong>' + h.esc(title) + '</strong><small>' + h.esc(String(subtitle)) + '</small></td>'
                + '<td><span class="ai-sales-debt-item-type is-' + h.esc(item.documentType.key.toLowerCase()) + '">' + h.esc(item.documentType.label) + '</span><small>' + h.esc(typeHint) + '</small></td>'
                + '<td>' + h.esc(_debtDate(item.debtDate)) + '</td>'
                + '<td>' + h.esc(_debtDate(item.dueDate)) + '</td>'
                + '<td class="ai-sales-debt-number">' + moneyOrUnknown(item.debit) + '</td>'
                + '<td class="ai-sales-debt-number">' + moneyOrUnknown(item.credit) + '</td>'
                + '<td class="ai-sales-debt-number"><strong>' + moneyOrUnknown(item.remaining) + '</strong></td>'
                + '<td>' + (item.overdueDays === null ? 'Chưa xác định' : item.overdueDays + ' ngày') + '</td>'
                + '<td>' + (item.status ? '<span class="ai-sales-debt-status is-' + item.status.cls + '">' + h.esc(item.status.label) + '</span>' : '—')
                + (item.dueStatus && (!item.status || item.dueStatus.key !== item.status.key) ? ' <span class="ai-sales-debt-status is-' + item.dueStatus.cls + '">' + h.esc(item.dueStatus.label) + '</span>' : '')
                + '</td></tr>';
        }

        var icons = {
            building: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 21V4a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v17M2 21h20M8 7h2M8 11h2M8 15h2M12 7h2M12 11h2M12 15h2M19 21v-8h2v8"/></svg>',
            calendar: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="4" width="18" height="17" rx="2"/><path d="M16 2v4M8 2v4M3 9h18"/></svg>',
            clock: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>',
            coins: '<svg viewBox="0 0 24 24" aria-hidden="true"><ellipse cx="12" cy="6" rx="7" ry="3"/><path d="M5 6v6c0 1.7 3.1 3 7 3s7-1.3 7-3V6M5 12v6c0 1.7 3.1 3 7 3s7-1.3 7-3v-6"/></svg>',
            document: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 3h9l3 3v15H6zM14 3v4h4M9 12h6M9 16h6"/></svg>',
            list: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01"/></svg>',
            info: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M12 10v6M12 7h.01"/></svg>'
        };
        var html = '<section class="ai-sales-debt-card ai-sales-debt-detail" id="' + h.esc(cardId) + '" data-debt-detail-customer="' + h.esc(String(customerId ?? '')) + '" tabindex="-1">';
        html += '<header class="ai-sales-debt-header"><div class="ai-sales-debt-header-main"><div class="ai-sales-debt-customer">'
            + '<div class="ai-sales-debt-identity"><span class="ai-sales-debt-customer-icon">' + icons.building + '</span><div><div class="ai-sales-debt-title">' + h.esc(String(customerName ?? 'Khách hàng chưa xác định')) + '</div>'
            + '<div class="ai-sales-debt-subtitle">Mã khách hàng: <b>' + h.esc(String(customerId ?? 'Chưa xác định')) + '</b>'
            + (phone && h.isValidPhone(String(phone)) ? ' <i></i> SĐT: ' + h.esc(String(phone)) : '') + '</div></div></div>'
            + '</div></div>';
        if (drifts.length) html += '<div class="ai-sales-debt-drift" role="status">Một số khoản thiếu trạng thái hạn từ API.</div>';
        html += '<div class="ai-sales-debt-meta-strip"><span>' + icons.calendar + '<span>Dữ liệu tính đến: <b>' + h.esc(_debtDate(asOfDate)) + '</b></span></span><span class="ai-sales-debt-meta-separator"></span><span>' + icons.clock + '<span>Truy vấn lúc: <b>' + h.esc(queryTimestamp()) + '</b></span></span></div>';
        html += '<div class="ai-sales-debt-metrics">'
            + '<div class="ai-sales-debt-metric is-blue"><span class="ai-sales-debt-metric-icon">' + icons.coins + '</span><div><span>Tổng còn nợ</span><strong class="ai-sales-debt-amount">' + moneyOrUnknown(totalOutstanding) + '</strong></div></div>'
            + '<div class="ai-sales-debt-metric is-green"><span class="ai-sales-debt-metric-icon">' + icons.document + '</span><div><span>Số hóa đơn</span><strong>' + (invoiceCount === null ? '—' : invoiceCount) + '</strong></div></div>'
            + '<div class="ai-sales-debt-metric is-orange"><span class="ai-sales-debt-metric-icon">' + icons.list + '</span><div><span>Số khoản công nợ</span><strong>' + (debtItemCount === null ? debtItems.length : debtItemCount) + '</strong></div></div>'
            + '</div></header>';
        html += '<div class="ai-sales-debt-list"><div class="ai-sales-debt-table-wrap"><table class="ai-sales-debt-table"><thead><tr>'
            + '<th>Nội dung</th><th>Loại khoản</th><th>Ngày khoản nợ</th><th>Ngày đến hạn</th><th>Phát sinh tăng</th>'
            + '<th>Phát sinh giảm</th><th>Còn lại</th><th>Số ngày quá hạn</th><th>Trạng thái</th>'
            + '</tr></thead><tbody>' + debtItems.map(debtItemRow).join('') + '</tbody><tfoot><tr><td colspan="4"></td><td class="ai-sales-debt-number"><strong>' + moneyOrUnknown(debitTotal) + '</strong></td><td class="ai-sales-debt-number"><strong>' + moneyOrUnknown(creditTotal) + '</strong></td><td class="ai-sales-debt-number"><strong>' + moneyOrUnknown(totalOutstanding) + '</strong></td><td colspan="2"></td></tr></tfoot></table></div></div>';
        html += '<footer class="ai-sales-debt-footer"><aside class="ai-sales-debt-note"><h4>' + icons.info + '<span>Ghi chú</span></h4><ul><li>Tổng còn nợ = Tổng phát sinh tăng − Tổng phát sinh giảm.</li><li>“Chưa xác định hạn” nghĩa là hệ thống chưa có thông tin ngày đến hạn của khoản nợ.</li></ul></aside></footer></section>';

        setTimeout(function () {
            var root = document.getElementById(cardId);
            if (!root) return;
            var refreshParams = Object.assign({}, meta && meta.queryParams ? meta.queryParams : {});
            refreshParams['@MaKhachHang'] = customerId;
            if (!refreshParams['@DenNgay'] && _debtDateKey(asOfDate)) refreshParams['@DenNgay'] = _debtDateKey(asOfDate);

            _startDebtAutoRefresh(root, {
                rows: safeRows,
                headerMsg: headerMsg,
                apiCode: apiCode,
                meta: meta,
                customerId: customerId,
                asOfDate: asOfDate,
                params: refreshParams
            });

            function closeDetail() {
                if (typeof _activeDebtRefreshStop === 'function') _activeDebtRefreshStop();
                root.hidden = true;
                var sourceButton = document.querySelector('[data-debt-customer="' + String(customerId ?? '').replace(/"/g, '\\"') + '"]');
                if (sourceButton) sourceButton.focus();
            }
            root.addEventListener('keydown', function (event) {
                if (event.key === 'Escape') { event.preventDefault(); closeDetail(); }
            });
            root.focus();
        }, 50);

        return html;
    }

    var _catalogState = { currentCatalogType: null, catalogMode: 'BROWSE', pendingSearch: false, isRequestInProgress: false };
    var _catalogRootRows = [];
    var _catalogTypes = {
        sanpham: { label: 'Sản phẩm', icon: 'product', placeholder: 'Tên hoặc mã sản phẩm...' },
        khachhang: { label: 'Khách hàng', icon: 'customers', placeholder: 'Tên hoặc mã khách hàng...' },
        donhang: { label: 'Đơn hàng', icon: 'order', placeholder: 'Mã đơn hàng hoặc thông tin cần tìm...' },
        khohang: { label: 'Kho hàng', icon: 'warehouse', placeholder: 'Tên hoặc mã kho hàng...' },
        nhanvien: { label: 'Nhân viên', icon: 'employee', placeholder: 'Tên hoặc mã nhân viên...' }
    };

    function _catalogIcon(name) {
        var paths = {
            menu: '<rect x="3" y="3" width="7" height="7" rx="2"></rect><rect x="14" y="3" width="7" height="7" rx="2"></rect><rect x="3" y="14" width="7" height="7" rx="2"></rect><rect x="14" y="14" width="7" height="7" rx="2"></rect>',
            product: '<path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16Z"></path><path d="m3.3 7 8.7 5 8.7-5"></path><path d="M12 22V12"></path>',
            customers: '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"></path><circle cx="9" cy="7" r="4"></circle><path d="M22 21v-2a4 4 0 0 0-3-3.87"></path><path d="M16 3.13a4 4 0 0 1 0 7.75"></path>',
            order: '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8Z"></path><path d="M14 2v6h6"></path><path d="M8 13h8M8 17h8"></path>',
            warehouse: '<path d="M3 21V9l9-6 9 6v12"></path><path d="M7 21v-8h10v8M7 17h10M12 13v8"></path>',
            employee: '<circle cx="12" cy="8" r="4"></circle><path d="M4 21a8 8 0 0 1 16 0"></path>',
            search: '<circle cx="11" cy="11" r="7"></circle><path d="m20 20-4-4"></path>',
            arrow: '<path d="m9 18 6-6-6-6"></path>'
        };
        return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + (paths[name] || paths.menu) + '</svg>';
    }

    function _catalogInlineAction(button, type) {
        var root = button && button.closest('.ai-catalog-menu');
        if (!root || !_catalogTypes[type] || _catalogState.isRequestInProgress) return;
        if (_catalogState.catalogMode === 'SEARCH') {
            _catalogState.currentCatalogType = type;
            var step = root.querySelector('[data-catalog-search-step]');
            var form = root.querySelector('[data-catalog-keyword]');
            var input = root.querySelector('[data-catalog-input]');
            if (step) step.hidden = true;
            if (form) form.hidden = false;
            if (input) { input.placeholder = _catalogTypes[type].placeholder; input.focus(); }
            return;
        }
        _catalogState.currentCatalogType = type;
        _catalogState.isRequestInProgress = true;
        root.querySelectorAll('button,input').forEach(function (control) { control.disabled = true; });
        if (window.ApiEngine && typeof window.ApiEngine.execute === 'function') {
            window.ApiEngine.execute('@danh_muc', { '@Type': type });
        }
        setTimeout(function () {
            _catalogState.isRequestInProgress = false;
            root.querySelectorAll('button,input').forEach(function (control) { control.disabled = false; });
        }, 900);
    }
    window.MedstandCatalogAction = _catalogInlineAction;

    function _cleanCatalogKeyword(value) {
        return String(value || '').trim()
            .replace(/^(?:tim\s*kiem|tìm\s*kiếm)\s*[:=]?\s+/i, '')
            .trim();
    }

    window.MedstandCatalogSearch = function (button) {
        var root = button && button.closest('.ai-catalog-menu');
        if (!root) return;
        _catalogState.catalogMode = 'SEARCH';
        button.hidden = true;
        var step = root.querySelector('[data-catalog-search-step]');
        if (step) step.hidden = false;
    };

    function _renderCatalogMenu(rows, headerMsg, apiCode, meta) {
        var safeRows = Array.isArray(rows) ? rows : [];
        _catalogRootRows = safeRows.slice();
        var actualTypes = safeRows.map(function (row) { return String(row.Type ?? row.TYPE ?? row.type ?? '').toLowerCase(); }).filter(Boolean);
        var unknown = actualTypes.filter(function (type) { return !_catalogTypes[type]; });
        var requestId = meta && (meta.requestId ?? (meta.responseMetadata && meta.responseMetadata.requestId));
        if (unknown.length) {
            console.warn('[CONTRACT_DRIFT]', { ApiCode: apiCode, type: unknown[0], requestId: requestId ?? null });
            return _debtSafeState('Danh mục chưa được hỗ trợ', 'Dữ liệu danh mục chưa đúng contract. Vui lòng liên hệ quản trị.', 'warning');
        }

        var available = Object.keys(_catalogTypes).filter(function (type) { return actualTypes.indexOf(type) >= 0; });
        var cardId = 'catalog-menu-' + h.nextId() + '-' + Date.now();
        var buttons = available.map(function (type) {
            var item = _catalogTypes[type];
            return '<button type="button" class="ai-catalog-action" data-catalog-type="' + h.esc(type) + '" onclick="event.stopPropagation();window.MedstandCatalogAction(this,\'' + h.esc(type) + '\')" aria-label="Xem danh mục ' + h.esc(item.label) + '"><span class="ai-catalog-action-icon">' + _catalogIcon(item.icon) + '</span><span class="ai-catalog-action-copy"><strong>' + h.esc(item.label) + '</strong><small>Xem danh mục</small></span><i class="ai-catalog-action-arrow">' + _catalogIcon('arrow') + '</i></button>';
        }).join('');

        var html = '<section class="ai-catalog-menu ai-component-card" id="' + h.esc(cardId) + '"><header class="ai-catalog-menu-header"><span class="ai-catalog-menu-icon">' + _catalogIcon('menu') + '</span><div><h3>Danh mục</h3><p>Chọn nhóm dữ liệu bạn muốn xem hoặc tìm kiếm.</p></div></header>'
            + '<div class="ai-catalog-grid" data-catalog-options>' + buttons + '<button type="button" class="ai-catalog-action ai-catalog-search-start" data-catalog-search-start onclick="event.stopPropagation();window.MedstandCatalogSearch(this)" aria-label="Tìm kiếm trong danh mục"><span class="ai-catalog-action-icon">' + _catalogIcon('search') + '</span><span class="ai-catalog-action-copy"><strong>Tìm kiếm trong danh mục</strong><small>Tìm theo tên hoặc mã</small></span><i class="ai-catalog-action-arrow">' + _catalogIcon('arrow') + '</i></button></div>'
            + '<div class="ai-catalog-search-step" data-catalog-search-step hidden><p>Bạn muốn tìm trong danh mục nào?</p><div class="ai-catalog-grid">' + buttons + '</div></div>'
            + '<form class="ai-catalog-keyword" data-catalog-keyword hidden><label><span data-catalog-prompt>Nhập từ khóa cần tìm.</span><input type="search" data-catalog-input autocomplete="off"></label><div class="ai-catalog-actions"><button type="submit">Tìm</button><button type="button" data-catalog-back>Quay lại danh mục</button></div><p class="ai-catalog-validation" data-catalog-validation hidden>Vui lòng nhập từ khóa cần tìm.</p></form>'
            + '</section>';

        setTimeout(function () {
            var root = document.getElementById(cardId);
            if (!root) return;
            var searchStep = root.querySelector('[data-catalog-search-step]');
            var keywordForm = root.querySelector('[data-catalog-keyword]');
            var input = root.querySelector('[data-catalog-input]');
            var validation = root.querySelector('[data-catalog-validation]');

            function setBusy(busy) {
                _catalogState.isRequestInProgress = busy;
                root.querySelectorAll('button,input').forEach(function (control) { control.disabled = busy; });
            }
            function execute(type, keyword) {
                if (_catalogState.isRequestInProgress || !_catalogTypes[type]) return;
                _catalogState.currentCatalogType = type;
                var params = { '@Type': type };
                if (keyword) params['@timkiem'] = keyword;
                setBusy(true);
                if (window.ApiEngine && typeof window.ApiEngine.execute === 'function') window.ApiEngine.execute('@danh_muc', params);
                setTimeout(function () { setBusy(false); }, 900);
            }
            function chooseSearchType(type) {
                var item = _catalogTypes[type];
                if (!item) return;
                _catalogState.currentCatalogType = type;
                _catalogState.catalogMode = 'SEARCH';
                _catalogState.pendingSearch = true;
                searchStep.hidden = true;
                keywordForm.hidden = false;
                input.placeholder = item.placeholder;
                root.querySelector('[data-catalog-prompt]').textContent = 'Nhập từ khóa cho ' + item.label.toLowerCase() + '.';
                input.focus();
            }

            root.addEventListener('click', function (event) {
                var start = event.target.closest('[data-catalog-search-start]');
                if (start) { _catalogState.catalogMode = 'SEARCH'; searchStep.hidden = false; start.hidden = true; return; }
                var typeButton = event.target.closest('[data-catalog-type]');
                if (typeButton) {
                    var type = typeButton.getAttribute('data-catalog-type');
                    if (_catalogState.catalogMode === 'SEARCH') chooseSearchType(type); else execute(type, '');
                    return;
                }
                if (event.target.closest('[data-catalog-back]')) {
                    _catalogState.currentCatalogType = null; _catalogState.catalogMode = 'BROWSE'; _catalogState.pendingSearch = false;
                    keywordForm.hidden = true; searchStep.hidden = true; root.querySelector('[data-catalog-search-start]').hidden = false; validation.hidden = true;
                }
            });
            keywordForm.addEventListener('submit', function (event) {
                event.preventDefault();
                var keyword = _cleanCatalogKeyword(input.value);
                input.value = keyword;
                if (!keyword) { validation.hidden = false; input.focus(); return; }
                validation.hidden = true; _catalogState.pendingSearch = false; execute(_catalogState.currentCatalogType, keyword);
            });
            root.addEventListener('keydown', function (event) { if (event.key === 'Escape') { var back = root.querySelector('[data-catalog-back]'); if (back && !keywordForm.hidden) back.click(); } });
        }, 50);
        return html;
    }

    function _renderCatalogFooter(type) {
        var safeType = String(type || _catalogState.currentCatalogType || '').toLowerCase();
        if (!_catalogTypes[safeType]) return '';
        var footerId = 'catalog-footer-' + h.nextId() + '-' + Date.now();
        var item = _catalogTypes[safeType];
        var html = '<section class="ai-catalog-footer" id="' + h.esc(footerId) + '"><div class="ai-catalog-actions">'
            + '<button type="button" data-catalog-search-current>Tìm trong danh mục này</button>'
            + '<button type="button" data-catalog-return>Quay lại danh mục</button></div>'
            + '<form data-catalog-current-form hidden><label><span>Nhập từ khóa cho ' + h.esc(item.label.toLowerCase()) + '.</span><input type="search" data-catalog-current-input placeholder="' + h.esc(item.placeholder) + '" autocomplete="off"></label><p class="ai-catalog-validation" data-catalog-current-validation hidden>Vui lòng nhập từ khóa cần tìm.</p><button type="submit">Tìm</button></form></section>';
        setTimeout(function () {
            var root = document.getElementById(footerId);
            if (!root) return;
            var form = root.querySelector('[data-catalog-current-form]');
            var input = root.querySelector('[data-catalog-current-input]');
            var validation = root.querySelector('[data-catalog-current-validation]');
            root.addEventListener('click', function (event) {
                if (event.target.closest('[data-catalog-search-current]')) { form.hidden = false; input.focus(); return; }
                if (event.target.closest('[data-catalog-return]')) {
                    _catalogState.currentCatalogType = null; _catalogState.catalogMode = 'BROWSE'; _catalogState.pendingSearch = false;
                    if (ApiChatbot.__internal && typeof ApiChatbot.__internal.addHtmlMessage === 'function') {
                        ApiChatbot.__internal.addHtmlMessage(_renderCatalogMenu(_catalogRootRows, '', '@danh_muc', {}), 'Danh mục');
                    }
                }
            });
            form.addEventListener('submit', function (event) {
                event.preventDefault();
                var keyword = _cleanCatalogKeyword(input.value);
                input.value = keyword;
                if (!keyword) { validation.hidden = false; input.focus(); return; }
                validation.hidden = true;
                if (_catalogState.isRequestInProgress) return;
                _catalogState.isRequestInProgress = true;
                if (window.ApiEngine && typeof window.ApiEngine.execute === 'function') window.ApiEngine.execute('@danh_muc', { '@Type': safeType, '@timkiem': keyword });
                setTimeout(function () { _catalogState.isRequestInProgress = false; }, 900);
            });
        }, 50);
        return html;
    }

    function _focusValue(row, keys) {
        if (!row) return null;
        for (var i = 0; i < keys.length; i++) {
            var value = row[keys[i]];
            if (value !== undefined && value !== null && String(value).trim() !== '') return value;
        }
        return null;
    }

    function _focusNumber(value) {
        if (value === null || value === undefined || value === '') return null;
        var number = Number(String(value).replace(/\s/g, '').replace(/,/g, ''));
        return Number.isFinite(number) ? number : null;
    }

    function _focusMoney(value) {
        var number = _focusNumber(value);
        return number === null ? 'Chưa cập nhật giá' : new Intl.NumberFormat('vi-VN').format(number) + ' ₫';
    }

    function _focusQuantity(value) {
        var number = _focusNumber(value);
        return number === null ? 'Chưa xác định' : new Intl.NumberFormat('vi-VN', { maximumFractionDigits: 2 }).format(number);
    }

    function _focusDate(value) {
        if (!value) return 'Chưa xác định';
        var date = new Date(value);
        if (Number.isNaN(date.getTime())) return String(value);
        return new Intl.DateTimeFormat('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' }).format(date);
    }

    function _focusGiftLadder(program) {
        var raw = _focusValue(program, ['GiftLadderJson', 'Thang Quà Tặng Toàn Bộ']);
        if (!raw) return [];
        if (Array.isArray(raw)) return raw;
        try {
            var parsed = JSON.parse(raw);
            if (Array.isArray(parsed)) return parsed;
        } catch (_) {}
        var gifts = [];
        String(raw).replace(/\[\s*([\d.,]+)\s*:\s*([^\]]+)\]/g, function (_, target, name) {
            gifts.push({ TargetAmount: Number(String(target).replace(/[.,]/g, '')), GiftName: name.trim() });
            return _;
        });
        return gifts;
    }

    function _focusDateTime(value) {
        var date = value ? new Date(value) : new Date();
        if (Number.isNaN(date.getTime())) date = new Date();
        var parts = new Intl.DateTimeFormat('vi-VN', {
            day: '2-digit', month: '2-digit', year: 'numeric',
            hour: '2-digit', minute: '2-digit', hour12: false
        }).formatToParts(date).reduce(function (result, part) {
            result[part.type] = part.value;
            return result;
        }, {});
        return parts.day + '/' + parts.month + '/' + parts.year + ' ' + parts.hour + ':' + parts.minute;
    }

    function _focusArray(value) {
        if (Array.isArray(value)) return value;
        if (!value || typeof value !== 'string') return [];
        try {
            var parsed = JSON.parse(value);
            return Array.isArray(parsed) ? parsed : [];
        } catch (_) {
            return [];
        }
    }

    function _normalizeFocusProducts(rows, meta) {
        var safeRows = Array.isArray(rows) ? rows.filter(Boolean) : [];
        var suppliedSections = [];
        if (safeRows.length && safeRows.every(function (row) { return row && row.type && Array.isArray(row.data); })) {
            suppliedSections = safeRows;
        } else {
            var sectionCarrier = safeRows.find(function (row) { return row && Array.isArray(row.sections); });
            if (sectionCarrier) suppliedSections = sectionCarrier.sections;
            else if (meta && Array.isArray(meta.sections)) suppliedSections = meta.sections;
        }

        var productRows = [];
        var programRows = [];
        var declaredProductCount = null;
        var declaredProgramCount = null;

        suppliedSections.forEach(function (section) {
            var sectionType = String(section.type || '').toUpperCase();
            if (sectionType === 'FOCUS_PRODUCTS') {
                productRows = productRows.concat(Array.isArray(section.data) ? section.data : []);
                declaredProductCount = _focusNumber(section.count);
            } else if (sectionType === 'ACTIVE_PROGRAMS') {
                programRows = programRows.concat(Array.isArray(section.data) ? section.data : []);
                declaredProgramCount = _focusNumber(section.count);
            }
        });

        if (!suppliedSections.length) {
            safeRows.forEach(function (row) {
                var type = String(row.RecordType || '').toUpperCase();
                if (type === 'PROGRAM' || (!type && _focusValue(row, ['ProgramName', 'Chương Trình']) !== null)) programRows.push(row);
                else if (type === 'PRODUCT' || (!type && _focusValue(row, ['ItemID', 'Mã sp', 'Mã SP']) !== null)) productRows.push(row);
            });
            if (programRows.length) declaredProductCount = _focusNumber(_focusValue(programRows[0], ['ProductCount']));
        }

        var productCount = declaredProductCount === null ? productRows.length : Math.max(productRows.length, declaredProductCount);
        var programCount = declaredProgramCount === null ? programRows.length : Math.max(programRows.length, declaredProgramCount);
        return {
            sections: [
                { type: 'FOCUS_PRODUCTS', title: 'Sản phẩm trọng tâm', count: productCount, data: productRows },
                { type: 'ACTIVE_PROGRAMS', title: 'Chương trình áp dụng', count: programCount, data: programRows }
            ],
            productCount: productCount,
            programCount: programCount,
            products: productRows,
            programs: programRows
        };
    }

    function _focusStockDetails(row) {
        var detailKeys = ['StockDetails', 'WarehouseLots', 'LotDetails', 'InventoryDetails', 'ChiTietKhoLo'];
        var details = [];
        for (var i = 0; i < detailKeys.length; i++) {
            details = _focusArray(row && row[detailKeys[i]]);
            if (details.length) break;
            if (row && Array.isArray(row[detailKeys[i]])) {
                details = row[detailKeys[i]];
                break;
            }
        }
        var hasInlineDetail = _focusValue(row, ['WarehouseName', 'StoreHouseName', 'Tên Kho', 'WarehouseID', 'StoreHouseID', 'Mã Kho', 'LotNumber', 'BatchNumber', 'Số Lô']) !== null;
        if (!details.length && hasInlineDetail) details = [row];
        return details.map(function (detail) {
            var ending = _focusNumber(_focusValue(detail, ['EndingStock', 'ClosingStock', 'Tồn Cuối', 'PhysicalStock', 'Tồn Kho']));
            return {
                warehouse: String(_focusValue(detail, ['WarehouseName', 'StoreHouseName', 'Tên Kho']) || 'Chưa cập nhật'),
                warehouseId: String(_focusValue(detail, ['WarehouseID', 'StoreHouseID', 'Mã Kho']) || '—'),
                lot: String(_focusValue(detail, ['LotNumber', 'BatchNumber', 'Số Lô']) || '—'),
                expiry: _focusValue(detail, ['ExpiryDate', 'ExpireDate', 'Hạn Sử Dụng']),
                unit: String(_focusValue(detail, ['Unit', 'ĐVT', 'Đơn vị tính']) || _focusValue(row, ['Unit', 'ĐVT', 'Đơn vị tính']) || '—'),
                received: _focusNumber(_focusValue(detail, ['ReceivedQuantity', 'ImportQuantity', 'Nhập'])),
                issued: _focusNumber(_focusValue(detail, ['IssuedQuantity', 'ExportQuantity', 'Xuất'])),
                ending: ending
            };
        });
    }

    function _renderFocusProducts(rows, headerMsg, apiCode, meta) {
        var normalized = _normalizeFocusProducts(rows, meta);
        var programs = normalized.programs;
        var cardId = 'focus-products-' + h.nextId() + '-' + Date.now();
        var responseMeta = meta && meta.responseMetadata ? meta.responseMetadata : {};
        var updatedAt = _focusValue(responseMeta, ['stockUpdatedAt', 'dataUpdatedAt', 'generatedAt', 'timestamp'])
            || _focusValue(normalized.products[0], ['StockUpdatedAt'])
            || new Date();
        var updatedDate = new Date(updatedAt);
        if (Number.isNaN(updatedDate.getTime())) updatedDate = new Date();

        function productModel(row) {
            return {
                id: String(_focusValue(row, ['ItemID', 'Mã sp', 'Mã SP']) || '—'),
                name: String(_focusValue(row, ['ItemName', 'Sản Phẩm', 'Tên sản phẩm']) || 'Sản phẩm chưa xác định'),
                group: String(_focusValue(row, ['ItemGroupName', 'ProductGroupName', 'CategoryName', 'Nhóm sản phẩm']) || ''),
                unit: String(_focusValue(row, ['Unit', 'ĐVT', 'Đơn vị tính']) || '—'),
                physical: _focusNumber(_focusValue(row, ['PhysicalStock', 'Tồn Kho', 'Tồn kho'])),
                available: _focusNumber(_focusValue(row, ['AvailableStock', 'Tồn khả dụng tham khảo'])),
                stockStatus: String(_focusValue(row, ['StockDataStatus']) || ''),
                updatedAt: _focusValue(row, ['StockUpdatedAt']),
                details: _focusStockDetails(row)
            };
        }

        function programModel(row) {
            var customerId = _focusValue(row, ['CustomerID', 'Mã Khách']);
            var customerFlag = _focusNumber(_focusValue(row, ['HasCustomer']));
            return {
                name: String(_focusValue(row, ['ProgramName', 'Chương Trình']) || 'Chương trình sản phẩm trọng tâm'),
                fromDate: _focusValue(row, ['EffectiveFrom', 'Từ Ngày']),
                toDate: _focusValue(row, ['EffectiveTo', 'Đến Ngày']),
                description: _focusValue(row, ['ProgramDescription', 'Description', 'ConditionText', 'Nội dung chương trình', 'Điều kiện']),
                gifts: _focusGiftLadder(row),
                hasCustomer: Boolean(customerId) && (customerFlag === null || customerFlag === 1),
                customerId: customerId,
                customerName: _focusValue(row, ['CustomerName', 'Tên Khách Hàng']) || customerId,
                currentSales: _focusNumber(_focusValue(row, ['CurrentSales', 'Doanh Số Hiện Tại'])),
                nextTarget: _focusNumber(_focusValue(row, ['NextTarget', 'Mốc Kế Tiếp'])),
                remaining: _focusNumber(_focusValue(row, ['RemainingToNextTarget', 'Còn Thiếu'])),
                nextGift: _focusValue(row, ['NextGift', 'Quà Kế Tiếp'])
            };
        }

        function uniqueValues(list, key) {
            return list.map(function (item) { return item[key]; }).filter(function (value, index, all) {
                return value && all.indexOf(value) === index;
            }).sort(function (a, b) { return a.localeCompare(b, 'vi'); });
        }

        function options(values, emptyLabel) {
            return '<option value="">' + h.esc(emptyLabel) + '</option>' + values.map(function (value) {
                return '<option value="' + h.esc(value) + '">' + h.esc(value) + '</option>';
            }).join('');
        }

        function renderProgramCard(program) {
            var html = '<article class="ai-focus-program-card">'
                + '<div class="ai-focus-program-title"><div><span class="ai-focus-program-kicker">Chương trình trọng tâm</span><h4>' + h.esc(program.name) + '</h4></div><span>Đang áp dụng</span></div>'
                + '<dl class="ai-focus-program-info"><div><dt>Thời gian hiệu lực</dt><dd>' + h.esc(_focusDate(program.fromDate)) + ' – ' + h.esc(_focusDate(program.toDate)) + '</dd></div>'
                + (program.description ? '<div><dt>Nội dung / điều kiện</dt><dd>' + h.esc(String(program.description)) + '</dd></div>' : '') + '</dl>';

            if (program.gifts.length) {
                html += '<section class="ai-focus-gifts"><h4>Thang thưởng</h4><div class="ai-focus-gift-table-wrap"><table><thead><tr><th>Doanh số tích lũy</th><th>Quà tặng</th></tr></thead><tbody>'
                    + program.gifts.map(function (gift) {
                        var target = _focusValue(gift, ['TargetAmount', 'TuDiem', 'Mốc']);
                        var name = _focusValue(gift, ['GiftName', 'QuaTang', 'Quà']);
                        return '<tr><td class="ai-focus-number">' + h.esc(_focusMoney(target)) + '</td><td>' + h.esc(String(name || 'Chưa cập nhật')) + '</td></tr>';
                    }).join('') + '</tbody></table></div></section>';
            } else {
                html += '<section class="ai-focus-gifts"><h4>Thang thưởng</h4><p>Chương trình chưa có thông tin thang thưởng.</p></section>';
            }

            if (program.hasCustomer) {
                var percent = program.nextTarget && program.currentSales !== null
                    ? Math.max(0, Math.min(100, Math.round(program.currentSales / program.nextTarget * 100)))
                    : (program.currentSales !== null && program.nextTarget === null ? 100 : 0);
                html += '<section class="ai-focus-progress"><div class="ai-focus-progress-head"><div><span>Khách hàng</span><strong>' + h.esc(String(program.customerName)) + '</strong><small>Mã khách hàng: ' + h.esc(String(program.customerId)) + '</small></div><strong>' + percent + '%</strong></div>'
                    + '<div class="ai-focus-progress-bar" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="' + percent + '"><span style="width:' + percent + '%"></span></div>'
                    + '<div class="ai-focus-progress-metrics"><div><span>Đã tích lũy</span><strong>' + h.esc(program.currentSales === null ? 'Chưa cập nhật' : _focusMoney(program.currentSales)) + '</strong></div>'
                    + '<div><span>Mốc kế tiếp</span><strong>' + h.esc(program.nextTarget === null ? 'Đã đạt mốc cao nhất' : _focusMoney(program.nextTarget)) + '</strong></div>'
                    + '<div><span>Còn thiếu</span><strong>' + h.esc(program.remaining === null ? '—' : _focusMoney(program.remaining)) + '</strong></div>'
                    + '<div><span>Quà dự kiến</span><strong>' + h.esc(String(program.nextGift || 'Đã đạt mốc cao nhất')) + '</strong></div></div></section>';
            } else {
                html += '<div class="ai-focus-customer-prompt"><div><strong>Chưa chọn khách hàng</strong><span>Chọn khách hàng để xem tiến độ tích lũy và mốc thưởng tiếp theo.</span></div><button type="button" data-focus-choose-customer>Chọn khách hàng</button></div>';
            }
            return html + '</article>';
        }

        var models = normalized.products.map(productModel);
        var hasExpandableProducts = models.some(function (product) {
            return product.details.length > 0;
        });
        var programModels = programs.map(programModel);
        var groups = uniqueValues(models, 'group');
        var units = uniqueValues(models, 'unit').filter(function (unit) { return unit !== '—'; });
        var productPanelId = cardId + '-products';
        var programPanelId = cardId + '-programs';
        var html = '<section class="ai-focus-products" id="' + h.esc(cardId) + '">'
            + '<header class="ai-focus-header"><div><span class="ai-focus-eyebrow">Tra cứu nghiệp vụ</span><h3>SẢN PHẨM TRỌNG TÂM</h3><p>Tìm thấy <strong>' + normalized.productCount + '</strong> sản phẩm trọng tâm thuộc <strong>' + normalized.programCount + '</strong> chương trình đang áp dụng</p></div>'
            + '<time datetime="' + h.esc(updatedDate.toISOString()) + '">Cập nhật lúc: ' + h.esc(_focusDateTime(updatedDate)) + '</time></header>'
            + '<div class="ai-focus-tabs" role="tablist" aria-label="Nội dung sản phẩm trọng tâm">'
            + '<button id="' + h.esc(cardId + '-tab-products') + '" type="button" class="active" role="tab" aria-selected="true" aria-controls="' + h.esc(productPanelId) + '" tabindex="0" data-focus-tab="products">Sản phẩm trọng tâm <span>' + normalized.productCount + '</span></button>'
            + '<button id="' + h.esc(cardId + '-tab-programs') + '" type="button" role="tab" aria-selected="false" aria-controls="' + h.esc(programPanelId) + '" tabindex="-1" data-focus-tab="programs">Chương trình áp dụng <span>' + normalized.programCount + '</span></button>'
            + '</div>'
            + '<div id="' + h.esc(productPanelId) + '" class="ai-focus-panel" role="tabpanel" aria-labelledby="' + h.esc(cardId + '-tab-products') + '" data-focus-panel="products">'
            + '<div class="ai-focus-toolbar"><label class="ai-focus-search"><span class="sr-only">Tìm sản phẩm</span><input type="search" data-focus-search placeholder="Tìm theo mã hoặc tên sản phẩm..." aria-label="Tìm theo mã hoặc tên sản phẩm"></label>'
            + '<button type="button" class="ai-focus-filter-toggle" data-focus-filter-toggle aria-expanded="false">Bộ lọc</button>'
            + '<div class="ai-focus-filter-controls" data-focus-filter-controls>'
            + '<label><span class="sr-only">Nhóm sản phẩm</span><select data-focus-group' + (groups.length ? '' : ' disabled') + ' aria-label="Lọc theo nhóm sản phẩm">' + options(groups, 'Tất cả nhóm') + '</select></label>'
            + '<label><span class="sr-only">Đơn vị tính</span><select data-focus-unit' + (units.length ? '' : ' disabled') + ' aria-label="Lọc theo đơn vị tính">' + options(units, 'Tất cả đơn vị') + '</select></label>'
            + '<label><span class="sr-only">Trạng thái tồn kho</span><select data-focus-stock aria-label="Lọc theo trạng thái tồn kho"><option value="all">Tất cả tồn kho</option><option value="in-stock">Còn hàng</option><option value="out-of-stock">Hết hàng</option><option value="negative">Cần đối soát</option><option value="unknown">Chưa cập nhật</option></select></label>'
            + '<label><span class="sr-only">Sắp xếp</span><select data-focus-sort aria-label="Sắp xếp sản phẩm"><option value="name-asc">Tên A–Z</option><option value="stock-desc">Tồn cao đến thấp</option><option value="stock-asc">Tồn thấp đến cao</option><option value="code-asc">Mã sản phẩm</option></select></label>'
            + '</div></div>'
            + '<p class="ai-focus-stock-note">Số lượng hiển thị theo các kho tài khoản được quyền xem.</p>'
            + '<div class="ai-focus-table-wrap"><table class="ai-focus-table"><thead><tr><th>Mã SP</th><th>Sản phẩm</th><th>Đơn vị tính</th><th class="ai-focus-number">Tồn trong kho</th><th class="ai-focus-number">Khả dụng tham khảo</th><th>Trạng thái</th></tr></thead><tbody data-focus-body></tbody></table></div>'
            + '<div class="ai-focus-pagination" data-focus-pagination></div></div>'
            + '<div id="' + h.esc(programPanelId) + '" class="ai-focus-panel ai-focus-program-list" role="tabpanel" aria-labelledby="' + h.esc(cardId + '-tab-programs') + '" data-focus-panel="programs" hidden>'
            + (programModels.length ? programModels.map(renderProgramCard).join('') : '<div class="ai-focus-empty"><strong>Chưa có chương trình đang áp dụng.</strong><span>Không có thông tin chương trình phù hợp tại thời điểm tra cứu.</span></div>')
            + '</div></section>';

        setTimeout(function () {
            var root = document.getElementById(cardId);
            if (!root) return;
            var body = root.querySelector('[data-focus-body]');
            var pagination = root.querySelector('[data-focus-pagination]');
            var collator = new Intl.Collator('vi', { sensitivity: 'base', numeric: true });
            var state = { page: 1, pageSize: 25, search: '', group: '', unit: '', stock: 'all', sort: 'name-asc', expanded: {} };

            function stockState(product) {
                if (product.stockStatus === 'STOCK_RECONCILIATION_REQUIRED' || (product.physical !== null && product.physical < 0)) return { cls: 'danger', label: 'Cần đối soát' };
                if (product.physical === null) return { cls: 'muted', label: 'Chưa cập nhật' };
                if (product.physical === 0) return { cls: 'danger-soft', label: 'Hết hàng' };
                return { cls: 'success', label: 'Còn hàng' };
            }

            function filteredProducts() {
                var keyword = String(state.search || '').toLocaleLowerCase('vi-VN');
                return models.filter(function (product) {
                    if (keyword && (product.id + ' ' + product.name).toLocaleLowerCase('vi-VN').indexOf(keyword) < 0) return false;
                    if (state.group && product.group !== state.group) return false;
                    if (state.unit && product.unit !== state.unit) return false;
                    if (state.stock === 'in-stock' && !(product.physical > 0)) return false;
                    if (state.stock === 'out-of-stock' && product.physical !== 0) return false;
                    if (state.stock === 'negative' && !(product.physical < 0)) return false;
                    if (state.stock === 'unknown' && product.physical !== null) return false;
                    return true;
                }).sort(function (a, b) {
                    if (state.sort === 'stock-desc') return (b.physical === null ? -Infinity : b.physical) - (a.physical === null ? -Infinity : a.physical);
                    if (state.sort === 'stock-asc') return (a.physical === null ? Infinity : a.physical) - (b.physical === null ? Infinity : b.physical);
                    if (state.sort === 'code-asc') return collator.compare(a.id, b.id);
                    return collator.compare(a.name, b.name);
                });
            }

            function renderDetails(product) {
                if (!state.expanded[product.id] || !product.details.length) return '';
                var updatedHtml = product.updatedAt
                    ? '<span>Cập nhật lúc ' + h.esc(_focusDateTime(product.updatedAt)) + '</span>'
                    : '';
                var html = '<tr class="ai-focus-detail-row"><td colspan="6"><div class="ai-focus-detail">'
                    + '<div class="ai-focus-detail-heading"><div><strong>Chi tiết tồn theo kho và lô</strong><span>Đối chiếu số lượng nhập, xuất và tồn cuối của từng lô hàng.</span></div>' + updatedHtml + '</div>'
                    + '<div class="ai-focus-detail-table-wrap"><table><thead><tr><th>Kho</th><th>Mã kho</th><th>Số lô</th><th>Hạn sử dụng</th><th>ĐVT</th><th class="ai-focus-number">Nhập</th><th class="ai-focus-number">Xuất</th><th class="ai-focus-number">Tồn cuối</th><th>Trạng thái</th></tr></thead><tbody>';
                product.details.forEach(function (detail) {
                    var detailStatus = detail.ending !== null && detail.ending < 0 ? { cls: 'danger', label: 'Cần đối soát' }
                        : detail.ending === 0 ? { cls: 'danger-soft', label: 'Hết hàng' }
                        : detail.ending === null ? { cls: 'muted', label: 'Chưa cập nhật' }
                        : { cls: 'success', label: 'Còn hàng' };
                    html += '<tr><td>' + h.esc(detail.warehouse) + '</td><td>' + h.esc(detail.warehouseId) + '</td><td>' + h.esc(detail.lot) + '</td><td>' + h.esc(detail.expiry ? _focusDate(detail.expiry) : '—') + '</td><td>' + h.esc(detail.unit) + '</td>'
                        + '<td class="ai-focus-number">' + h.esc(detail.received === null ? '—' : _focusQuantity(detail.received)) + '</td><td class="ai-focus-number">' + h.esc(detail.issued === null ? '—' : _focusQuantity(detail.issued)) + '</td><td class="ai-focus-number">' + h.esc(detail.ending === null ? '—' : _focusQuantity(detail.ending)) + '</td><td><span class="ai-focus-stock-status ' + detailStatus.cls + '">' + h.esc(detailStatus.label) + '</span></td></tr>';
                });
                return html + '</tbody></table></div></div></td></tr>';
            }

            function render() {
                var filtered = filteredProducts();
                var totalPages = Math.max(1, Math.ceil(filtered.length / state.pageSize));
                state.page = Math.max(1, Math.min(state.page, totalPages));
                var start = (state.page - 1) * state.pageSize;
                var pageRows = filtered.slice(start, start + state.pageSize);
                if (!pageRows.length) {
                    body.innerHTML = '<tr><td colspan="6" class="ai-focus-empty"><strong>Không có sản phẩm trọng tâm phù hợp.</strong><span>Hãy thay đổi từ khóa hoặc bộ lọc để thử lại.</span></td></tr>';
                } else {
                    body.innerHTML = pageRows.map(function (product) {
                        var status = stockState(product);
                        var canExpand = product.details.length > 0;
                        var open = canExpand && Boolean(state.expanded[product.id]);
                        var expandControl = canExpand
                            ? '<button type="button" data-focus-expand="' + h.esc(product.id) + '" aria-expanded="' + (open ? 'true' : 'false') + '" aria-label="' + (open ? 'Thu gọn' : 'Xem chi tiết tồn theo kho và lô của') + ' sản phẩm ' + h.esc(product.id) + '">›</button>'
                            : (hasExpandableProducts ? '<span class="ai-focus-code-spacer" aria-hidden="true"></span>' : '');
                        var rowClass = product.physical !== null && product.physical < 0 ? ' class="ai-focus-negative-row"' : '';
                        return '<tr' + rowClass + '><td><div class="ai-focus-code">' + expandControl + '<strong>' + h.esc(product.id) + '</strong></div></td><td>' + h.esc(product.name) + '</td><td>' + h.esc(product.unit) + '</td>'
                            + '<td class="ai-focus-number">' + h.esc(product.physical === null ? 'Chưa cập nhật' : _focusQuantity(product.physical)) + '</td>'
                            + '<td class="ai-focus-number">' + h.esc(product.available === null ? 'Chưa cập nhật' : _focusQuantity(product.available)) + '</td>'
                            + '<td><span class="ai-focus-stock-status ' + status.cls + '">' + h.esc(status.label) + '</span></td></tr>' + renderDetails(product);
                    }).join('');
                }

                var visiblePages = [];
                for (var page = 1; page <= totalPages; page++) {
                    if (page === 1 || page === totalPages || Math.abs(page - state.page) <= 1) visiblePages.push(page);
                }
                var pageButtons = '';
                var previousPage = 0;
                visiblePages.forEach(function (page) {
                    if (previousPage && page - previousPage > 1) pageButtons += '<span aria-hidden="true">…</span>';
                    pageButtons += '<button type="button" data-focus-page="' + page + '" class="' + (page === state.page ? 'active' : '') + '" aria-label="Trang ' + page + '"' + (page === state.page ? ' aria-current="page"' : '') + '>' + page + '</button>';
                    previousPage = page;
                });
                pagination.innerHTML = '<span>Hiển thị ' + (filtered.length ? start + 1 : 0) + ' – ' + Math.min(start + state.pageSize, filtered.length) + ' / ' + filtered.length + ' sản phẩm</span>'
                    + '<label>Dòng/trang <select data-focus-page-size aria-label="Số dòng mỗi trang"><option value="10"' + (state.pageSize === 10 ? ' selected' : '') + '>10</option><option value="25"' + (state.pageSize === 25 ? ' selected' : '') + '>25</option><option value="50"' + (state.pageSize === 50 ? ' selected' : '') + '>50</option></select></label>'
                    + '<div><button type="button" data-focus-page-action="prev" aria-label="Trang trước"' + (state.page <= 1 ? ' disabled' : '') + '>‹</button>' + pageButtons + '<button type="button" data-focus-page-action="next" aria-label="Trang sau"' + (state.page >= totalPages ? ' disabled' : '') + '>›</button></div>';
            }

            function switchTab(tab) {
                var target = tab.getAttribute('data-focus-tab');
                root.querySelectorAll('[data-focus-tab]').forEach(function (button) {
                    var active = button === tab;
                    button.classList.toggle('active', active);
                    button.setAttribute('aria-selected', active ? 'true' : 'false');
                    button.setAttribute('tabindex', active ? '0' : '-1');
                });
                root.querySelectorAll('[data-focus-panel]').forEach(function (panel) {
                    panel.hidden = panel.getAttribute('data-focus-panel') !== target;
                });
            }

            root.addEventListener('click', function (event) {
                var tab = event.target.closest('[data-focus-tab]');
                if (tab) { switchTab(tab); return; }
                var filterToggle = event.target.closest('[data-focus-filter-toggle]');
                if (filterToggle) {
                    var controls = root.querySelector('[data-focus-filter-controls]');
                    var open = controls.classList.toggle('open');
                    filterToggle.setAttribute('aria-expanded', open ? 'true' : 'false');
                    return;
                }
                var expand = event.target.closest('[data-focus-expand]');
                if (expand) {
                    var scrollHost = root.closest('.chat-messages, #chat-messages, .chatbot-messages') || document.scrollingElement;
                    var oldScrollTop = scrollHost ? scrollHost.scrollTop : 0;
                    var itemId = expand.getAttribute('data-focus-expand');
                    state.expanded[itemId] = !state.expanded[itemId];
                    render();
                    if (scrollHost) requestAnimationFrame(function () { scrollHost.scrollTop = oldScrollTop; });
                    return;
                }
                var pageButton = event.target.closest('[data-focus-page]');
                if (pageButton) { state.page = Number(pageButton.getAttribute('data-focus-page')) || 1; render(); return; }
                var pageAction = event.target.closest('[data-focus-page-action]');
                if (pageAction) { state.page += pageAction.getAttribute('data-focus-page-action') === 'prev' ? -1 : 1; render(); return; }
                if (event.target.closest('[data-focus-choose-customer]')) {
                    var input = document.getElementById('chat-input');
                    if (input) {
                        input.value = '@tich_luy';
                        input.dispatchEvent(new Event('input', { bubbles: true }));
                        input.focus();
                    }
                    if (window.ApiEngine && typeof window.ApiEngine.openCustomerPicker === 'function') {
                        window.ApiEngine.openCustomerPicker('@tich_luy');
                    } else if (window.ApiEngine && typeof window.ApiEngine.open === 'function') {
                        window.ApiEngine.open('@tich_luy');
                    }
                }
            });
            root.addEventListener('keydown', function (event) {
                var currentTab = event.target.closest('[data-focus-tab]');
                if (!currentTab || ['ArrowLeft', 'ArrowRight', 'Home', 'End'].indexOf(event.key) < 0) return;
                event.preventDefault();
                var tabs = Array.prototype.slice.call(root.querySelectorAll('[data-focus-tab]'));
                var index = tabs.indexOf(currentTab);
                if (event.key === 'Home') index = 0;
                else if (event.key === 'End') index = tabs.length - 1;
                else index = (index + (event.key === 'ArrowRight' ? 1 : -1) + tabs.length) % tabs.length;
                tabs[index].focus();
                switchTab(tabs[index]);
            });
            root.addEventListener('input', function (event) {
                if (!event.target.matches('[data-focus-search]')) return;
                state.search = event.target.value;
                state.page = 1;
                render();
            });
            root.addEventListener('change', function (event) {
                if (event.target.matches('[data-focus-page-size]')) state.pageSize = Number(event.target.value) || 25;
                else if (event.target.matches('[data-focus-group]')) state.group = event.target.value;
                else if (event.target.matches('[data-focus-unit]')) state.unit = event.target.value;
                else if (event.target.matches('[data-focus-stock]')) state.stock = event.target.value;
                else if (event.target.matches('[data-focus-sort]')) state.sort = event.target.value;
                else return;
                state.page = 1;
                render();
            });
            render();
        }, 50);

        return html;
    }

    function _isDebtListApi(apiCode) {
        var code = String(apiCode || '').toLowerCase();
        return code.indexOf('@cong_no') === 0 && code !== '@cong_no_chi_tiet';
    }

    function _renderCongNo(rows, headerMsg, apiCode, meta) {
        return _isDebtListApi(apiCode)
            ? _renderCongNoDanhSach(rows, headerMsg, apiCode, meta)
            : _renderCongNoChiTiet(rows, headerMsg, apiCode, meta);
    }

    ApiChatbot.registerRenderer('CONG_NO',  _renderCongNo);
    if (ApiChatbot.__internal) ApiChatbot.__internal.renderDebt = _renderCongNo;
    if (ApiChatbot.__internal) ApiChatbot.__internal.renderCatalog = _renderCatalogMenu;
    if (ApiChatbot.__internal) ApiChatbot.__internal.renderCatalogFooter = _renderCatalogFooter;
    if (ApiChatbot.__internal) ApiChatbot.__internal.normalizeFocusProducts = _normalizeFocusProducts;
    if (ApiChatbot.__internal) ApiChatbot.__internal.renderFocusProducts = _renderFocusProducts;
    ApiChatbot.registerRenderer('FOCUS_PRODUCTS', _renderFocusProducts);
    ApiChatbot.registerRenderer('TICH_LUY', _renderTichLuy);
    ApiChatbot.registerRenderer('METRIC_CARD', _renderMetricCard);
    ApiChatbot.registerRenderer('ALERT_CARD', _renderAlertCard);
    ApiChatbot.registerRenderer('BAR_CHART', _renderBarChart);

    console.log('[Medstand Renderers] Đã đăng ký: CONG_NO, TICH_LUY, METRIC_CARD, ALERT_CARD, BAR_CHART');
})();
