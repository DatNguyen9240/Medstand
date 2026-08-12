'use strict';

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const workflowPath = path.join(root, 'n8n/AI_Core/AI_Upload_Reader.json');
const workflow = JSON.parse(fs.readFileSync(workflowPath, 'utf8'));
const sqlCredentials = nodeOf('RAG001 Save Quarantine Metadata').credentials;
const qdrantCredentials = nodeOf('Qdrant Vector Sync').credentials;
const embeddingCredentials = nodeOf('OpenAI Embeddings').credentials;

function nodeOf(name) {
  const node = workflow.nodes.find((candidate) => candidate.name === name);
  if (!node) throw new Error(`Không tìm thấy node: ${name}`);
  return node;
}

const adminWebhook = nodeOf('Webhook Admin Upload');
const approveWebhook = nodeOf('Webhook Approve Catalog');
for (const edges of Object.values(workflow.connections)) {
  for (const connector of Object.values(edges)) {
    for (const lane of connector || []) {
      for (const edge of lane || []) {
        if (edge.node === adminWebhook.name) edge.node = 'admin-upload';
        if (edge.node === approveWebhook.name) edge.node = 'approve-catalog';
      }
    }
  }
}
workflow.connections['admin-upload'] = workflow.connections[adminWebhook.name];
workflow.connections['approve-catalog'] = workflow.connections[approveWebhook.name];
delete workflow.connections[adminWebhook.name];
delete workflow.connections[approveWebhook.name];
adminWebhook.name = 'admin-upload';
approveWebhook.name = 'approve-catalog';
delete adminWebhook.webhookId;
delete approveWebhook.webhookId;

function mainEdge(node) {
  return { node, type: 'main', index: 0 };
}

function replaceMain(from, target) {
  workflow.connections[from] = { main: [[mainEdge(target)]] };
}

function sqlNode(id, name, query, position) {
  return {
    parameters: { operation: 'executeQuery', query },
    id,
    name,
    type: 'n8n-nodes-base.microsoftSql',
    typeVersion: 1,
    position,
    credentials: sqlCredentials,
  };
}

const managedNames = new Set([
  'RAG002 If Review Operation',
  'RAG002 If Review Valid',
  'RAG002 Route Review Operation',
  'RAG002 Review List',
  'RAG002 Review Detail',
  'RAG002 Review Action DB',
  'RAG002 If Approval Ready',
  'RAG002 Prepare Approved Document',
  'RAG002 Approved Document Loader',
  'RAG002 Approved Embeddings',
  'RAG002 Approved Vector Store',
  'RAG002 Respond Review Action',
  'RAG002 If XLSX',
  'RAG002 Extract XLSX',
  'RAG002 Normalize XLSX',
  'RAG002 If PDF',
  'RAG002 Extract PDF',
  'RAG002 Normalize PDF',
  'RAG002 Prep Vision OCR',
  'RAG002 Vision OCR',
  'RAG002 Normalize Vision',
  'RAG002 Save OCR Draft',
  'RAG002 Respond OCR Draft',
  'RAG002 Reattach Clean File',
]);

workflow.nodes = workflow.nodes.filter((node) => !managedNames.has(node.name));
for (const name of managedNames) delete workflow.connections[name];

