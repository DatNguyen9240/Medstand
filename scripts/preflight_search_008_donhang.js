'use strict';

/* Preflight cho SEARCH-005 áp dụng vào API_DonHang_AI: before/after trên khách
   khớp-đúng-1 để chống hồi quy, cộng một ca khớp nhiều khách phải NEEDS_SELECTION.
   Dùng Admin (RLS mở hoàn toàn) để tách biệt khỏi test scope theo EmployeeID.
   --preflight thì luôn ROLLBACK ở cuối. */
const fs = require('fs');
const path = require('path');
const sql = require('mssql');

const ROOT = path.resolve(__dirname, '..');
const SQL_FILE = 'sql/Module_Common_API_DonHang_AI.sql';

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

async function callDonHang(request, username, maKhachHang) {
  const r = new sql.Request(request)
    .input('Username', sql.VarChar(50), username)
    .input('MaKhachHang', sql.NVarChar(100), maKhachHang || '')
    .input('TuNgay', sql.DateTime, new Date('2016-01-01'))
    .input('DenNgay', sql.DateTime, new Date())
    .input('TopN', sql.Int, 50);
  const result = await r.execute('dbo.API_DonHang_AI');
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

    // Khách có đơn hàng thật (AR_OrderTbl), tên duy nhất toàn hệ thống, ứng viên
    // rẻ để lọc (không self-join O(n²) qua ufn_clean_customer_name).
    // API_DonHang_AI có sẵn một rào "chống ảo giác AI": tên >8 ký tự mà KHÔNG
    // chứa chữ số bị coi là tên do AI bịa và bị xoá về rỗng trước khi vào bước
    // resolve — không liên quan gì tới ambiguity guard mới. Mẫu test phải chứa
    // chữ số trong tên để không bị rào này chặn trước khi resolution chạy.
    const candidates = await new sql.Request(transaction).query(`
      SELECT TOP 5 O.ObjectID, O.ObjectName
      FROM dbo.CF_ObjectTbl O
      WHERE O.isCustomer = 1 AND COALESCE(O.isDisable,0) = 0
        AND O.ObjectID NOT LIKE '%-%-%-%-%'
        AND LEN(COALESCE(O.ObjectName,'')) >= 15
        AND O.ObjectName LIKE '%[0-9]%'
        AND (SELECT COUNT(*) FROM dbo.CF_ObjectTbl O2 WHERE O2.ObjectName = O.ObjectName) = 1
        AND EXISTS (SELECT 1 FROM dbo.AR_OrderTbl D WHERE D.ObjectID = O.ObjectID)
      ORDER BY O.ObjectID`);
    expect(candidates.recordset.length >= 1, 'Không tìm được ứng viên khách có đơn hàng + tên duy nhất để test hồi quy.');

    // Trong các ứng viên rẻ, chọn ứng viên đầu tiên CŨNG fuzzy-unique (kiểm từng
    // cái một, KHÔNG self-join toàn bảng — mỗi lần kiểm chỉ tốn đúng bằng một
    // lần gọi SP thật, không phải O(n²)).
    let uniqueTarget = null;
    for (const c of candidates.recordset) {
      const cleanCheck = await new sql.Request(transaction)
        .input('Name', sql.NVarChar(400), c.ObjectName)
        .query(`SELECT COUNT(DISTINCT ObjectID) AS n FROM dbo.CF_ObjectTbl
                WHERE isCustomer = 1 AND COALESCE(isDisable,0) = 0
                  AND (ObjectID LIKE '%' + dbo.ufn_clean_customer_name(@Name) + '%'
                       OR ObjectName LIKE '%' + @Name + '%'
                       OR dbo.ufn_clean_customer_name(ObjectName) LIKE '%' + dbo.ufn_clean_customer_name(@Name) + '%')`);
      if (Number(cleanCheck.recordset[0].n) === 1) { uniqueTarget = c; break; }
    }
    expect(uniqueTarget, 'Không có ứng viên nào fuzzy-unique trong 5 ứng viên rẻ đã lấy — mở rộng TOP hoặc đổi tiêu chí.');
    evidence.UniqueTarget = uniqueTarget;

    // ── 1) Hành vi TRƯỚC khi sửa ─────────────────────────────────────────────
    const before = await callDonHang(transaction, 'Admin', uniqueTarget.ObjectName);
    expect(before.length >= 1, `Bản CŨ phải trả đơn hàng cho '${uniqueTarget.ObjectName}'.`);
    expect(before[0].ObjectID === uniqueTarget.ObjectID,
      `Mẫu chọn không ổn: bản CŨ resolve '${uniqueTarget.ObjectName}' ra '${before[0].ObjectID}' thay vì '${uniqueTarget.ObjectID}' — chọn lại mẫu khác.`);
    evidence.BeforeRowCount = before.length;
    evidence.BeforeFirstDocumentID = before[0].DocumentID;

    // ── 2) Deploy bản MỚI trong cùng transaction ────────────────────────────
    let batchCount = 0;
    for (const batch of batches(fs.readFileSync(path.join(ROOT, SQL_FILE), 'utf8'))) {
      await new sql.Request(transaction).batch(batch);
      batchCount += 1;
    }
    evidence.BatchCount = batchCount;

    // ── 3) Regression: cùng input khớp-đúng-1 phải ra kết quả GIỐNG HỆT ─────
    const afterUnique = await callDonHang(transaction, 'Admin', uniqueTarget.ObjectName);
    expect(afterUnique.length === before.length, `Regression: số dòng đổi (trước ${before.length}, sau ${afterUnique.length}).`);
    expect(afterUnique.every((row, i) => row.DocumentID === before[i].DocumentID),
      'Regression: danh sách DocumentID phải giữ nguyên thứ tự và nội dung.');
    expect(afterUnique[0] && afterUnique[0].MsgType === undefined, 'Regression: khớp-đúng-1 không được lẫn vào nhánh NEEDS_SELECTION.');

    const afterByCode = await callDonHang(transaction, 'Admin', uniqueTarget.ObjectID);
    expect(afterByCode.length === before.length && afterByCode[0].ObjectID === uniqueTarget.ObjectID,
      `Regression: gõ đúng mã '${uniqueTarget.ObjectID}' phải resolve đúng khách đó.`);

    // ── 4) Hành vi MỚI: tên khớp NHIỀU khách phải NEEDS_SELECTION ───────────
    const dupName = 'Tâm Đức';
    const ambiguous = await callDonHang(transaction, 'Admin', dupName);
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
      Task: 'SEARCH-005-DONHANG-AMBIGUITY-GUARD',
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
  console.error(JSON.stringify({ Task: 'SEARCH-005-DONHANG-AMBIGUITY-GUARD', Status: 'FAIL', Error: error.message }, null, 2));
  process.exitCode = 1;
});
