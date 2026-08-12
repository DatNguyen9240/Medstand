'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const root = path.resolve(__dirname, '..');
const uploadPath = path.join(root, 'n8n/AI_Core/AI_Upload_Reader.json');
const queryPath = path.join(root, 'n8n/AI_Core/AI_RAG_Query.json');

const upload = JSON.parse(fs.readFileSync(uploadPath, 'utf8'));
const query = JSON.parse(fs.readFileSync(queryPath, 'utf8'));
const SCRIPT_VERSION = '1';

function nodeOf(workflow, name) {
  const node = workflow.nodes.find((candidate) => candidate.name === name);
  if (!node) throw new Error(`Không tìm thấy node: ${name}`);
  return node;
}

function replaceMainConnection(workflow, from, node) {
  workflow.connections[from] = { main: [[{ node, type: 'main', index: 0 }]] };
}

nodeOf(upload, 'Check Auth & Format').parameters.jsCode = `const input = $input.first();
const body = input.json.body || {};
const headers = input.json.headers || {};
const expectedAdminKey = String($env.ADMIN_UPLOAD_KEY || '').trim();
const apiKey = String(headers['x-admin-key'] || headers['X-Admin-Key'] || body.adminKey || '').trim();
if (!expectedAdminKey) throw new Error('CONFIG_ERROR: ADMIN_UPLOAD_KEY is not configured.');
if (apiKey !== expectedAdminKey) throw new Error('SECURITY_ALERT: Truy cập trái phép.');
if (!input.binary || !input.binary.file) return [{ json: { passes: false, code: 'EMPTY_FILE', message: 'File rỗng, vui lòng chọn file khác.' } }];

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

if (code) return [{ json: { passes: false, status: 'error', code, message } }];
const documentID = globalThis.crypto.randomUUID();
return [{ json: {
  passes: true,
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

nodeOf(upload, 'Respond Error').parameters.jsCode = `const input = $input.first().json || {};
return [{ json: { status: 'error', code: input.code || 'UPLOAD_REJECTED', message: input.message || 'File không đạt điều kiện an toàn để tải lên.' } }];`;

const quarantineNode = {
  parameters: {
    operation: 'executeQuery',
    query: `DECLARE @DocumentID UNIQUEIDENTIFIER='{{ $json.documentID }}';
DECLARE @OriginalFileName NVARCHAR(260)=N'{{ $json.originalFileName.replace(/'/g, "''") }}';
DECLARE @SafeFileName VARCHAR(80)='{{ $json.safeFileName.replace(/'/g, "''") }}';
DECLARE @Ext VARCHAR(10)='{{ $json.ext.replace(/'/g, "''") }}';
DECLARE @DeclaredMime VARCHAR(150)='{{ $json.declaredMimeType.replace(/'/g, "''") }}';
DECLARE @DetectedMime VARCHAR(150)='{{ $json.detectedMimeType.replace(/'/g, "''") }}';
DECLARE @FileSize BIGINT={{ $json.fileSizeBytes }};
DECLARE @Sha256 CHAR(64)='{{ $json.sha256Hex }}';
DECLARE @Title NVARCHAR(300)=N'{{ $json.title.replace(/'/g, "''") }}';
DECLARE @SourceType VARCHAR(30)='{{ $json.sourceType }}';
DECLARE @SourceReference NVARCHAR(500)=N'{{ $json.sourceReference.replace(/'/g, "''") }}';
DECLARE @UploadedBy VARCHAR(100)='{{ $json.uploadedBy.replace(/'/g, "''") }}';
DECLARE @Scanner NVARCHAR(100)=N'{{ $json.malwareScanner.replace(/'/g, "''") }}';
DECLARE @RequestID VARCHAR(100)=NULLIF('{{ ($json.requestID || '').replace(/'/g, "''") }}','');
DECLARE @EffectiveTo DATETIME2(0)=TRY_CONVERT(DATETIME2(0),NULLIF('{{ $json.expiryDate }}','never'));

INSERT dbo.AI_RagDocumentTbl
  (DocumentID,OriginalFileName,SafeFileName,FileExtension,DeclaredMimeType,DetectedMimeType,FileSizeBytes,Sha256Hex,Title,SourceType,SourceReference,SourceChannel,UploadedBy,MalwareScanStatus,MalwareScanner,MalwareScannedAt,ReviewStatus,EffectiveTo,RequestID)
VALUES
  (@DocumentID,@OriginalFileName,@SafeFileName,@Ext,@DeclaredMime,@DetectedMime,@FileSize,@Sha256,@Title,@SourceType,@SourceReference,'RAG_ADMIN',@UploadedBy,'CLEAN',@Scanner,SYSUTCDATETIME(),'PENDING_REVIEW',@EffectiveTo,@RequestID);

SELECT CONVERT(VARCHAR(36),@DocumentID) AS DocumentID,'PENDING_REVIEW' AS ReviewStatus,'CLEAN' AS MalwareScanStatus;`,
  },
  id: 'rag001-save-quarantine',
  name: 'RAG001 Save Quarantine Metadata',
  type: 'n8n-nodes-base.microsoftSql',
  typeVersion: 1,
  position: [650, 180],
  credentials: nodeOf(upload, 'Save OCR to DB').credentials,
};

const responseNode = {
  parameters: {
    jsCode: `const row = $input.first().json || {};
