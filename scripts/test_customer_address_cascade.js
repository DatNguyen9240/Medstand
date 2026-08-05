'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const read = (...parts) => fs.readFileSync(path.join(ROOT, ...parts), 'utf8');
const engine = read('chatbot-widget', 'js', 'chatbot-api-engine.js');
const renderer = read('chatbot-widget', 'js', 'chatbot-renderer-create-customer.js');
const wardSql = read('sql', 'Module common - API_PhuongXa_AI.sql');
const customerSql = read('sql', 'Module common - API_KhachHang_Insert_AI.sql');

const checks = [];
function check(name, fn) { fn(); checks.push(name); }

check('WARD_API_RETURNS_DISTRICT_SIGNAL', () => {
  assert(wardSql.includes('SELECT DISTINCT'));
  assert(wardSql.includes('TinhThanh AS LocationID'));
  assert(wardSql.includes('QuanHuyen,'));
  assert(wardSql.includes('FROM dbo.CF_XaPhuongTbl'));
});

check('CUSTOMER_SQL_VALIDATES_CURRENT_ADMIN_AREA_AS_ONE_TUPLE', () => {
  assert(customerSql.includes('FROM dbo.CF_XaPhuongTbl W'));
  assert(customerSql.includes('W.TinhThanh = @LocationID'));
  assert(customerSql.includes('W.XaPhuong = @XaPhuong'));
  assert(customerSql.includes("@QuanHuyen = N''"));
  assert(customerSql.includes("SET @ResultCode = 'INVALID_ADMIN_AREA'"));
  assert(!customerSql.includes("SET @ResultCode = 'INVALID_DISTRICT'"));
});

check('DIRECT_PANEL_SUPPORTS_TWO_AND_THREE_LEVEL_AREAS', () => {
  assert(engine.includes("wards.some(function (row)"));
  assert(engine.includes("d.dataset.optional = 'true'"));
  assert(engine.includes("districtRequired && !v.district"));
  assert(engine.includes("_closeFull(true);"));
});

check('CARD_RENDERER_SUPPORTS_TWO_AND_THREE_LEVEL_AREAS', () => {
  assert(renderer.includes("district: r.QuanHuyen || ''"));
  assert(renderer.includes("districtField.setAttribute('data-optional', 'true')"));
  assert(renderer.includes("districtRequired && !district"));
  assert(renderer.includes('window.ApiEngine.clearState()'));
});

console.log(`Customer address cascade: PASS ${checks.length}/${checks.length}`);
for (const name of checks) console.log(`  ✓ ${name}`);
