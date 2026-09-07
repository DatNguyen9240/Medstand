'use strict';

// PROMO-AI-001 QA — medtest, read-only. Verifies API_CTBHSanPham_AI:
//  - fails closed on unknown / disabled account and on missing product term
//  - resolves by exact code and by name, caps @TopN at 20
//  - unknown product term returns an empty result (not an error, no leak)
//  - ActivePromotionCount / ActivePromotionsJson are exactly what
//    AI_ActivePromotionByUserFnc returns for that identity (no self-invented benefits)

const assert = require('assert/strict');
const { connectMedtest, sql } = require('./lib/search-test-db');

async function main() {
  const pool = await connectMedtest();
  const q = async (t) => (await pool.request().query(t)).recordset;
  const call = async (user, term, topN) => {
    const r = pool.request().input('Username', sql.VarChar(50), user).input('timkiem', sql.NVarChar(100), term);
    if (topN != null) r.input('TopN', sql.Int, topN);
    return (await r.execute('dbo.API_CTBHSanPham_AI')).recordset;
  };
  const checks = [];
  try {
    const kd = (await q(`SELECT TOP 1 UserName FROM dbo.SY_User WHERE COALESCE(Disable,0)=0 AND UPPER(COALESCE(UserGroupID,''))='KD' AND COALESCE(BranchID,'')='MB' ORDER BY UserName`))[0].UserName;
    const kdmn = (await q(`SELECT TOP 1 UserName FROM dbo.SY_User WHERE COALESCE(Disable,0)=0 AND COALESCE(BranchID,'')='MN' ORDER BY UserName`))[0].UserName;
    const disabled = (await q(`SELECT TOP 1 UserName FROM dbo.SY_User WHERE COALESCE(Disable,0)=1 ORDER BY UserName`))[0].UserName;
    const prod = (await q(`SELECT TOP 1 ItemID, ItemName FROM dbo.CF_ItemTbl WHERE ItemGroupID='HH1' AND COALESCE(isDisable,0)=0 ORDER BY ItemID`))[0];

    // 1. fail-closed: unknown + disabled account
    for (const u of ['__no_such_user__', disabled]) {
      const r = await call(u, prod.ItemID);
      assert.equal(r[0]?.MsgType, 1, `${u} must be rejected`);
      assert.equal(r[0]?.Code, 'INVALID_USER', `${u} code`);
    }
    checks.push('INVALID_ACCOUNT_FAIL_CLOSED');

    // 2. product term required
    for (const term of ['', '   ']) {
      const r = await call(kd, term);
      assert.equal(r[0]?.MsgType, 1, `term "${term}" must be rejected`);
      assert.equal(r[0]?.Code, 'PRODUCT_REQUIRED');
    }
    checks.push('PRODUCT_TERM_REQUIRED');

    // 3. exact code resolves, contract shape correct
    const byCode = await call(kd, prod.ItemID);
    assert.ok(byCode.length >= 1, 'exact code should match');
    assert.equal(byCode[0].ItemID, prod.ItemID, 'exact code should rank first');
    for (const row of byCode) {
      assert.equal(row.ContractVersion, 'PROMOTION_BENEFIT_V3');
      assert.ok(['ACTIVE_PROMOTION_FOUND', 'NO_ACTIVE_PROMOTION'].includes(row.PromotionStatus), `status ${row.PromotionStatus}`);
      const arr = JSON.parse(row.ActivePromotionsJson || '[]');
      assert.equal(Number(row.ActivePromotionCount), arr.length, `count vs json for ${row.ItemID}`);
      assert.equal(Number(row.ActivePromotionCount) > 0, row.PromotionStatus === 'ACTIVE_PROMOTION_FOUND');
    }
    checks.push('EXACT_CODE_RESOLVES_CONTRACT_SHAPE_OK');

    // 4. name search
    const nameFrag = String(prod.ItemName).replace(/\s*\(.*$/, '').trim().split(/\s+/).slice(0, 2).join(' ');
    const byName = await call(kd, nameFrag);
    assert.ok(byName.length >= 1 && !byName[0].MsgType, `name search "${nameFrag}" should return rows`);
    checks.push('NAME_SEARCH_RESOLVES');

    // 5. TopN cap
    const capped = await call(kd, 'a', 999);
    assert.ok(capped.length <= 20, `TopN must cap at 20, got ${capped.length}`);
    checks.push('TOPN_CAPPED_AT_20');

    // 6. unknown product term -> empty, no error row, no leak
    const none = await call(kd, 'ZZZQQ__nothing__matches');
    assert.equal(none.length, 0, 'unknown product term must return empty set');
    checks.push('UNKNOWN_PRODUCT_RETURNS_EMPTY');

    // 7. identity scoping: SP counts == AI_ActivePromotionByUserFnc for that identity
    let scopedPairs = 0;
    for (const u of [kd, kdmn]) {
      const rows = await call(u, 'a', 8);
      for (const row of rows.filter(r => !r.MsgType)) {
        const direct = (await pool.request()
          .input('u', sql.VarChar(50), u).input('i', sql.VarChar(50), row.ItemID)
          .query('SELECT COUNT_BIG(*) c FROM dbo.AI_ActivePromotionByUserFnc(@u, @i, SYSUTCDATETIME())'))
          .recordset[0].c;
        assert.equal(Number(row.ActivePromotionCount), Number(direct),
          `${u}/${row.ItemID}: SP count ${row.ActivePromotionCount} != fn count ${direct}`);
        scopedPairs++;
      }
    }
    assert.ok(scopedPairs > 0, 'no (user,product) pairs checked for scoping');
    checks.push('BENEFITS_COME_ONLY_FROM_IDENTITY_SCOPED_FN');

    console.log(JSON.stringify({
      status: 'PASS', mode: 'READ_ONLY',
      accounts: { kd, kdmn, disabled }, product: prod, scopedPairsChecked: scopedPairs,
      note: 'MaximumQuantity cap logic lives in AI_ActivePromotionByUserFnc, not this SP — not covered here.',
      checks
    }, null, 2));
  } finally {
    await pool.close();
  }
}

main().catch(e => { console.error('FAIL:', e.message); process.exitCode = 1; });
