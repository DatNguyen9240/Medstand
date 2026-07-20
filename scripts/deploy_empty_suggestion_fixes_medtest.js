'use strict';

const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const sql = require('mssql');
const { testDbConfig } = require('./lib/test-db-config');

const root = path.resolve(__dirname, '..');
const config = testDbConfig(root);
const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
const backupDir = path.join(root, 'reports', 'runtime-backups', `suggestion-empty-fix-${timestamp}`);
const orderPath = path.join(root, 'sql', 'Module 1 - API_GoiYDonHang_AI.sql');
const upsellPath = path.join(root, 'sql', 'Module 5 - API_UpsellGoiY_AI.sql');
const drugPath = path.join(root, 'sql', 'Module 8 - API_GoiYDonThuoc_AI.sql');
const migrationPath = path.join(root, 'sql', 'Migrate_Suggestion_API_Required_Inputs_AI.sql');

const sha256 = (value) => crypto.createHash('sha256').update(String(value || '')).digest('hex').toUpperCase();
const batches = (source) => source.replace(/^\uFEFF/, '').split(/^\s*GO\s*$/gim).map((item) => item.trim()).filter(Boolean);
const procedureBatch = (source, name) => {
  const batch = batches(source).find((item) => new RegExp(`CREATE\\s+OR\\s+ALTER\\s+PROCEDURE\\s+(?:\\[dbo\\]\\.)?\\[?${name}\\]?`, 'i').test(item));
  if (!batch) throw new Error(`Cannot find deployment batch for ${name}.`);
  return batch;
};
const allRows = (result) => (result.recordsets || []).flat();

