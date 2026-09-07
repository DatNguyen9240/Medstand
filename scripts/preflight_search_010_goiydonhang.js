'use strict';

/* Preflight cho SEARCH-005 áp dụng vào API_GoiYDonHang_AI (4 tầng resolve:
   branch fast/slow, toàn quốc fast/slow). before/after trên khách khớp-đúng-1
   để chống hồi quy, cộng một ca khớp nhiều khách phải NEEDS_SELECTION ngay từ
   tầng đầu tiên tìm thấy >1 khớp (không cần tới dữ liệu tồn kho/lịch sử mua).
   --preflight thì luôn ROLLBACK ở cuối. */
const fs = require('fs');
const path = require('path');
const sql = require('mssql');

const ROOT = path.resolve(__dirname, '..');
const SQL_FILE = 'sql/Module_01_API_GoiYDonHang_AI.sql';

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

async function callGoiY(request, username, maKhachHang) {
  const r = new sql.Request(request)
    .input('Username', sql.VarChar(50), username)
    .input('MaKhachHang', sql.NVarChar(100), maKhachHang || '')
    .input('TopN', sql.Int, 10);
  const result = await r.execute('dbo.API_GoiYDonHang_AI');
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

    const username = 'Admin';

    // Xác nhận Admin có phạm vi kho hợp lệ trước, để không lẫn lỗi
    // WAREHOUSE_SCOPE_UNAVAILABLE vào phép so sánh trước/sau.
    const warehouseCheck = await new sql.Request(transaction)
      .input('U', sql.VarChar(50), username)
      .query('SELECT COUNT(*) AS n FROM dbo.AI_WarehouseByUserFnc(@U, SYSUTCDATETIME())');
    expect(Number(warehouseCheck.recordset[0].n) > 0, `Tài khoản '${username}' không có phạm vi kho hợp lệ để test SP này.`);

    const candidates = await new sql.Request(transaction).query(`
      SELECT TOP 5 O.ObjectID, O.ObjectName
      FROM dbo.CF_ObjectTbl O
      WHERE O.isCustomer = 1 AND COALESCE(O.isDisable,0) = 0
        AND O.ObjectID NOT LIKE '%-%-%-%-%'
        AND LEN(COALESCE(O.ObjectName,'')) >= 15
        AND (SELECT COUNT(*) FROM dbo.CF_ObjectTbl O2 WHERE O2.ObjectName = O.ObjectName) = 1
      ORDER BY O.ObjectID`);
    expect(candidates.recordset.length >= 1, 'Không tìm được ứng viên khách tên duy nhất để test hồi quy.');

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

    // ── 1) Hành vi TRƯỚC khi sửa: resolve theo tên phải cho cùng kết quả với
    //        resolve theo mã (dù kết quả là gợi ý thật hay NEW_CUSTOMER_NO_FULFILLED_HISTORY).
    const beforeByName = await callGoiY(transaction, username, uniqueTarget.ObjectName);
    const beforeByCode = await callGoiY(transaction, username, uniqueTarget.ObjectID);
    expect(JSON.stringify(beforeByName) === JSON.stringify(beforeByCode),
      `Mẫu chọn không ổn: resolve theo tên và theo mã cho kết quả khác nhau ngay ở bản CŨ — chọn lại mẫu khác.\ntheo tên=${JSON.stringify(beforeByName)}\ntheo mã=${JSON.stringify(beforeByCode)}`);
    evidence.BeforeByNameCode = beforeByName[0] && (beforeByName[0].Code || beforeByName[0].MaSanPham);

    // ── 2) Deploy bản MỚI trong cùng transaction ────────────────────────────
    let batchCount = 0;
    for (const batch of batches(fs.readFileSync(path.join(ROOT, SQL_FILE), 'utf8'))) {
      await new sql.Request(transaction).batch(batch);
      batchCount += 1;
    }
    evidence.BatchCount = batchCount;

    // ── 3) Regression: cùng input khớp-đúng-1 phải ra kết quả GIỐNG HỆT ─────
    const afterByName = await callGoiY(transaction, username, uniqueTarget.ObjectName);
    const afterByCode = await callGoiY(transaction, username, uniqueTarget.ObjectID);
    expect(JSON.stringify(afterByName) === JSON.stringify(beforeByName),
      `Regression: resolve theo tên đổi kết quả.\ntrước=${JSON.stringify(beforeByName)}\nsau=${JSON.stringify(afterByName)}`);
    expect(JSON.stringify(afterByCode) === JSON.stringify(beforeByCode),
      'Regression: resolve theo mã đổi kết quả.');
    expect(afterByName[0] && afterByName[0].MsgType === undefined || Number(afterByName[0].MsgType) !== 2,
      'Regression: khớp-đúng-1 không được lẫn vào nhánh NEEDS_SELECTION.');

    // ── 4) Hành vi MỚI: tên khớp NHIỀU khách phải NEEDS_SELECTION ───────────
    const dupName = 'Tâm Đức';
    const ambiguous = await callGoiY(transaction, username, dupName);
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
      Task: 'SEARCH-005-GOIYDONHANG-AMBIGUITY-GUARD',
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
  console.error(JSON.stringify({ Task: 'SEARCH-005-GOIYDONHANG-AMBIGUITY-GUARD', Status: 'FAIL', Error: error.message }, null, 2));
  process.exitCode = 1;
});
