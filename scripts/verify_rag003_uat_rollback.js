'use strict';

const fs = require('fs');
const path = require('path');
const sql = require('mssql');

const root = path.resolve(__dirname, '..');
const marker = 'RAG003_UAT_ROLLBACK_ONLY';

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
    SELECT COUNT_BIG(*) AS FixtureCount FROM dbo.AI_RagDocumentTbl WHERE SourceReference=@Marker;
  `);
  return Number(result.recordset[0].FixtureCount);
}

async function main() {
  const env = { ...readEnv('.env'), ...readEnv('.env.uat.local'), ...process.env };
  const pool = await sql.connect({
    server: env.TEST_DB_SERVER, port: Number(env.TEST_DB_PORT || 1433), database: env.TEST_DB_DATABASE,
    user: env.TEST_DB_USER, password: env.TEST_DB_PASSWORD,
    options: { encrypt: false, trustServerCertificate: true }, connectionTimeout: 15000, requestTimeout: 45000,
  });
  if ((await pool.request().query('SELECT DB_NAME() AS DatabaseName;')).recordset[0].DatabaseName !== 'medtest') throw new Error('RAG-003 rollback UAT chỉ chạy trên medtest.');
  if (await fixtureCount(pool)) throw new Error('Fixture RAG-003 cũ vẫn tồn tại.');
  const hasContentTable = Number((await pool.request().query("SELECT CASE WHEN OBJECT_ID(N'dbo.AI_RagDocumentContentTbl',N'U') IS NULL THEN 0 ELSE 1 END AS HasContentTable;")).recordset[0].HasContentTable) === 1;

  const transaction = new sql.Transaction(pool);
  await transaction.begin(sql.ISOLATION_LEVEL.SERIALIZABLE);
  let evidence;
  try {
    const result = await new sql.Request(transaction).input('Marker', sql.NVarChar(500), marker).query(`
      DECLARE @Now DATETIME2(0)=SYSUTCDATETIME();
      DECLARE @Active UNIQUEIDENTIFIER=NEWID(),@Scheduled UNIQUEIDENTIFIER=NEWID(),@Expired UNIQUEIDENTIFIER=NEWID(),@Withdrawn UNIQUEIDENTIFIER=NEWID();
      INSERT dbo.AI_RagDocumentTbl
        (DocumentID,OriginalFileName,SafeFileName,FileExtension,DeclaredMimeType,DetectedMimeType,FileSizeBytes,Sha256Hex,Title,SourceType,SourceReference,SourceChannel,UploadedBy,MalwareScanStatus,MalwareScanner,MalwareScannedAt,ReviewStatus,ReviewedBy,ReviewedAt,EffectiveFrom,EffectiveTo,RevokedBy,RevokedAt,RevocationReason)
      VALUES
        (@Active,N'active.pdf',CONVERT(VARCHAR(36),@Active)+'.pdf','pdf','application/pdf','application/pdf',100,REPLICATE('A',64),N'Active','POLICY',@Marker,'RAG_ADMIN','RAG003_UAT','CLEAN','UAT',@Now,'APPROVED','UAT',@Now,DATEADD(DAY,-1,@Now),DATEADD(DAY,1,@Now),NULL,NULL,NULL),
        (@Scheduled,N'scheduled.pdf',CONVERT(VARCHAR(36),@Scheduled)+'.pdf','pdf','application/pdf','application/pdf',100,REPLICATE('B',64),N'Scheduled','POLICY',@Marker,'RAG_ADMIN','RAG003_UAT','CLEAN','UAT',@Now,'APPROVED','UAT',@Now,DATEADD(DAY,1,@Now),DATEADD(DAY,2,@Now),NULL,NULL,NULL),
        (@Expired,N'expired.pdf',CONVERT(VARCHAR(36),@Expired)+'.pdf','pdf','application/pdf','application/pdf',100,REPLICATE('C',64),N'Expired','POLICY',@Marker,'RAG_ADMIN','RAG003_UAT','CLEAN','UAT',@Now,'APPROVED','UAT',@Now,DATEADD(DAY,-2,@Now),DATEADD(DAY,-1,@Now),NULL,NULL,NULL),
        (@Withdrawn,N'withdrawn.pdf',CONVERT(VARCHAR(36),@Withdrawn)+'.pdf','pdf','application/pdf','application/pdf',100,REPLICATE('D',64),N'Withdrawn','POLICY',@Marker,'RAG_ADMIN','RAG003_UAT','CLEAN','UAT',@Now,'WITHDRAWN','UAT',@Now,DATEADD(DAY,-1,@Now),DATEADD(DAY,1,@Now),'RAG003_UAT',@Now,N'UAT withdraw');

      INSERT dbo.AI_RagDocumentLifecycleLogTbl
        (DocumentID,Action,Actor,PreviousStatus,NewStatus,EffectiveFrom,EffectiveTo,Reason)
      VALUES (@Withdrawn,'WITHDRAW','RAG003_UAT','APPROVED','WITHDRAWN',DATEADD(DAY,-1,@Now),DATEADD(DAY,1,@Now),N'UAT withdraw');

      SELECT Title FROM dbo.AI_ApprovedRagDocumentVw WHERE SourceReference=@Marker ORDER BY Title;
      SELECT Title,LifecycleStatus FROM dbo.AI_RagDocumentLifecycleVw WHERE SourceReference=@Marker ORDER BY Title;
      SELECT Action,Actor,NewStatus FROM dbo.AI_RagDocumentLifecycleLogTbl WHERE DocumentID=@Withdrawn;
    `);
    const published = result.recordsets[0] || [];
    const lifecycle = result.recordsets[1] || [];
    const audit = result.recordsets[2] || [];
    const statuses = Object.fromEntries(lifecycle.map((row) => [row.Title, row.LifecycleStatus]));
    const pass = published.length === 1 && published[0].Title === 'Active'
      && statuses.Active === 'ACTIVE' && statuses.Scheduled === 'SCHEDULED'
      && statuses.Expired === 'EXPIRED' && statuses.Withdrawn === 'WITHDRAWN'
      && audit.length === 1 && audit[0].Action === 'WITHDRAW';
    evidence = { published, lifecycle, audit, hasContentTable, pass };
    if (!pass) throw new Error(`RAG-003 UAT failed: ${JSON.stringify(evidence)}`);
  } finally {
    await transaction.rollback();
  }

  const remainingFixtures = await fixtureCount(pool);
  await pool.close();
  const result = { task: 'RAG-003-UAT-ROLLBACK', status: evidence.pass && remainingFixtures === 0 ? 'PASS' : 'FAIL', mutationPersisted: remainingFixtures !== 0, remainingFixtures, ...evidence };
  console.log(JSON.stringify(result, null, 2));
  if (result.status !== 'PASS') process.exitCode = 1;
}

main().catch((error) => {
  console.error(JSON.stringify({ task: 'RAG-003-UAT-ROLLBACK', status: 'ERROR', mutationPersisted: 'UNKNOWN', error: error.message }, null, 2));
  process.exitCode = 1;
});