async function main() {
  if (!/medtest/i.test(config.database)) throw new Error(`Refusing deployment outside medtest: ${config.database}`);
  const orderSource = fs.readFileSync(orderPath, 'utf8');
  const upsellSource = fs.readFileSync(upsellPath, 'utf8');
  const drugSource = fs.readFileSync(drugPath, 'utf8');
  const migrationSource = fs.readFileSync(migrationPath, 'utf8');
  for (const marker of ['NEW_CUSTOMER_NO_FULFILLED_HISTORY', "N'NO_DATA' AS Severity"]) {
    if (!orderSource.includes(marker)) throw new Error(`Order suggestion source missing ${marker}`);
  }
  for (const marker of ['MISSING_PRODUCT_KEYWORD', 'CF.ItemID = K.TuKhoa', 'AR_GetObjectByUserFnc', 'PRODUCT_NOT_FOUND']) {
    if (!drugSource.includes(marker)) throw new Error(`Drug suggestion source missing ${marker}`);
  }
  for (const marker of ['NO_CUSTOMER_PURCHASE_HISTORY', 'AR_GetObjectByUserFnc', 'BR-UPSELL-V1-DRAFT']) {
    if (!upsellSource.includes(marker)) throw new Error(`Upsell source missing ${marker}`);
  }

  fs.mkdirSync(backupDir, { recursive: true });
  const pool = await sql.connect(config);
  const transaction = new sql.Transaction(pool);
  let started = false;
  try {
    const before = await pool.request().query(`
      SELECT name, OBJECT_DEFINITION(object_id) AS definition
      FROM sys.procedures
      WHERE name IN ('API_GoiYDonHang_AI', 'API_UpsellGoiY_AI', 'API_GoiYDonThuoc_AI');

      SELECT d.ApiCode, f.*
      FROM dbo.API_Definition d
      JOIN dbo.API_Field f ON f.ApiID = d.ApiID
      WHERE (d.ApiCode = '@goi_ydon_hang' AND f.FieldCode = '@MaKhachHang')
         OR (d.ApiCode = '@goi_ydon_thuoc' AND f.FieldCode = '@timkiem');
    `);
    fs.writeFileSync(path.join(backupDir, 'before.json'), JSON.stringify({
      capturedAt: new Date().toISOString(),
      database: config.database,
      procedures: before.recordsets[0],
      metadata: before.recordsets[1],
    }, null, 2), 'utf8');

    await transaction.begin(sql.ISOLATION_LEVEL.READ_COMMITTED);
    started = true;
    await new sql.Request(transaction).batch(procedureBatch(orderSource, 'API_GoiYDonHang_AI'));
    await new sql.Request(transaction).batch(procedureBatch(upsellSource, 'API_UpsellGoiY_AI'));
    await new sql.Request(transaction).batch(procedureBatch(drugSource, 'API_GoiYDonThuoc_AI'));
    for (const batch of batches(migrationSource)) await new sql.Request(transaction).batch(batch);

    const verify = await new sql.Request(transaction).query(`
      SELECT name, OBJECT_DEFINITION(object_id) AS definition
      FROM sys.procedures
      WHERE name IN ('API_GoiYDonHang_AI', 'API_UpsellGoiY_AI', 'API_GoiYDonThuoc_AI');

      SELECT d.ApiCode, f.FieldCode, f.IsRequired, f.FieldName, f.DataSourceType, f.DataSourceValue, f.ValidationRule
      FROM dbo.API_Definition d
      JOIN dbo.API_Field f ON f.ApiID = d.ApiID
      WHERE (d.ApiCode = '@goi_ydon_hang' AND f.FieldCode = '@MaKhachHang')
         OR (d.ApiCode = '@goi_ydon_thuoc' AND f.FieldCode = '@timkiem');
    `);
    const definitions = new Map(verify.recordsets[0].map((row) => [row.name, row.definition || '']));
    if (!definitions.get('API_GoiYDonHang_AI')?.includes('NEW_CUSTOMER_NO_FULFILLED_HISTORY')) throw new Error('Order suggestion deployment marker missing.');
    if (!definitions.get('API_UpsellGoiY_AI')?.includes('NO_CUSTOMER_PURCHASE_HISTORY')) throw new Error('Upsell deployment marker missing.');
    if (!definitions.get('API_GoiYDonThuoc_AI')?.includes('MISSING_PRODUCT_KEYWORD')) throw new Error('Drug suggestion deployment marker missing.');
    if (verify.recordsets[1].length !== 2 || verify.recordsets[1].some((row) => row.IsRequired !== true)) throw new Error('Required-input metadata verification failed.');
    await transaction.commit();
    started = false;

    const order = await pool.request()
      .input('Username', sql.VarChar(50), 'QLBH013.MED')
      .input('CustomerID', sql.NVarChar(100), 'HPA011')
      .query('EXEC dbo.API_GoiYDonHang_AI @Username=@Username, @MaKhachHang=@CustomerID;');
    const orderRow = allRows(order)[0] || {};
    if (orderRow.Code !== 'NEW_CUSTOMER_NO_FULFILLED_HISTORY' || orderRow.Severity !== 'NO_DATA') throw new Error('HPA011 no-history smoke failed.');

    const upsell = await pool.request()
      .input('Username', sql.VarChar(50), 'QLBH013.MED')
      .input('CustomerID', sql.NVarChar(100), 'HPA011')
      .query('EXEC dbo.API_UpsellGoiY_AI @Username=@Username, @MaKhachHang=@CustomerID;');
    const upsellRow = allRows(upsell)[0] || {};
    if (upsellRow.Code !== 'NO_CUSTOMER_PURCHASE_HISTORY' || upsellRow.Severity !== 'NO_DATA') throw new Error('HPA011 upsell no-history smoke failed.');

    const missingDrug = await pool.request()
      .input('Username', sql.VarChar(50), 'QLBH013.MED')
      .query("EXEC dbo.API_GoiYDonThuoc_AI @Username=@Username, @timkiem=N'';");
    const missingDrugRow = allRows(missingDrug)[0] || {};
    if (missingDrugRow.Code !== 'MISSING_PRODUCT_KEYWORD') throw new Error('Missing product keyword smoke failed.');

    const drug = await pool.request()
      .input('Username', sql.VarChar(50), 'QLBH013.MED')
      .input('Keyword', sql.NVarChar(500), 'A008')
      .query('EXEC dbo.API_GoiYDonThuoc_AI @Username=@Username, @timkiem=@Keyword;');
    const drugRows = allRows(drug);
    if (!drugRows.some((row) => row.ItemID && row.ItemID !== 'A008') || drugRows.some((row) => row.ItemID === 'A008' || row.ItemID === 'N/A')) throw new Error('Related product resolution smoke failed.');

    const noRelated = await pool.request()
      .input('Username', sql.VarChar(50), 'QLBH013.MED')
      .input('Keyword', sql.NVarChar(500), 'A015')
      .query('EXEC dbo.API_GoiYDonThuoc_AI @Username=@Username, @timkiem=@Keyword;');
    const noRelatedRow = allRows(noRelated)[0] || {};
    if (noRelatedRow.Code !== 'NO_RELATED_PRODUCT_HISTORY' || noRelatedRow.Severity !== 'NO_DATA') throw new Error('A015 no-related-history smoke failed.');

    const result = {
      status: 'MEDTEST_EMPTY_SUGGESTION_FIX_PASS',
      deployedAt: new Date().toISOString(),
      database: config.database,
      backupDir,
      procedures: [...definitions].map(([name, definition]) => ({ name, sha256: sha256(definition) })),
      metadata: verify.recordsets[1],
      smoke: {
        HPA011: { code: orderRow.Code, severity: orderRow.Severity },
        upsellHPA011: { code: upsellRow.Code, severity: upsellRow.Severity },
        missingDrugKeyword: missingDrugRow.Code,
        productKeyword: { keyword: 'A008', count: drugRows.length, excludesRootA008: true, containsFakeNA: false },
        noRelatedProduct: { keyword: 'A015', code: noRelatedRow.Code, severity: noRelatedRow.Severity },
      },
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
