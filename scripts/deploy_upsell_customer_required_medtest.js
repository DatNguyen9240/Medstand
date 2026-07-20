'use strict';

const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const sql = require('mssql');
const { testDbConfig } = require('./lib/test-db-config');

const root = path.resolve(__dirname, '..');
const backupDir = process.argv[2] ? path.resolve(process.argv[2]) : '';
const config = testDbConfig(root);
const procedurePath = path.join(root, 'sql', 'Module 5 - API_UpsellGoiY_AI.sql');
const migrationPath = path.join(root, 'sql', 'Migrate_Upsell_Customer_Required_AI.sql');
const testUsers = ['QLBH013.MED', 'NAMDINHB.MED'];
const crossBranchTests = [
  { username: 'QLMD1', customerId: 'NDB001' },
  { username: 'QLBH024.MED', customerId: 'NDB001' },
];

const sha256 = (value) => crypto.createHash('sha256').update(String(value || '')).digest('hex').toUpperCase();
const batches = (source) => source.replace(/^\uFEFF/, '').split(/^\s*GO\s*$/gim).map((item) => item.trim()).filter(Boolean);
const procedureBatch = (source) => {
  const batch = batches(source).find((item) => /CREATE\s+OR\s+ALTER\s+PROCEDURE\s+(?:\[dbo\]\.)?\[?API_UpsellGoiY_AI\]?/i.test(item));
  if (!batch) throw new Error('Cannot find API_UpsellGoiY_AI deployment batch.');
  return batch;
};

function allRows(result) {
  return (result.recordsets || []).flat();
}

function assertMissingCustomer(result, username) {
  const row = allRows(result).find((item) => item && item.Code === 'MISSING_CUSTOMER');
  if (!row || row.Severity !== 'VALIDATION_ERROR') {
    throw new Error(`Missing-customer smoke failed for ${username}.`);
  }
}

function assertOutOfScope(result, username, customerId) {
  const rows = allRows(result);
  const row = rows.find((item) => item && item.Code === 'CUSTOMER_OUT_OF_SCOPE');
  if (!row || row.Severity !== 'OUT_OF_SCOPE') {
    throw new Error(`Cross-branch scope smoke failed for ${username} -> ${customerId}.`);
  }
  if (rows.some((item) => item && (item.ItemID || item.MaSP))) {
    throw new Error(`Cross-branch product data leaked for ${username} -> ${customerId}.`);
  }
}

async function metadataSnapshot(request) {
  const result = await request.query(`
    SELECT d.ApiID, d.ApiCode, d.StoredProcedure, f.*
    FROM dbo.API_Definition d
    LEFT JOIN dbo.API_Field f ON f.ApiID = d.ApiID AND f.FieldCode = '@MaKhachHang'
    WHERE d.ApiCode = '@upsell_goi_y';

    IF OBJECT_ID('dbo.API_Action_Field', 'U') IS NOT NULL
      SELECT af.*
      FROM dbo.API_Action_Field af
      JOIN dbo.API_Field f ON f.FieldID = af.FieldID
      JOIN dbo.API_Definition d ON d.ApiID = f.ApiID
      WHERE d.ApiCode = '@upsell_goi_y' AND f.FieldCode = '@MaKhachHang';

    IF OBJECT_ID('dbo.API_Filter', 'U') IS NOT NULL
      SELECT fl.*
      FROM dbo.API_Filter fl
      JOIN dbo.API_Definition d ON d.ApiID = fl.ApiID
      WHERE d.ApiCode = '@upsell_goi_y' AND fl.FieldCode = '@MaKhachHang';

    IF OBJECT_ID('dbo.API_Metadata_Field_Override', 'U') IS NOT NULL
      SELECT o.*
      FROM dbo.API_Metadata_Field_Override o
      WHERE o.StoredProcedure = 'API_UpsellGoiY_AI' AND o.FieldCode = '@MaKhachHang';
  `);
  return result.recordsets || [];
}

