'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const source = fs.readFileSync(path.join(__dirname, '..', 'chatbot-widget', 'js', 'chatbot-api-engine.js'), 'utf8');
assert(source.includes("code === '@hoa_don_chi_tiet'"), 'Invoice detail menu code mapping is missing');
assert(source.includes("return 'Chi tiết hóa đơn'"), 'Invoice detail label is missing');
assert(source.includes('_getApiMenuLabel(a)'), 'API menu must render the normalized label');
console.log('API menu label contract checks passed.');
