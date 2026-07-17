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

    // ── Ngưỡng cảnh báo công nợ — đọc từ config, mặc định 50tr ──
    var DEBT_WARN_THRESHOLD = _cfg.DEBT_WARN_THRESHOLD || 50000000;

    // ── Keywords phát hiện hàng trả lại theo ngôn ngữ config ─────
    var RETURN_KEYWORDS = _cfg.RETURN_KEYWORDS || ['trả', 'lỗi', 'hỏng', 'return', 'refund'];

    // ════════════════════════════════════════════════════════════════
    //  RENDERER: CONG_NO — Báo cáo Công Nợ (tất cả field qua Role)
    // ════════════════════════════════════════════════════════════════
    function _renderCongNoChiTiet(rows, headerMsg, apiCode, meta) {
        var khCode    = (meta && meta.khCode) ? meta.khCode : '';
        var safeRows  = (rows && rows.length > 0) ? rows : [];
        if (!khCode && safeRows.length > 0) {
            khCode = h.pickValue(safeRows[0], 'CUSTOMER') || safeRows[0].ObjectID || safeRows[0].MaKH || safeRows[0].CustomerCode || '';
        }
        // TongTienNoThucTe is the balance of the whole debt report. Do not
        // derive it from the generic MONEY role because SoTien also has that
        // role and represents only one document.
        var tongNo    = safeRows.length > 0
            ? (Number(safeRows[0].TongTienNoThucTe != null
                ? safeRows[0].TongTienNoThucTe
                : h.pickValue(safeRows[0], 'MONEY')) || 0)
            : 0;
        var tongHD    = safeRows.length > 0 ? (Number(h.pickValue(safeRows[0], 'COUNT') || safeRows.length)) : 0;
        var phatSinhDuong = 0, phatSinhAm = 0, hasReturn = false;

        var cardId = 'congno-' + h.nextId() + '-' + Date.now();

        safeRows.forEach(function (r) {
            var tien = Number(r.SoTien != null ? r.SoTien : (h.pickValue(r, 'MONEY') || 0));
            if (tien > 0) phatSinhDuong += tien; else phatSinhAm += tien;
            var dien = String(h.pickValue(r, 'TITLE') || '').toLowerCase();
            if (tien < 0 && RETURN_KEYWORDS.some(function (kw) { return dien.indexOf(kw) >= 0; })) {
                hasReturn = true;
            }
        });

        // AI Insights — dựa trên logic thuần số, không hardcode văn bản vào engine
        var nhanXet      = tongNo > 0 ? 'Còn nợ' : (tongNo < 0 ? 'Công ty nợ lại' : 'Đã thanh toán hết');
        var statusIcon   = tongNo > 0 ? '⚠️' : '✅';
        var deXuatAI     = hasReturn
            ? (_cfg.MSG_DEBT_RETURN  || 'Có giao dịch trả hàng → Kiểm tra chất lượng sản phẩm trước khi giao.')
            : tongNo > DEBT_WARN_THRESHOLD
                ? (_cfg.MSG_DEBT_HIGH    || 'Công nợ vượt ngưỡng → Ưu tiên đôn đốc thu hồi trước khi xuất đơn mới.')
                : tongNo === 0
                    ? (_cfg.MSG_DEBT_ZERO    || 'Thanh toán đúng hạn → Đề xuất đẩy mạnh up-sale.')
                    : (_cfg.MSG_DEBT_NORMAL  || 'Giao dịch đều đặn → Duy trì chăm sóc khách hàng thường xuyên.');

        var html = '<div class="ai-sales-debt-card" id="' + h.esc(cardId) + '">';

        // Header
        html += '<div class="ai-sales-debt-header" id="hdr-' + h.esc(cardId) + '">';
        html += '<div class="ai-sales-debt-title">Đang xác định...</div>';
        html += '<div class="ai-sales-debt-inforow">Mã: <b>' + h.esc(khCode || 'N/A') + '</b></div>';
        html += '<div class="ai-sales-debt-inforow">Tổng nợ: <b class="' + (tongNo > 0 ? 'ai-sales-positive' : 'ai-sales-negative') + '">' + h.fmtCellVal(tongNo) + '</b></div>';
        html += '<div class="ai-sales-debt-inforow">Số HĐ: <b>' + tongHD + '</b></div>';
        html += '<div class="ai-sales-debt-conclusion">' + statusIcon + ' ' + h.esc(nhanXet) + '</div>';
        html += '</div>'; // header

        // Toggle list
        html += '<button class="ai-sales-toggle-btn" onclick="var e=document.getElementById(\'list-' + cardId + '\');if(e){e.style.display=e.style.display===\'none\'?\'block\':\'none\';}">📄 Xem / Ẩn chi tiết</button>';

        // Chi tiết từng dòng — dùng Roles
        html += '<div class="ai-sales-debt-list" id="list-' + h.esc(cardId) + '" style="display:none;">';
        safeRows.forEach(function (r) {
            var tien     = Number(r.SoTien != null ? r.SoTien : (h.pickValue(r, 'MONEY') || 0));
            var idVal    = h.pickValue(r, 'ID')    || '';
            var titleVal = h.pickValue(r, 'TITLE') || '';
            var dateVal  = h.pickValue(r, 'TREND') || '';
            html += '<div class="ai-sales-debt-item">';
            html += '<div class="ai-sales-debt-item-top">'
                +   '<span class="ai-sales-item-id">Mã: <b>' + h.esc(String(idVal)) + '</b></span>'
                +   '<span class="ai-sales-item-date">' + h.esc(String(dateVal)) + '</span>'
                + '</div>';
            html += '<div class="ai-sales-debt-item-middle">' + h.esc(String(titleVal)) + '</div>';
            html += '<div class="ai-sales-debt-item-bottom">'
                +   '<span class="ai-sales-item-amount ' + (tien > 0 ? 'ai-sales-positive' : 'ai-sales-negative') + '">' + h.fmtCellVal(tien) + '</span>'
                + '</div>';
            html += '<div class="ai-sales-item-actions" id="item-act-' + h.esc(cardId) + '-' + h.esc(String(idVal)) + '"></div>';
            html += '</div>';
        });
        html += '</div>';

        // AI Đề xuất
        html += '<div class="ai-sales-debt-ai-recommend">'
            +   '<div class="ai-recommend-title">💡 Đề Xuất AI</div>'
            +   '<div class="ai-recommend-text">' + h.esc(deXuatAI) + '</div>'
            + '</div>';

        // Tổng kết
        html += '<div class="ai-sales-debt-footer"><div class="ai-sales-debt-summary">';
        html += '<b>TỔNG KẾT:</b><br>';
        html += 'Phát sinh (+): <b>' + h.fmtCellVal(phatSinhDuong) + '</b><br>';
        html += 'Thanh toán/Trả (-): <b>' + h.fmtCellVal(Math.abs(phatSinhAm)) + '</b>';
        html += '</div>';

        // Action bar — sẽ được hydrate sau
        html += '<div class="ai-sales-action-bar" id="act-' + h.esc(cardId) + '">'
            +   '<button class="ai-sales-action-btn ai-sales-btn-disabled" disabled>Đang tải...</button>'
            + '</div>';
        html += '</div></div>'; // footer + card

        // Hydrate entity async qua n8n datasource
        setTimeout(function () {
            _hydrateEntity(khCode, function (entity) {
                var hdrEl = document.getElementById('hdr-' + cardId);
                var actEl = document.getElementById('act-' + cardId);
                var name  = entity ? entity.name  : (khCode || 'Khách hàng');
                var phone = entity ? entity.phone : null;

                if (hdrEl) hdrEl.querySelector('.ai-sales-debt-title').textContent = '👤 ' + name;
                if (actEl) {
                    if (phone && h.isValidPhone(phone)) {
                        actEl.innerHTML =
                            '<a class="ai-sales-action-btn ai-sales-btn-call" href="tel:' + h.esc(phone) + '">📞 Liên hệ</a>'
                            + '<a class="ai-sales-action-btn ai-sales-btn-zalo" href="https://zalo.me/' + h.esc(phone) + '" target="_blank" rel="noopener">💬 Zalo</a>';
                    } else {
                        actEl.innerHTML = '<button class="ai-sales-action-btn ai-sales-btn-disabled" disabled>📞 Không rõ SĐT</button>';
                    }
                }
            });
        }, 50);

        return html;
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
    ApiChatbot.registerRenderer('CONG_NO',  _renderCongNoChiTiet);
    ApiChatbot.registerRenderer('TICH_LUY', _renderTichLuy);
    ApiChatbot.registerRenderer('METRIC_CARD', _renderMetricCard);
    ApiChatbot.registerRenderer('ALERT_CARD', _renderAlertCard);
    ApiChatbot.registerRenderer('BAR_CHART', _renderBarChart);

    console.log('[Medstand Renderers] Đã đăng ký: CONG_NO, TICH_LUY, METRIC_CARD, ALERT_CARD, BAR_CHART');
})();
