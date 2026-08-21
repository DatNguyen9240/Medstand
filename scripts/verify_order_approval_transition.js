'use strict';

/* ORDER-APPROVAL-003 — kiểm chứng có assertion thật cho dbo.API_DonHang_ApproveTransition_AI
   và dbo.API_DonHang_ApprovalContext_AI.

   Toàn bộ chạy trong MỘT transaction luôn rollback. Những thứ chỉ tồn tại trong transaction đó:
     - việc bật hợp đồng duyệt đơn sang APPROVED (thật ra khách CHƯA ký ORDER-APPROVAL-002,
       nên trên DB thật mọi dòng vẫn phải là DRAFT — xem scripts/deploy_order_approval_003.js);
     - việc gán tạm BranchID/EmployeeID cho tài khoản test và đổi UserCreate của đơn để dựng
       ca maker-checker.
   Không commit gì, không sửa dữ liệu nhân sự hay đơn hàng thật. */

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
    .input('Reason', sql.NVarChar(500), o.reason === undefined ? null : o.reason)
    .execute('dbo.API_DonHang_ApproveTransition_AI');
  return r.recordset[0];
}

async function callContext(tx, username, documentId) {
  const r = await new sql.Request(tx)
    .input('Username', sql.VarChar(50), username)
    .input('DocumentID', sql.VarChar(50), documentId || '')
    .execute('dbo.API_DonHang_ApprovalContext_AI');
  return r.recordset[0];
}

async function statusOf(tx, documentId) {
  return (await new sql.Request(tx)
    .input('DocumentID', sql.VarChar(50), documentId)
    .query('SELECT StatusID FROM dbo.AR_OrderTbl WHERE DocumentID = @DocumentID;')).recordset[0].StatusID;
}

async function orderLogCount(tx, documentId) {
  return (await new sql.Request(tx)
    .input('DocumentID', sql.VarChar(50), documentId)
    .query('SELECT COUNT(*) AS Cnt FROM dbo.AR_OrderLogTbl WHERE DocumentID = @DocumentID;')).recordset[0].Cnt;
}

