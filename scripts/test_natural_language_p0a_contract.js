'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {
  intentMap,
  validateParserOutput,
  decideParserResult,
  buildContextKey,
  isContextExpired,
  commitContext
} = require('./lib/natural_language_contract');

const ROOT = path.resolve(__dirname, '..');
const main = JSON.parse(fs.readFileSync(path.join(ROOT, 'n8n', 'AI_Core', 'MAIN_ChatBot_V5.json'), 'utf8'));
const parser = JSON.parse(fs.readFileSync(path.join(ROOT, 'n8n', 'AI_Core', 'AI_Intent_Parser.json'), 'utf8'));
const casual = JSON.parse(fs.readFileSync(path.join(ROOT, 'n8n', 'AI_Core', 'AI_ChatCasual.json'), 'utf8'));
const frontend = fs.readFileSync(path.join(ROOT, 'chatbot-widget', 'js', 'chatbot.js'), 'utf8');
const nodeCode = (workflow, name) => workflow.nodes.find((entry) => entry.name === name)?.parameters?.jsCode || '';

assert.equal(Object.keys(intentMap.intents).length, 24, 'server mapping must contain exactly 24 read intents');
assert.equal(new Set(Object.values(intentMap.intents).map((entry) => entry.apiCode)).size, 24, 'ApiCode mapping must be one-to-one');
assert(Object.values(intentMap.intents).every((entry) => /^@[a-z0-9_]+$/.test(entry.apiCode)), 'all API codes must be allowlisted identifiers');

const validDebt = {
  internalIntent: 'CUSTOMER_DEBT_DETAIL',
  confidence: 0.96,
  entities: { customerId: 'TESTKH01' },
  missingFields: [],
  requiresClarification: false,
  alternatives: []
};
assert.equal(validateParserOutput(validDebt).ok, true);
assert.equal(decideParserResult(validDebt).decision, 'RUN');
assert.equal(decideParserResult(validDebt).apiCode, '@cong_no_chi_tiet');
assert.equal(decideParserResult({ ...validDebt, confidence: 0.9 }).code, 'CONFIDENCE_BELOW_RISK_THRESHOLD');
assert.equal(decideParserResult({ ...validDebt, extra: 'not allowed' }).code, 'PARSER_SCHEMA_INVALID');
assert.equal(decideParserResult({ ...validDebt, internalIntent: 'MADE_UP_INTENT' }).code, 'PARSER_SCHEMA_INVALID');
assert.equal(decideParserResult({
  ...validDebt,
  alternatives: [{ internalIntent: 'ORDER_LIST', confidence: 0.91 }]
}).code, 'INTENT_MARGIN_TOO_SMALL');
assert.equal(decideParserResult({
  ...validDebt,
  internalIntent: 'SYMPTOM_PRODUCT_SEARCH',
  entities: { keyword: 'ho' },
  confidence: 0.99
}).code, 'MEDICAL_OWNER_GATE_REQUIRED');

const keyBase = { verifiedUserId: 'admin', conversationId: 'conv-0001', serverSessionId: 'session-0001' };
const key = buildContextKey(keyBase);
assert.notEqual(key, buildContextKey({ ...keyBase, verifiedUserId: 'sale01' }), 'different users must not share context');
assert.notEqual(key, buildContextKey({ ...keyBase, conversationId: 'conv-0002' }), 'different tabs must not share context');
assert.notEqual(key, buildContextKey({ ...keyBase, serverSessionId: 'session-0002' }), 'different logins must not share context');
assert.throws(() => buildContextKey({ ...keyBase, conversationId: 'bad' }), /CONVERSATION_ID_INVALID/);

const now = Date.now();
const current = { contextVersion: 3, createdAt: now - 1000, lastActiveAt: now - 500, Business: { selectedCustomer: { id: 'TESTKH01' } } };
assert.equal(isContextExpired(current, now), false);
assert.equal(isContextExpired({ ...current, lastActiveAt: now - 2 * 60 * 60 * 1000 - 1 }, now), true);
assert.equal(isContextExpired({ ...current, createdAt: now - 12 * 60 * 60 * 1000 - 1 }, now), true);
assert.equal(commitContext(current, { Business: { selectedCustomer: { id: 'TESTKH02' } } }, { status: 'SUCCESS', completedAt: now }, 3).committed, true);
assert.equal(commitContext(current, {}, { status: 'OUT_OF_SCOPE' }, 3).committed, false);
assert.equal(commitContext(current, {}, { status: 'SUCCESS' }, 2).code, 'CONTEXT_VERSION_CONFLICT');

