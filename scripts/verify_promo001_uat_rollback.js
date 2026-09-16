'use strict';

const fs = require('fs');
const path = require('path');
const sql = require('mssql');

const root = path.resolve(__dirname, '..');
const marker = 'PROMO001_UAT_ROLLBACK_ONLY';

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
  const result = await new sql.Request(target).input('Marker', sql.NVarChar(500), marker).query(`
    SELECT COUNT_BIG(*) AS FixtureCount FROM dbo.AI_PromotionProgramTbl WHERE SourceDocument=@Marker;
  `);
  return Number(result.recordset[0].FixtureCount);
}

async function main() {
  const env = { ...readEnv('.env'), ...readEnv('.env.uat.local'), ...process.env };
  const pool = await sql.connect({
    server: env.TEST_DB_SERVER,
    port: Number(env.TEST_DB_PORT || 1433),
    database: env.TEST_DB_DATABASE,
    user: env.TEST_DB_USER,
    password: env.TEST_DB_PASSWORD,
    options: { encrypt: false, trustServerCertificate: true },
    connectionTimeout: 15000,
    requestTimeout: 45000,
  });
  if ((await pool.request().query('SELECT DB_NAME() AS DatabaseName;')).recordset[0].DatabaseName !== 'medtest') {
    throw new Error('PROMO-001 rollback UAT chỉ chạy trên medtest.');
  }
  if (await fixtureCount(pool)) throw new Error('Fixture PROMO-001 cũ vẫn tồn tại.');

  const items = (await pool.request().query(`
    SELECT TOP (2) ItemID,ItemName FROM dbo.CF_ItemTbl WHERE COALESCE(isDisable,0)=0 ORDER BY ItemID;
  `)).recordset;
  if (items.length < 2) throw new Error('Không đủ sản phẩm hoạt động cho UAT.');

  const transaction = new sql.Transaction(pool);
  await transaction.begin(sql.ISOLATION_LEVEL.SERIALIZABLE);
  let evidence;
  try {
    const result = await new sql.Request(transaction)
      .input('Marker', sql.NVarChar(500), marker)
      .input('Item1', sql.VarChar(50), items[0].ItemID)
      .input('Item2', sql.VarChar(50), items[1].ItemID)
      .query(`
        DECLARE @Now DATETIME2(0)=SYSUTCDATETIME();
        DECLARE @Programs TABLE (CaseName VARCHAR(30), PromotionProgramID BIGINT);

        INSERT dbo.AI_PromotionProgramTbl
          (PromotionCode,ProgramVersion,PromotionName,ProgramType,EffectiveFrom,EffectiveTo,BranchScopeMode,UserGroupScopeMode,Status,SourceDocument,CreatedBy,ApprovedBy,ApprovedAt)
        OUTPUT inserted.PromotionCode,inserted.PromotionProgramID INTO @Programs
        VALUES
          ('PROMO001_MONTHLY',1,N'Chương trình tháng hợp lệ','MONTHLY',DATEADD(DAY,-1,@Now),DATEADD(DAY,10,@Now),'ALL','ALL','APPROVED',@Marker,'PROMO001_UAT','PROMO001_REVIEWER',@Now),
          ('PROMO001_EVENT',1,N'Chương trình sự vụ hợp lệ','EVENT',DATEADD(DAY,-1,@Now),DATEADD(DAY,2,@Now),'INCLUDE','INCLUDE','APPROVED',@Marker,'PROMO001_UAT','PROMO001_REVIEWER',@Now),
          ('PROMO001_DRAFT',1,N'Chương trình nháp','EVENT',DATEADD(DAY,-1,@Now),DATEADD(DAY,2,@Now),'ALL','ALL','DRAFT',@Marker,'PROMO001_UAT',NULL,NULL),
          ('PROMO001_EXPIRED',1,N'Chương trình hết hạn','MONTHLY',DATEADD(DAY,-10,@Now),DATEADD(DAY,-1,@Now),'ALL','ALL','APPROVED',@Marker,'PROMO001_UAT','PROMO001_REVIEWER',DATEADD(DAY,-10,@Now)),
          ('PROMO001_FUTURE',1,N'Chương trình chưa hiệu lực','EVENT',DATEADD(DAY,1,@Now),DATEADD(DAY,3,@Now),'ALL','ALL','APPROVED',@Marker,'PROMO001_UAT','PROMO001_REVIEWER',@Now),
          ('PROMO001_NOSCOPE',1,N'Chương trình thiếu scope','EVENT',DATEADD(DAY,-1,@Now),DATEADD(DAY,3,@Now),'INCLUDE','ALL','APPROVED',@Marker,'PROMO001_UAT','PROMO001_REVIEWER',@Now);

        DECLARE @Monthly BIGINT=(SELECT PromotionProgramID FROM @Programs WHERE CaseName='PROMO001_MONTHLY');
        DECLARE @Event BIGINT=(SELECT PromotionProgramID FROM @Programs WHERE CaseName='PROMO001_EVENT');

        INSERT dbo.AI_PromotionBranchScopeTbl(PromotionProgramID,BranchID) VALUES(@Event,'MB');
        INSERT dbo.AI_PromotionUserGroupScopeTbl(PromotionProgramID,UserGroupID) VALUES(@Event,'QL');

        INSERT dbo.AI_PromotionItemRuleTbl
          (PromotionProgramID,RuleOrder,ItemID,RuleType,MinimumQuantity,DiscountPercent,GiftItemID,GiftQuantity,BenefitDescription)
        SELECT PromotionProgramID,1,@Item1,'QUANTITY_DISCOUNT',10,5,NULL,NULL,N'Đủ 10 sản phẩm giảm 5%'
        FROM @Programs;

        INSERT dbo.AI_PromotionItemRuleTbl
          (PromotionProgramID,RuleOrder,ItemID,RuleType,MinimumQuantity,GiftItemID,GiftQuantity,BenefitDescription)
        VALUES(@Event,2,@Item2,'QUANTITY_GIFT',5,@Item1,1,N'Mua 5 tặng 1');

        SELECT PromotionCode,ProgramType,ItemID,RuleType,BranchScopeMode,UserGroupScopeMode
        FROM dbo.AI_ApprovedPromotionItemRuleVw
        WHERE SourceDocument=@Marker
        ORDER BY PromotionCode,RuleOrder;
      `);
    const published = result.recordset;
    const codes = [...new Set(published.map((row) => row.PromotionCode))].sort();
    const pass = published.length === 3
      && JSON.stringify(codes) === JSON.stringify(['PROMO001_EVENT', 'PROMO001_MONTHLY'])
      && published.some((row) => row.ProgramType === 'MONTHLY')
      && published.some((row) => row.ProgramType === 'EVENT' && row.BranchScopeMode === 'INCLUDE' && row.UserGroupScopeMode === 'INCLUDE');
    evidence = { items, published, publishedProgramCodes: codes, pass };
    if (!pass) throw new Error(`PROMO-001 publish rules failed: ${JSON.stringify(evidence)}`);
  } finally {
    await transaction.rollback();
  }

  const remainingFixtures = await fixtureCount(pool);
  await pool.close();
  const result = {
    task: 'PROMO-001-UAT-ROLLBACK',
    status: evidence.pass && remainingFixtures === 0 ? 'PASS' : 'FAIL',
    mutationPersisted: remainingFixtures !== 0,
    remainingFixtures,
    ...evidence,
  };
  console.log(JSON.stringify(result, null, 2));
  if (result.status !== 'PASS') process.exitCode = 1;
}

main().catch((error) => {
  console.error(JSON.stringify({ task: 'PROMO-001-UAT-ROLLBACK', status: 'ERROR', mutationPersisted: 'UNKNOWN', error: error.message }, null, 2));
  process.exitCode = 1;
});
