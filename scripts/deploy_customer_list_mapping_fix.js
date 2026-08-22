'use strict';

/* Deploys the API_KhachHangList definition only; never updates customer rows. */
const fs = require('fs');
const path = require('path');
const sql = require('mssql');

const ROOT = path.resolve(__dirname, '..');
const SQL_FILE = 'sql/Module_Common_API_KhachHangList_AI.sql';
const TEST_OBJECT_ID = '4E7E28AF-70A8-4AB8-B594-6DC1E3104E2B';

function readEnv() {
  const values = {};
  for (const line of fs.readFileSync(path.join(ROOT, '.env'), 'utf8').split(/\r?\n/)) {
    const match = line.match(/^\s*([^#=]+)=(.*)$/);
    if (match) values[match[1].trim()] = match[2].trim();
  }
  return values;
}

function batches(source) {
  return source.replace(/^\uFEFF/, '').split(/^\s*GO\s*(?:--.*)?$/gim)
    .map((part) => part.trim()).filter(Boolean);
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

    const result = await new sql.Request(transaction)
      .input('User', sql.VarChar(50), 'QLBH013.MED')
      .input('SearchText', sql.NVarChar(50), '')
      .input('ManagerID', sql.VarChar(50), '')
      .input('EmployeeID', sql.VarChar(50), '')
      .input('ObjectID', sql.VarChar(50), TEST_OBJECT_ID)
      .input('LoaiKhachHang', sql.NVarChar(50), '')
      .input('KenhBan', sql.VarChar(50), '')
      .input('SYSManagerID', sql.VarChar(50), '')
      .input('SYSEmployeeID', sql.VarChar(50), '')
      .execute('dbo.API_KhachHangList');

    const row = result.recordset && result.recordset[0];
    const expected = {
      ObjectID: TEST_OBJECT_ID,
      TaxCode: '123456789100',
      LoaiKhachHang: 'ETC',
      ObjectGroupID: 'NDB',
      ObjectGroupName: 'Nam Định B',
      QuanHuyen: 'Mỹ Đức',
      XaPhuong: 'Xã Mỹ Đức',
      ThuDiTuyen: 'Thứ 3',
    };
    if (!row || Object.keys(expected).some((key) => String(row[key] || '') !== expected[key])) {
      throw new Error(`Unexpected mapped row: ${JSON.stringify(row)}`);
    }

    if (preflight) await transaction.rollback();
    else await transaction.commit();
    began = false;
    console.log(JSON.stringify({
      Task: 'CUSTOMER-LIST-MAPPING-FIX',
      Status: 'PASS',
      Mode: preflight ? 'PREFLIGHT_ROLLBACK' : 'DEPLOY_PROCEDURE_ONLY',
      BatchCount: batchCount,
      BusinessRowsUpdated: 0,
      Evidence: expected,
    }, null, 2));
  } finally {
    if (began) {
      try { await transaction.rollback(); } catch (_) { /* transaction can already be aborted */ }
    }
    await pool.close();
  }
}

main().catch((error) => {
  console.error(JSON.stringify({ Task: 'CUSTOMER-LIST-MAPPING-FIX', Status: 'FAIL', Error: error.message }, null, 2));
  process.exitCode = 1;
});
