'use strict';

/*
 * CORE-006 discovery only.
 * Reads medtest to measure the current A/B/C draft, return impact, data
 * coverage, and viewer-scope instability. It never writes to the database.
 */
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

function loadFixtures() {
  const fixturePath = path.join(ROOT, 'config', 'uat', 'account-fixtures.v1.json');
  if (!fs.existsSync(fixturePath)) return {};
  const fixtures = JSON.parse(fs.readFileSync(fixturePath, 'utf8'));
  return fixtures.accounts || {};
}

async function queryScopeSummary(pool, username) {
  async function getCount(tier) {
    const request = pool.request()
      .input('Username', sql.VarChar(50), username)
      .input('Page', sql.Int, 1)
      .input('PageSize', sql.Int, 1);
    if (tier) request.input('NhomFilter', sql.VarChar(50), tier);
    const response = await request.execute('dbo.API_ChamDiemKH_AI');
    const row = (response.recordset || [])[0];
    return { count: Number(row?.TotalRows || 0), row };
  }

  const all = await getCount('');
  const a = await getCount('A');
  const b = await getCount('B');
  const c = await getCount('C');
  return {
    Username: username,
    TotalRows: all.count,
    TierA: a.count,
    TierB: b.count,
    TierC: c.count,
    RuleVersion: all.row?.RuleVersion || null,
    SingleCustomerAutomaticallyA: all.count === 1 && a.count === 1,
  };
}

async function queryCustomerTier(pool, username, customerId) {
  const response = await pool.request()
    .input('Username', sql.VarChar(50), username)
    .input('MaKhachHang', sql.NVarChar(100), customerId)
    .input('Page', sql.Int, 1)
    .input('PageSize', sql.Int, 1)
    .execute('dbo.API_ChamDiemKH_AI');
  const row = (response.recordset || [])[0];
  return {
    Username: username,
    CustomerID: customerId,
    Tier: row?.Nhom || null,
    Score: row?.DiemTongHop === undefined ? null : Number(row.DiemTongHop),
    Revenue12M: row?.DoanhSo12Thang === undefined ? null : Number(row.DoanhSo12Thang),
    Frequency6M: row?.SoLanMua6Thang === undefined ? null : Number(row.SoLanMua6Thang),
  };
}

