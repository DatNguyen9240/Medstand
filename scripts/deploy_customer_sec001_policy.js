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
  const result = {};
  const filePath = path.join(root, relativePath);
  if (!fs.existsSync(filePath)) return result;
  for (const line of fs.readFileSync(filePath, 'utf8').replace(/^\uFEFF/, '').split(/\r?\n/)) {
    const match = line.match(/^\s*([^#=]+)=(.*)$/);
    if (match) result[match[1].trim()] = match[2].trim().replace(/^['"]|['"]$/g, '');
  }
  return result;
}

function batches(source) {
  return source.split(/^\s*GO\s*(?:--.*)?$/gim).map((part) => part.trim()).filter(Boolean);
}

async function inspect(pool) {
  const roles = (await pool.request().query(`
    SELECT ActionCode, PrincipalType, PrincipalValue, ScopeRule,
           CAST(AllowSelfApproval AS INT) AS AllowSelfApproval, Status, ApprovedBy, ApprovalRef
    FROM dbo.AI_OrderApprovalRoleTbl
    WHERE ContractVersion = 'ORDER-APPROVAL-002'
    ORDER BY Status, ActionCode, PrincipalType, PrincipalValue;
  `)).recordset;
  const transitions = (await pool.request().query(`
    SELECT ActionCode, FromStatusID, ToStatusID, RequireReason, Status, ApprovedBy, ApprovalRef
    FROM dbo.AI_OrderApprovalTransitionTbl
    WHERE ContractVersion = 'ORDER-APPROVAL-002'
    ORDER BY ActionCode, FromStatusID, ToStatusID;
  `)).recordset;
  return { roles, transitions };
}

function validateApplied(state) {
  const activeRoles = state.roles.filter((row) => row.Status === 'APPROVED');
  const expected = new Set([
    'APPROVE|USER_GROUP|QL', 'REJECT|USER_GROUP|QL', 'EDIT|USER_GROUP|QL',
    'APPROVE|USER_GROUP|QLMN', 'REJECT|USER_GROUP|QLMN', 'EDIT|USER_GROUP|QLMN',
  ]);
  const actual = new Set(activeRoles
    .filter((row) => row.ApprovalRef === APPROVAL_REF)
    .map((row) => `${row.ActionCode}|${row.PrincipalType}|${row.PrincipalValue}`));
  const missing = [...expected].filter((key) => !actual.has(key));
  if (missing.length) throw new Error(`Thiếu role action-specific: ${missing.join(', ')}`);
  if (activeRoles.some((row) => row.ActionCode === '*')) throw new Error('Vẫn còn role wildcard APPROVED.');
  if (activeRoles.some((row) => row.PrincipalType === 'USER_GROUP' && ['KTDH', 'KTDH2', 'TN KTDH'].includes(row.PrincipalValue.toUpperCase()))) {
    throw new Error('Vẫn còn role kế toán APPROVED trong app.');
  }
  if (activeRoles.some((row) => row.AllowSelfApproval !== 0)) throw new Error('Vẫn còn role cho phép self-approval.');
  if (activeRoles.some((row) => row.PrincipalType === 'MANAGER_FLAG')) throw new Error('Vẫn còn MANAGER_FLAG có thể cấp quyền cho Admin.');

  const requiredTransitions = [
    ['APPROVE', 0, 1], ['REJECT', 0, -2], ['SUBMIT', -1, 0], ['CANCEL', -1, 10],
  ];
  for (const [action, from, to] of requiredTransitions) {
    if (!state.transitions.some((row) => row.ActionCode === action && row.FromStatusID === from && row.ToStatusID === to && row.Status === 'APPROVED')) {
      throw new Error(`Transition chưa APPROVED: ${action} ${from}->${to}`);
    }
  }
  const badCancel = state.transitions.filter((row) => row.ActionCode === 'CANCEL' && row.FromStatusID !== -1 && row.Status === 'APPROVED');
  if (badCancel.length) throw new Error(`CANCEL ngoài nháp bị bật: ${JSON.stringify(badCancel)}`);
}

async function main() {
  const apply = process.argv.includes('--apply');
  const rollback = process.argv.includes('--rollback');
  if (apply === rollback) throw new Error('Chọn đúng một: --apply hoặc --rollback.');

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

  try {
    const context = (await pool.request().query('SELECT DB_NAME() AS DatabaseName, SUSER_SNAME() AS ExecutedBy;')).recordset[0];
    if (context.DatabaseName !== 'medtest') throw new Error(`Chỉ cho phép deploy medtest; hiện tại ${context.DatabaseName}.`);

    const deployed = [];
    if (apply) {
      for (const relativePath of FILES) {
        const source = fs.readFileSync(path.join(root, relativePath), 'utf8');
        let count = 0;
        for (const batch of batches(source)) {
          await new sql.Request(pool).batch(batch);
          count += 1;
        }
        deployed.push({ File: relativePath, Batches: count });
      }
    } else {
      await pool.request().input('ApprovalRef', sql.NVarChar(200), APPROVAL_REF).query(`
        SET XACT_ABORT ON;
        BEGIN TRANSACTION;
        DECLARE @PolicyLockResult INT;
        EXEC @PolicyLockResult = sys.sp_getapplock
          @Resource = 'AI_ORDER_APPROVAL_POLICY', @LockMode = 'Exclusive',
          @LockOwner = 'Transaction', @LockTimeout = 15000;
        IF @PolicyLockResult < 0 THROW 52020, 'CUSTOMER_SEC_POLICY_LOCK_TIMEOUT', 1;
        UPDATE dbo.AI_OrderApprovalRoleTbl
        SET Status = 'RETIRED', EffectiveTo = SYSUTCDATETIME(), ModifiedAt = SYSUTCDATETIME()
        WHERE ContractVersion = 'ORDER-APPROVAL-002' AND ApprovalRef = @ApprovalRef AND Status = 'APPROVED';
        UPDATE dbo.AI_OrderApprovalTransitionTbl
        SET Status = 'RETIRED', EffectiveTo = SYSUTCDATETIME(), ModifiedAt = SYSUTCDATETIME()
        WHERE ContractVersion = 'ORDER-APPROVAL-002' AND ApprovalRef = @ApprovalRef AND Status = 'APPROVED';
        DECLARE @AuditPayload NVARCHAR(MAX) =
          (SELECT @ApprovalRef AS approvalRef, 'ROLLBACK_FAIL_CLOSED' AS outcome FOR JSON PATH, WITHOUT_ARRAY_WRAPPER);
        EXEC dbo.AI_WriteAuditLog @Username='HoangDang', @ActionType='CUSTOMER_SECURITY_POLICY_ROLLBACK',
          @TargetEntity='AI_OrderApprovalRoleTbl', @TargetID='ORDER-APPROVAL-002', @ExtraInfo=@AuditPayload;
        COMMIT TRANSACTION;
      `);
    }

    const state = await inspect(pool);
    if (apply) validateApplied(state);
    else if (state.roles.some((row) => row.Status === 'APPROVED' && row.ApprovalRef === APPROVAL_REF)
          || state.transitions.some((row) => row.Status === 'APPROVED' && row.ApprovalRef === APPROVAL_REF)) {
      throw new Error('Rollback fail-closed chưa retire hết cấu hình CUSTOMER-SEC-001.');
    }

    console.log(JSON.stringify({
      Task: 'CUSTOMER-SEC-001-DEPLOY',
      Status: 'PASS',
      Action: apply ? 'APPLY' : 'ROLLBACK_FAIL_CLOSED',
      Database: context.DatabaseName,
      ExecutedBy: context.ExecutedBy,
      Deployed: deployed,
      ActiveRoles: state.roles.filter((row) => row.Status === 'APPROVED'),
      ActiveTransitions: state.transitions.filter((row) => row.Status === 'APPROVED'),
    }, null, 2));
  } finally {
    await pool.close();
  }
}

main().catch((error) => {
  console.error(JSON.stringify({ Task: 'CUSTOMER-SEC-001-DEPLOY', Status: 'FAIL', Error: error.message }, null, 2));
  process.exitCode = 1;
});
