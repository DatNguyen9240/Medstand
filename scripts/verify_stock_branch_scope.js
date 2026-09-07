'use strict';

// medtest only. Default: test the function change and roll everything back.
// --apply: commit only the verified function definition; fixture changes roll back.
const fs = require('fs');
const path = require('path');
const assert = require('assert/strict');
const { connectMedtest, sql } = require('./lib/search-test-db');

async function main() {
  const pool = await connectMedtest();
  const tx = new sql.Transaction(pool);
  const checks = [];
  const query = async (text) => (await new sql.Request(tx).query(text)).recordset;
  const grantsSql = `SELECT U.UserName, U.BranchID AS UserBranch, W.StoreHouseID,
    S.BranchID AS WarehouseBranch, W.IsGlobal
    FROM dbo.SY_User U
    CROSS APPLY dbo.AI_WarehouseByUserFnc(U.UserName,SYSUTCDATETIME()) W
    JOIN dbo.CF_StoreHouseTbl S ON S.StoreHouseID=W.StoreHouseID`;
  let committed = false;
  try {
    await tx.begin();
    const before = await query(grantsSql);
    const bad = r => !r.IsGlobal && (!r.UserBranch || r.UserBranch !== r.WarehouseBranch);
    const source = fs.readFileSync(path.join(__dirname, '../sql/Migrate_STOCK001_Stock_Availability_AI.sql'), 'utf8');
    const batch = source.split(/^\s*GO\s*$/gim).find(s => s.includes('CREATE OR ALTER FUNCTION dbo.AI_WarehouseByUserFnc'));
    assert.ok(batch);
    await new sql.Request(tx).batch(batch);
    const after = await query(grantsSql);
    assert.equal(after.filter(bad).length, 0);
    checks.push('ALL_NON_GLOBAL_GRANTS_MATCH_BRANCH');
    const key = r => `${r.UserName}|${r.StoreHouseID}`;
    const expected = before.filter(r => !bad(r)).map(key).sort();
    assert.deepEqual(after.map(key).sort(), expected);
    checks.push('VALID_AND_GLOBAL_GRANTS_PRESERVED');
    const actors = await query(`SELECT DISTINCT U.UserName,U.BranchID FROM dbo.SY_User U
      CROSS APPLY dbo.AI_WarehouseByUserFnc(U.UserName,SYSUTCDATETIME()) W
      WHERE W.IsGlobal=0`);
    assert.ok(actors.length > 0);
    let invoiceRows = 0;
    for (const actor of actors) {
      const result = await new sql.Request(tx).input('Username',sql.VarChar(50),actor.UserName)
        .execute('dbo.API_DanhsachTonKho_AI');
      const allowed = new Set(after.filter(r=>r.UserName===actor.UserName).map(r=>r.StoreHouseID));
      const items = await query("SELECT ItemID FROM dbo.CF_ItemTbl WHERE ItemGroupID='HH1'");
      const hh1 = new Set(items.map(r=>r.ItemID));
      for (const row of result.recordset || []) {
        assert.ok(!row.MsgType, row.Msg || 'Unexpected API error');
        assert.ok(allowed.has(row.StoreHouseID), 'API returned unauthorized warehouse');
        assert.ok(hh1.has(row.ItemID), 'API returned non-HH1 product');
        invoiceRows++;
      }
    }
    assert.ok(invoiceRows > 0);
    checks.push('LIVE_STOCK_API_WAREHOUSE_SCOPE_AND_HH1');
    await query('SAVE TRANSACTION StockScopeFixture');
    const actor = actors[0];
    await new sql.Request(tx).input('actor',sql.VarChar(50),actor.UserName)
      .query("UPDATE dbo.SY_User SET BranchID='' WHERE UserName=@actor");
    let rows = await new sql.Request(tx).input('actor',sql.VarChar(50),actor.UserName)
      .query('SELECT * FROM dbo.AI_WarehouseByUserFnc(@actor,SYSUTCDATETIME())');
    assert.equal(rows.recordset.length,0);
    checks.push('EMPTY_BRANCH_DENIED');
    await query('ROLLBACK TRANSACTION StockScopeFixture');
    await query('SAVE TRANSACTION StockScopeFixture');
    await new sql.Request(tx).input('actor',sql.VarChar(50),actor.UserName)
      .query('UPDATE dbo.SY_User SET Disable=1 WHERE UserName=@actor');
    rows = await new sql.Request(tx).input('actor',sql.VarChar(50),actor.UserName)
      .query('SELECT * FROM dbo.AI_WarehouseByUserFnc(@actor,SYSUTCDATETIME())');
    assert.equal(rows.recordset.length,0);
    checks.push('DISABLED_USER_DENIED');
    await query('ROLLBACK TRANSACTION StockScopeFixture');
    if (process.argv.includes('--apply')) { await tx.commit(); committed = true; }
    else await tx.rollback();
    console.log(JSON.stringify({status:'PASS',mode:committed?'APPLIED':'ROLLED_BACK',
      beforeCrossBranchGrants:before.filter(bad).length,afterCrossBranchGrants:0,
      actorsChecked:actors.length,stockRowsChecked:invoiceRows,checks},null,2));
  } catch (e) {
    try { await tx.rollback(); } catch (_) {}
    throw e;
  } finally { await pool.close(); }
}
main().catch(e=>{console.error(e.message);process.exitCode=1;});
