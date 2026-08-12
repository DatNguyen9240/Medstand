'use strict';

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const sql = require('mssql');

const root = path.resolve(__dirname, '..');
const marker = 'CAT002_UAT_ROLLBACK_ONLY';

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
    .query('SELECT COUNT_BIG(*) AS FixtureCount FROM dbo.AI_ProductImageMapTbl WHERE SourceDocument=@Marker;');
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
    throw new Error('CAT-002 rollback UAT chỉ được chạy trên medtest.');
  }
  if (await countFixtures(pool)) throw new Error('Fixture CAT-002 cũ vẫn tồn tại.');

  const candidate = (await pool.request().query('SELECT TOP (1) ItemID,ItemName FROM dbo.CF_ItemTbl WHERE isDisable=0 ORDER BY ItemID;')).recordset[0];
  const defaultPath = path.join(root, 'images', 'product-catalog', 'default-product.svg');
  const fileSize = fs.statSync(defaultPath).size;
  const hash = crypto.createHash('sha256').update(fs.readFileSync(defaultPath)).digest('hex');
  const transaction = new sql.Transaction(pool);
  await transaction.begin(sql.ISOLATION_LEVEL.SERIALIZABLE);
  let evidence;
  try {
    const result = await new sql.Request(transaction)
      .input('ItemID', sql.VarChar(50), candidate.ItemID)
      .input('Marker', sql.NVarChar(500), marker)
      .input('FileSize', sql.BigInt, fileSize)
      .input('Hash', sql.Char(64), hash)
      .query(`
        DECLARE @Now DATETIME2(0)=SYSUTCDATETIME();
        INSERT dbo.AI_ProductImageMapTbl
        (ItemID,ImageRole,DisplayOrder,ImagePath,MediaType,FileSizeBytes,ContentSha256,AltText,SourceDocument,Status,EffectiveFrom,EffectiveTo,CreatedBy,ApprovedBy,ApprovedAt)
        VALUES
        (@ItemID,'PRIMARY',1,N'images/product-catalog/uat-draft.png','image/png',@FileSize,@Hash,N'Ảnh nháp',@Marker,'DRAFT',DATEADD(DAY,-1,@Now),NULL,'CAT002_UAT',NULL,NULL),
        (@ItemID,'PRIMARY',2,N'images/product-catalog/uat-expired.png','image/png',@FileSize,@Hash,N'Ảnh hết hạn',@Marker,'APPROVED',DATEADD(DAY,-2,@Now),DATEADD(DAY,-1,@Now),'CAT002_UAT','CAT002_REVIEWER',DATEADD(DAY,-2,@Now)),
        (@ItemID,'PRIMARY',3,N'images/product-catalog/uat-approved.png','image/png',@FileSize,@Hash,N'Ảnh chính UAT',@Marker,'APPROVED',DATEADD(DAY,-1,@Now),DATEADD(DAY,1,@Now),'CAT002_UAT','CAT002_REVIEWER',DATEADD(DAY,-1,@Now)),
        (@ItemID,'GALLERY',1,N'images/product-catalog/uat-withdrawn.png','image/png',@FileSize,@Hash,N'Ảnh thu hồi',@Marker,'WITHDRAWN',DATEADD(DAY,-1,@Now),NULL,'CAT002_UAT',NULL,NULL);

        SELECT COUNT_BIG(*) AS InsertedCount FROM dbo.AI_ProductImageMapTbl WHERE SourceDocument=@Marker;
        SELECT ItemID,ImageRole,ImagePath,AltText FROM dbo.AI_ApprovedProductImageVw WHERE ItemID=@ItemID AND SourceDocument=@Marker;
      `);
    const insertedCount = Number(result.recordsets[0][0].InsertedCount);
    const published = result.recordsets[1];
    const pass = insertedCount === 4 && published.length === 1 && published[0].ImagePath.endsWith('/uat-approved.png');
    evidence = { candidate, insertedCount, published, pass };
    if (!pass) throw new Error(`CAT-002 publish rules failed: ${JSON.stringify(evidence)}`);
  } finally {
    await transaction.rollback();
  }
  const remainingFixtures = await countFixtures(pool);
  const fallback = await pool.request()
    .input('Username', sql.VarChar(50), 'QLBH013.MED')
    .input('ItemID', sql.VarChar(50), candidate.ItemID)
    .execute('dbo.API_AnhSanPham_AI');
  await pool.close();
  const result = {
    task: 'CAT-002-UAT-ROLLBACK',
    status: evidence.pass && remainingFixtures === 0 && fallback.recordset[0]?.IsDefaultImage === true ? 'PASS' : 'FAIL',
    mutationPersisted: remainingFixtures !== 0,
    remainingFixtures,
    fallback: fallback.recordset[0],
    ...evidence,
  };
  console.log(JSON.stringify(result, null, 2));
  if (result.status !== 'PASS') process.exitCode = 1;
}

main().catch((error) => {
  console.error(JSON.stringify({ task: 'CAT-002-UAT-ROLLBACK', status: 'ERROR', error: error.message }, null, 2));
  process.exitCode = 1;
});