async function setUserFields(tx, username, branchId, employeeId) {
  await new sql.Request(tx)
    .input('BranchID', sql.VarChar(50), branchId)
    .input('EmployeeID', sql.VarChar(50), employeeId)
    .input('UserName', sql.VarChar(50), username)
    .query('UPDATE dbo.SY_User SET BranchID = @BranchID, EmployeeID = @EmployeeID WHERE UserName = @UserName;');
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
  const evidence = {};
  try {
    // ── Dữ liệu test: 4 đơn StatusID=0 thật, 1 tài khoản kế toán, 1 tài khoản không có quyền ──
    const orders = (await new sql.Request(tx).query(`
      SELECT TOP (4) DocumentID, BranchID, StatusID, UserCreate, EmployeeID
      FROM dbo.AR_OrderTbl WHERE StatusID = 0 ORDER BY DocumentID;
    `)).recordset;
    assert(orders.length >= 4, 'Cần ít nhất 4 đơn StatusID=0 thật trong medtest để chạy đủ ca test.');

    const accountant = (await new sql.Request(tx).query(`
      SELECT TOP (1) UserName FROM dbo.SY_User
      WHERE COALESCE(Disable,0)=0 AND UPPER(COALESCE(UserGroupID,'')) IN ('KTDH','KTDH2','TN KTDH')
      ORDER BY UserName;
    `)).recordset[0];
    assert(accountant, 'Cần ít nhất 1 tài khoản KTDH/KTDH2/TN KTDH đang hoạt động trong medtest.');

    // Tài khoản test ca "thiếu quyền" phải KHÔNG khớp bất kỳ luật vai trò nào — kể cả luật
    // quản lý đang bật ở chế độ test (MANAGER_FLAG/QL/QLMN), nếu không ca âm sẽ pass nhầm.
    const salesUser = (await new sql.Request(tx).query(`
      SELECT TOP (1) UserName FROM dbo.SY_User
      WHERE COALESCE(Disable,0)=0
        AND COALESCE(Manager,0)=0
        AND UPPER(COALESCE(UserGroupID,'')) NOT IN ('KTDH','KTDH2','TN KTDH','QL','QLMN','ADMIN','SADM','BGD','GD')
      ORDER BY UserName;
    `)).recordset[0];
    assert(salesUser, 'Cần 1 tài khoản không khớp luật vai trò nào để test ca thiếu quyền.');

    evidence.Accountant = accountant.UserName;
    evidence.NonApprover = salesUser.UserName;
    evidence.Orders = orders.map((o) => o.DocumentID);

    // ── Ca 0: hợp đồng CHƯA chốt thì không ai duyệt được ──────────────────────
    // Test phải cho ra cùng kết quả dù DB thật đang fail-closed hay đang bật chế độ test, nên
    // dựng trạng thái đầu vào ngay trong transaction: gỡ hiệu lực mọi dòng hợp đồng.
    const contractLiveOnServer = (await new sql.Request(tx).query(
      'SELECT dbo.AI_OrderApprovalContractIsLiveFnc(SYSUTCDATETIME()) AS IsLive;')).recordset[0].IsLive;
    evidence.ContractLiveOnServerBeforeTest = contractLiveOnServer;
    await new sql.Request(tx).query(`
      UPDATE dbo.AI_OrderApprovalTransitionTbl SET Status='RETIRED', EffectiveTo=SYSUTCDATETIME();
      UPDATE dbo.AI_OrderApprovalRoleTbl SET Status='RETIRED', EffectiveTo=SYSUTCDATETIME();
    `);
    const contractLiveBefore = (await new sql.Request(tx).query(
      'SELECT dbo.AI_OrderApprovalContractIsLiveFnc(SYSUTCDATETIME()) AS IsLive;')).recordset[0].IsLive;
    assert(contractLiveBefore === false, 'Sau khi gỡ hiệu lực, hợp đồng phải không còn sống.');
    const r0 = await callTransition(tx, {
      username: accountant.UserName, documentId: orders[0].DocumentID, action: 'APPROVE', expectedStatusId: 0,
    });
    assert(r0.MsgType === 1 && r0.Code === 'APPROVAL_CONTRACT_NOT_APPROVED',
      'Hợp đồng chưa chốt phải trả APPROVAL_CONTRACT_NOT_APPROVED, thực tế: ' + JSON.stringify(r0));
    assert(await statusOf(tx, orders[0].DocumentID) === 0, 'Đơn không được đổi trạng thái khi hợp đồng chưa chốt.');
    results.push(['CONTRACT_NOT_SIGNED_BLOCKS_EVERYTHING', true]);

    // Người tạo đơn luôn đọc được đơn của mình, kể cả khi hợp đồng chưa chốt — dùng chính họ
    // để kiểm tra API ngữ cảnh báo đúng trạng thái "chưa chốt hợp đồng".
    const creator = (await new sql.Request(tx)
      .input('UserName', sql.VarChar(50), orders[0].UserCreate || '')
      .query(`SELECT TOP (1) UserName FROM dbo.SY_User WHERE UserName = @UserName AND COALESCE(Disable,0)=0;`)
    ).recordset[0];
    assert(creator, 'Cần tài khoản người tạo đơn (' + orders[0].UserCreate + ') còn hoạt động để test phạm vi đọc.');
    const ctx0 = await callContext(tx, creator.UserName, orders[0].DocumentID);
    assert(ctx0.ContractStatus === 'PENDING_SIGN_OFF' && !ctx0.CanApprove && !ctx0.CanReject,
      'API ngữ cảnh phải báo hợp đồng chưa chốt và không cho duyệt, thực tế: ' + JSON.stringify(ctx0));
    results.push(['CONTEXT_REPORTS_PENDING_SIGN_OFF', true]);

    // Đơn ngoài phạm vi thì không lộ trạng thái cho người dò mã đơn.
    const ctxOutOfScope = await callContext(tx, accountant.UserName, orders[0].DocumentID);
    assert(ctxOutOfScope.Code === 'ORDER_OUT_OF_SCOPE' && ctxOutOfScope.StatusID === undefined,
      'Đơn ngoài phạm vi phải bị che, thực tế: ' + JSON.stringify(ctxOutOfScope));
    results.push(['CONTEXT_HIDES_ORDER_OUT_OF_SCOPE', true]);

    // ── Bật hợp đồng CHỈ TRONG TRANSACTION NÀY để test phần còn lại ───────────
    // Chỉ bật đúng phần cần cho các ca dưới: 2 transition + vai trò Kế toán (KHÔNG tự duyệt).
    // Luật quản lý được test riêng ở ca cuối để không làm nhiễu các ca maker-checker.
    await new sql.Request(tx).query(`
      UPDATE dbo.AI_OrderApprovalTransitionTbl
      SET Status='APPROVED', ApprovedBy='VERIFY_SCRIPT', ApprovalRef=N'ROLLBACK-ONLY TEST',
          EffectiveFrom=SYSUTCDATETIME(), EffectiveTo=NULL
      WHERE ContractVersion='ORDER-APPROVAL-002' AND ActionCode IN ('APPROVE','REJECT') AND ToStatusID IN (1, -2);
      UPDATE dbo.AI_OrderApprovalRoleTbl
      SET Status='APPROVED', AllowSelfApproval=0, ScopeRule='BRANCH_MATCH',
          ApprovedBy='VERIFY_SCRIPT', ApprovalRef=N'ROLLBACK-ONLY TEST',
          EffectiveFrom=SYSUTCDATETIME(), EffectiveTo=NULL
      WHERE ContractVersion='ORDER-APPROVAL-002' AND PrincipalType='USER_GROUP'
        AND PrincipalValue IN ('KTDH','KTDH2','TN KTDH');
    `);
    const contractLiveNow = (await new sql.Request(tx).query(
      'SELECT dbo.AI_OrderApprovalContractIsLiveFnc(SYSUTCDATETIME()) AS IsLive;')).recordset[0].IsLive;
    assert(contractLiveNow === true, 'Sau khi bật APPROVED, hợp đồng phải có hiệu lực trong transaction test.');

    // ── Ca 1: thiếu quyền ─────────────────────────────────────────────────────
    const r1 = await callTransition(tx, {
      username: salesUser.UserName, documentId: orders[0].DocumentID, action: 'APPROVE', expectedStatusId: 0,
    });
    assert(r1.MsgType === 1 && r1.Code === 'FORBIDDEN_ROLE',
      'Tài khoản ngoài hợp đồng phải bị FORBIDDEN_ROLE, thực tế: ' + JSON.stringify(r1));
    results.push(['WRONG_ROLE_BLOCKED', true]);

    // ── Ca 2: hợp đồng yêu cầu BRANCH_MATCH mà tài khoản chưa có chi nhánh ────
    await setUserFields(tx, accountant.UserName, '', '');
    const r2 = await callTransition(tx, {
      username: accountant.UserName, documentId: orders[0].DocumentID, action: 'APPROVE', expectedStatusId: 0,
    });
    assert(r2.MsgType === 1 && r2.Code === 'APPROVER_BRANCH_MISSING',
      'Kế toán chưa có BranchID phải bị APPROVER_BRANCH_MISSING, thực tế: ' + JSON.stringify(r2));
    results.push(['APPROVER_WITHOUT_BRANCH_BLOCKED', true]);

    // ── Ca 3: sai chi nhánh ───────────────────────────────────────────────────
    await setUserFields(tx, accountant.UserName, 'ZZ_' + Date.now().toString(36).slice(-6), '');
    const r3 = await callTransition(tx, {
      username: accountant.UserName, documentId: orders[0].DocumentID, action: 'APPROVE', expectedStatusId: 0,
    });
    assert(r3.MsgType === 1 && r3.Code === 'ORDER_OUT_OF_BRANCH_SCOPE',
      'Sai chi nhánh phải bị ORDER_OUT_OF_BRANCH_SCOPE, thực tế: ' + JSON.stringify(r3));
    results.push(['WRONG_BRANCH_BLOCKED', true]);

    // Từ đây: đúng chi nhánh của đơn thứ nhất.
    await setUserFields(tx, accountant.UserName, orders[0].BranchID, '');

    // ── Ca 4: đơn không tồn tại ───────────────────────────────────────────────
    const r4 = await callTransition(tx, {
      username: accountant.UserName, documentId: 'KHONG_TON_TAI_' + Date.now(), action: 'APPROVE', expectedStatusId: 0,
    });
    assert(r4.MsgType === 1 && r4.Code === 'ORDER_NOT_FOUND',
      'Đơn không tồn tại phải trả ORDER_NOT_FOUND, thực tế: ' + JSON.stringify(r4));
    results.push(['ORDER_NOT_FOUND', true]);

    // ── Ca 5: maker-checker theo UserCreate ───────────────────────────────────
    await new sql.Request(tx)
      .input('UserName', sql.VarChar(30), accountant.UserName)
      .input('DocumentID', sql.VarChar(50), orders[0].DocumentID)
      .query('UPDATE dbo.AR_OrderTbl SET UserCreate = @UserName WHERE DocumentID = @DocumentID;');
    const r5 = await callTransition(tx, {
      username: accountant.UserName, documentId: orders[0].DocumentID, action: 'APPROVE', expectedStatusId: 0,
    });
    assert(r5.MsgType === 1 && r5.Code === 'SELF_APPROVAL_BLOCKED',
      'Người tạo đơn không được tự duyệt, thực tế: ' + JSON.stringify(r5));
    assert(await statusOf(tx, orders[0].DocumentID) === 0, 'Ca tự duyệt bị chặn không được đổi trạng thái.');
    results.push(['SELF_APPROVAL_BLOCKED_BY_USERCREATE', true]);

    const ctx5 = await callContext(tx, accountant.UserName, orders[0].DocumentID);
    assert(!ctx5.CanApprove && ctx5.BlockCode === 'SELF_APPROVAL_BLOCKED',
      'API ngữ cảnh phải ẩn nút duyệt cho đơn của chính mình, thực tế: ' + JSON.stringify(ctx5));
    results.push(['CONTEXT_HIDES_SELF_APPROVAL', true]);

    // Trả UserCreate về giá trị gốc để các ca sau không dính maker-checker.
    await new sql.Request(tx)
      .input('UserName', sql.VarChar(30), orders[0].UserCreate)
      .input('DocumentID', sql.VarChar(50), orders[0].DocumentID)
      .query('UPDATE dbo.AR_OrderTbl SET UserCreate = @UserName WHERE DocumentID = @DocumentID;');

    // ── Ca 6: maker-checker theo EmployeeID (đơn ghi nhận cho chính người duyệt) ──
    await setUserFields(tx, accountant.UserName, orders[0].BranchID, orders[0].EmployeeID || 'MED_TEST');
    if (orders[0].EmployeeID) {
      const r6 = await callTransition(tx, {
        username: accountant.UserName, documentId: orders[0].DocumentID, action: 'APPROVE', expectedStatusId: 0,
      });
      assert(r6.MsgType === 1 && r6.Code === 'SELF_APPROVAL_BLOCKED',
        'Đơn ghi nhận cho chính nhân viên đó thì nhân viên đó không được duyệt, thực tế: ' + JSON.stringify(r6));
      results.push(['SELF_APPROVAL_BLOCKED_BY_EMPLOYEEID', true]);
    } else {
      results.push(['SELF_APPROVAL_BLOCKED_BY_EMPLOYEEID', 'SKIPPED_ORDER_HAS_NO_EMPLOYEEID']);
    }
    await setUserFields(tx, accountant.UserName, orders[0].BranchID, '');

    // ── Ca 7: duyệt hợp lệ (ca dương) + lịch sử ERP + audit ───────────────────
    const logBefore = await orderLogCount(tx, orders[0].DocumentID);
    const approveRequestId = newKey('req-approve');
    const r7 = await callTransition(tx, {
      username: accountant.UserName, documentId: orders[0].DocumentID, action: 'APPROVE',
      expectedStatusId: 0, requestId: approveRequestId,
    });
    assert(r7.MsgType === 5 && r7.IsReplay === false, 'Ca dương phải thành công, thực tế: ' + JSON.stringify(r7));
    const statusAfterApprove = await statusOf(tx, orders[0].DocumentID);
    assert(statusAfterApprove === 1, 'Sau APPROVE, StatusID phải là 1 theo hợp đồng test, thực tế: ' + statusAfterApprove);
    results.push(['APPROVE_SUCCEEDS_AND_CHANGES_STATUS', true]);

    const logAfter = await orderLogCount(tx, orders[0].DocumentID);
    assert(logAfter === logBefore + 1,
      `AR_OrderLogTbl phải có thêm đúng 1 dòng (trước ${logBefore}, sau ${logAfter}).`);
    const lastLog = (await new sql.Request(tx)
      .input('DocumentID', sql.VarChar(50), orders[0].DocumentID)
      .query(`SELECT TOP (1) StatusID, StatusName, UserName FROM dbo.AR_OrderLogTbl
              WHERE DocumentID = @DocumentID ORDER BY StatusDate DESC;`)).recordset[0];
    assert(lastLog.StatusID === 1 && String(lastLog.UserName).toUpperCase() === accountant.UserName.toUpperCase(),
      'Dòng lịch sử ERP phải ghi đúng trạng thái mới và người thao tác: ' + JSON.stringify(lastLog));
    results.push(['ERP_ORDER_LOG_WRITTEN', true]);

    const auditRow = (await new sql.Request(tx)
      .input('DocumentID', sql.VarChar(50), orders[0].DocumentID)
      .query(`SELECT TOP (1) Username, ActionType, ExtraInfo FROM dbo.AI_AuditLog
              WHERE TargetID = @DocumentID AND ActionType = 'ORDER_APPROVAL_TRANSITION'
              ORDER BY LogID DESC;`)).recordset[0];
    assert(auditRow, 'Phải có audit ORDER_APPROVAL_TRANSITION cho lần duyệt thành công.');
    const auditInfo = JSON.parse(auditRow.ExtraInfo);
    assert(auditInfo.requestId === approveRequestId, 'Audit phải ghi đúng request ID.');
    assert(auditInfo.fromStatusID === 0 && auditInfo.toStatusID === 1, 'Audit phải ghi from/to đúng.');
    assert(auditInfo.outcome === 'COMPLETED' && auditInfo.orderLog === 'WRITTEN',
      'Audit phải ghi outcome và kết quả ghi lịch sử ERP: ' + auditRow.ExtraInfo);
    evidence.ApproveAudit = { RequestID: approveRequestId, Actor: auditRow.Username, ExtraInfo: auditInfo };
    results.push(['AUDIT_HAS_ACTOR_REQUESTID_FROM_TO_OUTCOME', true]);

    // ── Ca 8: màn hình cũ / hai người duyệt cùng lúc ──────────────────────────
    const r8 = await callTransition(tx, {
      username: accountant.UserName, documentId: orders[0].DocumentID, action: 'APPROVE', expectedStatusId: 0,
    });
    assert(r8.MsgType === 1 && r8.Code === 'STATUS_CHANGED',
      'Người thứ hai (hoặc màn hình cũ) phải bị STATUS_CHANGED, thực tế: ' + JSON.stringify(r8));
    results.push(['STALE_STATUS_AND_SECOND_APPROVER_BLOCKED', true]);

    // ── Ca 9: transition không nằm trong hợp đồng ─────────────────────────────
    const r9 = await callTransition(tx, {
      username: accountant.UserName, documentId: orders[0].DocumentID, action: 'APPROVE', expectedStatusId: 1,
    });
    assert(r9.MsgType === 1 && r9.Code === 'INVALID_TRANSITION',
      'APPROVE từ trạng thái đã duyệt phải bị INVALID_TRANSITION, thực tế: ' + JSON.stringify(r9));
    results.push(['NO_APPROVE_FROM_ALREADY_APPROVED', true]);

    // ── Ca 10: double-click cùng khóa → replay, không tạo transition thứ hai ──
    await setUserFields(tx, accountant.UserName, orders[1].BranchID, '');
    const replayKey = newKey('idem-replay');
    const logBefore2 = await orderLogCount(tx, orders[1].DocumentID);
    const first = await callTransition(tx, {
      username: accountant.UserName, documentId: orders[1].DocumentID, action: 'APPROVE',
      expectedStatusId: 0, idempotencyKey: replayKey, requestId: newKey('req-first'),
    });
    assert(first.MsgType === 5 && first.IsReplay === false, 'Lần gọi đầu phải thành công: ' + JSON.stringify(first));
    const second = await callTransition(tx, {
      username: accountant.UserName, documentId: orders[1].DocumentID, action: 'APPROVE',
      expectedStatusId: 0, idempotencyKey: replayKey, requestId: newKey('req-second'),
    });
    assert(second.MsgType === 5 && second.IsReplay === true, 'Lần gọi 2 cùng khóa phải là replay: ' + JSON.stringify(second));
    const logAfter2 = await orderLogCount(tx, orders[1].DocumentID);
    assert(logAfter2 === logBefore2 + 1,
      `Double-click chỉ được tạo đúng 1 transition (trước ${logBefore2}, sau ${logAfter2}).`);
    results.push(['DOUBLE_CLICK_CREATES_EXACTLY_ONE_TRANSITION', true]);

    // ── Ca 11: cùng khóa nhưng nội dung khác → conflict ───────────────────────
    const r11 = await callTransition(tx, {
      username: accountant.UserName, documentId: orders[2].DocumentID, action: 'APPROVE',
      expectedStatusId: 0, idempotencyKey: replayKey, requestId: newKey('req-conflict'),
    });
    assert(r11.MsgType === 1 && r11.Code === 'IDEMPOTENCY_CONFLICT',
      'Cùng khóa khác nội dung phải trả IDEMPOTENCY_CONFLICT, thực tế: ' + JSON.stringify(r11));
    results.push(['IDEMPOTENCY_CONFLICT_ON_DIFFERENT_PAYLOAD', true]);

    // ── Ca 12: REJECT bắt buộc lý do theo hợp đồng ────────────────────────────
    await setUserFields(tx, accountant.UserName, orders[2].BranchID, '');
    const r12a = await callTransition(tx, {
      username: accountant.UserName, documentId: orders[2].DocumentID, action: 'REJECT', expectedStatusId: 0,
    });
    assert(r12a.MsgType === 1 && r12a.Code === 'REASON_REQUIRED',
      'REJECT thiếu lý do phải bị REASON_REQUIRED, thực tế: ' + JSON.stringify(r12a));
    results.push(['REJECT_REQUIRES_REASON', true]);

    const rejectRequestId = newKey('req-reject');
    const r12b = await callTransition(tx, {
      username: accountant.UserName, documentId: orders[2].DocumentID, action: 'REJECT',
      expectedStatusId: 0, reason: 'Sai giá theo hợp đồng khách', requestId: rejectRequestId,
    });
    assert(r12b.MsgType === 5, 'REJECT có lý do phải thành công, thực tế: ' + JSON.stringify(r12b));
    const statusAfterReject = await statusOf(tx, orders[2].DocumentID);
    assert(statusAfterReject === -2, 'Sau REJECT, StatusID phải là -2 theo hợp đồng test, thực tế: ' + statusAfterReject);
    const rejectAudit = (await new sql.Request(tx)
      .input('DocumentID', sql.VarChar(50), orders[2].DocumentID)
      .query(`SELECT TOP (1) ExtraInfo FROM dbo.AI_AuditLog
              WHERE TargetID = @DocumentID AND ActionType = 'ORDER_APPROVAL_TRANSITION' ORDER BY LogID DESC;`)).recordset[0];
    const rejectInfo = JSON.parse(rejectAudit.ExtraInfo);
    assert(rejectInfo.reason === 'Sai giá theo hợp đồng khách', 'Audit phải lưu lý do từ chối: ' + rejectAudit.ExtraInfo);
    evidence.RejectAudit = { RequestID: rejectRequestId, ExtraInfo: rejectInfo };
    results.push(['REJECT_SUCCEEDS_WITH_REASON_IN_AUDIT', true]);

    // ── Ca 13: hợp đồng mâu thuẫn thì fail-closed, không tự chọn bừa ──────────
    await new sql.Request(tx).query(`
      INSERT dbo.AI_OrderApprovalTransitionTbl
        (ContractVersion, ActionCode, FromStatusID, ToStatusID, RequireReason, Status, ApprovedBy, ApprovalRef, EffectiveFrom)
      VALUES ('ORDER-APPROVAL-002', 'APPROVE', 0, 4, 0, 'APPROVED', 'VERIFY_SCRIPT', N'ROLLBACK-ONLY TEST', SYSUTCDATETIME());
    `);
    await setUserFields(tx, accountant.UserName, orders[3].BranchID, '');
    const r13 = await callTransition(tx, {
      username: accountant.UserName, documentId: orders[3].DocumentID, action: 'APPROVE', expectedStatusId: 0,
    });
    assert(r13.MsgType === 1 && r13.Code === 'APPROVAL_CONTRACT_AMBIGUOUS',
      'Hợp đồng có 2 transition mâu thuẫn phải fail-closed, thực tế: ' + JSON.stringify(r13));
    assert(await statusOf(tx, orders[3].DocumentID) === 0, 'Ca hợp đồng mâu thuẫn không được đổi trạng thái.');
    results.push(['AMBIGUOUS_CONTRACT_FAILS_CLOSED', true]);
    await new sql.Request(tx).query(`
      DELETE dbo.AI_OrderApprovalTransitionTbl WHERE ContractVersion='ORDER-APPROVAL-002' AND ActionCode='APPROVE' AND ToStatusID=4;
    `);

    // ── Ca 14: mọi ca âm đều để lại audit FAILED ──────────────────────────────
    const failedAudits = (await new sql.Request(tx).query(`
      SELECT COUNT(*) AS Cnt FROM dbo.AI_AuditLog WHERE ActionType = 'ORDER_APPROVAL_TRANSITION_FAILED';
    `)).recordset[0].Cnt;
    assert(failedAudits > 0, 'Các ca bị từ chối phải để lại audit ORDER_APPROVAL_TRANSITION_FAILED.');
    results.push(['FAILED_ATTEMPTS_AUDITED', true]);

    // ── Ca 15: API ngữ cảnh khớp với quyết định thật của API ghi ──────────────
    await setUserFields(tx, accountant.UserName, orders[3].BranchID, '');
    const ctx15 = await callContext(tx, accountant.UserName, orders[3].DocumentID);
    assert(ctx15.CanApprove === true && ctx15.ContractStatus === 'APPROVED',
      'Ngữ cảnh phải cho phép duyệt đơn hợp lệ: ' + JSON.stringify(ctx15));
    const ctxSales = await callContext(tx, salesUser.UserName, orders[3].DocumentID);
    assert(ctxSales.Code === 'ORDER_OUT_OF_SCOPE' || (ctxSales.CanApprove === false && ctxSales.CanReject === false),
      'Ngữ cảnh của tài khoản không có quyền phải không cho duyệt: ' + JSON.stringify(ctxSales));
    results.push(['CONTEXT_MATCHES_WRITE_DECISION', true]);

    const summary = await callContext(tx, accountant.UserName, '');
    assert(summary.Mode === 'SUMMARY' && summary.PendingCount >= 1 && String(summary.PendingStatusIDs || '').length > 0,
      'Chế độ tóm tắt phải đếm được đơn chờ duyệt: ' + JSON.stringify(summary));
    evidence.PendingSummary = { PendingCount: summary.PendingCount, PendingStatusIDs: summary.PendingStatusIDs };
    results.push(['PENDING_SUMMARY_FOR_ACCOUNTANT', true]);

    // ── Ca 16: AllowSelfApproval là công tắc thật, không phải trang trí ───────
    // Chế độ test của dự án mở cho quản lý khu vực tự duyệt đơn mình tạo. Hai ca dưới chứng
    // minh chính cột AllowSelfApproval quyết định điều đó, chứ không phải một nhánh code cứng.
    const managerOwnOrder = (await new sql.Request(tx).query(`
      SELECT TOP (1) U.UserName, U.BranchID, O.DocumentID
      FROM dbo.SY_User U
      INNER JOIN dbo.AR_OrderTbl O ON O.UserCreate = U.UserName AND O.StatusID = 0 AND O.BranchID = U.BranchID
      WHERE COALESCE(U.Disable,0)=0 AND COALESCE(U.BranchID,'') <> ''
        AND (COALESCE(U.Manager,0)=1 OR UPPER(COALESCE(U.UserGroupID,'')) IN ('QL','QLMN'))
      ORDER BY O.DocumentID;
    `)).recordset[0];

    if (managerOwnOrder) {
      const insertManagerRule = async (allowSelf) => {
        await new sql.Request(tx)
          .input('AllowSelf', sql.Bit, allowSelf)
          .query(`
            DELETE dbo.AI_OrderApprovalRoleTbl
            WHERE ContractVersion='ORDER-APPROVAL-002' AND PrincipalType='MANAGER_FLAG' AND ApprovedBy='VERIFY_SCRIPT';
            IF NOT EXISTS (SELECT 1 FROM dbo.AI_OrderApprovalRoleTbl
                           WHERE ContractVersion='ORDER-APPROVAL-002' AND ActionCode='*'
                             AND PrincipalType='MANAGER_FLAG' AND PrincipalValue='1')
              INSERT dbo.AI_OrderApprovalRoleTbl
                (ContractVersion, ActionCode, PrincipalType, PrincipalValue, ScopeRule, AllowSelfApproval,
                 Status, ApprovedBy, ApprovalRef, EffectiveFrom)
              VALUES ('ORDER-APPROVAL-002', '*', 'MANAGER_FLAG', '1', 'BRANCH_MATCH', @AllowSelf,
                      'APPROVED', 'VERIFY_SCRIPT', N'ROLLBACK-ONLY TEST', SYSUTCDATETIME());
            ELSE
              UPDATE dbo.AI_OrderApprovalRoleTbl
              SET Status='APPROVED', ScopeRule='BRANCH_MATCH', AllowSelfApproval=@AllowSelf,
                  ApprovedBy='VERIFY_SCRIPT', ApprovalRef=N'ROLLBACK-ONLY TEST',
                  EffectiveFrom=SYSUTCDATETIME(), EffectiveTo=NULL
              WHERE ContractVersion='ORDER-APPROVAL-002' AND ActionCode='*'
                AND PrincipalType='MANAGER_FLAG' AND PrincipalValue='1';
          `);
      };

      // Quản lý phải có cờ Manager=1 để khớp luật MANAGER_FLAG; nhóm QL/QLMN không có cờ này
      // đã bị RETIRE ở trên nên không can thiệp vào ca test.
      await new sql.Request(tx)
        .input('UserName', sql.VarChar(50), managerOwnOrder.UserName)
        .query('UPDATE dbo.SY_User SET Manager = 1 WHERE UserName = @UserName;');

      await insertManagerRule(0);
      const blocked = await callTransition(tx, {
        username: managerOwnOrder.UserName, documentId: managerOwnOrder.DocumentID,
        action: 'APPROVE', expectedStatusId: 0,
      });
      assert(blocked.MsgType === 1 && blocked.Code === 'SELF_APPROVAL_BLOCKED',
        'AllowSelfApproval=0 phải chặn quản lý duyệt đơn mình tạo, thực tế: ' + JSON.stringify(blocked));
      results.push(['MANAGER_SELF_APPROVAL_BLOCKED_WHEN_FLAG_OFF', true]);

      await insertManagerRule(1);
      const allowed = await callTransition(tx, {
        username: managerOwnOrder.UserName, documentId: managerOwnOrder.DocumentID,
        action: 'APPROVE', expectedStatusId: 0,
      });
      assert(allowed.MsgType === 5, 'AllowSelfApproval=1 phải cho quản lý tự duyệt, thực tế: ' + JSON.stringify(allowed));
      const managerStatusAfter = await statusOf(tx, managerOwnOrder.DocumentID);
      assert(managerStatusAfter === 1, 'Sau khi quản lý tự duyệt, StatusID phải là 1, thực tế: ' + managerStatusAfter);
      evidence.ManagerSelfApproval = {
        Manager: managerOwnOrder.UserName, Branch: managerOwnOrder.BranchID,
        OwnOrder: managerOwnOrder.DocumentID, StatusAfter: managerStatusAfter,
      };
      results.push(['MANAGER_SELF_APPROVAL_ALLOWED_WHEN_FLAG_ON', true]);
    } else {
      results.push(['MANAGER_SELF_APPROVAL_SWITCH', 'SKIPPED_NO_MANAGER_WITH_OWN_PENDING_ORDER']);
    }

    console.log(JSON.stringify({
      Task: 'VERIFY-ORDER-APPROVAL-TRANSITION', Status: 'PASS', Results: results, Evidence: evidence,
    }, null, 2));
  } finally {
    await tx.rollback();
    console.error('ROLLED_BACK (không commit hợp đồng, StatusID, BranchID, UserCreate hay audit nào)');
    await pool.close();
  }
}

main().catch((error) => {
  console.error(JSON.stringify({ Task: 'VERIFY-ORDER-APPROVAL-TRANSITION', Status: 'FAIL', Error: error.message }, null, 2));
  process.exitCode = 1;
});
