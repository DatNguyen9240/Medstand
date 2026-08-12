'use strict';

const fs = require('fs');
const path = require('path');
const sql = require('mssql');

const root = path.resolve(__dirname, '..');
const marker = 'RAG002_UAT_ROLLBACK_ONLY';

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
    SELECT COUNT_BIG(*) AS FixtureCount
    FROM dbo.AI_RagDocumentTbl
    WHERE SourceReference=@Marker;
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
  if ((await pool.request().query('SELECT DB_NAME() AS DatabaseName;')).recordset[0].DatabaseName !== 'medtest') throw new Error('RAG-002 rollback UAT chỉ chạy trên medtest.');
  if (await fixtureCount(pool)) throw new Error('Fixture RAG-002 cũ vẫn tồn tại.');

  const transaction = new sql.Transaction(pool);
  await transaction.begin(sql.ISOLATION_LEVEL.SERIALIZABLE);
  let evidence;
  try {
    const result = await new sql.Request(transaction).input('Marker', sql.NVarChar(500), marker).query(`
      DECLARE @Now DATETIME2(0)=SYSUTCDATETIME();
      DECLARE @Pending UNIQUEIDENTIFIER=NEWID(),@Approved UNIQUEIDENTIFIER=NEWID(),@Rejected UNIQUEIDENTIFIER=NEWID();

      INSERT dbo.AI_RagDocumentTbl
        (DocumentID,OriginalFileName,SafeFileName,FileExtension,DeclaredMimeType,DetectedMimeType,FileSizeBytes,Sha256Hex,Title,SourceType,SourceReference,SourceChannel,UploadedBy,MalwareScanStatus,MalwareScanner,MalwareScannedAt,ReviewStatus,ReviewedBy,ReviewedAt,ReviewNote)
      VALUES
        (@Pending,N'pending.pdf',CONVERT(VARCHAR(36),@Pending)+'.pdf','pdf','application/pdf','application/pdf',100,REPLICATE('A',64),N'Pending','POLICY',@Marker,'RAG_ADMIN','RAG002_UAT','CLEAN','UAT_SCANNER',@Now,'PENDING_REVIEW',NULL,NULL,NULL),
        (@Approved,N'approved.pdf',CONVERT(VARCHAR(36),@Approved)+'.pdf','pdf','application/pdf','application/pdf',100,REPLICATE('B',64),N'Approved','POLICY',@Marker,'RAG_ADMIN','RAG002_UAT','CLEAN','UAT_SCANNER',@Now,'APPROVED','RAG002_REVIEWER',@Now,NULL),
        (@Rejected,N'rejected.pdf',CONVERT(VARCHAR(36),@Rejected)+'.pdf','pdf','application/pdf','application/pdf',100,REPLICATE('C',64),N'Rejected','POLICY',@Marker,'RAG_ADMIN','RAG002_UAT','CLEAN','UAT_SCANNER',@Now,'REJECTED','RAG002_REVIEWER',@Now,N'UAT reject');

      INSERT dbo.AI_RagDocumentContentTbl
        (DocumentID,ContentVersion,ExtractedContent,EditedContent,ExtractionMethod,ExtractionStatus,Confidence,ExtractedAt,EditedBy,EditedAt,ContentSha256Hex)
      VALUES
        (@Pending,1,N'pending draft',N'pending edited','PDF_TEXT','READY','HIGH',@Now,'RAG002_EDITOR',@Now,REPLICATE('D',64)),
        (@Approved,1,N'approved draft',N'approved final','PDF_TEXT','READY','HIGH',@Now,'RAG002_REVIEWER',@Now,REPLICATE('E',64)),
        (@Rejected,1,N'rejected draft',NULL,'PDF_TEXT','READY','MEDIUM',@Now,NULL,NULL,REPLICATE('F',64));

      INSERT dbo.AI_RagDocumentReviewLogTbl
        (DocumentID,ContentVersion,Action,Actor,PreviousStatus,NewStatus,EditRevision,Reason,ContentSha256Hex)
      VALUES
        (@Pending,1,'SAVE','RAG002_EDITOR','PENDING_REVIEW','PENDING_REVIEW',1,NULL,REPLICATE('D',64)),
        (@Approved,1,'APPROVE','RAG002_REVIEWER','PENDING_REVIEW','APPROVED',1,NULL,REPLICATE('E',64)),
        (@Rejected,1,'REJECT','RAG002_REVIEWER','PENDING_REVIEW','REJECTED',1,N'UAT reject',REPLICATE('F',64));

      SELECT Title,ApprovedContent,ReviewedBy,ReviewedAt
      FROM dbo.AI_ApprovedRagContentVw
      WHERE SourceReference=@Marker;

      SELECT Action,Actor,NewStatus
      FROM dbo.AI_RagDocumentReviewLogTbl AS L
      JOIN dbo.AI_RagDocumentTbl AS D ON D.DocumentID=L.DocumentID
      WHERE D.SourceReference=@Marker
      ORDER BY Action;
    `);
    const published = result.recordsets[0] || [];
    const audit = result.recordsets[1] || [];
    const pass = published.length === 1
      && published[0].Title === 'Approved'
      && published[0].ApprovedContent === 'approved final'
      && published[0].ReviewedBy === 'RAG002_REVIEWER'
      && audit.length === 3;
    evidence = { published, audit, pass };
    if (!pass) throw new Error(`RAG-002 UAT failed: ${JSON.stringify(evidence)}`);
  } finally {
    await transaction.rollback();
  }

  const remainingFixtures = await fixtureCount(pool);
  await pool.close();
  const result = { task: 'RAG-002-UAT-ROLLBACK', status: evidence.pass && remainingFixtures === 0 ? 'PASS' : 'FAIL', mutationPersisted: remainingFixtures !== 0, remainingFixtures, ...evidence };
  console.log(JSON.stringify(result, null, 2));
  if (result.status !== 'PASS') process.exitCode = 1;
}

main().catch((error) => {
  console.error(JSON.stringify({ task: 'RAG-002-UAT-ROLLBACK', status: 'ERROR', mutationPersisted: 'UNKNOWN', error: error.message }, null, 2));
  process.exitCode = 1;
});
