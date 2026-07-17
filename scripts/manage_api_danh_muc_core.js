const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const sql = require('mssql');
const { testDbConfig } = require('./lib/test-db-config');

const ROOT = path.resolve(__dirname, '..');
const SOURCE_PATH = path.join(ROOT, 'sql', 'Module common - API_DanhMuc_AI.sql');
const VERIFY_PATH = path.join(ROOT, 'sql', 'Verify_API_DanhMuc_Scope_AI.sql');

function normalizeDefinition(value) {
  return value
    .replace(/\r\n/g, '\n')
    .replace(/[ \t]+$/gm, '')
    .replace(/^\s*CREATE\s+(?:OR\s+ALTER\s+)?PROCEDURE/i, 'CREATE PROCEDURE')
    .trim();
}

function checksum(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

async function inspect(pool) {
  const result = await pool.request().query(`
    SELECT OBJECT_DEFINITION(OBJECT_ID(N'dbo.API_DanhMuc_Core_AI')) AS definition;

    SELECT TABLE_NAME, COLUMN_NAME, DATA_TYPE
    FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_NAME IN ('SY_User', 'AR_OrderTbl', 'CF_ObjectTbl')
      AND COLUMN_NAME IN (
        'UserName', 'UserGroupID', 'EmployeeID', 'ManagerID', 'CeoID', 'BranchID',
        'Disable', 'ObjectID', 'isEmployee', 'isDisable', 'DocumentID'
      )
    ORDER BY TABLE_NAME, ORDINAL_POSITION;
  `);

  process.stdout.write(JSON.stringify({
    definition: result.recordsets[0][0].definition,
    columns: result.recordsets[1],
  }));
}

async function deploy(pool) {
  const source = fs.readFileSync(SOURCE_PATH, 'utf8').replace(/^\uFEFF/, '');
  if (!/^\s*CREATE\s+OR\s+ALTER\s+PROCEDURE\s+\[dbo\]\.\[API_DanhMuc_Core_AI\]/i.test(source)) {
    throw new Error('Refusing to deploy: source is not API_DanhMuc_Core_AI.');
  }
  if (/^\s*GO\s*$/im.test(source)) {
    throw new Error('Refusing to deploy: source must be a single SQL batch.');
  }

  await pool.request().batch(source);
  const verification = await pool.request().query(`
    SELECT
      OBJECT_NAME(object_id) AS procedureName,
      create_date AS createdAt,
      modify_date AS modifiedAt,
      LEN(OBJECT_DEFINITION(object_id)) AS definitionLength
    FROM sys.procedures
    WHERE object_id = OBJECT_ID(N'dbo.API_DanhMuc_Core_AI');
  `);
  process.stdout.write(JSON.stringify(verification.recordset[0]));
}

async function verify(pool) {
  const local = normalizeDefinition(fs.readFileSync(SOURCE_PATH, 'utf8').replace(/^\uFEFF/, ''));
  const deployedResult = await pool.request().query(
    "SELECT OBJECT_DEFINITION(OBJECT_ID(N'dbo.API_DanhMuc_Core_AI')) AS definition;",
  );
  const deployed = normalizeDefinition(deployedResult.recordset[0].definition || '');
  if (checksum(local) !== checksum(deployed)) {
    throw new Error(`Deployed Core differs from local source (${checksum(deployed)} != ${checksum(local)}).`);
  }

  const verificationSql = fs.readFileSync(VERIFY_PATH, 'utf8').replace(/^\uFEFF/, '');
  const result = await pool.request().batch(verificationSql);
  process.stdout.write(JSON.stringify({
    sourceChecksum: checksum(local),
    verification: result.recordsets[result.recordsets.length - 1]?.[0] || null,
  }));
}

async function main() {
  const mode = process.argv[2];
  if (!['inspect', 'deploy', 'verify'].includes(mode)) {
    throw new Error('Usage: node scripts/manage_api_danh_muc_core.js <inspect|deploy|verify>');
  }

  const pool = await sql.connect(testDbConfig(ROOT));
  try {
    if (mode === 'inspect') await inspect(pool);
    if (mode === 'deploy') await deploy(pool);
    if (mode === 'verify') await verify(pool);
  } finally {
    await pool.close();
  }
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
