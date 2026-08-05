/**
 * CORE-009 — Conversational order draft (Pilot).
 *
 * Draft data is deliberately non-authoritative: it stores only the verified
 * customer id plus product ids and requested quantities. Price, promotion,
 * stock and warehouse are always hydrated again by the existing order preview
 * and CORE-005 SQL flow.
 */
(function (root, factory) {
    'use strict';

    var exported = factory();
    if (typeof module !== 'undefined' && module.exports) module.exports = exported;
    if (root) {
        var manager = exported.createManager();
        manager.createManager = exported.createManager;
        root.MedstandOrderDraft = manager;
    }
})(typeof window !== 'undefined' ? window : globalThis, function () {
    'use strict';

    var SCHEMA_VERSION = 1;
    var DEFAULT_TTL_MS = 30 * 60 * 1000;
    var STORAGE_PREFIX = 'medstand_order_draft_v1_';

    function memoryStorage() {
        var values = {};
        return {
            getItem: function (key) { return Object.prototype.hasOwnProperty.call(values, key) ? values[key] : null; },
            setItem: function (key, value) { values[key] = String(value); },
            removeItem: function (key) { delete values[key]; }
        };
    }

    function fold(value) {
        return String(value || '').toLowerCase().normalize('NFD')
            .replace(/[\u0300-\u036f]/g, '')
            .replace(/đ/g, 'd')
            .replace(/[^a-z0-9]+/g, ' ')
            .replace(/\s+/g, ' ')
            .trim();
    }

    function escapeAttribute(value) {
        return String(value == null ? '' : value)
            .replace(/&/g, '&amp;')
            .replace(/"/g, '&quot;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;');
    }

    function safeKey(value) {
        return String(value || '').toLowerCase().replace(/[^a-z0-9_.-]/g, '_').slice(0, 100);
    }

    function createManager(initialOptions) {
        var options = initialOptions || {};
        var storage = options.storage || (typeof sessionStorage !== 'undefined' ? sessionStorage : memoryStorage());
        var now = options.now || function () { return Date.now(); };
        var getUserId = options.getUserId || function () { return ''; };
        var getConversationId = options.getConversationId || function () { return ''; };
        var ttlMs = Number(options.ttlMs) > 0 ? Number(options.ttlMs) : DEFAULT_TTL_MS;
        var recommendations = [];

        function configure(nextOptions) {
            nextOptions = nextOptions || {};
            if (nextOptions.storage) storage = nextOptions.storage;
            if (nextOptions.now) now = nextOptions.now;
            if (nextOptions.getUserId) getUserId = nextOptions.getUserId;
            if (nextOptions.getConversationId) getConversationId = nextOptions.getConversationId;
            if (Number(nextOptions.ttlMs) > 0) ttlMs = Number(nextOptions.ttlMs);
            return api;
        }

        function identity() {
            return {
                userId: String(getUserId() || '').trim(),
                conversationId: String(getConversationId() || '').trim()
            };
        }

        function keyForCurrentIdentity() {
            var current = identity();
            if (!current.userId || !current.conversationId) return '';
            return STORAGE_PREFIX + safeKey(current.userId) + '_' + safeKey(current.conversationId);
        }

        function newId(prefix) {
            return prefix + '-' + new Date(now()).toISOString().replace(/[-:TZ.]/g, '').slice(0, 14)
                + '-' + Math.random().toString(36).slice(2, 8).toUpperCase();
        }

        function loadDraft() {
            var key = keyForCurrentIdentity();
            if (!key) return null;
            var raw = storage.getItem(key);
            if (!raw) return null;
            try {
                var draft = JSON.parse(raw);
                var current = identity();
                if (!draft || draft.schemaVersion !== SCHEMA_VERSION
                    || draft.userId !== current.userId
                    || draft.conversationId !== current.conversationId
                    || Number(draft.expiresAt || 0) <= now()) {
                    storage.removeItem(key);
                    return null;
                }
                return draft;
            } catch (_) {
                storage.removeItem(key);
                return null;
            }
        }

        function saveDraft(draft) {
            var key = keyForCurrentIdentity();
            if (!key || !draft) return null;
            draft.updatedAt = now();
            draft.expiresAt = draft.updatedAt + ttlMs;
            storage.setItem(key, JSON.stringify(draft));
            return draft;
        }

        function clearDraft() {
            var key = keyForCurrentIdentity();
            if (key) storage.removeItem(key);
            return null;
        }

        function createDraft(customerId, customerName) {
            var current = identity();
            return {
                schemaVersion: SCHEMA_VERSION,
                draftId: newId('DRF'),
                requestId: '',
                userId: current.userId,
                conversationId: current.conversationId,
                customerId: String(customerId || '').trim(),
                customerName: String(customerName || '').trim(),
                items: [],
                draftVersion: 0,
                status: 'EDITING',
                pricingSnapshot: null,
                createdAt: now(),
                updatedAt: now(),
                expiresAt: now() + ttlMs,
                lastCommand: null
            };
        }

        function normalizeRecommendation(row, index) {
            row = row || {};
            var available = row.availableStock !== undefined
                ? row.availableStock
                : (row.AvailableStock !== undefined ? row.AvailableStock : row.TonKhaDung);
            available = available === null || available === undefined || available === '' ? null : Number(available);
            return {
                index: index + 1,
                customerId: String(row.customerId || row.MaKhachHang || row.CustomerID || row.ObjectID || '').trim(),
                customerName: String(row.customerName || row.TenKhachHang || row.CustomerName || row.ObjectName || '').trim(),
                itemId: String(row.itemId || row.MaSanPham || row.ItemID || row.MaSP || '').trim(),
                itemName: String(row.itemName || row.TenSanPham || row.ItemName || row.SanPham || '').trim(),
                unit: String(row.unit || row.Unit || row.DVT || row.DonViTinh || '').trim(),
                availableStock: Number.isFinite(available) ? available : null,
                storeHouseId: String(row.storeHouseId || row.StoreHouseID || '').trim()
            };
        }

        function setRecommendations(rows) {
            recommendations = (Array.isArray(rows) ? rows : []).map(normalizeRecommendation).filter(function (row) {
                return row.customerId && row.itemId;
            });
            return recommendations.slice();
        }

        function findMatches(reference, sourceRows) {
            var query = fold(reference);
            if (!query) return [];
            var rows = sourceRows || recommendations;
            var exact = rows.filter(function (row) {
                return fold(row.itemId) === query || fold(row.itemName) === query;
            });
            if (exact.length) return exact;
            return rows.filter(function (row) {
                return fold(row.itemId).indexOf(query) !== -1 || fold(row.itemName).indexOf(query) !== -1;
            });
        }

        function resolveRecommendation(reference) {
            var indexMatch = String(reference || '').match(/^#?(\d+)$/);
            if (indexMatch) {
                var index = Number(indexMatch[1]);
                return recommendations[index - 1]
                    ? { item: recommendations[index - 1] }
                    : { error: 'Không có sản phẩm gợi ý số ' + index + '. Vui lòng chọn lại từ danh sách đang hiển thị.' };
            }
            var matches = findMatches(reference, recommendations);
            if (matches.length === 1) return { item: matches[0] };
            if (matches.length > 1) {
                return { error: 'Tên “' + reference + '” khớp nhiều sản phẩm: '
                    + matches.slice(0, 4).map(function (row) { return row.itemName + ' (' + row.itemId + ')'; }).join(', ')
                    + '. Vui lòng nói rõ mã hoặc số thứ tự.' };
            }
            return { error: 'Không tìm thấy “' + reference + '” trong danh sách gợi ý hiện tại.' };
        }

        function resolveDraftItem(draft, reference) {
            var rows = (draft.items || []).map(function (item, index) {
                return Object.assign({ index: index + 1 }, item);
            });
            var indexMatch = String(reference || '').match(/^#?(\d+)$/);
            if (indexMatch) {
                var index = Number(indexMatch[1]);
                return rows[index - 1]
                    ? { item: rows[index - 1] }
                    : { error: 'Đơn nháp không có sản phẩm số ' + index + '.' };
            }
            var matches = findMatches(reference, rows);
            if (matches.length === 1) return { item: matches[0] };
            if (matches.length > 1) return { error: 'Có nhiều sản phẩm gần giống “' + reference + '”. Vui lòng dùng mã sản phẩm.' };
            return { error: 'Không tìm thấy “' + reference + '” trong đơn nháp.' };
        }

        function validateQuantity(quantity, recommendation) {
            var value = Number(quantity);
            if (!Number.isInteger(value) || value <= 0) return 'Số lượng phải là số nguyên lớn hơn 0.';
            if (recommendation && recommendation.availableStock !== null && value > recommendation.availableStock) {
                return 'Số lượng ' + value + ' vượt tồn khả dụng đang hiển thị (' + recommendation.availableStock
                    + '). Vui lòng chọn số lượng khác; hệ thống sẽ kiểm tra lại tồn khi preview.';
            }
            return '';
        }

        function commandFingerprint(command) {
            return JSON.stringify({
                command: command.command,
                customerId: command.customerId || '',
                itemId: command.itemId || '',
                reference: command.reference || '',
                quantity: command.quantity,
                items: command.items || []
            });
        }

        function result(ok, code, message, draft, extra) {
            return Object.assign({
                handled: true,
                ok: ok,
                code: code,
                message: message,
                draft: draft || null,
                requestId: draft && draft.requestId || ''
            }, extra || {});
        }

        function draftSummary(draft, heading) {
            if (!draft || !draft.items || !draft.items.length) return 'Đơn nháp hiện chưa có sản phẩm.';
            var lines = [heading || 'Đơn nháp hiện tại', 'Khách hàng: **' + (draft.customerName || draft.customerId) + '** (`' + draft.customerId + '`)'];
            draft.items.forEach(function (item, index) {
                lines.push((index + 1) + '. ' + item.itemName + ' (`' + item.itemId + '`): **' + item.quantity + (item.unit ? ' ' + item.unit : '') + '**');
            });
            lines.push('Phiên bản draft: **' + draft.draftVersion + '**. Giá, khuyến mãi và tồn sẽ được lấy lại từ SQL khi preview.');
            return lines.join('\n');
        }

        function applyCommand(command) {
            command = command || {};
            var requestId = command.requestId || newId('REQ');
            var draft = loadDraft();
            var fingerprint = commandFingerprint(command);

            if (draft && draft.lastCommand && draft.lastCommand.fingerprint === fingerprint
                && now() - Number(draft.lastCommand.at || 0) < 3000) {
                return result(true, 'DUPLICATE_REPLAY', 'Yêu cầu này vừa được xử lý; đơn nháp không bị thêm trùng.', draft, { duplicate: true });
            }

            if (command.command === 'CANCEL_DRAFT') {
                if (!draft) return result(false, 'NO_DRAFT', 'Hiện không có đơn nháp để hủy.', null);
                clearDraft();
                return result(true, 'DRAFT_CANCELLED', 'Đã hủy đơn nháp `' + draft.draftId + '`. Không có đơn nào được ghi vào ERP.', null, { requestId: requestId });
            }

            if (command.command === 'SHOW_DRAFT') {
                if (!draft) return result(false, 'NO_DRAFT', 'Hiện chưa có đơn nháp. Hãy chọn sản phẩm từ danh sách gợi ý trước.', null);
                return result(true, 'DRAFT_SHOWN', draftSummary(draft), draft);
            }

            if (command.command === 'REQUEST_PREVIEW' || command.command === 'HANDOFF_FOR_CONFIRMATION') {
                if (!draft || !draft.items || !draft.items.length) {
                    return result(false, 'NO_DRAFT_ITEMS', 'Đơn nháp chưa có sản phẩm nên chưa thể mở preview.', draft);
                }
                draft.requestId = requestId;
                draft.status = 'PREVIEW_READY';
                draft.lastCommand = { fingerprint: fingerprint, at: now(), requestId: requestId };
                saveDraft(draft);
                return result(true, 'PREVIEW_READY', draftSummary(draft, 'Đã chuẩn bị dữ liệu để kiểm tra preview'), draft, {
                    action: 'OPEN_PREVIEW',
                    pendingUpdate: toOrderPending(draft)
                });
            }

            if (command.command === 'ADD_ITEM') {
                var additions = Array.isArray(command.items) && command.items.length ? command.items : [command];
                var resolvedAdditions = [];
                for (var additionIndex = 0; additionIndex < additions.length; additionIndex++) {
                    var addition = additions[additionIndex];
                    var resolved = addition.itemId && addition.customerId
                        ? { item: normalizeRecommendation(addition, 0) }
                        : resolveRecommendation(addition.reference || addition.itemId || '');
                    if (resolved.error) return result(false, 'NEEDS_CLARIFICATION', resolved.error, draft, { needsClarification: true });
                    var quantityError = validateQuantity(addition.quantity, resolved.item);
                    if (quantityError) return result(false, 'INVALID_QUANTITY', quantityError, draft, { needsClarification: true });
                    resolvedAdditions.push({ recommendation: resolved.item, quantity: Number(addition.quantity) });
                }

                var first = resolvedAdditions[0].recommendation;
                if (!draft) draft = createDraft(first.customerId, first.customerName);
                if (draft.customerId !== first.customerId || resolvedAdditions.some(function (entry) { return entry.recommendation.customerId !== draft.customerId; })) {
                    return result(false, 'CUSTOMER_CONTEXT_CONFLICT', 'Đơn nháp hiện tại thuộc khách '
                        + (draft.customerName || draft.customerId) + ' (`' + draft.customerId
                        + '`). Hãy hủy đơn nháp trước khi chuyển sang khách khác.', draft, { needsClarification: true });
                }

                resolvedAdditions.forEach(function (entry) {
                    var recommendation = entry.recommendation;
                    var existing = draft.items.find(function (item) { return item.itemId === recommendation.itemId; });
                    var nextItem = {
                        itemId: recommendation.itemId,
                        itemName: recommendation.itemName || recommendation.itemId,
                        quantity: entry.quantity,
                        unit: recommendation.unit || '',
                        suggestionAvailableStock: recommendation.availableStock,
                        suggestionStoreHouseId: recommendation.storeHouseId || ''
                    };
                    if (existing) Object.assign(existing, nextItem);
                    else draft.items.push(nextItem);
                });
                draft.draftVersion += 1;
                draft.status = 'EDITING';
                draft.pricingSnapshot = null;
                draft.requestId = requestId;
                draft.lastCommand = { fingerprint: fingerprint, at: now(), requestId: requestId };
                saveDraft(draft);
                return result(true, 'ITEM_ADDED', draftSummary(draft, 'Đã cập nhật đơn nháp'), draft);
            }

            if (!draft) return result(false, 'NO_DRAFT', 'Hiện chưa có đơn nháp. Hãy chọn sản phẩm từ danh sách gợi ý trước.', null);

            if (command.command === 'UPDATE_QUANTITY') {
                var updateResolved = resolveDraftItem(draft, command.reference || command.itemId || '');
                if (updateResolved.error) return result(false, 'NEEDS_CLARIFICATION', updateResolved.error, draft, { needsClarification: true });
                var matchingRecommendation = recommendations.find(function (row) { return row.itemId === updateResolved.item.itemId; });
                var updateError = validateQuantity(command.quantity, matchingRecommendation);
                if (updateError) return result(false, 'INVALID_QUANTITY', updateError, draft, { needsClarification: true });
                var actualItem = draft.items.find(function (item) { return item.itemId === updateResolved.item.itemId; });
                if (!actualItem) return result(false, 'NO_DRAFT_ITEM', 'Không tìm thấy sản phẩm cần đổi trong đơn nháp.', draft);
                actualItem.quantity = Number(command.quantity);
                draft.draftVersion += 1;
                draft.status = 'EDITING';
                draft.pricingSnapshot = null;
                draft.requestId = requestId;
                draft.lastCommand = { fingerprint: fingerprint, at: now(), requestId: requestId };
                saveDraft(draft);
                return result(true, 'QUANTITY_UPDATED', draftSummary(draft, 'Đã đổi số lượng'), draft);
            }

            if (command.command === 'REMOVE_ITEM') {
                var removeResolved = resolveDraftItem(draft, command.reference || command.itemId || '');
                if (removeResolved.error) return result(false, 'NEEDS_CLARIFICATION', removeResolved.error, draft, { needsClarification: true });
                draft.items = draft.items.filter(function (item) { return item.itemId !== removeResolved.item.itemId; });
                draft.draftVersion += 1;
                draft.status = 'EDITING';
                draft.pricingSnapshot = null;
                draft.requestId = requestId;
                draft.lastCommand = { fingerprint: fingerprint, at: now(), requestId: requestId };
                saveDraft(draft);
                return result(true, 'ITEM_REMOVED', draft.items.length
                    ? draftSummary(draft, 'Đã bỏ ' + removeResolved.item.itemName)
                    : 'Đã bỏ sản phẩm cuối cùng. Đơn nháp hiện đang trống.', draft);
            }

            return { handled: false };
        }

        function ordinalToNumber(text) {
            var words = { 'nhat': 1, 'mot': 1, 'hai': 2, 'ba': 3, 'tu': 4, 'bon': 4, 'nam': 5, 'sau': 6, 'bay': 7, 'tam': 8, 'chin': 9, 'muoi': 10 };
            return String(text || '').replace(/san pham thu (nhat|mot|hai|ba|tu|bon|nam|sau|bay|tam|chin|muoi)/g, function (_, word) {
                return 'san pham ' + words[word];
            });
        }

        function parseReferenceAndQuantity(normalized, actionWords) {
            var withoutAction = normalized.replace(actionWords, '').trim();
            var indexMatch = withoutAction.match(/(?:san pham|sp)\s*(\d+)(?:\s*(?:so luong|sl|x)\s*(-?\d+)|\s+(-?\d+)\s*(?:hop|chai|vi|ong|goi|vien|lo|thung|cai)?)?/);
            if (indexMatch) {
                return { reference: indexMatch[1], quantity: indexMatch[2] !== undefined ? Number(indexMatch[2]) : (indexMatch[3] !== undefined ? Number(indexMatch[3]) : null) };
            }
            var quantityMatch = withoutAction.match(/(?:so luong|sl|x|thanh)\s*(-?\d+)\b/)
                || withoutAction.match(/\s(-?\d+)\s*(?:hop|chai|vi|ong|goi|vien|lo|thung|cai)\s*$/);
            var quantity = quantityMatch ? Number(quantityMatch[1]) : null;
            var reference = withoutAction;
            if (quantityMatch) reference = reference.replace(quantityMatch[0], ' ').trim();
            return { reference: reference.replace(/\b(?:so luong|sl)\b/g, '').trim(), quantity: quantity };
        }

        function handleText(text) {
            var normalized = ordinalToNumber(fold(text));
            if (!normalized) return { handled: false };
            var draft = loadDraft();
            var hasDraft = Boolean(draft);
            var hasRecommendationContext = recommendations.length > 0;

            if (/^(huy|xoa|bo)\s+don nhap(\s+nay)?$/.test(normalized)
                || (hasDraft && /^(huy|xoa|bo)\s+don(\s+nay)?$/.test(normalized))) {
                return applyCommand({ command: 'CANCEL_DRAFT' });
            }
            if (hasDraft && (/^(xem|cho.*xem|mo)\s+(lai\s+)?(preview|ban xem truoc|don)(\s+nhap)?$/.test(normalized)
                || /^(kiem tra|tinh)\s+(gia|don)/.test(normalized)
                || /^(xac nhan|chot|tao)\s+(tao\s+)?don/.test(normalized))) {
                return applyCommand({ command: 'REQUEST_PREVIEW' });
            }
            if (/^(don nhap hien tai|xem noi dung don nhap)$/.test(normalized)) {
                return applyCommand({ command: 'SHOW_DRAFT' });
            }

            var multiMatches = [];
            if ((hasDraft || hasRecommendationContext) && /^(them|lay|chon|mua|dat)\b/.test(normalized)) {
                var multiRegex = /(?:san pham|sp)\s*(\d+)\s*(?:(?:so luong|sl|x)\s*(-?\d+)|\s+(-?\d+)\s*(?:hop|chai|vi|ong|goi|vien|lo|thung|cai)?)/g;
                var match;
                while ((match = multiRegex.exec(normalized)) !== null) {
                    multiMatches.push({ reference: match[1], quantity: Number(match[2] !== undefined ? match[2] : match[3]) });
                }
                if (multiMatches.length > 1) return applyCommand({ command: 'ADD_ITEM', items: multiMatches });
            }

            if ((hasDraft || hasRecommendationContext) && /^(them|lay|chon|mua|dat)\b/.test(normalized)) {
                var addParsed = parseReferenceAndQuantity(normalized, /^(them|lay|chon|mua|dat)\s+/);
                if (addParsed.quantity === null) {
                    return result(false, 'NEEDS_CLARIFICATION', 'Bạn muốn lấy “' + (addParsed.reference || 'sản phẩm này') + '” số lượng bao nhiêu?', draft, { needsClarification: true });
                }
                return applyCommand({ command: 'ADD_ITEM', reference: addParsed.reference, quantity: addParsed.quantity });
            }

            if (hasDraft && /^(doi|sua|cap nhat)\b/.test(normalized)) {
                var updateParsed = parseReferenceAndQuantity(normalized, /^(doi|sua|cap nhat)\s+/);
                if (updateParsed.quantity === null) {
                    return result(false, 'NEEDS_CLARIFICATION', 'Bạn muốn đổi sản phẩm nào và thành số lượng bao nhiêu?', draft, { needsClarification: true });
                }
                if (!updateParsed.reference) {
                    return result(false, 'NEEDS_CLARIFICATION', 'Bạn muốn đổi sản phẩm nào thành ' + updateParsed.quantity + '?', draft, { needsClarification: true });
                }
                return applyCommand({ command: 'UPDATE_QUANTITY', reference: updateParsed.reference, quantity: updateParsed.quantity });
            }

            if (hasDraft && /^(bo|xoa)\b/.test(normalized)) {
                var reference = normalized.replace(/^(bo|xoa)\s+/, '').trim();
                if (!reference) return result(false, 'NEEDS_CLARIFICATION', 'Bạn muốn bỏ sản phẩm nào?', draft, { needsClarification: true });
                return applyCommand({ command: 'REMOVE_ITEM', reference: reference.replace(/^(san pham|sp)\s*/, '') });
            }

            return { handled: false };
        }

        function toOrderPending(draft) {
            draft = draft || loadDraft();
            if (!draft) return null;
            return {
                params: {
                    '@MaKhachHang': draft.customerId,
                    '@ObjectID': draft.customerId
                },
                items: (draft.items || []).map(function (item) {
                    return {
                        ItemID: item.itemId,
                        keyword: item.itemId,
                        Quantity: item.quantity,
                        qty: item.quantity
                    };
                }),
                draftId: draft.draftId,
                draftVersion: draft.draftVersion,
                previewOnly: true
            };
        }

        function addSuggestion(input) {
            input = input || {};
            return applyCommand({
                command: 'ADD_ITEM',
                customerId: input.customerId,
                customerName: input.customerName,
                itemId: input.itemId,
                itemName: input.itemName,
                unit: input.unit,
                availableStock: input.availableStock,
                storeHouseId: input.storeHouseId,
                quantity: input.quantity
            });
        }

        function markHandedOff() {
            var draft = loadDraft();
            if (!draft) return null;
            draft.status = 'HANDED_OFF_FOR_CONFIRMATION';
            return saveDraft(draft);
        }

        function markCreated(documentId) {
            var draft = loadDraft();
            if (!draft) return null;
            var resultValue = { draftId: draft.draftId, documentId: String(documentId || ''), status: 'CREATED' };
            clearDraft();
            return resultValue;
        }

        function renderSuggestionAction(row) {
            var suggestion = normalizeRecommendation(row, 0);
            var suggestionIndex = recommendations.findIndex(function (candidate) {
                return candidate.customerId === suggestion.customerId && candidate.itemId === suggestion.itemId;
            }) + 1;
            var disabled = !suggestion.customerId || !suggestion.itemId || suggestion.availableStock === 0;
            var max = suggestion.availableStock !== null ? ' max="' + escapeAttribute(suggestion.availableStock) + '"' : '';
            return '<div class="ai-order-draft-action"'
                + ' data-customer-id="' + escapeAttribute(suggestion.customerId) + '"'
                + ' data-customer-name="' + escapeAttribute(suggestion.customerName) + '"'
                + ' data-item-id="' + escapeAttribute(suggestion.itemId) + '"'
                + ' data-item-name="' + escapeAttribute(suggestion.itemName) + '"'
                + ' data-unit="' + escapeAttribute(suggestion.unit) + '"'
                + ' data-available-stock="' + escapeAttribute(suggestion.availableStock === null ? '' : suggestion.availableStock) + '"'
                + ' data-store-house-id="' + escapeAttribute(suggestion.storeHouseId) + '">'
                + (suggestionIndex > 0 ? '<span class="ai-order-draft-index">Gợi ý #' + suggestionIndex
                    + ' · Có thể nói “Lấy sản phẩm ' + suggestionIndex + ' số lượng …”</span>' : '')
                + '<label><span>Số lượng</span><input class="ai-order-draft-qty" type="number" min="1" step="1" value="1"' + max + (disabled ? ' disabled' : '') + '></label>'
                + '<button type="button" class="ai-order-draft-add-btn"' + (disabled ? ' disabled' : '') + '>Thêm vào đơn nháp</button>'
                + '<small>Chỉ cập nhật đơn nháp. Giá, CTBH và tồn sẽ được SQL kiểm tra lại khi preview.</small>'
                + '</div>';
        }

        var api = {
            configure: configure,
            setRecommendations: setRecommendations,
            getRecommendations: function () { return recommendations.slice(); },
            getDraft: loadDraft,
            clearDraft: clearDraft,
            applyCommand: applyCommand,
            handleText: handleText,
            addSuggestion: addSuggestion,
            toOrderPending: toOrderPending,
            markHandedOff: markHandedOff,
            markCreated: markCreated,
            renderSuggestionAction: renderSuggestionAction,
            fold: fold
        };
        return api;
    }

    return { createManager: createManager };
});
