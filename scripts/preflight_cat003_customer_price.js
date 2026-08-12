'use strict';

const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const sql = fs.readFileSync(path.join(root, 'sql', 'CAT-003_Product_Price_By_Customer_AI.sql'), 'utf8');
const contract = fs.readFileSync(path.join(root, 'docs', 'CAT-003_CONTRACT_GIA_THEO_KHACH_HANG_AI_2026-08-10.md'), 'utf8');

const checks = [
  ['AI_API_SUFFIX', sql.includes('API_GiaSanPhamTheoKhachHang_AI')],
  ['ERP_PRICE_FUNCTION', sql.includes('dbo.AR_LayGiaSanPhamFnc')],
  ['SERVER_DATE_SEMANTICS', sql.includes('CAST(GETDATE() AS DATE)') && !/@DocumentDate/i.test(sql)],
  ['CUSTOMER_SCOPE', sql.includes('dbo.AR_GetObjectByUserFnc(@Username)')],
  ['BRANCH_ITEM_GUARD', sql.includes("WHEN @BranchID = 'MB'") && sql.includes("WHEN @BranchID = 'MN'") && sql.includes("WHEN @BranchID = 'MT'" )],
  ['NO_PRICE_EXPLICIT', sql.includes("'NO_ACTIVE_PRICE'") && sql.includes('IsOrderableByPrice')],
  ['PRICE_SOURCE_EXPLICIT', sql.includes("'AR_LayGiaSanPhamFnc' AS PriceSource")],
  ['NO_ERP_MUTATION', !/(INSERT\s+INTO|UPDATE|DELETE\s+FROM|MERGE)\s+dbo\.(AR_|CF_|IV_)/i.test(sql)],
  ['NO_PRICE_COPY_TABLE', !/CREATE\s+TABLE/i.test(sql)],
  ['CONTRACT_PRIORITY', contract.includes('Giá gắn trực tiếp khách hàng') && contract.includes('giá theo nhóm khách') && contract.includes('bảng giá chung')],
];

const failed = checks.filter(([, pass]) => !pass);
for (const [name, pass] of checks) console.log(`${pass ? 'PASS' : 'FAIL'} ${name}`);
console.log(`CAT-003 preflight: ${failed.length ? 'FAIL' : 'PASS'} ${checks.length - failed.length}/${checks.length}`);
if (failed.length) process.exitCode = 1;
