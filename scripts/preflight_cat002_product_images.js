'use strict';

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const sql = fs.readFileSync(path.join(root, 'sql', 'CAT-002_Product_Image_Mapping_AI.sql'), 'utf8');
const contract = fs.readFileSync(path.join(root, 'docs', 'CAT-002_CONTRACT_MAPPING_ANH_SAN_PHAM_AI_2026-08-10.md'), 'utf8');
const manifest = JSON.parse(fs.readFileSync(path.join(root, 'assets', 'product-catalog', 'manifest.json'), 'utf8').replace(/^\uFEFF/, ''));
const defaultImage = path.join(root, 'images', 'product-catalog', 'default-product.svg');
const approvedMappings = JSON.parse(fs.readFileSync(path.join(root, 'assets', 'product-catalog', 'approved-mapping.json'), 'utf8').replace(/^\uFEFF/, ''));

const missingFiles = manifest.filter((item) => !fs.existsSync(path.join(root, item.localPath)));
const duplicatePaths = manifest.filter((item, index, items) => items.findIndex((candidate) => candidate.localPath.toLowerCase() === item.localPath.toLowerCase()) !== index);
const defaultHash = fs.existsSync(defaultImage) ? crypto.createHash('sha256').update(fs.readFileSync(defaultImage)).digest('hex') : '';
const approvedFilesValid = approvedMappings.every((mapping) => {
  const imagePath = path.join(root, mapping.imagePath);
  if (!fs.existsSync(imagePath)) return false;
  const size = fs.statSync(imagePath).size;
  const hash = crypto.createHash('sha256').update(fs.readFileSync(imagePath)).digest('hex');
  return size >= 1 && size <= 2097152 && /^[0-9a-f]{64}$/.test(hash);
});

const checks = [
  ['MANIFEST_HAS_103_FILES', manifest.length === 103 && missingFiles.length === 0],
  ['MANIFEST_HAS_NO_DUPLICATE_PATH', duplicatePaths.length === 0],
  ['MANIFEST_NOT_USED_AS_ITEM_KEY', manifest.every((item) => !item.ItemID && !item.itemId)],
  ['DEFAULT_IMAGE_EXISTS', fs.existsSync(defaultImage) && defaultHash.length === 64],
  ['APPROVED_MAPPING_HAS_SIX_VERIFIED_ITEMS', approvedMappings.length === 6 && approvedMappings.every((mapping) => mapping.itemId === mapping.embeddedProductCode)],
  ['APPROVED_MAPPING_UNIQUE_KEYS', new Set(approvedMappings.map((mapping) => mapping.itemId)).size === approvedMappings.length && new Set(approvedMappings.map((mapping) => mapping.imagePath)).size === approvedMappings.length],
  ['APPROVED_FILES_WITHIN_LIMIT', approvedFilesValid],
  ['NEW_MAPPING_TABLE', sql.includes('AI_ProductImageMapTbl')],
  ['APPROVED_IMAGE_VIEW', sql.includes('AI_ApprovedProductImageVw')],
  ['IMAGE_API_SUFFIX', sql.includes('API_AnhSanPham_AI')],
  ['ITEMID_BUSINESS_KEY', sql.includes('UQ_AI_ProductImageMap_ItemRoleOrder')],
  ['CONTENT_HASH_REQUIRED', sql.includes('ContentSha256 CHAR(64) NOT NULL')],
  ['FORMAT_ALLOWLIST', sql.includes("MediaType IN ('image/png', 'image/jpeg', 'image/webp')")],
  ['TWO_MB_LIMIT', sql.includes('FileSizeBytes BETWEEN 1 AND 2097152')],
  ['SAFE_LOCAL_PATH', sql.includes("ImagePath LIKE N'images/product-catalog/%'") && sql.includes("ImagePath NOT LIKE N'%..%'")],
  ['DEFAULT_IS_EXPLICIT', sql.includes('default-product.svg') && sql.includes('IsDefaultImage')],
  ['NO_ERP_MUTATION', !/(INSERT\s+INTO|UPDATE|DELETE\s+FROM|MERGE)\s+dbo\.(CF_|AR_|IV_)/i.test(sql)],
  ['NO_FILENAME_KEY', contract.includes('tên file không phải khóa duy nhất') && !/FileName\s+.*(?:PRIMARY KEY|UNIQUE)/i.test(sql)],
];

const failed = checks.filter(([, pass]) => !pass);
for (const [name, pass] of checks) console.log(`${pass ? 'PASS' : 'FAIL'} ${name}`);
console.log(`CAT-002 preflight: ${failed.length ? 'FAIL' : 'PASS'} ${checks.length - failed.length}/${checks.length}`);
if (failed.length) process.exitCode = 1;
