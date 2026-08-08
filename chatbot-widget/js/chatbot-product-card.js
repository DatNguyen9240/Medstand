(function () {
    'use strict';

    function esc(value) {
        return String(value == null ? '' : value).replace(/&/g, '&amp;').replace(/</g, '&lt;')
            .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    }

    function normalizeKey(value) {
        return String(value || '').toLowerCase().normalize('NFD')
            .replace(/[\u0300-\u036f]/g, '').replace(/đ/g, 'd').replace(/[^a-z0-9]+/g, '');
    }

    function pick(row, aliases) {
        var keys = Object.keys(row || {});
        var wanted = aliases.map(normalizeKey);
        for (var i = 0; i < keys.length; i++) {
            if (wanted.indexOf(normalizeKey(keys[i])) < 0) continue;
            var value = row[keys[i]];
            if (value !== undefined && value !== null && String(value).trim() !== '') return value;
        }
        return '';
    }

    function number(value) {
        if (value === undefined || value === null || String(value).trim() === '') return null;
        var parsed = Number(String(value == null ? '' : value).replace(/,/g, ''));
        return Number.isFinite(parsed) ? parsed : null;
    }

    function formatNumber(value) {
        var parsed = number(value);
        return parsed === null ? '—' : new Intl.NumberFormat('vi-VN', { maximumFractionDigits: 2 }).format(parsed);
    }

    function formatMoney(value) {
        var parsed = number(value);
        return parsed === null ? 'Chưa có giá' : new Intl.NumberFormat('vi-VN').format(parsed) + 'đ';
    }

    function formatDate(value) {
        var text = String(value || '').trim();
        if (!text) return '';
        var iso = text.match(/^(\d{4})-(\d{2})-(\d{2})(?:[T\s](\d{2}):(\d{2}))?/);
        return iso ? iso[3] + '/' + iso[2] + '/' + iso[1] + (iso[4] ? ' ' + iso[4] + ':' + iso[5] : '') : text;
    }

    function shortText(value, maxLength) {
        var text = String(value || '').replace(/\s+/g, ' ').trim();
        return text.length <= maxLength ? text : text.slice(0, maxLength).replace(/\s+\S*$/, '') + '…';
    }

    function currentUserPermissions() {
        try {
            var raw = localStorage.getItem('auth_user') || localStorage.getItem('currentUser') || '{}';
            var user = JSON.parse(raw);
            var roleText = [user.role, user.Role, user.roleName, user.RoleName, user.roleCode, user.RoleCode,
                user.UserRoleName, user.GroupName, user.UserGroupName, user.UserGroupID]
                .filter(Boolean).join(' ').toLowerCase().normalize('NFD')
                .replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, ' ').trim();
            var canSeeTechnical = Number(user.Admin || user.IsAdmin || user.isAdmin || 0) === 1
                || /(^|\s)(admin|administrator|qa|quality|it|cntt|sysadmin)(\s|$)/.test(roleText)
                || roleText.indexOf('quan tri vien') >= 0;
            var isManager = /(^|\s)(manager|quan ly|ql)(\s|$)/.test(roleText)
                || Number(user.Manager || user.manager || user.IsManager || user.isManager || 0) === 1
                || (user.EmployeeID && user.ManagerID && String(user.EmployeeID) === String(user.ManagerID));
            return { showProductInfo: canSeeTechnical || !isManager, showTechnical: canSeeTechnical };
        } catch (error) {
            return { showProductInfo: true, showTechnical: false };
        }
    }

    function getStatus(row, available) {
        var raw = String(pick(row, ['StockDataStatus', 'Trạng thái dữ liệu tồn kho']) || '').toUpperCase();
        if (available === null && !raw) return { label: 'Chưa xác định', css: 'is-unknown' };
        if ((available !== null && available <= 0) || /NO_SELLABLE_STOCK|RESERVED_OUT|OUT_OF_STOCK/.test(raw)) {
            return { label: 'Hết hàng', css: 'is-out' };
        }
        if (/LOW_STOCK|NEAR_OUT/.test(raw) || (available !== null && available > 0 && available <= 10)) {
            return { label: 'Sắp hết', css: 'is-low' };
        }
        return { label: 'Còn hàng', css: 'is-ready' };
    }

    function infoBlock(label, value) {
        return value ? '<div class="ai-product-info-block"><span>' + esc(label) + '</span><p>' + esc(value) + '</p></div>' : '';
    }

    function detailRow(label, value) {
        if (value === undefined || value === null || String(value).trim() === '') return '';
        return '<div><dt>' + esc(label) + '</dt><dd>' + esc(value) + '</dd></div>';
    }

    function renderProduct(row, permissions) {
        var itemId = pick(row, ['ItemID', 'Mã sp', 'Mã SP', 'MaSP', 'MaDanhMuc']) || '—';
        var itemName = pick(row, ['ItemName', 'Sản Phẩm', 'TenSanPham', 'Name']) || 'Sản phẩm';
        var price = pick(row, ['UnitPrice', 'Đơn Giá', 'DonGia', 'Price']);
        var physical = number(pick(row, ['PhysicalStock', 'Tồn ERP', 'TonERP', 'TonKho']));
        var reserved = number(pick(row, ['ReservedStock', 'Đã giữ cho đơn mở', 'DaGiuChoDonMo']));
        var available = number(pick(row, ['AvailableStock', 'Tồn khả dụng', 'TonKhaDung']));
        var storeId = pick(row, ['StoreHouseID', 'Mã kho', 'MaKho']);
        var storeName = pick(row, ['StoreHouseName', 'Tên kho', 'TenKho']) || storeId || '—';
        var updatedAt = pick(row, ['StockUpdatedAt', 'Cập nhật tồn kho lúc', 'CapNhatTonKhoLuc']);
        var asOfAt = pick(row, ['StockAsOfAt', 'Tồn được tính tại', 'TonDuocTinhTai']);
        var status = getStatus(row, available);
        var ingredients = pick(row, ['Ingredients', 'Thành Phần', 'ThanhPhan']);
        var uses = pick(row, ['MainUses', 'Công Dụng', 'CongDung']);
        var target = pick(row, ['TargetPatients', 'Đối Tượng', 'DoiTuong']);
        var usage = pick(row, ['UsageInstructions', 'Cách Dùng', 'CachDung']);
        var contraindications = pick(row, ['Contraindications', 'Chống Chỉ Định', 'ChongChiDinh']);
        var sideEffects = pick(row, ['SideEffects', 'Tác Dụng Phụ', 'TacDungPhu']);
        var recommendation = pick(row, ['RecommendationStatus', 'Trạng Thái Khuyến Nghị', 'TrangThaiKhuyenNghi']);
        var disclaimer = pick(row, ['MedicalDisclaimer', 'Cảnh Báo Chuyên Môn', 'CanhBaoChuyenMon']);
        var hasDetails = ingredients || usage || contraindications || sideEffects || recommendation || disclaimer;

        var html = '<article class="ai-product-card">'
            + '<header class="ai-product-card-head"><div class="ai-product-identity"><span class="ai-product-code">' + esc(itemId) + '</span><h3>' + esc(itemName) + '</h3></div>'
            + '<div class="ai-product-price"><strong>' + esc(formatMoney(price)) + '</strong><span class="ai-product-status ' + status.css + '">' + status.label + '</span></div></header>'
            + '<div class="ai-product-stock-grid"><div><span>Tồn ERP</span><strong>' + esc(formatNumber(physical)) + '</strong></div>'
            + '<div><span>Đã giữ</span><strong>' + esc(formatNumber(reserved)) + '</strong></div>'
            + '<div class="is-primary"><span>Có thể bán</span><strong>' + esc(formatNumber(available)) + '</strong></div>'
            + '<div><span>Kho xuất</span><strong>' + esc(storeName) + '</strong></div></div>'
            + '<div class="ai-product-stock-time"><span>Cập nhật: <strong>' + esc(formatDate(updatedAt || asOfAt) || '—') + '</strong></span>'
            + (storeId && storeId !== storeName ? '<span>Mã kho: <strong>' + esc(storeId) + '</strong></span>' : '') + '</div>';

        if (permissions.showProductInfo && (uses || target)) {
            html += '<section class="ai-product-summary">' + infoBlock('Công dụng', shortText(uses, 190))
                + infoBlock('Đối tượng sử dụng', shortText(target, 190)) + '</section>';
        }
        if (permissions.showProductInfo && hasDetails) {
            html += '<details class="ai-product-details"><summary>Xem thành phần, cách dùng và cảnh báo</summary><dl>'
                + detailRow('Thành phần', ingredients) + detailRow('Cách dùng', usage)
                + detailRow('Chống chỉ định', contraindications) + detailRow('Tác dụng phụ', sideEffects)
                + detailRow('Khuyến nghị', recommendation) + detailRow('Cảnh báo chuyên môn', disclaimer) + '</dl></details>';
        }
        if (permissions.showTechnical) {
            html += '<details class="ai-product-technical"><summary>Xem dữ liệu kỹ thuật</summary><dl>'
                + detailRow('Phạm vi kho', pick(row, ['WarehouseScope', 'Phạm vi kho', 'PhamViKho']))
                + detailRow('Phát sinh kho mới nhất', formatDate(pick(row, ['LatestStockMovementDate', 'Phát sinh kho mới nhất'])))
                + detailRow('Phiên bản quy tắc sản phẩm', pick(row, ['RuleVersion', 'Phiên bản quy tắc']))
                + detailRow('Phiên bản quy tắc tồn', pick(row, ['StockRuleVersion']))
                + detailRow('Nguồn dữ liệu', pick(row, ['DataSource', 'Nguồn dữ liệu']))
                + detailRow('Nguồn dữ liệu tồn', pick(row, ['StockDataSource', 'Nguồn dữ liệu tồn']))
                + detailRow('Trạng thái dữ liệu tồn', pick(row, ['StockDataStatus', 'Trạng thái dữ liệu tồn kho'])) + '</dl></details>';
        }
        return html + '</article>';
    }

    function isProductLookup(apiCode, meta) {
        var code = String(apiCode || '').toLowerCase();
        if (code === '@tra_cuu_san_pham') return true;
        var params = meta && meta.queryParams || {};
        var type = String(params['@Type'] || params['@type'] || '').toLowerCase();
        return code === '@danh_muc' && type === 'sanpham'
            && String(params['@timkiem'] || params['@TimKiem'] || '').trim() !== '';
    }

    function looksLikeProductLookup(rows) {
        var row = Array.isArray(rows) && rows.length ? rows[0] : null;
        if (!row || typeof row !== 'object') return false;

        var normalizedKeys = Object.keys(row).map(normalizeKey);
        function hasAny(aliases) {
            return aliases.some(function (alias) {
                return normalizedKeys.indexOf(normalizeKey(alias)) >= 0;
            });
        }

        var hasIdentity = hasAny(['ItemID', 'MaSP', 'MaDanhMuc'])
            && hasAny(['ItemName', 'TenSanPham', 'SanPham', 'TenSP']);
        var stockSignals = [
            hasAny(['PhysicalStock', 'TonERP']),
            hasAny(['ReservedStock', 'DaGiuChoDonMo']),
            hasAny(['AvailableStock', 'TonKhaDung'])
        ].filter(Boolean).length;
        var hasProductDetail = hasAny([
            'Ingredients', 'ThanhPhan', 'MainUses', 'CongDung', 'TargetPatients',
            'DoiTuong', 'UsageInstructions', 'CachDung', 'StockDataSource',
            'WarehouseScope', 'StockDataStatus'
        ]);
        var dataSource = normalizeKey(pick(row, ['DataSource', 'NguonDuLieu']));

        return hasIdentity && stockSignals >= 2
            && (hasProductDetail || dataSource.indexOf('tracuusanpham') >= 0);
    }

    function renderProductLookup(rows) {
        var safeRows = Array.isArray(rows) ? rows.filter(Boolean) : [];
        if (!safeRows.length) return '<p class="ai-product-empty">Không tìm thấy sản phẩm phù hợp.</p>';
        var permissions = currentUserPermissions();
        return '<section class="ai-product-results"><header class="ai-product-results-head"><strong>Tìm thấy ' + safeRows.length + ' sản phẩm</strong></header>'
            + safeRows.map(function (row) { return renderProduct(row, permissions); }).join('') + '</section>';
    }

    var installedApi = null;
    var defaultRenderer = null;
    var defaultWrapper = null;
    var catalogRenderer = null;
    var catalogWrapper = null;
    function install() {
        if (!window.ApiChatbot || typeof window.ApiChatbot.registerRenderer !== 'function') return false;
        var api = window.ApiChatbot;
        var internal = api.__internal || {};

        if (installedApi !== api) {
            defaultRenderer = typeof internal.renderCardView === 'function' ? internal.renderCardView : null;
            defaultWrapper = defaultRenderer ? function (rows, headerMsg, apiCode, meta) {
                return isProductLookup(apiCode, meta) || looksLikeProductLookup(rows)
                    ? renderProductLookup(rows)
                    : defaultRenderer(rows, headerMsg, apiCode, meta);
            } : null;
            catalogRenderer = typeof internal.renderCatalogView === 'function'
                ? internal.renderCatalogView
                : defaultRenderer;
            catalogWrapper = catalogRenderer ? function (rows, headerMsg, apiCode, meta) {
                return isProductLookup(apiCode, meta) || looksLikeProductLookup(rows)
                    ? renderProductLookup(rows)
                    : catalogRenderer(rows, headerMsg, apiCode, meta);
            } : null;
            installedApi = api;
        }

        window.ApiChatbot.registerRenderer('PRODUCT_LOOKUP', renderProductLookup);
        if (defaultWrapper) window.ApiChatbot.registerRenderer('DEFAULT', defaultWrapper);
        if (catalogWrapper) window.ApiChatbot.registerRenderer('CATALOG', catalogWrapper);
        internal.renderProductLookup = renderProductLookup;
        document.documentElement.setAttribute('data-product-card-renderer', 'ready');
        return true;
    }

    window.MedstandProductCard = {
        install: install,
        isProductLookup: isProductLookup,
        looksLikeProductLookup: looksLikeProductLookup,
        render: renderProductLookup
    };
    install();
    var installTimer = setInterval(install, 500);
    if (installTimer && typeof installTimer.unref === 'function') installTimer.unref();
    window.addEventListener('hashchange', function () {
        setTimeout(install, 0);
        setTimeout(install, 300);
    });
})();
