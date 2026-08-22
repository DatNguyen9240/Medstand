'use strict';

const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const catalogSql = fs.readFileSync(path.join(root, 'sql', 'Module_Common_API_HangHoaList_AI.sql'), 'utf8');
const lookupSql = fs.readFileSync(path.join(root, 'sql', 'Module_10_API_TraCuuSanPham_AI.sql'), 'utf8');
const renderer = fs.readFileSync(path.join(root, 'chatbot-widget', 'js', 'chatbot-product-card.js'), 'utf8');

const requiredFields = ['AvailableStock', 'StoreHouseID', 'StoreHouseName', 'StockUpdatedAt', 'StockAsOfAt', 'WarehouseScope', 'StockDataStatus'];
const checks = [
  ['CATALOG_USES_SHARED_STOCK', catalogSql.includes('AI_StockAvailableByUserFnc(@Username, @ItemID, @StockAsOfUtc)')],
  ['LOOKUP_USES_SHARED_STOCK', lookupSql.includes('AI_StockAvailableByUserFnc')],
  ['CATALOG_HAS_REQUIRED_FIELDS', requiredFields.every((field) => catalogSql.includes(field))],
  ['LOOKUP_HAS_REQUIRED_FIELDS', requiredFields.every((field) => lookupSql.includes(field))],
  ['SELLABLE_ONLY', catalogSql.includes('Stock.AvailableStock > 0') && catalogSql.includes("Stock.StockDataStatus = N'AVAILABLE_FOR_SALE'")],
  ['RENDERER_AVAILABLE_STOCK', renderer.includes("['AvailableStock', 'Tồn khả dụng', 'TonKhaDung']") && renderer.includes('Có thể bán')],
  ['RENDERER_WAREHOUSE', renderer.includes("['StoreHouseID', 'Mã kho', 'MaKho']") && renderer.includes('Kho xuất')],
  ['RENDERER_TIMESTAMP', renderer.includes("['StockUpdatedAt', 'Cập nhật tồn kho lúc', 'CapNhatTonKhoLuc']") && renderer.includes('Cập nhật:')],
  ['NO_ERP_MUTATION', !/(INSERT\s+INTO|UPDATE|DELETE\s+FROM|MERGE)\s+dbo\.(IV_|AR_|CF_)/i.test(catalogSql)],
];

const failed = checks.filter(([, pass]) => !pass);
for (const [name, pass] of checks) console.log(`${pass ? 'PASS' : 'FAIL'} ${name}`);
console.log(`CAT-004 preflight: ${failed.length ? 'FAIL' : 'PASS'} ${checks.length - failed.length}/${checks.length}`);
if (failed.length) process.exitCode = 1;
