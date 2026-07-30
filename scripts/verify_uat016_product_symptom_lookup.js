'use strict';

/* UAT-016 — tra cứu sản phẩm, triệu chứng và disclaimer. Chỉ đọc DB medtest. */
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

function isMessage(row) {
  return row && (row.Msg !== undefined || row.Message !== undefined || row.Code !== undefined);
}

function isError(row) {
  return Number(row.MsgType || 0) > 0 || /error|lỗi|không tìm|không hợp lệ|vui lòng nhập/i.test(String(row.Msg || row.Message || ''));
}

function first(row, keys) {
  for (const key of keys) if (row && row[key] !== undefined && row[key] !== null && String(row[key]).trim() !== '') return row[key];
  return null;
}

async function productLookup(pool, username, keyword) {
  const response = await pool.request()
    .input('Username', sql.VarChar(50), username)
    .input('timkiem', sql.NVarChar(100), keyword)
    .input('TopN', sql.Int, 5)
    .execute('dbo.API_TraCuuSanPham_AI');
  return response.recordset || [];
}

async function symptomLookup(pool, username, customerId, keyword) {
  const response = await pool.request()
    .input('Username', sql.VarChar(50), username)
    .input('MaKhachHang', sql.NVarChar(100), customerId)
    .input('timkiem', sql.NVarChar(50), keyword)
    .input('TopN', sql.Int, 5)
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
        // Mã sản phẩm mẫu có trong catalog UAT; dùng thêm từ khóa triệu chứng để tránh kiểm tra một đường đi duy nhất.
        const productRowsRaw = await productLookup(pool, username, 'B012');
        const productMessages = productRowsRaw.filter(isMessage);
        const productRows = productRowsRaw.filter((row) => !isMessage(row));
        const productMissing = productRows.filter((row) => !first(row, ['ItemID', 'Mã sp']) || !first(row, ['ItemName', 'Sản Phẩm']));
        const priceMissing = productRows.filter((row) => first(row, ['UnitPrice', 'Đơn Giá']) === null);
        const disclaimerMissing = productRows.filter((row) => !first(row, ['MedicalDisclaimer']));
        const medicalStatusMissing = productRows.filter((row) => !first(row, ['RecommendationStatus', 'RuleVersion', 'DataSource']));
        const invalidStockStatus = productRows.filter((row) => {
          const value = first(row, ['StockDataStatus']);
          return value !== 'PHYSICAL_STOCK_NOT_QUERIED' && value !== null;
        });
        const symptomRowsRaw = await symptomLookup(pool, username, fixture.customerId, 'ho');
        const symptomMessages = symptomRowsRaw.filter(isMessage);
        const symptomRows = symptomRowsRaw.filter((row) => !isMessage(row));
        const symptomMissingReason = symptomRows.filter((row) => !first(row, ['LyDoGoiY', 'RecommendationReason', 'ChiTiet']));
        const symptomNoStock = symptomRows.filter((row) => Number(first(row, ['AvailableStock', 'QuantityinStock', 'TonKho']) || 0) <= 0);
        const symptomDisclaimerMissing = symptomRows.filter((row) => !first(row, ['MedicalDisclaimer', 'RecommendationStatus', 'RuleVersion']));
        const errors = [];
        if (productMessages.some(isError)) errors.push('PRODUCT_LOOKUP_API_ERROR');
        if (!productRows.length) errors.push('PRODUCT_LOOKUP_NO_RESULT');
        if (productMissing.length) errors.push('PRODUCT_REQUIRED_FIELD_MISSING');
        if (priceMissing.length) errors.push('PRODUCT_PRICE_MISSING');
        if (disclaimerMissing.length) errors.push('PRODUCT_DISCLAIMER_MISSING');
        if (medicalStatusMissing.length) errors.push('PRODUCT_METADATA_MISSING');
        if (invalidStockStatus.length) errors.push('PRODUCT_INVALID_STOCK_STATUS');
        if (symptomMessages.some(isError)) errors.push('SYMPTOM_API_ERROR');
        if (!symptomRows.length) errors.push('SYMPTOM_NO_RESULT');
        if (symptomMissingReason.length) errors.push('SYMPTOM_REASON_MISSING');
        if (symptomNoStock.length) errors.push('SYMPTOM_NO_SELLABLE_STOCK');
        if (symptomDisclaimerMissing.length) errors.push('SYMPTOM_DISCLAIMER_OR_RULE_MISSING');
        Object.assign(result, {
          ProductLookupRows: productRows.length,
          ProductLookupErrorMessages: productMessages.filter(isError).length,
          ProductMissingFieldCount: productMissing.length,
          ProductPriceMissingCount: priceMissing.length,
          ProductDisclaimerMissingCount: disclaimerMissing.length,
          ProductMetadataMissingCount: medicalStatusMissing.length,
          ProductInvalidStockStatusCount: invalidStockStatus.length,
          SymptomRows: symptomRows.length,
          SymptomErrorMessages: symptomMessages.filter(isError).length,
          SymptomMissingReasonCount: symptomMissingReason.length,
          SymptomNoSellableStockCount: symptomNoStock.length,
          SymptomDisclaimerOrRuleMissingCount: symptomDisclaimerMissing.length,
          ProductSample: productRows.slice(0, 3).map((row) => ({ ItemID: first(row, ['ItemID', 'Mã sp']), ItemName: first(row, ['ItemName', 'Sản Phẩm']), Price: first(row, ['UnitPrice', 'Đơn Giá']), Disclaimer: Boolean(first(row, ['MedicalDisclaimer'])) })),
          SymptomSample: symptomRows.slice(0, 3).map((row) => ({ ItemID: first(row, ['ItemID', 'MaSanPham', 'Mã SP']), ItemName: first(row, ['ItemName', 'TenSanPham']), Reason: first(row, ['LyDoGoiY', 'RecommendationReason', 'ChiTiet']) })),
          Errors: errors,
          Status: errors.length ? 'FAIL' : 'PASS',
        });
      } catch (error) {
        result.Status = 'ERROR_API_CALL';
        result.Error = error.message;
      }
      accounts.push(result);
    }
    const frontend = fs.readFileSync(path.join(ROOT, 'chatbot-widget', 'js', 'chatbot.js'), 'utf8');
    const uiChecks = [
      { Check: 'MEDICAL_DISCLAIMER_FIELD_SUPPORTED', Pass: frontend.includes("'medicaldisclaimer': 'Cảnh báo chuyên môn'") },
      { Check: 'STOCK_STATUS_FIELD_SUPPORTED', Pass: frontend.includes("'stockdatastatus': 'Trạng thái dữ liệu tồn kho'") },
    ];
    const failures = accounts.filter((row) => row.Status !== 'PASS');
    const summary = {
      task: 'UAT-016',
      mode: 'READ_ONLY_RUNTIME_DATABASE_AND_STATIC_UI_VERIFICATION',
      database: env.TEST_DB_DATABASE,
      status: failures.length || uiChecks.some((row) => !row.Pass) ? 'FAIL' : 'PASS',
      accountsChecked: accounts.length,
      accountsPassed: accounts.length - failures.length,
      totalProductPriceMissing: accounts.reduce((sum, row) => sum + Number(row.ProductPriceMissingCount || 0), 0),
      totalDisclaimerMissing: accounts.reduce((sum, row) => sum + Number(row.ProductDisclaimerMissingCount || 0) + Number(row.SymptomDisclaimerOrRuleMissingCount || 0), 0),
      totalSymptomNoStock: accounts.reduce((sum, row) => sum + Number(row.SymptomNoSellableStockCount || 0), 0),
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
  console.error(JSON.stringify({ task: 'UAT-016', status: 'ERROR', message: error.message }, null, 2));
  process.exitCode = 1;
});
