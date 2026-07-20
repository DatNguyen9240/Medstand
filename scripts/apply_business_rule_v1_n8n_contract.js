const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const executePath = path.join(root, 'n8n', 'API_Services', 'API_Execute.json');
const mainPath = path.join(root, 'n8n', 'AI_Core', 'MAIN_ChatBot_V5.json');

const load = (file) => JSON.parse(fs.readFileSync(file, 'utf8'));
const save = (file, value) => fs.writeFileSync(file, JSON.stringify(value, null, 2) + '\n', 'utf8');
const node = (workflow, name) => {
  const value = workflow.nodes.find((item) => item.name === name);
  if (!value) throw new Error(`Missing n8n node: ${name}`);
  return value;
};

const execute = load(executePath);

node(execute, 'Enforce API Capability').parameters.jsCode = String.raw`const input = $('Apply Verified Identity').first().json;
const apiCode = String(input.body?.ApiCode || '@invalid_code').toLowerCase();
const identity = input.verifiedIdentity || {};
const granted = new Set((identity.capabilities || []).map(value => String(value).trim().toLowerCase()).filter(Boolean));

// P0 pilot: only the 24 approved read APIs may execute SQL.
const readApis = new Set([
  '@doanh_so', '@hoa_don', '@hoa_don_chi_tiet', '@don_hang',
  '@cham_diem_kh', '@cong_no_khach_hang', '@cong_no_chi_tiet',
  '@tich_luy', '@tuyen_ban_hang', '@goi_ydon_hang', '@upsell_goi_y',
  '@goi_ydon_thuoc', '@danh_sach_tonkho', '@tra_cuu_san_pham',
  '@san_pham_trong_tam', '@de_xuat_khuyen_mai', '@danh_muc', '@khao_sat360',
  '@danh_sach_cau_hoi_khao_sat', '@kiem_tra_khao_sat',
  '@kiem_tra_khao_sat_ngay', '@lich_su_khao_sat', '@thong_bao',
  '@tim_san_pham_theo_trieu_chung'
]);
// @lap_don_hang only returns a CART preview before stored-procedure execution.
const previewApis = new Set(['@lap_don_hang']);
const mutationPolicy = {
  '@khach_hang_insert': 'customers.write',
  '@san_pham_trong_tam_import': 'products.import'
};

let operationType = 'DENY';
let requiredCapability = null;
if (readApis.has(apiCode)) {
  operationType = 'READ';
  requiredCapability = 'api.read';
} else if (previewApis.has(apiCode)) {
  operationType = 'PREVIEW';
  requiredCapability = 'api.read';
} else if (mutationPolicy[apiCode]) {
  operationType = 'MUTATION';
  requiredCapability = mutationPolicy[apiCode];
}

const apiSpecific = apiCode.slice(1).replace(/_/g, '.');
const allowedCapabilities = requiredCapability
  ? [requiredCapability, operationType === 'READ' ? 'api.read.' + apiSpecific : requiredCapability + '.' + apiSpecific]
  : [];
const hasCapability = allowedCapabilities.some(capability => granted.has(capability))
  || granted.has('*')
  || granted.has('api:*');
const pilotReadOnly = true;
const blockedMutation = operationType === 'MUTATION' && pilotReadOnly;
const ok = !blockedMutation && operationType !== 'DENY' && hasCapability;

let code = 'OK';
let message = 'Authorized.';
if (blockedMutation) {
  code = 'PILOT_READ_ONLY';
  message = 'Pilot hiện chỉ cho phép xem trước; chưa ghi dữ liệu thật.';
} else if (operationType === 'DENY') {
  code = 'API_NOT_ALLOWLISTED';
  message = 'API này không nằm trong danh sách đã duyệt.';
} else if (!hasCapability) {
  code = 'CAPABILITY_REQUIRED';
  message = 'Tài khoản chưa có quyền sử dụng chức năng này.';
}

return [{ json: {
  ...input,
  authorization: {
    ok,
    httpStatus: ok ? 200 : 403,
    code,
    message,
    apiCode,
    operationType,
    pilotReadOnly,
    requiredCapability,
    allowedCapabilities
  }
} }];`;

