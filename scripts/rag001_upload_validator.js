'use strict';

const crypto = require('crypto');
const path = require('path');

const MAX_FILE_BYTES = 10 * 1024 * 1024;
const SOURCE_TYPES = new Set(['POLICY', 'CATALOG', 'PROMOTION', 'INTERNAL_RULE', 'OTHER']);
const ALLOWED_TYPES = {
  pdf: { detectedMimeType: 'application/pdf', declaredMimeTypes: ['application/pdf'], signature: (buffer) => buffer.subarray(0, 5).equals(Buffer.from('%PDF-')) },
  xlsx: { detectedMimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', declaredMimeTypes: ['application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'], signature: (buffer) => buffer[0] === 0x50 && buffer[1] === 0x4b },
  png: { detectedMimeType: 'image/png', declaredMimeTypes: ['image/png'], signature: (buffer) => buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) },
  jpg: { detectedMimeType: 'image/jpeg', declaredMimeTypes: ['image/jpeg'], signature: (buffer) => buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff },
  jpeg: { detectedMimeType: 'image/jpeg', declaredMimeTypes: ['image/jpeg'], signature: (buffer) => buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff },
};

const ERROR_MESSAGES = {
  EMPTY_FILE: 'File rỗng, vui lòng chọn file khác.',
  FILE_TOO_LARGE: 'File vượt quá giới hạn 10 MB.',
  UNSUPPORTED_FILE_TYPE: 'Chỉ hỗ trợ PDF, XLSX, PNG và JPG/JPEG.',
  FILE_SIGNATURE_MISMATCH: 'Nội dung file không khớp phần mở rộng hoặc MIME.',
  INVALID_SOURCE_METADATA: 'Thiếu tiêu đề, loại nguồn hoặc mô tả nguồn tài liệu.',
  MALWARE_DETECTED: 'File bị từ chối vì phát hiện nguy cơ malware.',
  MALWARE_SCAN_UNAVAILABLE: 'Chưa thể quét an toàn; file chưa được sử dụng và cần thử lại sau.',
};

class RagUploadValidationError extends Error {
  constructor(code) {
    super(ERROR_MESSAGES[code] || code);
    this.name = 'RagUploadValidationError';
    this.code = code;
  }
}

function fail(code) {
  throw new RagUploadValidationError(code);
}

function cleanText(value) {
  return String(value || '').trim();
}

function validateSourceMetadata(metadata) {
  const title = cleanText(metadata && metadata.title);
  const sourceType = cleanText(metadata && metadata.sourceType).toUpperCase();
  const sourceReference = cleanText(metadata && metadata.sourceReference);
  const uploadedBy = cleanText(metadata && metadata.uploadedBy);
  if (!title || !SOURCE_TYPES.has(sourceType) || !sourceReference || !uploadedBy) fail('INVALID_SOURCE_METADATA');
  return { title, sourceType, sourceReference, uploadedBy };
}

function validateMalwareScan(scan) {
  const scannerReady = scan && scan.scannerReady === true;
  const status = cleanText(scan && scan.status).toUpperCase();
  if (!scannerReady || !status || status === 'PENDING' || status === 'SCAN_ERROR') fail('MALWARE_SCAN_UNAVAILABLE');
  if (status === 'INFECTED') fail('MALWARE_DETECTED');
  if (status !== 'CLEAN') fail('MALWARE_SCAN_UNAVAILABLE');
  const scanner = cleanText(scan && scan.scanner);
  if (!scanner) fail('MALWARE_SCAN_UNAVAILABLE');
  return { status, scanner };
}

function validateRagUpload(input) {
  const buffer = Buffer.isBuffer(input && input.buffer) ? input.buffer : Buffer.from(input && input.buffer || []);
  if (!buffer.length) fail('EMPTY_FILE');
  if (buffer.length > MAX_FILE_BYTES) fail('FILE_TOO_LARGE');

  const originalFileName = path.basename(cleanText(input.originalFileName));
  if (!originalFileName || originalFileName !== cleanText(input.originalFileName) || /[\x00-\x1f\x7f]/.test(originalFileName)) fail('UNSUPPORTED_FILE_TYPE');
  const extension = path.extname(originalFileName).slice(1).toLowerCase();
  const type = ALLOWED_TYPES[extension];
  if (!type) fail('UNSUPPORTED_FILE_TYPE');

  const declaredMimeType = cleanText(input.declaredMimeType).toLowerCase();
  if (!type.declaredMimeTypes.includes(declaredMimeType) || !type.signature(buffer)) fail('FILE_SIGNATURE_MISMATCH');

  const source = validateSourceMetadata(input.metadata);
  const malware = validateMalwareScan(input.malwareScan);
  const documentID = cleanText(input.documentID) || crypto.randomUUID();
  const safeExtension = extension === 'jpeg' ? 'jpg' : extension;

  return {
    documentID,
    originalFileName,
    safeFileName: `${documentID}.${safeExtension}`,
    fileExtension: extension,
    declaredMimeType,
    detectedMimeType: type.detectedMimeType,
    fileSizeBytes: buffer.length,
    sha256Hex: crypto.createHash('sha256').update(buffer).digest('hex'),
    ...source,
    sourceChannel: 'RAG_ADMIN',
    malwareScanStatus: malware.status,
    malwareScanner: malware.scanner,
    reviewStatus: 'PENDING_REVIEW',
    publishable: false,
  };
}

module.exports = {
  ALLOWED_TYPES,
  ERROR_MESSAGES,
  MAX_FILE_BYTES,
  RagUploadValidationError,
  validateRagUpload,
};
