'use strict';

const fs = require('fs');
const path = require('path');
const sql = require('mssql');

const root = path.resolve(__dirname, '..');
const marker = 'RAG001_UAT_ROLLBACK_ONLY';

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
  const result = await new sql.Request(target).input('Marker', sql.NVarChar(500), marker).query('SELECT COUNT_BIG(*) AS FixtureCount FROM dbo.AI_RagDocumentTbl WHERE SourceReference=@Marker;');
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
  if ((await pool.request().query('SELECT DB_NAME() AS DatabaseName;')).recordset[0].DatabaseName !== 'medtest') throw new Error('RAG-001 rollback UAT chỉ chạy trên medtest.');
  if (await fixtureCount(pool)) throw new Error('Fixture RAG-001 cũ vẫn tồn tại.');

  const transaction = new sql.Transaction(pool);
  await transaction.begin(sql.ISOLATION_LEVEL.SERIALIZABLE);
  let evidence;
  try {
    const result = await new sql.Request(transaction).input('Marker', sql.NVarChar(500), marker).query(`
      DECLARE @Now DATETIME2(0)=SYSUTCDATETIME();
      INSERT dbo.AI_RagDocumentTbl
        (DocumentID,OriginalFileName,SafeFileName,FileExtension,DeclaredMimeType,DetectedMimeType,FileSizeBytes,Sha256Hex,Title,SourceType,SourceReference,SourceChannel,UploadedBy,MalwareScanStatus,MalwareScanner,MalwareScannedAt,ReviewStatus,ReviewedBy,ReviewedAt)
      VALUES
        (NEWID(),N'pending.pdf',CONVERT(VARCHAR(36),NEWID())+'.pdf','pdf','application/pdf','application/pdf',100,REPLICATE('A',64),N'Pending', 'POLICY',@Marker,'RAG_ADMIN','RAG001_UAT','CLEAN','UAT_SCANNER',@Now,'PENDING_REVIEW',NULL,NULL),
        (NEWID(),N'approved.pdf',CONVERT(VARCHAR(36),NEWID())+'.pdf','pdf','application/pdf','application/pdf',100,REPLICATE('B',64),N'Approved','POLICY',@Marker,'RAG_ADMIN','RAG001_UAT','CLEAN','UAT_SCANNER',@Now,'APPROVED','RAG001_REVIEWER',@Now),
        (NEWID(),N'scan-pending.pdf',CONVERT(VARCHAR(36),NEWID())+'.pdf','pdf','application/pdf','application/pdf',100,REPLICATE('C',64),N'Scan pending','POLICY',@Marker,'RAG_ADMIN','RAG001_UAT','PENDING',NULL,NULL,'PENDING_REVIEW',NULL,NULL),
        (NEWID(),N'rejected.jpg',CONVERT(VARCHAR(36),NEWID())+'.jpg','jpg','image/jpeg','image/jpeg',100,REPLICATE('D',64),N'Rejected','CATALOG',@Marker,'RAG_ADMIN','RAG001_UAT','INFECTED','UAT_SCANNER',@Now,'REJECTED','RAG001_REVIEWER',@Now);

      SELECT Title FROM dbo.AI_ApprovedRagDocumentVw WHERE SourceReference=@Marker ORDER BY Title;
    `);
    const published = result.recordset;
    const pass = published.length === 1 && published[0].Title === 'Approved';
    evidence = { published, pass };
    if (!pass) throw new Error(`RAG-001 approved view failed: ${JSON.stringify(evidence)}`);
  } finally {
    await transaction.rollback();
  }

  const remainingFixtures = await fixtureCount(pool);
  await pool.close();
  const result = { task: 'RAG-001-UAT-ROLLBACK', status: evidence.pass && remainingFixtures === 0 ? 'PASS' : 'FAIL', mutationPersisted: remainingFixtures !== 0, remainingFixtures, ...evidence };
  console.log(JSON.stringify(result, null, 2));
  if (result.status !== 'PASS') process.exitCode = 1;
}

main().catch((error) => {
  console.error(JSON.stringify({ task: 'RAG-001-UAT-ROLLBACK', status: 'ERROR', mutationPersisted: 'UNKNOWN', error: error.message }, null, 2));
  process.exitCode = 1;
});