const buildExecute = node(execute, 'Build Execute SQL');
if (!buildExecute.parameters.jsCode.includes('P0_CART_PREVIEW_ELSE')) {
  const previewTail = "RETURN;\nEND\n\nDECLARE @SPName";
  const queryTail = "END CATCH;\n`.trim();";
  if (!buildExecute.parameters.jsCode.includes(previewTail) || !buildExecute.parameters.jsCode.includes(queryTail)) {
    throw new Error('Build Execute SQL preview anchors changed; refusing unsafe rewrite.');
  }
  buildExecute.parameters.jsCode = buildExecute.parameters.jsCode
    .replace("IF @ApiCode = '@lap_don_hang'", "-- P0_CART_PREVIEW_ELSE: preview returns a result set and never reaches stored-procedure execution.\nIF @ApiCode = '@lap_don_hang'")
    .replace(previewTail, "END\nELSE\nBEGIN\nDECLARE @SPName")
    .replace(queryTail, "END CATCH;\nEND\n`.trim();");
}

node(execute, 'Validate API Request').parameters.jsCode = String.raw`const input = $('Enforce API Capability').first().json;
const apiCode = String(input.body?.ApiCode || '').toLowerCase();
const params = { ...(input.body?.params || {}) };
const normalized = Object.fromEntries(Object.entries(params).map(([key, value]) => [String(key).toLowerCase(), value]));
const errors = [];
const operationType = input.authorization?.operationType || 'UNKNOWN';
const idempotencyRequired = operationType === 'MUTATION' && apiCode !== '@lap_don_hang';
if (idempotencyRequired && !input._requestContext?.idempotencyKeyHash) errors.push('@Idempotency-Key');

const empty = (value) => value === undefined || value === null || String(value).trim() === '';
const requireOne = (keys, label) => {
  if (!keys.some((key) => !empty(normalized[key]))) errors.push(label);
};
const validIsoDate = (value) => {
  const text = String(value);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) return false;
  const parsed = new Date(text + 'T00:00:00Z');
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === text;
};

if (apiCode === '@cong_no_chi_tiet') requireOne(['@makhachhang', '@objectid'], '@MaKhachHang');
if (apiCode === '@hoa_don_chi_tiet') requireOne(['@documentid'], '@DocumentID');
if (apiCode === '@khao_sat360') requireOne(['@objectid'], '@ObjectID');
// Chấm điểm khách hàng cho phép để trống mã để trả danh sách Tier/Risk
// trong phạm vi user; có mã thì trả riêng khách đó.
if (['@goi_ydon_hang', '@tich_luy', '@upsell_goi_y'].includes(apiCode)) {
  requireOne(['@makhachhang', '@objectid'], '@MaKhachHang');
}
if (apiCode === '@tim_san_pham_theo_trieu_chung') requireOne(['@keyword', '@timkiem'], '@Keyword');
if (apiCode === '@tra_cuu_san_pham') requireOne(['@timkiem', '@keyword'], '@timkiem');
if (apiCode === '@goi_ydon_thuoc') requireOne(['@timkiem', '@itemid'], '@timkiem');

for (const [key, value] of Object.entries(normalized)) {
  if (empty(value)) continue;
  if (['@topn', '@pagesize', '@limit'].includes(key)) {
    const number = Number(value);
    if (!Number.isInteger(number) || number < 1 || number > 200) errors.push(key);
  }
  if (['@page', '@pageindex'].includes(key)) {
    const number = Number(value);
    if (!Number.isInteger(number) || number < 1 || number > 10000) errors.push(key);
  }
  if (['@tungay', '@denngay', '@fromdate', '@todate', '@startdate', '@enddate', '@documentdate', '@ngaytarget'].includes(key)) {
    if (!validIsoDate(value)) errors.push(key);
  }
}

const topN = normalized['@topn'];
if (!empty(topN) && ['@goi_ydon_hang', '@upsell_goi_y'].includes(apiCode) && Number(topN) > 100) {
  errors.push('@topn');
}
if (!empty(topN) && apiCode === '@tuyen_ban_hang' && (Number(topN) < 5 || Number(topN) > 8)) {
  errors.push('@topn');
}

const from = normalized['@tungay'] || normalized['@fromdate'] || normalized['@startdate'];
const to = normalized['@denngay'] || normalized['@todate'] || normalized['@enddate'];
if (!empty(from) && !empty(to) && validIsoDate(from) && validIsoDate(to) && Date.parse(from) > Date.parse(to)) {
  errors.push('@dateRange');
}

const uniqueErrors = [...new Set(errors)];
let validationMessage = uniqueErrors.length === 0 ? 'Validation passed.' : 'Yêu cầu chứa tham số thiếu hoặc không hợp lệ.';
if (uniqueErrors.includes('@MaKhachHang')) {
  validationMessage = apiCode === '@upsell_goi_y'
    ? 'Vui lòng chọn khách hàng trước khi xem gợi ý bán kèm.'
    : 'Vui lòng chọn khách hàng trước khi xem gợi ý đơn hàng.';
}
if (uniqueErrors.includes('@timkiem') && apiCode === '@goi_ydon_thuoc') {
  validationMessage = 'Vui lòng chọn sản phẩm gốc trước khi xem gợi ý sản phẩm liên quan.';
}
return [{ json: { ...input, validation: {
  ok: uniqueErrors.length === 0,
  httpStatus: uniqueErrors.length === 0 ? 200 : 422,
  code: uniqueErrors.length === 0 ? 'OK' : 'VALIDATION_ERROR',
  message: validationMessage,
  fields: uniqueErrors
} } }];`;