nodeOf('Check Auth & Format').parameters.jsCode = `const input = $input.first();
const body = input.json.body || {};
const headers = input.json.headers || {};
const expectedAdminKey = String($env.ADMIN_UPLOAD_KEY || '').trim();
const apiKey = String(headers['x-admin-key'] || headers['X-Admin-Key'] || body.adminKey || '').trim();
if (!expectedAdminKey) throw new Error('CONFIG_ERROR: ADMIN_UPLOAD_KEY is not configured.');
if (apiKey !== expectedAdminKey) throw new Error('SECURITY_ALERT: Truy cập trái phép.');

const operation = String(body.operation || '').trim().toUpperCase();
const reviewOperations = ['LIST_REVIEWS', 'GET_REVIEW', 'SAVE_REVIEW', 'APPROVE_REVIEW', 'REJECT_REVIEW'];
if (operation) {
  if (!reviewOperations.includes(operation)) return [{ json: { passes: false, isReviewOperation: true, code: 'INVALID_OPERATION', message: 'Thao tác kiểm duyệt không hợp lệ.' } }];
  const documentID = String(body.documentID || '').trim();
  const contentVersion = Number(body.contentVersion || 0);
  const editRevision = Number(body.editRevision || 0);
  const editedContent = String(body.editedContent || '');
  const reason = String(body.reason || '').trim();
  const actor = String(headers['x-verified-user'] || body.username || '').trim();
  const requestID = String(headers['x-request-id'] || headers['x-correlation-id'] || '').trim();
  const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  let code = '';
  let message = '';
  if (operation !== 'LIST_REVIEWS' && !uuidPattern.test(documentID)) { code = 'INVALID_DOCUMENT_ID'; message = 'Mã tài liệu không hợp lệ.'; }
  else if (['SAVE_REVIEW', 'APPROVE_REVIEW', 'REJECT_REVIEW'].includes(operation) && !actor) { code = 'REVIEWER_REQUIRED'; message = 'Không xác định được người duyệt.'; }
  else if (['SAVE_REVIEW', 'APPROVE_REVIEW'].includes(operation) && !editedContent.trim()) { code = 'EMPTY_REVIEW_CONTENT'; message = 'Nội dung duyệt không được để trống.'; }
  else if (editedContent.length > 500000) { code = 'CONTENT_TOO_LARGE'; message = 'Nội dung duyệt vượt quá 500.000 ký tự.'; }
  else if (operation === 'REJECT_REVIEW' && !reason) { code = 'REJECT_REASON_REQUIRED'; message = 'Vui lòng nhập lý do từ chối.'; }
  else if (reason.length > 1000) { code = 'REASON_TOO_LARGE'; message = 'Lý do vượt quá 1.000 ký tự.'; }
  return [{ json: {
    passes: !code,
    isReviewOperation: true,
    operation,
    documentID,
    contentVersion,
    editRevision,
    editedContent,
    reason,
    actor,
    requestID,
    code,
    message
  } }];
}

if (!input.binary || !input.binary.file) return [{ json: { passes: false, isReviewOperation: false, code: 'EMPTY_FILE', message: 'File rỗng, vui lòng chọn file khác.' } }];
const file = input.binary.file;
const buffer = await this.helpers.getBinaryDataBuffer(0, 'file');
const originalFileName = String(file.fileName || '').trim();
const baseName = originalFileName.split(/[\\/]/).pop();
const ext = String(file.fileExtension || baseName.split('.').pop() || '').toLowerCase();
const mime = String(file.mimeType || '').toLowerCase();
const title = String(body.title || '').trim();
const sourceType = String(body.sourceType || '').trim().toUpperCase();
const sourceReference = String(body.sourceReference || '').trim();
const uploadedBy = String(headers['x-verified-user'] || body.username || '').trim();
const sourceTypes = ['POLICY', 'CATALOG', 'PROMOTION', 'INTERNAL_RULE', 'OTHER'];
const definitions = {
  pdf: { mime: 'application/pdf', signature: buffer.subarray(0, 5).toString('ascii') === '%PDF-' },
  xlsx: { mime: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', signature: buffer[0] === 0x50 && buffer[1] === 0x4b },
  png: { mime: 'image/png', signature: buffer.subarray(0, 8).equals(Buffer.from([0x89,0x50,0x4e,0x47,0x0d,0x0a,0x1a,0x0a])) },
  jpg: { mime: 'image/jpeg', signature: buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff },
  jpeg: { mime: 'image/jpeg', signature: buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff }
};
let code = '';
let message = '';
if (!buffer.length) { code = 'EMPTY_FILE'; message = 'File rỗng, vui lòng chọn file khác.'; }
else if (buffer.length > 10 * 1024 * 1024) { code = 'FILE_TOO_LARGE'; message = 'File vượt quá giới hạn 10 MB.'; }
else if (!definitions[ext] || baseName !== originalFileName) { code = 'UNSUPPORTED_FILE_TYPE'; message = 'Chỉ hỗ trợ PDF, XLSX, PNG và JPG/JPEG.'; }
else if (mime !== definitions[ext].mime || !definitions[ext].signature) { code = 'FILE_SIGNATURE_MISMATCH'; message = 'Nội dung file không khớp phần mở rộng hoặc MIME.'; }
else if (!title || !sourceTypes.includes(sourceType) || !sourceReference || !uploadedBy) { code = 'INVALID_SOURCE_METADATA'; message = 'Thiếu tiêu đề, loại nguồn hoặc mô tả nguồn tài liệu.'; }
if (code) return [{ json: { passes: false, isReviewOperation: false, status: 'error', code, message } }];
const documentID = globalThis.crypto.randomUUID();
return [{ json: {
  passes: true,
  isReviewOperation: false,
  status: 'quarantined',
  documentID,
  originalFileName,
  safeFileName: documentID + '.' + (ext === 'jpeg' ? 'jpg' : ext),
  ext,
  declaredMimeType: mime,
  detectedMimeType: definitions[ext].mime,
  fileSizeBytes: buffer.length,
  sha256Hex: '',
  title,
  sourceType,
  sourceReference,
  sourceChannel: 'RAG_ADMIN',
  uploadedBy,
  malwareScanStatus: 'PENDING',
  malwareScanner: '',
  reviewStatus: 'PENDING_REVIEW',
  expiryDate: body.expiryDate || 'never',
  requestID: String(headers['x-request-id'] || headers['x-correlation-id'] || '').trim()
}, binary: input.binary }];`;

nodeOf('Respond Error').parameters.jsCode = `const input = $input.first().json || {};
return [{ json: { status: 'error', code: input.code || 'REQUEST_REJECTED', message: input.message || 'Yêu cầu không đạt điều kiện an toàn.' } }];`;

const ifReviewOperation = {
  parameters: { conditions: { boolean: [{ value1: '={{ $json.isReviewOperation }}', value2: true }] } },
  id: 'rag002-if-review-operation',
  name: 'RAG002 If Review Operation',
  type: 'n8n-nodes-base.if',
  typeVersion: 1,
  position: [400, 300],
};

