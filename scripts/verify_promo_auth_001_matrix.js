'use strict';

// PROMO-AUTH-001 QA — medtest, read-only. Verifies the promotion permission matrix
// enforces: global roles get every action at ALL scope; QL/QLMN get view/create/edit/
// history at OWN_BRANCH only (no approve/reject/withdraw); sales (KD/KDMN) and
// disabled/unknown accounts get nothing; the context + history procs agree with the fn.

const assert = require('assert/strict');
const { connectMedtest, sql } = require('./lib/search-test-db');

const ALL_ACTIONS = ['VIEW', 'CREATE', 'EDIT', 'APPROVE', 'REJECT', 'WITHDRAW', 'HISTORY'];
const QL_ALLOWED = new Set(['VIEW', 'CREATE', 'EDIT', 'HISTORY']);

async function main() {
  const pool = await connectMedtest();
  const q = async (t) => (await pool.request().query(t)).recordset;
  const fn = async (user, action) =>
    (await pool.request()
      .input('u', sql.VarChar(50), user).input('a', sql.VarChar(20), action)
      .query('SELECT * FROM dbo.AI_PromotionPermissionFnc(@u, @a)')).recordset[0];
  const ctx = async (user) =>
    (await pool.request().input('Username', sql.VarChar(50), user)
      .execute('dbo.API_PromotionPermissionContext_AI')).recordset[0];
  const hist = async (user, id) =>
    (await pool.request().input('u', sql.VarChar(50), user).input('p', sql.BigInt, id)
      .query('EXEC dbo.API_PromotionProgram_History_AI @PromotionProgramID=@p, @Username=@u')).recordset;

  const checks = [];
  try {
    // resolve real accounts per group
    const pick = async (grp) => (await q(`SELECT TOP 1 UserName FROM dbo.SY_User
      WHERE COALESCE(Disable,0)=0 AND UPPER(COALESCE(UserGroupID,''))='${grp}' ORDER BY UserName`))[0]?.UserName;
    const admin = await pick('ADMIN'), sadm = await pick('SADM'), bgd = await pick('BGD'), gd = await pick('GD');
    const ql = await pick('QL'), qlmn = await pick('QLMN'), kd = await pick('KD'), kdmn = await pick('KDMN');
    const disabled = (await q(`SELECT TOP 1 UserName FROM dbo.SY_User WHERE COALESCE(Disable,0)=1 ORDER BY UserName`))[0].UserName;

    // 1. Global roles: every action, IsAllowed=1, ScopeMode=ALL
    for (const u of [admin, sadm, bgd, gd].filter(Boolean)) {
      for (const a of ALL_ACTIONS) {
        const r = await fn(u, a);
        assert.equal(r.IsAllowed, true, `${u}/${a} should be allowed`);
        assert.equal(r.ScopeMode, 'ALL', `${u}/${a} scope should be ALL`);
        assert.equal(r.DecisionCode, 'ALLOWED');
      }
    }
    checks.push('GLOBAL_ROLES_ALL_ACTIONS_ALL_SCOPE');

    // 2. QL / QLMN: view/create/edit/history at OWN_BRANCH; approve/reject/withdraw denied
    for (const u of [ql, qlmn].filter(Boolean)) {
      for (const a of ALL_ACTIONS) {
        const r = await fn(u, a);
        if (QL_ALLOWED.has(a)) {
          assert.equal(r.IsAllowed, true, `${u}/${a} should be allowed`);
          assert.equal(r.ScopeMode, 'OWN_BRANCH', `${u}/${a} scope should be OWN_BRANCH`);
        } else {
          assert.equal(r.IsAllowed, false, `${u}/${a} must be denied`);
          assert.equal(r.DecisionCode, 'ACTION_NOT_GRANTED');
        }
      }
    }
    checks.push('QL_QLMN_SCOPED_DECLARE_ONLY_NO_APPROVAL');

    // 3. Sales groups: nothing granted
    for (const u of [kd, kdmn].filter(Boolean)) {
      for (const a of ALL_ACTIONS) {
        const r = await fn(u, a);
        assert.equal(r.IsAllowed, false, `${u}/${a} must be denied for sales group`);
        assert.equal(r.DecisionCode, 'ACTION_NOT_GRANTED');
      }
    }
    checks.push('SALES_GROUPS_DENIED_ALL');

    // 4. Disabled + unknown accounts fail closed
    for (const u of [disabled, '__no_such_user__']) {
      for (const a of ['VIEW', 'APPROVE']) {
        const r = await fn(u, a);
        assert.equal(r.IsAllowed, false, `${u}/${a} must be denied`);
        assert.equal(r.DecisionCode, 'INVALID_USER', `${u}/${a} should be INVALID_USER`);
      }
    }
    checks.push('DISABLED_AND_UNKNOWN_FAIL_CLOSED');

    // 5. Context proc agrees with the function
    const cQl = await ctx(ql);
    assert.equal(cQl.CanView, 1); assert.equal(cQl.CanCreate, 1); assert.equal(cQl.CanEdit, 1); assert.equal(cQl.CanViewHistory, 1);
    assert.equal(cQl.CanApprove, 0); assert.equal(cQl.CanReject, 0); assert.equal(cQl.CanWithdraw, 0);
    assert.equal(cQl.ScopeMode, 'OWN_BRANCH');
    assert.equal(cQl.ContractVersion, 'PROMOTION_PERMISSION_V1');
    const cAdmin = await ctx(admin);
    for (const k of ['CanView', 'CanCreate', 'CanEdit', 'CanApprove', 'CanReject', 'CanWithdraw', 'CanViewHistory'])
      assert.equal(cAdmin[k], 1, `admin ctx ${k}`);
    assert.equal(cAdmin.ScopeMode, 'ALL');
    const cKd = await ctx(kd);
    for (const k of ['CanView', 'CanCreate', 'CanEdit', 'CanApprove', 'CanReject', 'CanWithdraw', 'CanViewHistory'])
      assert.equal(cKd[k], 0, `sales ctx ${k}`);
    const cDis = await ctx(disabled);
    assert.equal(cDis.MsgType, 1, 'disabled ctx must be rejected');
    checks.push('CONTEXT_PROC_MATCHES_MATRIX');

    // 6. History proc fail-closed
    const hKd = await hist(kd, 999999);
    assert.equal(hKd[0]?.MsgType, 1, 'sales must be denied history');
    const hQl = await hist(ql, 999999);
    assert.equal(hQl[0]?.MsgType, 1, 'QL out-of-scope program must be refused');
    const hAdmin = await hist(admin, 999999);
    assert.ok(!hAdmin.length || hAdmin[0].MsgType === undefined,
      'admin (ALL scope) must not be blocked by branch check');
    checks.push('HISTORY_PROC_FAIL_CLOSED');

    console.log(JSON.stringify({
      status: 'PASS', mode: 'READ_ONLY',
      accounts: { admin, sadm, bgd, gd, ql, qlmn, kd, kdmn, disabled },
      note: 'AI_PromotionProgramTbl has 0 rows on medtest — in-branch history happy path not exercised.',
      checks
    }, null, 2));
  } finally {
    await pool.close();
  }
}

main().catch(e => { console.error('FAIL:', e.message); process.exitCode = 1; });
