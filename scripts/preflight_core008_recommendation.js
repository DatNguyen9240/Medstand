'use strict';

/*
 * CORE-008 compile + contract preflight.
 * Applies the rule and both procedures inside one outer transaction on medtest,
 * checks all 13 UAT viewers, then always rolls the outer transaction back.
 */
const fs = require('fs');
const path = require('path');
const sql = require('mssql');

const ROOT = path.resolve(__dirname, '..');
const SQL_FILES = [
  'sql/Migrate_CORE008_Recommendation_Rule_V1_AI.sql',
  'sql/Module 1 - API_GoiYDonHang_AI.sql',
  'sql/Module 2 - API_TuyenBanHang_AI.sql',
];
const ACCOUNTS = [
  ['QLBH013.MED', 'NDB'], ['NAMDINHB.MED', 'NDB'],
  ['QLBH016.MED', 'BNB'], ['BACNINHA.MED', 'BNB'],
  ['QLBH005.MED', 'HUE'], ['HUEB.MED', 'HUE'],
  ['QLBH010.MED', 'QAN'], ['DANANGA.MED', 'QAN'],
  ['QLMN2', 'CTH'], ['CanThoA', 'CTH'],
  ['QLMD1', 'BPH'], ['BinhPhuocA', 'BPH'],
  ['QLBH024.MED', 'AG'],
];

