'use strict';

/* UAT-014 — kiểm tra tích lũy và upsell cho 13 tài khoản. Chỉ đọc DB medtest. */
const fs = require('fs');
const path = require('path');
const sql = require('mssql');

const ROOT = path.resolve(__dirname, '..');
const fixtures = JSON.parse(fs.readFileSync(
  path.join(ROOT, 'config', 'uat', 'account-fixtures.v1.json'), 'utf8',
)).accounts;
const ALLOWED_STORES = new Set(['CTY', 'DL02', 'DL03']);

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

function isMessage(row) {
  return row && (row.Msg !== undefined || row.Message !== undefined || row.Code !== undefined);
}

function messageIsError(row) {
  return Number(row.MsgType || 0) > 0 || /error|lỗi|không tìm|không có quyền|không hợp lệ|vui lòng/i.test(String(row.Msg || row.Message || ''));
}

async function queryLoyalty(pool, username, customerId) {
  const response = await pool.request()
    .input('Username', sql.VarChar(50), username)
    .input('MaKhachHang', sql.NVarChar(100), customerId)
    .input('ProgramID', sql.VarChar(50), '')
    .input('TuNgay', sql.DateTime, null)
    .input('DenNgay', sql.DateTime, null)
    .input('ItemIDs', sql.NVarChar(sql.MAX), '')
    .execute('dbo.API_TichLuy_AI');
  return { summary: response.recordsets?.[0] || [], products: response.recordsets?.[1] || [] };
}