node(execute, 'Format Execute Response').parameters.jsCode = String.raw`const items = $input.all();
const JSON_KEY = 'JSON_F52E2B61-18A1-11d1-B105-00805F49916B';
const CONTRACT_VERSION = '1.0.0-draft';
const RULE_VERSIONS = {
  '@doanh_so': 'BR-SALES-V1-DRAFT',
  '@danh_sach_tonkho': 'BR-STOCK-V1-DRAFT',
  '@goi_ydon_hang': 'BR-SALES-V1-DRAFT',
  '@tuyen_ban_hang': 'BR-ROUTE-V1-DRAFT',
  '@cham_diem_kh': 'BR-TIER-V1-DRAFT',
  '@tich_luy': 'BR-PROGRAM-V1-DRAFT',
  '@de_xuat_khuyen_mai': 'BR-ACTION-V1-DRAFT',
  '@upsell_goi_y': 'BR-UPSELL-V1-DRAFT',
  '@tim_san_pham_theo_trieu_chung': 'BR-MED-V1-DRAFT'
};
let uiTemplate = 'DEFAULT';

function requestContext() {
  try { return $('Check Method Execute').first().json || {}; } catch (_) { return {}; }
}
function requestId() {
  const request = requestContext();
  try { return request._requestContext?.requestId || $('Enforce API Capability').first().json.auth?.requestId || null; } catch (_) { return request._requestContext?.requestId || null; }
}
function apiCode() { return String(requestContext().body?.ApiCode || ''); }
function firstValue(rows, keys) {
  for (const row of rows) for (const key of keys) {
    if (row?.[key] !== undefined && row[key] !== null && String(row[key]).trim() !== '') return row[key];
  }
  return null;
}
function metadata(rows) {
  return {
    ruleVersion: firstValue(rows, ['RuleVersion', 'ruleVersion']) || RULE_VERSIONS[apiCode().toLowerCase()] || null,
    source: firstValue(rows, ['DataSource', 'RuleSource', 'RevenueBasis', 'source']),
    dataWindow: firstValue(rows, ['DataWindow', 'dataWindow', 'AsOfDate']),
    updatedAt: firstValue(rows, ['StockUpdatedAt', 'UpdatedAt', 'updatedAt']),
    scope: firstValue(rows, ['WarehouseScope', 'Scope', 'scope']),
    freshness: firstValue(rows, ['FreshnessStatus', 'StockDataStatus', 'freshness'])
  };
}
function contractStatus(code, success) {
  if (code === 'NO_DATA') return 'NO_DATA';
  if (code === 'OUT_OF_SCOPE' || code === 'FORBIDDEN' || code === 'UNAUTHORIZED') return 'OUT_OF_SCOPE';
  if (code === 'VALIDATION_ERROR') return 'VALIDATION_ERROR';
  if (code === 'SYSTEM_ERROR') return 'SYSTEM_ERROR';
  return success ? 'SUCCESS' : 'SYSTEM_ERROR';
}
function envelope(success, code, message, data, httpStatus, extra) {
  const rows = Array.isArray(data) ? data : [];
  const status = contractStatus(code, success);
  return [{ json: {
    success,
    code,
    status,
    errorCode: ['OUT_OF_SCOPE', 'VALIDATION_ERROR', 'SYSTEM_ERROR'].includes(status) ? code : null,
    message,
    data: rows,
    count: rows.length,
    ApiCode: apiCode(),
    contractVersion: CONTRACT_VERSION,
    requestId: requestId(),
    metadata: metadata(rows),
    _httpStatus: httpStatus,
    uiTemplate,
    ...(extra || {})
  } }];
}
// P0_CART_PREVIEW_RESPONSE: create the read-only cart envelope from verified input.
// The SQL batch contains no stored-procedure call for this ApiCode.
if (apiCode().toLowerCase() === '@lap_don_hang') {
  let verifiedParams = {};
  try { verifiedParams = $('Enforce API Capability').first().json.body?.params || {}; } catch (_) {}
  uiTemplate = 'CART';
  return envelope(true, 'OK', 'Đã chuẩn bị giỏ hàng xem trước. Chưa ghi dữ liệu thật.', [{
    MaKhachHang: verifiedParams['@MaKhachHang'] || verifiedParams['@ObjectID'] || '',
    ItemList: verifiedParams['@ItemList'] || '[]',
    PreviewOnly: true
  }], 200, { transactionOutcome: 'NOT_STARTED', previewOnly: true });
}
function decodeUtf8(value) {
  if (typeof value !== 'string') return value;
  try { return decodeURIComponent(escape(value)); } catch (_) { return value; }
}
function clean(value) {
  if (Array.isArray(value)) return value.map(clean);
  if (!value || typeof value !== 'object') return decodeUtf8(value);
  return Object.fromEntries(Object.entries(value).map(([key, child]) => [key, clean(child)]));
}
function messageOf(row) { return row?.Msg ?? row?.msg ?? row?.Message ?? row?.message ?? null; }
function isMessageRow(row) {
  return Boolean(row && messageOf(row) !== null && (
    row.MsgType !== undefined || row.msgType !== undefined || row.Severity !== undefined ||
    row.severity !== undefined || row.Code !== undefined || row.code !== undefined
  ));
}
function classifyMessage(row) {
  const message = String(messageOf(row) || '');
  const marker = String(row.Severity ?? row.severity ?? row.Code ?? row.code ?? '').toUpperCase();
  const numericType = Number(row.MsgType ?? row.msgType ?? 0);
  if (/IDEMPOTENCY_IN_PROGRESS/.test(marker)) return { code: 'IDEMPOTENCY_IN_PROGRESS', status: 409 };
  if (/IDEMPOTENCY_REPLAY/.test(marker)) return { code: 'IDEMPOTENCY_REPLAY', status: 200 };
  if (/SYSTEM|FATAL|EXCEPTION/.test(marker)) return { code: 'SYSTEM_ERROR', status: 500 };
  if (/NO_DATA/.test(marker)) return { code: 'NO_DATA', status: 200 };
  if (/OUT_OF_SCOPE|FORBIDDEN/.test(marker) || /không có quyền|không được cấp|phân quyền|phạm vi|bị khóa|forbidden|permission/i.test(message)) {
    return { code: 'OUT_OF_SCOPE', status: 403 };
  }
  if (/VALIDATION|MISSING_PARAMETER/.test(marker) || /vui lòng|thiếu|không hợp lệ|bắt buộc|cung cấp|chọn khách hàng/i.test(message)) {
    return { code: 'VALIDATION_ERROR', status: 422 };
  }
  if (/WARNING|WARN/.test(marker)) return { code: 'WARNING', status: 200 };
  if (numericType > 0 || /BUSINESS|ERROR/.test(marker)) return { code: 'VALIDATION_ERROR', status: 422 };
  return { code: 'INFO', status: 200 };
}

let payload = clean((items || []).map((item) => item.json));
if (payload.length === 1 && payload[0]?.[JSON_KEY] !== undefined) {
  try {
    const parsed = JSON.parse(payload[0][JSON_KEY]);
    payload = Array.isArray(parsed) ? clean(parsed) : [clean(parsed)];
  } catch (_) {
    return envelope(false, 'SYSTEM_ERROR', 'Không thể xử lý kết quả từ hệ thống.', [], 500);
  }
}

const metadataIndex = payload.findIndex((row) => row?.Metadata_UiTemplate !== undefined);
if (metadataIndex !== -1) {
  const uiMetadata = payload.splice(metadataIndex, 1)[0];
  uiTemplate = uiMetadata.Metadata_UiTemplate || 'DEFAULT';
  if (uiTemplate === 'CART') {
    return envelope(true, 'OK', messageOf(uiMetadata) || 'Đã chuẩn bị dữ liệu giỏ hàng.', [{ MaKhachHang: uiMetadata.MaKhachHang, ItemList: uiMetadata.ItemList }], 200);
  }
}

const messageRows = payload.filter(isMessageRow);
const replayMessage = messageRows.find((row) => /IDEMPOTENCY_REPLAY/i.test(String(row.Severity ?? row.severity ?? '')));
if (replayMessage) return envelope(true, 'IDEMPOTENCY_REPLAY', String(messageOf(replayMessage)), [], 200, { transactionOutcome: 'NOT_STARTED' });

const errorMessage = messageRows.map((row) => ({ row, result: classifyMessage(row) })).find((entry) => entry.result.status >= 400);
if (errorMessage) {
  const safeMessage = errorMessage.result.code === 'SYSTEM_ERROR' ? 'Hệ thống chưa thể xử lý yêu cầu.' : String(messageOf(errorMessage.row));
  return envelope(false, errorMessage.result.code, safeMessage, [], errorMessage.result.status, { transactionOutcome: 'NOT_STARTED' });
}

const rawDataRows = payload.filter((row) => {
  if (!row || isMessageRow(row) || row[JSON_KEY] !== undefined || row.error) return false;
  const keys = Object.keys(row).filter((key) => key !== 'JSON_KEY' && !key.startsWith('Metadata_'));
  return keys.some((key) => row[key] !== null && row[key] !== undefined && String(row[key]).trim() !== '');
});
const dataRows = apiCode().toLowerCase() === '@tim_san_pham_theo_trieu_chung'
  ? rawDataRows.map((row) => ({
      ...row,
      PhysicalStock: null,
      AvailableStock: null,
      StockDataStatus: row.StockDataStatus || 'PHYSICAL_STOCK_NOT_QUERIED',
      RecommendationStatus: row.RecommendationStatus || 'REFERENCE_ONLY_MEDICAL_REVIEW_REQUIRED',
      MedicalDisclaimer: row.MedicalDisclaimer || 'Thông tin chỉ để tham khảo; không thay thế chẩn đoán, kê đơn hoặc tư vấn của người có chuyên môn.',
      RuleVersion: row.RuleVersion || 'BR-MED-V1-DRAFT'
    }))
  : rawDataRows;
const informational = messageRows[0];
if (dataRows.length === 0) {
  const informationalCode = informational ? classifyMessage(informational).code : 'NO_DATA';
  return envelope(true, informationalCode, informational ? String(messageOf(informational)) : 'Không tìm thấy dữ liệu.', [], 200);
}

let extra = {};
let isAgent = false;
let sessionId = 'unknown';
try {
  const request = requestContext();
  isAgent = Boolean(request?._isAgent);
  sessionId = request?.body?.sessionId || sessionId;
} catch (_) {}
if (isAgent) {
  let cacheId = sessionId + '_' + Math.random().toString(36).slice(2, 11);
  try {
    const crypto = require('crypto');
    cacheId = crypto.createHmac('sha256', 'Medstand_Enterprise_Secret').update(sessionId + '_' + ($execution ? $execution.id : 'local')).digest('hex');
  } catch (_) {}
  const now = Date.now();
  const ttl = 30 * 60 * 1000;
  try {
    const staticData = $getWorkflowStaticData('global');
    staticData.dataCache ||= {};
    for (const key of Object.keys(staticData.dataCache)) if (now - Number(staticData.dataCache[key]?.timestamp || 0) > ttl) delete staticData.dataCache[key];
    staticData.dataCache[cacheId] = { timestamp: now, data: dataRows };
  } catch (_) {}
  try {
    global.__MEDSTAND_CACHE__ ||= {};
    global.__MEDSTAND_CACHE__[cacheId] = { timestamp: now, data: dataRows };
  } catch (_) {}
  extra = { Cache_ID: cacheId, summary: 'Đã tìm thấy ' + dataRows.length + ' kết quả. Mã Ngăn Kéo: ' + cacheId };
}
return envelope(true, 'OK', informational ? String(messageOf(informational)) : 'Tìm thấy ' + dataRows.length + ' kết quả.', dataRows, 200, extra);`;