const ifReviewValid = {
  parameters: { conditions: { boolean: [{ value1: '={{ $json.passes }}', value2: true }] } },
  id: 'rag002-if-review-valid',
  name: 'RAG002 If Review Valid',
  type: 'n8n-nodes-base.if',
  typeVersion: 1,
  position: [520, 620],
};

const routeReviewOperation = {
  parameters: {
    rules: {
      values: [
        { conditions: { options: { caseSensitive: true, leftValue: '', typeValidation: 'strict', version: 2 }, conditions: [{ leftValue: '={{ $json.operation }}', rightValue: 'LIST_REVIEWS', operator: { type: 'string', operation: 'equals' } }], combinator: 'and' }, renameOutput: true, outputKey: 'LIST_REVIEWS' },
        { conditions: { options: { caseSensitive: true, leftValue: '', typeValidation: 'strict', version: 2 }, conditions: [{ leftValue: '={{ $json.operation }}', rightValue: 'GET_REVIEW', operator: { type: 'string', operation: 'equals' } }], combinator: 'and' }, renameOutput: true, outputKey: 'GET_REVIEW' },
        { conditions: { options: { caseSensitive: true, leftValue: '', typeValidation: 'strict', version: 2 }, conditions: [{ leftValue: '={{ $json.operation }}', rightValue: 'SAVE_REVIEW', operator: { type: 'string', operation: 'equals' } }], combinator: 'and' }, renameOutput: true, outputKey: 'SAVE_REVIEW' },
        { conditions: { options: { caseSensitive: true, leftValue: '', typeValidation: 'strict', version: 2 }, conditions: [{ leftValue: '={{ $json.operation }}', rightValue: 'APPROVE_REVIEW', operator: { type: 'string', operation: 'equals' } }], combinator: 'and' }, renameOutput: true, outputKey: 'APPROVE_REVIEW' },
        { conditions: { options: { caseSensitive: true, leftValue: '', typeValidation: 'strict', version: 2 }, conditions: [{ leftValue: '={{ $json.operation }}', rightValue: 'REJECT_REVIEW', operator: { type: 'string', operation: 'equals' } }], combinator: 'and' }, renameOutput: true, outputKey: 'REJECT_REVIEW' },
      ],
    },
    options: { fallbackOutput: 'extra' },
  },
  id: 'rag002-route-review-operation',
  name: 'RAG002 Route Review Operation',
  type: 'n8n-nodes-base.switch',
  typeVersion: 3.2,
  position: [650, 620],
};

const listReviews = sqlNode('rag002-review-list', 'RAG002 Review List', `SELECT
  'success' AS status,
  'REVIEW_QUEUE' AS code,
  CONVERT(VARCHAR(36),D.DocumentID) AS documentID,
  D.Title AS title,
  D.OriginalFileName AS originalFileName,
  D.SourceType AS sourceType,
  D.SourceReference AS sourceReference,
  D.UploadedBy AS uploadedBy,
  CONVERT(VARCHAR(33),D.UploadedAt,126)+'Z' AS uploadedAt,
  D.MalwareScanStatus AS malwareScanStatus,
  D.ReviewStatus AS reviewStatus,
  C.ContentVersion AS contentVersion,
  C.EditRevision AS editRevision,
  C.ExtractionStatus AS extractionStatus,
  C.ExtractionMethod AS extractionMethod,
  C.Confidence AS confidence,
  LEN(COALESCE(C.EditedContent,C.ExtractedContent,N'')) AS contentLength
FROM dbo.AI_RagDocumentTbl AS D
OUTER APPLY
(
  SELECT TOP (1) ContentVersion,EditRevision,ExtractionStatus,ExtractionMethod,Confidence,ExtractedContent,EditedContent
  FROM dbo.AI_RagDocumentContentTbl AS Content
  WHERE Content.DocumentID=D.DocumentID
  ORDER BY Content.ContentVersion DESC
) AS C
WHERE D.MalwareScanStatus='CLEAN' AND D.ReviewStatus='PENDING_REVIEW'
ORDER BY D.UploadedAt DESC;`, [900, 440]);

const reviewDetail = sqlNode('rag002-review-detail', 'RAG002 Review Detail', `DECLARE @DocumentID UNIQUEIDENTIFIER=TRY_CONVERT(UNIQUEIDENTIFIER,'{{ $json.documentID }}');
SELECT TOP (1)
  'success' AS status,
  'REVIEW_DETAIL' AS code,
  CONVERT(VARCHAR(36),D.DocumentID) AS documentID,
  D.Title AS title,
  D.OriginalFileName AS originalFileName,
  D.SourceType AS sourceType,
  D.SourceReference AS sourceReference,
  D.UploadedBy AS uploadedBy,
  CONVERT(VARCHAR(33),D.UploadedAt,126)+'Z' AS uploadedAt,
  D.MalwareScanStatus AS malwareScanStatus,
  D.ReviewStatus AS reviewStatus,
  C.ContentVersion AS contentVersion,
  C.EditRevision AS editRevision,
  C.ExtractionStatus AS extractionStatus,
  C.ExtractionMethod AS extractionMethod,
  C.Confidence AS confidence,
  COALESCE(C.EditedContent,C.ExtractedContent,N'') AS editedContent,
  D.ReviewNote AS reviewNote
FROM dbo.AI_RagDocumentTbl AS D
JOIN dbo.AI_RagDocumentContentTbl AS C ON C.DocumentID=D.DocumentID
WHERE D.DocumentID=@DocumentID
ORDER BY C.ContentVersion DESC;`, [900, 560]);

