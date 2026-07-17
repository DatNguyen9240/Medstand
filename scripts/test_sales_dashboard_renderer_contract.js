'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const source = fs.readFileSync(path.join(root, 'chatbot-widget', 'js', 'chatbot.js'), 'utf8');
const styles = fs.readFileSync(path.join(root, 'chatbot-widget', 'css', 'chatbot.css'), 'utf8');

assert(source.includes('Chi tiết nguồn tạo doanh số'), 'Manager detail title is missing');
assert(source.includes("'Nhóm phân tích'"), 'Sales detail must expose the analysis group');
assert(source.includes("'Mã đối tượng'"), 'Sales detail must expose the entity code');
assert(source.includes("'Tên đối tượng'"), 'Sales detail must expose the entity name');
assert(source.includes("'Số lượng bán'"), 'Sales detail must expose quantity');
assert(source.includes("'Doanh số'"), 'Sales detail must expose revenue');
assert(source.includes("'Tỷ trọng trong danh sách'"), 'Sales detail must expose share within the returned group list');
assert(source.includes('ai-sales-group-card'), 'Sales groups must render as interactive filter cards');
assert(source.includes('_applySalesManagementFilter'), 'Sales group cards must filter the detail table');
assert(source.includes('cacheRows || rows'), 'Sales filters must retain all groups in the table cache');
assert(source.includes("activeGroup === 'Sản phẩm'"), 'Quantity must only be enabled for the product group');
assert(!source.includes('<strong>Top nhân viên</strong>'), 'Duplicated manager ranking card must stay removed');
assert(!source.includes("'@LoaiBaoCao': 'NhanVien', '@TopN': 5"), 'Renderer must not load the removed ranking query');
assert(styles.includes('.ai-sales-breakdown-explainer'), 'Sales explanation styles are missing');
assert(styles.includes('.ai-sales-breakdown-groups'), 'Sales group summary styles are missing');
assert(styles.includes(':not(.ai-sales-show-quantity)'), 'Non-product groups must hide the quantity column');

console.log('Sales dashboard renderer contract checks passed.');