const commonErrorBody = (source, kind) => {
  if (kind === 'validation') return `={{ JSON.stringify({ success:false, code:'VALIDATION_ERROR', status:'VALIDATION_ERROR', errorCode:'VALIDATION_ERROR', message:$('${source}').first().json.validation?.message || 'Validation failed.', data:[], count:0, ApiCode:$('Check Method Execute').first().json.body?.ApiCode || '', contractVersion:'1.0.0-draft', requestId:$('${source}').first().json.auth?.requestId || null, metadata:{ruleVersion:null,source:null,dataWindow:null,updatedAt:null,scope:null,freshness:null} }) }}`;
  const codeExpression = kind === 'auth'
    ? `$('${source}').first().json.auth?.code || 'UNAUTHORIZED'`
    : `$('${source}').first().json.authorization?.code || 'FORBIDDEN'`;
  const messageExpression = kind === 'auth'
    ? `$('${source}').first().json.auth?.message || 'Authentication failed.'`
    : `$('${source}').first().json.authorization?.message || 'Authorization failed.'`;
  return `={{ JSON.stringify({ success:false, code:${codeExpression}, status:'OUT_OF_SCOPE', errorCode:${codeExpression}, message:${messageExpression}, data:[], count:0, ApiCode:$('Check Method Execute').first().json.body?.ApiCode || '', contractVersion:'1.0.0-draft', requestId:$('${source}').first().json.auth?.requestId || null, metadata:{ruleVersion:null,source:null,dataWindow:null,updatedAt:null,scope:null,freshness:null} }) }}`;
};
node(execute, 'Respond Auth Error (Execute)').parameters.responseBody = commonErrorBody('Is Authenticated? (Execute)', 'auth');
node(execute, 'Respond Authorization Error (Execute)').parameters.responseBody = commonErrorBody('Is API Authorized? (Execute)', 'authorization');
node(execute, 'Respond Validation Error (Execute)').parameters.responseBody = commonErrorBody('Is API Request Valid?', 'validation');

