'use strict';

/* Deploys the API_KhachHangList definition only (adds Phone to search match); never updates customer rows. */
const fs = require('fs');
const path = require('path');
const sql = require('mssql');

const ROOT = path.resolve(__dirname, '..');
const SQL_FILE = 'sql/Module_Common_API_KhachHangList_AI.sql';

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

async function callList(request, overrides) {
  const params = Object.assign({
    User: 'QLBH013.MED', SearchText: '', ManagerID: '', EmployeeID: '',
    ObjectID: '', LoaiKhachHang: '', KenhBan: '', SYSManagerID: '', SYSEmployeeID: '',
  }, overrides);
  const r = new sql.Request(request)
    .input('User', sql.VarChar(50), params.User)
    .input('SearchText', sql.NVarChar(50), params.SearchText)
    .input('ManagerID', sql.VarChar(50), params.ManagerID)
    .input('EmployeeID', sql.VarChar(50), params.EmployeeID)
    .input('ObjectID', sql.VarChar(50), params.ObjectID)
    .input('LoaiKhachHang', sql.NVarChar(50), params.LoaiKhachHang)
    .input('KenhBan', sql.VarChar(50), params.KenhBan)
    .input('SYSManagerID', sql.VarChar(50), params.SYSManagerID)
    .input('SYSEmployeeID', sql.VarChar(50), params.SYSEmployeeID);
  const result = await r.execute('dbo.API_KhachHangList');
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
  try {
    await transaction.begin(sql.ISOLATION_LEVEL.SERIALIZABLE);
    began = true;
    let batchCount = 0;
    for (const batch of batches(fs.readFileSync(path.join(ROOT, SQL_FILE), 'utf8'))) {
      await new sql.Request(transaction).batch(batch);
      batchCount += 1;
    }

    // Tìm một khách có số điện thoại thật trong scope của tài khoản test để xác minh.
    const candidates = await callList(transaction, {});
    const withPhone = candidates.find((row) => String(row.Phone || '').replace(/\D/g, '').length >= 6);
    if (!withPhone) throw new Error('Không tìm thấy khách nào có Phone hợp lệ trong phạm vi test để xác minh.');

    const phoneDigits = String(withPhone.Phone).trim();
    const byPhone = await callList(transaction, { SearchText: phoneDigits });
    if (!byPhone.some((row) => row.ObjectID === withPhone.ObjectID)) {
      throw new Error(`Tìm theo Phone '${phoneDigits}' không trả về ObjectID mong đợi '${withPhone.ObjectID}'.`);
    }

    // Regression: tìm theo tên và theo mã vẫn phải hoạt động như trước.
    const byName = await callList(transaction, { SearchText: withPhone.ObjectName });
    if (!byName.some((row) => row.ObjectID === withPhone.ObjectID)) {
      throw new Error(`Regression: tìm theo tên '${withPhone.ObjectName}' không còn ra ObjectID '${withPhone.ObjectID}'.`);
    }
    const byCode = await callList(transaction, { SearchText: withPhone.ObjectID });
    if (!byCode.some((row) => row.ObjectID === withPhone.ObjectID)) {
      throw new Error(`Regression: tìm theo mã '${withPhone.ObjectID}' không còn ra đúng khách.`);
    }

    if (preflight) await transaction.rollback();
    else await transaction.commit();
    began = false;
    console.log(JSON.stringify({
      Task: 'CORE-011-CUSTOMER-SEARCH-PHONE-FIX',
      Status: 'PASS',
      Mode: preflight ? 'PREFLIGHT_ROLLBACK' : 'DEPLOY_PROCEDURE_ONLY',
      BatchCount: batchCount,
      BusinessRowsUpdated: 0,
      Evidence: {
        ObjectID: withPhone.ObjectID,
        ObjectName: withPhone.ObjectName,
        PhoneSearched: phoneDigits,
        MatchedByPhone: true,
        MatchedByName: true,
        MatchedByCode: true,
      },
    }, null, 2));
  } finally {
    if (began) {
      try { await transaction.rollback(); } catch (_) { /* transaction can already be aborted */ }
    }
    await pool.close();
  }
}

main().catch((error) => {
  console.error(JSON.stringify({ Task: 'CORE-011-CUSTOMER-SEARCH-PHONE-FIX', Status: 'FAIL', Error: error.message }, null, 2));
  process.exitCode = 1;
});
