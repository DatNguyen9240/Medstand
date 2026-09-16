'use strict';

const fs = require('fs');
const path = require('path');
const sql = require('mssql');

const root = path.resolve(__dirname, '..');
const marker = 'RAG002_RAG003_LIVE_CLEANUP_ONLY';

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

async function postOperation(adminKey, operation, body) {
  const response = await fetch('http://127.0.0.1:5678/webhook/admin-upload', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-admin-key': adminKey,
      'x-verified-user': 'RAG_LIVE_REVIEWER',
      'x-request-id': `req-rag-live-${operation.toLowerCase()}`,
    },
    body: JSON.stringify({ operation, ...body }),
  });
  const text = await response.text();
  let payload;
  try { payload = JSON.parse(text); } catch (_) { payload = { raw: text }; }
  return { statusCode: response.status, payload };
}

async function countVectors(documentID) {
  const response = await fetch('http://127.0.0.1:6333/collections/medstand-policies/points/count', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      exact: true,
      filter: { must: [{ key: 'metadata.documentID', match: { value: documentID } }] },
    }),
  });
  if (!response.ok) throw new Error(`Qdrant count failed: HTTP ${response.status}`);
  return Number((await response.json())?.result?.count || 0);
}

async function cleanup(pool, documentID) {
  await pool.request().input('DocumentID', sql.UniqueIdentifier, documentID).query(`
    DELETE FROM dbo.AI_RagDocumentReviewLogTbl WHERE DocumentID=@DocumentID;
    DELETE FROM dbo.AI_RagDocumentContentTbl WHERE DocumentID=@DocumentID;
    DELETE FROM dbo.AI_RagDocumentLifecycleLogTbl WHERE DocumentID=@DocumentID;
    DELETE FROM dbo.AI_RagDocumentTbl WHERE DocumentID=@DocumentID;
  `);
  try {
    await fetch('http://127.0.0.1:6333/collections/medstand-policies/points/delete?wait=true', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ filter: { must: [{ key: 'metadata.documentID', match: { value: documentID } }] } }),
    });
  } catch (_) { /* DB cleanup remains authoritative for the test fixture. */ }
}

