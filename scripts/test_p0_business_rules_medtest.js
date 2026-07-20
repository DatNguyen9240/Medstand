'use strict';

const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const sql = require('mssql');
const { testDbConfig } = require('./lib/test-db-config');

const root = path.resolve(__dirname, '..');
const config = testDbConfig(root);
const accounts = ['QLBH013.MED', 'NAMDINHB.MED'];
const hash = (value) => crypto.createHash('sha256').update(String(value || '')).digest('hex').slice(0, 12);

async function recommendationFixture(pool, username) {
  const candidates = await pool.request().input('username', sql.VarChar(50), username).query(`
    SELECT TOP 20 I.ObjectID, MAX(I.DocumentDate) AS LastDate
    FROM dbo.AR_InvoiceTbl I
    JOIN dbo.AR_InvoiceDetailTbl D ON D.DocumentID = I.DocumentID
    JOIN dbo.CF_ItemTbl P ON P.ItemID = D.ItemID
    JOIN dbo.AR_GetObjectByUserFnc(@username) AO ON AO.ObjectID = I.ObjectID
    WHERE I.StatusID IN (3,6,7,8)
      AND ISNULL(P.ItemGroupID, '') = 'HH1'
      AND CAST(I.DocumentDate AS date) < CAST(GETDATE() AS date)
    GROUP BY I.ObjectID, D.ItemID
    HAVING COUNT(DISTINCT I.DocumentID) BETWEEN 1 AND 2
    ORDER BY MAX(I.DocumentDate) DESC;
  `);
  for (const candidate of candidates.recordset) {
    const result = await pool.request()
      .input('username', sql.VarChar(50), username)
      .input('objectId', sql.NVarChar(100), candidate.ObjectID)
      .query('EXEC dbo.API_GoiYDonHang_AI @Username=@username, @MaKhachHang=@objectId, @TopN=100;');
    const rows = (result.recordsets || []).flat().filter((row) => Number(row.SoLanMua) < 3);
    if (!rows.length) continue;
    assert(rows.every((row) => row.ChuKyNgay === null && row.ConLaiNgay === null), 'Insufficient history leaked a guessed cycle.');
    assert(rows.every((row) => String(row.RecommendationReason || '').includes('INSUFFICIENT_HISTORY')));
    return { result: 'PASS', fixtureHash: hash(candidate.ObjectID), rowsChecked: rows.length };
  }
  return { result: 'SKIP_NO_FIXTURE', rowsChecked: 0 };
}

async function tierRuntime(pool, username) {
  const result = await pool.request().input('username', sql.VarChar(50), username)
    .query('EXEC dbo.API_ChamDiemKH_AI @Username=@username, @Page=1, @PageSize=5;');
  const rows = (result.recordsets || []).flat().filter((row) => row.RuleSource);
  assert(rows.every((row) => row.RuleSource === 'FREQUENCY_MONETARY_PERCENTILE_DRAFT'));
  assert(rows.every((row) => ['LOW', 'MEDIUM', 'HIGH'].includes(String(row.RiskLevel))));
  return { result: 'PASS', rowsChecked: rows.length };
}

async function partialDebtFixture(pool, username) {
  const candidates = await pool.request().input('username', sql.VarChar(50), username).query(`
    SELECT TOP 8 V.ObjectID, MAX(I.DocumentDate) AS LastDate
    FROM dbo.vCongNoBanHang V
    JOIN dbo.AR_InvoiceTbl I ON I.DocumentID = V.DocumentID AND I.ObjectID = V.ObjectID
    JOIN (
      SELECT DocumentID, SUM(ISNULL(TotalAmount, 0)) AS InvoiceTotal
      FROM dbo.AR_InvoiceDetailTbl
      GROUP BY DocumentID
    ) D ON D.DocumentID = I.DocumentID
    JOIN dbo.AR_GetObjectByUserFnc(@username) AO ON AO.ObjectID = V.ObjectID
    WHERE ISNULL(V.Amount, 0) > 0
      AND ISNULL(D.InvoiceTotal, 0) > ISNULL(V.Amount, 0) + 0.01
    GROUP BY V.ObjectID
    ORDER BY MAX(I.DocumentDate) DESC;
  `);
  let runtimeErrors = 0;
  let firstRuntimeError = null;
  for (const candidate of candidates.recordset) {
    let result;
    try {
      result = await pool.request()
        .input('username', sql.VarChar(50), username)
        .input('objectId', sql.NVarChar(100), candidate.ObjectID)
        .query('DECLARE @asOf DATETIME=GETDATE(); EXEC dbo.API_CongNoChiTiet_AI @MaKhachHang=@objectId, @Username=@username, @DenNgay=@asOf;');
    } catch (error) {
      runtimeErrors += 1;
      if (!firstRuntimeError) {
        firstRuntimeError = {
          number: error.number || error.originalError?.info?.number || null,
          procedure: error.procName || error.originalError?.info?.procName || null,
          lineNumber: error.lineNumber || error.originalError?.info?.lineNumber || null,
          message: String(error.message || '').slice(0, 160)
        };
      }
      continue;
    }
    const rows = (result.recordsets || []).flat().filter((row) => Number(row.CreditAmount) > 0 && Number(row.RemainingAmount) > 0);
    if (!rows.length) continue;
    assert(rows.every((row) => row.CollectionStatus === 'PARTIALLY_PAID'));
    return { result: 'PASS', fixtureHash: hash(candidate.ObjectID), rowsChecked: rows.length, runtimeErrors, firstRuntimeError };
  }
  if (runtimeErrors === candidates.recordset.length && runtimeErrors > 0) {
    return { result: 'BLOCKED_DEBT_FUNCTION_RUNTIME', rowsChecked: 0, runtimeErrors, firstRuntimeError };
  }
  return { result: 'SKIP_NO_FIXTURE', rowsChecked: 0, runtimeErrors, firstRuntimeError };
}

async function main() {
  assert(/medtest/i.test(config.database), `Refusing runtime tests outside medtest: ${config.database}`);
  const pool = await sql.connect(config);
  try {
    const results = [];
    for (const username of accounts) {
      console.log(`[${username}] recommendation`);
      const recommendation = await recommendationFixture(pool, username);
      console.log(`[${username}] tier`);
      const tier = await tierRuntime(pool, username);
      console.log(`[${username}] partial debt`);
      const partialDebt = await partialDebtFixture(pool, username);
      results.push({
        username,
        recommendation,
        tier,
        partialDebt
      });
    }
    const blocked = results.some((entry) => entry.partialDebt.result === 'BLOCKED_DEBT_FUNCTION_RUNTIME');
    const report = { status: blocked ? 'MEDTEST_P0_RUNTIME_PARTIAL' : 'MEDTEST_P0_RUNTIME_PASS', testedAt: new Date().toISOString(), database: config.database, mode: 'READ_ONLY', results };
    const output = path.join(root, 'reports', 'business-rule-v1', 'p0-two-account-runtime.json');
    fs.mkdirSync(path.dirname(output), { recursive: true });
    fs.writeFileSync(output, JSON.stringify(report, null, 2), 'utf8');
    console.log(JSON.stringify(report, null, 2));
  } finally {
    await pool.close();
  }
}

main().catch((error) => {
  console.error(error.stack || error.message);
  process.exitCode = 1;
});