async function smokeUser(pool, username) {
  const transaction = new sql.Transaction(pool);
  await transaction.begin(sql.ISOLATION_LEVEL.READ_COMMITTED);
  try {
    const missing = await new sql.Request(transaction)
      .input('Username', sql.VarChar(50), username)
      .query("EXEC dbo.API_UpsellGoiY_AI @Username=@Username, @MaKhachHang=N'';");
    assertMissingCustomer(missing, username);

    const candidate = await new sql.Request(transaction)
      .input('Username', sql.VarChar(50), username)
      .query(`
        SELECT TOP (1) scoped.ObjectID
        FROM dbo.AR_GetObjectByUserFnc(@Username) scoped
        JOIN dbo.CF_ObjectTbl customer ON customer.ObjectID = scoped.ObjectID
        JOIN dbo.SY_User appUser ON appUser.UserName = @Username AND ISNULL(appUser.Disable, 0) = 0
        WHERE ISNULL(customer.isCustomer, 0) = 1
          AND ISNULL(customer.isDisable, 0) = 0
          AND customer.BranchID = appUser.BranchID
        ORDER BY CASE WHEN EXISTS (
          SELECT 1 FROM dbo.AR_InvoiceTbl invoice
          WHERE invoice.ObjectID = scoped.ObjectID AND invoice.StatusID IN (3, 6, 7, 8)
        ) THEN 0 ELSE 1 END, scoped.ObjectID;
      `);
    const customerId = candidate.recordset[0]?.ObjectID;
    if (!customerId) throw new Error(`No scoped customer fixture found for ${username}.`);

    const valid = await new sql.Request(transaction)
      .input('Username', sql.VarChar(50), username)
      .input('CustomerID', sql.NVarChar(100), customerId)
      .query('EXEC dbo.API_UpsellGoiY_AI @Username=@Username, @MaKhachHang=@CustomerID, @TopN=10;');
    const rows = allRows(valid);
    if (rows.some((item) => item && (item.Code === 'MISSING_CUSTOMER' || /không có quyền|không tìm thấy mã khách hàng/i.test(String(item.Msg || ''))))) {
      throw new Error(`Scoped-customer smoke failed for ${username}.`);
    }

    await transaction.rollback();
    return {
      username,
      missingCustomer: 'PASS',
      scopedCustomer: 'PASS',
      resultRowCount: rows.filter((item) => item && !Object.prototype.hasOwnProperty.call(item, 'MsgType')).length,
    };
  } catch (error) {
    await transaction.rollback();
    throw error;
  }
}

async function smokeCrossBranch(pool, username, customerId) {
  const result = await pool.request()
    .input('Username', sql.VarChar(50), username)
    .input('CustomerID', sql.NVarChar(100), customerId)
    .query('EXEC dbo.API_UpsellGoiY_AI @Username=@Username, @MaKhachHang=@CustomerID, @TopN=10;');
  assertOutOfScope(result, username, customerId);
  return { username, customerId, outOfScope: 'PASS', noProductLeak: true };
}