return [{ json: {
  status: 'success',
  code: 'QUARANTINED_PENDING_REVIEW',
  message: 'File đã qua kiểm tra đầu vào và được lưu metadata ở hàng đợi kiểm duyệt. Chatbot chưa sử dụng tài liệu này.',
  documentID: row.DocumentID,
  malwareScanStatus: row.MalwareScanStatus,
  reviewStatus: row.ReviewStatus,
  usableByChatbot: false
} }];`,
  },
  id: 'rag001-respond-quarantine',
  name: 'RAG001 Respond Quarantined',
  type: 'n8n-nodes-base.code',
  typeVersion: 2,
  position: [900, 180],
};

upload.nodes = upload.nodes.filter((node) => !['RAG001 Save Quarantine Metadata', 'RAG001 Respond Quarantined'].includes(node.name));
const writeQuarantineNode = {
  parameters: {
    operation: 'write',
    fileName: "={{ $env.RAG_QUARANTINE_DIR + '/' + $json.safeFileName }}",
    dataPropertyName: 'file',
    options: { append: false },
  },
  id: 'rag001-write-quarantine',
  name: 'RAG001 Write Quarantine Binary',
  type: 'n8n-nodes-base.readWriteFile',
  typeVersion: 1.1,
  position: [650, 180],
};
const scanNode = {
  parameters: {
    executeOnce: true,
    command: "powershell.exe -NoProfile -NonInteractive -ExecutionPolicy Bypass -File \"={{ $env.RAG_SCAN_SCRIPT }}\" -LiteralPath \"={{ $env.RAG_QUARANTINE_DIR + '/' + $json.safeFileName }}\"",
  },
  id: 'rag001-scan-defender',
  name: 'RAG001 Scan with Defender',
  type: 'n8n-nodes-base.executeCommand',
  typeVersion: 1,
  position: [900, 180],
};
const checkScanNode = {
  parameters: {
    jsCode: `const original = $('Check Auth & Format').first().json;
let scan = {};
try { scan = JSON.parse($json.stdout || '{}'); } catch (_) { scan = { status: 'SCAN_ERROR' }; }
const status = String(scan.status || '').toUpperCase();
const code = status === 'INFECTED' ? 'MALWARE_DETECTED' : status === 'CLEAN' ? null : 'MALWARE_SCAN_UNAVAILABLE';
return [{ json: { ...original, sha256Hex: scan.sha256Hex || '', malwareScanStatus: status || 'SCAN_ERROR', malwareScanner: scan.scanner || '', malwareScannedAt: new Date().toISOString(), passes: status === 'CLEAN', code, message: code === 'MALWARE_DETECTED' ? 'File bị từ chối vì phát hiện nguy cơ malware.' : code ? 'Chưa thể quét an toàn; file chưa được sử dụng và cần thử lại sau.' : '' } }];`,
  },
  id: 'rag001-check-scan',
  name: 'RAG001 Check Scan Result',
  type: 'n8n-nodes-base.code',
  typeVersion: 2,
  position: [1150, 180],
};
const ifScanCleanNode = {
  parameters: { conditions: { boolean: [{ value1: '={{ $json.passes }}', value2: true }] } },
  id: 'rag001-if-clean',
  name: 'RAG001 If Scan Clean',
  type: 'n8n-nodes-base.if',
  typeVersion: 1,
  position: [1400, 180],
};
upload.nodes.push(writeQuarantineNode, scanNode, checkScanNode, ifScanCleanNode, quarantineNode, responseNode);
upload.connections['If Admin & Has File'] = {
  main: [
    [{ node: 'RAG001 Write Quarantine Binary', type: 'main', index: 0 }],
    [{ node: 'Respond Error', type: 'main', index: 0 }],
  ],
};
replaceMainConnection(upload, 'RAG001 Write Quarantine Binary', 'RAG001 Scan with Defender');
replaceMainConnection(upload, 'RAG001 Scan with Defender', 'RAG001 Check Scan Result');
replaceMainConnection(upload, 'RAG001 Check Scan Result', 'RAG001 If Scan Clean');
upload.connections['RAG001 If Scan Clean'] = { main: [
  [{ node: 'RAG001 Save Quarantine Metadata', type: 'main', index: 0 }],
  [{ node: 'Respond Error', type: 'main', index: 0 }],
] };
replaceMainConnection(upload, 'RAG001 Save Quarantine Metadata', 'RAG001 Respond Quarantined');

nodeOf(query, 'Prep Qdrant Body').parameters.jsCode = `const vector = $input.first().json.data[0].embedding;
return [{ json: {
  vector,
  limit: 100,
  with_payload: true,
  filter: {
    must: [
      { key: 'metadata.reviewStatus', match: { value: 'APPROVED' } },
      { key: 'metadata.malwareScanStatus', match: { value: 'CLEAN' } }
    ]
  }
} }];`;

fs.writeFileSync(uploadPath, JSON.stringify(upload, null, 2) + '\n');
fs.writeFileSync(queryPath, JSON.stringify(query, null, 2) + '\n');
console.log(JSON.stringify({ task: 'RAG-001-N8N-SOURCE', status: 'UPDATED', scriptVersion: SCRIPT_VERSION, uploadNodes: upload.nodes.length, queryNodes: query.nodes.length, uploadSha256: crypto.createHash('sha256').update(JSON.stringify(upload)).digest('hex'), querySha256: crypto.createHash('sha256').update(JSON.stringify(query)).digest('hex') }, null, 2));
