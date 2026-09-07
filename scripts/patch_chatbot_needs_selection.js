'use strict';

/* SEARCH-005 (chatbot format) — node "Format Response" trong
   n8n/AI_Core/MAIN_ChatBot_V5.json không biết gì về status NEEDS_SELECTION mới
   (do patch_api_execute_needs_selection_envelope.js tạo ra ở tầng API_Execute).
   Không sửa thì NEEDS_SELECTION rơi thẳng vào nhánh "SUCCESS" chung — chatbot
   sẽ coi 8 khách gợi ý như một bảng kết quả bình thường, không có tín hiệu rõ
   ràng để Telegram/web dựng nút chọn (Phase 4). Thêm một nhánh tường minh giữ
   nguyên status/code NEEDS_SELECTION và toàn bộ candidate list. */
const fs = require('fs');
const path = require('path');

const FILE = path.resolve(__dirname, '..', 'n8n', 'AI_Core', 'MAIN_ChatBot_V5.json');
const wf = JSON.parse(fs.readFileSync(FILE, 'utf8'));

const node = wf.nodes.find((n) => n.name === 'Format Response');
if (!node) throw new Error('Node not found: Format Response');

let code = node.parameters.jsCode;
const originalCode = code;

function looseWhitespaceRegex(literal) {
  const escaped = literal.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(escaped.replace(/\s+/g, '\\s+'));
}

const anchor = `const data = Array.isArray(k.data) ? k.data : [];`;
const pattern = looseWhitespaceRegex(anchor);
const match = pattern.exec(code);
if (!match) throw new Error('Anchor not found: data assignment');

const insertion = `${anchor}

// SEARCH-005: nhiều kết quả trùng khớp — giữ nguyên status/code NEEDS_SELECTION
// và toàn bộ danh sách ứng viên, đặt TRƯỚC nhánh NO_DATA/SUCCESS bên dưới vì
// một phản hồi NEEDS_SELECTION vẫn có data (danh sách để chọn), không phải
// "không tìm thấy" và cũng không phải một bảng kết quả bình thường.
if (k.status === 'NEEDS_SELECTION' || k.code === 'NEEDS_SELECTION') {
  const selectionData = Array.isArray(k.data) ? k.data : [];
  return [{ json: { success:true, status:'NEEDS_SELECTION', code:'NEEDS_SELECTION', errorCode:null, message:k.message || 'Có nhiều kết quả trùng khớp, vui lòng chọn.', data:selectionData, count:selectionData.length, ApiCode:apiCode, contractVersion, requestId:k.requestId || null, metadata, needsRagFallback:false, originalMessage:origMsg } }];
}`;

code = code.slice(0, match.index) + insertion + code.slice(match.index + match[0].length);
if (code === originalCode) throw new Error('No changes applied');
node.parameters.jsCode = code;

fs.writeFileSync(FILE, JSON.stringify(wf, null, 2) + '\n', 'utf8');
console.log('Patched', FILE);
