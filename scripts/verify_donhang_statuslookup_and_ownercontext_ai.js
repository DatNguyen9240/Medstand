'use strict';

/* ORDER-APPROVAL-002 — kiểm chứng 2 proc đọc mới: API_DonHang_StatusLookup_AI (dùng nội bộ
   cho gateway) và API_DonHang_OwnerContext_AI (CanSubmit/CanCancel cho order-detail.js/
   edit-order.js). Transaction luôn rollback, không sửa dữ liệu thật. */

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

async function statusLookup(tx, { documentId, userAutoId }) {
  const r = await new sql.Request(tx)
    .input('DocumentID', sql.VarChar(50), documentId || '')
    .input('UserAutoID', sql.VarChar(50), userAutoId || '')
    .execute('dbo.API_DonHang_StatusLookup_AI');
  return r.recordset[0];
}

async function ownerContext(tx, username, documentId) {
  const r = await new sql.Request(tx)
    .input('Username', sql.VarChar(50), username)
    .input('DocumentID', sql.VarChar(50), documentId)
    .execute('dbo.API_DonHang_OwnerContext_AI');
  return r.recordset[0];
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
    // ── StatusLookup: theo DocumentID ───────────────────────────────────────────────
    const anyOrder = (await new sql.Request(tx).query(`
      SELECT TOP (1) O.DocumentID, O.StatusID
      FROM dbo.AR_OrderTbl O
      WHERE EXISTS (SELECT 1 FROM dbo.AR_OrderDetailTbl D WHERE D.DocumentID = O.DocumentID)
      ORDER BY O.DocumentID;
    `)).recordset[0];
    assert(anyOrder, 'Cần ít nhất 1 đơn thật có dòng chi tiết trong medtest.');

    const byDoc = await statusLookup(tx, { documentId: anyOrder.DocumentID });
    assert(byDoc && byDoc.StatusID === anyOrder.StatusID, 'Lookup theo DocumentID phải ra đúng StatusID thật, thực tế: ' + JSON.stringify(byDoc));
    results.push(['STATUS_LOOKUP_BY_DOCUMENT_ID', true]);

    // ── StatusLookup: theo UserAutoID (resolve qua DocumentID cha) ──────────────────
    const detailRow = (await new sql.Request(tx)
      .input('DocumentID', sql.VarChar(50), anyOrder.DocumentID)
      .query(`SELECT TOP (1) UserAutoID FROM dbo.AR_OrderDetailTbl WHERE DocumentID=@DocumentID;`)
    ).recordset[0];
    if (detailRow) {
      const byAuto = await statusLookup(tx, { userAutoId: detailRow.UserAutoID });
      assert(byAuto && byAuto.DocumentID === anyOrder.DocumentID && byAuto.StatusID === anyOrder.StatusID,
        'Lookup theo UserAutoID phải resolve đúng DocumentID cha và StatusID, thực tế: ' + JSON.stringify(byAuto));
      results.push(['STATUS_LOOKUP_BY_USER_AUTO_ID', true]);
    } else {
      results.push(['STATUS_LOOKUP_BY_USER_AUTO_ID', 'SKIPPED_NO_DETAIL_ROW']);
    }

    // ── StatusLookup: ID không tồn tại -> rỗng ──────────────────────────────────────
    const notFound = await statusLookup(tx, { documentId: 'KHONG_TON_TAI_' + Date.now() });
    assert(!notFound, 'DocumentID không tồn tại phải trả rỗng, thực tế: ' + JSON.stringify(notFound));
    results.push(['STATUS_LOOKUP_NOT_FOUND_EMPTY', true]);

    // ── OwnerContext: chủ đơn của 1 đơn Chờ duyệt (0) phải CanCancel=1 (owner luôn được,
    // miễn transition tồn tại) — bật tạm CANCEL 0->10 trong transaction để kiểm logic tính
    // toán, không phải sign-off thật ──────────────────────────────────────────────────
    const pendingOrder = (await new sql.Request(tx).query(`
      SELECT TOP (1) DocumentID, UserCreate, BranchID FROM dbo.AR_OrderTbl WHERE StatusID = 0 AND COALESCE(UserCreate,'')<>'' ORDER BY DocumentID;
    `)).recordset[0];
    assert(pendingOrder, 'Cần 1 đơn StatusID=0 có UserCreate thật trong medtest.');

    const ctxBefore = await ownerContext(tx, pendingOrder.UserCreate, pendingOrder.DocumentID);
    assert(ctxBefore.StatusID === 0, 'OwnerContext phải trả đúng StatusID thật.');
    assert(ctxBefore.CanCancel === false, 'Khi CANCEL còn DRAFT (chưa sign-off), CanCancel phải là false, thực tế: ' + JSON.stringify(ctxBefore));
    results.push(['OWNERCONTEXT_CANCANCEL_FALSE_BEFORE_SIGNOFF', true]);

    await new sql.Request(tx).query(`
      UPDATE dbo.AI_OrderApprovalTransitionTbl
      SET Status='APPROVED', ApprovedBy='VERIFY_SCRIPT', ApprovalRef=N'ROLLBACK-ONLY TEST', EffectiveFrom=SYSUTCDATETIME(), EffectiveTo=NULL
      WHERE ContractVersion='ORDER-APPROVAL-002' AND ActionCode IN ('SUBMIT','CANCEL');
    `);

    const ctxOwner = await ownerContext(tx, pendingOrder.UserCreate, pendingOrder.DocumentID);
    assert(ctxOwner.CanCancel === true, 'Sau khi bật CANCEL, chủ đơn phải CanCancel=true, thực tế: ' + JSON.stringify(ctxOwner));
    results.push(['OWNERCONTEXT_OWNER_CAN_CANCEL_AFTER_ENABLE', true]);

    // ── OwnerContext: người không liên quan, không role, không phải chủ -> CanCancel=false ──
    const unrelated = (await new sql.Request(tx)
      .input('UserCreate', sql.VarChar(50), pendingOrder.UserCreate)
      .query(`
        SELECT TOP (1) UserName FROM dbo.SY_User
        WHERE COALESCE(Disable,0)=0 AND UserName <> @UserCreate
          AND COALESCE(Manager,0)=0
          AND UPPER(COALESCE(UserGroupID,'')) NOT IN ('KTDH','KTDH2','TN KTDH','QL','QLMN','ADMIN','SADM','BGD','GD')
        ORDER BY UserName;
      `)).recordset[0];
    if (unrelated) {
      const ctxUnrelated = await ownerContext(tx, unrelated.UserName, pendingOrder.DocumentID);
      // Người không liên quan: hoặc bị che hẳn (ORDER_OUT_OF_SCOPE, nếu khách của đơn cũng
      // ngoài phạm vi ERP của họ) hoặc thấy được đơn nhưng CanCancel/CanSubmit=false — cả 2
      // đều là "không được", không phải lỗi.
      const cannotAct = ctxUnrelated.Code === 'ORDER_OUT_OF_SCOPE'
        || (ctxUnrelated.CanCancel === false && ctxUnrelated.CanSubmit === false);
      assert(cannotAct, 'Người không liên quan không được CanCancel/CanSubmit (hoặc phải bị che hẳn), thực tế: ' + JSON.stringify(ctxUnrelated));
      results.push(['OWNERCONTEXT_UNRELATED_USER_CANNOT', true]);
    } else {
      results.push(['OWNERCONTEXT_UNRELATED_USER_CANNOT', 'SKIPPED_NO_UNRELATED_ACCOUNT']);
    }

    // ── OwnerContext: kế toán/quản lý đúng chi nhánh cũng CanCancel=true cho đơn của người khác ──
    const approver = (await new sql.Request(tx).query(`
      SELECT TOP (1) UserName FROM dbo.SY_User
      WHERE COALESCE(Disable,0)=0 AND UPPER(COALESCE(UserGroupID,'')) IN ('KTDH','KTDH2','TN KTDH','QL','QLMN')
      ORDER BY UserName;
    `)).recordset[0];
    if (approver) {
      await new sql.Request(tx)
        .input('BranchID', sql.VarChar(50), pendingOrder.BranchID)
        .input('UserName', sql.VarChar(50), approver.UserName)
        .query(`UPDATE dbo.SY_User SET BranchID=@BranchID WHERE UserName=@UserName;`);
      const ctxApprover = await ownerContext(tx, approver.UserName, pendingOrder.DocumentID);
      assert(ctxApprover.CanCancel === true, 'Kế toán/quản lý cùng chi nhánh phải CanCancel=true cho đơn người khác, thực tế: ' + JSON.stringify(ctxApprover));
      results.push(['OWNERCONTEXT_APPROVER_ROLE_CAN_CANCEL', true]);
    } else {
      results.push(['OWNERCONTEXT_APPROVER_ROLE_CAN_CANCEL', 'SKIPPED_NO_APPROVER_ACCOUNT']);
    }

    console.log(JSON.stringify({ Task: 'VERIFY-DONHANG-STATUSLOOKUP-AND-OWNERCONTEXT-AI', Status: 'PASS', Results: results }, null, 2));
  } finally {
    await tx.rollback();
    console.error('ROLLED_BACK (không sửa hợp đồng/BranchID/StatusID thật nào)');
    await pool.close();
  }
}

main().catch((error) => {
  console.error(JSON.stringify({ Task: 'VERIFY-DONHANG-STATUSLOOKUP-AND-OWNERCONTEXT-AI', Status: 'FAIL', Error: error.message }, null, 2));
  process.exitCode = 1;
});
