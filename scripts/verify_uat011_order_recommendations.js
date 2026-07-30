'use strict';

/* UAT-011 — kiểm tra gợi ý đơn hàng cho 13 tài khoản. Chỉ đọc DB medtest. */
const fs = require('fs');
const path = require('path');
const sql = require('mssql');

const ROOT = path.resolve(__dirname, '..');
const fixtures = JSON.parse(fs.readFileSync(
  path.join(ROOT, 'config', 'uat', 'account-fixtures.v1.json'), 'utf8'),
).accounts;

function readEnv() {
  const values = {};
  for (const line of fs.readFileSync(path.join(ROOT, '.env'), 'utf8').split(/\r?\n/)) {
    const match = line.match(/^\s*([^#=]+)=(.*)$/);
    if (match) values[match[1].trim()] = match[2].trim();
  }
  return values;
}

function first(row, keys) {
  for (const key of keys) if (row && row[key] !== undefined && row[key] !== null && String(row[key]).trim() !== '') return row[key];
  return null;
}

async function main() {
  const env = readEnv();
  const pool = await sql.connect({
    server: env.TEST_DB_SERVER,
    port: Number(env.TEST_DB_PORT || 1433),
    database: env.TEST_DB_DATABASE,
    user: env.TEST_DB_USER,
    password: env.TEST_DB_PASSWORD,
    options: { encrypt: false, trustServerCertificate: true },
    connectionTimeout: 15000,
    requestTimeout: 60000,
    pool: { max: 2, min: 0, idleTimeoutMillis: 10000 },
  });

  try {
    const output = [];
    for (const [username, fixture] of Object.entries(fixtures)) {
      const row = {
        UserName: username,
        RoleName: fixture.role,
        RegionID: fixture.region,
        CustomerID: fixture.customerId,
      };
      try {
        const response = await pool.request()
          .input('Username', sql.VarChar(50), username)
          .input('MaKhachHang', sql.NVarChar(100), fixture.customerId)
          .input('ObjectID', sql.NVarChar(100), '')
          .input('TopN', sql.Int, 10)
          .execute('dbo.API_GoiYDonHang_AI');
        const rows = response.recordset || [];
        const messageRows = rows.filter((item) => item.Msg !== undefined || item.Message !== undefined);
        const errorMessages = messageRows.filter((item) => Number(item.MsgType || 0) > 0 || /error|lỗi|không có quyền|không hợp lệ/i.test(String(item.Msg || item.Message || '')));
        const recommendationRows = rows.filter((item) => !messageRows.includes(item));
        const missingReason = recommendationRows.filter((item) => !first(item, ['RecommendationReason', 'ChiTiet', 'Gợi ý', 'TrangThai']));
        const expired = recommendationRows.filter((item) => /EXPIRED|HẾT HẠN|HET HAN/i.test(String(first(item, ['StockDataStatus', 'TrangThai', 'ChiTiet']) || '')));
        const outsideWarehouse = recommendationRows.filter((item) => {
          const warehouse = first(item, ['StoreHouseID', 'WarehouseID', 'MaKho']);
          return warehouse && !['CTY', 'DL02', 'DL03'].includes(String(warehouse).trim().toUpperCase());
        });
        row.RowCount = rows.length;
        row.RecommendationCount = recommendationRows.length;
        row.ErrorCount = errorMessages.length;
        row.MissingReasonCount = missingReason.length;
        row.ExpiredRecommendationCount = expired.length;
        row.OutsideWarehouseCount = outsideWarehouse.length;
        row.SampleReasons = recommendationRows.slice(0, 3).map((item) => first(item, ['RecommendationReason', 'ChiTiet', 'Gợi ý', 'TrangThai']));
        row.SampleItems = recommendationRows.slice(0, 10).map((item) => first(item, ['MaSanPham', 'ItemID', 'Mã SP']));
        row.Status = errorMessages.length ? 'FAIL_API_ERROR'
          : !recommendationRows.length ? 'FAIL_NO_RECOMMENDATION'
            : missingReason.length ? 'FAIL_MISSING_REASON'
              : expired.length ? 'FAIL_EXPIRED_RECOMMENDATION'
                : outsideWarehouse.length ? 'FAIL_OUTSIDE_WAREHOUSE'
                  : 'PASS';
        if (errorMessages.length) row.Errors = errorMessages.map((item) => item.Msg || item.Message);
      } catch (error) {
        row.Status = 'ERROR_API_CALL';
        row.Error = error.message;
      }
      output.push(row);
    }

    const failures = output.filter((item) => item.Status !== 'PASS');
    const summary = {
      task: 'UAT-011',
      mode: 'READ_ONLY_RUNTIME_DATABASE_VERIFICATION',
      database: env.TEST_DB_DATABASE,
      status: failures.length ? 'FAIL' : 'PASS',
      accountsChecked: output.length,
      accountsPassed: output.length - failures.length,
      failures,
      accounts: output,
    };
    console.log(JSON.stringify(summary, null, 2));
    if (summary.status !== 'PASS') process.exitCode = 1;
  } finally {
    await pool.close();
  }
}

main().catch((error) => {
  console.error(JSON.stringify({ task: 'UAT-011', status: 'ERROR', message: error.message }, null, 2));
  process.exitCode = 1;
});
