'use strict';

/* Read-only post-deploy verification for BR-TIER-005/2.0.0 on medtest. */
const fs = require('fs');
const path = require('path');
const sql = require('mssql');

const ROOT = path.resolve(__dirname, '..');

function readEnv() {
  const values = {};
  for (const line of fs.readFileSync(path.join(ROOT, '.env'), 'utf8').split(/\r?\n/)) {
    const match = line.match(/^\s*([^#=]+)=(.*)$/);
    if (match) values[match[1].trim()] = match[2].trim();
  }
  return values;
}

async function queryTier(pool, username, customerId, tier = '') {
  const response = await pool.request()
    .input('Username', sql.VarChar(50), username)
    .input('MaKhachHang', sql.NVarChar(100), customerId || '')
    .input('NhomFilter', sql.VarChar(50), tier)
    .input('Page', sql.Int, 1)
    .input('PageSize', sql.Int, 1)
    .input('AsOfDate', sql.Date, new Date('2026-08-03T00:00:00Z'))
    .execute('dbo.API_ChamDiemKH_AI');
  return (response.recordset || [])[0] || null;
}

async function main() {
  const env = { ...readEnv(), ...process.env };
  if (String(env.TEST_DB_DATABASE || '').toLowerCase() !== 'medtest') {
    throw new Error(`Verification chỉ được chạy trên medtest; hiện tại là ${env.TEST_DB_DATABASE || '(empty)'}`);
  }

  const pool = await sql.connect({
    server: env.TEST_DB_SERVER,
    port: Number(env.TEST_DB_PORT || 1433),
    database: env.TEST_DB_DATABASE,
    user: env.TEST_DB_USER,
    password: env.TEST_DB_PASSWORD,
    options: { encrypt: false, trustServerCertificate: true },
    connectionTimeout: 15000,
    requestTimeout: 180000,
    pool: { max: 1, min: 0, idleTimeoutMillis: 10000 },
  });

  try {
    const configRows = (await pool.request().query(`
SELECT ConfigKey, ConfigValue, EffectiveFrom, ApprovedBy
FROM dbo.AI_BusinessRuleConfigTbl
WHERE RuleCode = 'BR-TIER-005'
  AND RuleVersion = '2.0.0'
  AND Status = 'APPROVED'
  AND EffectiveFrom <= SYSUTCDATETIME()
  AND (EffectiveTo IS NULL OR EffectiveTo > SYSUTCDATETIME())
ORDER BY ConfigKey;`)).recordset;
    const config = Object.fromEntries(configRows.map((row) => [row.ConfigKey, row.ConfigValue]));

    const definition = (await pool.request().query(`
SELECT OBJECT_DEFINITION(OBJECT_ID(N'dbo.API_ChamDiemKH_AI')) AS Definition;`)).recordset[0].Definition || '';
    const noHardcodeChecks = {
      approvedConfigCount21: configRows.length === 21,
      readsConfigTable: definition.includes('AI_BusinessRuleConfigTbl'),
      noThresholdLiteral25M: !definition.includes('25000000'),
      noThresholdLiteral5M: !definition.includes('5000000'),
      noViewerPercentileTier: !definition.includes('PERCENTILE_CONT'),
      methodConfigured: config.Method === 'FIXED_NET_REVENUE_FREQUENCY',
      returnSignedOnce: config.ReturnApplicationRule === 'DIRECT_SIGNED_SUM_NO_SECOND_NEGATION',
    };

    const pairs = [
      ['NDB001', 'QLBH013.MED', 'NAMDINHB.MED'],
      ['HUEA043', 'QLBH005.MED', 'HUEB.MED'],
      ['DL012', 'QLMN2', 'CanThoA'],
    ];
    const crossViewer = [];
    for (const [customerId, manager, sale] of pairs) {
      const managerRow = await queryTier(pool, manager, customerId);
      const saleRow = await queryTier(pool, sale, customerId);
      crossViewer.push({
        CustomerID: customerId,
        ManagerTier: managerRow?.Nhom || null,
        SaleTier: saleRow?.Nhom || null,
        ManagerScore: managerRow?.DiemTongHop ?? null,
        SaleScore: saleRow?.DiemTongHop ?? null,
        NetRevenue12M: managerRow?.DoanhSo12Thang ?? null,
        Frequency6M: managerRow?.SoLanMua6Thang ?? null,
        RuleVersion: managerRow?.RuleVersion || null,
        Pass: Boolean(managerRow && saleRow
          && managerRow.Nhom === saleRow.Nhom
          && Number(managerRow.DiemTongHop) === Number(saleRow.DiemTongHop)
          && managerRow.RuleVersion === 'BR-TIER-005/2.0.0'
          && saleRow.RuleVersion === 'BR-TIER-005/2.0.0'),
      });
    }

    const unrated = await queryTier(pool, 'NAMDINHB.MED', '', 'UNRATED');
    const unratedPass = Boolean(unrated
      && unrated.Nhom === 'UNRATED'
      && unrated.ValueSegment === 'UNRATED'
      && unrated.RiskLevel === 'UNKNOWN'
      && unrated.DiemTongHop === null
      && !String(unrated.XuHuong || '').includes('NEW_CUSTOMER')
      && Number(unrated.SoHoaDon12Thang) === 0);

    const uiSource = fs.readFileSync(path.join(ROOT, 'chatbot-widget', 'js', 'chatbot.js'), 'utf8');
    const buildSource = fs.readFileSync(path.join(ROOT, 'scripts', 'build.js'), 'utf8');
    const uiChecks = {
      unratedTierFilter: uiSource.includes('<option value="UNRATED">Chưa đủ dữ liệu</option>')
        && uiSource.includes('data-tier-filter="tier"'),
      unknownRiskFilter: uiSource.includes('<option value="UNKNOWN">Chưa đủ dữ liệu</option>')
        && uiSource.includes('data-tier-filter="risk"'),
      usesApiClassification: uiSource.includes('var tierName = row.PhanLoai'),
      doesNotRepeatRiskDayThresholds: !uiSource.includes("daysValue >= 90 ? 'Cần chú ý'"),
      unratedScoreFriendly: uiSource.includes("return 'Chưa chấm điểm'"),
      unknownRiskFriendly: uiSource.includes("'UNKNOWN': 'Chưa đánh giá'"),
      frontendVersionDeclared: /APP_VERSION = '\d+\.\d+'/.test(buildSource),
    };

    const status = Object.values(noHardcodeChecks).every(Boolean)
      && crossViewer.every((row) => row.Pass)
      && unratedPass
      && Object.values(uiChecks).every(Boolean)
      ? 'PASS' : 'FAIL';

    console.log(JSON.stringify({
      Task: 'CORE-006/CORE-007',
      Status: status,
      Mode: 'READ_ONLY_POST_DEPLOY',
      Database: env.TEST_DB_DATABASE,
      RuleVersion: 'BR-TIER-005/2.0.0',
      EffectiveFromUtc: configRows[0]?.EffectiveFrom || null,
      ApprovedBy: configRows[0]?.ApprovedBy || null,
      NoHardcodeChecks: noHardcodeChecks,
      CrossViewerChecks: crossViewer,
      UnratedCheck: unrated ? {
        Pass: unratedPass,
        ObjectID: unrated.ObjectID,
        Tier: unrated.Nhom,
        RiskLevel: unrated.RiskLevel,
        InvoiceCount12M: unrated.SoHoaDon12Thang,
      } : { Pass: false },
      UiChecks: uiChecks,
    }, null, 2));
    if (status !== 'PASS') process.exitCode = 1;
  } finally {
    await pool.close();
  }
}

main().catch((error) => {
  console.error(JSON.stringify({ Task: 'CORE-006/CORE-007', Status: 'ERROR', Error: error.message }, null, 2));
  process.exitCode = 1;
});
