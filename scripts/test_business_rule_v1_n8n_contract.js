const fs = require('fs');
const path = require('path');
const assert = require('assert/strict');

const root = path.resolve(__dirname, '..');
const load = (relative) => JSON.parse(fs.readFileSync(path.join(root, relative), 'utf8'));
const byName = (workflow) => new Map(workflow.nodes.map((node) => [node.name, node]));

const execute = load('n8n/API_Services/API_Execute.json');
const executeNodes = byName(execute);
const formatCode = executeNodes.get('Format Execute Response').parameters.jsCode;
const validationCode = executeNodes.get('Validate API Request').parameters.jsCode;
const capabilityCode = executeNodes.get('Enforce API Capability').parameters.jsCode;
const identityCode = executeNodes.get('Apply Verified Identity').parameters.jsCode;

for (const marker of ['contractVersion', 'metadata(rows)', 'RULE_VERSIONS', 'RuleVersion', 'StockDataStatus', 'OUT_OF_SCOPE']) {
  assert(formatCode.includes(marker), `Execute envelope missing ${marker}`);
}
for (const marker of ['@tim_san_pham_theo_trieu_chung', 'REFERENCE_ONLY_MEDICAL_REVIEW_REQUIRED', 'MedicalDisclaimer', 'PHYSICAL_STOCK_NOT_QUERIED']) {
  assert(formatCode.includes(marker), `Symptom API response contract missing ${marker}`);
}
assert(!formatCode.includes('ApiCode:apiCode, apiCode'), 'Main response must not emit case-insensitive duplicate API code keys');
for (const apiCode of ['@goi_ydon_hang', '@tich_luy', '@tra_cuu_san_pham']) {
  assert(validationCode.includes(apiCode), `Gateway validation missing ${apiCode}`);
}
assert(!/\['@goi_ydon_hang',\s*'@cham_diem_kh',\s*'@tich_luy'\]/.test(validationCode), 'Customer scoring must allow scoped overview without a customer ID');
for (const inactiveApiCode of ['@khach_hang_list', '@dashboard_sinh_nhat']) {
  assert(!capabilityCode.includes(inactiveApiCode), `Inactive API leaked into execute policy: ${inactiveApiCode}`);
}
for (const marker of ['pilotReadOnly = true', 'PILOT_READ_ONLY', "operationType = 'PREVIEW'", "previewApis = new Set(['@lap_don_hang'])"]) {
  assert(capabilityCode.includes(marker), `Pilot read-only gateway missing ${marker}`);
}
assert(capabilityCode.includes('const readApis = new Set(['), 'Gateway must hard-lock the 24 approved read APIs');
assert(identityCode.includes("params['@timkiem'] = params[keywordKey]"), 'Symptom @Keyword must map to the stored procedure @timkiem parameter');

for (const responseName of ['Respond Auth Error (Execute)', 'Respond Authorization Error (Execute)', 'Respond Validation Error (Execute)']) {
  const body = executeNodes.get(responseName).parameters.responseBody;
  for (const field of ['status', 'errorCode', 'ApiCode', 'contractVersion', 'metadata']) {
    assert(body.includes(field), `${responseName} missing ${field}`);
  }
}