const reviewAction = sqlNode('rag002-review-action-db', 'RAG002 Review Action DB', `SET NOCOUNT ON;
SET XACT_ABORT ON;
DECLARE @Operation VARCHAR(20)='{{ $json.operation }}';
DECLARE @DocumentID UNIQUEIDENTIFIER=TRY_CONVERT(UNIQUEIDENTIFIER,'{{ $json.documentID }}');
DECLARE @RequestedVersion INT={{ $json.contentVersion || 0 }};
DECLARE @RequestedRevision INT={{ $json.editRevision || 0 }};
DECLARE @Actor VARCHAR(100)='{{ $json.actor.replace(/'/g, "''") }}';
DECLARE @EditedContent NVARCHAR(MAX)=N'{{ $json.editedContent.replace(/'/g, "''") }}';
DECLARE @Reason NVARCHAR(1000)=N'{{ $json.reason.replace(/'/g, "''") }}';
DECLARE @RequestID VARCHAR(100)=NULLIF('{{ $json.requestID.replace(/'/g, "''") }}','');
DECLARE @CurrentStatus VARCHAR(20),@MalwareStatus VARCHAR(20),@ExtractionStatus VARCHAR(20);
DECLARE @ContentVersion INT,@EditRevision INT,@NewRevision INT,@ExtractionMethod VARCHAR(30),@Confidence VARCHAR(20);
DECLARE @CurrentContent NVARCHAR(MAX),@Title NVARCHAR(300),@SourceType VARCHAR(30),@SourceReference NVARCHAR(500);
DECLARE @Sha256 CHAR(64),@Error VARCHAR(50)='',@Message NVARCHAR(500)=N'';

BEGIN TRANSACTION;
SELECT @CurrentStatus=D.ReviewStatus,@MalwareStatus=D.MalwareScanStatus,@Title=D.Title,@SourceType=D.SourceType,@SourceReference=D.SourceReference
FROM dbo.AI_RagDocumentTbl AS D WITH (UPDLOCK,HOLDLOCK)
WHERE D.DocumentID=@DocumentID;

SELECT TOP (1)
  @ContentVersion=C.ContentVersion,@EditRevision=C.EditRevision,@ExtractionStatus=C.ExtractionStatus,
  @ExtractionMethod=C.ExtractionMethod,@Confidence=C.Confidence,@CurrentContent=COALESCE(C.EditedContent,C.ExtractedContent,N'')
FROM dbo.AI_RagDocumentContentTbl AS C WITH (UPDLOCK,HOLDLOCK)
WHERE C.DocumentID=@DocumentID
ORDER BY C.ContentVersion DESC;

IF @CurrentStatus IS NULL BEGIN SET @Error='DOCUMENT_NOT_FOUND'; SET @Message=N'Không tìm thấy tài liệu.'; END
ELSE IF @CurrentStatus<>'PENDING_REVIEW' BEGIN SET @Error='REVIEW_ALREADY_CLOSED'; SET @Message=N'Tài liệu không còn ở trạng thái chờ duyệt.'; END
ELSE IF @MalwareStatus<>'CLEAN' BEGIN SET @Error='DOCUMENT_NOT_CLEAN'; SET @Message=N'Tài liệu chưa qua cổng quét an toàn.'; END
ELSE IF @ContentVersion IS NULL BEGIN SET @Error='CONTENT_NOT_FOUND'; SET @Message=N'Chưa có nội dung OCR để duyệt.'; END
ELSE IF @RequestedVersion>0 AND @RequestedVersion<>@ContentVersion BEGIN SET @Error='CONTENT_VERSION_CONFLICT'; SET @Message=N'Phiên bản nội dung đã thay đổi.'; END
ELSE IF @RequestedRevision>0 AND @RequestedRevision<>@EditRevision BEGIN SET @Error='EDIT_CONFLICT'; SET @Message=N'Nội dung đã được người khác cập nhật. Vui lòng tải lại.'; END
ELSE IF @Operation IN ('SAVE_REVIEW','APPROVE_REVIEW') AND (LEN(LTRIM(RTRIM(@EditedContent)))=0 OR @ExtractionStatus<>'READY') BEGIN SET @Error='CONTENT_NOT_READY'; SET @Message=N'Nội dung OCR chưa sẵn sàng hoặc đang rỗng.'; END
ELSE IF @Operation='REJECT_REVIEW' AND LEN(LTRIM(RTRIM(@Reason)))=0 BEGIN SET @Error='REJECT_REASON_REQUIRED'; SET @Message=N'Vui lòng nhập lý do từ chối.'; END

IF @Error=''
BEGIN
  SET @NewRevision=@EditRevision;
  IF @Operation IN ('SAVE_REVIEW','APPROVE_REVIEW')
  BEGIN
    SET @NewRevision=@EditRevision+1;
    SET @Sha256=CONVERT(CHAR(64),HASHBYTES('SHA2_256',CONVERT(VARBINARY(MAX),@EditedContent)),2);
    UPDATE dbo.AI_RagDocumentContentTbl
      SET EditedContent=@EditedContent,EditedBy=@Actor,EditedAt=SYSUTCDATETIME(),EditRevision=@NewRevision,
          ContentSha256Hex=@Sha256,UpdatedAt=SYSUTCDATETIME()
      WHERE DocumentID=@DocumentID AND ContentVersion=@ContentVersion;
  END
  ELSE
  BEGIN
    SET @Sha256=CONVERT(CHAR(64),HASHBYTES('SHA2_256',CONVERT(VARBINARY(MAX),@CurrentContent)),2);
  END;

  IF @Operation='APPROVE_REVIEW'
  BEGIN
    UPDATE dbo.AI_RagDocumentTbl
      SET ReviewStatus='APPROVED',ReviewedBy=@Actor,ReviewedAt=SYSUTCDATETIME(),ReviewNote=NULL,UpdatedAt=SYSUTCDATETIME()
      WHERE DocumentID=@DocumentID;
  END
  ELSE IF @Operation='REJECT_REVIEW'
  BEGIN
    UPDATE dbo.AI_RagDocumentTbl
      SET ReviewStatus='REJECTED',ReviewedBy=@Actor,ReviewedAt=SYSUTCDATETIME(),ReviewNote=@Reason,UpdatedAt=SYSUTCDATETIME()
      WHERE DocumentID=@DocumentID;
  END;

  INSERT dbo.AI_RagDocumentReviewLogTbl
    (DocumentID,ContentVersion,Action,Actor,PreviousStatus,NewStatus,EditRevision,Reason,ContentSha256Hex,RequestID)
  VALUES
    (@DocumentID,@ContentVersion,
      CASE @Operation WHEN 'SAVE_REVIEW' THEN 'SAVE' WHEN 'APPROVE_REVIEW' THEN 'APPROVE' ELSE 'REJECT' END,
      @Actor,@CurrentStatus,
      CASE @Operation WHEN 'APPROVE_REVIEW' THEN 'APPROVED' WHEN 'REJECT_REVIEW' THEN 'REJECTED' ELSE @CurrentStatus END,
      @NewRevision,NULLIF(@Reason,N''),@Sha256,@RequestID);

  SET @Message=CASE @Operation WHEN 'SAVE_REVIEW' THEN N'Đã lưu bản nháp.' WHEN 'APPROVE_REVIEW' THEN N'Đã phê duyệt tài liệu.' ELSE N'Đã từ chối tài liệu.' END;
END;

COMMIT TRANSACTION;
SELECT
  CASE WHEN @Error='' THEN 'success' ELSE 'error' END AS status,
  CASE WHEN @Error='' THEN @Operation ELSE @Error END AS code,
  @Message AS message,
  CONVERT(VARCHAR(36),@DocumentID) AS documentID,
  @ContentVersion AS contentVersion,
  @NewRevision AS editRevision,
  CASE WHEN @Error='' AND @Operation='APPROVE_REVIEW' THEN CAST(1 AS BIT) ELSE CAST(0 AS BIT) END AS publishApproved,
  @Title AS title,
  @SourceType AS sourceType,
  @SourceReference AS sourceReference,
  @ExtractionMethod AS extractionMethod,
  @Confidence AS confidence,
  CASE WHEN @Operation='APPROVE_REVIEW' THEN @EditedContent ELSE NULL END AS approvedContent,
  CASE WHEN @Error='' AND @Operation='APPROVE_REVIEW' THEN 'APPROVED' WHEN @Error='' AND @Operation='REJECT_REVIEW' THEN 'REJECTED' ELSE @CurrentStatus END AS reviewStatus,
  @MalwareStatus AS malwareScanStatus;`, [900, 760]);

