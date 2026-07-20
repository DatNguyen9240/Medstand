'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const engine = fs.readFileSync(path.join(root, 'chatbot-widget', 'js', 'chatbot-api-engine.js'), 'utf8');
const workflow = fs.readFileSync(path.join(root, 'n8n', 'API_Services', 'API_Execute.json'), 'utf8');
const sql = fs.readFileSync(path.join(root, 'sql', 'Module 10 - API_TraCuuSanPham_AI.sql'), 'utf8');

assert(engine.includes("@tim_san_pham_theo_trieu_chung") && engine.includes('Vui lòng nhập từ khóa'), 'FE must reject an empty symptom keyword');
assert(workflow.includes("apiCode === '@tim_san_pham_theo_trieu_chung'") && workflow.includes("'@keyword', '@timkiem'"), 'n8n must validate symptom keyword before SQL');
assert(sql.includes("IF @timkiem = ''") && sql.includes("'VALIDATION_ERROR'"), 'SQL procedure must not search all products for an empty keyword');
console.log('Symptom keyword required contract: STATIC_CONTRACT_PASS');