const main = load('n8n/AI_Core/MAIN_ChatBot_V5.json');
const mainNodes = byName(main);
const symptomQuery = mainNodes.get('SQL Stock & Price Symptom').parameters.query;
const symptomResponse = mainNodes.get('Generate Symptom Response').parameters.jsCode;
assert(!symptomQuery.includes('IV_StockTbl'), 'Symptom path must not read physical stock directly');
assert(!symptomQuery.includes('QuantityinStock'), 'Symptom path must not expose physical stock as available');
assert(symptomQuery.includes('AvailableStock'));
assert(symptomQuery.includes('PHYSICAL_STOCK_NOT_QUERIED'));
assert(symptomResponse.includes("const stock = 'Tồn khả dụng chưa xác định'"));
assert(symptomResponse.includes('AvailableStock: null'));
assert(!symptomResponse.includes("'Hết hàng'"));
assert(!symptomResponse.includes('sqlInfo.TonKho'));
assert.equal(main.connections['Route Strategy'].main[0][0].node, 'LIB ValidateParams', 'Symptom path must use the canonical scoped SQL API');
assert.equal(main.connections['Route Strategy'].main[1][0].node, 'LIB ValidateParams', 'Normal commands must use the canonical scoped SQL API');
assert.equal(main.connections['Generate Symptom Response'].main[0][0].node, 'Respond Fast', 'Symptom response must not depend on Redis cache writes');
assert.deepEqual(main.connections['Call API Execute'].main[0].map((edge) => edge.node), ['Format Response'], 'Successful API calls must only enter the formatter');
assert.deepEqual(main.connections['Call API Execute'].main[1].map((edge) => edge.node), ['Handle SQL Error'], 'Failed API calls must use the dedicated error output');
const normalizeCode = mainNodes.get('LIB NormalizeInput').parameters.jsCode;
assert(normalizeCode.includes('"@tim_san_pham_theo_trieu_chung": {'), 'Main chatbot must register the canonical symptom command');
assert(normalizeCode.includes("quickIntent.params = { '@Keyword': rawMessage }"), 'Main chatbot must pass the raw symptom text to the API');
assert(/"@tim_san_pham_theo_trieu_chung":\s*\{[\s\S]*?permission:\s*\[\]/.test(normalizeCode), 'Symptom quick intent must defer authorization to the canonical API gateway');
assert(normalizeCode.includes("'hom nay em nen lam gi'"), 'Daily-work question must map to the approved route API');
assert(/"@tuyen_ban_hang":\s*\{[\s\S]*?params:\s*\{\s*'@NgayTarget':\s*'\[TODAY\]',\s*'@TopN':\s*8\s*\}/.test(normalizeCode), 'Daily-work question must use today and return at most eight scoped priorities');
assert(/"@tuyen_ban_hang":\s*\{[\s\S]*?permission:\s*\[\]/.test(normalizeCode), 'Route quick intent must defer authorization to the canonical scoped API gateway');
const mainValidationCode = mainNodes.get('LIB ValidateParams').parameters.jsCode;
for (const marker of ['APPROVED_NATURAL_LANGUAGE_APIS', 'API_NOT_ALLOWLISTED', 'PILOT_READ_ONLY', 'isExplicitCartPreview']) {
  assert(mainValidationCode.includes(marker), `Natural-language allowlist missing ${marker}`);
}

for (const workflowPath of ['n8n/API_Services/API_ListActive.json', 'n8n/API_Services/API_GetConfig.json']) {
  const workflowText = JSON.stringify(load(workflowPath));
  for (const inactiveApiCode of ['@khach_hang_list', '@dashboard_sinh_nhat']) {
    assert(!workflowText.includes(inactiveApiCode), `${workflowPath} leaked inactive API ${inactiveApiCode}`);
  }
}

const mainFormat = mainNodes.get('Format Response').parameters.jsCode;
for (const marker of ['OUT_OF_SCOPE', 'VALIDATION_ERROR', 'SYSTEM_ERROR', 'metadata', 'contractVersion']) {
  assert(mainFormat.includes(marker), `Main response missing ${marker}`);
}
assert(mainFormat.includes('DAILY_WORK_NO_DATA'), 'Empty daily route must return useful next-step guidance');
assert(mainFormat.includes('kiểm tra công nợ hoặc chọn một khách'), 'Daily-work no-data guidance must be actionable');
assert(mainFormat.includes("apiCode === '@tuyen_ban_hang' ? dailyNoDataMessage"), 'Route no-data guidance must override the generic SQL no-data message');
assert(String(mainNodes.get('Respond Validation Error').parameters.options.responseCode).includes('PILOT_READ_ONLY'));
const saveContext = mainNodes.get('LIB SaveContext').parameters.jsCode;
for (const marker of ['...inp', 'ApiCode', 'apiCode']) {
  assert(saveContext.includes(marker), `Main context pass-through missing ${marker}`);
}
const fastResponse = mainNodes.get('Respond Fast').parameters;
assert(fastResponse.responseBody.includes('JSON.stringify($json)'), 'Main response must return the canonical envelope unchanged');
assert(String(fastResponse.options.responseCode).includes('SYSTEM_ERROR'), 'Main response must map canonical error status to HTTP status');

console.log('Business Rule v1 n8n contract: STATIC_CONTRACT_PASS');