assert.equal(main.meta?.naturalLanguageContractVersion, 'NL-P0A-V1-SOURCE');
assert.match(nodeCode(main, 'Parse User Info V5'), /API_UserInfo_VERIFIED/);
assert.doesNotMatch(nodeCode(main, 'Parse User Info V5'), /Fallback local decode/);
assert.match(nodeCode(main, 'LIB NormalizeInput'), /verifiedUserId/);
assert.match(nodeCode(main, 'LIB NormalizeInput'), /serverSessionId/);
assert.match(nodeCode(main, 'LIB NormalizeInput'), /conversationId/);
assert.match(nodeCode(main, 'LIB NormalizeInput'), /12 \* 3600 \* 1000/);
assert.match(nodeCode(main, 'LIB ConfidenceDecision'), /server-owned intent mapping/);
assert.match(nodeCode(main, 'LIB ConfidenceDecision'), /RISK_THRESHOLDS/);
assert.match(nodeCode(main, 'LIB ConfidenceDecision'), /NATURAL_LANGUAGE_MODE = 'SHADOW'/);
assert.match(nodeCode(main, 'LIB ConfidenceDecision'), /NATURAL_LANGUAGE_SHADOW_NO_EXECUTE/);
assert.match(nodeCode(main, 'LIB ConfidenceDecision'), /mapping && !explicitCommand/);
assert.match(
  main.nodes.find((entry) => entry.name === 'Respond ASK').parameters.responseBody,
  /shadowPrediction/,
);
assert.equal(main.nodes.find((entry) => entry.name === 'Call API Execute').retryOnFail, true);
assert.equal(main.nodes.find((entry) => entry.name === 'Call API Execute').maxTries, 2);
assert.match(nodeCode(main, 'Handle SQL Error'), /AUTH_TOKEN_INVALID/);
assert.match(main.nodes.find((entry) => entry.name === 'Respond Fast').parameters.options.responseCode, /AUTH_ERROR/);
const staleCredentialIds = new Set(['NUWWHWYzGHV6GY0g', 'mxZCAAqEX3fE4Amb', 'wGBnl2LS07ZUbFrv', 'oltuZlv17pevRi6M', 'wRToVAhAN63iZT6Q']);
const aiCoreSources = fs.readdirSync(path.join(ROOT, 'n8n', 'AI_Core'))
  .filter((fileName) => fileName.endsWith('.json'))
  .map((fileName) => JSON.parse(fs.readFileSync(path.join(ROOT, 'n8n', 'AI_Core', fileName), 'utf8')))
  .filter((workflow) => Array.isArray(workflow.nodes));
for (const workflow of aiCoreSources) {
  for (const workflowNode of workflow.nodes) {
    for (const credential of Object.values(workflowNode.credentials || {})) {
      assert(!staleCredentialIds.has(credential.id), `${workflow.name || 'workflow'} / ${workflowNode.name}: stale credential reference`);
    }
  }
}
assert.match(nodeCode(main, 'LIB SaveContext'), /VERSION_CONFLICT/);
assert.match(nodeCode(main, 'LIB SaveContext'), /OUT_OF_SCOPE/);

assert.equal(parser.meta?.naturalLanguageContractVersion, 'NL-P0A-V1-SOURCE');
const parserPrompt = parser.nodes.find((entry) => entry.name === 'Extract Intent Chain').parameters.messages.messageValues[0].message;
assert.match(parserPrompt, /UNTRUSTED DATA/);
assert.match(parserPrompt, /Never output ApiCode/);
assert.match(nodeCode(parser, 'Parse & Resolve Placeholders'), /PARSER_SCHEMA_INVALID/);
assert.match(nodeCode(parser, 'Parse & Resolve Placeholders'), /INTENT_NOT_ALLOWLISTED/);

const casualPrompt = casual.nodes.find((entry) => entry.name === 'OpenAI Chat').parameters.messages.messageValues[0].message;
assert.match(casualPrompt, /DỮ LIỆU KHÔNG ĐÁNG TIN/);
assert.match(casualPrompt, /không chẩn đoán, không kê đơn/);
assert.match(frontend, /conversationId: conversationId/);
assert.match(frontend, /resetConversationId: _consumeConversationReset\(\)/);

for (const workflow of [main, parser, casual]) {
  for (const entry of workflow.nodes) {
    if (entry.parameters?.jsCode) assert.doesNotThrow(() => new Function(entry.parameters.jsCode), `${entry.name} must compile`);
  }
}

console.log('NL_P0A_STATIC_CONTRACT_PASS');
