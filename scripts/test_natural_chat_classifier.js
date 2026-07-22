'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { classifyNaturalMessage } = require('./natural_chat_classifier');

const root = path.resolve(__dirname, '..');

function expectedAction(result, hasContext = false) {
  if (result.messageType === 'BUSINESS') {
    if (!result.intent || result.missingFields.length > 0) return 'ASK_FIELD';
    return 'EXECUTE';
  }
  if (result.messageType === 'FOLLOW_UP' && hasContext) return 'USE_CONTEXT';
  return 'NO_API';
}

const cases = [
  ['xin chào', 'CASUAL', null, 'NO_API'],
  ['chào bot', 'CASUAL', null, 'NO_API'],
  ['cảm ơn nha', 'CASUAL', null, 'NO_API'],
  ['thanks', 'CASUAL', null, 'NO_API'],
  ['bạn là ai', 'CASUAL_META', null, 'NO_API'],
  ['tui hỏi bạn là ai', 'CASUAL_META', null, 'NO_API'],
  ['bạn làm được gì', 'CASUAL_META', null, 'NO_API'],
  ['tui là ai', 'CASUAL_META', null, 'NO_API'],
  ['tôi đang đăng nhập tài khoản nào', 'CASUAL_META', null, 'NO_API'],
  ['vai trò của tôi là gì', 'CASUAL_META', null, 'NO_API'],
  ['tôi được xem dữ liệu nào', 'CASUAL_META', null, 'NO_API'],
  ['tôi chứ tôi không hỏi bạn', 'CASUAL_META', null, 'NO_API'],
  ['ý là tôi hỏi tôi là ai', 'CASUAL_META', null, 'NO_API'],
  ['ê h tui nhắn z hiểu kh nhi r', 'CASUAL_META', null, 'NO_API'],
  ['bạn có hiểu tôi không', 'CASUAL_META', null, 'NO_API'],
  ['ê bot hiểu tui nói kh', 'CASUAL_META', null, 'NO_API'],

  ['thời tiết hôm nay thế nào', 'UNSUPPORTED', null, 'NO_API'],
  ['kết quả bóng đá tối qua', 'UNSUPPORTED', null, 'NO_API'],
  ['viết giúp tôi bài thơ', 'UNSUPPORTED', null, 'NO_API'],
  ['dịch sang tiếng Anh câu này', 'UNSUPPORTED', null, 'NO_API'],
  ['kết quả xổ số hôm nay', 'UNSUPPORTED', null, 'NO_API'],
  ['giá vàng hôm nay', 'UNSUPPORTED', null, 'NO_API'],

  ['xem công nợ AG0031', 'BUSINESS', 'CUSTOMER_DEBT_DETAIL', 'EXECUTE'],
  ['công nợ NDB001', 'BUSINESS', 'CUSTOMER_DEBT_DETAIL', 'EXECUTE'],
  ['cn kh NDB001', 'BUSINESS', 'CUSTOMER_DEBT_DETAIL', 'EXECUTE'],
  ['tồn kho A003', 'BUSINESS', 'INVENTORY_LIST', 'EXECUTE'],
  ['sp A003 tồn kho', 'BUSINESS', 'INVENTORY_LIST', 'EXECUTE'],
  ['gợi ý đơn hàng cho NDB001', 'BUSINESS', 'ORDER_RECOMMENDATION', 'EXECUTE'],
  ['chi tiết hóa đơn HD123', 'BUSINESS', 'INVOICE_DETAIL', 'EXECUTE'],
  ['doanh số tháng này', 'BUSINESS', 'SALES_REVENUE', 'EXECUTE'],

  ['xem công nợ', 'BUSINESS', 'CUSTOMER_DEBT_DETAIL', 'ASK_FIELD'],
  ['kiểm tra tồn kho', 'BUSINESS', 'INVENTORY_LIST', 'ASK_FIELD'],
  ['gợi ý đơn hàng', 'BUSINESS', 'ORDER_RECOMMENDATION', 'ASK_FIELD'],
  ['xem chi tiết hóa đơn', 'BUSINESS', 'INVOICE_DETAIL', 'ASK_FIELD'],

  ['tạo đơn hàng cho khách này', 'MUTATION_REQUEST', null, 'NO_API'],
  ['duyệt khuyến mãi này', 'MUTATION_REQUEST', null, 'NO_API'],
  ['xóa khách hàng AG0031', 'MUTATION_REQUEST', null, 'NO_API'],
  ['sửa hóa đơn HD123', 'MUTATION_REQUEST', null, 'NO_API'],

  ['tháng trước thì sao', 'FOLLOW_UP', null, 'NO_API'],
  ['chi tiết hơn', 'FOLLOW_UP', null, 'NO_API'],
  ['tuần trước thì sao', 'FOLLOW_UP', null, 'NO_API'],

  ['abc xyz 123', 'UNKNOWN', null, 'NO_API'],
  ['ơ kìa cái gì ấy nhỉ', 'UNKNOWN', null, 'NO_API'],
  ['12345', 'UNKNOWN', null, 'NO_API'],
  ['lorem ipsum', 'UNKNOWN', null, 'NO_API'],
];

for (const [input, messageType, intent, action] of cases) {
  const result = classifyNaturalMessage(input);
  assert.strictEqual(result.schemaVersion, '1.0.0', input);
  assert.strictEqual(result.messageType, messageType, input);
  assert.strictEqual(result.intent, intent, input);
  assert.strictEqual(expectedAction(result), action, input);
  assert.strictEqual(result.originalText, input, input);
  assert.ok(typeof result.normalizedText === 'string' && result.normalizedText.length > 0, input);
}

