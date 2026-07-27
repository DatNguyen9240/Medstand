'use strict';

/**
 * Kiểm chứng mọi câu hỏi mẫu trong scripts/uat13_content.js định tuyến đúng chức năng.
 *
 * Chạy:  node scripts/verify_uat13_questions.js
 *
 * Tài liệu gửi khách không được chứa câu hỏi mà hệ thống không hiểu — script này
 * chặn việc đó ngay ở khâu build.
 */

const { classifyNaturalMessage } = require('./natural_chat_classifier.js');
const { FUNCTIONS, CORE_QUESTIONS, MA_KH, MA_SP, MA_HD } = require('./uat13_content.js');

// Mã đại diện dùng để thay placeholder, lấy từ config/uat/account-fixtures.v1.json.
const SAMPLE = { customer: 'NDB001', product: 'A003', invoice: 'HD123' };

function fill(text) {
  return text
    .split(MA_KH).join(SAMPLE.customer)
    .split(MA_SP).join(SAMPLE.product)
    .split(MA_HD).join(SAMPLE.invoice);
}

/** Chức năng mong đợi cho từng ca chính — khớp với 24 apiCode của MAIN_ChatBot. */
const EXPECTED_ROUTE = {
  'CN-01': '@doanh_so',
  'CN-02': '@hoa_don',
  'CN-03': '@hoa_don_chi_tiet',
  'CN-04': '@don_hang',
  'CN-05': '@cham_diem_kh',
  'CN-06': '@cong_no_khach_hang',
  'CN-07': '@cong_no_chi_tiet',
  'CN-08': '@tich_luy',
  'CN-09': '@tuyen_ban_hang',
  'CN-10': '@goi_ydon_hang',
  'CN-11': '@upsell_goi_y',
  'CN-12': '@goi_ydon_thuoc',
  'CN-13': '@danh_sach_tonkho',
  'CN-14': '@tra_cuu_san_pham',
  'CN-15': '@san_pham_trong_tam',
  'CN-16': '@de_xuat_khuyen_mai',
  'CN-17': '@danh_muc',
  'CN-18': '@khao_sat360',
  'CN-19': '@danh_sach_cau_hoi_khao_sat',
  'CN-20': '@kiem_tra_khao_sat',
  'CN-21': '@kiem_tra_khao_sat_ngay',
  'CN-22': '@lich_su_khao_sat',
  'CN-23': '@thong_bao',
  'CN-24': '@tim_san_pham_theo_trieu_chung',
};

/** Câu hỏi bắt buộc ở mục 05 → chức năng mong đợi (câu 08 là câu tiếp nối, xử lý riêng). */
const CORE_EXPECTED = [
  '@tuyen_ban_hang', '@tuyen_ban_hang', '@tuyen_ban_hang', '@tuyen_ban_hang',
  '@doanh_so', '@doanh_so', '@cong_no_chi_tiet', '@cong_no_chi_tiet',
  '@goi_ydon_hang', '@upsell_goi_y', '@danh_sach_tonkho',
];

/** Câu 08 là câu tiếp nối — chỉ hợp lệ khi nối ngữ cảnh của câu 07. */
const FOLLOW_UP_INDEX = 7;

const failures = [];
const warnings = [];
let checked = 0;

function check(label, question, expected, opts = {}) {
  checked += 1;
  const result = classifyNaturalMessage(fill(question), opts.classifierOptions || {});
  const actual = result.apiCode || result.messageType;
  const ok = actual === expected
    && (!opts.expectMissing || (result.missingFields || []).includes(opts.expectMissing));
  if (!ok) {
    failures.push({
      label,
      question: fill(question),
      expected: opts.expectMissing ? `${expected} + thiếu ${opts.expectMissing}` : expected,
      actual: opts.expectMissing ? `${actual} + thiếu ${JSON.stringify(result.missingFields || [])}` : actual,
    });
  }
  return result;
}

// ── Phụ lục A: 24 chức năng ───────────────────────────────────────────────
const seenRoutes = new Set();
for (const f of FUNCTIONS) {
  const expected = EXPECTED_ROUTE[f.code];
  if (!expected) {
    failures.push({ label: f.code, question: '(thiếu khai báo)', expected: 'có trong EXPECTED_ROUTE', actual: 'không có' });
    continue;
  }
  if (seenRoutes.has(expected)) {
    failures.push({ label: f.code, question: expected, expected: 'chức năng duy nhất', actual: 'trùng với ca trước' });
  }
  seenRoutes.add(expected);

  check(`${f.code} chính`, f.ask, expected);
  check(`${f.code} cách hỏi khác`, f.askAlt, expected);
  if (f.missAsk) {
    // Ca thiếu tham số phải vào đúng chức năng; việc có hỏi lại tham số hay không
    // là kết luận của buổi UAT, nên chỉ cảnh báo chứ không chặn build.
    const r = check(`${f.code}-T`, f.missAsk, expected);
    if (!(r.missingFields || []).length) {
      warnings.push(`${f.code}-T "${f.missAsk}" — hệ thống không tự hỏi lại tham số còn thiếu; đây là điểm cần kết luận trong UAT.`);
    }
  }
}

if (seenRoutes.size !== 24) {
  failures.push({ label: 'Phụ lục A', question: '-', expected: '24 chức năng khác nhau', actual: `${seenRoutes.size} chức năng` });
}

// ── Mục 05: bộ câu hỏi bắt buộc ───────────────────────────────────────────
CORE_QUESTIONS.forEach(([q], i) => {
  const expected = CORE_EXPECTED[i];
  const num = String(i + 1).padStart(2, '0');
  if (i === FOLLOW_UP_INDEX) {
    // Câu tiếp nối phải bám vào ngữ cảnh câu trước, không hỏi lại từ đầu.
    const r = check(`Mục 05 câu ${num}`, q, expected, {
      classifierOptions: { history: fill(CORE_QUESTIONS[i - 1][0]) },
    });
    if (r.entities?.customerId !== SAMPLE.customer) {
      failures.push({
        label: `Mục 05 câu ${num}`,
        question: fill(q),
        expected: `giữ đúng khách ${SAMPLE.customer} của câu trước`,
        actual: `khách = ${r.entities?.customerId || 'không có'}`,
      });
    }
    return;
  }
  check(`Mục 05 câu ${num}`, q, expected);
});

// ── Kết quả ───────────────────────────────────────────────────────────────
if (failures.length) {
  console.error(`\n✗ ${failures.length}/${checked} câu hỏi định tuyến sai:\n`);
  for (const f of failures) {
    console.error(`  ${f.label}`);
    console.error(`    câu hỏi  : ${f.question}`);
    console.error(`    mong đợi : ${f.expected}`);
    console.error(`    thực tế  : ${f.actual}\n`);
  }
  process.exit(1);
}

console.log(`✓ ${checked} câu hỏi mẫu định tuyến đúng, phủ đủ 24 chức năng.`);
for (const w of warnings) console.log(`  ! ${w}`);
