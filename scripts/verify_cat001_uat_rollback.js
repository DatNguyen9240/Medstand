'use strict';

const fs = require('fs');
const path = require('path');
const sql = require('mssql');

const root = path.resolve(__dirname, '..');
const marker = 'CAT001_UAT_ROLLBACK_ONLY';

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

async function countFixtures(target) {
  const result = await new sql.Request(target)
    .input('Marker', sql.NVarChar(500), marker)
    .query('SELECT COUNT_BIG(*) AS FixtureCount FROM dbo.AI_ProductKnowledgeVersionTbl WHERE SourceDocument=@Marker;');
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
    requestTimeout: 30000,
  });

  if ((await pool.request().query('SELECT DB_NAME() AS DatabaseName;')).recordset[0].DatabaseName !== 'medtest') {
    throw new Error('CAT-001 rollback UAT chỉ được chạy trên medtest.');
  }
  if (await countFixtures(pool)) throw new Error('Fixture CAT-001 cũ vẫn tồn tại; dừng trước khi test.');

  const candidate = (await pool.request().query(`
    SELECT TOP (1) ItemID, ItemName
    FROM dbo.CF_ItemTbl
    WHERE isDisable=0
    ORDER BY ItemID;
  `)).recordset[0];
  if (!candidate) throw new Error('Không tìm thấy sản phẩm hoạt động để chạy CAT-001 UAT.');

  const transaction = new sql.Transaction(pool);
  await transaction.begin(sql.ISOLATION_LEVEL.SERIALIZABLE);
  let evidence;
  try {
    const request = new sql.Request(transaction)
      .input('ItemID', sql.VarChar(50), candidate.ItemID)
      .input('Marker', sql.NVarChar(500), marker);
    const result = await request.query(`
      DECLARE @Now DATETIME2(0)=SYSUTCDATETIME();
      DECLARE @Rows TABLE (CaseName VARCHAR(30), ContentVersion INT);

      INSERT dbo.AI_ProductKnowledgeVersionTbl
      (ItemID,ContentVersion,MainUses,SourceDocument,Status,EffectiveFrom,EffectiveTo,CreatedBy,ApprovedBy,ApprovedAt)
      OUTPUT 'INSERTED', inserted.ContentVersion INTO @Rows(CaseName,ContentVersion)
      VALUES
      (@ItemID,1,N'DRAFT không được công bố',@Marker,'DRAFT',DATEADD(DAY,-1,@Now),NULL,'CAT001_UAT',NULL,NULL),
      (@ItemID,2,N'APPROVED đã hết hạn',@Marker,'APPROVED',DATEADD(DAY,-10,@Now),DATEADD(DAY,-1,@Now),'CAT001_UAT','CAT001_REVIEWER',DATEADD(DAY,-10,@Now)),
      (@ItemID,3,N'APPROVED phiên bản thấp',@Marker,'APPROVED',DATEADD(DAY,-2,@Now),DATEADD(DAY,2,@Now),'CAT001_UAT','CAT001_REVIEWER',DATEADD(DAY,-2,@Now)),
      (@ItemID,4,N'APPROVED phiên bản cao',@Marker,'APPROVED',DATEADD(DAY,-1,@Now),DATEADD(DAY,2,@Now),'CAT001_UAT','CAT001_REVIEWER',DATEADD(DAY,-1,@Now)),
      (@ItemID,5,N'APPROVED chưa hiệu lực',@Marker,'APPROVED',DATEADD(DAY,1,@Now),DATEADD(DAY,2,@Now),'CAT001_UAT','CAT001_REVIEWER',@Now),
      (@ItemID,6,N'WITHDRAWN không được công bố',@Marker,'WITHDRAWN',DATEADD(DAY,-1,@Now),NULL,'CAT001_UAT',NULL,NULL);

      SELECT COUNT_BIG(*) AS InsertedCount
      FROM dbo.AI_ProductKnowledgeVersionTbl
      WHERE SourceDocument=@Marker;

      SELECT ItemID,ItemName,ContentVersion,MainUses,SourceDocument
      FROM dbo.AI_ApprovedProductKnowledgeVw
      WHERE ItemID=@ItemID AND SourceDocument=@Marker;
    `);
    const insertedCount = Number(result.recordsets[0][0].InsertedCount);
    const published = result.recordsets[1];
    const pass = insertedCount === 6
      && published.length === 1
      && Number(published[0].ContentVersion) === 4
      && published[0].MainUses === 'APPROVED phiên bản cao';
    evidence = { candidate, insertedCount, published, pass };
    if (!pass) throw new Error(`CAT-001 publish rules failed: ${JSON.stringify(evidence)}`);
  } finally {
    await transaction.rollback();
  }

  const remainingFixtures = await countFixtures(pool);
  await pool.close();
  const result = {
    task: 'CAT-001-UAT-ROLLBACK',
    status: evidence.pass && remainingFixtures === 0 ? 'PASS' : 'FAIL',
    mutationPersisted: remainingFixtures !== 0,
    remainingFixtures,
    ...evidence,
  };
  console.log(JSON.stringify(result, null, 2));
  if (result.status !== 'PASS') process.exitCode = 1;
}

main().catch((error) => {
  console.error(JSON.stringify({
    task: 'CAT-001-UAT-ROLLBACK',
    status: 'ERROR',
    mutationPersisted: 'UNKNOWN',
    error: error.message,
  }, null, 2));
  process.exitCode = 1;
});