const ifApprovalReady = {
  parameters: { conditions: { boolean: [{ value1: '={{ $json.publishApproved }}', value2: true }] } },
  id: 'rag002-if-approval-ready',
  name: 'RAG002 If Approval Ready',
  type: 'n8n-nodes-base.if',
  typeVersion: 1,
  position: [1150, 760],
};

const prepareApproved = {
  parameters: {
    jsCode: `const row = $input.first().json || {};
const content = String(row.approvedContent || '').trim();
const buffer = Buffer.from(content, 'utf8');
return [{ json: {
  documentID: row.documentID,
  title: row.title,
  sourceType: row.sourceType,
  sourceReference: row.sourceReference,
  contentVersion: row.contentVersion,
  editRevision: row.editRevision,
  extractionMethod: row.extractionMethod,
  confidence: row.confidence,
  reviewStatus: 'APPROVED',
  malwareScanStatus: 'CLEAN'
}, binary: { approved_file: { data: buffer.toString('base64'), mimeType: 'text/plain', fileName: row.documentID + '.txt' } } }];`,
  },
  id: 'rag002-prepare-approved-document',
  name: 'RAG002 Prepare Approved Document',
  type: 'n8n-nodes-base.code',
  typeVersion: 2,
  position: [1400, 680],
};

const approvedLoader = {
  parameters: {
    dataType: 'binary',
    binaryPropertyName: 'approved_file',
    options: {
      metadata: '={\n  "documentID": "{{ $json.documentID }}",\n  "title": "{{ $json.title }}",\n  "sourceType": "{{ $json.sourceType }}",\n  "sourceReference": "{{ $json.sourceReference }}",\n  "contentVersion": {{ $json.contentVersion }},\n  "editRevision": {{ $json.editRevision }},\n  "reviewStatus": "APPROVED",\n  "malwareScanStatus": "CLEAN"\n}',
    },
  },
  id: 'rag002-approved-document-loader',
  name: 'RAG002 Approved Document Loader',
  type: '@n8n/n8n-nodes-langchain.documentDefaultDataLoader',
  typeVersion: 1,
  position: [1600, 920],
};

