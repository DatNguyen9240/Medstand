'use strict';

/* Preflight cho SEARCH-005: API_CongNoKhachHang_AI không còn tự lấy TOP 1 khi
   tên khách khớp NHIỀU khách cùng lúc. Bắt buộc, theo khuôn
   scripts/deploy_core011_customer_search_fix.js:
   1) Chạy bản CŨ trước, chụp lại hành vi khớp-đúng-1 để đối chiếu không hồi quy.
   2) Deploy bản MỚI trong CÙNG transaction.
   3) Chạy lại đúng input đó — kết quả phải giống hệt bản cũ (không hồi quy).
   4) Chạy input biết trước khớp NHIỀU khách ("Tâm Đức") — phải ra NEEDS_SELECTION
      thay vì một khách bất kỳ.
   --preflight thì luôn ROLLBACK ở cuối. */
const fs = require('fs');
const path = require('path');
const sql = require('mssql');

const ROOT = path.resolve(__dirname, '..');
const SQL_FILE = 'sql/Module_Common_API_CongNoKhachHang_AI.sql';

function readEnv() {
  const values = {};
  for (const line of fs.readFileSync(path.join(ROOT, '.env'), 'utf8').split(/\r?\n/)) {
    const match = line.match(/^\s*([^#=]+)=(.*)$/);
    if (match) values[match[1].trim()] = match[2].trim();
  }
  return values;
}

function batches(source) {
  return source.replace(/^﻿/, '').split(/^\s*GO\s*(?:--.*)?$/gim)
    .map((part) => part.trim()).filter(Boolean);
}

function expect(condition, message) {
  if (!condition) throw new Error(message);
}

async function callCongNo(request, username, maKhachHang) {
  const r = new sql.Request(request)
    .input('DenNgay', sql.DateTime, null)
    .input('MaKhachHang', sql.NVarChar(100), maKhachHang || '')
    .input('Username', sql.VarChar(50), username);
  const result = await r.execute('dbo.API_CongNoKhachHang_AI');
  return result.recordset || [];
}

async function main() {
  const preflight = process.argv.includes('--preflight');
  const env = { ...readEnv(), ...process.env };
  if (String(env.TEST_DB_DATABASE || '').toLowerCase() !== 'medtest') throw new Error('Deploy is medtest-only.');

  const pool = await sql.connect({
    server: env.TEST_DB_SERVER,
    port: Number(env.TEST_DB_PORT || 1433),
    database: env.TEST_DB_DATABASE,
    user: env.TEST_DB_USER,
    password: env.TEST_DB_PASSWORD,
    options: { encrypt: false, trustServerCertificate: true },
    connectionTimeout: 15000,
    requestTimeout: 120000,
    pool: { max: 1, min: 0, idleTimeoutMillis: 10000 },
  });

  const transaction = new sql.Transaction(pool);
  let began = false;
  const evidence = {};
  try {
    await transaction.begin(sql.ISOLATION_LEVEL.SERIALIZABLE);
    began = true;

    const username = 'QLBH013.MED';

    // Tìm một khách trong scope có tên đủ dài để làm input khớp-đúng-1 duy nhất
    // (KHÔNG dùng từ chung chung để tránh tình cờ trùng nhiều khách khác).
    const sample = await new sql.Request(transaction).query(`
      SELECT TOP 1 O.ObjectID, O.ObjectName
      FROM dbo.CF_ObjectTbl O
      INNER JOIN dbo.AR_GetObjectByUserFnc('${username}') S ON S.ObjectID = O.ObjectID
      WHERE O.isCustomer = 1 AND COALESCE(O.isDisable,0) = 0
        AND O.ObjectID NOT LIKE '%-%-%-%-%'
        AND LEN(COALESCE(O.ObjectName,'')) >= 15
        AND (SELECT COUNT(*) FROM dbo.CF_ObjectTbl O2 WHERE O2.ObjectName = O.ObjectName) = 1
      ORDER BY O.ObjectID`);
    expect(sample.recordset.length === 1, 'Không tìm được khách mẫu (tên duy nhất trong toàn hệ thống) để test hồi quy.');
    const uniqueTarget = sample.recordset[0];
    evidence.UniqueTarget = uniqueTarget;

    // Xác nhận trước: input này phải khớp ĐÚNG 1 khách trên toàn hệ thống (không riêng gì scope).
    const dupCheck = await new sql.Request(transaction).query(`
      SELECT COUNT(DISTINCT ObjectID) AS n FROM dbo.CF_ObjectTbl
      WHERE (ObjectID LIKE N'%' + dbo.ufn_clean_customer_name(N'${uniqueTarget.ObjectName.replace(/'/g, "''")}') + N'%'
             OR ObjectName LIKE N'%' + N'${uniqueTarget.ObjectName.replace(/'/g, "''")}' + N'%')
        AND ISNULL(isCustomer,0)=1 AND ISNULL(isDisable,0)=0`);
    expect(Number(dupCheck.recordset[0].n) === 1, `Khách mẫu '${uniqueTarget.ObjectID}' phải là khớp duy nhất, thực tế ${dupCheck.recordset[0].n} khách.`);

    // ── 1) Hành vi TRƯỚC khi sửa (bản gốc trong DB) ─────────────────────────
    const before = await callCongNo(transaction, username, uniqueTarget.ObjectName);
    expect(before.length >= 1, `Bản CŨ phải trả được công nợ cho '${uniqueTarget.ObjectName}'.`);
    evidence.BeforeRow = before[0];

    // ── 2) Deploy bản MỚI trong cùng transaction ────────────────────────────
    let batchCount = 0;
    for (const batch of batches(fs.readFileSync(path.join(ROOT, SQL_FILE), 'utf8'))) {
      await new sql.Request(transaction).batch(batch);
      batchCount += 1;
    }
    evidence.BatchCount = batchCount;

    // ── 3) Regression: cùng input khớp-đúng-1 phải ra kết quả GIỐNG HỆT ─────
    const afterUnique = await callCongNo(transaction, username, uniqueTarget.ObjectName);
    expect(afterUnique.length === before.length, `Regression: số dòng đổi (trước ${before.length}, sau ${afterUnique.length}).`);
    expect(afterUnique[0] && afterUnique[0].MaKH === before[0].MaKH,
      `Regression: khách-đúng-1 phải resolve ra cùng MaKH. Trước=${before[0] && before[0].MaKH}, Sau=${afterUnique[0] && afterUnique[0].MaKH}`);
    expect(Number(afterUnique[0].TongNo) === Number(before[0].TongNo),
      `Regression: TongNo phải giữ nguyên. Trước=${before[0].TongNo}, Sau=${afterUnique[0].TongNo}`);
    expect(afterUnique[0].MsgType === undefined, 'Regression: khớp-đúng-1 không được lẫn vào nhánh NEEDS_SELECTION.');

    // Regression thêm: gõ đúng ObjectID (exact match) vẫn hoạt động bình thường.
    const afterByCode = await callCongNo(transaction, username, uniqueTarget.ObjectID);
    expect(afterByCode.length >= 1 && afterByCode[0].MaKH === uniqueTarget.ObjectID,
      `Regression: gõ đúng mã '${uniqueTarget.ObjectID}' phải resolve đúng khách đó.`);

    // ── 4) Hành vi MỚI: tên khớp NHIỀU khách phải NEEDS_SELECTION ───────────
    // "Tâm Đức" đã biết có nhiều khách trùng trên toàn hệ thống (xác nhận lại tại chỗ).
    const dupName = 'Tâm Đức';
    const dupCountNow = await new sql.Request(transaction).query(`
      SELECT COUNT(DISTINCT ObjectID) AS n FROM dbo.CF_ObjectTbl
      WHERE (ObjectID LIKE '%' + dbo.ufn_clean_customer_name(N'${dupName}') + '%'
             OR ObjectName LIKE N'%${dupName}%')
        AND ISNULL(isCustomer,0)=1 AND ISNULL(isDisable,0)=0`);
    expect(Number(dupCountNow.recordset[0].n) > 1, `Cần dữ liệu có nhiều khách trùng '${dupName}' để test NEEDS_SELECTION, thực tế ${dupCountNow.recordset[0].n}.`);

    const ambiguous = await callCongNo(transaction, 'Admin', dupName);
    expect(ambiguous.length === 1 && Number(ambiguous[0].MsgType) === 2 && ambiguous[0].Code === 'NEEDS_SELECTION',
      `Nhiều khách trùng '${dupName}' phải trả NEEDS_SELECTION, nhận ${JSON.stringify(ambiguous)}`);
    const candidates = JSON.parse(ambiguous[0].CandidateJson);
    expect(Array.isArray(candidates) && candidates.length > 1 && candidates.length <= 8,
      `CandidateJson phải là mảng 2-8 phần tử, nhận ${ambiguous[0].CandidateJson}`);
    expect(candidates.every((c) => c.id && c.label), 'Mỗi candidate phải có id và label.');
    evidence.AmbiguousCandidateCount = candidates.length;

    // Không vô tình ghi audit hay side-effect nào khi rơi vào NEEDS_SELECTION —
    // kiểm tra không có ngoại lệ khi gọi lại nhiều lần (idempotent, chỉ đọc).
    const ambiguousAgain = await callCongNo(transaction, 'Admin', dupName);
    expect(ambiguousAgain[0].Code === 'NEEDS_SELECTION', 'Gọi lại lần 2 vẫn phải NEEDS_SELECTION (không có state rò rỉ).');

    if (preflight) await transaction.rollback();
    else await transaction.commit();
    began = false;

    console.log(JSON.stringify({
      Task: 'SEARCH-005-CONGNO-KHACHHANG-AMBIGUITY-GUARD',
      Status: 'PASS',
      Mode: preflight ? 'PREFLIGHT_ROLLBACK' : 'DEPLOY_COMMIT',
      Evidence: evidence,
    }, null, 2));
  } finally {
    if (began) {
      try { await transaction.rollback(); } catch (_) { /* transaction can already be aborted */ }
    }
    await pool.close();
  }
}

main().catch((error) => {
  console.error(JSON.stringify({ Task: 'SEARCH-005-CONGNO-KHACHHANG-AMBIGUITY-GUARD', Status: 'FAIL', Error: error.message }, null, 2));
  process.exitCode = 1;
});
