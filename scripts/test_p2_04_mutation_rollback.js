const assert = require('assert');
const path = require('path');
const sql = require('mssql');
const { testDbConfig } = require('./lib/test-db-config');

const ROOT = path.resolve(__dirname, '..');

async function rollbackCase(pool, name, batch, assertInside, afterSql) {
  const transaction = new sql.Transaction(pool);
  await transaction.begin();
  try {
    const result = await new sql.Request(transaction).batch(batch);
    assertInside(result);
    await transaction.rollback();
  } catch (error) {
    try { await transaction.rollback(); } catch (_) {}
    throw new Error(`${name}: ${error.message}`);
  }

  const remaining = (await pool.request().query(afterSql)).recordset[0];
  assert(Object.values(remaining).every((value) => Number(value) === 0), `${name} cleanup failed`);
  return { name, inside: 'PASS', rollback: 'PASS', remaining };
}

async function main() {
  const pool = await sql.connect(testDbConfig(ROOT));
  try {
    const fixture = (await pool.request().query(`
      SELECT TOP 1 u.UserName, o.ObjectID, i.ItemID
      FROM dbo.SY_User u
      CROSS APPLY (
        SELECT TOP 1 allowed.ObjectID
        FROM dbo.AR_GetObjectByUserFnc(u.UserName) allowed
        JOIN dbo.CF_ObjectTbl customer ON customer.ObjectID = allowed.ObjectID
        WHERE COALESCE(customer.isDisable, 0) = 0
        ORDER BY allowed.ObjectID
      ) o
      CROSS APPLY (
        SELECT TOP 1 ItemID FROM dbo.CF_ItemTbl
        WHERE COALESCE(isDisable, 0) = 0 ORDER BY ItemID
      ) i
      WHERE COALESCE(u.Disable, 0) = 0 AND COALESCE(u.BranchID, '') <> ''
      ORDER BY CASE WHEN UPPER(u.UserGroupID) = 'ADMIN' THEN 0 ELSE 1 END, u.UserName;
    `)).recordset[0];
    assert(fixture, 'No scoped rollback fixture is available.');

    const suffix = Date.now().toString().slice(-7);
    const customerName = `P2UAT_ROLLBACK_${suffix}`;
    const phone = `090${suffix}`;
    const promotionId = `P2UAT${suffix}`;
    const orderId = `P2UAT/${suffix}`;
    const username = fixture.UserName.replace(/'/g, "''");

    const invalid = await pool.request().query(`
      EXEC dbo.API_KhachHang_Insert_AI @Username='__P2_INVALID__', @TenKhachHang=N'${customerName}', @SoDienThoai='${phone}';
      EXEC dbo.API_SanPhamTrongTam_Import_AI @DocumentID='${promotionId}', @TuNgay='2026-07-01', @DenNgay='2026-07-31', @Memo=N'P2 rollback', @Username='__P2_INVALID__';
      EXEC dbo.API_DonHangChiTiet_Insert_AI @Username='__P2_INVALID__', @DocumentID='${orderId}', @ObjectID='${fixture.ObjectID}', @ItemList=N'[{"ItemID":"${fixture.ItemID}","Quantity":1,"UnitPrice":1}]';
    `);
    assert(invalid.recordsets.slice(0, 3).every((set) => Number(set[0]?.MsgType) === 1), 'Invalid identity did not fail closed.');

    const cases = [];
    cases.push(await rollbackCase(pool, 'customer', `
      EXEC dbo.API_KhachHang_Insert_AI @Username='${username}', @TenKhachHang=N'${customerName}', @SoDienThoai='${phone}', @DiaChi=N'P2 rollback';
      SELECT COUNT(*) AS InsideCount FROM dbo.CF_ObjectTbl WHERE ObjectName=N'${customerName}';
    `, (result) => assert.strictEqual(result.recordsets.at(-1)[0].InsideCount, 1), `
      SELECT COUNT(*) AS Remaining FROM dbo.CF_ObjectTbl WHERE ObjectName=N'${customerName}';
    `));

    cases.push(await rollbackCase(pool, 'promotion', `
      EXEC dbo.API_SanPhamTrongTam_Import_AI @DocumentID='${promotionId}', @TuNgay='2026-07-01', @DenNgay='2026-07-31', @Memo=N'P2 rollback', @JsonItems=N'[{"ItemID":"${fixture.ItemID}","Notes":"P2"}]', @JsonRules=N'[{"TuDiem":1,"DenDiem":2,"QuaTang":"P2"}]', @Username='${username}';
      SELECT (SELECT COUNT(*) FROM dbo.AR_SanPhamTrongTamTbl WHERE DocumentID='${promotionId}') H,
             (SELECT COUNT(*) FROM dbo.AR_PromotionTbl WHERE DocumentID='${promotionId}') P,
             (SELECT COUNT(*) FROM dbo.AR_SanPhamTrongTamDetailTbl WHERE DocumentID='${promotionId}') I,
             (SELECT COUNT(*) FROM dbo.AR_PromotionGiftTbl WHERE DocumentID='${promotionId}') R;
    `, (result) => assert.deepStrictEqual(Object.values(result.recordsets.at(-1)[0]).map(Number), [1, 1, 1, 1]), `
      SELECT (SELECT COUNT(*) FROM dbo.AR_SanPhamTrongTamTbl WHERE DocumentID='${promotionId}') H,
             (SELECT COUNT(*) FROM dbo.AR_PromotionTbl WHERE DocumentID='${promotionId}') P,
             (SELECT COUNT(*) FROM dbo.AR_SanPhamTrongTamDetailTbl WHERE DocumentID='${promotionId}') I,
             (SELECT COUNT(*) FROM dbo.AR_PromotionGiftTbl WHERE DocumentID='${promotionId}') R;
    `));

    cases.push(await rollbackCase(pool, 'order', `
      EXEC dbo.API_DonHangChiTiet_Insert_AI @Username='${username}', @DocumentID='${orderId}', @ObjectID='${fixture.ObjectID}', @ItemList=N'[{"ItemID":"${fixture.ItemID}","Quantity":1,"UnitPrice":1}]';
      SELECT (SELECT COUNT(*) FROM dbo.AR_OrderTbl WHERE DocumentID='${orderId}') H,
             (SELECT COUNT(*) FROM dbo.AR_OrderDetailTbl WHERE DocumentID='${orderId}') D;
    `, (result) => {
      assert.strictEqual(result.recordsets.at(-1)[0].H, 1);
      assert(result.recordsets.at(-1)[0].D >= 1);
    }, `
      SELECT (SELECT COUNT(*) FROM dbo.AR_OrderTbl WHERE DocumentID='${orderId}') H,
             (SELECT COUNT(*) FROM dbo.AR_OrderDetailTbl WHERE DocumentID='${orderId}') D;
    `));

    const metadata = (await pool.request().query(`
      SELECT f.IsSystemParam, f.SourceOfTruth
      FROM dbo.API_Field f JOIN dbo.API_Definition d ON d.ApiID = f.ApiID
      WHERE d.ApiCode='@san_pham_trong_tam_import' AND f.FieldCode='@Username';
    `)).recordset[0];
    assert.strictEqual(metadata.IsSystemParam, true);
    assert.strictEqual(metadata.SourceOfTruth, 'VERIFIED_IDENTITY');

    console.log(JSON.stringify({ invalidIdentity: 'PASS', cases, metadata, overall: 'PASS' }, null, 2));
  } finally {
    await pool.close();
  }
}

main().catch((error) => {
  console.error(error.stack || error.message);
  process.exitCode = 1;
});
