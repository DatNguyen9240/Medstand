'use strict';

const assert = require('assert');
const fs = require('fs');

const workflow = JSON.parse(fs.readFileSync('n8n/AI_Core/MAIN_ChatBot_V5.json', 'utf8'));
const codeOf = (name) => workflow.nodes.find((node) => node.name === name)?.parameters?.jsCode || '';

async function runCode(name, inputJson, nodeJsonByName = {}) {
  const source = codeOf(name);
  assert(source, `${name} source not found`);
  const execute = new Function(
    '$json', '$input', '$',
    `return (async () => { ${source}\n})();`,
  );
  return execute(
    inputJson,
    {
      first: () => ({ json: inputJson }),
      all: () => [{ json: inputJson }],
    },
    (nodeName) => ({ first: () => ({ json: nodeJsonByName[nodeName] || {} }) }),
  );
}

async function main() {
  const catalog = await runCode(
    'LIB ValidateParams',
    { intent: '@danh_muc', params: {} },
    { 'LIB NormalizeInput': { rawMessage: 'xem danh mục kho hàng' } },
  );
  assert.equal(catalog[0].json.isValid, true);
  assert.equal(catalog[0].json.cleanParams['@Type'], 'khohang');
  assert.equal(catalog[0].json.cleanParams['@timkiem'], undefined);

  const searchNoData = await runCode(
    'Format Response',
    { success: true, status: 'NO_DATA', data: [], count: 0 },
    {
      'LIB ConfidenceDecision': { intent: '@tra_cuu_san_pham' },
      'LIB NormalizeInput': { rawMessage: 'tìm sản phẩm A003' },
    },
  );
  assert.equal(searchNoData[0].json.status, 'NO_DATA');
  assert.equal(searchNoData[0].json.needsRagFallback, false);
  assert.equal(searchNoData[0].json.ApiCode, '@tra_cuu_san_pham');

  const upsellNoData = await runCode(
    'Format Response',
    { success: true, status: 'NO_DATA', data: [], count: 0 },
    {
      'LIB ConfidenceDecision': { intent: '@upsell_goi_y' },
      'LIB NormalizeInput': { rawMessage: 'gợi ý bán kèm cho KH001' },
    },
  );
  assert.equal(upsellNoData[0].json.needsRagFallback, false);
  assert.equal(upsellNoData[0].json.ApiCode, '@upsell_goi_y');

  const ragFailure = await runCode('Format RAG Response', { error: 'upstream failed' });
  assert.equal(ragFailure[0].json.success, false);
  assert.equal(ragFailure[0].json.status, 'SYSTEM_ERROR');
  assert.equal(ragFailure[0].json.errorCode, 'RAG_UPSTREAM_ERROR');

  console.log('UAT-019 workflow guards: 4/4 PASS');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
