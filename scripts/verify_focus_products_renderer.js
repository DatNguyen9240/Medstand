'use strict';

const fs = require('fs');
const path = require('path');

const renderers = {};
global.window = {
    ApiChatbot: {
        helpers: {
            esc: (value) => String(value ?? ''),
            nextId: () => 1
        },
        __internal: {},
        registerRenderer: (name, renderer) => { renderers[name] = renderer; }
    }
};
global.ApiChatbot = window.ApiChatbot;
global.document = {};
global.setTimeout = () => 0;
global.API_CONFIG = {};

require(path.join(__dirname, '..', 'chatbot-widget', 'js', 'chatbot-renderers-medstand.js'));

function assert(name, condition) {
    if (!condition) throw new Error(`FOCUS_PRODUCTS_FAIL: ${name}`);
    console.log(`PASS ${name}`);
}

const products = Array.from({ length: 107 }, (_, index) => ({
    RecordType: 'PRODUCT',
    ItemID: `SP${index + 1}`,
    ItemName: `Sản phẩm ${index + 1}`,
    Unit: 'Hộp',
    PhysicalStock: index === 0 ? 0 : index,
    AvailableStock: index === 0 ? 0 : index
}));
const program = {
    RecordType: 'PROGRAM',
    ProgramName: 'Chương trình hiện hành',
    ProductCount: 107,
    HasCustomer: 0,
    CurrentSales: 0,
    NextTarget: 1000000,
    RemainingToNextTarget: 1000000,
    NextGift: 'Quà mẫu',
    GiftLadderJson: '[{"TargetAmount":1000000,"GiftName":"Quà 1"}]'
};

const normalize = window.ApiChatbot.__internal.normalizeFocusProducts;
const render = renderers.FOCUS_PRODUCTS;
const normalized = normalize([program, ...products], {});
const html = render([program, ...products], '', '@san_pham_trong_tam', {});
const selectedHtml = render([{ ...program, HasCustomer: 1, CustomerID: 'HPA011', CustomerName: 'Nhà thuốc UAT', CurrentSales: 800000, RemainingToNextTarget: 200000 }, ...products], '', '@san_pham_trong_tam', {});
const rendererSource = render.toString();
const css = fs.readFileSync(path.join(__dirname, '..', 'chatbot-widget', 'css', 'chatbot.css'), 'utf8');
const chatbotSource = fs.readFileSync(path.join(__dirname, '..', 'chatbot-widget', 'js', 'chatbot.js'), 'utf8');
const apiEngineSource = fs.readFileSync(path.join(__dirname, '..', 'chatbot-widget', 'js', 'chatbot-api-engine.js'), 'utf8');

assert('two-business-sections', normalized.sections.length === 2);
assert('focus-product-count', normalized.productCount === 107);
assert('active-program-count', normalized.programCount === 1);
assert('counts-not-added', html.includes('<strong>107</strong>') && html.includes('<strong>1</strong>') && !html.includes('108 kết quả'));
assert('no-generic-group-label', !html.includes('Nhóm 1') && !html.includes('Theo ItemName'));
assert('products-tab-default', /class="active" role="tab"[^>]*data-focus-tab="products"/.test(html));
assert('program-specific-renderer', html.includes('ai-focus-program-card') && html.includes('ai-focus-gift-table-wrap'));
assert('no-customer-no-progress', html.includes('data-focus-choose-customer') && !html.includes('ai-focus-progress-metrics'));
assert('selected-customer-progress', selectedHtml.includes('ai-focus-progress-metrics') && selectedHtml.includes('HPA011'));
assert('zero-stock-rule', /physical === 0/.test(rendererSource) && rendererSource.includes('Hết hàng'));
assert('negative-stock-rule', /physical < 0/.test(rendererSource) && rendererSource.includes('Cần đối soát'));
assert('missing-stock-not-zero', rendererSource.includes("physical === null ? 'Chưa cập nhật'"));
assert('responsive-and-sticky-contract', css.includes('.ai-focus-table thead th') && css.includes('position: sticky') && css.includes('@media (max-width: 560px)'));
assert('business-error-messages', chatbotSource.includes("emptyApiCode === '@san_pham_trong_tam'") && chatbotSource.includes('Không có sản phẩm trọng tâm phù hợp.') && chatbotSource.includes('Mã yêu cầu: '));
assert('direct-command-uses-focus-renderer', chatbotSource.includes("debtCode === '@san_pham_trong_tam'") && chatbotSource.includes('renderFocusProducts(rows, headerMsg, debtCode, meta)'));
assert('focus-result-uses-data-bubble', chatbotSource.includes("text.indexOf('ai-focus-products') !== -1"));
assert('focus-result-wide-desktop', css.includes('.chat-container:has(.ai-focus-products)') && css.includes('max-width: 1560px'));
assert('no-technical-stock-copy', !rendererSource.includes('API hiện chưa cung cấp') && !rendererSource.includes('Chưa được API cung cấp') && !rendererSource.includes('Theo tồn giao dịch ERP'));

assert('expand-only-with-real-detail', rendererSource.includes('product.details.length > 0') && rendererSource.includes('hasExpandableProducts'));
assert('expanded-view-is-detail-table', rendererSource.includes('ai-focus-detail-heading') && !rendererSource.includes('ai-focus-detail-empty'));
assert('customer-button-opens-accumulation-picker', rendererSource.includes("openCustomerPicker('@tich_luy')"));
assert('visible-api-tag-reconciles-stale-state', apiEngineSource.includes('preserveInput: true, autoSubmit: true'));
assert('friendly-customer-token-recovers-code', apiEngineSource.includes('customerMatch[1].trim()'));
assert('focus-customer-selection-auto-submits', apiEngineSource.includes('autoSubmitAfterCustomerPick'));
assert('customer-picker-stays-on-selected-api', apiEngineSource.includes('lockSelectedApi: !!(pendingUpdate && pendingUpdate.focusCustomer)') && apiEngineSource.includes('if (!api.lockSelectedApi && _catalogDsMap && _pillParams)'));

console.log('FOCUS_PRODUCTS_RENDERER_PASS');
