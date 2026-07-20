const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const read = (relative) => fs.readFileSync(path.join(root, relative), 'utf8');
const load = (relative) => JSON.parse(read(relative));
const nodeCode = (workflow, name) => {
  const found = workflow.nodes.find((node) => node.name === name);
  assert(found, `Missing n8n node: ${name}`);
  return found.parameters.jsCode || '';
};
const apiSet = (source, variable) => {
  const match = source.match(new RegExp(`(?:const\\s+)?${variable}\\s*=\\s*new Set\\(\\[([\\s\\S]*?)\\]\\)`));
  assert(match, `Missing API set: ${variable}`);
  return [...match[1].matchAll(/'(@[a-z0-9_]+)'/g)].map((item) => item[1]);
};

const recommendation = read('sql/Module 1 - API_GoiYDonHang_AI.sql');
assert.match(recommendation, /ELSE CAST\(NULL AS INT\)/);
assert.doesNotMatch(recommendation, /ELSE\s+30\b/);
assert.match(recommendation, /NEW_CUSTOMER\|INSUFFICIENT_HISTORY/);

const debt = read('sql/Module common - API_CongNoChiTiet_AI.sql');
assert.match(debt, /PARTIALLY_PAID/);
assert.match(debt, /A\.CreditAmount\s*>\s*0/);
assert.match(debt, /END AS \[CollectionStatus\]/);

const tier = read('sql/Module 3 - API_ChamDiemKH_AI.sql');
assert.match(tier, /@W_Frequency \* F_Score/);
assert.match(tier, /@W_Monetary \* M_Score/);
assert.doesNotMatch(tier, /@W_Recency \* R_Score/);
assert.doesNotMatch(tier, /@W_Consumption \* C_Score/);
assert.match(tier, /CASE WHEN Recency_Days >= 90 THEN 'HIGH'/);

const template = read('chatbot-widget/template/chatbot.html');
assert.match(template, /chat-ai-disclaimer/);
assert.match(template, /AI và có thể sai sót/);
assert(template.indexOf('chat-ai-disclaimer') > template.indexOf('id="chat-input"'), 'AI warning must be adjacent to the chat input');

const renderer = read('chatbot-widget/js/chatbot-renderers-medstand.js');
assert.match(renderer, /PARTIALLY_PAID/);
assert.match(renderer, /\['CollectionStatus', 'TrangThaiThanhToan'/);

const execute = load('n8n/API_Services/API_Execute.json');
const main = load('n8n/AI_Core/MAIN_ChatBot_V5.json');
const capability = nodeCode(execute, 'Enforce API Capability');
const formatExecute = nodeCode(execute, 'Format Execute Response');
const mainValidation = nodeCode(main, 'LIB ValidateParams');
const readApis = apiSet(capability, 'readApis');
const naturalLanguageApis = apiSet(mainValidation, 'APPROVED_NATURAL_LANGUAGE_APIS');
assert.equal(readApis.length, 24, 'Gateway must contain exactly 24 approved read APIs');
assert.equal(new Set(readApis).size, 24, 'Gateway read API list contains duplicates');
assert.deepEqual([...naturalLanguageApis].sort(), [...readApis].sort(), 'Natural-language and gateway allowlists must match');
assert.match(capability, /const pilotReadOnly = true/);
assert.match(capability, /blockedMutation/);
assert.match(capability, /PILOT_READ_ONLY/);
assert.match(formatExecute, /P0_CART_PREVIEW_RESPONSE/);
assert.match(formatExecute, /PreviewOnly: true/);
assert.match(formatExecute, /transactionOutcome: 'NOT_STARTED'/);

const runMainValidation = (intent, rawMessage) => {
  const lookup = () => ({ first: () => ({ json: { rawMessage } }) });
  return new Function('$', '$json', mainValidation)(lookup, { intent, params: {} })[0].json;
};
assert.equal(runMainValidation('@khach_hang_insert', 'hãy tạo khách mới').errorCode, 'PILOT_READ_ONLY');
assert.equal(runMainValidation('@lap_don_hang', 'hãy tạo đơn giúp tôi').errorCode, 'PILOT_READ_ONLY');
assert.equal(runMainValidation('@unknown_api', 'chạy chức năng lạ').errorCode, 'API_NOT_ALLOWLISTED');
assert.equal(runMainValidation('@lap_don_hang', '@lap_don_hang').isValid, true, 'Explicit cart command must remain previewable');

const buildSql = nodeCode(execute, 'Build Execute SQL');
assert.match(buildSql, /P0_CART_PREVIEW_ELSE/);
assert.match(buildSql, /IF @ApiCode = '@lap_don_hang'[\s\S]*?END\nELSE\nBEGIN\nDECLARE @SPName/);
const previewIndex = buildSql.indexOf("IF @ApiCode = '@lap_don_hang'");
const storedProcedureIndex = buildSql.indexOf('SELECT @SPName = StoredProcedure');
assert(previewIndex >= 0 && storedProcedureIndex > previewIndex, 'Cart preview must return before stored-procedure lookup');

console.log(JSON.stringify({
  suite: 'p0-business-contract',
  status: 'STATIC_CONTRACT_PASS',
  approvedReadApis: readApis.length,
  mutationMode: 'PREVIEW_ONLY'
}, null, 2));
