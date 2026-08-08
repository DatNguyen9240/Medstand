(function () {
    'use strict';

    function normalizeProductLookupInput(input) {
        if (!input) return;

        var value = String(input.value || '');
        var isDirectLookup = /^#tra_cuu_san_pham\b/i.test(value);
        var isCatalogLookup = /^#danh_muc\b/i.test(value)
            && /@Type\s*=\s*sanpham\b/i.test(value);
        if (!isDirectLookup && !isCatalogLookup) return;

        var normalized = value
            .replace(/(@timkiem\s*=\s*)(?:tim\s*kiem|tìm\s*kiếm)\s*[:=]?\s+/i, '$1')
            .replace(/^(#tra_cuu_san_pham\b\s+)(?:tim\s*kiem|tìm\s*kiếm)\s*[:=]?\s+/i, '$1')
            .replace(/(@Type\s*=\s*sanpham\b\s+)(?:tim\s*kiem|tìm\s*kiếm)\s*[:=]?\s+/i, '$1');

        if (normalized !== value) input.value = normalized;
    }

    function normalizeCatalogKeywordInput(input) {
        if (!input) return;
        input.value = String(input.value || '').trim()
            .replace(/^(?:tim\s*kiem|tìm\s*kiếm)\s*[:=]?\s+/i, '')
            .trim();
    }

    document.addEventListener('keydown', function (event) {
        if (event.key === 'Enter' && event.target && event.target.id === 'chat-input') {
            normalizeProductLookupInput(event.target);
        }
    }, true);

    document.addEventListener('click', function (event) {
        var sendBtn = event.target && event.target.closest
            ? event.target.closest('#btn-send')
            : null;
        if (sendBtn) normalizeProductLookupInput(document.getElementById('chat-input'));
    }, true);

    document.addEventListener('submit', function (event) {
        var form = event.target;
        if (!form || !form.matches) return;
        if (!form.matches('[data-catalog-keyword], [data-catalog-current-form]')) return;
        normalizeCatalogKeywordInput(form.querySelector('input[type="search"]'));
    }, true);
})();