function readEnv() {
  const values = {};
  for (const line of fs.readFileSync(path.join(ROOT, '.env'), 'utf8').split(/\r?\n/)) {
    const match = line.match(/^\s*([^#=]+)=(.*)$/);
    if (match) values[match[1].trim()] = match[2].trim();
  }
  return values;
}

function batches(source) {
  return source.split(/^\s*GO\s*(?:--.*)?$/gim).map((part) => part.trim()).filter(Boolean);
}

function ymd(value) {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString().slice(0, 10);
}

function addDays(value, days) {
  const date = new Date(`${ymd(value)}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + Number(days));
  return date.toISOString().slice(0, 10);
}

function diffDays(from, to) {
  return Math.round((new Date(`${ymd(to)}T00:00:00.000Z`) - new Date(`${ymd(from)}T00:00:00.000Z`)) / 86400000);
}

function messageRow(row) {
  return row && (row.Msg !== undefined || row.Message !== undefined);
}

function validateContract(row, kind) {
  const required = [
    'ReasonText', 'PrimaryReasonCode', 'RecommendationReasonCodes',
    'RuleSourceCodes', 'RuleSourceLabel', 'RuleCode', 'RuleVersion',
    'DataWindow', 'DataFrom', 'DataTo', 'CalculatedAt',
    'PurchaseEventCount', 'CycleObservationCount', 'HistoryStatus',
    'CycleComputationMode', 'CycleStatus', 'LanMuaCuoiDate', 'NgayDuKien',
    'ConLaiNgay', 'ReturnAdjustmentMode',
  ];
  const missing = required.filter((key) => row[key] === undefined || row[key] === null || String(row[key]).trim() === '')
    .filter((key) => !['NgayDuKien', 'ConLaiNgay'].includes(key)
      || !['NO_HISTORY', 'INSUFFICIENT_HISTORY'].includes(row.CycleComputationMode));
  const errors = [];
  if (missing.length) errors.push(`MISSING:${missing.join(',')}`);
  if (row.RuleCode !== 'BR-RECOMMENDATION-008' || row.RuleVersion !== '1.0.0') errors.push('RULE_ID');
  if (row.DataWindow !== 'ROLLING_CONFIGURED_MONTHS_NO_FALLBACK') errors.push('DATA_WINDOW');
  if (row.ReturnAdjustmentMode !== 'RETURNS_NOT_EVENTS_ORIGINAL_EVENT_NOT_ADJUSTED_UNRELIABLE_LINKAGE') errors.push('RETURN_MODE');
  if (!String(row.RuleSourceLabel || '').trim()) errors.push('SOURCE_LABEL');
  if (Number(row.CycleObservationCount) !== Math.max(Number(row.PurchaseEventCount) - 1, 0)) errors.push('OBSERVATION_COUNT');
  if (row.CycleComputationMode === 'PERSONAL_HISTORY') {
    const cycle = Number(kind === 'product' ? row.ChuKyNgay : row.ChuKyTB);
    if (Number(row.PurchaseEventCount) < 3 || !Number.isInteger(cycle)) errors.push('PERSONAL_CYCLE');
    if (ymd(row.NgayDuKien) !== addDays(row.LanMuaCuoiDate, cycle)) errors.push('EXPECTED_DATE');
    if (Number(row.ConLaiNgay) !== diffDays(row.DataTo, row.NgayDuKien)) errors.push('SIGNED_REMAINING');
  }
  if (kind === 'product' && Number(row.AvailableStock) <= 0) errors.push('NO_SELLABLE_STOCK');
  return errors;
}

async function product(transaction, username, customerId) {
  const response = await new sql.Request(transaction)
    .input('Username', sql.VarChar(50), username)
    .input('MaKhachHang', sql.NVarChar(100), customerId)
    .input('ObjectID', sql.NVarChar(100), '')
    .input('TopN', sql.Int, 10)
    .execute('dbo.API_GoiYDonHang_AI');
  return (response.recordset || []).filter((row) => !messageRow(row));
}

async function route(transaction, username, customerId) {
  const response = await new sql.Request(transaction)
    .input('Username', sql.VarChar(50), username)
    .input('MaKhachHang', sql.NVarChar(100), customerId)
    .input('SoNgayVangMat', sql.Int, 999)
    .input('NgayBaoDong', sql.Int, 999)
    .input('TopN', sql.Int, 1)
    .input('NgayTarget', sql.VarChar(20), '')
    .execute('dbo.API_TuyenBanHang_AI');
  return (response.recordset || []).filter((row) => !messageRow(row));
}

async function main() {
  const postdeploy = process.argv.includes('--postdeploy');
  const env = { ...readEnv(), ...process.env };
  if (String(env.TEST_DB_DATABASE || '').toLowerCase() !== 'medtest') {
    throw new Error(`Preflight chỉ được chạy trên medtest; hiện tại là ${env.TEST_DB_DATABASE || '(empty)'}`);
  }

  const productSource = fs.readFileSync(path.join(ROOT, SQL_FILES[1]), 'utf8');
  const routeSource = fs.readFileSync(path.join(ROOT, SQL_FILES[2]), 'utf8');
  const gatewaySource = fs.readFileSync(path.join(ROOT, 'n8n/API_Services/API_Execute.json'), 'utf8');
  const frontendSource = fs.readFileSync(path.join(ROOT, 'chatbot-widget/js/chatbot.js'), 'utf8');
  const staticChecks = {
    productReadsApprovedRule: productSource.includes("Status = 'APPROVED'") && productSource.includes('BR-RECOMMENDATION-008'),
    routeReadsApprovedRule: routeSource.includes("Status = 'APPROVED'") && routeSource.includes('BR-RECOMMENDATION-008'),
    noLegacyAllHistoryFallback: !productSource.includes('Fallback if empty in UAT') && !productSource.includes('Toàn thời gian'),
    noDraftRecommendationLabels: !productSource.includes('BR-SALES-V1-DRAFT') && !routeSource.includes('BR-ROUTE-V1-DRAFT')
      && !gatewaySource.includes("'@goi_ydon_hang': 'BR-SALES-V1-DRAFT'")
      && !gatewaySource.includes("'@tuyen_ban_hang': 'BR-ROUTE-V1-DRAFT'"),
    gatewayUsesSqlMetadata: gatewaySource.includes("['RuleSourceCodes', 'DataSource'") && gatewaySource.includes("['RuleSourceLabel', 'sourceLabel']"),
    frontendUsesNormalizedContract: frontendSource.includes('RecommendationReasonCodes')
      && frontendSource.includes('RuleSourceLabel') && frontendSource.includes('ConLaiNgay'),
    purchaseEventsAreDaily: productSource.includes('GROUP BY D.ItemID, CAST(I.DocumentDate AS DATE)')
      && routeSource.includes('GROUP BY I.ObjectID, CAST(I.DocumentDate AS DATE)'),
    configuredRouteScoring: routeSource.includes('@ScoreOverdue') && !routeSource.includes('THEN 100')
      && !routeSource.includes('THEN 80') && !routeSource.includes('THEN 50'),
  };
  if (Object.values(staticChecks).some((value) => !value)) {
    throw new Error(`Static contract check failed: ${JSON.stringify(staticChecks)}`);
  }

  const pool = await sql.connect({
    server: env.TEST_DB_SERVER,
    port: Number(env.TEST_DB_PORT || 1433),
    database: env.TEST_DB_DATABASE,
    user: env.TEST_DB_USER,
    password: env.TEST_DB_PASSWORD,
    options: { encrypt: false, trustServerCertificate: true },
    connectionTimeout: 15000,
    requestTimeout: 240000,
    pool: { max: 1, min: 0, idleTimeoutMillis: 10000 },
  });

  const transaction = new sql.Transaction(pool);
  let began = false;
  try {
    const compiled = [];
    let context = pool;
    if (!postdeploy) {
      await transaction.begin(sql.ISOLATION_LEVEL.SERIALIZABLE);
      began = true;
      context = transaction;
      for (const relativePath of SQL_FILES) {
        let count = 0;
        for (const batch of batches(fs.readFileSync(path.join(ROOT, relativePath), 'utf8'))) {
          await new sql.Request(context).batch(batch);
          count += 1;
        }
        compiled.push({ file: relativePath, batches: count });
      }
    } else {
      const definitions = (await new sql.Request(context).query(`
SELECT o.name, OBJECT_DEFINITION(o.object_id) AS Definition
FROM sys.objects o
WHERE o.name IN ('API_GoiYDonHang_AI', 'API_TuyenBanHang_AI') AND o.type = 'P';`)).recordset;
      const invalid = definitions.filter((row) => !String(row.Definition || '').includes('BR-RECOMMENDATION-008')
        || !String(row.Definition || '').includes('ReasonText')
        || !String(row.Definition || '').includes('RuleSourceCodes'));
      if (definitions.length !== 2 || invalid.length) {
        throw new Error(`Deployed procedure definitions are stale: ${JSON.stringify(definitions.map((row) => row.name))}`);
      }
    }

    const formula = (await new sql.Request(context).query(`
WITH RawEvents AS
(
    SELECT * FROM (VALUES
        ('ROUNDING', CONVERT(date, '2026-01-01'), 'I1'),
        ('ROUNDING', CONVERT(date, '2026-01-04'), 'I2'),
        ('ROUNDING', CONVERT(date, '2026-01-08'), 'I3'),
        ('SAME_DAY', CONVERT(date, '2026-01-01'), 'I1'),
        ('SAME_DAY', CONVERT(date, '2026-01-01'), 'I2'),
        ('SAME_DAY', CONVERT(date, '2026-01-05'), 'I3'),
        ('SAME_DAY', CONVERT(date, '2026-01-09'), 'I4')
    ) V(CaseID, PurchaseDate, InvoiceID)
), DailyEvents AS
(
    SELECT CaseID, PurchaseDate, COUNT(*) InvoiceCount
    FROM RawEvents GROUP BY CaseID, PurchaseDate
)
SELECT CaseID, SUM(InvoiceCount) InvoiceCount, COUNT(*) PurchaseEventCount,
       CONVERT(int, ROUND(DATEDIFF(day, MIN(PurchaseDate), MAX(PurchaseDate)) * 1.0 / NULLIF(COUNT(*) - 1, 0), 0)) CycleDays
FROM DailyEvents GROUP BY CaseID ORDER BY CaseID;`)).recordset;
    const formulaPass = formula.some((row) => row.CaseID === 'ROUNDING' && row.PurchaseEventCount === 3 && row.CycleDays === 4)
      && formula.some((row) => row.CaseID === 'SAME_DAY' && row.InvoiceCount === 4 && row.PurchaseEventCount === 3 && row.CycleDays === 4);
    if (!formulaPass) throw new Error(`Formula cases failed: ${JSON.stringify(formula)}`);

    const accountResults = [];
    for (const [username, cohort] of ACCOUNTS) {
      const customerId = `UATV2_${cohort}_A`;
      const productRows = await product(context, username, customerId);
      const routeRows = await route(context, username, customerId);
      const productErrors = productRows.length ? validateContract(productRows[0], 'product') : [];
      const routeErrors = routeRows.length ? validateContract(routeRows[0], 'route') : ['NO_ROUTE_RESULT'];
      accountResults.push({
        username,
        customerId,
        productCount: productRows.length,
        productStatus: productRows.length ? 'CONTRACT_VERIFIED' : 'NO_SELLABLE_HISTORY_ITEM',
        productSample: productRows[0] ? { itemId: productRows[0].MaSanPham, reason: productRows[0].PrimaryReasonCode } : null,
        routeCount: routeRows.length,
        routeSample: routeRows[0] ? { reason: routeRows[0].PrimaryReasonCode, mode: routeRows[0].CycleComputationMode } : null,
        errors: [...productErrors.map((error) => `PRODUCT_${error}`), ...routeErrors.map((error) => `ROUTE_${error}`)],
      });
    }
    const failedAccounts = accountResults.filter((row) => row.errors.length);
    if (failedAccounts.length) throw new Error(`Runtime contract failed: ${JSON.stringify(failedAccounts)}`);
    const productContractsPassed = accountResults.filter((row) => row.productCount > 0).length;
    if (productContractsPassed === 0) throw new Error('Không có ca gợi ý sản phẩm bán được để kiểm tra contract.');

    const configCount = (await new sql.Request(context).query(`
SELECT COUNT(*) AS ConfigCount
FROM dbo.AI_BusinessRuleConfigTbl
WHERE RuleCode = 'BR-RECOMMENDATION-008' AND RuleVersion = '1.0.0'
  AND Status = 'APPROVED' AND EffectiveFrom <= SYSUTCDATETIME()
  AND (EffectiveTo IS NULL OR EffectiveTo > SYSUTCDATETIME());`)).recordset[0].ConfigCount;

    if (began) {
      await transaction.rollback();
      began = false;
    }
    console.log(JSON.stringify({
      Status: 'PASS',
      Database: env.TEST_DB_DATABASE,
      Mode: postdeploy ? 'READ_ONLY_POSTDEPLOY' : 'TRANSACTION_ROLLBACK',
      PersistedChanges: false,
      StaticChecks: staticChecks,
      Compiled: compiled,
      ApprovedConfigCount: configCount,
      FormulaCases: formula,
      AccountsChecked: accountResults.length,
      ProductContractsPassed: productContractsPassed,
      ProductNoSellableHistoryItem: accountResults.length - productContractsPassed,
      RouteContractsPassed: accountResults.length,
      Accounts: accountResults,
    }, null, 2));
  } finally {
    if (began) {
      try { await transaction.rollback(); } catch (_) { /* transaction can already be aborted */ }
    }
    await pool.close();
  }
}

main().catch((error) => {
  console.error(JSON.stringify({ Status: 'FAIL', PersistedChanges: false, Error: error.message }, null, 2));
  process.exitCode = 1;
});
