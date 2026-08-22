'use strict';

const fs = require('fs');
const path = require('path');
const sql = require('mssql');

const ROOT = path.resolve(__dirname, '..');
const SQL_FILES = [
  'Migrate_STOCK001_Stock_Availability_AI.sql',
  'Module_Common_API_DanhMuc_AI.sql',
  'Module_Common_API_DanhsachTonKho_AI.sql',
  'Module_Common_API_HangHoaList_AI.sql',
  'Module_10_API_TraCuuSanPham_AI.sql',
  'Module_10_API_TimSanPhamTheoTrieuChung_AI.sql',
  'Module_08_API_GoiYDonThuoc_AI.sql',
  'Module_05_API_UpsellGoiY_AI.sql',
  'Module_01_API_GoiYDonHang_AI.sql',
  'Module_10_API_SanPhamTrongTam_AI.sql',
  'Module_06_API_DeXuatKhuyenMai_AI.sql',
  'Module_Common_API_DonHangChiTiet_Insert_AI.sql',
];

function readEnv() {
  const values = {};
  for (const line of fs.readFileSync(path.join(ROOT, '.env'), 'utf8').split(/\r?\n/)) {
    const match = line.match(/^\s*([^#=]+)=(.*)$/);
    if (match) values[match[1].trim()] = match[2].trim();
  }
  return values;
}

function batches(file) {
  return fs.readFileSync(file, 'utf8')
    .replace(/^\uFEFF/, '')
    .split(/^\s*GO\s*(?:--.*)?$/gim)
    .map((part) => part.trim())
    .filter(Boolean);
}

async function main() {
  const preflight = process.argv.includes('--preflight');
  const env = readEnv();
  if (env.TEST_DB_DATABASE !== 'medtest') throw new Error('STOCK-001 only targets medtest');

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
  const deployed = [];
  try {
    await transaction.begin(sql.ISOLATION_LEVEL.SERIALIZABLE);
    for (const relative of SQL_FILES) {
      const fullPath = path.join(ROOT, 'sql', relative);
      let index = 0;
      for (const batch of batches(fullPath)) {
        index += 1;
        await new sql.Request(transaction).batch(batch);
      }
      deployed.push({ file: relative, batches: index });
    }
    if (preflight) await transaction.rollback();
    else await transaction.commit();
    console.log(JSON.stringify({
      task: 'STOCK-001',
      mode: preflight ? 'PREFLIGHT_ROLLBACK' : 'DEPLOY_COMMIT',
      database: env.TEST_DB_DATABASE,
      status: 'PASS',
      files: deployed,
    }, null, 2));
  } catch (error) {
    try { if (transaction._aborted !== true) await transaction.rollback(); } catch (_) {}
    throw error;
  } finally {
    await pool.close();
  }
}

main().catch((error) => {
  console.error(JSON.stringify({ task: 'STOCK-001', status: 'ERROR', message: error.message }, null, 2));
  process.exitCode = 1;
});
