'use strict';

// CUSTOMER-CONTRACT-001 / 002 QA — medtest, read-only.
//  #2 API_ContractCustomerStats_AI  — SALE rollups must sum to the scope TOTAL,
//     counts must equal distinct canonical (CodeChinh) customers, no customer
//     outside the caller's Sale/QLBH scope.
//  #3 API_ContractCustomerNoSales_AI — 3 complete calendar months before AsOf,
//     every listed customer has net revenue <= 0, same scope as the stats proc.

const assert = require('assert/strict');
const { connectMedtest, sql } = require('./lib/search-test-db');

const YEAR = 2026;

async function main() {
  const pool = await connectMedtest();
  const q = async (t) => (await pool.request().query(t)).recordset;
  const stats = async (u) => (await pool.request()
    .input('Username', sql.VarChar(50), u).input('ContractYear', sql.Int, YEAR)
    .execute('dbo.API_ContractCustomerStats_AI')).recordset;
  const noSales = async (u) => (await pool.request()
    .input('Username', sql.VarChar(50), u).input('ContractYear', sql.Int, YEAR).input('TopN', sql.Int, 500)
    .execute('dbo.API_ContractCustomerNoSales_AI')).recordset;

  const checks = [];
  try {
    const admin = (await q(`SELECT TOP 1 UserName FROM dbo.SY_User WHERE COALESCE(Disable,0)=0 AND UPPER(COALESCE(UserGroupID,''))='ADMIN' ORDER BY UserName`))[0].UserName;
    const ql = (await q(`SELECT TOP 1 UserName FROM dbo.SY_User WHERE COALESCE(Disable,0)=0 AND UPPER(COALESCE(UserGroupID,'')) IN ('QL','QLMN') AND COALESCE(Manager,0)=1 ORDER BY UserName`))[0].UserName;
    const kd = (await q(`SELECT TOP 1 UserName FROM dbo.SY_User WHERE COALESCE(Disable,0)=0 AND UPPER(COALESCE(UserGroupID,'')) IN ('KD','KDMN') ORDER BY UserName`))[0].UserName;

    // --- assignment function ground truth (admin scope == everything) ---
    const fnRows = await q(`SELECT CanonicalObjectID, ObjectID, EmployeeID, ManagerID,
      CONVERT(INT, IsActiveAsOf) IsActiveAsOf FROM dbo.AI_ContractCustomerAssignmentFnc(${YEAR}, CONVERT(DATE, GETDATE()))`);
    assert.ok(fnRows.length > 0, 'assignment fn returned nothing for 2026');
    const canon = new Set(fnRows.map(r => r.CanonicalObjectID));
    // one row per canonical (dedup already collapsed multi-code owners)
    assert.equal(fnRows.length, canon.size, 'assignment fn must emit one row per canonical customer');
    checks.push('ASSIGNMENT_FN_ONE_ROW_PER_CANONICAL');

    // canonical uses CodeChinh when present
    const mismatch = await q(`
      SELECT TOP 5 F.ObjectID, F.CanonicalObjectID, O.CodeChinh
      FROM dbo.AI_ContractCustomerAssignmentFnc(${YEAR}, CONVERT(DATE, GETDATE())) F
      JOIN dbo.CF_ObjectTbl O ON O.ObjectID = F.ObjectID
      WHERE NULLIF(LTRIM(RTRIM(O.CodeChinh)),'') IS NOT NULL
        AND F.CanonicalObjectID <> LTRIM(RTRIM(O.CodeChinh))`);
    assert.equal(mismatch.length, 0, 'canonical id must equal CodeChinh when CodeChinh is set');
    checks.push('CANONICAL_ID_FOLLOWS_CODECHINH');

    // --- #2 admin stats: TOTAL == sum(SALE) == distinct canonical ---
    const aRows = await stats(admin);
    const total = aRows.find(r => r.ScopeLevel === 'TOTAL');
    const sales = aRows.filter(r => r.ScopeLevel === 'SALE');
    assert.ok(total, 'stats missing TOTAL row');
    const sum = (k) => sales.reduce((s, r) => s + Number(r[k] || 0), 0);
    assert.equal(sum('ContractCustomerCount'), Number(total.ContractCustomerCount), 'SALE sum != TOTAL (customers)');
    assert.equal(sum('NoSales3MonthsCount'), Number(total.NoSales3MonthsCount), 'SALE sum != TOTAL (no-sales)');
    assert.equal(Number(total.ContractCustomerCount), canon.size, 'admin TOTAL must equal distinct canonical customers');
    checks.push('STATS_TOTAL_EQUALS_SALE_ROLLUP_AND_CANONICAL_COUNT');

    // revenue window = 3 complete calendar months before AsOfDate
    const d = new Date(total.AsOfDate);
    const pEnd = new Date(total.RevenuePeriodEnd), pStart = new Date(total.RevenuePeriodStart);
    assert.equal(pEnd.getUTCFullYear() * 12 + pEnd.getUTCMonth(), d.getUTCFullYear() * 12 + d.getUTCMonth() - 1,
      'RevenuePeriodEnd must be the last day of the month before AsOf');
    assert.equal(pStart.getUTCDate(), 1, 'RevenuePeriodStart must be the 1st of a month');
    assert.equal((pEnd.getUTCFullYear() * 12 + pEnd.getUTCMonth()) - (pStart.getUTCFullYear() * 12 + pStart.getUTCMonth()), 2,
      'window must span exactly 3 calendar months');
    checks.push('NOSALES_WINDOW_IS_3_COMPLETE_CALENDAR_MONTHS');

    // --- scope isolation: QL sees only its group, KD only its own customers ---
    const actorOf = async (u) => (await pool.request().input('u', sql.VarChar(50), u).query(
      `SELECT COALESCE(NULLIF(EmployeeID,''),NULLIF(ManagerID,''),CeoID) actor, EmployeeID FROM dbo.SY_User WHERE UserName=@u`)).recordset[0];

    const qlActor = await actorOf(ql);
    const qlSales = (await stats(ql)).filter(r => r.ScopeLevel === 'SALE');
    for (const r of qlSales)
      assert.ok(r.ManagerID === qlActor.actor || r.EmployeeID === qlActor.actor,
        `QL ${ql} sees Sale outside its group: mgr=${r.ManagerID} emp=${r.EmployeeID} actor=${qlActor.actor}`);
    assert.ok(Number((await stats(ql)).find(r => r.ScopeLevel === 'TOTAL').ContractCustomerCount) <= canon.size,
      'QL scope larger than global');
    checks.push('QL_SCOPE_LIMITED_TO_OWN_GROUP');

    const kdActor = await actorOf(kd);
    const kdTotal = (await stats(kd)).find(r => r.ScopeLevel === 'TOTAL');
    const kdSales = (await stats(kd)).filter(r => r.ScopeLevel === 'SALE');
    for (const r of kdSales)
      assert.equal(r.EmployeeID, kdActor.EmployeeID, `KD ${kd} sees another Sale's customers`);
    checks.push('KD_SCOPE_LIMITED_TO_OWN_CUSTOMERS');

    // --- #3 no-sales list ---
    const aNoSales = await noSales(admin);
    for (const r of aNoSales) {
      assert.ok(Number(r.RevenueLast3Months) <= 0, `no-sales row has revenue ${r.RevenueLast3Months}`);
      assert.equal(r.AlertCode, 'NO_NET_REVENUE_IN_LAST_3_COMPLETE_MONTHS');
      assert.ok(canon.has(r.CanonicalObjectID), 'no-sales row not in assignment universe');
    }
    // count parity with the stats rollup (both: active contract customers, revenue<=0, same window, same scope)
    assert.equal(aNoSales.length <= 500 ? aNoSales.length : 500, Math.min(500, Number(total.NoSales3MonthsCount)),
      `no-sales list length ${aNoSales.length} != stats NoSales3MonthsCount ${total.NoSales3MonthsCount} (TopN 500)`);
    checks.push('NOSALES_LIST_MATCHES_STATS_ROLLUP_AND_REVENUE_NONPOSITIVE');

    const kdNoSales = await noSales(kd);
    for (const r of kdNoSales)
      assert.equal(r.EmployeeID, kdActor.EmployeeID, 'KD no-sales list leaked another Sale');
    checks.push('NOSALES_SCOPE_MATCHES_STATS_SCOPE');

    console.log(JSON.stringify({
      status: 'PASS', mode: 'READ_ONLY',
      accounts: { admin, ql, kd },
      canonicalCustomers2026: canon.size,
      adminTotal: Number(total.ContractCustomerCount),
      adminNoSales: Number(total.NoSales3MonthsCount),
      qlTotal: Number((await stats(ql)).find(r => r.ScopeLevel === 'TOTAL').ContractCustomerCount),
      kdTotal: Number(kdTotal.ContractCustomerCount),
      revenueWindow: [total.RevenuePeriodStart, total.RevenuePeriodEnd],
      checks
    }, null, 2));
  } finally {
    await pool.close();
  }
}

main().catch(e => { console.error('FAIL:', e.message); process.exitCode = 1; });
