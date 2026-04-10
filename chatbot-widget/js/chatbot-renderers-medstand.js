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
        var tongNo    = safeRows.length > 0 ? (Number(h.pickValue(safeRows[0], 'MONEY')) || 0) : 0;
        var tongHD    = safeRows.length > 0 ? (Number(h.pickValue(safeRows[0], 'COUNT') || safeRows.length)) : 0;
        var phatSinhDuong = 0, phatSinhAm = 0, hasReturn = false;

        var cardId = 'congno-' + h.nextId() + '-' + Date.now();

        safeRows.forEach(function (r) {
            var tien = Number(h.pickValue(r, 'MONEY') || 0);
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
            var tien     = Number(h.pickValue(r, 'MONEY') || 0);
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

    // ── Đăng ký vào hệ thống ─────────────────────────────────────
    ApiChatbot.registerRenderer('CONG_NO',  _renderCongNoChiTiet);
    ApiChatbot.registerRenderer('TICH_LUY', _renderTichLuy);

    console.log('[Medstand Renderers] Đã đăng ký: CONG_NO, TICH_LUY');
})();
