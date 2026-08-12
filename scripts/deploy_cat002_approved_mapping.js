'use strict';

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const sql = require('mssql');

const root = path.resolve(__dirname, '..');
const mappingPath = path.join(root, 'assets', 'product-catalog', 'approved-mapping.json');
const approvedBy = 'MEDSTAND_OWNER';
const sourcePrefix = 'assets/product-catalog/approved-mapping.json#';

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

function loadMappings() {
  const mappings = JSON.parse(fs.readFileSync(mappingPath, 'utf8').replace(/^\uFEFF/, ''));
  const itemIds = new Set();
  const imagePaths = new Set();
  for (const mapping of mappings) {
    if (mapping.itemId !== mapping.embeddedProductCode) throw new Error(`Mã in trên ảnh không khớp ${mapping.itemId}.`);
    if (itemIds.has(mapping.itemId)) throw new Error(`Trùng ItemID ${mapping.itemId}.`);
    if (imagePaths.has(mapping.imagePath)) throw new Error(`Trùng ImagePath ${mapping.imagePath}.`);
    const filePath = path.join(root, mapping.imagePath);
    if (!fs.existsSync(filePath)) throw new Error(`Thiếu ảnh công bố ${mapping.imagePath}.`);
    const fileSizeBytes = fs.statSync(filePath).size;
    if (fileSizeBytes < 1 || fileSizeBytes > 2097152) throw new Error(`Ảnh ${mapping.imagePath} không đạt giới hạn 2 MB.`);
    mapping.fileSizeBytes = fileSizeBytes;
    mapping.contentSha256 = crypto.createHash('sha256').update(fs.readFileSync(filePath)).digest('hex');
    itemIds.add(mapping.itemId);
    imagePaths.add(mapping.imagePath);
  }
  return mappings;
}

async function main() {
  const apply = process.argv.includes('--apply');
  const mappings = loadMappings();
  if (!apply) {
    console.log(JSON.stringify({ task: 'CAT-002-APPROVED-MAPPING', status: 'PREFLIGHT_PASS', count: mappings.length }, null, 2));
    return;
  }

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
  if (databaseName !== 'medtest') throw new Error('CAT-002 chỉ được deploy bằng script này trên medtest.');

  const transaction = new sql.Transaction(pool);
  await transaction.begin();
  try {
    for (const mapping of mappings) {
      const item = (await new sql.Request(transaction)
        .input('ItemID', sql.VarChar(50), mapping.itemId)
        .query('SELECT ItemID,ItemName FROM dbo.CF_ItemTbl WHERE ItemID=@ItemID AND COALESCE(isDisable,0)=0;')).recordset[0];
      if (!item || item.ItemName !== mapping.itemName) throw new Error(`ItemID/ItemName không khớp ${mapping.itemId}.`);

      const existing = (await new sql.Request(transaction)
        .input('ItemID', sql.VarChar(50), mapping.itemId)
        .query("SELECT ImagePath,ContentSha256,Status FROM dbo.AI_ProductImageMapTbl WHERE ItemID=@ItemID AND ImageRole='PRIMARY' AND DisplayOrder=1;")).recordset[0];
      if (existing) {
        const exact = existing.ImagePath === mapping.imagePath
          && existing.ContentSha256 === mapping.contentSha256
          && existing.Status === 'APPROVED';
        if (!exact) throw new Error(`Mapping hiện có của ${mapping.itemId} khác dữ liệu được duyệt; dừng để tránh ghi đè.`);
        continue;
      }

      await new sql.Request(transaction)
        .input('ItemID', sql.VarChar(50), mapping.itemId)
        .input('ImagePath', sql.NVarChar(500), mapping.imagePath)
        .input('MediaType', sql.VarChar(50), mapping.mediaType)
        .input('FileSizeBytes', sql.BigInt, mapping.fileSizeBytes)
        .input('ContentSha256', sql.Char(64), mapping.contentSha256)
        .input('AltText', sql.NVarChar(300), mapping.altText)
        .input('SourceDocument', sql.NVarChar(500), `${sourcePrefix}${mapping.itemId};embedded=${mapping.embeddedProductCode};source=${mapping.sourcePath}`)
        .input('ApprovedBy', sql.VarChar(50), approvedBy)
        .query(`
          INSERT dbo.AI_ProductImageMapTbl
            (ItemID,ImageRole,DisplayOrder,ImagePath,MediaType,FileSizeBytes,ContentSha256,AltText,SourceDocument,Status,EffectiveFrom,CreatedBy,ApprovedBy,ApprovedAt)
          VALUES
            (@ItemID,'PRIMARY',1,@ImagePath,@MediaType,@FileSizeBytes,@ContentSha256,@AltText,@SourceDocument,'APPROVED',SYSUTCDATETIME(),@ApprovedBy,@ApprovedBy,SYSUTCDATETIME());
        `);
    }
    await transaction.commit();
  } catch (error) {
    await transaction.rollback();
    throw error;
  }

  const verified = [];
  for (const mapping of mappings) {
    const response = await pool.request()
      .input('Username', sql.VarChar(50), 'QLBH013.MED')
      .input('ItemID', sql.VarChar(50), mapping.itemId)
      .execute('dbo.API_AnhSanPham_AI');
    const row = response.recordset[0];
    verified.push({
      itemId: mapping.itemId,
      imagePath: row?.ImagePath,
      imageStatus: row?.ImageStatus,
      isDefaultImage: row?.IsDefaultImage,
      pass: row?.ImagePath === mapping.imagePath && row?.ImageStatus === 'APPROVED' && row?.IsDefaultImage === false,
    });
  }
  const conflict = (await pool.request().query(`
    SELECT COUNT_BIG(*) AS MappingCount
    FROM dbo.AI_ProductImageMapTbl
    WHERE ItemID='H010' AND SourceDocument LIKE '${sourcePrefix.replace(/'/g, "''")}%';
  `)).recordset[0];
  await pool.close();

  const pass = verified.every((row) => row.pass) && Number(conflict.MappingCount) === 0;
  console.log(JSON.stringify({
    task: 'CAT-002-APPROVED-MAPPING',
    status: pass ? 'PASS' : 'FAIL',
    database: databaseName,
    approvedBy,
    persistedMappings: verified.length,
    verified,
    conflictingImageH010Mapped: Number(conflict.MappingCount) > 0,
    fixtureRowsPersisted: 0,
  }, null, 2));
  if (!pass) process.exitCode = 1;
}

main().catch((error) => {
  console.error(JSON.stringify({ task: 'CAT-002-APPROVED-MAPPING', status: 'ERROR', error: error.message }, null, 2));
  process.exitCode = 1;
});
