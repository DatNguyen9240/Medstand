#!/usr/bin/env node
/*
 * SEARCH-005 hardening — giới hạn danh sách ứng viên NEEDS_SELECTION theo đúng
 * phạm vi khách hàng được phân quyền của người gọi.
 *
 * Bối cảnh: bản SEARCH-005 đầu tiên cho 7 SP tra cứu trả về @CandidateJson
 * (mã + tên + SĐT của tối đa 8 khách) chỉ lọc theo @SYS_BranchID. Khi tài khoản
 * có BranchID rỗng (đúng lớp lỗi fail-open CORE-001/UAT-13, và cả 2 tầng
 * "toàn quốc" của Module_01) thì bộ lọc này thành no-op và danh sách rò rỉ
 * tên/SĐT khách ngoài phạm vi. Module_03 (ChamDiemKH) đã làm đúng bằng cách
 * JOIN #AllowedObjects = AR_GetObjectByUserFnc(@Username).
 *
 * Patch này thêm đúng một vị ngữ vào MỖI truy vấn dựng @CandidateJson*:
 *     AND ObjectID IN (SELECT ObjectID FROM dbo.AR_GetObjectByUserFnc(@Username))
 * Không đụng tới truy vấn đếm hay truy vấn tự-resolve (TOP 1) — nên không có
 * flow "tra cứu theo tên" hợp lệ nào đổi hành vi; chỉ nội dung danh sách hiển
 * thị bị siết lại đúng phạm vi.
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

const MARKER = '/* SEARCH-005-SCOPE */';
const SCOPE_PREDICATE =
  'AND ObjectID IN (SELECT ObjectID FROM dbo.AR_GetObjectByUserFnc(@Username)) ' + MARKER;

// Mỗi khối con @CandidateJson* kết thúc bằng "ORDER BY ObjectName <ws> FOR JSON PATH".
// Lazy match từ dòng SELECT TOP 8 tới ORDER BY gần nhất => đúng một khối mỗi lần.
const RE = /(SELECT TOP 8 ObjectID AS id, ObjectName AS label, Phone AS phone\b[\s\S]*?)\r?\n(\s*)ORDER BY ObjectName(\s+)FOR JSON PATH/g;

let totalHits = 0;
for (const rel of FILES) {
  const abs = path.resolve(rel);
  let src = fs.readFileSync(abs, 'utf8');

  if (src.includes(MARKER)) {
    console.log(`skip  ${rel} (đã có ${MARKER})`);
    continue;
  }

  let hits = 0;
  src = src.replace(RE, (m, body, indent, gap) => {
    hits++;
    return `${body}\r\n${indent}  ${SCOPE_PREDICATE}\r\n${indent}ORDER BY ObjectName${gap}FOR JSON PATH`;
  });

  if (hits === 0) {
    console.error(`FAIL  ${rel} — không tìm thấy khối @CandidateJson nào`);
    process.exitCode = 1;
    continue;
  }

  fs.writeFileSync(abs, src, 'utf8');
  totalHits += hits;
  console.log(`patch ${rel} — ${hits} khối @CandidateJson được siết phạm vi`);
}

console.log(`\nTổng: ${totalHits} khối (kỳ vọng 16: 2×6 SP + 4 ở Module_01).`);
if (totalHits !== 16) {
  console.error('CẢNH BÁO: số khối khác 16, kiểm tra lại diff.');
  process.exitCode = 1;
}
