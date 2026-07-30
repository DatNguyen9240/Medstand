'use strict';

/* UAT-013 — kiểm tra kỹ thuật chấm điểm khách hàng. Chỉ đọc DB medtest. */
const fs = require('fs');
const path = require('path');
const sql = require('mssql');

const ROOT = path.resolve(__dirname, '..');
const fixtures = JSON.parse(fs.readFileSync(
  path.join(ROOT, 'config', 'uat', 'account-fixtures.v1.json'), 'utf8',
)).accounts;

function readEnv() {
  const values = {};
  for (const line of fs.readFileSync(path.join(ROOT, '.env'), 'utf8').split(/\r?\n/)) {
    const match = line.match(/^\s*([^#=]+)=(.*)$/);
    if (match) values[match[1].trim()] = match[2].trim();
  }
  return values;
}

function expectedRisk(row) {
  const recency = Number(row.SoNgayKhongMua);
  const recent = Number(row.DoanhSo3ThangGan || 0);
  const previous = Number(row.DoanhSo3ThangTruoc || 0);
  if (recency >= 90) return 'HIGH';
  if (recency >= 45 || recent < previous * 0.8) return 'MEDIUM';
  return 'LOW';
}

function expectedTrend(row) {
  const frequency = Number(row.Frequency_6M || 0);
  const recent = Number(row.DoanhSo3ThangGan || 0);
  const previous = Number(row.DoanhSo3ThangTruoc || 0);
  if (frequency === 0 || !row.LanMuaCuoiRaw) return 'NEW_CUSTOMER';
  if (previous === 0) return 'NEW_OR_INSUFFICIENT_CYCLE';
  if (recent > previous * 1.1) return 'GROWTH';
  if (recent < previous * 0.9) return 'DECLINE';
  return 'STABLE';
}

async function queryScores(pool, username, filter = {}) {
  const response = await pool.request()
    .input('Username', sql.VarChar(50), username)
    .input('MaKhachHang', sql.NVarChar(100), filter.customerId || '')
    .input('NhomFilter', sql.VarChar(50), filter.tier || '')
    .input('RiskLevel', sql.VarChar(20), filter.risk || '')
    .input('Page', sql.Int, 1)
    .input('PageSize', sql.Int, filter.pageSize || 100)
    .execute('dbo.API_ChamDiemKH_AI');
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
    const results = [];
    for (const [username, fixture] of Object.entries(fixtures)) {
      const result = { UserName: username, RoleName: fixture.role, RegionID: fixture.region, CustomerID: fixture.customerId };
      try {
        const pageRows = await queryScores(pool, username, { pageSize: 100 });
        const detailRows = await queryScores(pool, username, { customerId: fixture.customerId, pageSize: 10 });
        const allowedRows = (await pool.request()
          .input('Username', sql.VarChar(50), username)
          .query('SELECT ObjectID FROM dbo.AR_GetObjectByUserFnc(@Username);')).recordset || [];
        const allowed = new Set(allowedRows.map((row) => String(row.ObjectID).trim().toUpperCase()));
        const leaks = pageRows.filter((row) => !allowed.has(String(row.ObjectID || '').trim().toUpperCase()));
        const required = ['ObjectID', 'TenCuaHang', 'Nhom', 'ValueSegment', 'RiskLevel', 'DiemTongHop', 'SoNgayKhongMua', 'XuHuong', 'LyDoChinh', 'TotalRows', 'Page', 'PageSize', 'RuleVersion'];
        const missing = pageRows.filter((row) => required.some((key) => row[key] === undefined || row[key] === null || String(row[key]).trim() === ''));
        const invalidTier = pageRows.filter((row) => !['A', 'B', 'C'].includes(String(row.Nhom)) || row.Nhom !== row.ValueSegment);
        const invalidRisk = pageRows.filter((row) => !['LOW', 'MEDIUM', 'HIGH'].includes(String(row.RiskLevel)));
        const invalidScore = pageRows.filter((row) => Number(row.DiemTongHop) < 0 || Number(row.DiemTongHop) > 100);

        const ids = pageRows.map((row) => String(row.ObjectID).replaceAll("'", "''"));
        let rawById = new Map();
        if (ids.length) {
          const rawRows = (await pool.request().query(`
SELECT
  O.ObjectID,
  Recency_Days = DATEDIFF(DAY, MAX(I.DocumentDate), GETDATE()),
  Frequency_6M = COUNT(DISTINCT CASE WHEN I.DocumentDate >= DATEADD(MONTH, -6, GETDATE()) THEN I.DocumentID END),
  DoanhSo3ThangGan = SUM(CASE WHEN I.DocumentDate >= DATEADD(MONTH, -3, GETDATE()) THEN D.TotalAmount ELSE 0 END),
  DoanhSo3ThangTruoc = SUM(CASE WHEN I.DocumentDate BETWEEN DATEADD(MONTH, -6, GETDATE()) AND DATEADD(MONTH, -3, GETDATE()) THEN D.TotalAmount ELSE 0 END),
  LanMuaCuoiRaw = MAX(I.DocumentDate)
FROM dbo.CF_ObjectTbl O WITH (NOLOCK)
JOIN dbo.AR_InvoiceTbl I WITH (NOLOCK) ON I.ObjectID = O.ObjectID AND I.StatusID IN (3, 6, 7, 8)
JOIN dbo.AR_InvoiceDetailTbl D WITH (NOLOCK) ON D.DocumentID = I.DocumentID
WHERE O.ObjectID IN (${ids.map((id) => `N'${id}'`).join(',')})
  AND I.DocumentDate >= DATEADD(MONTH, -12, GETDATE())
GROUP BY O.ObjectID;`)).recordset || [];
          rawById = new Map(rawRows.map((row) => [String(row.ObjectID), row]));
        }
        const riskMismatches = [];
        const trendMismatches = [];
        for (const row of pageRows) {
          const raw = rawById.get(String(row.ObjectID));
          if (!raw) continue;
          const merged = { ...row, ...raw };
          const risk = expectedRisk(merged);
          if (row.RiskLevel !== risk) riskMismatches.push({ ObjectID: row.ObjectID, actual: row.RiskLevel, expected: risk });
          const trend = expectedTrend(merged);
          const actual = String(row.XuHuong || '');
          const trendOk = trend === 'NEW_CUSTOMER' ? actual.includes('NEW_CUSTOMER')
            : trend === 'NEW_OR_INSUFFICIENT_CYCLE' ? actual.includes('Khách mới') || actual.includes('chưa đủ chu kỳ')
              : trend === 'GROWTH' ? actual === 'Tăng trưởng'
                : trend === 'DECLINE' ? actual === 'Sụt giảm'
                  : actual === 'Ổn định';
          if (!trendOk) trendMismatches.push({ ObjectID: row.ObjectID, actual, expected: trend });
        }

        const tierFilterChecks = {};
        for (const tier of ['A', 'B', 'C']) {
          const rows = await queryScores(pool, username, { tier, pageSize: 20 });
          tierFilterChecks[tier] = { count: rows.length, foreignTierCount: rows.filter((row) => row.Nhom !== tier).length };
        }
        const riskFilterChecks = {};
        for (const risk of ['LOW', 'MEDIUM', 'HIGH']) {
          const rows = await queryScores(pool, username, { risk, pageSize: 20 });
          riskFilterChecks[risk] = { count: rows.length, foreignRiskCount: rows.filter((row) => row.RiskLevel !== risk).length };
        }

        const errors = [];
        if (!pageRows.length) errors.push('NO_SCORING_DATA');
        if (!detailRows.length || detailRows.some((row) => row.ObjectID !== fixture.customerId)) errors.push('REPRESENTATIVE_CUSTOMER_NOT_RETURNED');
        if (leaks.length) errors.push('CUSTOMER_SCOPE_LEAK');
        if (missing.length) errors.push('MISSING_REQUIRED_FIELDS');
        if (invalidTier.length) errors.push('INVALID_TIER');
        if (invalidRisk.length) errors.push('INVALID_RISK');
        if (invalidScore.length) errors.push('INVALID_SCORE_RANGE');
        if (riskMismatches.length) errors.push('RISK_45_90_MISMATCH');
        if (trendMismatches.length) errors.push('TREND_MISMATCH');
        if (Object.values(tierFilterChecks).some((item) => item.foreignTierCount)) errors.push('TIER_FILTER_LEAK');
        if (Object.values(riskFilterChecks).some((item) => item.foreignRiskCount)) errors.push('RISK_FILTER_LEAK');

        Object.assign(result, {
          ReturnedRows: pageRows.length,
          TotalRows: pageRows[0]?.TotalRows || 0,
          RepresentativeRows: detailRows.length,
          ScopeLeakCount: leaks.length,
          MissingFieldCount: missing.length,
          InvalidTierCount: invalidTier.length,
          InvalidRiskCount: invalidRisk.length,
          InvalidScoreCount: invalidScore.length,
          RiskMismatchCount: riskMismatches.length,
          TrendMismatchCount: trendMismatches.length,
          ObservedTiers: [...new Set(pageRows.map((row) => row.Nhom))].sort(),
          ObservedRisks: [...new Set(pageRows.map((row) => row.RiskLevel))].sort(),
          ObservedTrends: [...new Set(pageRows.map((row) => row.XuHuong))].sort(),
          TierFilterChecks: tierFilterChecks,
          RiskFilterChecks: riskFilterChecks,
          Errors: errors,
          Status: errors.length ? 'FAIL' : 'PASS',
        });
        if (riskMismatches.length) result.RiskMismatches = riskMismatches;
        if (trendMismatches.length) result.TrendMismatches = trendMismatches;
      } catch (error) {
        result.Status = 'ERROR_API_CALL';
        result.Error = error.message;
      }
      results.push(result);
    }

    const frontend = fs.readFileSync(path.join(ROOT, 'chatbot-widget', 'js', 'chatbot.js'), 'utf8');
    const uiChecks = [
      { Check: 'TIER_AND_RISK_VISIBLE', Pass: frontend.includes('row.Nhom || row.ValueSegment') && frontend.includes('row.RiskLevel') },
      { Check: 'TREND_AND_REASON_VISIBLE', Pass: frontend.includes('row.XuHuong') && frontend.includes('row.LyDoChinh') },
      { Check: 'FILTERS_SUPPORTED', Pass: frontend.includes("params['@NhomFilter']") && frontend.includes("params['@RiskLevel']") },
    ];
    const failures = results.filter((row) => row.Status !== 'PASS');
    const summary = {
      task: 'UAT-013',
      mode: 'READ_ONLY_RUNTIME_DATABASE_AND_STATIC_UI_VERIFICATION',
      database: env.TEST_DB_DATABASE,
      status: failures.length || uiChecks.some((row) => !row.Pass) ? 'FAIL' : 'PASS',
      accountsChecked: results.length,
      accountsPassed: results.length - failures.length,
      totalScopeLeaks: results.reduce((sum, row) => sum + Number(row.ScopeLeakCount || 0), 0),
      totalRiskMismatches: results.reduce((sum, row) => sum + Number(row.RiskMismatchCount || 0), 0),
      totalTrendMismatches: results.reduce((sum, row) => sum + Number(row.TrendMismatchCount || 0), 0),
      uiChecks,
      failures,
      accounts: results,
    };
    console.log(JSON.stringify(summary, null, 2));
    if (summary.status !== 'PASS') process.exitCode = 1;
  } finally {
    await pool.close();
  }
}

main().catch((error) => {
  console.error(JSON.stringify({ task: 'UAT-013', status: 'ERROR', message: error.message }, null, 2));
  process.exitCode = 1;
});
