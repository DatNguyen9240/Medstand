'use strict';

/* Preflight cho SEARCH-005 áp dụng vào API_CongNoChiTiet_AI: cùng chiến lược với
   scripts/preflight_search_005_congno_khachhang.js — before/after trên khách
   khớp-đúng-1 để chống hồi quy, cộng một ca khớp nhiều khách phải NEEDS_SELECTION.
   --preflight thì luôn ROLLBACK ở cuối. */
const fs = require('fs');
const path = require('path');
const sql = require('mssql');

const ROOT = path.resolve(__dirname, '..');
const SQL_FILE = 'sql/Module_Common_API_CongNoChiTiet_AI.sql';

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

async function callCongNoChiTiet(request, username, maKhachHang) {
  const r = new sql.Request(request)
    .input('MaKhachHang', sql.NVarChar(100), maKhachHang || '')
    .input('Username', sql.VarChar(50), username)
    .input('DenNgay', sql.DateTime, null);
  const result = await r.execute('dbo.API_CongNoChiTiet_AI');
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

    // Khách có nợ thật (để chắc chắn có dòng trả về) và tên duy nhất toàn hệ thống.
    const sample = await new sql.Request(transaction).query(`
      SELECT TOP 1 O.ObjectID, O.ObjectName
      FROM dbo.CF_ObjectTbl O
      INNER JOIN dbo.AR_GetObjectByUserFnc('${username}') S ON S.ObjectID = O.ObjectID
      CROSS APPLY dbo.SY_GetDebitDocFnc(GETDATE(), O.ObjectID, '131', '') D
      WHERE O.isCustomer = 1 AND COALESCE(O.isDisable,0) = 0
        AND O.ObjectID NOT LIKE '%-%-%-%-%'
        AND LEN(COALESCE(O.ObjectName,'')) >= 15
        AND (SELECT COUNT(*) FROM dbo.CF_ObjectTbl O2 WHERE O2.ObjectName = O.ObjectName) = 1
      GROUP BY O.ObjectID, O.ObjectName
      HAVING SUM(D.DebitAmount - D.CreditAmount) <> 0`);
    expect(sample.recordset.length === 1, 'Không tìm được khách mẫu có công nợ + tên duy nhất để test hồi quy.');
    const uniqueTarget = sample.recordset[0];
    evidence.UniqueTarget = uniqueTarget;

    // ── 1) Hành vi TRƯỚC khi sửa ─────────────────────────────────────────────
    const before = await callCongNoChiTiet(transaction, username, uniqueTarget.ObjectName);
    expect(before.length >= 1, `Bản CŨ phải trả chi tiết công nợ cho '${uniqueTarget.ObjectName}'.`);
    evidence.BeforeRowCount = before.length;
    evidence.BeforeTotalOutstanding = before[0].TotalOutstanding;

    // ── 2) Deploy bản MỚI trong cùng transaction ────────────────────────────
    let batchCount = 0;
    for (const batch of batches(fs.readFileSync(path.join(ROOT, SQL_FILE), 'utf8'))) {
      await new sql.Request(transaction).batch(batch);
      batchCount += 1;
    }
    evidence.BatchCount = batchCount;

    // ── 3) Regression: cùng input khớp-đúng-1 phải ra kết quả GIỐNG HỆT ─────
    const afterUnique = await callCongNoChiTiet(transaction, username, uniqueTarget.ObjectName);
    expect(afterUnique.length === before.length, `Regression: số dòng đổi (trước ${before.length}, sau ${afterUnique.length}).`);
    expect(afterUnique[0] && afterUnique[0].CustomerID === before[0].CustomerID,
      `Regression: phải resolve ra cùng CustomerID. Trước=${before[0] && before[0].CustomerID}, Sau=${afterUnique[0] && afterUnique[0].CustomerID}`);
    expect(Number(afterUnique[0].TotalOutstanding) === Number(before[0].TotalOutstanding),
      'Regression: TotalOutstanding phải giữ nguyên.');
    expect(afterUnique[0].MsgType === undefined, 'Regression: khớp-đúng-1 không được lẫn vào nhánh NEEDS_SELECTION.');

    const afterByCode = await callCongNoChiTiet(transaction, username, uniqueTarget.ObjectID);
    expect(afterByCode.length >= 1 && afterByCode[0].CustomerID === uniqueTarget.ObjectID,
      `Regression: gõ đúng mã '${uniqueTarget.ObjectID}' phải resolve đúng khách đó.`);

    // ── 4) Hành vi MỚI: tên khớp NHIỀU khách phải NEEDS_SELECTION ───────────
    const dupName = 'Tâm Đức';
    const ambiguous = await callCongNoChiTiet(transaction, 'Admin', dupName);
    expect(ambiguous.length === 1 && Number(ambiguous[0].MsgType) === 2 && ambiguous[0].Code === 'NEEDS_SELECTION',
      `Nhiều khách trùng '${dupName}' phải trả NEEDS_SELECTION, nhận ${JSON.stringify(ambiguous)}`);
    const candidates = JSON.parse(ambiguous[0].CandidateJson);
    expect(Array.isArray(candidates) && candidates.length > 1 && candidates.length <= 8,
      `CandidateJson phải là mảng 2-8 phần tử, nhận ${ambiguous[0].CandidateJson}`);
    evidence.AmbiguousCandidateCount = candidates.length;

    if (preflight) await transaction.rollback();
    else await transaction.commit();
    began = false;

    console.log(JSON.stringify({
      Task: 'SEARCH-005-CONGNO-CHITIET-AMBIGUITY-GUARD',
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
  console.error(JSON.stringify({ Task: 'SEARCH-005-CONGNO-CHITIET-AMBIGUITY-GUARD', Status: 'FAIL', Error: error.message }, null, 2));
  process.exitCode = 1;
});