const approvedEmbeddings = {
  parameters: { model: 'text-embedding-3-small', options: {} },
  id: 'rag002-approved-embeddings',
  name: 'RAG002 Approved Embeddings',
  type: '@n8n/n8n-nodes-langchain.embeddingsOpenAi',
  typeVersion: 1,
  position: [1820, 920],
  credentials: embeddingCredentials,
};

const approvedVector = {
  parameters: { mode: 'insert', qdrantCollection: 'medstand-policies', options: {} },
  id: 'rag002-approved-vector-store',
  name: 'RAG002 Approved Vector Store',
  type: '@n8n/n8n-nodes-langchain.vectorStoreQdrant',
  typeVersion: 1,
  position: [1820, 680],
  credentials: qdrantCredentials,
};

const respondReviewAction = {
  parameters: {
    jsCode: `const row = $('RAG002 Review Action DB').first().json || {};
return [{ json: {
  status: row.status,
  code: row.code,
  message: row.message,
  documentID: row.documentID,
  contentVersion: row.contentVersion,
  editRevision: row.editRevision,
  reviewStatus: row.reviewStatus,
  usableByChatbot: row.status === 'success' && row.reviewStatus === 'APPROVED'
} }];`,
  },
  id: 'rag002-respond-review-action',
  name: 'RAG002 Respond Review Action',
  type: 'n8n-nodes-base.code',
  typeVersion: 2,
  position: [2070, 760],
};

const ifXlsx = {
  parameters: { conditions: { string: [{ value1: '={{ $json.ext }}', operation: 'equal', value2: 'xlsx' }] } },
  id: 'rag002-if-xlsx',
  name: 'RAG002 If XLSX',
  type: 'n8n-nodes-base.if',
  typeVersion: 1,
  position: [1850, 120],
};

const extractXlsx = {
  parameters: { operation: 'xlsx', binaryPropertyName: 'file', options: { headerRow: false, readAsString: true } },
  id: 'rag002-extract-xlsx',
  name: 'RAG002 Extract XLSX',
  type: 'n8n-nodes-base.extractFromFile',
  typeVersion: 1.1,
  position: [2070, 20],
};

const normalizeXlsx = {
  parameters: {
    jsCode: `let fullText = '';
for (const item of $input.all()) {
  const line = Object.values(item.json || {}).filter((value) => value !== null && value !== undefined && String(value).trim() !== '').join(' | ');
  if (line.trim()) fullText += line + '\n';
}
const source = $('RAG001 Check Scan Result').first().json;
return [{ json: { ...source, extractionMethod: 'XLSX_TEXT', extractionStatus: fullText.trim() ? 'READY' : 'ERROR', confidence: null, extractedContent: fullText.trim() } }];`,
  },
  id: 'rag002-normalize-xlsx',
  name: 'RAG002 Normalize XLSX',
  type: 'n8n-nodes-base.code',
  typeVersion: 2,
  position: [2290, 20],
};

const ifPdf = {
  parameters: { conditions: { string: [{ value1: '={{ $json.ext }}', operation: 'equal', value2: 'pdf' }] } },
  id: 'rag002-if-pdf',
  name: 'RAG002 If PDF',
  type: 'n8n-nodes-base.if',
  typeVersion: 1,
  position: [2070, 220],
};

const extractPdf = {
  parameters: { operation: 'pdf', binaryPropertyName: 'file', options: { joinPages: true, keepSource: 'json', maxPages: 0 } },
  id: 'rag002-extract-pdf',
  name: 'RAG002 Extract PDF',
  type: 'n8n-nodes-base.extractFromFile',
  typeVersion: 1.1,
  position: [2290, 160],
  onError: 'continueRegularOutput',
};

const normalizePdf = {
  parameters: {
    jsCode: `const extracted = $input.first().json || {};
const source = $('RAG001 Check Scan Result').first().json;
const content = Array.isArray(extracted.text) ? extracted.text.join('\n\n') : String(extracted.text || '');
return [{ json: { ...source, extractionMethod: 'PDF_TEXT', extractionStatus: content.trim() ? 'READY' : 'ERROR', confidence: null, extractedContent: content.trim() } }];`,
  },
  id: 'rag002-normalize-pdf',
  name: 'RAG002 Normalize PDF',
  type: 'n8n-nodes-base.code',
  typeVersion: 2,
  position: [2510, 160],
};

