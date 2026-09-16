'use strict';

/* UAT-012 — kiểm tra tuyến, Top 5/8, ngưỡng 45 ngày, báo động 5 ngày và scope. Chỉ đọc DB medtest. */
const fs = require('fs');
const path = require('path');
const sql = require('mssql');

const ROOT = path.resolve(__dirname, '..');
const fixtures = JSON.parse(fs.readFileSync(
  path.join(ROOT, 'config', 'uat', 'account-fixtures.v1.json'), 'utf8',
)).accounts;

const TARGET_DATES = {
  'Thứ 2': '2026-08-03',
  'Thứ 3': '2026-08-04',
  'Thứ 4': '2026-08-05',
  'Thứ 5': '2026-08-06',
  'Thứ 6': '2026-08-07',
  'Thứ 7': '2026-08-08',
  'Chủ nhật': '2026-08-09',
};

function readEnv() {
  const values = {};
  for (const line of fs.readFileSync(path.join(ROOT, '.env'), 'utf8').split(/\r?\n/)) {
    const match = line.match(/^\s*([^#=]+)=(.*)$/);
    if (match) values[match[1].trim()] = match[2].trim();
  }
  return values;
}

function parseViDate(value) {
  const match = String(value || '').match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  return match ? new Date(`${match[3]}-${match[2]}-${match[1]}T00:00:00Z`) : null;
}

function dayDiff(from, to) {
  return Math.round((to.getTime() - from.getTime()) / 86400000);
}

function expectedScore(row, workDate) {
  const lastPurchase = parseViDate(row.LanMuaCuoi);
  const predicted = parseViDate(row.NgayDuDoan);
  const remaining = predicted ? dayDiff(workDate, predicted) : 30;
  const base = remaining <= 0 ? 100 : (remaining <= 5 ? 80 : (remaining <= 14 ? 50 : 0));
  const days = row.SoNgayKhongMua === null || row.SoNgayKhongMua === undefined ? 999 : Number(row.SoNgayKhongMua);
  const absent = days >= 45 ? 40 : (days >= 30 ? 20 : 0);
  const schedule = 30;
  return { score: base + absent + schedule, remaining, lastPurchase };
}

async function executeRoute(pool, username, topN, targetDate, customerId = '') {
  const response = await pool.request()
    .input('Username', sql.VarChar(50), username)
    .input('MaKhachHang', sql.NVarChar(100), customerId)
    .input('SoNgayVangMat', sql.Int, 45)
    .input('NgayBaoDong', sql.Int, 5)
    .input('TopN', sql.Int, topN)
    .input('NgayTarget', sql.VarChar(20), targetDate)
    .execute('dbo.API_TuyenBanHang_AI');
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
    requestTimeout: 60000,
    pool: { max: 2, min: 0, idleTimeoutMillis: 10000 },
  });

  try {
    const results = [];
    for (const [username, fixture] of Object.entries(fixtures)) {
      const result = { UserName: username, RoleName: fixture.role, RegionID: fixture.region };
      try {
        const scopeRows = (await pool.request()
          .input('Username', sql.VarChar(50), username)
          .query(`
SELECT S.ObjectID, O.ThuTrongTuan
FROM dbo.AR_GetObjectByUserFnc(@Username) S
JOIN dbo.CF_ObjectTbl O WITH (NOLOCK) ON O.ObjectID = S.ObjectID
WHERE ISNULL(O.isCustomer, 0) = 1 AND ISNULL(O.isDisable, 0) = 0;`)).recordset || [];
        const allowed = new Set(scopeRows.map((row) => String(row.ObjectID).trim().toUpperCase()));
        const dayCounts = {};
        for (const row of scopeRows) {
          const route = String(row.ThuTrongTuan || '');
          for (const day of Object.keys(TARGET_DATES)) if (route.includes(day)) dayCounts[day] = (dayCounts[day] || 0) + 1;
        }
        const selectedDay = Object.keys(dayCounts).sort((a, b) => dayCounts[b] - dayCounts[a] || a.localeCompare(b, 'vi'))[0];
        if (!selectedDay) {
          result.Status = 'FAIL_NO_ROUTE_DAY_IN_SCOPE';
          result.ScopedCustomers = allowed.size;
          results.push(result);
          continue;
        }

        const targetDate = TARGET_DATES[selectedDay];
        const rows5 = await executeRoute(pool, username, 5, targetDate);
        const rows8 = await executeRoute(pool, username, 8, targetDate);
        const workDate = new Date(`${targetDate}T00:00:00Z`);
        const leaks = rows8.filter((row) => !allowed.has(String(row.ObjectID || '').trim().toUpperCase()));
        const missingFields = rows8.filter((row) => !row.ObjectID || row.DiemUuTien === null || row.DiemUuTien === undefined || !row.LyDoGhe || !row.WorkDate || !row.RuleVersion);
        const scoreMismatches = [];
        const reasonMismatches = [];
        let longAbsent = 0;
        let alarmCases = 0;
        for (const row of rows8) {
          const expected = expectedScore(row, workDate);
          if (Number(row.DiemUuTien) !== expected.score) scoreMismatches.push({ ObjectID: row.ObjectID, actual: row.DiemUuTien, expected: expected.score });
          const days = row.SoNgayKhongMua === null || row.SoNgayKhongMua === undefined ? 999 : Number(row.SoNgayKhongMua);
          if (days >= 45) longAbsent++;
          let expectedReason = 'Theo lịch ghé';
          if (!expected.lastPurchase) expectedReason = 'Khách hàng mới chưa có đơn';
          else if (expected.remaining < 0) expectedReason = 'Chưa phát sinh đơn hàng';
          else if (expected.remaining <= 5) { expectedReason = 'Sắp hết hàng'; alarmCases++; }
          if (!String(row.LyDoGhe).includes(expectedReason)) reasonMismatches.push({ ObjectID: row.ObjectID, actual: row.LyDoGhe, expectedContains: expectedReason });
        }

        let alarmScenarioStatus = 'FAIL_NO_SUITABLE_CUSTOMER';
        let alarmScenario = null;
        const alarmCandidates = await pool.request()
          .input('Username', sql.VarChar(50), username)
          .query(`
SELECT TOP (20)
  O.ObjectID,
  LastPurchase = MAX(I.DocumentDate),
  PurchaseCount = COUNT(DISTINCT I.DocumentID),
  CycleDays = DATEDIFF(DAY, MIN(I.DocumentDate), MAX(I.DocumentDate)) / NULLIF(COUNT(DISTINCT I.DocumentID) - 1, 0)
FROM dbo.CF_ObjectTbl O WITH (NOLOCK)
JOIN dbo.AR_GetObjectByUserFnc(@Username) S ON S.ObjectID = O.ObjectID
JOIN dbo.AR_InvoiceTbl I WITH (NOLOCK) ON I.ObjectID = O.ObjectID AND I.StatusID IN (3, 6, 7, 8)
WHERE I.DocumentDate >= DATEADD(MONTH, -6, GETDATE()) AND I.DocumentDate <= GETDATE()
GROUP BY O.ObjectID
HAVING COUNT(DISTINCT I.DocumentID) >= 3
ORDER BY MAX(I.DocumentDate) DESC, COUNT(DISTINCT I.DocumentID) DESC;`);
        const alarmCandidate = (alarmCandidates.recordset || []).find((row) => Number(row.CycleDays) > 0);
        if (alarmCandidate) {
          const predicted = new Date(alarmCandidate.LastPurchase);
          predicted.setUTCDate(predicted.getUTCDate() + Number(alarmCandidate.CycleDays));
          const alarmDate = new Date(predicted);
          alarmDate.setUTCDate(alarmDate.getUTCDate() - 3);
          const alarmDateKey = alarmDate.toISOString().slice(0, 10);
          const alarmRows = await executeRoute(pool, username, 1, alarmDateKey, alarmCandidate.ObjectID);
          const alarmRow = alarmRows[0];
          const remaining = alarmRow ? Number(alarmRow.ConLai) : null;
          const reason = alarmRow ? String(alarmRow.LyDoGhe || '') : '';
          alarmScenarioStatus = alarmRow && remaining >= 0 && remaining <= 5 && reason.includes('Sắp hết hàng') ? 'PASS' : 'FAIL';
          alarmScenario = {
            CustomerID: alarmCandidate.ObjectID,
            TargetDate: alarmDateKey,
            ReturnedRemainingDays: remaining,
            Reason: reason,
            Status: alarmScenarioStatus,
          };
          if (alarmScenarioStatus === 'PASS') alarmCases++;
        }
        const top5Ids = rows5.map((row) => row.ObjectID);
        const top8Prefix = rows8.slice(0, rows5.length).map((row) => row.ObjectID);
        const prefixMatches = JSON.stringify(top5Ids) === JSON.stringify(top8Prefix);
        const errors = [];
        if (!rows5.length || !rows8.length) errors.push('NO_ROUTE_RESULT');
        if (rows5.length > 5 || rows8.length > 8) errors.push('TOPN_LIMIT_BROKEN');
        if (!prefixMatches) errors.push('TOP5_NOT_PREFIX_OF_TOP8');
        if (leaks.length) errors.push('CUSTOMER_SCOPE_LEAK');
        if (missingFields.length) errors.push('MISSING_REQUIRED_FIELDS');
        if (scoreMismatches.length) errors.push('RULE_SCORE_MISMATCH');
        if (reasonMismatches.length) errors.push('ALERT_REASON_MISMATCH');
        if (alarmScenarioStatus !== 'PASS') errors.push('ALARM_5_DAY_SCENARIO_FAILED');

        Object.assign(result, {
          SelectedWeekday: selectedDay,
          TargetDate: targetDate,
          ScopedCustomers: allowed.size,
          RouteCustomersOnSelectedDay: dayCounts[selectedDay],
          Top5Count: rows5.length,
          Top8Count: rows8.length,
          Top5PrefixMatchesTop8: prefixMatches ? 1 : 0,
          ScopeLeakCount: leaks.length,
          MissingFieldCount: missingFields.length,
          ScoreMismatchCount: scoreMismatches.length,
          ReasonMismatchCount: reasonMismatches.length,
          LongAbsent45DayCases: longAbsent,
          Alarm5DayCases: alarmCases,
          AlarmScenario: alarmScenario,
          ReturnedCustomers: rows8.map((row) => row.ObjectID),
          Errors: errors,
          Status: errors.length ? 'FAIL' : 'PASS',
        });
        if (scoreMismatches.length) result.ScoreMismatches = scoreMismatches;
        if (reasonMismatches.length) result.ReasonMismatches = reasonMismatches;
        if (leaks.length) result.Leaks = leaks.map((row) => row.ObjectID);
      } catch (error) {
        result.Status = 'ERROR_API_CALL';
        result.Error = error.message;
      }
      results.push(result);
    }

    const failures = results.filter((row) => row.Status !== 'PASS');
    const summary = {
      task: 'UAT-012',
      mode: 'READ_ONLY_RUNTIME_DATABASE_VERIFICATION',
      database: env.TEST_DB_DATABASE,
      ruleParameters: { TopN: [5, 8], SoNgayVangMat: 45, NgayBaoDong: 5 },
      status: failures.length ? 'FAIL' : 'PASS',
      accountsChecked: results.length,
      accountsPassed: results.length - failures.length,
      totalScopeLeaks: results.reduce((sum, row) => sum + Number(row.ScopeLeakCount || 0), 0),
      totalLongAbsent45DayCases: results.reduce((sum, row) => sum + Number(row.LongAbsent45DayCases || 0), 0),
      totalAlarm5DayCases: results.reduce((sum, row) => sum + Number(row.Alarm5DayCases || 0), 0),
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
  console.error(JSON.stringify({ task: 'UAT-012', status: 'ERROR', message: error.message }, null, 2));
  process.exitCode = 1;
});
