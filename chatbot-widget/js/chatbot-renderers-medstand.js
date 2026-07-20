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
        var khCode   = (meta && meta.khCode) ? meta.khCode : '';
        var safeRows = (rows && rows.length > 0) ? rows : [];
        if (!khCode && safeRows.length > 0) {
            khCode = h.pickValue(safeRows[0], 'CUSTOMER') || safeRows[0].ObjectID || safeRows[0].MaKH || safeRows[0].CustomerCode || '';
        }
        if (safeRows.length === 0) {
            return '<p class="ai-para">📭 Không có dữ liệu tích lũy.</p>';
        }

        var r0    = safeRows[0];
        // Dùng field roles + fallback sang field name thực nếu DB chưa map role PERCENT
        var pct   = Math.min(100, Math.max(0, parseInt(h.pickValue(r0, 'PERCENT') || r0.Percentage || 0)));
        var dat   = h.pickValue(r0, 'MONEY') || r0.TichLuyDatDuoc || 0;
        var muc   = h.pickValue(r0, 'TARGET') || r0.MucTieu || 0;

        var cardId  = 'tichluy-' + h.nextId() + '-' + Date.now();
        var barCls  = pct >= 100 ? 'success' : (pct >= 70 ? 'warning' : 'danger');

        var html  = '<div class="ai-sales-milestone-card" id="' + h.esc(cardId) + '">';

        // Header
        html += '<div class="ai-sales-milestone-header" id="hdr-' + h.esc(cardId) + '">';
        html += '<div class="ai-sales-milestone-title">Đang xác định...</div>';
        html += '<div class="ai-sales-milestone-subtitle">Mã: <b>' + h.esc(khCode || 'N/A') + '</b></div>';
        html += '</div>';

        // Progress bar
        html += '<div class="ai-sales-progress-container">';
        html += '<div class="ai-sales-progress-labels">'
            +   '<span class="ai-sales-progress-current">' + h.fmtCellVal(dat) + '</span>'
            +   '<span class="ai-sales-progress-target">Mục tiêu: ' + h.fmtCellVal(muc) + '</span>'
            + '</div>';
        html += '<div class="ai-sales-progress-bar-bg">'
            +   '<div class="ai-sales-progress-bar-fill ' + barCls + '" style="width:' + pct + '%"></div>'
            + '</div>';
        html += '<div class="ai-sales-progress-pct">' + pct + '% Hoàn thành</div>';
        html += '</div>';

        // Stats — dùng field role BADGE cho phần thưởng nếu có, fallback field name
        var gift  = h.pickValue(r0, 'BADGE') || r0.QuaDaDat || 'Chưa đạt';
        var count = r0.SoPhanQua || 0;
        html += '<div class="ai-sales-milestone-stats">';
        html += '<div class="ai-sales-stat-box"><div class="ai-stat-val">' + h.esc(String(gift)) + '</div><div class="ai-stat-label">🎁 Quà tặng</div></div>';
        html += '<div class="ai-sales-stat-box"><div class="ai-stat-val">' + h.esc(String(count)) + '</div><div class="ai-stat-label">🎫 Số phần</div></div>';
        html += '</div>';

        // Lời nhắc — dùng TREND role nếu mapped, fallback field
        var loiNhac = h.pickValue(r0, 'TREND') || r0.LoiNhacAI || 'Tiếp tục nỗ lực để đạt mốc cao hơn!';
        html += '<div class="ai-sales-milestone-reminder">'
            +   '<div class="ai-reminder-title">📢 Lời nhắc AI</div>'
            +   '<div class="ai-reminder-text">' + h.esc(String(loiNhac)) + '</div>'
            + '</div>';

        // Action bar
        html += '<div class="ai-sales-action-bar" id="act-' + h.esc(cardId) + '">'
            +   '<button class="ai-sales-action-btn ai-sales-btn-disabled" disabled>Đang tải...</button>'
            + '</div>';
        html += '</div>'; // card

        // Hydrate async
        setTimeout(function () {
            _hydrateEntity(khCode, function (entity) {
                var hdrEl = document.getElementById('hdr-' + cardId);
                var actEl = document.getElementById('act-' + cardId);
                var name  = entity ? entity.name  : (khCode || 'Khách hàng');
                var phone = entity ? entity.phone : null;
                if (hdrEl) hdrEl.querySelector('.ai-sales-milestone-title').textContent = '🏆 Tích lũy: ' + name;
                if (actEl) {
                    actEl.innerHTML = phone && h.isValidPhone(phone)
                        ? '<a class="ai-sales-action-btn ai-sales-btn-call" href="tel:' + h.esc(phone) + '">📞 Liên hệ</a>'
                          + '<a class="ai-sales-action-btn ai-sales-btn-zalo" href="https://zalo.me/' + h.esc(phone) + '" target="_blank" rel="noopener">💬 Nhắc Zalo</a>'
                        : '<button class="ai-sales-action-btn ai-sales-btn-disabled" disabled>📞 Không rõ SĐT</button>';
                }
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
                dataSource: _debtFirst(row, ['DataSource']),
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
            + (first.dataSource ? ' · Nguồn: ' + h.esc(String(first.dataSource)) : '')
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
        var dataSource = _debtFirst(firstRow, ['DataSource']);

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
        function debtItemRow(item) {
            return '<tr><td><strong>' + h.esc(String(item.id)) + '</strong>'
                + (item.description ? '<small>' + h.esc(String(item.description)) + '</small>' : '') + '</td>'
                + '<td><span class="ai-sales-debt-item-type is-' + h.esc(item.documentType.key.toLowerCase()) + '">' + h.esc(item.documentType.label) + '</span>'
                + (item.matchStatus ? '<small>' + h.esc(String(item.matchStatus)) + '</small>' : '') + '</td>'
                + '<td>' + h.esc(_debtDate(item.debtDate)) + '</td>'
                + '<td>' + h.esc(_debtDate(item.dueDate)) + '</td>'
                + '<td class="ai-sales-debt-number">' + moneyOrUnknown(item.debit) + '</td>'
                + '<td class="ai-sales-debt-number">' + moneyOrUnknown(item.credit) + '</td>'
                + '<td class="ai-sales-debt-number"><strong>' + moneyOrUnknown(item.remaining) + '</strong></td>'
                + '<td>' + (item.overdueDays === null ? '—' : item.overdueDays + ' ngày') + '</td>'
                + '<td>' + (item.status ? '<span class="ai-sales-debt-status is-' + item.status.cls + '">' + h.esc(item.status.label) + '</span>' : '—')
                + (item.dueStatus && (!item.status || item.dueStatus.key !== item.status.key) ? ' <span class="ai-sales-debt-status is-' + item.dueStatus.cls + '">' + h.esc(item.dueStatus.label) + '</span>' : '')
                + '</td></tr>';
        }

        var html = '<section class="ai-sales-debt-card ai-sales-debt-detail" id="' + h.esc(cardId) + '" data-debt-detail-customer="' + h.esc(String(customerId ?? '')) + '" tabindex="-1">';
        html += '<header class="ai-sales-debt-header"><div class="ai-sales-debt-header-main"><div class="ai-sales-debt-customer">'
            + '<div class="ai-sales-debt-title">' + h.esc(String(customerName ?? 'Khách hàng chưa xác định')) + '</div>'
            + '<div class="ai-sales-debt-subtitle">Mã khách hàng: <b>' + h.esc(String(customerId ?? 'Chưa xác định')) + '</b></div>'
            + '<div class="ai-sales-debt-contact-line">' + h.esc(phone && h.isValidPhone(String(phone)) ? 'SĐT: ' + phone : 'Chưa có số điện thoại') + '</div>'
            + '<div class="ai-sales-debt-contact-line">Ngày đối soát: ' + h.esc(_debtDate(asOfDate)) + '</div>'
            + (dataSource ? '<div class="ai-sales-debt-contact-line">Nguồn: ' + h.esc(String(dataSource)) + '</div>' : '')
            + '</div><button type="button" class="ai-sales-debt-close" aria-label="Đóng chi tiết công nợ">Đóng</button></div>';
        if (drifts.length) html += '<div class="ai-sales-debt-drift" role="status">Một số khoản thiếu trạng thái hạn từ API.</div>';
        html += '<div class="ai-sales-debt-metrics">'
            + '<div class="ai-sales-debt-metric"><span>Tổng còn nợ</span><strong class="ai-sales-debt-amount">' + moneyOrUnknown(totalOutstanding) + '</strong></div>'
            + '<div class="ai-sales-debt-metric"><span>Số hóa đơn</span><strong>' + (invoiceCount === null ? '—' : invoiceCount) + '</strong></div>'
            + '<div class="ai-sales-debt-metric"><span>Số khoản công nợ</span><strong>' + (debtItemCount === null ? debtItems.length : debtItemCount) + '</strong></div>'
            + '</div>';
        html += '</header>';
        html += '<div class="ai-sales-debt-list"><div class="ai-sales-debt-table-wrap"><table class="ai-sales-debt-table"><thead><tr>'
            + '<th>Mã khoản</th><th>Loại khoản</th><th>Ngày khoản nợ</th><th>Ngày đến hạn</th><th>Phát sinh tăng</th>'
            + '<th>Phát sinh giảm</th><th>Còn lại</th><th>Số ngày quá hạn</th><th>Trạng thái</th>'
            + '</tr></thead><tbody>' + debtItems.map(debtItemRow).join('') + '</tbody></table></div></div>';
        html += '<footer class="ai-sales-debt-footer"><div class="ai-sales-debt-summary">'
            + '<span>Tổng phát sinh tăng <b>' + moneyOrUnknown(debitTotal) + '</b></span>'
            + '<span>Tổng phát sinh giảm <b>' + moneyOrUnknown(creditTotal) + '</b></span>'
            + '</div></footer></section>';

        setTimeout(function () {
            var root = document.getElementById(cardId);
            if (!root) return;
            var closeButton = root.querySelector('.ai-sales-debt-close');

            function closeDetail() {
                root.hidden = true;
                var sourceButton = document.querySelector('[data-debt-customer="' + String(customerId ?? '').replace(/"/g, '\\"') + '"]');
                if (sourceButton) sourceButton.focus();
            }
            if (closeButton) closeButton.addEventListener('click', closeDetail);
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
                var keyword = input.value.trim();
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
                var keyword = input.value.trim();
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
    ApiChatbot.registerRenderer('TICH_LUY', _renderTichLuy);
    ApiChatbot.registerRenderer('METRIC_CARD', _renderMetricCard);
    ApiChatbot.registerRenderer('ALERT_CARD', _renderAlertCard);
    ApiChatbot.registerRenderer('BAR_CHART', _renderBarChart);

    console.log('[Medstand Renderers] Đã đăng ký: CONG_NO, TICH_LUY, METRIC_CARD, ALERT_CARD, BAR_CHART');
})();