const slang = classifyNaturalMessage('ê h tui nhắn z hiểu kh nhi r');
assert.strictEqual(slang.normalizedText, 'ê giờ tôi nhắn vậy hiểu không nhi rồi');
assert.strictEqual(slang.responseKey, 'CASUAL_UNDERSTAND_CONFIRMATION');

assert.strictEqual(classifyNaturalMessage('bạn là ai').responseKey, 'BOT_IDENTITY_QUERY');
assert.strictEqual(classifyNaturalMessage('tui là ai').responseKey, 'USER_IDENTITY_QUERY');
assert.strictEqual(classifyNaturalMessage('vai trò của tôi là gì').responseKey, 'USER_ROLE_QUERY');
assert.strictEqual(classifyNaturalMessage('tôi được xem dữ liệu nào').responseKey, 'USER_SCOPE_QUERY');
assert.strictEqual(classifyNaturalMessage('tôi chứ tôi không hỏi bạn').responseKey, 'USER_IDENTITY_QUERY');
assert.strictEqual(classifyNaturalMessage('ý là tôi hỏi tôi là ai').responseKey, 'USER_IDENTITY_QUERY');

const debt = classifyNaturalMessage('xem công nợ AG0031');
assert.strictEqual(debt.entities.customerId, 'AG0031');
assert.ok(debt.normalizedText.includes('AG0031'), 'ERP code must remain unchanged');

const missingDebt = classifyNaturalMessage('xem công nợ');
assert.deepStrictEqual(missingDebt.missingFields, ['customerId']);
assert.strictEqual(missingDebt.responseKey, 'ASK_CUSTOMER_FOR_DEBT');

const followUp = classifyNaturalMessage('tháng trước thì sao', { hasContext: true });
assert.strictEqual(followUp.messageType, 'FOLLOW_UP');
assert.strictEqual(expectedAction(followUp, true), 'USE_CONTEXT');

const parser = JSON.parse(
  fs.readFileSync(path.join(root, 'n8n', 'AI_Core', 'AI_Intent_Parser.json'), 'utf8'),
);
const main = JSON.parse(
  fs.readFileSync(path.join(root, 'n8n', 'AI_Core', 'MAIN_ChatBot_V5.json'), 'utf8'),
);
const mainNormalize = main.nodes.find((entry) => entry.name === 'LIB NormalizeInput')?.parameters?.jsCode || '';
const mainDecision = main.nodes.find((entry) => entry.name === 'LIB ConfidenceDecision')?.parameters?.jsCode || '';
const parserCode = parser.nodes.find((entry) => entry.name === 'Parse & Resolve Placeholders')?.parameters?.jsCode || '';

assert.ok(mainNormalize.includes('NATURAL_CHAT_CLASSIFIER_BEGIN'));
assert.ok(mainNormalize.includes('NATURAL_CHAT_PRE_ROUTER_BEGIN'));
assert.ok(mainNormalize.includes("['USER_IDENTITY_QUERY','USER_ROLE_QUERY','USER_SCOPE_QUERY']"));
assert.ok(mainNormalize.includes('userProfile.authenticated && verifiedUserId'));
assert.ok(!mainNormalize.includes('const identityPatterns ='));
assert.ok(!mainNormalize.includes('body.userProfile'), 'Identity must not be accepted from client body');
assert.ok(mainDecision.includes('NATURAL_CHAT_RESPONSE_GATE_BEGIN'));
assert.ok(
  !mainDecision.includes('llmResult.meta?.permission') && !mainDecision.includes('if (!hasAccess)'),
  'MAIN must delegate authorization to API_Execute instead of exact-matching parser scopes',
);
assert.ok(parserCode.includes("parserContractVersion: 'NL-PARSER-V2'"));
assert.ok(parserCode.includes("messageType:'UNKNOWN'"));
assert.ok(mainDecision.includes("['CASUAL','CASUAL_META','FOLLOW_UP','UNSUPPORTED','UNKNOWN','MUTATION_REQUEST']"));

for (const workflow of [parser, main]) {
  for (const entry of workflow.nodes || []) {
    const code = entry.parameters?.jsCode;
    if (code) new Function(code);
  }
}

const validateCode = main.nodes.find((entry) => entry.name === 'LIB ValidateParams')?.parameters?.jsCode || '';
const approvedMatch = validateCode.match(/APPROVED_NATURAL_LANGUAGE_APIS = new Set\(\[([\s\S]*?)\]\)/);
assert.ok(approvedMatch, 'Approved API allowlist must remain present');
const approvedApis = [...approvedMatch[1].matchAll(/'(@[a-z0-9_]+)'/g)].map((match) => match[1]);
assert.strictEqual(new Set(approvedApis).size, 24, 'Natural language allowlist must remain exactly 24 APIs');

console.log(
  JSON.stringify(
    {
      status: 'NATURAL_CHAT_FALLBACK_FIXED',
      cases: cases.length + 1,
      approvedApis: new Set(approvedApis).size,
      mandatory: {
        casualMeta: slang.messageType,
        unsupported: classifyNaturalMessage('thời tiết hôm nay thế nào').messageType,
        debtMissing: expectedAction(missingDebt),
        debtExecute: expectedAction(debt),
        unknown: classifyNaturalMessage('abc xyz').messageType,
      },
    },
    null,
    2,
  ),
);
