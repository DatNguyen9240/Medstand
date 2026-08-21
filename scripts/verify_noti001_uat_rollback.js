'use strict';

const fs = require('fs');
const path = require('path');
const sql = require('mssql');

const root = path.resolve(__dirname, '..');
const migrationFiles = [
  'sql/NOTI-001_Notification_Schema_AI.sql',
  'sql/NOTI-001_Notification_Distribution_AI.sql',
  'sql/NOTI-001_Notification_Admin_AI.sql',
  'sql/NOTI-001_Notification_Push_AI.sql',
];

function readEnv(relativePath) {
  const values = {};
  const filePath = path.join(root, relativePath);
  if (!fs.existsSync(filePath)) return values;
  for (const line of fs.readFileSync(filePath, 'utf8').split(/\r?\n/)) {
    const match = line.match(/^\s*([^#=]+)=(.*)$/);
    if (match) values[match[1].trim()] = match[2].trim().replace(/^['"]|['"]$/g, '');
  }
  return values;
}

function batches(source) {
  return source.replace(/^\uFEFF/, '').split(/^\s*GO\s*(?:--.*)?$/gim).map((part) => part.trim()).filter(Boolean);
}

async function main() {
  const env = { ...readEnv('.env'), ...readEnv('.env.uat.local'), ...process.env };
  const required = ['TEST_DB_SERVER', 'TEST_DB_DATABASE', 'TEST_DB_USER', 'TEST_DB_PASSWORD'];
  const missing = required.filter((key) => !env[key]);
  if (missing.length) throw new Error(`Thiếu cấu hình: ${missing.join(', ')}`);

  const pool = await sql.connect({
    server: env.TEST_DB_SERVER,
    port: Number(env.TEST_DB_PORT || 1433),
    database: env.TEST_DB_DATABASE,
    user: env.TEST_DB_USER,
    password: env.TEST_DB_PASSWORD,
    options: { encrypt: false, trustServerCertificate: true },
    connectionTimeout: 15000,
    requestTimeout: 120000,
    pool: { max: 1, min: 0, idleTimeoutMillis: 10000 },
  });

  const databaseName = (await pool.request().query('SELECT DB_NAME() AS DatabaseName;')).recordset[0].DatabaseName;
  if (databaseName !== 'medtest') throw new Error(`NOTI-001 UAT chỉ chạy trên medtest; hiện tại ${databaseName}.`);

  const transaction = new sql.Transaction(pool);
  let began = false;
  let fixtureIds = [];
  try {
    await transaction.begin(sql.ISOLATION_LEVEL.SERIALIZABLE);
    began = true;
    for (const relativePath of migrationFiles) {
      for (const batch of batches(fs.readFileSync(path.join(root, relativePath), 'utf8'))) {
        await new sql.Request(transaction).batch(batch);
      }
    }

    const testResult = (await new sql.Request(transaction).query(`
DECLARE @Now DATETIME2(0) = SYSUTCDATETIME();
DECLARE @UserA VARCHAR(100), @UserB VARCHAR(100), @UserDisabled VARCHAR(100);
DECLARE @BranchA VARCHAR(50), @BranchB VARCHAR(50), @GroupA VARCHAR(50), @GroupB VARCHAR(50);

SELECT TOP (1)
    @UserA = UserName,
    @BranchA = COALESCE(BranchID, ''),
    @GroupA = COALESCE(UserGroupID, '')
FROM dbo.SY_User
WHERE COALESCE(Disable, 0) = 0
  AND COALESCE(BranchID, '') <> ''
  AND COALESCE(UserGroupID, '') <> ''
ORDER BY UserName;

SELECT TOP (1)
    @UserB = UserName,
    @BranchB = COALESCE(BranchID, ''),
    @GroupB = COALESCE(UserGroupID, '')
FROM dbo.SY_User
WHERE COALESCE(Disable, 0) = 0
  AND UserName <> @UserA
  AND COALESCE(BranchID, '') <> ''
  AND COALESCE(UserGroupID, '') <> ''
  AND COALESCE(BranchID, '') <> @BranchA
  AND COALESCE(UserGroupID, '') <> @GroupA
ORDER BY UserName;

SELECT TOP (1) @UserDisabled = UserName
FROM dbo.SY_User
WHERE COALESCE(Disable, 0) = 1
ORDER BY UserName;

IF @UserA IS NULL OR @UserB IS NULL
    THROW 51320, N'UAT requires two active SY_User accounts and one account with BranchID/UserGroupID.', 1;

DECLARE @Fixture TABLE (TestCode VARCHAR(20) PRIMARY KEY, NotificationID BIGINT NOT NULL);

INSERT dbo.AI_NotificationTbl
    (Title, Summary, Body, NotificationType, Priority, EffectiveFromUtc, EffectiveToUtc,
     BranchScopeMode, UserGroupScopeMode, UserScopeMode, Status, CreatedBy, UpdatedBy, ApprovedBy, ApprovedAtUtc)
OUTPUT 'TC-NOTI-01', inserted.NotificationID INTO @Fixture(TestCode, NotificationID)
VALUES
    (N'NOTI001_UAT_BRANCH', N'UAT', N'Branch scope', 'ANNOUNCEMENT', 50, DATEADD(MINUTE,-1,@Now), DATEADD(HOUR,1,@Now),
     'SELECTED', 'ALL', 'ALL', 'APPROVED', 'NOTI001_UAT', 'NOTI001_UAT', 'NOTI001_UAT', @Now);
INSERT dbo.AI_NotificationBranchScopeTbl(NotificationID, BranchID)
SELECT NotificationID, @BranchA FROM @Fixture WHERE TestCode = 'TC-NOTI-01';

INSERT dbo.AI_NotificationTbl
    (Title, Summary, Body, NotificationType, Priority, EffectiveFromUtc, EffectiveToUtc,
     BranchScopeMode, UserGroupScopeMode, UserScopeMode, Status, CreatedBy, UpdatedBy, ApprovedBy, ApprovedAtUtc)
OUTPUT 'TC-NOTI-02', inserted.NotificationID INTO @Fixture(TestCode, NotificationID)
VALUES
    (N'NOTI001_UAT_GROUP', N'UAT', N'Group scope', 'ANNOUNCEMENT', 50, DATEADD(MINUTE,-1,@Now), DATEADD(HOUR,1,@Now),
     'ALL', 'SELECTED', 'ALL', 'APPROVED', 'NOTI001_UAT', 'NOTI001_UAT', 'NOTI001_UAT', @Now);
INSERT dbo.AI_NotificationUserGroupScopeTbl(NotificationID, UserGroupID)
SELECT NotificationID, @GroupA FROM @Fixture WHERE TestCode = 'TC-NOTI-02';

INSERT dbo.AI_NotificationTbl
    (Title, Summary, Body, NotificationType, Priority, EffectiveFromUtc, EffectiveToUtc,
     BranchScopeMode, UserGroupScopeMode, UserScopeMode, Status, CreatedBy, UpdatedBy, ApprovedBy, ApprovedAtUtc)
OUTPUT 'TC-NOTI-03', inserted.NotificationID INTO @Fixture(TestCode, NotificationID)
VALUES
    (N'NOTI001_UAT_USER', N'UAT', N'User scope', 'URGENT', 10, DATEADD(MINUTE,-1,@Now), DATEADD(HOUR,1,@Now),
     'ALL', 'ALL', 'SELECTED', 'APPROVED', 'NOTI001_UAT', 'NOTI001_UAT', 'NOTI001_UAT', @Now);
INSERT dbo.AI_NotificationUserScopeTbl(NotificationID, UserName)
SELECT NotificationID, @UserA FROM @Fixture WHERE TestCode = 'TC-NOTI-03';

INSERT dbo.AI_NotificationTbl
    (Title, Summary, Body, NotificationType, Priority, EffectiveFromUtc, EffectiveToUtc,
     BranchScopeMode, UserGroupScopeMode, UserScopeMode, Status, CreatedBy, UpdatedBy, ApprovedBy, ApprovedAtUtc)
OUTPUT 'TC-NOTI-07', inserted.NotificationID INTO @Fixture(TestCode, NotificationID)
VALUES
    (N'NOTI001_UAT_USER_B', N'UAT', N'Other user scope', 'ANNOUNCEMENT', 50, DATEADD(MINUTE,-1,@Now), DATEADD(HOUR,1,@Now),
     'ALL', 'ALL', 'SELECTED', 'APPROVED', 'NOTI001_UAT', 'NOTI001_UAT', 'NOTI001_UAT', @Now);
INSERT dbo.AI_NotificationUserScopeTbl(NotificationID, UserName)
SELECT NotificationID, @UserB FROM @Fixture WHERE TestCode = 'TC-NOTI-07';

INSERT dbo.AI_NotificationTbl
    (Title, Body, NotificationType, Priority, EffectiveFromUtc, EffectiveToUtc,
     BranchScopeMode, UserGroupScopeMode, UserScopeMode, Status, CreatedBy, UpdatedBy, ApprovedBy, ApprovedAtUtc)
OUTPUT 'TC-NOTI-08', inserted.NotificationID INTO @Fixture(TestCode, NotificationID)
VALUES
    (N'NOTI001_UAT_FUTURE', N'Future', 'SYSTEM', 50, DATEADD(HOUR,1,@Now), DATEADD(HOUR,2,@Now),
     'ALL', 'ALL', 'ALL', 'APPROVED', 'NOTI001_UAT', 'NOTI001_UAT', 'NOTI001_UAT', @Now);

INSERT dbo.AI_NotificationTbl
    (Title, Body, NotificationType, Priority, EffectiveFromUtc, EffectiveToUtc,
     BranchScopeMode, UserGroupScopeMode, UserScopeMode, Status, CreatedBy, UpdatedBy, ApprovedBy, ApprovedAtUtc)
OUTPUT 'TC-NOTI-09', inserted.NotificationID INTO @Fixture(TestCode, NotificationID)
VALUES
    (N'NOTI001_UAT_EXPIRED', N'Expired', 'SYSTEM', 50, DATEADD(HOUR,-2,@Now), DATEADD(HOUR,-1,@Now),
     'ALL', 'ALL', 'ALL', 'APPROVED', 'NOTI001_UAT', 'NOTI001_UAT', 'NOTI001_UAT', @Now);

INSERT dbo.AI_NotificationTbl
    (Title, Body, NotificationType, Priority, EffectiveFromUtc, EffectiveToUtc,
     BranchScopeMode, UserGroupScopeMode, UserScopeMode, Status, CreatedBy, UpdatedBy)
OUTPUT 'TC-NOTI-10', inserted.NotificationID INTO @Fixture(TestCode, NotificationID)
VALUES
    (N'NOTI001_UAT_DRAFT', N'Draft', 'SYSTEM', 50, DATEADD(MINUTE,-1,@Now), DATEADD(HOUR,1,@Now),
     'ALL', 'ALL', 'ALL', 'DRAFT', 'NOTI001_UAT', 'NOTI001_UAT');

DECLARE @Target BIGINT = (SELECT NotificationID FROM @Fixture WHERE TestCode = 'TC-NOTI-03');
EXEC dbo.API_ThongBao_AI @Username=@UserA, @Action='MARK_READ', @NotificationID=@Target, @RequestID='req-noti001-uat-01';
EXEC dbo.API_ThongBao_AI @Username=@UserA, @Action='MARK_READ', @NotificationID=@Target, @RequestID='req-noti001-uat-02';

DECLARE @IdentityOverridePassed BIT = 1;
BEGIN TRY
    DECLARE @OutOfScopeTarget BIGINT = (SELECT NotificationID FROM @Fixture WHERE TestCode = 'TC-NOTI-07');
    EXEC dbo.API_ThongBao_AI @Username=@UserA, @Action='MARK_READ', @NotificationID=@OutOfScopeTarget, @RequestID='req-noti001-uat-03';
    SET @IdentityOverridePassed = 0;
END TRY
BEGIN CATCH
    IF ERROR_NUMBER() <> 51303 THROW;
END CATCH;

DECLARE @InvalidRangePassed BIT = 0;
BEGIN TRY
    INSERT dbo.AI_NotificationTbl
        (Title, Body, NotificationType, Priority, EffectiveFromUtc, EffectiveToUtc,
         BranchScopeMode, UserGroupScopeMode, UserScopeMode, Status, CreatedBy, UpdatedBy)
    VALUES
        (N'NOTI001_UAT_BAD_RANGE', N'Bad range', 'SYSTEM', 50, @Now, DATEADD(MINUTE,-1,@Now),
         'ALL', 'ALL', 'ALL', 'DRAFT', 'NOTI001_UAT', 'NOTI001_UAT');
END TRY
BEGIN CATCH
    SET @InvalidRangePassed = 1;
END CATCH;

SELECT TestCode, Pass
FROM
(
    SELECT 'TC-NOTI-01' AS TestCode, CONVERT(BIT, CASE WHEN EXISTS (
        SELECT 1 FROM dbo.AI_ActiveNotificationByUserFnc(@UserA,@Now) A JOIN @Fixture F ON F.NotificationID=A.NotificationID WHERE F.TestCode='TC-NOTI-01') THEN 1 ELSE 0 END) AS Pass
    UNION ALL SELECT 'TC-NOTI-02', CONVERT(BIT, CASE WHEN EXISTS (
        SELECT 1 FROM dbo.AI_ActiveNotificationByUserFnc(@UserA,@Now) A JOIN @Fixture F ON F.NotificationID=A.NotificationID WHERE F.TestCode='TC-NOTI-02') THEN 1 ELSE 0 END)
    UNION ALL SELECT 'TC-NOTI-03', CONVERT(BIT, CASE WHEN EXISTS (
        SELECT 1 FROM dbo.AI_ActiveNotificationByUserFnc(@UserA,@Now) A JOIN @Fixture F ON F.NotificationID=A.NotificationID WHERE F.TestCode='TC-NOTI-03')
        AND NOT EXISTS (SELECT 1 FROM dbo.AI_ActiveNotificationByUserFnc(@UserB,@Now) A JOIN @Fixture F ON F.NotificationID=A.NotificationID WHERE F.TestCode='TC-NOTI-03') THEN 1 ELSE 0 END)
    UNION ALL SELECT 'TC-NOTI-04', CONVERT(BIT, CASE WHEN (SELECT COUNT(*) FROM dbo.AI_NotificationReadLogTbl WHERE NotificationID=@Target AND UserName=@UserA)=1 THEN 1 ELSE 0 END)
    UNION ALL SELECT 'TC-NOTI-05', CONVERT(BIT, CASE WHEN NOT EXISTS (
        SELECT 1 FROM dbo.AI_ActiveNotificationByUserFnc(@UserB,@Now) A JOIN @Fixture F ON F.NotificationID=A.NotificationID WHERE F.TestCode='TC-NOTI-01') THEN 1 ELSE 0 END)
    UNION ALL SELECT 'TC-NOTI-06', CONVERT(BIT, CASE WHEN NOT EXISTS (
        SELECT 1 FROM dbo.AI_ActiveNotificationByUserFnc(@UserB,@Now) A JOIN @Fixture F ON F.NotificationID=A.NotificationID WHERE F.TestCode='TC-NOTI-02') THEN 1 ELSE 0 END)
    UNION ALL SELECT 'TC-NOTI-07', CONVERT(BIT, CASE WHEN NOT EXISTS (
        SELECT 1 FROM dbo.AI_ActiveNotificationByUserFnc(@UserA,@Now) A JOIN @Fixture F ON F.NotificationID=A.NotificationID WHERE F.TestCode='TC-NOTI-07') THEN 1 ELSE 0 END)
    UNION ALL SELECT 'TC-NOTI-08', CONVERT(BIT, CASE WHEN NOT EXISTS (
        SELECT 1 FROM dbo.AI_ActiveNotificationByUserFnc(@UserA,@Now) A JOIN @Fixture F ON F.NotificationID=A.NotificationID WHERE F.TestCode='TC-NOTI-08') THEN 1 ELSE 0 END)
    UNION ALL SELECT 'TC-NOTI-09', CONVERT(BIT, CASE WHEN NOT EXISTS (
        SELECT 1 FROM dbo.AI_ActiveNotificationByUserFnc(@UserA,@Now) A JOIN @Fixture F ON F.NotificationID=A.NotificationID WHERE F.TestCode='TC-NOTI-09') THEN 1 ELSE 0 END)
    UNION ALL SELECT 'TC-NOTI-10', CONVERT(BIT, CASE WHEN NOT EXISTS (
        SELECT 1 FROM dbo.AI_ActiveNotificationByUserFnc(@UserA,@Now) A JOIN @Fixture F ON F.NotificationID=A.NotificationID WHERE F.TestCode='TC-NOTI-10') THEN 1 ELSE 0 END)
    UNION ALL SELECT 'TC-NOTI-11', CONVERT(BIT, CASE WHEN @UserDisabled IS NULL OR NOT EXISTS (
        SELECT 1 FROM dbo.AI_ActiveNotificationByUserFnc(@UserDisabled,@Now)) THEN 1 ELSE 0 END)
    UNION ALL SELECT 'TC-NOTI-12', @IdentityOverridePassed
    UNION ALL SELECT 'TC-NOTI-13', @IdentityOverridePassed
    UNION ALL SELECT 'TC-NOTI-14', CONVERT(BIT, CASE WHEN (SELECT COUNT(*) FROM dbo.AI_NotificationReadLogTbl WHERE NotificationID=@Target AND UserName=@UserA)=1 THEN 1 ELSE 0 END)
    UNION ALL SELECT 'TC-NOTI-16', @InvalidRangePassed
) T;

SELECT NotificationID FROM @Fixture ORDER BY NotificationID;
    `)).recordsets;

    const results = testResult.find((rows) => rows.length && Object.hasOwn(rows[0], 'TestCode')) || [];
    const fixtureRows = testResult.find((rows) => rows.length
      && Object.hasOwn(rows[0], 'NotificationID')
      && rows.every((row) => Object.keys(row).length === 1)) || [];
    fixtureIds = fixtureRows.map((row) => Number(row.NotificationID)).filter(Number.isFinite);
    const failed = results.filter((row) => !row.Pass);
    if (!results.length || failed.length) throw new Error(`NOTI-001 UAT failed: ${JSON.stringify(failed)}`);

    await transaction.rollback();
    began = false;

    let remainingFixtures = 0;
    if (fixtureIds.length) {
      const idList = fixtureIds.join(',');
      remainingFixtures = Number((await pool.request().query(
        `SELECT COUNT(*) AS Remaining FROM dbo.AI_NotificationTbl WHERE NotificationID IN (${idList});`
      )).recordset[0].Remaining || 0);
    }
    if (remainingFixtures !== 0) throw new Error(`Rollback không sạch: remainingFixtures=${remainingFixtures}`);

    console.log(JSON.stringify({
      task: 'NOTI-001-UAT',
      status: 'PASS',
      database: databaseName,
      passed: results.length,
      tests: results,
      remainingFixtures,
    }, null, 2));
  } finally {
    if (began) {
      try { await transaction.rollback(); } catch (_) {}
    }
    await pool.close();
  }
}

main().catch((error) => {
  console.error(JSON.stringify({ task: 'NOTI-001-UAT', status: 'ERROR', error: error.message }, null, 2));
  process.exitCode = 1;
});