async function queryUpsell(pool, username, customerId) {
  const response = await pool.request()
    .input('Username', sql.VarChar(50), username)
    .input('MaKhachHang', sql.NVarChar(100), customerId)
    .input('timkiem', sql.NVarChar(50), '')
    .input('TopN', sql.Int, 10)
    .execute('dbo.API_UpsellGoiY_AI');
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
      const result = { UserName: username, RoleName: fixture.role, RegionID: fixture.region, CustomerID: fixture.customerId };
      try {
        const allowedRows = (await pool.request()
          .input('Username', sql.VarChar(50), username)
          .query('SELECT ObjectID FROM dbo.AR_GetObjectByUserFnc(@Username);')).recordset || [];
        const allowed = new Set(allowedRows.map((row) => String(row.ObjectID).trim().toUpperCase()));

        const loyalty = await queryLoyalty(pool, username, fixture.customerId);
        const loyaltyMessages = loyalty.summary.filter(isMessage);
        const loyaltyRows = loyalty.summary.filter((row) => !isMessage(row));
        const loyaltyRow = loyaltyRows.find((row) => String(row.ObjectID || '').trim().toUpperCase() === fixture.customerId.toUpperCase());
        const loyaltyScopeLeaks = loyaltyRows.filter((row) => !allowed.has(String(row.ObjectID || '').trim().toUpperCase()));
        const loyaltyRequired = ['ProgramID', 'RuleVersion', 'ProgramStatus', 'ObjectID', 'TenCuaHang', 'TichLuyDatDuoc', 'Achieved', 'QuaDaDat', 'QuaMocTiepTheo', 'SoPhanQua', 'MucTieu', 'Target', 'Remaining', 'Percentage', 'LoiNhacAI'];
        const loyaltyMissing = loyaltyRow ? loyaltyRequired.filter((key) => loyaltyRow[key] === undefined || loyaltyRow[key] === null || String(loyaltyRow[key]).trim() === '') : loyaltyRequired;
        const achieved = loyaltyRow ? Number(loyaltyRow.Achieved ?? loyaltyRow.TichLuyDatDuoc) : NaN;
        const target = loyaltyRow ? Number(loyaltyRow.Target ?? loyaltyRow.MucTieu) : NaN;
        const remaining = loyaltyRow ? Number(loyaltyRow.Remaining) : NaN;
        const percentage = loyaltyRow ? Number(loyaltyRow.Percentage) : NaN;
        const loyaltyMathErrors = [];
        if (loyaltyRow && (!Number.isFinite(achieved) || achieved < 0)) loyaltyMathErrors.push('ACHIEVED_INVALID');
        if (loyaltyRow && (!Number.isFinite(target) || target < 0)) loyaltyMathErrors.push('TARGET_INVALID');
        if (loyaltyRow && (!Number.isFinite(remaining) || remaining < 0 || (target > achieved && remaining !== target - achieved) || (target <= achieved && remaining !== 0))) loyaltyMathErrors.push('REMAINING_MISMATCH');
        if (loyaltyRow && (!Number.isFinite(percentage) || percentage < 0 || percentage > 100)) loyaltyMathErrors.push('PERCENTAGE_INVALID');
        const loyaltyErrors = [];
        if (loyaltyMessages.some(messageIsError)) loyaltyErrors.push('LOYALTY_API_ERROR');
        if (!loyaltyRow) loyaltyErrors.push('LOYALTY_CUSTOMER_NOT_RETURNED');
        if (loyaltyScopeLeaks.length) loyaltyErrors.push('LOYALTY_SCOPE_LEAK');
        if (loyaltyMissing.length) loyaltyErrors.push('LOYALTY_REQUIRED_FIELD_MISSING');
        if (loyaltyMathErrors.length) loyaltyErrors.push(...loyaltyMathErrors);

        const upsellRaw = await queryUpsell(pool, username, fixture.customerId);
        const upsellMessages = upsellRaw.filter(isMessage);
        const upsellRows = upsellRaw.filter((row) => !isMessage(row));
        const upsellMissingReason = upsellRows.filter((row) => !first(row, ['LyDoGoiY', 'RecommendationReason', 'ChiTiet', 'TrangThai']));
        const upsellNoStock = upsellRows.filter((row) => Number(first(row, ['AvailableStock', 'QuantityinStock', 'TonKho']) || 0) <= 0);
        const upsellInvalidStockContract = upsellRows.filter((row) =>
          first(row, ['StockDataStatus']) !== 'AVAILABLE_FOR_SALE'
          || !first(row, ['StoreHouseID'])
          || !first(row, ['StockUpdatedAt', 'StockAsOfAt'])
          || first(row, ['ReservedStock']) === null
        );
        const upsellInvalidRows = upsellRows.filter((row) => !first(row, ['ItemID', 'MaSanPham', 'Mã SP']) || first(row, ['ItemName', 'TenSanPham']) === null);
        const upsellDuplicateIds = upsellRows.map((row) => String(first(row, ['ItemID', 'MaSanPham', 'Mã SP']) || '')).filter(Boolean);
        const duplicateCount = upsellDuplicateIds.length - new Set(upsellDuplicateIds).size;
        const upsellErrors = [];
        if (upsellMessages.some(messageIsError)) upsellErrors.push('UPSELL_API_ERROR');
        if (!upsellRows.length) upsellErrors.push('UPSELL_NO_RECOMMENDATION');
        if (upsellMissingReason.length) upsellErrors.push('UPSELL_REASON_MISSING');
        if (upsellNoStock.length) upsellErrors.push('UPSELL_NO_SELLABLE_STOCK');
        if (upsellInvalidStockContract.length) upsellErrors.push('UPSELL_INVALID_STOCK_CONTRACT');
        if (upsellInvalidRows.length) upsellErrors.push('UPSELL_REQUIRED_FIELD_MISSING');
        if (duplicateCount) upsellErrors.push('UPSELL_DUPLICATE_ITEM');

        Object.assign(result, {
          LoyaltyRows: loyaltyRows.length,
          LoyaltyCustomerReturned: Boolean(loyaltyRow),
          LoyaltyScopeLeakCount: loyaltyScopeLeaks.length,
          LoyaltyMissingFieldCount: loyaltyMissing.length,
          LoyaltyMathErrors: loyaltyMathErrors,
          Achieved: Number.isFinite(achieved) ? achieved : null,
          Target: Number.isFinite(target) ? target : null,
          Remaining: Number.isFinite(remaining) ? remaining : null,
          Percentage: Number.isFinite(percentage) ? percentage : null,
          LoyaltyProgramStatus: loyaltyRow?.ProgramStatus || null,
          LoyaltyProductSuggestionCount: loyalty.products.length,
          UpsellRows: upsellRows.length,
          UpsellErrorMessageCount: upsellMessages.filter(messageIsError).length,
          UpsellMissingReasonCount: upsellMissingReason.length,
          UpsellNoStockCount: upsellNoStock.length,
          UpsellInvalidStockContractCount: upsellInvalidStockContract.length,
          UpsellDuplicateItemCount: duplicateCount,
          Errors: [...loyaltyErrors, ...upsellErrors],
          Status: [...loyaltyErrors, ...upsellErrors].length ? 'FAIL' : 'PASS',
        });
      } catch (error) {
        result.Status = 'ERROR_API_CALL';
        result.Error = error.message;
      }
      accounts.push(result);
    }

    const failures = accounts.filter((row) => row.Status !== 'PASS');
    const frontend = fs.readFileSync(path.join(ROOT, 'chatbot-widget', 'js', 'chatbot.js'), 'utf8');
    const uiChecks = [
      { Check: 'API_RESULT_EXECUTION', Pass: frontend.includes('ApiEngine.queryData') && frontend.includes('ApiEngine.execute') },
      { Check: 'LOYALTY_FIELDS_VISIBLE', Pass: frontend.includes("'diemtichluy': 'Tích lũy'") && frontend.includes('_renderTableBody') },
    ];
    const summary = {
      task: 'UAT-014',
      mode: 'READ_ONLY_RUNTIME_DATABASE_VERIFICATION',
      database: env.TEST_DB_DATABASE,
      status: failures.length ? 'FAIL' : 'PASS',
      accountsChecked: accounts.length,
      accountsPassed: accounts.length - failures.length,
      totalLoyaltyScopeLeaks: accounts.reduce((sum, row) => sum + Number(row.LoyaltyScopeLeakCount || 0), 0),
      totalLoyaltyMathErrors: accounts.reduce((sum, row) => sum + (row.LoyaltyMathErrors || []).length, 0),
      totalUpsellNoStock: accounts.reduce((sum, row) => sum + Number(row.UpsellNoStockCount || 0), 0),
      uiChecks,
      failures,
      accounts,
    };
    console.log(JSON.stringify(summary, null, 2));
    if (summary.status !== 'PASS' || uiChecks.some((row) => !row.Pass)) process.exitCode = 1;
  } finally {
    await pool.close();
  }
}

main().catch((error) => {
  console.error(JSON.stringify({ task: 'UAT-014', status: 'ERROR', message: error.message }, null, 2));
  process.exitCode = 1;
});
