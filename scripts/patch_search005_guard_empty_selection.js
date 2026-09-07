#!/usr/bin/env node
/*
 * SEARCH-005 hardening (pass 2) — không phát NEEDS_SELECTION khi danh sách ứng
 * viên đã bị siết phạm vi (pass 1: patch_search005_scope_candidate_lists.js) trở
 * thành RỖNG.
 *
 * Sau pass 1, truy vấn đếm (@FastMatchCount/@SlowMatchCount/@MatchCount) vẫn đếm
 * theo chi nhánh nên có thể > 1 trong khi @CandidateJson* (đã lọc theo
 * AR_GetObjectByUserFnc) ra NULL. Khi đó SP cũ vẫn trả MsgType=2 kèm CandidateJson
 * NULL — n8n/chatbot rơi vào nhánh "không mở được danh sách", và luồng phát hành
 * selection token có thể lỗi (AI_SelectionToken.CandidateJson NOT NULL).
 *
 * Patch này bọc mỗi lần phát NEEDS_SELECTION trong `IF @CandidateJson* IS NOT NULL`.
 * FOR JSON PATH trả NULL khi 0 dòng => điều kiện này đúng nghĩa "có ít nhất 1 ứng
 * viên trong phạm vi". Khi rỗng: không RETURN, @ResolvedID giữ '' => SP đi tiếp
 * đúng nhánh "không tìm thấy khách" như khi tên không khớp gì.
 */
const fs = require('fs');
const path = require('path');

const FILES = [
  'sql/Module_Common_API_DoanhSo_AI.sql',
  'sql/Module_Common_API_CongNoKhachHang_AI.sql',
  'sql/Module_Common_API_CongNoChiTiet_AI.sql',
  'sql/Module_Common_API_DonHang_AI.sql',
  'sql/Module_Common_API_HoaDon_AI.sql',
  'sql/Module_04_API_TichLuy_AI.sql',
  'sql/Module_01_API_GoiYDonHang_AI.sql',
];

const MARKER = '/* SEARCH-005-SCOPE-GUARD */';

// Bắt đúng khối phát NEEDS_SELECTION đi ngay sau một @CandidateJson* (do pass 1
// đã gắn /* SEARCH-005-SCOPE */ vào chính subquery đó, nhưng ở đây chỉ cần khớp
// phần phát kết quả). $1 = newline, $2 = indent, $3 = cả cụm SELECT..RETURN,
// $4 = tên biến @CandidateJson*.
const RE = /(\r?\n)([ \t]*)(SELECT N'Có nhiều khách hàng trùng khớp, vui lòng chọn\.' AS Msg, 2 AS MsgType,[\s\S]*?'NEEDS_SELECTION' AS Code, (@CandidateJson\w+) AS CandidateJson\r?\n[ \t]*RETURN)/g;

let total = 0;
for (const rel of FILES) {
  const abs = path.resolve(rel);
  let src = fs.readFileSync(abs, 'utf8');

  if (src.includes(MARKER)) {
    console.log(`skip  ${rel} (đã có ${MARKER})`);
    continue;
  }
  if (!src.includes('/* SEARCH-005-SCOPE */')) {
    console.error(`FAIL  ${rel} — chưa chạy pass 1, dừng`);
    process.exitCode = 1;
    continue;
  }

  let hits = 0;
  src = src.replace(RE, (m, nl, indent, body, jsonVar) => {
    hits++;
    return `${nl}${indent}IF ${jsonVar} IS NOT NULL ${MARKER}` +
           `${nl}${indent}BEGIN` +
           `${nl}${indent}    ${body}` +
           `${nl}${indent}END`;
  });

  if (hits === 0) {
    console.error(`FAIL  ${rel} — không tìm thấy khối phát NEEDS_SELECTION`);
    process.exitCode = 1;
    continue;
  }

  fs.writeFileSync(abs, src, 'utf8');
  total += hits;
  console.log(`patch ${rel} — bọc ${hits} khối NEEDS_SELECTION`);
}

console.log(`\nTổng: ${total} khối (kỳ vọng 16).`);
if (total !== 16) { console.error('CẢNH BÁO: khác 16.'); process.exitCode = 1; }
