'use strict';

/* Kiểm chứng có assertion thật cho dbo.API_DonHang_ApproveTransition_AI (ORDER-APPROVAL-002/003).
   Chạy trong 1 transaction luôn rollback — kể cả việc tạm gán BranchID cho tài khoản kế toán
   test (vì dữ liệu thật hiện tại có BranchID rỗng) chỉ tồn tại trong transaction này, không
   commit, không sửa dữ liệu nhân sự thật. */
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

async function callTransition(tx, { username, documentId, action, expectedStatusId, idempotencyKey, requestId }) {
  const r = await new sql.Request(tx)
    .input('Username', sql.VarChar(50), username)
    .input('DocumentID', sql.VarChar(50), documentId)
    .input('Action', sql.VarChar(20), action)
    .input('ExpectedStatusID', sql.Int, expectedStatusId)
    .input('IdempotencyKey', sql.VarChar(128), idempotencyKey || newKey('idem'))
    .input('RequestID', sql.VarChar(100), requestId || newKey('req'))
    .execute('dbo.API_DonHang_ApproveTransition_AI');
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
    // Tìm 1 đơn StatusID=0 thật để test (không tạo đơn giả).
    const order = (await new sql.Request(tx).query(`
      SELECT TOP (1) DocumentID, BranchID, StatusID FROM dbo.AR_OrderTbl WHERE StatusID = 0 ORDER BY DocumentID;
    `)).recordset[0];
    assert(order, 'Cần ít nhất 1 đơn StatusID=0 (Chờ duyệt) thật trong medtest để test.');

    const accountant = (await new sql.Request(tx)
      .input('BranchID', sql.VarChar(50), order.BranchID)
      .query(`SELECT TOP (1) UserName FROM dbo.SY_User WHERE COALESCE(Disable,0)=0 AND UPPER(COALESCE(UserGroupID,'')) IN ('KTDH','KTDH2','TN KTDH') ORDER BY UserName;`)
    ).recordset[0];
    assert(accountant, 'Cần ít nhất 1 tài khoản KTDH/KTDH2/TN KTDH đang hoạt động (Disable=0) trong medtest.');

    // 21/08/2026: vai trò được duyệt đã mở rộng thêm quản lý/toàn hệ thống, nên "sales" test
    // user ở đây phải loại luôn các nhóm đó — không chỉ loại KTDH — nếu không ca WRONG_ROLE_BLOCKED
    // có thể vô tình chọn trúng 1 tài khoản quản lý và bị pass nhầm.
    const salesUser = (await new sql.Request(tx).query(`
      SELECT TOP (1) UserName FROM dbo.SY_User
      WHERE COALESCE(Disable,0)=0
        AND COALESCE(Manager,0)=0
        AND UPPER(COALESCE(UserGroupID,'')) NOT IN ('KTDH','KTDH2','TN KTDH','QL','QLMN','ADMIN','SADM','BGD','GD')
      ORDER BY UserName;
    `)).recordset[0];

    const managerUser = (await new sql.Request(tx).query(`
      SELECT TOP (1) UserName FROM dbo.SY_User
      WHERE COALESCE(Disable,0)=0
        AND UPPER(COALESCE(UserGroupID,'')) NOT IN ('KTDH','KTDH2','TN KTDH')
        AND (COALESCE(Manager,0)=1 OR UPPER(COALESCE(UserGroupID,'')) IN ('QL','QLMN','ADMIN','SADM','BGD','GD'))
      ORDER BY UserName;
    `)).recordset[0];

    // ── Ca 0: Sai chi nhánh phải bị chặn (gán tạm 1 branch KHÁC branch của đơn) ──
    const wrongBranch = 'ZZ_' + Date.now().toString(36).slice(-6);
    await new sql.Request(tx)
      .input('BranchID', sql.VarChar(50), wrongBranch)
      .input('UserName', sql.VarChar(50), accountant.UserName)
      .query(`UPDATE dbo.SY_User SET BranchID = @BranchID WHERE UserName = @UserName;`);
    const r0 = await callTransition(tx, { username: accountant.UserName, documentId: order.DocumentID, action: 'APPROVE', expectedStatusId: 0 });
    assert(r0.MsgType === 1 && r0.Code === 'ORDER_OUT_OF_BRANCH_SCOPE', 'Kế toán sai chi nhánh phải bị ORDER_OUT_OF_BRANCH_SCOPE, thực tế: ' + JSON.stringify(r0));
    results.push(['WRONG_BRANCH_BLOCKED', true]);

    // Gán tạm BranchID cho tài khoản kế toán test = đúng chi nhánh của đơn — CHỈ trong transaction này.
    await new sql.Request(tx)
      .input('BranchID', sql.VarChar(50), order.BranchID)
      .input('UserName', sql.VarChar(50), accountant.UserName)
      .query(`UPDATE dbo.SY_User SET BranchID = @BranchID WHERE UserName = @UserName;`);

    // ── Ca 1: Sai vai trò (không phải kế toán) phải bị chặn ───────────────
    if (salesUser) {
      const r1 = await callTransition(tx, { username: salesUser.UserName, documentId: order.DocumentID, action: 'APPROVE', expectedStatusId: 0 });
      assert(r1.MsgType === 1 && r1.Code === 'FORBIDDEN_ROLE', 'User không phải kế toán phải bị FORBIDDEN_ROLE, thực tế: ' + JSON.stringify(r1));
      results.push(['WRONG_ROLE_BLOCKED', true]);
    }

    // ── Ca 2: Đúng vai trò + đúng chi nhánh phải duyệt được (ca dương) ─────
    const r2 = await callTransition(tx, { username: accountant.UserName, documentId: order.DocumentID, action: 'APPROVE', expectedStatusId: 0, requestId: newKey('req-correctbranch') });
    assert(r2.MsgType === 5, 'Kế toán đúng chi nhánh phải duyệt được (đây là ca dương), thực tế: ' + JSON.stringify(r2));
    results.push(['CORRECT_BRANCH_APPROVE_SUCCEEDS', true]);

    const currentStatus = (await new sql.Request(tx)
      .input('DocumentID', sql.VarChar(50), order.DocumentID)
      .query(`SELECT StatusID FROM dbo.AR_OrderTbl WHERE DocumentID = @DocumentID;`)).recordset[0].StatusID;
    assert(currentStatus === 1, 'Sau APPROVE, StatusID thật phải là 1 (Nhận đơn), thực tế: ' + currentStatus);
    results.push(['STATUS_ACTUALLY_CHANGED_TO_1', true]);

    // ── Ca 3: Idempotency replay — gọi lại với CÙNG key phải trả IsReplay=true, không đổi gì thêm
    const sameKey = newKey('idem-replay');
    const rA = await callTransition(tx, { username: accountant.UserName, documentId: order.DocumentID, action: 'APPROVE', expectedStatusId: 1, idempotencyKey: sameKey, requestId: newKey('req-a') });
    // status hiện là 1 rồi nên gọi APPROVE lại (from 1) phải INVALID_TRANSITION, không phải idempotency replay case ở đây
    assert(rA.MsgType === 1 && rA.Code === 'INVALID_TRANSITION', 'APPROVE từ StatusID=1 (đã duyệt) phải bị INVALID_TRANSITION, thực tế: ' + JSON.stringify(rA));
    results.push(['NO_APPROVE_FROM_ALREADY_APPROVED', true]);

    // ── Ca 4: Stale ExpectedStatusID phải bị chặn ──────────────────────────
    const r4 = await callTransition(tx, { username: accountant.UserName, documentId: order.DocumentID, action: 'REJECT', expectedStatusId: 0, requestId: newKey('req-stale') });
    assert(r4.MsgType === 1 && r4.Code === 'STATUS_CHANGED', 'ExpectedStatusID cũ (0) trong khi thực tế đã là 1 phải bị STATUS_CHANGED, thực tế: ' + JSON.stringify(r4));
    results.push(['STALE_EXPECTED_STATUS_BLOCKED', true]);

    // ── Ca 5: Idempotency replay thật — gọi đúng key 2 lần liên tiếp cho 1 order khác ─
    const order2 = (await new sql.Request(tx).query(`
      SELECT TOP (1) DocumentID, BranchID, StatusID FROM dbo.AR_OrderTbl WHERE StatusID = 0 AND DocumentID <> '${order.DocumentID.replace(/'/g, "''")}' ORDER BY DocumentID;
    `)).recordset[0];
    if (order2) {
      await new sql.Request(tx)
        .input('BranchID', sql.VarChar(50), order2.BranchID)
        .input('UserName', sql.VarChar(50), accountant.UserName)
        .query(`UPDATE dbo.SY_User SET BranchID = @BranchID WHERE UserName = @UserName;`);
      const replayKey = newKey('idem-real-replay');
      const first = await callTransition(tx, { username: accountant.UserName, documentId: order2.DocumentID, action: 'REJECT', expectedStatusId: 0, idempotencyKey: replayKey, requestId: newKey('req-first') });
      assert(first.MsgType === 5 && first.IsReplay === false, 'Lần gọi đầu phải thành công và không phải replay, thực tế: ' + JSON.stringify(first));
      const second = await callTransition(tx, { username: accountant.UserName, documentId: order2.DocumentID, action: 'REJECT', expectedStatusId: 0, idempotencyKey: replayKey, requestId: newKey('req-second') });
      assert(second.MsgType === 5 && second.IsReplay === true, 'Lần gọi 2 (cùng idempotency key) phải trả IsReplay=true, thực tế: ' + JSON.stringify(second));
      results.push(['IDEMPOTENCY_REPLAY_WORKS', true]);
    }

    // ── Ca 5b: Quản lý/toàn hệ thống (không phải KTDH) cũng duyệt được, NHƯNG vẫn phải đúng
    // chi nhánh (mở rộng vai trò không có nghĩa bỏ qua branch-match). Cần 1 đơn StatusID=0 thứ 3
    // chưa dùng ở các ca trên.
    if (managerUser) {
      const order3 = (await new sql.Request(tx).query(`
        SELECT TOP (1) DocumentID, BranchID, StatusID FROM dbo.AR_OrderTbl
        WHERE StatusID = 0 AND DocumentID NOT IN ('${order.DocumentID.replace(/'/g, "''")}'${order2 ? `, '${order2.DocumentID.replace(/'/g, "''")}'` : ''})
        ORDER BY DocumentID;
      `)).recordset[0];
      if (order3) {
        const wrongBranch2 = 'ZZ_' + Date.now().toString(36).slice(-6);
        await new sql.Request(tx)
          .input('BranchID', sql.VarChar(50), wrongBranch2)
          .input('UserName', sql.VarChar(50), managerUser.UserName)
          .query(`UPDATE dbo.SY_User SET BranchID = @BranchID WHERE UserName = @UserName;`);
        const r5b0 = await callTransition(tx, { username: managerUser.UserName, documentId: order3.DocumentID, action: 'APPROVE', expectedStatusId: 0, requestId: newKey('req-mgr-wrongbranch') });
        assert(r5b0.MsgType === 1 && r5b0.Code === 'ORDER_OUT_OF_BRANCH_SCOPE', 'Quản lý sai chi nhánh vẫn phải bị ORDER_OUT_OF_BRANCH_SCOPE (mở rộng vai trò không bỏ qua branch-match), thực tế: ' + JSON.stringify(r5b0));
        results.push(['MANAGER_ROLE_STILL_BRANCH_GATED', true]);

        await new sql.Request(tx)
          .input('BranchID', sql.VarChar(50), order3.BranchID)
          .input('UserName', sql.VarChar(50), managerUser.UserName)
          .query(`UPDATE dbo.SY_User SET BranchID = @BranchID WHERE UserName = @UserName;`);
        const r5b1 = await callTransition(tx, { username: managerUser.UserName, documentId: order3.DocumentID, action: 'APPROVE', expectedStatusId: 0, requestId: newKey('req-mgr-correctbranch') });
        assert(r5b1.MsgType === 5, 'Quản lý đúng chi nhánh phải duyệt được (vai trò mở rộng), thực tế: ' + JSON.stringify(r5b1));
        const status3 = (await new sql.Request(tx)
          .input('DocumentID', sql.VarChar(50), order3.DocumentID)
          .query(`SELECT StatusID FROM dbo.AR_OrderTbl WHERE DocumentID = @DocumentID;`)).recordset[0].StatusID;
        assert(status3 === 1, 'Sau khi quản lý APPROVE, StatusID thật phải là 1, thực tế: ' + status3);
        results.push(['MANAGER_ROLE_CAN_APPROVE_WITH_BRANCH_MATCH', true]);
      } else {
        results.push(['MANAGER_ROLE_CAN_APPROVE_WITH_BRANCH_MATCH', 'SKIPPED_NO_THIRD_ORDER']);
      }
    } else {
      results.push(['MANAGER_ROLE_CAN_APPROVE_WITH_BRANCH_MATCH', 'SKIPPED_NO_MANAGER_ACCOUNT']);
    }

    // ── Ca 6: Audit đã được ghi cho lần APPROVE thành công ─────────────────
    const auditCount = (await new sql.Request(tx)
      .input('DocumentID', sql.VarChar(50), order.DocumentID)
      .query(`SELECT COUNT(*) AS Cnt FROM dbo.AI_AuditLog WHERE TargetID = @DocumentID AND ActionType = 'ORDER_APPROVAL_TRANSITION';`)
    ).recordset[0].Cnt;
    assert(auditCount >= 1, 'Phải có ít nhất 1 dòng audit cho lần duyệt thành công, thực tế: ' + auditCount);
    results.push(['AUDIT_LOGGED', true]);

    console.log(JSON.stringify({ Task: 'VERIFY-ORDER-APPROVAL-TRANSITION', Status: 'PASS', Results: results }, null, 2));
  } finally {
    await tx.rollback();
    console.error('ROLLED_BACK (không sửa StatusID/BranchID/audit thật nào)');
    await pool.close();
  }
}

main().catch((error) => {
  console.error(JSON.stringify({ Task: 'VERIFY-ORDER-APPROVAL-TRANSITION', Status: 'FAIL', Error: error.message }, null, 2));
  process.exitCode = 1;
});
