'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const readWorkflow = (file) => JSON.parse(fs.readFileSync(path.join(root, file), 'utf8'));
const nodeCode = (workflow, name) => workflow.nodes.find((node) => node.name === name)?.parameters?.jsCode || '';

const parser = readWorkflow('n8n/AI_Core/AI_Intent_Parser.json');
const classifierCode = nodeCode(parser, 'Detect Category & Load FewShots');
const classify = (message) => {
  const run = new Function('$input', classifierCode);
  return run({ first: () => ({ json: { body: { message } } }) })[0].json.preclassification;
};

const codeCase = classify('CTBH sản phẩm A003');
assert.strictEqual(codeCase.internalIntent, 'PRODUCT_PROMOTION_LOOKUP');
assert.strictEqual(codeCase.apiCode, '@ctbh_san_pham');
assert.strictEqual(codeCase.entities.searchTerm, 'A003');
assert.deepStrictEqual(codeCase.missingFields, []);

const nameCase = classify('Sản phẩm Antrinano Plus có khuyến mãi gì?');
assert.strictEqual(nameCase.internalIntent, 'PRODUCT_PROMOTION_LOOKUP');
assert.strictEqual(nameCase.apiCode, '@ctbh_san_pham');
assert.strictEqual(nameCase.entities.searchTerm, 'Antrinano Plus');

const missingCase = classify('CTBH sản phẩm bất kỳ');
assert.strictEqual(missingCase.internalIntent, 'PRODUCT_PROMOTION_LOOKUP');
assert.deepStrictEqual(missingCase.missingFields, ['searchTerm']);
assert.strictEqual(missingCase.responseKey, 'ASK_PRODUCT_FOR_PROMOTION');

const reviewCase = classify('Đề xuất khuyến mãi cho hàng bán chậm');
assert.strictEqual(reviewCase.internalIntent, 'PROMOTION_REVIEW');
assert.strictEqual(reviewCase.apiCode, '@de_xuat_khuyen_mai');

const main = readWorkflow('n8n/AI_Core/MAIN_ChatBot_V5.json');
const execute = readWorkflow('n8n/API_Services/API_Execute.json');
const getConfig = readWorkflow('n8n/API_Services/API_GetConfig.json');
const telegram = readWorkflow('n8n/Telegram/TG_ChatBot_Demo.json');
assert.ok(nodeCode(main, 'LIB ConfidenceDecision').includes('"PRODUCT_PROMOTION_LOOKUP":{"apiCode":"@ctbh_san_pham"'));
assert.ok(nodeCode(main, 'LIB ValidateParams').includes("'@ctbh_san_pham'"));
assert.ok(nodeCode(execute, 'Enforce API Capability').includes("'@ctbh_san_pham'"));
assert.ok(nodeCode(getConfig, 'Authorize GetConfig').includes('"@ctbh_san_pham"'));
assert.ok(nodeCode(telegram, 'Format Chatbot Reply').includes("'@ctbh_san_pham':"));

console.log(JSON.stringify({
  Task: 'VERIFY-CUSTOMER-REQUESTS-N8N', Status: 'PASS',
  Cases: { ProductCode: codeCase, ProductName: nameCase, MissingProduct: missingCase, PromotionReview: reviewCase }
}, null, 2));
