'use strict';

/* ORDER-APPROVAL-006 (điểm "Gửi duyệt" + "Hủy đơn nháp") — kiểm chứng có assertion thật cho
   dbo.API_DonHang_OwnerTransition_AI. Chạy trong 1 transaction luôn rollback.

   Phạm vi ĐÃ CHỐT lại 21/08/2026 (khác bản gốc ORDER-APPROVAL-002): chỉ SUBMIT (-1->0) và
   CANCEL (-1->10, tức huỷ đơn NHÁP) là APPROVED thật trên medtest — xem
   sql/ORDER-APPROVAL-006_Draft_Restore_AI.sql. 6 dòng CANCEL còn lại (0,1,2,3,4,6 -> 10) vẫn
   RETIRED: chủ đơn không được hủy đơn đã gửi duyệt/đã duyệt. Script này KHÔNG bật tạm gì cả —
   hợp đồng thật trên medtest đã đúng phạm vi cần test, không cần giả lập sign-off nữa. */

const fs = require('fs');
const sql = require('mssql');

function readEnv() {
  const values = {};
  for (const line of fs.readFileSync('.env', 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([^#=]+)=(.*)$/);
    if (m) values[m[1].trim()] = m[2].trim().replace(/^['"]|['"]$/g, '');
  }
  return values;
}

function assert(condition, message) {
  if (!condition) throw new Error('ASSERTION_FAILED: ' + message);
}

let seq = 0;
function newKey(prefix) { seq += 1; return prefix + '-' + Date.now() + '-' + seq; }

async function callTransition(tx, o) {
  const r = await new sql.Request(tx)
    .input('Username', sql.VarChar(50), o.username)
    .input('DocumentID', sql.VarChar(50), o.documentId)
    .input('Action', sql.VarChar(20), o.action)
    .input('ExpectedStatusID', sql.Int, o.expectedStatusId)
    .input('IdempotencyKey', sql.VarChar(128), o.idempotencyKey || newKey('idem'))
    .input('RequestID', sql.VarChar(100), o.requestId || newKey('req'))
    .execute('dbo.API_DonHang_OwnerTransition_AI');
  return r.recordset[0];
}

async function createDraft(tx, { username, objectId, itemId, unitPrice }) {
  const r = await new sql.Request(tx)
    .input('Username', sql.VarChar(50), username)
    .input('DocumentID', sql.VarChar(50), 'AUTO_GEN')
    .input('ObjectID', sql.VarChar(50), objectId)
    .input('ItemList', sql.NVarChar(sql.MAX), JSON.stringify([{ ItemID: itemId, Quantity: 1, SoLuongTang: 0, UnitPrice: unitPrice, DiscountPercent: 0 }]))
    .input('IdempotencyKey', sql.VarChar(128), newKey('idem-mkdraft'))
    .input('RequestID', sql.VarChar(100), newKey('req-mkdraft'))
    .input('SaveAsDraft', sql.Bit, 1)
    .execute('dbo.API_DonHangChiTiet_Insert_AI');
  return r.recordset[0];
}

async function statusOf(tx, documentId) {
  return (await new sql.Request(tx)
    .input('DocumentID', sql.VarChar(50), documentId)
    .query('SELECT StatusID FROM dbo.AR_OrderTbl WHERE DocumentID = @DocumentID;')).recordset[0].StatusID;
}

async function main() {
  const env = readEnv();
  if (String(env.TEST_DB_DATABASE || '').toLowerCase() !== 'medtest') throw new Error('medtest only');
  const pool = await sql.connect({
    server: env.TEST_DB_SERVER,
    port: Number(env.TEST_DB_PORT || 1433),
    database: env.TEST_DB_DATABASE,
    user: env.TEST_DB_USER,
    password: env.TEST_DB_PASSWORD,
    options: { encrypt: false, trustServerCertificate: true },
    connectionTimeout: 15000,
    requestTimeout: 60000,
  });

  const tx = new sql.Transaction(pool);
  await tx.begin();
  const results = [];
  try {
    // ── Chuẩn bị: 1 chủ đơn (có warehouse scope để tạo được đơn), 1 khách, 1 sản phẩm sạch CTBH ──
    const owner = (await new sql.Request(tx).query(`
      SELECT TOP (1) U.UserName, U.BranchID FROM dbo.SY_User U
      WHERE COALESCE(U.Disable,0)=0 AND COALESCE(U.BranchID,'')<>'' AND COALESCE(U.EmployeeID,'')<>''
        AND EXISTS (SELECT 1 FROM dbo.AI_WarehouseByUserFnc(U.UserName, SYSUTCDATETIME()))
      ORDER BY U.UserName;
    `)).recordset[0];
    assert(owner, 'Cần 1 tài khoản có đủ BranchID/EmployeeID/phạm vi kho trong medtest.');

    const scopeRow = (await new sql.Request(tx)
      .input('UserName', sql.VarChar(50), owner.UserName)
      .query(`SELECT TOP (1) ObjectID FROM dbo.AR_GetObjectByUserFnc(@UserName) ORDER BY ObjectID;`)
    ).recordset[0];
    assert(scopeRow, 'Cần tìm được khách trong phạm vi của chủ đơn test.');

    const candidates = (await new sql.Request(tx)
      .input('UserName', sql.VarChar(50), owner.UserName)
      .query(`
        SELECT T.ItemID, P.UnitPrice
        FROM dbo.IV_StockTransactionTbl T
        JOIN dbo.AI_WarehouseByUserFnc(@UserName, SYSUTCDATETIME()) W ON W.StoreHouseID = T.StoreHouseID
        JOIN dbo.CF_ItemTbl I ON I.ItemID = T.ItemID AND COALESCE(I.IsDisable,0)=0
        OUTER APPLY (SELECT TOP (1) UnitPrice FROM dbo.AR_LayGiaSanPhamFnc(CAST(GETDATE() AS DATE), '${scopeRow.ObjectID.replace(/'/g, "''")}', T.ItemID)) P
        GROUP BY T.ItemID, P.UnitPrice
        HAVING SUM(T.Quantity) > 5 AND P.UnitPrice > 0
        ORDER BY T.ItemID;
      `)
    ).recordset;
    assert(candidates.length > 0, 'Cần ít nhất 1 sản phẩm hợp lệ cho chủ đơn test.');

    let draft1 = null;
    for (const c of candidates) {
      const attempt = await createDraft(tx, { username: owner.UserName, objectId: scopeRow.ObjectID, itemId: c.ItemID, unitPrice: c.UnitPrice });
      if (attempt.MsgType === 5) { draft1 = attempt; break; }
    }
    assert(draft1, 'Không tạo được đơn nháp mồi từ ' + candidates.length + ' ứng viên.');
    assert((await statusOf(tx, draft1.DocumentID)) === -1, 'Đơn mồi phải là -1 (Đơn nháp).');

    const nonRelated = (await new sql.Request(tx)
      .input('UserName', sql.VarChar(50), owner.UserName)
      .query(`
        SELECT TOP (1) UserName FROM dbo.SY_User
        WHERE COALESCE(Disable,0)=0 AND UserName <> @UserName
          AND COALESCE(Manager,0)=0
          AND UPPER(COALESCE(UserGroupID,'')) NOT IN ('KTDH','KTDH2','TN KTDH','QL','QLMN','ADMIN','SADM','BGD','GD')
        ORDER BY UserName;
      `)).recordset[0];
    assert(nonRelated, 'Cần 1 tài khoản không liên quan (không phải chủ đơn, không có vai trò duyệt) để test FORBIDDEN_ROLE.');

    // ── Ca 1: chủ đơn tự SUBMIT đơn nháp của mình -> thành công, không cần vai trò gì ────
    const r1 = await callTransition(tx, { username: owner.UserName, documentId: draft1.DocumentID, action: 'SUBMIT', expectedStatusId: -1, requestId: newKey('req-owner-submit') });
    assert(r1.MsgType === 5, 'Chủ đơn tự gửi duyệt đơn nháp của mình phải thành công, thực tế: ' + JSON.stringify(r1));
    assert((await statusOf(tx, draft1.DocumentID)) === 0, 'Sau SUBMIT, StatusID thật phải là 0.');
    results.push(['OWNER_CAN_SUBMIT_OWN_DRAFT', true]);

    // ── Ca 2: người không liên quan không được SUBMIT đơn nháp của người khác ───────────
    let draft2 = null;
    for (const c of candidates) {
      const attempt = await createDraft(tx, { username: owner.UserName, objectId: scopeRow.ObjectID, itemId: c.ItemID, unitPrice: c.UnitPrice });
      if (attempt.MsgType === 5) { draft2 = attempt; break; }
    }
    assert(draft2, 'Không tạo được đơn nháp thứ 2.');
    const r2 = await callTransition(tx, { username: nonRelated.UserName, documentId: draft2.DocumentID, action: 'SUBMIT', expectedStatusId: -1, requestId: newKey('req-forbidden') });
    assert(r2.MsgType === 1 && r2.Code === 'FORBIDDEN_ROLE', 'Người không liên quan submit đơn người khác phải bị FORBIDDEN_ROLE, thực tế: ' + JSON.stringify(r2));
    assert((await statusOf(tx, draft2.DocumentID)) === -1, 'Đơn nháp không được đổi trạng thái khi bị chặn.');
    results.push(['NON_OWNER_NON_ROLE_FORBIDDEN', true]);

    // ── Ca 3: kế toán/quản lý (vai trò đã APPROVED thật trên medtest, ActionCode='*') cùng
    // chi nhánh cũng SUBMIT được đơn nháp của NGƯỜI KHÁC (không cần là chủ đơn) ───────────
    const approver = (await new sql.Request(tx).query(`
      SELECT TOP (1) UserName FROM dbo.SY_User
      WHERE COALESCE(Disable,0)=0
        AND UPPER(COALESCE(UserGroupID,'')) IN ('KTDH','KTDH2','TN KTDH','QL','QLMN')
      ORDER BY UserName;
    `)).recordset[0];
    if (approver) {
      const draft2BranchID = (await new sql.Request(tx)
        .input('DocumentID', sql.VarChar(50), draft2.DocumentID)
        .query(`SELECT BranchID FROM dbo.AR_OrderTbl WHERE DocumentID=@DocumentID;`)).recordset[0].BranchID;
      await new sql.Request(tx)
        .input('BranchID', sql.VarChar(50), draft2BranchID)
        .input('UserName', sql.VarChar(50), approver.UserName)
        .query(`UPDATE dbo.SY_User SET BranchID=@BranchID WHERE UserName=@UserName;`);
      const r3 = await callTransition(tx, { username: approver.UserName, documentId: draft2.DocumentID, action: 'SUBMIT', expectedStatusId: -1, requestId: newKey('req-approver-submit') });
      assert(r3.MsgType === 5, 'Kế toán/quản lý cùng chi nhánh phải SUBMIT được đơn nháp của người khác, thực tế: ' + JSON.stringify(r3));
      assert((await statusOf(tx, draft2.DocumentID)) === 0, 'Sau SUBMIT bởi kế toán/quản lý, StatusID thật phải là 0.');
      results.push(['APPROVER_ROLE_CAN_SUBMIT_OTHERS_DRAFT', true]);
    } else {
      results.push(['APPROVER_ROLE_CAN_SUBMIT_OTHERS_DRAFT', 'SKIPPED_NO_APPROVER_ACCOUNT']);
    }

    // ── Ca 4 (ORDER-APPROVAL-006, phạm vi chốt lại 21/08/2026): chủ đơn KHÔNG được hủy đơn
    // của mình một khi đã Chờ duyệt (0) nữa — CANCEL chỉ còn sống ở -1->10. draft1 đang ở 0
    // (đã SUBMIT ở Ca 1) nên phải bị INVALID_TRANSITION, không phải thành công như bản gốc
    // ORDER-APPROVAL-002. Đây đúng là defect #2 đã sửa ở ORDER-APPROVAL-004 (chủ đơn hủy đơn
    // đã gửi/đã duyệt) — không được mở lại khi khôi phục Lưu nháp. ──────────────────────────
    const r4 = await callTransition(tx, { username: owner.UserName, documentId: draft1.DocumentID, action: 'CANCEL', expectedStatusId: 0, requestId: newKey('req-owner-cancel-pending') });
    assert(r4.MsgType === 1 && r4.Code === 'INVALID_TRANSITION',
      'Chủ đơn hủy đơn đang Chờ duyệt (0) phải bị INVALID_TRANSITION (CANCEL 0->10 vẫn RETIRED), thực tế: ' + JSON.stringify(r4));
    assert((await statusOf(tx, draft1.DocumentID)) === 0, 'Đơn không được đổi trạng thái khi CANCEL bị chặn.');
    results.push(['OWNER_CANNOT_CANCEL_PENDING_ORDER', true]);

    // ── Ca 4b: chủ đơn HỦY được đơn NHÁP của chính mình (-1 -> 10) — phạm vi CANCEL còn lại ──
    let draftToCancel = null;
    for (const c of candidates) {
      const attempt = await createDraft(tx, { username: owner.UserName, objectId: scopeRow.ObjectID, itemId: c.ItemID, unitPrice: c.UnitPrice });
      if (attempt.MsgType === 5) { draftToCancel = attempt; break; }
    }
    assert(draftToCancel, 'Không tạo được đơn nháp để test CANCEL.');
    const r4b = await callTransition(tx, { username: owner.UserName, documentId: draftToCancel.DocumentID, action: 'CANCEL', expectedStatusId: -1, requestId: newKey('req-owner-cancel-draft') });
    assert(r4b.MsgType === 5, 'Chủ đơn hủy đơn nháp của mình phải thành công, thực tế: ' + JSON.stringify(r4b));
    assert((await statusOf(tx, draftToCancel.DocumentID)) === 10, 'Sau CANCEL đơn nháp, StatusID thật phải là 10 (Đã hủy).');
    results.push(['OWNER_CAN_CANCEL_OWN_DRAFT', true]);

    // ── Ca 5: CANCEL từ StatusID=7 (Khách đã nhận hàng) phải bị chặn dù là chủ đơn ──────
    const deliveredOrder = (await new sql.Request(tx).query(`
      SELECT TOP (1) DocumentID, UserCreate FROM dbo.AR_OrderTbl WHERE StatusID = 7 ORDER BY DocumentID;
    `)).recordset[0];
    if (deliveredOrder && deliveredOrder.UserCreate) {
      const r5 = await callTransition(tx, { username: deliveredOrder.UserCreate, documentId: deliveredOrder.DocumentID, action: 'CANCEL', expectedStatusId: 7, requestId: newKey('req-no-cancel-delivered') });
      assert(r5.MsgType === 1 && r5.Code === 'INVALID_TRANSITION', 'Hủy đơn đã giao (StatusID=7) phải bị INVALID_TRANSITION dù là chủ đơn, thực tế: ' + JSON.stringify(r5));
      results.push(['CANCEL_BLOCKED_FROM_DELIVERED_STATUS', true]);
    } else {
      results.push(['CANCEL_BLOCKED_FROM_DELIVERED_STATUS', 'SKIPPED_NO_STATUS_7_ORDER']);
    }

    // ── Ca 6: stale ExpectedStatusID bị chặn. draft1 thật sự đã ở 0 (SUBMIT ở Ca 1) — gọi lại
    // SUBMIT với ExpectedStatusID=-1 (khớp định nghĩa transition nên qua được bước kiểm hợp
    // đồng) mô phỏng màn hình cũ chưa refresh; phải bị STATUS_CHANGED chứ không phải thành
    // công lần hai. ──────────────────────────────────────────────────────────────────────
    const r6 = await callTransition(tx, { username: owner.UserName, documentId: draft1.DocumentID, action: 'SUBMIT', expectedStatusId: -1, requestId: newKey('req-stale') });
    assert(r6.MsgType === 1 && r6.Code === 'STATUS_CHANGED', 'ExpectedStatusID cũ (-1, thực tế đã là 0) phải bị STATUS_CHANGED, thực tế: ' + JSON.stringify(r6));
    results.push(['STALE_EXPECTED_STATUS_BLOCKED', true]);

    // ── Ca 7: idempotency replay — cùng key gọi 2 lần liên tiếp cho 1 đơn khác ──────────
    let draft3 = null;
    for (const c of candidates) {
      const attempt = await createDraft(tx, { username: owner.UserName, objectId: scopeRow.ObjectID, itemId: c.ItemID, unitPrice: c.UnitPrice });
      if (attempt.MsgType === 5) { draft3 = attempt; break; }
    }
    if (draft3) {
      const replayKey = newKey('idem-real-replay');
      const first = await callTransition(tx, { username: owner.UserName, documentId: draft3.DocumentID, action: 'SUBMIT', expectedStatusId: -1, idempotencyKey: replayKey, requestId: newKey('req-first') });
      assert(first.MsgType === 5 && first.IsReplay === false, 'Lần gọi đầu phải thành công, không phải replay, thực tế: ' + JSON.stringify(first));
      const second = await callTransition(tx, { username: owner.UserName, documentId: draft3.DocumentID, action: 'SUBMIT', expectedStatusId: -1, idempotencyKey: replayKey, requestId: newKey('req-second') });
      assert(second.MsgType === 5 && second.IsReplay === true, 'Lần gọi 2 (cùng idempotency key) phải trả IsReplay=true, thực tế: ' + JSON.stringify(second));
      results.push(['IDEMPOTENCY_REPLAY_WORKS', true]);

      // Replay SAU KHI live status đã đổi (do chính request đầu) vẫn phải trả kết quả cũ,
      // không được báo nhầm STATUS_CHANGED — đúng bug đã gặp và sửa ở ApproveTransition_AI.
      const third = await callTransition(tx, { username: owner.UserName, documentId: draft3.DocumentID, action: 'SUBMIT', expectedStatusId: -1, idempotencyKey: replayKey, requestId: newKey('req-third') });
      assert(third.MsgType === 5 && third.IsReplay === true, 'Replay lần 3 vẫn phải trả kết quả cũ (không phải STATUS_CHANGED), thực tế: ' + JSON.stringify(third));
      results.push(['REPLAY_AFTER_LIVE_STATUS_CHANGED_STILL_WORKS', true]);
    } else {
      results.push(['IDEMPOTENCY_REPLAY_WORKS', 'SKIPPED_NO_THIRD_DRAFT']);
    }

    // ── Ca 8: audit đã ghi cho lần thao tác thành công (SUBMIT của draft1 ở Ca 1) ───────
    const auditCount = (await new sql.Request(tx)
      .input('DocumentID', sql.VarChar(50), draft1.DocumentID)
      .query(`SELECT COUNT(*) AS Cnt FROM dbo.AI_AuditLog WHERE TargetID=@DocumentID AND ActionType='ORDER_OWNER_TRANSITION';`)
    ).recordset[0].Cnt;
    assert(auditCount >= 1, 'Phải có audit cho lần SUBMIT thành công của đơn mồi, thực tế: ' + auditCount);
    results.push(['AUDIT_LOGGED', true]);

    // ── Ca 9: lần CANCEL bị chặn ở Ca 4 cũng phải để lại dấu vết audit (không âm thầm nuốt).
    // Nhánh ReturnFailure của proc ghi @TargetID=NULL nhưng DocumentID nằm trong ExtraInfo. ──
    // STRING_ESCAPE(...,'json') trong proc escape luôn dấu '/' thành '\/' (đúng chuẩn JSON,
    // không phải điều bịa ra) — DocumentID dạng DMB0826/11 phải escape lại y hệt mới khớp LIKE.
    const escapedDocIdForJson = draft1.DocumentID.replace(/\//g, '\\/');
    const failedAuditCount = (await new sql.Request(tx)
      .input('DocPattern', sql.NVarChar(200), '%"documentId":"' + escapedDocIdForJson + '"%')
      .query(`SELECT COUNT(*) AS Cnt FROM dbo.AI_AuditLog WHERE ActionType='ORDER_OWNER_TRANSITION_FAILED' AND ExtraInfo LIKE @DocPattern;`)
    ).recordset[0].Cnt;
    assert(failedAuditCount >= 1, 'Phải có audit cho lần CANCEL bị chặn ở Ca 4, thực tế: ' + failedAuditCount);
    results.push(['FAILED_ATTEMPT_AUDIT_LOGGED', true]);

    console.log(JSON.stringify({ Task: 'VERIFY-DONHANG-OWNERTRANSITION-AI', Status: 'PASS', Results: results }, null, 2));
  } finally {
    await tx.rollback();
    console.error('ROLLED_BACK (không sửa hợp đồng/StatusID/BranchID/audit thật nào)');
    await pool.close();
  }
}

main().catch((error) => {
  console.error(JSON.stringify({ Task: 'VERIFY-DONHANG-OWNERTRANSITION-AI', Status: 'FAIL', Error: error.message }, null, 2));
  process.exitCode = 1;
});
