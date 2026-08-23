'use strict';

const fs = require('fs');
const path = require('path');
const sql = require('mssql');

const root = path.resolve(__dirname, '..');
const FILES = [
  'sql/Module_Common_API_DonHangChiTiet_Insert_AI.sql',
  'sql/ORDER-APPROVAL-002_DonHang_ApproveTransition_AI.sql',
  'sql/ORDER-APPROVAL-004_DonHang_OwnerTransition_AI.sql',
  'sql/ORDER-APPROVAL-005_Order_Edit_Guard_AI.sql',
  'sql/ORDER-APPROVAL-006_Draft_Restore_AI.sql',
  'sql/CUSTOMER-SEC-001_Order_Action_Policy_AI.sql',
];
const APPROVAL_REF = 'CUSTOMER-BIZ-001 V1 — chat sign-off 23/08/2026';

function readEnv(relativePath) {
  const values = {};
  const filePath = path.join(root, relativePath);
  if (!fs.existsSync(filePath)) return values;
  for (const line of fs.readFileSync(filePath, 'utf8').replace(/^\uFEFF/, '').split(/\r?\n/)) {
    const match = line.match(/^\s*([^#=]+)=(.*)$/);
    if (match) values[match[1].trim()] = match[2].trim().replace(/^['"]|['"]$/g, '');
  }
  return values;
}

function batches(source) {
  return source.split(/^\s*GO\s*(?:--.*)?$/gim).map((part) => part.trim()).filter(Boolean);
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function execute(tx, proc, inputs) {
  const request = new sql.Request(tx);
  for (const [name, type, value] of inputs) request.input(name, type, value);
  const result = await request.execute(proc);
  return result.recordset && result.recordset[0] ? result.recordset[0] : {};
}

function mutationInputs(user, order, action, expected, suffix, reason) {
  const now = Date.now();
  const result = [
    ['Username', sql.VarChar(50), user],
    ['DocumentID', sql.VarChar(50), order],
    ['Action', sql.VarChar(20), action],
    ['ExpectedStatusID', sql.Int, expected],
    ['IdempotencyKey', sql.VarChar(128), `sec002-${suffix}-${now}`],
    ['RequestID', sql.VarChar(100), `req-sec002-${suffix}-${now}`],
  ];
  if (reason !== undefined) result.push(['Reason', sql.NVarChar(500), reason]);
  return result;
}

async function runPolicyTests(pool, tx, results) {
  const req = () => new sql.Request(tx);
  const users = (await req().query(`
    SELECT TOP (1) UserName, BranchID, EmployeeID, UserGroupID FROM dbo.SY_User
    WHERE COALESCE(Disable,0)=0 AND UPPER(COALESCE(UserGroupID,'')) IN ('QL','QLMN')
      AND COALESCE(BranchID,'')<>'' AND COALESCE(EmployeeID,'')<>'' ORDER BY UserName;
    SELECT TOP (1) UserName, BranchID, EmployeeID, UserGroupID FROM dbo.SY_User
    WHERE COALESCE(Disable,0)=0 AND UPPER(COALESCE(UserGroupID,'')) IN ('KTDH','KTDH2','TN KTDH')
      ORDER BY UserName;
    SELECT TOP (1) UserName, BranchID, EmployeeID, UserGroupID FROM dbo.SY_User
    WHERE COALESCE(Disable,0)=0 AND COALESCE(BranchID,'')<>'' AND COALESCE(EmployeeID,'')<>''
      AND UPPER(COALESCE(UserGroupID,'')) NOT IN ('QL','QLMN','KTDH','KTDH2','TN KTDH','ADMIN','SADM','BGD','GD')
      AND COALESCE(Manager,0)=0 ORDER BY UserName;
    SELECT TOP (1) UserName, BranchID, EmployeeID, UserGroupID FROM dbo.SY_User
    WHERE COALESCE(Disable,0)=0 AND UPPER(COALESCE(UserGroupID,'')) IN ('ADMIN','SADM','BGD','GD')
      ORDER BY CASE WHEN UPPER(UserName)='DEMO' THEN 0 ELSE 1 END, UserName;
  `)).recordsets;
  const [manager, accountant, sale, admin] = users.map((rows) => rows[0]);
  assert(manager && accountant && sale && admin,
    `Thiếu actor thật trên medtest: manager=${!!manager}, accountant=${!!accountant}, sale=${!!sale}, admin=${!!admin}.`);

  const otherManager = (await req().input('BranchID', sql.VarChar(50), manager.BranchID).query(`
    SELECT TOP (1) UserName, BranchID, EmployeeID, UserGroupID FROM dbo.SY_User
    WHERE COALESCE(Disable,0)=0 AND UPPER(COALESCE(UserGroupID,'')) IN ('QL','QLMN')
      AND COALESCE(BranchID,'')<>'' AND BranchID<>@BranchID ORDER BY UserName;
  `)).recordset[0];
  assert(otherManager, 'Thiếu quản lý thật ở chi nhánh khác để chạy ca âm scope.');

  const order = (await req().query(`
    SELECT TOP (1) O.DocumentID
    FROM dbo.AR_OrderTbl O
    WHERE EXISTS (SELECT 1 FROM dbo.AR_OrderDetailTbl D WHERE D.DocumentID=O.DocumentID)
    ORDER BY O.DocumentID;
  `)).recordset[0];
  assert(order, 'Không có đơn thật có dòng chi tiết làm fixture rollback.');

  await req()
    .input('DocumentID', sql.VarChar(50), order.DocumentID)
    .input('BranchID', sql.VarChar(50), manager.BranchID)
    .input('UserCreate', sql.VarChar(30), sale.UserName)
    .input('EmployeeID', sql.VarChar(50), sale.EmployeeID)
    .query(`UPDATE dbo.AR_OrderTbl SET StatusID=0, BranchID=@BranchID, UserCreate=@UserCreate,
            EmployeeID=@EmployeeID WHERE DocumentID=@DocumentID;`);

  const activeRoles = (await req().query(`
    SELECT ActionCode, PrincipalType, PrincipalValue, ScopeRule, CAST(AllowSelfApproval AS INT) AllowSelfApproval,
           ApprovedBy, ApprovalRef
    FROM dbo.AI_OrderApprovalRoleTbl
    WHERE ContractVersion='ORDER-APPROVAL-002' AND Status='APPROVED';
  `)).recordset;
  assert(activeRoles.length === 6, `Active role phải đúng 6, thực tế ${activeRoles.length}.`);
  assert(activeRoles.every((r) => ['EDIT','APPROVE','REJECT'].includes(r.ActionCode)), 'Có action ngoài EDIT/APPROVE/REJECT.');
  assert(activeRoles.every((r) => r.PrincipalType === 'USER_GROUP' && ['QL','QLMN'].includes(r.PrincipalValue.toUpperCase())), 'Có principal ngoài QL/QLMN.');
  assert(activeRoles.every((r) => r.ScopeRule === 'BRANCH_MATCH' && r.AllowSelfApproval === 0 && r.ApprovalRef === APPROVAL_REF), 'Role không khớp scope/self/sign-off.');
  results.push(['POLICY_HAS_EXACT_SIX_ACTION_ROLES', true]);

  for (const action of ['EDIT','APPROVE','REJECT']) {
    const role = (await req().input('U', sql.VarChar(50), manager.UserName).input('A', sql.VarChar(20), action)
      .query('SELECT * FROM dbo.AI_OrderApprovalRoleFnc(@U,@A,SYSUTCDATETIME());')).recordset[0];
    assert(role && role.ScopeRule === 'BRANCH_MATCH' && role.AllowSelfApproval === false, `Manager thiếu ${action}.`);
  }
  for (const action of ['SUBMIT','CANCEL']) {
    const role = (await req().input('U', sql.VarChar(50), manager.UserName).input('A', sql.VarChar(20), action)
      .query('SELECT * FROM dbo.AI_OrderApprovalRoleFnc(@U,@A,SYSUTCDATETIME());')).recordset[0];
    assert(!role, `Manager bị cấp nhầm ${action}.`);
  }
  results.push(['MANAGER_ACTIONS_ARE_EXPLICIT', true]);

  for (const actor of [accountant, admin, sale]) {
    const roleCount = (await req().input('U', sql.VarChar(50), actor.UserName).query(`
      SELECT (SELECT COUNT(*) FROM dbo.AI_OrderApprovalRoleFnc(@U,'EDIT',SYSUTCDATETIME()))+
             (SELECT COUNT(*) FROM dbo.AI_OrderApprovalRoleFnc(@U,'APPROVE',SYSUTCDATETIME()))+
             (SELECT COUNT(*) FROM dbo.AI_OrderApprovalRoleFnc(@U,'REJECT',SYSUTCDATETIME())) AS Cnt;
    `)).recordset[0].Cnt;
    assert(roleCount === 0, `${actor.UserGroupID} có quyền elevated ngoài ma trận.`);
  }
  results.push(['ACCOUNTING_ADMIN_SALE_HAVE_NO_ELEVATED_ROLE', true]);

  let guard = (await req().input('U', sql.VarChar(50), manager.UserName).input('D', sql.VarChar(50), order.DocumentID)
    .query('SELECT * FROM dbo.AI_OrderEditGuardFnc(@U,@D,SYSUTCDATETIME());')).recordset[0];
  assert(guard.CanEdit === true, 'Manager cùng chi nhánh phải sửa được đơn chờ duyệt.');
  results.push(['MANAGER_CAN_EDIT_PENDING_SAME_BRANCH', true]);

  guard = (await req().input('U', sql.VarChar(50), otherManager.UserName).input('D', sql.VarChar(50), order.DocumentID)
    .query('SELECT * FROM dbo.AI_OrderEditGuardFnc(@U,@D,SYSUTCDATETIME());')).recordset[0];
  assert(guard.CanEdit === false && guard.BlockCode === 'ORDER_OUT_OF_BRANCH_SCOPE', 'Manager khác chi nhánh phải bị chặn.');
  results.push(['OTHER_BRANCH_MANAGER_BLOCKED', true]);

  for (const actor of [accountant, admin, sale]) {
    guard = (await req().input('U', sql.VarChar(50), actor.UserName).input('D', sql.VarChar(50), order.DocumentID)
      .query('SELECT * FROM dbo.AI_OrderEditGuardFnc(@U,@D,SYSUTCDATETIME());')).recordset[0];
    assert(guard.CanEdit === false, `${actor.UserGroupID} không được sửa pending.`);
  }
  results.push(['NON_MANAGER_PENDING_EDIT_BLOCKED', true]);

  let response = await execute(tx, 'dbo.API_DonHang_ApproveTransition_AI', mutationInputs(manager.UserName, order.DocumentID, 'APPROVE', 0, 'approve', null));
  assert(response.MsgType === 5, `Manager approve thất bại: ${JSON.stringify(response)}`);
  await req().input('D', sql.VarChar(50), order.DocumentID).query('UPDATE dbo.AR_OrderTbl SET StatusID=0 WHERE DocumentID=@D;');
  response = await execute(tx, 'dbo.API_DonHang_ApproveTransition_AI', mutationInputs(manager.UserName, order.DocumentID, 'REJECT', 0, 'reject', 'Không đạt điều kiện UAT'));
  assert(response.MsgType === 5, `Manager reject thất bại: ${JSON.stringify(response)}`);
  results.push(['MANAGER_APPROVE_REJECT_SAME_BRANCH', true]);

  await req().input('D', sql.VarChar(50), order.DocumentID).input('U', sql.VarChar(30), manager.UserName)
    .input('E', sql.VarChar(50), manager.EmployeeID).query('UPDATE dbo.AR_OrderTbl SET StatusID=0,UserCreate=@U,EmployeeID=@E WHERE DocumentID=@D;');
  response = await execute(tx, 'dbo.API_DonHang_ApproveTransition_AI', mutationInputs(manager.UserName, order.DocumentID, 'APPROVE', 0, 'self-user', null));
  assert(response.Code === 'SELF_APPROVAL_BLOCKED', `Self approve username chưa bị chặn: ${JSON.stringify(response)}`);
  await req().input('D', sql.VarChar(50), order.DocumentID).input('U', sql.VarChar(30), sale.UserName)
    .input('E', sql.VarChar(50), manager.EmployeeID).query('UPDATE dbo.AR_OrderTbl SET StatusID=0,UserCreate=@U,EmployeeID=@E WHERE DocumentID=@D;');
  response = await execute(tx, 'dbo.API_DonHang_ApproveTransition_AI', mutationInputs(manager.UserName, order.DocumentID, 'REJECT', 0, 'self-employee', 'Kiểm tra maker-checker'));
  assert(response.Code === 'SELF_APPROVAL_BLOCKED', `Self reject EmployeeID chưa bị chặn: ${JSON.stringify(response)}`);
  results.push(['SELF_APPROVE_AND_REJECT_BLOCKED', true]);

  await req().input('D', sql.VarChar(50), order.DocumentID).input('U', sql.VarChar(30), sale.UserName)
    .input('E', sql.VarChar(50), sale.EmployeeID).input('B', sql.VarChar(50), manager.BranchID)
    .query('UPDATE dbo.AR_OrderTbl SET StatusID=-1,UserCreate=@U,EmployeeID=@E,BranchID=@B WHERE DocumentID=@D;');
  for (const action of ['SUBMIT','CANCEL']) {
    response = await execute(tx, 'dbo.API_DonHang_OwnerTransition_AI', mutationInputs(manager.UserName, order.DocumentID, action, -1, `manager-${action}`));
    assert(response.Code === 'FORBIDDEN_ROLE', `Manager bị mở nhầm ${action}: ${JSON.stringify(response)}`);
    const status = (await req().input('D', sql.VarChar(50), order.DocumentID).query('SELECT StatusID FROM dbo.AR_OrderTbl WHERE DocumentID=@D;')).recordset[0].StatusID;
    assert(status === -1, `${action} bị chặn nhưng DB vẫn đổi.`);
  }
  results.push(['MANAGER_CANNOT_SUBMIT_CANCEL_OTHER_DRAFT', true]);

  await req().input('D', sql.VarChar(50), order.DocumentID).input('U', sql.VarChar(30), accountant.UserName)
    .input('E', sql.VarChar(50), accountant.EmployeeID || '').query('UPDATE dbo.AR_OrderTbl SET StatusID=-1,UserCreate=@U,EmployeeID=@E WHERE DocumentID=@D;');
  guard = (await req().input('U', sql.VarChar(50), accountant.UserName).input('D', sql.VarChar(50), order.DocumentID)
    .query('SELECT * FROM dbo.AI_OrderEditGuardFnc(@U,@D,SYSUTCDATETIME());')).recordset[0];
  assert(guard.CanEdit === false && guard.BlockCode === 'ORDER_APP_ROLE_RETIRED', 'Kế toán owner vẫn sửa draft được.');
  for (const action of ['SUBMIT','CANCEL']) {
    response = await execute(tx, 'dbo.API_DonHang_OwnerTransition_AI', mutationInputs(accountant.UserName, order.DocumentID, action, -1, `accountant-${action}`));
    assert(response.Code === 'ORDER_APP_ROLE_RETIRED', `Kế toán owner chưa bị chặn ${action}.`);
  }
  response = await execute(tx, 'dbo.API_DonHangChiTiet_Insert_AI', [
    ['Username', sql.VarChar(50), accountant.UserName],
    ['IdempotencyKey', sql.VarChar(128), `sec002-create-${Date.now()}`],
    ['RequestID', sql.VarChar(100), `req-sec002-create-${Date.now()}`],
  ]);
  assert(response.Code === 'ORDER_APP_ROLE_RETIRED', `Kế toán vẫn tạo đơn được: ${JSON.stringify(response)}`);
  results.push(['ACCOUNTING_ORDER_MUTATIONS_BLOCKED', true]);

  await req().input('D', sql.VarChar(50), order.DocumentID).input('U', sql.VarChar(30), sale.UserName)
    .input('E', sql.VarChar(50), sale.EmployeeID).query('UPDATE dbo.AR_OrderTbl SET StatusID=-1,UserCreate=@U,EmployeeID=@E WHERE DocumentID=@D;');
  guard = (await req().input('U', sql.VarChar(50), sale.UserName).input('D', sql.VarChar(50), order.DocumentID)
    .query('SELECT * FROM dbo.AI_OrderEditGuardFnc(@U,@D,SYSUTCDATETIME());')).recordset[0];
  assert(guard.CanEdit === true, 'Sale owner phải sửa được draft.');
  response = await execute(tx, 'dbo.API_DonHang_OwnerTransition_AI', mutationInputs(sale.UserName, order.DocumentID, 'SUBMIT', -1, 'sale-submit'));
  assert(response.MsgType === 5 && response.StatusID === 0, `Sale submit draft thất bại: ${JSON.stringify(response)}`);
  guard = (await req().input('U', sql.VarChar(50), sale.UserName).input('D', sql.VarChar(50), order.DocumentID)
    .query('SELECT * FROM dbo.AI_OrderEditGuardFnc(@U,@D,SYSUTCDATETIME());')).recordset[0];
  assert(guard.CanEdit === false, 'Sale vẫn sửa được sau submit.');
  await req().input('D', sql.VarChar(50), order.DocumentID).query('UPDATE dbo.AR_OrderTbl SET StatusID=-1 WHERE DocumentID=@D;');
  response = await execute(tx, 'dbo.API_DonHang_OwnerTransition_AI', mutationInputs(sale.UserName, order.DocumentID, 'CANCEL', -1, 'sale-cancel'));
  assert(response.MsgType === 5 && response.StatusID === 10, `Sale cancel draft thất bại: ${JSON.stringify(response)}`);
  results.push(['SALE_OWNER_DRAFT_FLOW_PRESERVED', true]);

  await req().input('D', sql.VarChar(50), order.DocumentID).input('U', sql.VarChar(30), sale.UserName)
    .input('E', sql.VarChar(50), sale.EmployeeID).query('UPDATE dbo.AR_OrderTbl SET StatusID=0,UserCreate=@U,EmployeeID=@E WHERE DocumentID=@D;');
  const oldContext = await execute(tx, 'dbo.API_DonHang_ApprovalContext_AI', [
    ['Username', sql.VarChar(50), manager.UserName], ['DocumentID', sql.VarChar(50), order.DocumentID],
  ]);
  assert(oldContext.CanApprove === true || oldContext.CanApprove === 1, 'Context ban đầu phải cho manager approve.');
  await req().input('Ref', sql.NVarChar(200), APPROVAL_REF).query(`
    UPDATE dbo.AI_OrderApprovalRoleTbl SET Status='RETIRED',EffectiveTo=SYSUTCDATETIME()
    WHERE ContractVersion='ORDER-APPROVAL-002' AND ActionCode='APPROVE' AND ApprovalRef=@Ref;
  `);
  response = await execute(tx, 'dbo.API_DonHang_ApproveTransition_AI', mutationInputs(manager.UserName, order.DocumentID, 'APPROVE', 0, 'stale-context', null));
  assert(response.Code === 'FORBIDDEN_ROLE', `Context cũ vượt qua revoke: ${JSON.stringify(response)}`);
  const unchanged = (await req().input('D', sql.VarChar(50), order.DocumentID).query('SELECT StatusID FROM dbo.AR_OrderTbl WHERE DocumentID=@D;')).recordset[0].StatusID;
  assert(unchanged === 0, 'Stale context bị chặn nhưng DB vẫn đổi.');
  results.push(['STALE_CONTEXT_AFTER_REVOKE_BLOCKED', true]);

  const lockPool = await new sql.ConnectionPool(pool.config).connect();
  try {
    const lockResult = (await lockPool.request().query(`
      BEGIN TRANSACTION;
      DECLARE @R INT;
      EXEC @R=sys.sp_getapplock @Resource='AI_ORDER_APPROVAL_POLICY',@LockMode='Exclusive',@LockOwner='Transaction',@LockTimeout=300;
      IF @@TRANCOUNT>0 ROLLBACK TRANSACTION;
      SELECT @R AS Result;
    `)).recordset[0].Result;
    assert(lockResult < 0, `Exclusive revoke không bị shared mutation lock chặn: ${lockResult}`);
  } finally {
    await lockPool.close();
  }
  results.push(['CONCURRENT_POLICY_REVOKE_SERIALIZED', true]);

  const failedAudit = (await req().query(`
    SELECT COUNT(*) AS Cnt FROM dbo.AI_AuditLog
    WHERE ActionType IN ('ORDER_APPROVAL_TRANSITION_FAILED','ORDER_OWNER_TRANSITION_FAILED')
      AND JSON_VALUE(ExtraInfo,'$.requestId') LIKE 'req-sec002-%';
  `)).recordset[0].Cnt;
  assert(failedAudit >= 4, `Thiếu audit ca bị chặn: ${failedAudit}.`);
  results.push(['DENIED_ATTEMPTS_AUDITED', true]);

  return {
    Manager: manager.UserName,
    ManagerBranch: manager.BranchID,
    OtherBranchManager: otherManager.UserName,
    AccountantGroup: accountant.UserGroupID,
    SaleGroup: sale.UserGroupID,
    AdminGroup: admin.UserGroupID,
    FixtureOrder: order.DocumentID,
  };
}

async function main() {
  const live = process.argv.includes('--live');
  const env = { ...readEnv('.env'), ...readEnv('.env.uat.local'), ...process.env };
  const pool = await sql.connect({
    server: env.TEST_DB_SERVER, port: Number(env.TEST_DB_PORT || 1433), database: env.TEST_DB_DATABASE,
    user: env.TEST_DB_USER, password: env.TEST_DB_PASSWORD,
    options: { encrypt: false, trustServerCertificate: true }, connectionTimeout: 15000,
    requestTimeout: 120000, pool: { max: 4, min: 0, idleTimeoutMillis: 10000 },
  });
  const tx = new sql.Transaction(pool);
  const results = [];
  let evidence;
  try {
    const context = (await pool.request().query('SELECT DB_NAME() AS DatabaseName;')).recordset[0];
    assert(context.DatabaseName === 'medtest', `Verifier chỉ chạy medtest, hiện tại ${context.DatabaseName}.`);
    await tx.begin();
    if (!live) {
      for (const relativePath of FILES) {
        const source = fs.readFileSync(path.join(root, relativePath), 'utf8');
        for (const batch of batches(source)) await new sql.Request(tx).batch(batch);
      }
      results.push(['CANDIDATE_SQL_DEPLOYS_IN_ROLLBACK_TRANSACTION', true]);
    }
    evidence = await runPolicyTests(pool, tx, results);
    await tx.rollback();
    console.log(JSON.stringify({
      Task: 'CUSTOMER-SEC-002-VERIFY', Status: 'PASS', Mode: live ? 'LIVE_POLICY_ROLLBACK_TESTS' : 'CANDIDATE_ROLLBACK_TESTS',
      Summary: `${results.length} PASS / 0 FAIL`, Results: results, Evidence: evidence,
      Mutation: 'ROLLED_BACK',
    }, null, 2));
  } catch (error) {
    try { if (tx._aborted !== true) await tx.rollback(); } catch (_) {}
    throw error;
  } finally {
    await pool.close();
  }
}

main().catch((error) => {
  console.error(JSON.stringify({ Task: 'CUSTOMER-SEC-002-VERIFY', Status: 'FAIL', Error: error.message }, null, 2));
  process.exitCode = 1;
});
