'use strict';

/* Preflight cho SEARCH-005 áp dụng vào API_ChamDiemKH_AI. Khác các SP trước:
   SP này ĐÃ SẴN có đếm ambiguity (không phải lỗi TOP-1), chỉ thiếu đúng hợp
   đồng NEEDS_SELECTION (MsgType=2 + CandidateJson) mà các API khác đang dùng —
   bản sửa chỉ đổi phần thông báo của nhánh @MatchCount > 1, không đổi logic
   resolve. Do đó preflight tập trung: (a) nhánh ambiguous đổi đúng hợp đồng,
   (b) hành vi khớp-đúng-1/0 giữ nguyên like-for-like trước/sau.
   --preflight thì luôn ROLLBACK ở cuối. */
const fs = require('fs');
const path = require('path');
const sql = require('mssql');

const ROOT = path.resolve(__dirname, '..');
const SQL_FILE = 'sql/Module_03_API_ChamDiemKH_AI.sql';

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

async function callChamDiem(request, username, maKhachHang) {
  const r = new sql.Request(request)
    .input('Username', sql.VarChar(50), username)
    .input('MaKhachHang', sql.NVarChar(100), maKhachHang || '');
  const result = await r.execute('dbo.API_ChamDiemKH_AI');
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

    // ── 0) Baseline: xác nhận SP đang chạy được cho username này (cấu hình
    //        BR-TIER không thiếu) trước khi so sánh trước/sau.
    const baseline = await callChamDiem(transaction, username, '');
    expect(!(baseline.length === 1 && Number(baseline[0].MsgType) === 1),
      `SP đang lỗi cấu hình cho '${username}', không dùng được để test: ${JSON.stringify(baseline[0])}`);

    const candidates = await new sql.Request(transaction).query(`
      SELECT TOP 5 O.ObjectID, O.ObjectName
      FROM dbo.CF_ObjectTbl O
      INNER JOIN dbo.AR_GetObjectByUserFnc('${username}') S ON S.ObjectID = O.ObjectID
      WHERE O.isCustomer = 1 AND COALESCE(O.isDisable,0) = 0
        AND O.ObjectID NOT LIKE '%-%-%-%-%'
        AND LEN(COALESCE(O.ObjectName,'')) >= 15
        AND (SELECT COUNT(*) FROM dbo.CF_ObjectTbl O2 WHERE O2.ObjectName = O.ObjectName) = 1
      ORDER BY O.ObjectID`);
    expect(candidates.recordset.length >= 1, 'Không tìm được ứng viên khách trong scope để test hồi quy.');

    let uniqueTarget = null;
    for (const c of candidates.recordset) {
      const cleanCheck = await new sql.Request(transaction)
        .input('Name', sql.NVarChar(400), c.ObjectName)
        .query(`SELECT COUNT(DISTINCT ObjectID) AS n FROM dbo.CF_ObjectTbl
                WHERE isCustomer = 1 AND COALESCE(isDisable,0) = 0
                  AND (ObjectName LIKE '%' + @Name + '%'
                       OR dbo.ufn_clean_customer_name(ObjectName) LIKE '%' + dbo.ufn_clean_customer_name(@Name) + '%')`);
      if (Number(cleanCheck.recordset[0].n) === 1) { uniqueTarget = c; break; }
    }
    expect(uniqueTarget, 'Không có ứng viên nào fuzzy-unique trong 5 ứng viên rẻ đã lấy.');
    evidence.UniqueTarget = uniqueTarget;

    // ── 1) Hành vi TRƯỚC khi sửa: theo tên và theo mã phải khớp nhau ────────
    const beforeByName = await callChamDiem(transaction, username, uniqueTarget.ObjectName);
    const beforeByCode = await callChamDiem(transaction, username, uniqueTarget.ObjectID);
    expect(JSON.stringify(beforeByName) === JSON.stringify(beforeByCode),
      `Mẫu chọn không ổn: resolve theo tên/mã khác nhau ở bản CŨ.\ntheo tên=${JSON.stringify(beforeByName)}\ntheo mã=${JSON.stringify(beforeByCode)}`);
    evidence.BeforeRowCount = beforeByCode.length;

    // ── 2) Deploy bản MỚI trong cùng transaction ────────────────────────────
    let batchCount = 0;
    for (const batch of batches(fs.readFileSync(path.join(ROOT, SQL_FILE), 'utf8'))) {
      await new sql.Request(transaction).batch(batch);
      batchCount += 1;
    }
    evidence.BatchCount = batchCount;

    // ── 3) Regression: cùng input khớp-đúng-1 phải ra kết quả GIỐNG HỆT ─────
    const afterByName = await callChamDiem(transaction, username, uniqueTarget.ObjectName);
    const afterByCode = await callChamDiem(transaction, username, uniqueTarget.ObjectID);
    expect(JSON.stringify(afterByName) === JSON.stringify(beforeByName), 'Regression: resolve theo tên đổi kết quả.');
    expect(JSON.stringify(afterByCode) === JSON.stringify(beforeByCode), 'Regression: resolve theo mã đổi kết quả.');

    // ── 4) Hành vi MỚI: đổi hợp đồng CUSTOMER_AMBIGUOUS(MsgType=1) → NEEDS_SELECTION(MsgType=2) ──
    const dupName = 'Tâm Đức';
    const ambiguous = await callChamDiem(transaction, 'Admin', dupName);
    // Nếu Admin không có nhiều khách "Tâm Đức" trong scope (Admin thường scope
    // toàn hệ thống nên chắc chắn có), assert rõ ràng thay vì fail mơ hồ.
    expect(ambiguous.length === 1 && Number(ambiguous[0].MsgType) === 2 && ambiguous[0].Code === 'NEEDS_SELECTION',
      `Nhiều khách trùng '${dupName}' phải trả NEEDS_SELECTION, nhận ${JSON.stringify(ambiguous)}`);
    const ambiguousCandidates = JSON.parse(ambiguous[0].CandidateJson);
    expect(Array.isArray(ambiguousCandidates) && ambiguousCandidates.length > 1 && ambiguousCandidates.length <= 8,
      `CandidateJson phải là mảng 2-8 phần tử, nhận ${ambiguous[0].CandidateJson}`);
    evidence.AmbiguousCandidateCount = ambiguousCandidates.length;

    if (preflight) await transaction.rollback();
    else await transaction.commit();
    began = false;

    console.log(JSON.stringify({
      Task: 'SEARCH-005-CHAMDIEMKH-CONTRACT-UPGRADE',
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
  console.error(JSON.stringify({ Task: 'SEARCH-005-CHAMDIEMKH-CONTRACT-UPGRADE', Status: 'FAIL', Error: error.message }, null, 2));
  process.exitCode = 1;
});