const prepVision = {
  parameters: {
    jsCode: `const item = $input.first();
const buffer = await this.helpers.getBinaryDataBuffer(0, 'file');
const mimeType = item.binary.file.mimeType || 'image/png';
return [{ json: {
  model: 'openai/gpt-4o-mini',
  messages: [
    { role: 'system', content: 'Bạn là công cụ OCR. Trích xuất nguyên văn toàn bộ chữ trong ảnh, giữ thứ tự đọc, không tóm tắt, không thêm nội dung. Chỉ trả về văn bản thuần.' },
    { role: 'user', content: [
      { type: 'text', text: 'Trích xuất nguyên văn nội dung trong ảnh này.' },
      { type: 'image_url', image_url: { url: 'data:' + mimeType + ';base64,' + buffer.toString('base64') } }
    ] }
  ]
} }];`,
  },
  id: 'rag002-prep-vision-ocr',
  name: 'RAG002 Prep Vision OCR',
  type: 'n8n-nodes-base.code',
  typeVersion: 2,
  position: [2290, 320],
};

const visionOcr = {
  parameters: {
    authentication: 'predefinedCredentialType',
    nodeCredentialType: 'openAiApi',
    method: 'POST',
    url: "={{ $env.LLM_API_BASE ? $env.LLM_API_BASE : 'https://openrouter.ai/api/v1' }}/chat/completions",
    sendBody: true,
    specifyBody: 'json',
    jsonBody: '={{ $json }}',
  },
  id: 'rag002-vision-ocr',
  name: 'RAG002 Vision OCR',
  type: 'n8n-nodes-base.httpRequest',
  typeVersion: 4,
  position: [2510, 320],
  credentials: nodeOf('OpenAI Vision OCR').credentials,
  onError: 'continueRegularOutput',
};

const normalizeVision = {
  parameters: {
    jsCode: `const result = $input.first().json || {};
const source = $('RAG001 Check Scan Result').first().json;
const content = String(result.choices?.[0]?.message?.content || '').replace(/\`\`\`(?:text)?|\`\`\`/gi, '').trim();
return [{ json: { ...source, extractionMethod: 'VISION_OCR', extractionStatus: content ? 'READY' : 'ERROR', confidence: content ? 'MEDIUM' : null, extractedContent: content } }];`,
  },
  id: 'rag002-normalize-vision',
  name: 'RAG002 Normalize Vision',
  type: 'n8n-nodes-base.code',
  typeVersion: 2,
  position: [2730, 320],
};

const saveOcrDraft = sqlNode('rag002-save-ocr-draft', 'RAG002 Save OCR Draft', `DECLARE @DocumentID UNIQUEIDENTIFIER=TRY_CONVERT(UNIQUEIDENTIFIER,'{{ $json.documentID }}');
DECLARE @Method VARCHAR(30)='{{ $json.extractionMethod }}';
DECLARE @Status VARCHAR(20)='{{ $json.extractionStatus }}';
DECLARE @Confidence VARCHAR(20)=NULLIF('{{ $json.confidence || '' }}','');
DECLARE @Content NVARCHAR(MAX)=N'{{ $json.extractedContent.replace(/'/g, "''") }}';
DECLARE @Sha256 CHAR(64)=CASE WHEN LEN(@Content)>0 THEN CONVERT(CHAR(64),HASHBYTES('SHA2_256',CONVERT(VARBINARY(MAX),@Content)),2) ELSE NULL END;
INSERT dbo.AI_RagDocumentContentTbl
  (DocumentID,ContentVersion,ExtractedContent,ExtractionMethod,ExtractionStatus,Confidence,ExtractedAt,ContentSha256Hex)
VALUES
  (@DocumentID,1,NULLIF(@Content,N''),@Method,@Status,@Confidence,SYSUTCDATETIME(),@Sha256);
SELECT
  'success' AS status,
  CASE WHEN @Status='READY' THEN 'OCR_DRAFT_READY' ELSE 'OCR_DRAFT_ERROR' END AS code,
  CONVERT(VARCHAR(36),@DocumentID) AS documentID,
  @Status AS extractionStatus,
  @Method AS extractionMethod,
  'PENDING_REVIEW' AS reviewStatus,
  CAST(0 AS BIT) AS usableByChatbot;`, [2950, 180]);

const reattachCleanFile = {
  parameters: {
    jsCode: `const metadata = $input.first().json || {};
const scan = $('RAG001 Check Scan Result').first();
const original = $('Check Auth & Format').first();
return [{ json: { ...scan.json, ...metadata }, binary: original.binary }];`,
  },
  id: 'rag002-reattach-clean-file',
  name: 'RAG002 Reattach Clean File',
  type: 'n8n-nodes-base.code',
  typeVersion: 2,
  position: [1170, 20],
};