async function main() {
  const env = { ...readEnv('.env'), ...readEnv('.env.uat.local'), ...process.env };
  if (!env.ADMIN_UPLOAD_KEY) throw new Error('Thiếu ADMIN_UPLOAD_KEY cho live UAT.');
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
    throw new Error('Live UAT RAG chỉ chạy trên medtest.');
  }

  let documentID;
  try {
    const existing = (await pool.request().input('Marker', sql.NVarChar(500), marker).query('SELECT DocumentID FROM dbo.AI_RagDocumentTbl WHERE SourceReference=@Marker;')).recordset;
    for (const row of existing) await cleanup(pool, row.DocumentID);

    documentID = (await pool.request().input('Marker', sql.NVarChar(500), marker).query(`
      DECLARE @DocumentID UNIQUEIDENTIFIER=NEWID(), @Now DATETIME2(0)=SYSUTCDATETIME();
      INSERT dbo.AI_RagDocumentTbl
        (DocumentID,OriginalFileName,SafeFileName,FileExtension,DeclaredMimeType,DetectedMimeType,FileSizeBytes,Sha256Hex,Title,SourceType,SourceReference,SourceChannel,UploadedBy,MalwareScanStatus,MalwareScanner,MalwareScannedAt,ReviewStatus)
      VALUES
        (@DocumentID,N'live-review.pdf',CONVERT(VARCHAR(36),@DocumentID)+'.pdf','pdf','application/pdf','application/pdf',100,REPLICATE('A',64),N'Live review and lifecycle','POLICY',@Marker,'RAG_ADMIN','RAG_LIVE_UPLOADER','CLEAN','WINDOWS_DEFENDER',@Now,'PENDING_REVIEW');
      INSERT dbo.AI_RagDocumentContentTbl
        (DocumentID,ContentVersion,ExtractedContent,ExtractionMethod,ExtractionStatus,Confidence,ExtractedAt,EditRevision,ContentSha256Hex)
      VALUES (@DocumentID,1,N'Chính sách bán hàng tháng 9 năm 2026.','PDF_TEXT','READY','HIGH',@Now,1,REPLICATE('B',64));
      SELECT CONVERT(VARCHAR(36),@DocumentID) AS DocumentID;
    `)).recordset[0].DocumentID;

    const detail = await postOperation(env.ADMIN_UPLOAD_KEY, 'GET_REVIEW', { documentID });
    const approve = await postOperation(env.ADMIN_UPLOAD_KEY, 'APPROVE_REVIEW', {
      documentID,
      contentVersion: 1,
      editRevision: 1,
      editedContent: 'Chính sách bán hàng tháng 9 năm 2026 đã được kiểm duyệt.',
      effectiveFromDate: '2026-09-13',
      effectiveToDate: '2026-09-30',
    });
    const vectorsAfterApprove = await countVectors(documentID);
    const lifecycle = await postOperation(env.ADMIN_UPLOAD_KEY, 'LIST_LIFECYCLE', {});
    const withdraw = await postOperation(env.ADMIN_UPLOAD_KEY, 'WITHDRAW_DOCUMENT', {
      documentID,
      reason: 'Kết thúc live UAT có kiểm soát',
    });
    const vectorsAfterWithdraw = await countVectors(documentID);
    const state = (await pool.request().input('DocumentID', sql.UniqueIdentifier, documentID).query(`
      SELECT ReviewStatus,RevokedBy,RevocationReason,
        (SELECT COUNT(*) FROM dbo.AI_ApprovedRagContentVw WHERE DocumentID=@DocumentID) AS PublishedCount,
        (SELECT COUNT(*) FROM dbo.AI_RagDocumentReviewLogTbl WHERE DocumentID=@DocumentID AND Action='APPROVE') AS ApproveAuditCount,
        (SELECT COUNT(*) FROM dbo.AI_RagDocumentLifecycleLogTbl WHERE DocumentID=@DocumentID AND Action='WITHDRAW') AS WithdrawAuditCount
      FROM dbo.AI_RagDocumentTbl WHERE DocumentID=@DocumentID;
    `)).recordset[0];
    const lifecycleRows = lifecycle.payload?.records || lifecycle.payload?.data?.records || [];
    const pass = detail.statusCode === 200 && detail.payload?.code === 'REVIEW_DETAIL'
      && approve.statusCode === 200 && approve.payload?.status === 'success' && approve.payload?.reviewStatus === 'APPROVED'
      && vectorsAfterApprove === 1 && vectorsAfterWithdraw === 0
      && lifecycle.statusCode === 200 && lifecycleRows.some((row) => String(row.documentID).toLowerCase() === documentID.toLowerCase())
      && withdraw.statusCode === 200 && withdraw.payload?.status === 'success'
      && state?.ReviewStatus === 'WITHDRAWN' && state?.RevokedBy === 'RAG_LIVE_REVIEWER'
      && Number(state?.PublishedCount) === 0 && Number(state?.ApproveAuditCount) === 1 && Number(state?.WithdrawAuditCount) === 1;
    console.log(JSON.stringify({ task: 'RAG-002-RAG-003-LIVE-CLEANUP', status: pass ? 'PASS' : 'FAIL', detail, approve, vectorsAfterApprove, lifecycleMatch: lifecycleRows.find((row) => String(row.documentID).toLowerCase() === documentID.toLowerCase()) || null, withdraw, vectorsAfterWithdraw, state }, null, 2));
    if (!pass) process.exitCode = 1;
  } finally {
    if (documentID) await cleanup(pool, documentID);
    await pool.close();
  }
}

main().catch((error) => {
  console.error(JSON.stringify({ task: 'RAG-002-RAG-003-LIVE-CLEANUP', status: 'ERROR', error: error.message }, null, 2));
  process.exitCode = 1;
});