save(executePath, execute);

const main = load(mainPath);
const mainValidateParams = node(main, 'LIB ValidateParams');
if (!mainValidateParams.parameters.jsCode.includes('APPROVED_NATURAL_LANGUAGE_APIS')) {
  const validateAnchor = "const apiCode = $json.apiCode || '';\nconst rawParams = $json.params || {};";
  if (!mainValidateParams.parameters.jsCode.includes(validateAnchor)) {
    throw new Error('Main validation anchor changed; refusing unsafe natural-language rewrite.');
  }
  mainValidateParams.parameters.jsCode = mainValidateParams.parameters.jsCode.replace(validateAnchor, `const apiCode = String($json.apiCode || $json.intent || '').toLowerCase();
const rawParams = $json.params || {};
const rawMessage = String($('LIB NormalizeInput').first().json.rawMessage || '').trim();

// APPROVED_NATURAL_LANGUAGE_APIS: free text may only resolve to these 24 read APIs.
const APPROVED_NATURAL_LANGUAGE_APIS = new Set([
  '@doanh_so', '@hoa_don', '@hoa_don_chi_tiet', '@don_hang',
  '@cham_diem_kh', '@cong_no_khach_hang', '@cong_no_chi_tiet',
  '@tich_luy', '@tuyen_ban_hang', '@goi_ydon_hang', '@upsell_goi_y',
  '@goi_ydon_thuoc', '@danh_sach_tonkho', '@tra_cuu_san_pham',
  '@san_pham_trong_tam', '@de_xuat_khuyen_mai', '@danh_muc', '@khao_sat360',
  '@danh_sach_cau_hoi_khao_sat', '@kiem_tra_khao_sat',
  '@kiem_tra_khao_sat_ngay', '@lich_su_khao_sat', '@thong_bao',
  '@tim_san_pham_theo_trieu_chung'
]);
const isRagOnly = !apiCode || apiCode === 'casual_chat' || apiCode === 'null';
const isExplicitCartPreview = apiCode === '@lap_don_hang' && /^@lap_don_hang(?:\\s|$)/i.test(rawMessage);
if (!isRagOnly && !APPROVED_NATURAL_LANGUAGE_APIS.has(apiCode) && !isExplicitCartPreview) {
  const isMutation = ['@lap_don_hang', '@khach_hang_insert', '@san_pham_trong_tam_import'].includes(apiCode);
  return [{ json: {
    isValid: false,
    cleanParams: {},
    errorCode: isMutation ? 'PILOT_READ_ONLY' : 'API_NOT_ALLOWLISTED',
    errorMsg: isMutation
      ? 'Pilot hiện chỉ cho phép xem trước; chưa ghi dữ liệu thật. Hãy dùng @lap_don_hang để dựng giỏ xem trước.'
      : 'Yêu cầu này chưa thuộc 24 API đã được duyệt.',
    validationLevel: isMutation ? 'PREVIEW_ONLY' : 'ALLOWLIST'
  } }];
}
if (isRagOnly) {
  return [{ json: { isValid: true, cleanParams: rawParams, errorMsg: null, validationLevel: 'RAG_ONLY' } }];
}`);
}
node(main, 'SQL Stock & Price Symptom').parameters.query = `SELECT
    I.ItemID,
    I.ItemName,
    I.Unit,
    COALESCE(I.NguyenGia, 0) AS Price,
    CAST(NULL AS DECIMAL(18, 2)) AS AvailableStock,
    N'PHYSICAL_STOCK_NOT_QUERIED' AS StockDataStatus
FROM CF_ItemTbl I
WHERE ISNULL(I.isDisable, 0) = 0
  AND I.ItemID IN ({{ $json.items.length > 0 ? $json.items.map(i => "'" + i.itemId.replace(/'/g, "''") + "'").join(',') : "''" }})`;