const respondOcrDraft = {
  parameters: {
    jsCode: `const row = $input.first().json || {};
return [{ json: {
  status: row.status,
  code: row.code,
  message: row.extractionStatus === 'READY'
    ? 'File đã quét an toàn, bóc tách thành bản nháp và đưa vào hàng đợi duyệt.'
    : 'File đã quét an toàn nhưng chưa bóc tách được nội dung. Cần kiểm tra thủ công.',
  documentID: row.documentID,
  malwareScanStatus: 'CLEAN',
  extractionStatus: row.extractionStatus,
  extractionMethod: row.extractionMethod,
  reviewStatus: row.reviewStatus,
  usableByChatbot: false
} }];`,
  },
  id: 'rag002-respond-ocr-draft',
  name: 'RAG002 Respond OCR Draft',
  type: 'n8n-nodes-base.code',
  typeVersion: 2,
  position: [3170, 180],
};

workflow.nodes.push(
  ifReviewOperation,
  ifReviewValid,
  routeReviewOperation,
  listReviews,
  reviewDetail,
  reviewAction,
  ifApprovalReady,
  prepareApproved,
  approvedLoader,
  approvedEmbeddings,
  approvedVector,
  respondReviewAction,
  ifXlsx,
  extractXlsx,
  normalizeXlsx,
  ifPdf,
  extractPdf,
  normalizePdf,
  prepVision,
  visionOcr,
  normalizeVision,
  saveOcrDraft,
  respondOcrDraft,
  reattachCleanFile,
);

replaceMain('Check Auth & Format', 'RAG002 If Review Operation');
workflow.connections['RAG002 If Review Operation'] = { main: [
  [mainEdge('RAG002 If Review Valid')],
  [mainEdge('If Admin & Has File')],
] };
workflow.connections['RAG002 If Review Valid'] = { main: [
  [mainEdge('RAG002 Route Review Operation')],
  [mainEdge('Respond Error')],
] };
workflow.connections['RAG002 Route Review Operation'] = { main: [
  [mainEdge('RAG002 Review List')],
  [mainEdge('RAG002 Review Detail')],
  [mainEdge('RAG002 Review Action DB')],
  [mainEdge('RAG002 Review Action DB')],
  [mainEdge('RAG002 Review Action DB')],
  [mainEdge('Respond Error')],
] };
replaceMain('RAG002 Review Action DB', 'RAG002 If Approval Ready');
workflow.connections['RAG002 If Approval Ready'] = { main: [
  [mainEdge('RAG002 Prepare Approved Document')],
  [mainEdge('RAG002 Respond Review Action')],
] };
replaceMain('RAG002 Prepare Approved Document', 'RAG002 Approved Document Loader');
workflow.connections['RAG002 Approved Document Loader'] = { main: [[mainEdge('RAG002 Approved Vector Store')]], ai_document: [[{ node: 'RAG002 Approved Vector Store', type: 'ai_document', index: 0 }]] };
replaceMain('RAG002 Approved Vector Store', 'RAG002 Respond Review Action');
workflow.connections['RAG002 Approved Embeddings'] = { ai_embedding: [[{ node: 'RAG002 Approved Vector Store', type: 'ai_embedding', index: 0 }]] };
workflow.connections['Text Splitter'] = {
  ai_textSplitter: [[
    { node: 'RAG002 Approved Document Loader', type: 'ai_textSplitter', index: 0 },
  ]],
};

replaceMain('RAG001 Save Quarantine Metadata', 'RAG002 If XLSX');
replaceMain('RAG001 Save Quarantine Metadata', 'RAG002 Reattach Clean File');
replaceMain('RAG002 Reattach Clean File', 'RAG002 If XLSX');
workflow.connections['RAG002 If XLSX'] = { main: [
  [mainEdge('RAG002 Extract XLSX')],
  [mainEdge('RAG002 If PDF')],
] };
replaceMain('RAG002 Extract XLSX', 'RAG002 Normalize XLSX');
workflow.connections['RAG002 If PDF'] = { main: [
  [mainEdge('RAG002 Extract PDF')],
  [mainEdge('RAG002 Prep Vision OCR')],
] };
replaceMain('RAG002 Extract PDF', 'RAG002 Normalize PDF');
replaceMain('RAG002 Prep Vision OCR', 'RAG002 Vision OCR');
replaceMain('RAG002 Vision OCR', 'RAG002 Normalize Vision');
replaceMain('RAG002 Normalize XLSX', 'RAG002 Save OCR Draft');
replaceMain('RAG002 Normalize PDF', 'RAG002 Save OCR Draft');
replaceMain('RAG002 Normalize Vision', 'RAG002 Save OCR Draft');
replaceMain('RAG002 Save OCR Draft', 'RAG002 Respond OCR Draft');

fs.writeFileSync(workflowPath, JSON.stringify(workflow, null, 2) + '\n');
console.log(JSON.stringify({
  task: 'RAG-002-N8N-SOURCE',
  status: 'UPDATED',
  nodes: workflow.nodes.length,
  sha256: crypto.createHash('sha256').update(JSON.stringify(workflow)).digest('hex'),
}, null, 2));
