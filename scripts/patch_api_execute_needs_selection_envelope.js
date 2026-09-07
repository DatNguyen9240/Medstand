'use strict';

/* SEARCH-005 (n8n envelope) — node "Format Execute Response" trong
   n8n/API_Services/API_Execute.json phân loại message row bằng classifyMessage()
   dựa trên Severity/Code + nội dung Msg. Message NEEDS_SELECTION của tôi
   ("Có nhiều khách hàng trùng khớp, vui lòng chọn.") chứa cụm "vui lòng" nên
   TRƯỚC KHI sửa sẽ bị nhận nhầm thành VALIDATION_ERROR — mất luôn Code lẫn
   CandidateJson trước khi tới được chatbot. Ba chỗ cần sửa trong cùng node:

   1. contractStatus(): thêm nhánh NEEDS_SELECTION riêng, không rơi vào SUCCESS.
   2. classifyMessage(): nhận diện marker NEEDS_SELECTION TRƯỚC nhánh
      VALIDATION_ERROR (thứ tự if/else nên phải chèn trước).
   3. Nhánh "informational" (dataRows.length === 0): khi mã là NEEDS_SELECTION,
      giải JSON CandidateJson trên chính message row và đưa vào envelope() làm
      `data` thay vì mảng rỗng — nếu không, danh sách gợi ý không bao giờ ra
      khỏi n8n dù SQL đã trả đúng. */
const fs = require('fs');
const path = require('path');

const FILE = path.resolve(__dirname, '..', 'n8n', 'API_Services', 'API_Execute.json');
const wf = JSON.parse(fs.readFileSync(FILE, 'utf8'));

const node = wf.nodes.find((n) => n.name === 'Format Execute Response');
if (!node) throw new Error('Node not found: Format Execute Response');

let code = node.parameters.jsCode;
const originalCode = code;

function looseWhitespaceRegex(literal) {
  const escaped = literal.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(escaped.replace(/\s+/g, '\\s+'));
}

function replaceOnce(label, oldLiteral, newLiteral) {
  const pattern = looseWhitespaceRegex(oldLiteral);
  const match = pattern.exec(code);
  if (!match) throw new Error(`Anchor not found for: ${label}`);
  code = code.slice(0, match.index) + newLiteral + code.slice(match.index + match[0].length);
}

// 1. contractStatus
replaceOnce(
  'contractStatus',
  `function contractStatus(code, success) {
  if (code === 'NO_DATA') return 'NO_DATA';`,
  `function contractStatus(code, success) {
  if (code === 'NEEDS_SELECTION') return 'NEEDS_SELECTION';
  if (code === 'NO_DATA') return 'NO_DATA';`
);

// 2. classifyMessage — chèn nhánh NEEDS_SELECTION ngay sau nhánh NO_DATA, trước
//    khi chạm tới nhánh VALIDATION_ERROR (chứa regex khớp nhầm "vui lòng").
replaceOnce(
  'classifyMessage NEEDS_SELECTION branch',
  `if (/NO_DATA/.test(marker)) return { code: 'NO_DATA', status: 200 };`,
  `if (/NO_DATA/.test(marker)) return { code: 'NO_DATA', status: 200 };
  if (/NEEDS_SELECTION/.test(marker)) return { code: 'NEEDS_SELECTION', status: 200 };`
);

// 3. Nhánh informational — trả CandidateJson làm data khi NEEDS_SELECTION.
replaceOnce(
  'informational branch candidate passthrough',
  `const informational = messageRows[0];
if (dataRows.length === 0) {
  const informationalCode = informational ? classifyMessage(informational).code : 'NO_DATA';
  return envelope(true, informationalCode, informational ? String(messageOf(informational)) : 'Không tìm thấy dữ liệu.', [], 200);
}`,
  `const informational = messageRows[0];
if (dataRows.length === 0) {
  const informationalCode = informational ? classifyMessage(informational).code : 'NO_DATA';
  if (informationalCode === 'NEEDS_SELECTION' && informational && informational.CandidateJson) {
    let selectionCandidates = [];
    try { selectionCandidates = JSON.parse(informational.CandidateJson); } catch (_) { selectionCandidates = []; }
    return envelope(true, informationalCode, String(messageOf(informational)), selectionCandidates, 200, { needsSelection: true });
  }
  return envelope(true, informationalCode, informational ? String(messageOf(informational)) : 'Không tìm thấy dữ liệu.', [], 200);
}`
);

if (code === originalCode) throw new Error('No changes applied');
node.parameters.jsCode = code;

fs.writeFileSync(FILE, JSON.stringify(wf, null, 2) + '\n', 'utf8');
console.log('Patched', FILE);