const symptom = node(main, 'Generate Symptom Response');
const originalSymptomCode = symptom.parameters.jsCode;
const stockLine = "  const stock = sqlInfo.TonKho ? `Còn ${Number(sqlInfo.TonKho)} ${sqlInfo.Unit || 'sản phẩm'}` : 'Hết hàng';";
const payloadLine = '    TonKho: sqlInfo.TonKho || 0,';
const alreadyFailSafe = originalSymptomCode.includes('PHYSICAL_STOCK_NOT_QUERIED')
  && originalSymptomCode.includes('AvailableStock: null')
  && !originalSymptomCode.includes('sqlInfo.TonKho');
if ((!originalSymptomCode.includes(stockLine) || !originalSymptomCode.includes(payloadLine)) && !alreadyFailSafe) {
  throw new Error('Symptom response anchors changed; refusing unsafe rewrite.');
}
symptom.parameters.jsCode = originalSymptomCode
  .replace(stockLine, "  const stock = 'Tồn khả dụng chưa xác định';")
  .replace(payloadLine, "    AvailableStock: null,\n    StockDataStatus: sqlInfo.StockDataStatus || 'PHYSICAL_STOCK_NOT_QUERIED',")
  .replace("status: 'success', message: 'Không tìm thấy", "status: 'NO_DATA', contractVersion: '1.0.0-draft', metadata: { ruleVersion: null, source: 'QDRANT_REFERENCE_ONLY', dataWindow: null, updatedAt: null, scope: null, freshness: 'PHYSICAL_STOCK_NOT_QUERIED' }, message: 'Không tìm thấy")
  .replace("status: 'success',\n    message: replyText,", "status: 'SUCCESS',\n    contractVersion: '1.0.0-draft',\n    metadata: { ruleVersion: null, source: 'QDRANT_REFERENCE_ONLY', dataWindow: null, updatedAt: null, scope: null, freshness: 'PHYSICAL_STOCK_NOT_QUERIED' },\n    message: replyText,");
