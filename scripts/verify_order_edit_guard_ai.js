'use strict';

/* ORDER-APPROVAL-005 — kiểm chứng luật sửa đơn trên dữ liệu thật.
 *
 *   node scripts/verify_order_edit_guard_ai.js
 *
 * Luật khách chốt 21/08/2026:
 *   - Đơn chỉ sửa được khi còn Chờ duyệt (StatusID = 0).
 *   - Sale gửi đơn xong là hết quyền sửa; chỉ người có vai trò duyệt mới sửa được.
 *
 * Toàn bộ chạy trong MỘT transaction LUÔN ROLLBACK: không đơn nào, dòng sản phẩm nào,
 * ledger hay audit nào bị ghi thật. Không seed dữ liệu; ca nào thiếu tiền đề thì SKIPPED.
 */

const fs = require('fs');
const path = require('path');
const sql = require('mssql');

const root = path.resolve(__dirname, '..');

function readEnv(relativeEnvPath) {
  const values = {};
  const filePath = path.join(root, relativeEnvPath);
  if (!fs.existsSync(filePath)) return values;
  for (const line of fs.readFileSync(filePath, 'utf8').split(/\r?\n/)) {
    const match = line.match(/^\s*([^#=]+)=(.*)$/);
    if (match) values[match[1].trim()] = match[2].trim().replace(/^['"]|['"]$/g, '');
  }
  return values;
}

const results = [];
const record = (name, status, detail) => results.push({ Case: name, Status: status, Detail: detail });
const check = (name, condition, detail) => record(name, condition ? 'PASS' : 'FAIL', detail);

let keySeq = 0;
const nextKey = (prefix) => `${prefix}-${Date.now()}-${(keySeq += 1)}`;

async function editContext(tx, username, documentId) {
  return (await new sql.Request(tx)
    .input('Username', sql.VarChar(50), username)
    .input('DocumentID', sql.VarChar(50), documentId)
    .execute('dbo.API_DonHang_EditContext_AI')).recordset[0];
}

async function itemUpdate(tx, username, row, overrides) {
  const o = Object.assign({ Quantity: row.Quantity, UnitPrice: row.UnitPrice, key: nextKey('edititem') }, overrides || {});
  return (await new sql.Request(tx)
    .input('Username', sql.VarChar(50), username)
    .input('UserAutoID', sql.VarChar(50), row.UserAutoID)
    .input('ItemID', sql.VarChar(50), row.ItemID)
    .input('Quantity', sql.Decimal(18, 2), o.Quantity)
    .input('SoLuongTang', sql.Decimal(18, 2), 0)
    .input('UnitPrice', sql.Decimal(18, 4), o.UnitPrice)
    .input('Amount', sql.Decimal(18, 0), Math.round(o.Quantity * o.UnitPrice))
    .input('DiscountPercent', sql.Decimal(18, 2), 0)
    .input('DiscountAmount', sql.Decimal(18, 0), 0)
    .input('DiemSanPham', sql.Decimal(18, 2), 0)
    .input('Notes', sql.NVarChar(250), '')
    .input('IdempotencyKey', sql.VarChar(128), o.key)
    .input('RequestID', sql.VarChar(100), 'req-' + o.key)
    .execute('dbo.API_DonHang_EditItemUpdate_AI')).recordset[0];
}

async function main() {
  const env = { ...readEnv('.env'), ...readEnv('.env.uat.local'), ...process.env };
  const pool = await sql.connect({
    server: env.TEST_DB_SERVER,
    port: Number(env.TEST_DB_PORT || 1433),
    database: env.TEST_DB_DATABASE,
    user: env.TEST_DB_USER,
    password: env.TEST_DB_PASSWORD,
    options: { encrypt: false, trustServerCertificate: true },
    connectionTimeout: 15000,
    requestTimeout: 120000,
    pool: { max: 1, min: 0, idleTimeoutMillis: 10000 },
  });

  const dbName = (await pool.request().query('SELECT DB_NAME() AS D;')).recordset[0].D;
  if (dbName !== 'medtest') throw new Error(`Chỉ chạy trên medtest; hiện tại ${dbName}.`);

  const tx = new sql.Transaction(pool);
  await tx.begin();
  try {
    /* Đơn Chờ duyệt do một Sale (KHÔNG có vai trò duyệt) tạo, và có >= 2 dòng sản phẩm
       để còn thử được ca xoá dòng. */
    const target = (await new sql.Request(tx).query(`
      SELECT TOP (1) O.DocumentID, O.BranchID, O.UserCreate
      FROM dbo.AR_OrderTbl O
      WHERE O.StatusID = 0 AND COALESCE(O.UserCreate, '') <> ''
        AND NOT EXISTS (SELECT 1 FROM dbo.AI_OrderApprovalRoleFnc(O.UserCreate, 'EDIT', SYSUTCDATETIME()))
        AND (SELECT COUNT(*) FROM dbo.AR_OrderDetailTbl D WHERE D.DocumentID = O.DocumentID) >= 2
      ORDER BY O.DocumentID;`)).recordset[0];

    if (!target) {
      record('ALL', 'SKIPPED', 'Không tìm được đơn Chờ duyệt do Sale không có vai trò duyệt tạo, có >= 2 dòng sản phẩm.');
    } else {
      const rows = (await new sql.Request(tx).input('D', sql.VarChar(50), target.DocumentID)
        .query('SELECT UserAutoID, ItemID, Quantity, UnitPrice FROM dbo.AR_OrderDetailTbl WHERE DocumentID = @D;')).recordset;

      /* ── 1. Chủ đơn (Sale) KHÔNG sửa được nữa ───────────────────────────────────── */
      const ownerCtx = await editContext(tx, target.UserCreate, target.DocumentID);
      check('OWNER_CANNOT_EDIT_AFTER_SUBMIT',
        ownerCtx.CanEdit === false && ownerCtx.BlockCode === 'ORDER_EDIT_ROLE_REQUIRED',
        { Owner: target.UserCreate, Order: target.DocumentID, Ctx: ownerCtx });

      const ownerTry = await itemUpdate(tx, target.UserCreate, rows[0], { Quantity: Number(rows[0].Quantity) + 5 });
      const afterOwner = (await new sql.Request(tx).input('U', sql.VarChar(50), rows[0].UserAutoID)
        .query('SELECT Quantity FROM dbo.AR_OrderDetailTbl WHERE UserAutoID = @U;')).recordset[0].Quantity;
      check('OWNER_ITEM_UPDATE_BLOCKED_AND_NO_WRITE',
        ownerTry.MsgType === 1 && ownerTry.Code === 'ORDER_EDIT_ROLE_REQUIRED'
        && Number(afterOwner) === Number(rows[0].Quantity),
        { Result: ownerTry, QuantityBefore: rows[0].Quantity, QuantityAfter: afterOwner });

      /* ── 2. Người duyệt CÙNG chi nhánh sửa được ─────────────────────────────────── */
      const approver = (await new sql.Request(tx).input('B', sql.VarChar(50), target.BranchID).query(`
        SELECT TOP (1) U.UserName FROM dbo.SY_User U
        WHERE COALESCE(U.Disable, 0) = 0 AND COALESCE(U.BranchID, '') = @B
          AND EXISTS (SELECT 1 FROM dbo.AI_OrderApprovalRoleFnc(U.UserName, 'EDIT', SYSUTCDATETIME()) R
                      WHERE R.ScopeRule IN ('BRANCH_MATCH', 'GLOBAL'))
        ORDER BY U.UserName;`)).recordset[0];

      if (!approver) {
        record('APPROVER_CAN_EDIT_SAME_BRANCH', 'SKIPPED',
          `Không có tài khoản nào vừa có vai trò duyệt vừa thuộc chi nhánh ${target.BranchID}.`);
      } else {
        const ctx = await editContext(tx, approver.UserName, target.DocumentID);
        check('APPROVER_CAN_EDIT_SAME_BRANCH', ctx.CanEdit === true && ctx.BlockCode === '',
          { Approver: approver.UserName, Ctx: ctx });

        const newQty = Number(rows[0].Quantity) + 3;
        const ok = await itemUpdate(tx, approver.UserName, rows[0], { Quantity: newQty });
        const afterOk = (await new sql.Request(tx).input('U', sql.VarChar(50), rows[0].UserAutoID)
          .query('SELECT Quantity FROM dbo.AR_OrderDetailTbl WHERE UserAutoID = @U;')).recordset[0].Quantity;
        check('APPROVER_ITEM_UPDATE_WRITES',
          ok.MsgType === 5 && Number(afterOk) === newQty,
          { Result: ok, Expected: newQty, Actual: afterOk });

        /* ── 3. Idempotency: gửi lại đúng khóa đó phải là REPLAY, không ghi lần hai ── */
        const sameKey = nextKey('replay');
        const first = await itemUpdate(tx, approver.UserName, rows[0], { Quantity: newQty + 1, key: sameKey });
        const second = await itemUpdate(tx, approver.UserName, rows[0], { Quantity: newQty + 1, key: sameKey });
        check('IDEMPOTENT_REPLAY_DOES_NOT_WRITE_TWICE',
          first.MsgType === 5 && first.IsReplay === false && second.MsgType === 5 && second.IsReplay === true,
          { First: first, Second: second });

        /* ── 4. Cùng khóa nhưng nội dung khác phải bị từ chối ───────────────────────── */
        const conflict = await itemUpdate(tx, approver.UserName, rows[0], { Quantity: newQty + 99, key: sameKey });
        check('IDEMPOTENCY_CONFLICT_ON_DIFFERENT_PAYLOAD',
          conflict.MsgType === 1 && conflict.Code === 'IDEMPOTENCY_CONFLICT', conflict);

        /* ── 5. Không cho xoá dòng cuối cùng ────────────────────────────────────────── */
        let lastDelete = null;
        for (let i = 0; i < rows.length - 1; i += 1) {
          lastDelete = (await new sql.Request(tx)
            .input('Username', sql.VarChar(50), approver.UserName)
            .input('UserAutoID', sql.VarChar(50), rows[i].UserAutoID)
            .input('IdempotencyKey', sql.VarChar(128), nextKey('del'))
            .input('RequestID', sql.VarChar(100), 'req-' + nextKey('del'))
            .execute('dbo.API_DonHang_EditItemDelete_AI')).recordset[0];
        }
        const deleteLast = (await new sql.Request(tx)
          .input('Username', sql.VarChar(50), approver.UserName)
          .input('UserAutoID', sql.VarChar(50), rows[rows.length - 1].UserAutoID)
          .input('IdempotencyKey', sql.VarChar(128), nextKey('dellast'))
          .input('RequestID', sql.VarChar(100), 'req-' + nextKey('dellast'))
          .execute('dbo.API_DonHang_EditItemDelete_AI')).recordset[0];
        check('LAST_ITEM_CANNOT_BE_DELETED',
          deleteLast.MsgType === 1 && deleteLast.Code === 'LAST_ITEM_CANNOT_BE_DELETED',
          { EarlierDeletes: lastDelete, LastDelete: deleteLast });

        /* ── 6. Người duyệt ở chi nhánh KHÁC bị chặn ────────────────────────────────── */
        const outsider = (await new sql.Request(tx).input('B', sql.VarChar(50), target.BranchID).query(`
          SELECT TOP (1) U.UserName, U.BranchID FROM dbo.SY_User U
          WHERE COALESCE(U.Disable, 0) = 0 AND COALESCE(U.BranchID, '') NOT IN ('', @B)
            AND EXISTS (SELECT 1 FROM dbo.AI_OrderApprovalRoleFnc(U.UserName, 'EDIT', SYSUTCDATETIME()) R
                        WHERE R.ScopeRule = 'BRANCH_MATCH')
          ORDER BY U.UserName;`)).recordset[0];
        if (!outsider) {
          record('OTHER_BRANCH_APPROVER_BLOCKED', 'SKIPPED', 'Không có người duyệt BRANCH_MATCH ở chi nhánh khác.');
        } else {
          const ctxOut = await editContext(tx, outsider.UserName, target.DocumentID);
          check('OTHER_BRANCH_APPROVER_BLOCKED',
            ctxOut.CanEdit === false && ctxOut.BlockCode === 'ORDER_OUT_OF_BRANCH_SCOPE',
            { Outsider: outsider, Ctx: ctxOut });
        }
      }
    }

    /* ── 7. Đơn đã duyệt thì KHÔNG AI sửa được, kể cả người duyệt ───────────────────── */
    const approved = (await new sql.Request(tx).query(`
      SELECT TOP (1) O.DocumentID, O.BranchID, O.StatusID
      FROM dbo.AR_OrderTbl O
      WHERE O.StatusID >= 1 AND EXISTS (SELECT 1 FROM dbo.AR_OrderDetailTbl D WHERE D.DocumentID = O.DocumentID)
      ORDER BY O.DocumentID;`)).recordset[0];
    const anyApprover = (await new sql.Request(tx).query(`
      SELECT TOP (1) U.UserName FROM dbo.SY_User U
      WHERE COALESCE(U.Disable, 0) = 0
        AND EXISTS (SELECT 1 FROM dbo.AI_OrderApprovalRoleFnc(U.UserName, 'EDIT', SYSUTCDATETIME()))
      ORDER BY U.UserName;`)).recordset[0];

    if (!approved || !anyApprover) {
      record('APPROVED_ORDER_LOCKED_FOR_EVERYONE', 'SKIPPED', 'Thiếu đơn StatusID >= 1 hoặc thiếu tài khoản có vai trò duyệt.');
    } else {
      const ctx = await editContext(tx, anyApprover.UserName, approved.DocumentID);
      const item = (await new sql.Request(tx).input('D', sql.VarChar(50), approved.DocumentID)
        .query('SELECT TOP (1) UserAutoID, ItemID, Quantity, UnitPrice FROM dbo.AR_OrderDetailTbl WHERE DocumentID = @D;')).recordset[0];
      const tryEdit = await itemUpdate(tx, anyApprover.UserName, item, { Quantity: Number(item.Quantity) + 7 });
      const after = (await new sql.Request(tx).input('U', sql.VarChar(50), item.UserAutoID)
        .query('SELECT Quantity FROM dbo.AR_OrderDetailTbl WHERE UserAutoID = @U;')).recordset[0].Quantity;
      check('APPROVED_ORDER_LOCKED_FOR_EVERYONE',
        ctx.CanEdit === false && ctx.BlockCode === 'ORDER_EDIT_LOCKED'
        && tryEdit.MsgType === 1 && tryEdit.Code === 'ORDER_EDIT_LOCKED'
        && Number(after) === Number(item.Quantity),
        { Approver: anyApprover.UserName, Order: approved.DocumentID, StatusID: approved.StatusID,
          Ctx: ctx, Result: tryEdit, QuantityUnchanged: Number(after) === Number(item.Quantity) });
    }

    /* ── 8. ORDER-APPROVAL-006: đơn NHÁP (StatusID = -1) — chủ đơn sửa được, người khác
       không được, kể cả người có vai trò duyệt (chưa gửi thì chưa tới lượt kế toán). ─────── */
    const draftTarget = (await new sql.Request(tx).query(`
      SELECT TOP (1) O.DocumentID, O.UserCreate
      FROM dbo.AR_OrderTbl O
      WHERE O.StatusID = -1 AND COALESCE(O.UserCreate, '') <> ''
        AND EXISTS (SELECT 1 FROM dbo.AR_OrderDetailTbl D WHERE D.DocumentID = O.DocumentID)
      ORDER BY O.DocumentID;`)).recordset[0];

    if (!draftTarget) {
      record('OWNER_CAN_EDIT_OWN_DRAFT', 'SKIPPED', 'Không có đơn nháp (StatusID=-1) nào trong medtest.');
      record('NON_OWNER_CANNOT_EDIT_OTHERS_DRAFT', 'SKIPPED', 'Không có đơn nháp (StatusID=-1) nào trong medtest.');
    } else {
      const draftRow = (await new sql.Request(tx).input('D', sql.VarChar(50), draftTarget.DocumentID)
        .query('SELECT TOP (1) UserAutoID, ItemID, Quantity, UnitPrice FROM dbo.AR_OrderDetailTbl WHERE DocumentID = @D;')).recordset[0];

      const ownerDraftCtx = await editContext(tx, draftTarget.UserCreate, draftTarget.DocumentID);
      const newQty = Number(draftRow.Quantity) + 2;
      const ownerDraftEdit = await itemUpdate(tx, draftTarget.UserCreate, draftRow, { Quantity: newQty });
      const afterOwnerDraft = (await new sql.Request(tx).input('U', sql.VarChar(50), draftRow.UserAutoID)
        .query('SELECT Quantity FROM dbo.AR_OrderDetailTbl WHERE UserAutoID = @U;')).recordset[0].Quantity;
      check('OWNER_CAN_EDIT_OWN_DRAFT',
        ownerDraftCtx.CanEdit === true && ownerDraftCtx.BlockCode === ''
        && ownerDraftEdit.MsgType === 5 && Number(afterOwnerDraft) === newQty,
        { Owner: draftTarget.UserCreate, Order: draftTarget.DocumentID, Ctx: ownerDraftCtx, Result: ownerDraftEdit });

      const notOwner = (await new sql.Request(tx).input('Owner', sql.VarChar(50), draftTarget.UserCreate).query(`
        SELECT TOP (1) UserName FROM dbo.SY_User
        WHERE COALESCE(Disable, 0) = 0 AND UserName <> @Owner
        ORDER BY UserName;`)).recordset[0];
      if (!notOwner) {
        record('NON_OWNER_CANNOT_EDIT_OTHERS_DRAFT', 'SKIPPED', 'Không tìm được tài khoản khác chủ đơn để test.');
      } else {
        const notOwnerCtx = await editContext(tx, notOwner.UserName, draftTarget.DocumentID);
        const notOwnerTry = await itemUpdate(tx, notOwner.UserName, draftRow, { Quantity: newQty + 1 });
        const afterNotOwner = (await new sql.Request(tx).input('U', sql.VarChar(50), draftRow.UserAutoID)
          .query('SELECT Quantity FROM dbo.AR_OrderDetailTbl WHERE UserAutoID = @U;')).recordset[0].Quantity;
        check('NON_OWNER_CANNOT_EDIT_OTHERS_DRAFT',
          notOwnerCtx.CanEdit === false && notOwnerCtx.BlockCode === 'ORDER_EDIT_NOT_OWNER'
          && notOwnerTry.MsgType === 1 && notOwnerTry.Code === 'ORDER_EDIT_NOT_OWNER'
          && Number(afterNotOwner) === newQty,
          { NotOwner: notOwner.UserName, Ctx: notOwnerCtx, Result: notOwnerTry, QuantityUnchanged: Number(afterNotOwner) === newQty });
      }
    }

    const failed = results.filter((r) => r.Status === 'FAIL');
    const skipped = results.filter((r) => r.Status === 'SKIPPED');
    console.log(JSON.stringify({
      Task: 'ORDER-APPROVAL-005-VERIFY-EDIT-GUARD',
      Status: failed.length ? 'FAIL' : 'PASS',
      Summary: `${results.filter((r) => r.Status === 'PASS').length} PASS / ${failed.length} FAIL / ${skipped.length} SKIPPED`,
      Cases: results,
    }, null, 2));
    if (failed.length) process.exitCode = 1;
  } finally {
    await tx.rollback();
    console.error('ROLLED_BACK (không ghi thật đơn hàng, dòng sản phẩm, ledger hay audit nào)');
    await pool.close();
  }
}

main().catch((error) => {
  console.error(JSON.stringify({ Task: 'ORDER-APPROVAL-005-VERIFY-EDIT-GUARD', Status: 'ERROR', Error: error.message }, null, 2));
  process.exitCode = 2;
});