async function main() {
  if (!/medtest/i.test(config.database)) throw new Error(`Refusing deployment outside medtest: ${config.database}`);
  if (!backupDir || !fs.existsSync(backupDir)) throw new Error('A pre-created backup directory is required.');

  const procedureSource = fs.readFileSync(procedurePath, 'utf8');
  const migrationSource = fs.readFileSync(migrationPath, 'utf8');
  for (const marker of ['MISSING_CUSTOMER', 'Vui lòng chọn khách hàng để gợi ý bán kèm.', 'AR_GetObjectByUserFnc', 'O.BranchID = @SYSBranchID', 'CUSTOMER_OUT_OF_SCOPE', 'OUT_OF_SCOPE', 'BR-UPSELL-V1-DRAFT']) {
    if (!procedureSource.includes(marker)) throw new Error(`Upsell source missing required marker: ${marker}`);
  }
  for (const marker of ["ApiCode = '@upsell_goi_y'", "FieldCode = '@MaKhachHang'", 'DATASOURCE_ID_IN_SCOPE', 'IsRequired = 1']) {
    if (!migrationSource.includes(marker)) throw new Error(`Upsell metadata migration missing required marker: ${marker}`);
  }

  const pool = await sql.connect(config);
  const transaction = new sql.Transaction(pool);
  let started = false;
  try {
    const beforeDefinitionResult = await pool.request().query("SELECT OBJECT_DEFINITION(OBJECT_ID('dbo.API_UpsellGoiY_AI')) AS definition;");
    const beforeDefinition = beforeDefinitionResult.recordset[0]?.definition || '';
    const beforeMetadata = await metadataSnapshot(pool.request());
    fs.writeFileSync(path.join(backupDir, 'upsell-before.json'), JSON.stringify({
      capturedAt: new Date().toISOString(),
      database: config.database,
      procedure: { sha256: sha256(beforeDefinition), definition: beforeDefinition },
      metadata: beforeMetadata,
    }, null, 2), 'utf8');

    await transaction.begin(sql.ISOLATION_LEVEL.READ_COMMITTED);
    started = true;
    await new sql.Request(transaction).batch(procedureBatch(procedureSource));
    for (const batch of batches(migrationSource)) await new sql.Request(transaction).batch(batch);

    const verification = await new sql.Request(transaction).query(`
      SELECT OBJECT_DEFINITION(OBJECT_ID('dbo.API_UpsellGoiY_AI')) AS definition;
      SELECT f.IsRequired, f.SourceOfTruth, f.ValidationRule, f.ControlType, f.DataSourceType, f.DataSourceValue
      FROM dbo.API_Definition d
      JOIN dbo.API_Field f ON f.ApiID = d.ApiID
      WHERE d.ApiCode = '@upsell_goi_y' AND f.FieldCode = '@MaKhachHang';
    `);
    const afterDefinition = verification.recordsets[0]?.[0]?.definition || '';
    const field = verification.recordsets[1]?.[0];
    for (const marker of ['MISSING_CUSTOMER', 'AR_GetObjectByUserFnc', 'O.BranchID = @SYSBranchID', 'CUSTOMER_OUT_OF_SCOPE', 'OUT_OF_SCOPE', 'BR-UPSELL-V1-DRAFT']) {
      if (!afterDefinition.includes(marker)) throw new Error(`Deployed upsell procedure missing marker: ${marker}`);
    }
    if (!field || field.IsRequired !== true || !String(field.ValidationRule || '').includes('DATASOURCE_ID_IN_SCOPE')) {
      throw new Error('Deployed upsell customer metadata is not required/in-scope.');
    }

    await transaction.commit();
    started = false;

    const smoke = [];
    for (const username of testUsers) smoke.push(await smokeUser(pool, username));
    const crossBranchSmoke = [];
    for (const item of crossBranchTests) {
      crossBranchSmoke.push(await smokeCrossBranch(pool, item.username, item.customerId));
    }
    const result = {
      status: 'MEDTEST_UPSELL_CUSTOMER_REQUIRED_PASS',
      scopeGuard: 'PASS',
      deployedAt: new Date().toISOString(),
      database: config.database,
      backupDir,
      beforeSha256: sha256(beforeDefinition),
      afterSha256: sha256(afterDefinition),
      metadata: {
        isRequired: field.IsRequired,
        sourceOfTruth: field.SourceOfTruth,
        validationRule: field.ValidationRule,
      },
      smoke,
      crossBranchSmoke,
    };
    fs.writeFileSync(path.join(backupDir, 'deploy-result.json'), JSON.stringify(result, null, 2), 'utf8');
    console.log(JSON.stringify(result, null, 2));
  } catch (error) {
    if (started) await transaction.rollback();
    throw error;
  } finally {
    await pool.close();
  }
}

main().catch((error) => {
  console.error(error.stack || error.message);
  process.exitCode = 1;
});
