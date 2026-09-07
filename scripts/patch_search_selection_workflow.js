'use strict';

// Re-runnable wiring for the shared, authenticated customer selection round trip.
const fs = require('fs');
const path = require('path');
const file = path.join(__dirname, '..', 'n8n/AI_Core/MAIN_ChatBot_V5.json');
const wf = JSON.parse(fs.readFileSync(file, 'utf8'));
const allowed = ['@cong_no_khach_hang', '@cong_no_chi_tiet', '@doanh_so', '@don_hang', '@hoa_don', '@goi_ydon_hang', '@cham_diem_kh', '@tich_luy'];
const formatter = wf.nodes.find(n=>n.name==='Format Response');
if (!formatter.parameters.jsCode.includes('// SEARCH_EXECUTE_ENVELOPE')) {
  formatter.parameters.jsCode = formatter.parameters.jsCode.replace('const apiCode =', `// SEARCH_EXECUTE_ENVELOPE: an empty/broken upstream is not a valid no-data result.
if (typeof k.success !== 'boolean' || !k.status) {
  return [{json:{success:false,status:'SYSTEM_ERROR',code:'INVALID_EXECUTE_RESPONSE',message:'Hệ thống tra cứu chưa trả kết quả hợp lệ. Vui lòng thử lại.',data:[],needsRagFallback:false}}];
}
const apiCode =`);
}
const normalizer = wf.nodes.find(n=>n.name==='LIB NormalizeInput');
normalizer.parameters.jsCode = normalizer.parameters.jsCode.replace(/\n\/\/ SEARCH_CUSTOMER_TEXT[\s\S]*?(?=const originalText = naturalClassification.originalText;)/, '');
if (!normalizer.parameters.jsCode.includes('// SEARCH_CUSTOMER_TEXT')) {
  const anchor = 'const originalText = naturalClassification.originalText;';
  if (!normalizer.parameters.jsCode.includes(anchor)) throw new Error('Normalizer anchor missing');
  normalizer.parameters.jsCode = normalizer.parameters.jsCode.replace(anchor, String.raw`
// SEARCH_CUSTOMER_TEXT: keep a named customer even when it is not an ERP code.
// Only the eight guarded read procedures accept this target; no mutation routing.
if (${JSON.stringify(allowed)}.includes(naturalClassification.apiCode) && !naturalClassification.entities?.customerId) {
  const match = String(rawMessage).match(/(?:công\s+nợ|cong\s+no|doanh\s+số|doanh\s+thu|doanh\s+so|hóa\s+đơn|hoa\s+don|đơn\s+hàng|don\s+hang|tích\s+lũy|tich\s+luy|chấm\s+điểm|cham\s+diem)\s+(.+)$/i);
  let target = match ? match[1].replace(/^(?:(?:chi\s+tiết|chi\s+tiet|của|cua|cho|khách\s+hàng|khach\s+hang|khách|khach|nhà\s+thuốc|nha\s+thuoc|quầy\s+thuốc|quay\s+thuoc)(?:\s+|$))+/i,'').trim() : '';
  target = target.replace(/\s+(?:từ|tu|đến|den|tháng|thang|năm|nam)\s+\d.*$/i,'').replace(/[?.!]+$/g,'').trim();
  const targetFolded = foldForMatch(target);
  const nonCustomerTarget = /^(?:hom nay|hom qua|thang nay|nam nay|thang truoc|nam truoc|tuan nay|tuan truoc|thang \d|nam \d|tu \d|den \d|nhan vien|san pham|chi nhanh|theo|tat ca|cua toi|toi)(?:\s|$)/.test(targetFolded);
  if (target.length >= 2 && !nonCustomerTarget && !/^(?:khach hang|khach|nha thuoc|quay thuoc|tong hop|chi tiet|bao nhieu|con bao nhieu)$/.test(targetFolded)) {
    naturalClassification.entities = {...naturalClassification.entities,customerId:target};
    naturalClassification.missingFields = (naturalClassification.missingFields || []).filter(f=>f!=='customerId');
    naturalClassification.requiresClarification = naturalClassification.missingFields.length>0;
    if (!naturalClassification.requiresClarification) {
      naturalClassification.responseKey = null;
      naturalClassification.responseMessage = '';
    }
  }
}
// A short CTBH product lookup must use the structured API, including without "sản phẩm".
const promotionMatch = String(rawMessage).trim().match(/^(?:(?:xem|tra cứu|tra cuu)\s+)?CTBH(?:\s+(.+))?$/i);
if (promotionMatch) {
  const term = String(promotionMatch[1] || '').replace(/[?.!]+$/g,'').trim();
  Object.assign(naturalClassification, {
    messageType:'BUSINESS', internalIntent:'PRODUCT_PROMOTION_LOOKUP', apiCode:'@ctbh_san_pham',
    entities:term ? {searchTerm:term} : {}, supported:true, confidence:1,
    missingFields:term ? [] : ['searchTerm'], requiresClarification:!term,
    responseKey:term ? null : 'ASK_PRODUCT_FOR_PROMOTION',
    responseMessage:term ? '' : 'Bạn muốn xem chương trình bán hàng của sản phẩm nào?'
  });
}
` + anchor);
}
const common = `
const norm = $('LIB NormalizeInput').first().json;
const allowed = new Set(${JSON.stringify(allowed)});
const literal = value => "N'" + String(value == null ? '' : value).replace(/'/g, "''") + "'";
const channel = norm.userProfile?.identitySource === 'TELEGRAM_TICKET_VERIFIED' ? 'TELEGRAM' : 'WEB';
const sessionSql = "CONVERT(VARCHAR(64), HASHBYTES('SHA2_256', " + literal(norm.contextKey) + "), 2)";
const identityOk = norm.userProfile?.authenticated && norm.verifiedUserId && norm.contextKey && !norm.inputContractError;
const fail = { success:false, status:'VALIDATION_ERROR', code:'SELECTION_TOKEN_INVALID', message:'Phiên lựa chọn không còn hiệu lực, vui lòng tìm lại.', data:[], needsRagFallback:false };
`;
function code(name, jsCode, x, y) {
  return { name, id: name.toLowerCase().replace(/ /g, '-'), type: 'n8n-nodes-base.code', typeVersion: 2, position: [x, y], parameters: { jsCode } };
}
function branch(name, field, x, y) {
  return { name, id: name.toLowerCase().replace(/ /g, '-').replace(/\?/g, ''), type: 'n8n-nodes-base.if', typeVersion: 2, position: [x,y], parameters: { conditions: { options: { caseSensitive:true, leftValue:'', typeValidation:'strict' }, conditions:[{ id:field, leftValue:'={{ $json.' + field + ' }}', rightValue:true, operator:{type:'boolean',operation:'true',singleValue:true} }], combinator:'and' }, options:{} } };
}
function sqlNode(name,x,y) {
  return { name, id:name.toLowerCase().replace(/ /g,'-'), type:'n8n-nodes-base.microsoftSql', typeVersion:1, position:[x,y], parameters:{ operation:'executeQuery', query:'={{ $json.selectionSql }}' }, credentials:wf.nodes.find(n=>n.name==='SQL Stock & Price Symptom').credentials };
}
const nodes = [
  code('Prepare Selection Request', common + `
const body = norm.originalBody || {};
const selectionRequested = body.action === 'select_result' || body.selection !== undefined;
const selection = body.selection || {};
const token = String(selection.token || '');
const chosen = String(selection.id || '');
const index = selection.index;
const indexValid = Number.isInteger(index) && index >= 0 && index <= 7 && !chosen;
let selectionSql = "SELECT 1 AS MsgType, 'SELECTION_TOKEN_INVALID' AS Code;";
if (selectionRequested && identityOk && /^[a-f0-9]{32}$/.test(token) && (indexValid || (index === undefined && chosen.length > 0 && chosen.length <= 50))) {
  selectionSql = 'DECLARE @Session VARCHAR(100) = ' + sessionSql + '; EXEC dbo.API_SelectionToken_Consume_AI @Username=' + literal(norm.verifiedUserId) + ', @ChannelType=' + literal(channel) + ', @ChannelSessionID=@Session, @SelectionToken=' + literal(token) + (indexValid ? ', @ChosenIndex=' + index : ', @ChosenEntityID=' + literal(chosen)) + ';';
}
return [{json:{...norm, selectionRequested, selectionSql}}];`, 800, -500),
  branch('Selection Requested?', 'selectionRequested',1000,-500),
  sqlNode('Consume Selection Token',1200,-700),
  code('Restore Selection Intent', common + `
const row = $input.first().json;
let pending;
try { pending = JSON.parse(row.PendingRequestJson); } catch (_) {}
if (!identityOk || Number(row.MsgType) !== 0 || row.EntityType !== 'CUSTOMER' || !allowed.has(pending?.ApiCode) || !row.ConsumedEntityID || !pending.Params || typeof pending.Params !== 'object' || Array.isArray(pending.Params)) {
  return [{json:{...fail, selectionValid:false}}];
}
const params = {...pending.Params};
for (const key of Object.keys(params)) {
  if (['username','user','makhachhang','objectid','objectname'].includes(key.replace(/^@/,'').toLowerCase())) delete params[key];
}
params['@MaKhachHang'] = row.ConsumedEntityID;
return [{json:{selectionValid:true, quickIntent:{intent:pending.ApiCode, params, status:'SUCCESS', confidence:1, matchedBy:'KEYWORD', messageType:'BUSINESS', supported:true, requiresClarification:false, missing_fields:[], responseMessage:'', meta:{permission:[], requiresContext:false, cache:false, fallback:'none'}}}}];`,1400,-700),
  branch('Selection Valid?', 'selectionValid',1600,-700),
  code('Prepare Selection Token', common + `
const reply = $input.first().json;
const needsSelection = reply.status === 'NEEDS_SELECTION';
if (!needsSelection) return [{json:{...reply, issueSelection:false}}];
const candidates = Array.isArray(reply.data) ? reply.data.slice(0,8) : [];
const apiCode = reply.ApiCode;
if (!identityOk || !allowed.has(apiCode) || !candidates.length || candidates.some(c => !c.id)) return [{json:{...fail,issueSelection:false}}];
const pending = {ApiCode:apiCode, Params:$('LIB ValidateParams').first().json.cleanParams};
const selectionSql = 'DECLARE @Session VARCHAR(100) = ' + sessionSql + '; EXEC dbo.API_SelectionToken_Issue_AI @Username=' + literal(norm.verifiedUserId) + ', @ChannelType=' + literal(channel) + ', @ChannelSessionID=@Session, @EntityType=' + literal('CUSTOMER') + ', @CandidateJson=' + literal(JSON.stringify(candidates)) + ', @PendingRequestJson=' + literal(JSON.stringify(pending)) + ';';
return [{json:{...reply, data:candidates, issueSelection:true, selectionSql}}];`,3000,600),
  branch('Issue Selection?', 'issueSelection',3200,600),
  sqlNode('Issue Selection Token',3400,800),
  code('Attach Selection Token', `
const row = $input.first().json;
const source = $('Prepare Selection Token').first().json;
const {selectionSql,issueSelection,...reply} = source;
if (Number(row.MsgType) !== 0 || !row.SelectionToken) return [{json:{success:false,status:'SYSTEM_ERROR',code:'SELECTION_ISSUE_FAILED',message:'Không thể tạo phiên lựa chọn. Vui lòng tìm lại.',data:[],needsRagFallback:false}}];
return [{json:{...reply, selection:{token:row.SelectionToken,expiresAt:row.ExpiresAtUtc,entityType:'CUSTOMER'}}}];`,3600,800)
];
for (const node of nodes) {
  const index = wf.nodes.findIndex(n=>n.name===node.name);
  if (index < 0) wf.nodes.push(node); else wf.nodes[index]=node;
}
const edge = name => ({node:name,type:'main',index:0});
function connect(name, ...targets) { wf.connections[name]={main:targets.map(target=>target ? [edge(target)] : [])}; }
connect('LIB NormalizeInput','Prepare Selection Request');
connect('Prepare Selection Request','Selection Requested?');
connect('Selection Requested?','Consume Selection Token','Skip LLM?');
connect('Consume Selection Token','Restore Selection Intent');
connect('Restore Selection Intent','Selection Valid?');
connect('Selection Valid?','Quick Intent Pass-through','Respond Fast');
connect('Format Response','Prepare Selection Token');
connect('Prepare Selection Token','Issue Selection?');
connect('Issue Selection?','Issue Selection Token','Need RAG?');
connect('Issue Selection Token','Attach Selection Token');
connect('Attach Selection Token','LIB SaveContext');
fs.writeFileSync(file,JSON.stringify(wf,null,2)+'\n');
console.log('SEARCH selection workflow updated.');
