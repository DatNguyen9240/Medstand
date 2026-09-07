'use strict';

// STOCK-COMPACT-001 — medtest only. Applies the patched API_DanhsachTonKho_AI inside a
// transaction, verifies it, then ALWAYS rolls back (nothing is persisted).
//   @Compact=1 -> exactly the 4 chatbot columns, one row per product x warehouse,
//                HH1 only, inside the actor's warehouse scope, zero rows kept.
//   @Compact=0 -> unchanged wide schema; same product x warehouse set and AvailableStock.

const fs = require('fs');
const path = require('path');
const assert = require('assert/strict');
const { connectMedtest, sql } = require('./lib/search-test-db');

const SP_FILE = path.join(__dirname, '../sql/Module_Common_API_DanhsachTonKho_AI.sql');
const COMPACT_COLS = ['ItemID', 'ItemName', 'StoreHouseName', 'AvailableStock'];

async function main() {
  const pool = await connectMedtest();
  const tx = new sql.Transaction(pool);
  const checks = [];
  await tx.begin();
  try {
    const q = async (text) => (await new sql.Request(tx).query(text)).recordset;

    // 1. Apply the patched procedure definition inside the tx.
    const batch = fs.readFileSync(SP_FILE, 'utf8').replace(/^\s*GO\s*$/gim, '').trim();
    assert.ok(batch.includes('CREATE OR ALTER PROCEDURE dbo.API_DanhsachTonKho_AI'));
    assert.ok(/@Compact\s+BIT/i.test(batch), 'SP file has no @Compact parameter');
    await new sql.Request(tx).batch(batch);

    const actors = await q(`
      SELECT U.UserName, U.UserGroupID, MAX(CAST(W.IsGlobal AS INT)) AS IsGlobal
      FROM dbo.SY_User U
      CROSS APPLY dbo.AI_WarehouseByUserFnc(U.UserName, SYSUTCDATETIME()) W
      WHERE COALESCE(U.Disable,0) = 0
      GROUP BY U.UserName, U.UserGroupID`);
    assert.ok(actors.length > 0, 'no actors with warehouse scope');

    const hh1 = new Set((await q(`SELECT ItemID FROM dbo.CF_ItemTbl WHERE ItemGroupID = 'HH1'`)).map(r => r.ItemID));
    assert.ok(hh1.size > 0);

    let compactRowsTotal = 0, parityActors = 0, zeroRows = 0, schemaChecked = 0;

    for (const actor of actors) {
      const allowedNames = new Set(
        (await q(`SELECT S.StoreHouseName
                  FROM dbo.AI_WarehouseByUserFnc('${actor.UserName}', SYSUTCDATETIME()) W
                  JOIN dbo.CF_StoreHouseTbl S ON S.StoreHouseID = W.StoreHouseID`)).map(r => r.StoreHouseName)
      );

      const compact = (await new sql.Request(tx)
        .input('Username', sql.VarChar(50), actor.UserName)
        .execute('dbo.API_DanhsachTonKho_AI')).recordset || [];

      if (compact.length) {
        assert.deepEqual(Object.keys(compact[0]), COMPACT_COLS,
          `${actor.UserName}: compact columns = ${Object.keys(compact[0]).join(',')}`);
        schemaChecked++;
      }

      const seen = new Set();
      for (const row of compact) {
        assert.ok(!('MsgType' in row), `${actor.UserName}: compact returned an error row`);
        assert.ok(hh1.has(row.ItemID), `${actor.UserName}: non-HH1 item ${row.ItemID}`);
        assert.ok(allowedNames.has(row.StoreHouseName), `${actor.UserName}: warehouse "${row.StoreHouseName}" outside scope`);
        const key = `${row.ItemID}|${row.StoreHouseName}`;
        assert.ok(!seen.has(key), `${actor.UserName}: duplicate product x warehouse ${key}`);
        seen.add(key);
        assert.ok(Number.isFinite(Number(row.AvailableStock)), `${actor.UserName}: AvailableStock not numeric`);
        if (Number(row.AvailableStock) <= 0) zeroRows++;
      }
      compactRowsTotal += compact.length;

      const full = (await new sql.Request(tx)
        .input('Username', sql.VarChar(50), actor.UserName)
        .input('Compact', sql.Bit, 0)
        .execute('dbo.API_DanhsachTonKho_AI')).recordset || [];

      if (full.length) {
        const fullCols = Object.keys(full[0]);
        assert.ok(fullCols.length > COMPACT_COLS.length + 5,
          `${actor.UserName}: @Compact=0 lost the wide schema (${fullCols.length} cols)`);
        assert.ok(fullCols.includes('Lot') && fullCols.includes('TrangThai'),
          `${actor.UserName}: @Compact=0 missing detailed columns`);

        const fullPairs = new Set(full.map(r => `${r.ItemID}|${r.StoreHouseName}`));
        const compactPairs = new Set(compact.map(r => `${r.ItemID}|${r.StoreHouseName}`));
        assert.deepEqual([...compactPairs].sort(), [...fullPairs].sort(),
          `${actor.UserName}: compact vs full product x warehouse set differs`);

        const fullAvail = new Map(full.map(r => [`${r.ItemID}|${r.StoreHouseName}`, Number(r.AvailableStock)]));
        for (const row of compact) {
          assert.equal(Number(row.AvailableStock), fullAvail.get(`${row.ItemID}|${row.StoreHouseName}`),
            `${actor.UserName}: AvailableStock mismatch for ${row.ItemID}`);
        }
        parityActors++;
      }
    }

    assert.ok(schemaChecked > 0, 'no actor produced compact rows to check schema');
    checks.push('COMPACT_SCHEMA_EXACTLY_4_COLS');
    checks.push('COMPACT_HH1_ONLY');
    checks.push('COMPACT_WITHIN_WAREHOUSE_SCOPE');
    checks.push('COMPACT_NO_DUPLICATE_PRODUCT_WAREHOUSE');
    checks.push('COMPACT_VS_FULL_PARITY_AND_AVAILABLE_MATCH');
    checks.push('FULL_MODE_KEEPS_WIDE_SCHEMA');

    await tx.rollback();
    console.log(JSON.stringify({
      status: 'PASS', mode: 'ROLLED_BACK',
      actorsChecked: actors.length, actorsWithCompactRows: schemaChecked, parityActors,
      compactRowsTotal, zeroAvailableRows: zeroRows, checks
    }, null, 2));
  } catch (e) {
    try { await tx.rollback(); } catch (_) {}
    throw e;
  } finally {
    await pool.close();
  }
}

main().catch(e => { console.error(e.message); process.exitCode = 1; });
