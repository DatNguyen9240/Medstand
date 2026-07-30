'use strict';

/* UAT-015 â€” kiá»ƒm tra tá»“n kho theo quyá»n. Chá»‰ Ä‘á»c DB medtest. */
const fs = require('fs');
const path = require('path');
const sql = require('mssql');

const ROOT = path.resolve(__dirname, '..');
const fixtures = JSON.parse(fs.readFileSync(
  path.join(ROOT, 'config', 'uat', 'account-fixtures.v1.json'), 'utf8'),
).accounts;
const ALLOWED_STORES = new Set(['CTY', 'DL02', 'DL03']);

function readEnv() {
  const values = {};
  for (const line of fs.readFileSync(path.join(ROOT, '.env'), 'utf8').split(/\r?\n/)) {
    const match = line.match(/^\s*([^#=]+)=(.*)$/);
    if (match) values[match[1].trim()] = match[2].trim();
  }
  return values;
}

function num(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function closeEnough(a, b) {
  return a !== null && b !== null && Math.abs(a - b) < 0.01;
}

async function effectiveStores(pool, username) {
  const rows = (await pool.request()
    .input('Username', sql.VarChar(50), username)
    .query(`
SELECT DISTINCT StoreHouseID
FROM dbo.SY_UserStoreHouseTbl WITH (NOLOCK)
WHERE UserName = @Username AND StoreHouseID IN ('CTY', 'DL02', 'DL03')
UNION
SELECT DISTINCT US.StoreHouseID
FROM dbo.SY_User U WITH (NOLOCK)
JOIN dbo.SY_User Child WITH (NOLOCK) ON Child.ManagerID = U.EmployeeID AND ISNULL(Child.Disable, 0) = 0
JOIN dbo.SY_UserStoreHouseTbl US WITH (NOLOCK) ON US.UserName = Child.UserName
WHERE U.UserName = @Username AND (ISNULL(U.Manager, 0) = 1 OR U.UserGroupID = 'QL')
  AND US.StoreHouseID IN ('CTY', 'DL02', 'DL03');`)).recordset || [];
  return new Set(rows.map((row) => String(row.StoreHouseID || '').trim().toUpperCase()).filter(Boolean));
}

async function queryStock(pool, username) {
  const response = await pool.request()
    .input('Username', sql.VarChar(50), username)
    .input('ItemID', sql.VarChar(50), '')
    .input('TenSanPham', sql.VarChar(200), '')
    .input('timkiem', sql.NVarChar(200), '')
    .execute('dbo.API_DanhsachTonKho_AI');
  return response.recordset || [];
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
    requestTimeout: 90000,
    pool: { max: 2, min: 0, idleTimeoutMillis: 10000 },
  });

  try {
    const accounts = [];
    for (const [username, fixture] of Object.entries(fixtures)) {
      const result = { UserName: username, RoleName: fixture.role, RegionID: fixture.region };
      try {
        const allowed = await effectiveStores(pool, username);
        const rows = await queryStock(pool, username);
        const outside = rows.filter((row) => !allowed.has(String(row.StoreHouseID || '').trim().toUpperCase()));
        const invalidWarehouse = rows.filter((row) => !ALLOWED_STORES.has(String(row.StoreHouseID || '').trim().toUpperCase()));
        const required = ['ItemID', 'StoreHouseID', 'Lot', 'ExpireDate', 'PhysicalStock', 'AvailableStock', 'StockDataStatus', 'RuleVersion'];
        // ExpireDate may legitimately be NULL for stock without a lot expiry.
        // Validate schema presence, not business-optional value presence.
        const missing = rows.filter((row) => required.some((key) => row[key] === undefined));
        const arithmetic = [];
        const expiredSellable = [];
        const statusMismatch = [];
        for (const row of rows) {
          const physical = num(row.PhysicalStock ?? row.TonCuoi);
          const available = num(row.AvailableStock);
          const inbound = num(row.Nhap);
          const outbound = num(row.Xuat);
          const expiry = row.ExpireDate ? new Date(row.ExpireDate) : null;
          const expired = expiry && !Number.isNaN(expiry.getTime()) && expiry < new Date(new Date().toISOString().slice(0, 10));
          if (physical === null || available === null || inbound === null || outbound === null
            || !closeEnough(inbound - outbound, physical)
            || (expired ? available !== 0 : !closeEnough(available, Math.max(physical, 0)))) {
            arithmetic.push({ ItemID: row.ItemID, StoreHouseID: row.StoreHouseID, Lot: row.Lot, PhysicalStock: row.PhysicalStock, AvailableStock: row.AvailableStock, Nhap: row.Nhap, Xuat: row.Xuat });
          }
          if (expired && available > 0) expiredSellable.push({ ItemID: row.ItemID, StoreHouseID: row.StoreHouseID, Lot: row.Lot, ExpireDate: row.ExpireDate, AvailableStock: available });
          const expectedStatus = expired ? 'EXPIRED_NOT_SELLABLE' : (physical < 0 ? 'STOCK_RECONCILIATION_REQUIRED' : 'PHYSICAL_AS_SELLABLE_TEMPORARY');
          if (row.StockDataStatus !== expectedStatus) statusMismatch.push({ ItemID: row.ItemID, actual: row.StockDataStatus, expected: expectedStatus });
        }
        const errors = [];
        if (!rows.length) errors.push('NO_VISIBLE_STOCK_ROWS');
        if (!allowed.size) errors.push('NO_EFFECTIVE_ALLOWED_STORE');
        if (outside.length) errors.push('STOCK_OUTSIDE_EFFECTIVE_SCOPE');
        if (invalidWarehouse.length) errors.push('STOCK_OUTSIDE_UAT_ALLOWLIST');
        if (missing.length) errors.push('STOCK_REQUIRED_FIELD_MISSING');
        if (arithmetic.length) errors.push('STOCK_ARITHMETIC_MISMATCH');
        if (expiredSellable.length) errors.push('EXPIRED_STOCK_MARKED_SELLABLE');
        if (statusMismatch.length) errors.push('STOCK_STATUS_MISMATCH');
        Object.assign(result, {
          EffectiveWarehouses: [...allowed].sort(),
          VisibleRows: rows.length,
          VisibleWarehouses: [...new Set(rows.map((row) => String(row.StoreHouseID || '').trim().toUpperCase()).filter(Boolean))].sort(),
          OutsideScopeCount: outside.length,
          OutsideAllowlistCount: invalidWarehouse.length,
          MissingFieldCount: missing.length,
          ArithmeticMismatchCount: arithmetic.length,
          ExpiredSellableCount: expiredSellable.length,
          StatusMismatchCount: statusMismatch.length,
          Errors: errors,
          Status: errors.length ? 'FAIL' : 'PASS',
        });
        if (arithmetic.length) result.ArithmeticMismatches = arithmetic.slice(0, 10);
        if (expiredSellable.length) result.ExpiredSellable = expiredSellable.slice(0, 10);
        if (statusMismatch.length) result.StatusMismatches = statusMismatch.slice(0, 10);
      } catch (error) {
        result.Status = 'ERROR_API_CALL';
        result.Error = error.message;
      }
      accounts.push(result);
    }
    const frontend = fs.readFileSync(path.join(ROOT, 'chatbot-widget', 'js', 'chatbot.js'), 'utf8');
    const uiChecks = [
      { Check: 'STOCK_FIELDS_RENDERED', Pass: frontend.includes('physicalstock') && frontend.includes('availablestock') && frontend.includes('stockdatastatus') },
    ];
    const failures = accounts.filter((row) => row.Status !== 'PASS');
    const summary = {
      task: 'UAT-015',
      mode: 'READ_ONLY_RUNTIME_DATABASE_AND_STATIC_UI_VERIFICATION',
      database: env.TEST_DB_DATABASE,
      status: failures.length || uiChecks.some((row) => !row.Pass) ? 'FAIL' : 'PASS',
      accountsChecked: accounts.length,
      accountsPassed: accounts.length - failures.length,
      totalOutsideScope: accounts.reduce((sum, row) => sum + Number(row.OutsideScopeCount || 0), 0),
      totalExpiredSellable: accounts.reduce((sum, row) => sum + Number(row.ExpiredSellableCount || 0), 0),
      totalArithmeticMismatches: accounts.reduce((sum, row) => sum + Number(row.ArithmeticMismatchCount || 0), 0),
      uiChecks,
      failures,
      accounts,
    };
    console.log(JSON.stringify(summary, null, 2));
    if (summary.status !== 'PASS') process.exitCode = 1;
  } finally {
    await pool.close();
  }
}

main().catch((error) => {
  console.error(JSON.stringify({ task: 'UAT-015', status: 'ERROR', message: error.message }, null, 2));
  process.exitCode = 1;
});