async function main() {
  const env = readEnv();
  if (String(env.TEST_DB_DATABASE || '').toLowerCase() !== 'medtest') {
    throw new Error(`CORE-006 analysis is restricted to medtest; got ${env.TEST_DB_DATABASE || '(empty)'}.`);
  }

  const pool = await sql.connect({
    server: env.TEST_DB_SERVER,
    port: Number(env.TEST_DB_PORT || 1433),
    database: env.TEST_DB_DATABASE,
    user: env.TEST_DB_USER,
    password: env.TEST_DB_PASSWORD,
    options: { encrypt: false, trustServerCertificate: true },
    connectionTimeout: 15000,
    requestTimeout: 120000,
    pool: { max: 2, min: 0, idleTimeoutMillis: 10000 },
  });

  try {
    const analysis = await pool.request().query(`
SET NOCOUNT ON;
SET TRANSACTION ISOLATION LEVEL READ UNCOMMITTED;

DECLARE @AsOfDate DATE = CAST(GETDATE() AS DATE);
DECLARE @EndExclusive DATETIME2(0) = DATEADD(DAY, 1, CAST(@AsOfDate AS DATETIME2(0)));
DECLARE @Start12 DATETIME2(0) = DATEADD(MONTH, -12, @EndExclusive);
DECLARE @Start6 DATETIME2(0) = DATEADD(MONTH, -6, @EndExclusive);

SELECT
    DB_NAME() AS DatabaseName,
    CAST(GETDATE() AS DATETIME2(0)) AS ServerNow,
    @AsOfDate AS AsOfDate,
    @Start12 AS Window12StartInclusive,
    @EndExclusive AS WindowEndExclusive,
    (SELECT MAX(DocumentDate) FROM dbo.AR_InvoiceTbl) AS MaxInvoiceDate,
    (SELECT MAX(DocumentDate) FROM dbo.AR_ReturnTbl) AS MaxReturnDate;

SELECT
    V.StatusID,
    COUNT_BIG(*) AS ViewLineCount,
    COUNT(DISTINCT V.DocumentID) AS DocumentCount,
    CAST(SUM(COALESCE(V.TotalAmount, 0)) AS DECIMAL(19,2)) AS SignedAmount,
    CAST(MIN(COALESCE(V.TotalAmount, 0)) AS DECIMAL(19,2)) AS MinLineAmount,
    CAST(MAX(COALESCE(V.TotalAmount, 0)) AS DECIMAL(19,2)) AS MaxLineAmount
FROM dbo.AR_OrderAndReturnView V
WHERE V.DocumentDate >= @Start12
  AND V.DocumentDate < @EndExclusive
  AND V.StatusID IN (3, 6, 7, 8, 99)
GROUP BY V.StatusID
ORDER BY V.StatusID;

SELECT O.ObjectID
INTO #ActiveCustomers
FROM dbo.CF_ObjectTbl O
WHERE COALESCE(O.isCustomer, 0) = 1
  AND COALESCE(O.isDisable, 0) = 0;

SELECT
    V.ObjectID,
    COUNT(DISTINCT CASE WHEN V.StatusID IN (3, 6, 7, 8) THEN V.DocumentID END) AS InvoiceCount12M,
    COUNT(DISTINCT CASE WHEN V.StatusID IN (3, 6, 7, 8) AND V.DocumentDate >= @Start6 THEN V.DocumentID END) AS Frequency6M,
    CAST(SUM(CASE WHEN V.StatusID IN (3, 6, 7, 8) THEN COALESCE(V.TotalAmount, 0) ELSE 0 END) AS DECIMAL(19,2)) AS GrossRevenue12M,
    CAST(SUM(CASE WHEN V.StatusID = 99 THEN COALESCE(V.TotalAmount, 0) ELSE 0 END) AS DECIMAL(19,2)) AS SignedReturn12M,
    CAST(SUM(CASE WHEN V.StatusID IN (3, 6, 7, 8, 99) THEN COALESCE(V.TotalAmount, 0) ELSE 0 END) AS DECIMAL(19,2)) AS NetRevenue12M,
    MAX(CASE WHEN V.StatusID IN (3, 6, 7, 8) THEN V.DocumentDate END) AS LastPurchaseDate
INTO #CustomerValue
FROM dbo.AR_OrderAndReturnView V
WHERE V.DocumentDate >= @Start12
  AND V.DocumentDate < @EndExclusive
  AND V.StatusID IN (3, 6, 7, 8, 99)
  AND NULLIF(V.ObjectID, '') IS NOT NULL
GROUP BY V.ObjectID;

SELECT
    COUNT_BIG(*) AS ActiveCustomerCount,
    SUM(CASE WHEN COALESCE(C.InvoiceCount12M, 0) > 0 THEN 1 ELSE 0 END) AS ScorableWithInvoice12M,
    SUM(CASE WHEN COALESCE(C.InvoiceCount12M, 0) = 0 THEN 1 ELSE 0 END) AS NoInvoice12M,
    SUM(CASE WHEN C.ObjectID IS NULL THEN 1 ELSE 0 END) AS NoRecognizedActivity12M,
    SUM(CASE WHEN C.SignedReturn12M < 0 THEN 1 ELSE 0 END) AS CustomersWithSignedReturn12M,
    SUM(CASE WHEN C.NetRevenue12M <= 0 AND COALESCE(C.InvoiceCount12M, 0) > 0 THEN 1 ELSE 0 END) AS CustomersWithNonPositiveNetRevenue12M
FROM #ActiveCustomers A
LEFT JOIN #CustomerValue C ON C.ObjectID = A.ObjectID;

SELECT TOP (1)
    COUNT_BIG(*) OVER () AS ScorableCustomers,
    CAST(PERCENTILE_CONT(0.50) WITHIN GROUP (ORDER BY C.GrossRevenue12M) OVER () AS DECIMAL(19,2)) AS GrossP50,
    CAST(PERCENTILE_CONT(0.80) WITHIN GROUP (ORDER BY C.GrossRevenue12M) OVER () AS DECIMAL(19,2)) AS GrossP80,
    CAST(PERCENTILE_CONT(0.50) WITHIN GROUP (ORDER BY C.NetRevenue12M) OVER () AS DECIMAL(19,2)) AS NetP50,
    CAST(PERCENTILE_CONT(0.80) WITHIN GROUP (ORDER BY C.NetRevenue12M) OVER () AS DECIMAL(19,2)) AS NetP80,
    CAST(PERCENTILE_CONT(0.50) WITHIN GROUP (ORDER BY C.Frequency6M) OVER () AS DECIMAL(19,2)) AS Frequency6MP50,
    CAST(PERCENTILE_CONT(0.80) WITHIN GROUP (ORDER BY C.Frequency6M) OVER () AS DECIMAL(19,2)) AS Frequency6MP80,
    CAST(AVG(C.NetRevenue12M / CAST(12 AS DECIMAL(19,2))) OVER () AS DECIMAL(19,2)) AS AverageMonthlyNetRevenue,
    CAST(AVG(C.NetRevenue12M / NULLIF(C.InvoiceCount12M, 0)) OVER () AS DECIMAL(19,2)) AS AverageNetOrderValue
FROM #ActiveCustomers A
JOIN #CustomerValue C ON C.ObjectID = A.ObjectID
WHERE C.InvoiceCount12M > 0;

SELECT
    C.ObjectID,
    C.Frequency6M,
    C.GrossRevenue12M,
    C.SignedReturn12M,
    C.NetRevenue12M,
    CAST(C.NetRevenue12M / CAST(12 AS DECIMAL(19,2)) AS DECIMAL(19,2)) AS AverageMonthlyNetRevenue,
    CAST(C.NetRevenue12M / NULLIF(C.InvoiceCount12M, 0) AS DECIMAL(19,2)) AS AverageNetOrderValue,
    C.InvoiceCount12M,
    C.LastPurchaseDate
INTO #Scorable
FROM #ActiveCustomers A
JOIN #CustomerValue C ON C.ObjectID = A.ObjectID
WHERE C.InvoiceCount12M > 0;

SELECT
    S.*,
    CAST(PERCENT_RANK() OVER (ORDER BY S.Frequency6M ASC) * 100 AS INT) AS FScore,
    CAST(PERCENT_RANK() OVER (ORDER BY S.GrossRevenue12M ASC) * 100 AS INT) AS GrossMScore,
    CAST(PERCENT_RANK() OVER (ORDER BY S.NetRevenue12M ASC) * 100 AS INT) AS NetMScore
INTO #Normalized
FROM #Scorable S;

SELECT
    N.*,
    CAST(((0.25 * N.FScore) + (0.30 * N.GrossMScore)) / 0.55 AS INT) AS GrossDraftScore,
    CAST(((0.25 * N.FScore) + (0.30 * N.NetMScore)) / 0.55 AS INT) AS NetDraftScore
INTO #Scores
FROM #Normalized N;

SELECT
    S.*,
    CASE
        WHEN S.GrossDraftScore >= PERCENTILE_CONT(0.80) WITHIN GROUP (ORDER BY S.GrossDraftScore) OVER () THEN 'A'
        WHEN S.GrossDraftScore >= PERCENTILE_CONT(0.50) WITHIN GROUP (ORDER BY S.GrossDraftScore) OVER () THEN 'B'
        ELSE 'C'
    END AS GrossDraftTier,
    CASE
        WHEN S.NetDraftScore >= PERCENTILE_CONT(0.80) WITHIN GROUP (ORDER BY S.NetDraftScore) OVER () THEN 'A'
        WHEN S.NetDraftScore >= PERCENTILE_CONT(0.50) WITHIN GROUP (ORDER BY S.NetDraftScore) OVER () THEN 'B'
        ELSE 'C'
    END AS NetDraftTier
INTO #Tiered
FROM #Scores S;

SELECT
    GrossDraftTier AS Tier,
    COUNT_BIG(*) AS CustomerCount,
    CAST(COUNT_BIG(*) * 100.0 / NULLIF(SUM(COUNT_BIG(*)) OVER (), 0) AS DECIMAL(9,2)) AS CustomerPercent
FROM #Tiered
GROUP BY GrossDraftTier
ORDER BY GrossDraftTier;

SELECT
    NetDraftTier AS Tier,
    COUNT_BIG(*) AS CustomerCount,
    CAST(COUNT_BIG(*) * 100.0 / NULLIF(SUM(COUNT_BIG(*)) OVER (), 0) AS DECIMAL(9,2)) AS CustomerPercent
FROM #Tiered
GROUP BY NetDraftTier
ORDER BY NetDraftTier;

SELECT
    CASE
        WHEN NetRevenue12M >= 25000000 THEN 'A'
        WHEN NetRevenue12M >= 5000000 THEN 'B'
        ELSE 'C'
    END AS Tier,
    COUNT_BIG(*) AS CustomerCount,
    CAST(COUNT_BIG(*) * 100.0 / NULLIF(SUM(COUNT_BIG(*)) OVER (), 0) AS DECIMAL(9,2)) AS CustomerPercent
FROM #Tiered
GROUP BY CASE
    WHEN NetRevenue12M >= 25000000 THEN 'A'
    WHEN NetRevenue12M >= 5000000 THEN 'B'
    ELSE 'C'
END
ORDER BY Tier;

SELECT
    CASE
        WHEN NetRevenue12M >= 25000000 AND Frequency6M >= 6 THEN 'A'
        WHEN NetRevenue12M >= 5000000 AND Frequency6M >= 2 THEN 'B'
        ELSE 'C'
    END AS Tier,
    COUNT_BIG(*) AS CustomerCount,
    CAST(COUNT_BIG(*) * 100.0 / NULLIF(SUM(COUNT_BIG(*)) OVER (), 0) AS DECIMAL(9,2)) AS CustomerPercent
FROM #Tiered
GROUP BY CASE
    WHEN NetRevenue12M >= 25000000 AND Frequency6M >= 6 THEN 'A'
    WHEN NetRevenue12M >= 5000000 AND Frequency6M >= 2 THEN 'B'
    ELSE 'C'
END
ORDER BY Tier;

SELECT TOP (20)
    T.ObjectID,
    T.InvoiceCount12M,
    T.Frequency6M,
    T.GrossRevenue12M,
    T.SignedReturn12M,
    T.NetRevenue12M,
    T.GrossDraftTier,
    T.NetDraftTier,
    CASE WHEN T.GrossDraftTier <> T.NetDraftTier THEN 1 ELSE 0 END AS TierChangedAfterReturn
FROM #Tiered T
WHERE T.SignedReturn12M < 0
ORDER BY ABS(T.SignedReturn12M) DESC, T.ObjectID;

SELECT
    COUNT_BIG(*) AS ScorableCustomers,
    SUM(CASE WHEN GrossDraftTier <> NetDraftTier THEN 1 ELSE 0 END) AS TierChangesAfterReturns,
    SUM(CASE WHEN SignedReturn12M < 0 THEN 1 ELSE 0 END) AS CustomersWithReturns,
    CAST(SUM(GrossRevenue12M) AS DECIMAL(19,2)) AS GrossRevenue12M,
    CAST(SUM(SignedReturn12M) AS DECIMAL(19,2)) AS SignedReturn12M,
    CAST(SUM(NetRevenue12M) AS DECIMAL(19,2)) AS NetRevenue12M
FROM #Tiered;

DROP TABLE #Tiered;
DROP TABLE #Scores;
DROP TABLE #Normalized;
DROP TABLE #Scorable;
DROP TABLE #CustomerValue;
DROP TABLE #ActiveCustomers;
`);

    const recordsets = analysis.recordsets || [];
    const labels = [
      'runtime',
      'statusSummary12M',
      'customerCoverage',
      'distributionRows',
      'grossDraftTierDistribution',
      'netDraftTierDistribution',
      'fixedRevenueCandidateDistribution',
      'fixedGateCandidateDistribution',
      'topReturnImpacts',
      'returnImpactSummary',
    ];
    const report = {
      task: 'CORE-006',
      mode: 'READ_ONLY_DISCOVERY',
      database: env.TEST_DB_DATABASE,
    };
    labels.forEach((label, index) => { report[label] = recordsets[index] || []; });

    const fixtures = loadFixtures();
    const scopeSummaries = [];
    for (const username of Object.keys(fixtures)) {
      try {
        scopeSummaries.push(await queryScopeSummary(pool, username));
      } catch (error) {
        scopeSummaries.push({ Username: username, Error: error.message });
      }
    }
    report.viewerScopeSummaries = scopeSummaries;

    const customerScopes = new Map();
    for (const [username, fixture] of Object.entries(fixtures)) {
      const customerId = fixture.customerId;
      if (!customerScopes.has(customerId)) customerScopes.set(customerId, []);
      customerScopes.get(customerId).push(username);
    }
    const crossScopeComparisons = [];
    for (const [customerId, usernames] of customerScopes.entries()) {
      if (usernames.length < 2) continue;
      const observations = [];
      for (const username of usernames) {
        observations.push(await queryCustomerTier(pool, username, customerId));
      }
      crossScopeComparisons.push({
        CustomerID: customerId,
        Observations: observations,
        SameTier: new Set(observations.map((row) => row.Tier)).size === 1,
        SameScore: new Set(observations.map((row) => row.Score)).size === 1,
      });
    }
    report.crossViewerCustomerComparisons = crossScopeComparisons;
    console.log(JSON.stringify(report, null, 2));
  } finally {
    await pool.close();
  }
}

main().catch((error) => {
  console.error(JSON.stringify({ task: 'CORE-006', status: 'ERROR', message: error.message }, null, 2));
  process.exitCode = 1;
});
