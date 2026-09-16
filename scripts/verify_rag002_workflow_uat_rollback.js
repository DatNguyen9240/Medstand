'use strict';

const fs = require('fs');
const path = require('path');
const sql = require('mssql');

const root = path.resolve(__dirname, '..');
const marker = 'RAG002_WORKFLOW_UAT_ROLLBACK_ONLY';

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

function fixtureCount(target) {
  return new sql.Request(target)
    .input('Marker', sql.NVarChar(500), marker)
    .query('SELECT COUNT_BIG(*) AS FixtureCount FROM dbo.AI_RagDocumentTbl WHERE SourceReference=@Marker;')
    .then((result) => Number(result.recordset[0].FixtureCount));
}

function sqlText(value) {
  return String(value == null ? '' : value).replace(/'/g, "''");
}

function renderWorkflowQuery(template, payload) {
  const replacements = new Map([
    ["{{ $json.operation }}", sqlText(payload.operation)],
    ["{{ $json.documentID }}", sqlText(payload.documentID)],
    ["{{ $json.contentVersion || 0 }}", String(Number(payload.contentVersion || 0))],
    ["{{ $json.editRevision || 0 }}", String(Number(payload.editRevision || 0))],
    ["{{ $json.actor.replace(/'/g, \"''\") }}", sqlText(payload.actor)],
    ["{{ $json.editedContent.replace(/'/g, \"''\") }}", sqlText(payload.editedContent)],
    ["{{ $json.reason.replace(/'/g, \"''\") }}", sqlText(payload.reason)],
    ["{{ $json.requestID.replace(/'/g, \"''\") }}", sqlText(payload.requestID)],
    ["{{ $json.effectiveFromDate }}", sqlText(payload.effectiveFromDate)],
    ["{{ $json.effectiveToDate }}", sqlText(payload.effectiveToDate)],
  ]);
  let rendered = template;
  for (const [token, value] of replacements) rendered = rendered.split(token).join(value);
  if (/{{[\s\S]*?}}/.test(rendered)) throw new Error('Câu SQL workflow còn biểu thức chưa render.');
  return rendered;
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
  const databaseName = (await pool.request().query('SELECT DB_NAME() AS DatabaseName;')).recordset[0].DatabaseName;
  if (databaseName !== 'medtest') throw new Error(`RAG-002 workflow UAT chỉ chạy trên medtest; hiện tại ${databaseName}.`);
  if (await fixtureCount(pool)) throw new Error('Fixture RAG-002 workflow cũ vẫn tồn tại.');

  const workflow = JSON.parse(fs.readFileSync(path.join(root, 'n8n/AI_Core/AI_Upload_Reader.json'), 'utf8'));
  const queryTemplate = workflow.nodes.find((node) => node.name === 'RAG002 Review Action DB')?.parameters?.query;
  if (!queryTemplate) throw new Error('Không tìm thấy câu SQL RAG002 Review Action DB.');

  const transaction = new sql.Transaction(pool);
  await transaction.begin(sql.ISOLATION_LEVEL.SERIALIZABLE);
  let evidence;
  try {
    const documentID = (await new sql.Request(transaction).input('Marker', sql.NVarChar(500), marker).query(`
      DECLARE @DocumentID UNIQUEIDENTIFIER=NEWID(), @Now DATETIME2(0)=SYSUTCDATETIME();
      INSERT dbo.AI_RagDocumentTbl
        (DocumentID,OriginalFileName,SafeFileName,FileExtension,DeclaredMimeType,DetectedMimeType,FileSizeBytes,Sha256Hex,Title,SourceType,SourceReference,SourceChannel,UploadedBy,MalwareScanStatus,MalwareScanner,MalwareScannedAt,ReviewStatus)
      VALUES
        (@DocumentID,N'workflow.pdf',CONVERT(VARCHAR(36),@DocumentID)+'.pdf','pdf','application/pdf','application/pdf',100,REPLICATE('A',64),N'Workflow approval','POLICY',@Marker,'RAG_ADMIN','RAG002_UPLOADER','CLEAN','UAT_SCANNER',@Now,'PENDING_REVIEW');
      INSERT dbo.AI_RagDocumentContentTbl
        (DocumentID,ContentVersion,ExtractedContent,ExtractionMethod,ExtractionStatus,Confidence,ExtractedAt,EditRevision,ContentSha256Hex)
      VALUES (@DocumentID,1,N'Bản OCR ban đầu','PDF_TEXT','READY','HIGH',@Now,1,REPLICATE('B',64));
      SELECT CONVERT(VARCHAR(36),@DocumentID) AS DocumentID;
    `)).recordset[0].DocumentID;

    const renderedQuery = renderWorkflowQuery(queryTemplate, {
      operation: 'APPROVE_REVIEW',
      documentID,
      contentVersion: 1,
      editRevision: 1,
      actor: "RAG002_REVIEWER'O",
      editedContent: "Nội dung đã duyệt của nhà thuốc O'Brien",
      reason: '',
      requestID: 'req-rag002-workflow-uat',
      effectiveFromDate: '2026-09-13',
      effectiveToDate: '2026-09-30',
    });
    const action = (await new sql.Request(transaction).query(renderedQuery)).recordset[0];
    const published = (await new sql.Request(transaction).input('DocumentID', sql.UniqueIdentifier, documentID).query(`
      SELECT ApprovedContent,ReviewedBy,EffectiveFrom,EffectiveTo
      FROM dbo.AI_ApprovedRagContentVw WHERE DocumentID=@DocumentID;
    `)).recordset;
    const audit = (await new sql.Request(transaction).input('DocumentID', sql.UniqueIdentifier, documentID).query(`
      SELECT Action,Actor,RequestID FROM dbo.AI_RagDocumentReviewLogTbl WHERE DocumentID=@DocumentID;
    `)).recordset;
    const pass = action.status === 'success' && action.code === 'APPROVE_REVIEW'
      && published.length === 1
      && published[0].ApprovedContent === "Nội dung đã duyệt của nhà thuốc O'Brien"
      && published[0].ReviewedBy === "RAG002_REVIEWER'O"
      && audit.length === 1 && audit[0].Action === 'APPROVE'
      && audit[0].RequestID === 'req-rag002-workflow-uat';
    evidence = { action, published, audit, pass };
    if (!pass) throw new Error(`RAG-002 workflow UAT failed: ${JSON.stringify(evidence)}`);
  } finally {
    await transaction.rollback();
  }

  const remainingFixtures = await fixtureCount(pool);
  await pool.close();
  const result = {
    task: 'RAG-002-WORKFLOW-UAT-ROLLBACK',
    status: evidence.pass && remainingFixtures === 0 ? 'PASS' : 'FAIL',
    remainingFixtures,
    ...evidence,
  };
  console.log(JSON.stringify(result, null, 2));
  if (result.status !== 'PASS') process.exitCode = 1;
}

main().catch((error) => {
  console.error(JSON.stringify({ task: 'RAG-002-WORKFLOW-UAT-ROLLBACK', status: 'ERROR', error: error.message }, null, 2));
  process.exitCode = 1;
});