symptom.parameters.jsCode = symptom.parameters.jsCode
  .replace("return [{ json: { status: 'NO_DATA',", "return [{ json: { success: true, status: 'NO_DATA', code: 'NO_DATA', errorCode: null,")
  .replace("data: [], count: 0, apiCode: '@upsell_goi_y' } }];", "data: [], count: 0, ApiCode: '@upsell_goi_y' } }];")
  .replace("json: {\n    status: 'SUCCESS',", "json: {\n    success: true,\n    status: 'SUCCESS',\n    code: 'OK',\n    errorCode: null,")
  .replace("count: dataPayload.length,\n    apiCode: '@upsell_goi_y',", "count: dataPayload.length,\n    ApiCode: '@upsell_goi_y',");

node(main, 'Handle SQL Error').parameters.jsCode = `const err = $input.first().json || {};
const requestId = err.requestId || null;
return [{ json: {
  success: false,
  status: 'SYSTEM_ERROR',
  code: 'SYSTEM_ERROR',
  errorCode: 'SYSTEM_ERROR',
  message: 'Dạ, hệ thống đang xử lý chậm, anh/chị thử lại sau vài giây nhé!',
  data: [], count: 0,
  ApiCode: $('LIB ConfidenceDecision').first().json.intent || '',
  contractVersion: '1.0.0-draft',
  requestId,
  metadata: { ruleVersion:null, source:null, dataWindow:null, updatedAt:null, scope:null, freshness:null },
  needsRagFallback: false
} }];`;

