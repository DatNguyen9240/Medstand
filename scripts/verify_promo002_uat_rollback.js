'use strict';

const fs = require('fs');
const path = require('path');
const sql = require('mssql');

const root = path.resolve(__dirname, '..');
const marker = 'PROMO002_UAT_ROLLBACK_ONLY';

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

async function fixtureCount(target) {
  const result = await new sql.Request(target).input('Marker', sql.NVarChar(500), marker)
    .query('SELECT COUNT_BIG(*) AS FixtureCount FROM dbo.AI_PromotionProgramTbl WHERE SourceDocument=@Marker;');
  return Number(result.recordset[0].FixtureCount);
}

async function main() {
  const env = { ...readEnv('.env'), ...readEnv('.env.uat.local'), ...process.env };
  const pool = await sql.connect({
    server: env.TEST_DB_SERVER, port: Number(env.TEST_DB_PORT || 1433), database: env.TEST_DB_DATABASE,
    user: env.TEST_DB_USER, password: env.TEST_DB_PASSWORD,
    options: { encrypt: false, trustServerCertificate: true }, connectionTimeout: 15000, requestTimeout: 45000,
  });
  if ((await pool.request().query('SELECT DB_NAME() AS DatabaseName;')).recordset[0].DatabaseName !== 'medtest') {
    throw new Error('PROMO-002 rollback UAT chỉ chạy trên medtest.');
  }
  if (await fixtureCount(pool)) throw new Error('Fixture PROMO-002 cũ vẫn tồn tại.');

  const users = (await pool.request().query(`
    SELECT TOP (1) UserName,BranchID,UserGroupID FROM dbo.SY_User
    WHERE COALESCE(Disable,0)=0 AND COALESCE(BranchID,'')<>'' AND COALESCE(UserGroupID,'')<>'' ORDER BY UserName;
  `)).recordset[0];
  const outside = (await pool.request().input('BranchID', sql.VarChar(50), users.BranchID).input('UserGroupID', sql.VarChar(50), users.UserGroupID).query(`
    SELECT TOP (1) UserName,BranchID,UserGroupID FROM dbo.SY_User
    WHERE COALESCE(Disable,0)=0 AND COALESCE(BranchID,'')<>@BranchID AND COALESCE(UserGroupID,'')<>@UserGroupID ORDER BY UserName;
  `)).recordset[0];
  const item = (await pool.request().query(`SELECT TOP (1) ItemID,ItemName FROM dbo.CF_ItemTbl WHERE COALESCE(isDisable,0)=0 ORDER BY ItemID;`)).recordset[0];
  if (!users || !outside || !item) throw new Error('Không đủ user/item cho UAT scope.');

  const transaction = new sql.Transaction(pool);
  await transaction.begin(sql.ISOLATION_LEVEL.SERIALIZABLE);
  let evidence;
  try {
    const result = await new sql.Request(transaction)
      .input('Marker', sql.NVarChar(500), marker)
      .input('ItemID', sql.VarChar(50), item.ItemID)
      .input('BranchID', sql.VarChar(50), users.BranchID)
      .input('UserGroupID', sql.VarChar(50), users.UserGroupID)
      .input('AllowedUser', sql.VarChar(50), users.UserName)
      .input('OutsideUser', sql.VarChar(50), outside.UserName)
      .query(`
        DECLARE @Now DATETIME2(0)=SYSUTCDATETIME();
        INSERT dbo.AI_PromotionProgramTbl
          (PromotionCode,ProgramVersion,PromotionName,ProgramType,EffectiveFrom,EffectiveTo,BranchScopeMode,UserGroupScopeMode,Status,SourceDocument,CreatedBy,ApprovedBy,ApprovedAt)
        VALUES
          ('PROMO002_ACTIVE',1,N'CTBH đúng phạm vi','EVENT',DATEADD(DAY,-1,@Now),DATEADD(DAY,2,@Now),'INCLUDE','INCLUDE','APPROVED',@Marker,'PROMO002_UAT','PROMO002_REVIEWER',@Now),
          ('PROMO002_EXPIRED',1,N'CTBH hết hạn','EVENT',DATEADD(DAY,-3,@Now),DATEADD(DAY,-1,@Now),'ALL','ALL','APPROVED',@Marker,'PROMO002_UAT','PROMO002_REVIEWER',DATEADD(DAY,-3,@Now));

        DECLARE @ActiveID BIGINT=(SELECT PromotionProgramID FROM dbo.AI_PromotionProgramTbl WHERE PromotionCode='PROMO002_ACTIVE' AND SourceDocument=@Marker);
        DECLARE @ExpiredID BIGINT=(SELECT PromotionProgramID FROM dbo.AI_PromotionProgramTbl WHERE PromotionCode='PROMO002_EXPIRED' AND SourceDocument=@Marker);
        INSERT dbo.AI_PromotionBranchScopeTbl VALUES(@ActiveID,@BranchID,@Now);
        INSERT dbo.AI_PromotionUserGroupScopeTbl VALUES(@ActiveID,@UserGroupID,@Now);
        INSERT dbo.AI_PromotionItemRuleTbl(PromotionProgramID,RuleOrder,ItemID,RuleType,MinimumQuantity,DiscountPercent,BenefitDescription)
        VALUES(@ActiveID,1,@ItemID,'QUANTITY_DISCOUNT',10,5,N'Mua 10 giảm 5%'),(@ExpiredID,1,@ItemID,'QUANTITY_DISCOUNT',5,3,N'Đã hết hạn');

        SELECT * FROM dbo.AI_ActivePromotionByUserFnc(@AllowedUser,@ItemID,@Now);
        SELECT * FROM dbo.AI_ActivePromotionByUserFnc(@OutsideUser,@ItemID,@Now);
        SELECT * FROM dbo.AI_ActivePromotionByUserFnc(@AllowedUser,@ItemID,DATEADD(DAY,3,@Now));
      `);
    const allowed = result.recordsets[0];
    const denied = result.recordsets[1];
    const afterExpiry = result.recordsets[2];
    const pass = allowed.length === 1 && allowed[0].PromotionCode === 'PROMO002_ACTIVE'
      && allowed[0].PromotionStatus === 'APPROVED_ACTIVE_IN_SCOPE'
      && denied.length === 0 && afterExpiry.length === 0;
    evidence = { allowedUser: users, outsideUser: outside, item, allowed, deniedCount: denied.length, afterExpiryCount: afterExpiry.length, pass };
    if (!pass) throw new Error(`PROMO-002 scope failed: ${JSON.stringify(evidence)}`);
  } finally {
    await transaction.rollback();
  }

  const remainingFixtures = await fixtureCount(pool);
  await pool.close();
  const result = { task: 'PROMO-002-UAT-ROLLBACK', status: evidence.pass && remainingFixtures === 0 ? 'PASS' : 'FAIL', mutationPersisted: remainingFixtures !== 0, remainingFixtures, ...evidence };
  console.log(JSON.stringify(result, null, 2));
  if (result.status !== 'PASS') process.exitCode = 1;
}

main().catch((error) => {
  console.error(JSON.stringify({ task: 'PROMO-002-UAT-ROLLBACK', status: 'ERROR', mutationPersisted: 'UNKNOWN', error: error.message }, null, 2));
  process.exitCode = 1;
});