node(main, 'Format Response').parameters.jsCode = `const k = $input.first().json || {};
const apiCode = $('LIB ConfidenceDecision').first().json.intent || '';
const origMsg = $('LIB NormalizeInput').first().json.rawMessage || '';
const contractVersion = k.contractVersion || '1.0.0-draft';
const emptyMetadata = { ruleVersion:null, source:null, dataWindow:null, updatedAt:null, scope:null, freshness:null };
const metadata = { ...emptyMetadata, ...(k.metadata || {}) };

if (apiCode === 'casual_chat' || apiCode === 'null' || !apiCode) {
  return [{ json: { success:true, status:'SUCCESS', code:'OK', errorCode:null, message:'', data:[], count:0, ApiCode:apiCode, contractVersion, requestId:k.requestId || null, metadata, needsRagFallback:true, originalMessage:origMsg } }];
}

const errorStatuses = ['OUT_OF_SCOPE', 'VALIDATION_ERROR', 'SYSTEM_ERROR'];
if (k.success === false || errorStatuses.includes(k.status)) {
  const status = errorStatuses.includes(k.status) ? k.status : 'SYSTEM_ERROR';
  return [{ json: { success:false, status, code:k.code || status, errorCode:k.errorCode || k.code || status, message:k.message || 'Có lỗi xảy ra.', data:[], count:0, ApiCode:apiCode, contractVersion, requestId:k.requestId || null, metadata, needsRagFallback:false } }];
}

const data = Array.isArray(k.data) ? k.data : [];
const count = Number(k.count ?? data.length) || 0;
if (k.status === 'NO_DATA' || count === 0 || data.length === 0) {
  const useRag = ['@goi_ydon_thuoc', '@upsell_goi_y', '@tra_cuu_san_pham', '@san_pham_trong_tam', '@de_xuat_khuyen_mai'].includes(apiCode);
  return [{ json: { success:true, status:'NO_DATA', code:'NO_DATA', errorCode:null, message:useRag ? '' : (k.message || 'Dạ, hệ thống hiện không tìm thấy dữ liệu phù hợp.'), data:[], count:0, ApiCode:apiCode, contractVersion, requestId:k.requestId || null, metadata, needsRagFallback:useRag, originalMessage:origMsg } }];
}

return [{ json: { success:true, status:'SUCCESS', code:k.code || 'OK', errorCode:null, message:k.message || ('Tìm thấy ' + count + ' kết quả.'), data, count, ApiCode:apiCode, contractVersion, requestId:k.requestId || null, metadata, needsRagFallback:false } }];`;

node(main, 'LIB SaveContext').parameters.jsCode = `const inp = $input.first().json || {};
const sessionId = $('LIB NormalizeInput').first().json.sessionId || 'default';
const parsedIntent = $('LIB ConfidenceDecision').first().json || {};
const staticData = $getWorkflowStaticData('global');
staticData['ctx_' + sessionId] = JSON.stringify({
  lastMaKhachHang: parsedIntent.params?.['@MaKhachHang'] || '',
  lastMaSanPham: parsedIntent.params?.['@timkiem'] || parsedIntent.params?.['@Keyword'] || '',
  lastIntent: parsedIntent.intent || inp.ApiCode || inp.apiCode || '',
  updatedAt: Date.now()
});
const apiCode = inp.ApiCode || inp.apiCode || parsedIntent.intent || '';
return [{ json: { ...inp, ApiCode: apiCode } }];`;

const respondFast = node(main, 'Respond Fast');
respondFast.parameters.responseBody = "={{ JSON.stringify($json) }}";
respondFast.parameters.options.responseCode = "={{ $json.status === 'OUT_OF_SCOPE' ? 403 : ($json.status === 'VALIDATION_ERROR' ? 422 : ($json.status === 'SYSTEM_ERROR' ? 500 : 200)) }}";

const mainValidation = node(main, 'Respond Validation Error');
mainValidation.parameters.responseBody = "={{ JSON.stringify({ success:false, status:'VALIDATION_ERROR', code:$json.errorCode || 'VALIDATION_ERROR', errorCode:$json.errorCode || 'VALIDATION_ERROR', message:$json.errorMsg || 'Dạ, thông tin chưa đủ để tra cứu ạ!', data:[], count:0, ApiCode:$('LIB ConfidenceDecision').first().json.intent || '', contractVersion:'1.0.0-draft', requestId:$('Webhook AI Chat').first().json.headers?.['x-request-id'] || null, metadata:{ruleVersion:null,source:null,dataWindow:null,updatedAt:null,scope:null,freshness:null} }) }}";
mainValidation.parameters.options.responseCode = "={{ $json.errorCode === 'PILOT_READ_ONLY' || $json.errorCode === 'API_NOT_ALLOWLISTED' ? 403 : 422 }}";

save(mainPath, main);
console.log('BUSINESS_RULE_V1_N8N_SOURCE_APPLIED');
