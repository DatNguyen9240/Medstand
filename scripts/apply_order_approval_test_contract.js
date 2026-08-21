'use strict';

/* ORDER-APPROVAL-003 — bật/tắt hợp đồng duyệt đơn ở CHẾ ĐỘ TEST.

     node scripts/apply_order_approval_test_contract.js            # chỉ xem trạng thái hiện tại
     node scripts/apply_order_approval_test_contract.js --apply    # bật (chạy sql/..._Enable_Test_Contract_AI.sql)
     node scripts/apply_order_approval_test_contract.js --retire   # tắt, quay lại fail-closed

   ĐÂY KHÔNG PHẢI SIGN-OFF CỦA KHÁCH. Mọi dòng do chế độ này bật đều mang dấu
   ApprovedBy = 'TEST-ORDER-APPROVAL-003'; --retire chỉ đụng đúng những dòng mang dấu đó,
   không chạm dòng khách ký thật.

   Sau khi bật, script tự chứng minh trên dữ liệu thật (trong transaction luôn rollback):
   một quản lý khu vực duyệt được chính đơn mình tạo, còn Kế toán vẫn không được tự duyệt. */

const fs = require('fs');
const path = require('path');
const sql = require('mssql');

const root = path.resolve(__dirname, '..');
const ENABLE_FILE = 'sql/ORDER-APPROVAL-003_Enable_Test_Contract_AI.sql';
const TEST_APPROVER = 'TEST-ORDER-APPROVAL-003';

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

function batches(source) {
  return source.split(/^\s*GO\s*(?:--.*)?$/gim).map((part) => part.trim()).filter(Boolean);
}

async function contractState(pool) {
  const rows = (await pool.request().query(`
    SELECT 'TRANSITION' AS Kind, ActionCode,
           CAST(FromStatusID AS VARCHAR(10)) + ' -> ' + CAST(ToStatusID AS VARCHAR(10)) AS Detail,
           CAST(NULL AS VARCHAR(5)) AS SelfApprove, Status, ApprovedBy
    FROM dbo.AI_OrderApprovalTransitionTbl
    UNION ALL
    SELECT 'ROLE', ActionCode, PrincipalType + '=' + PrincipalValue + ' / ' + ScopeRule,
           CASE WHEN AllowSelfApproval = 1 THEN 'YES' ELSE 'NO' END, Status, ApprovedBy
    FROM dbo.AI_OrderApprovalRoleTbl
    ORDER BY Kind, Detail;
  `)).recordset;
  const isLive = (await pool.request().query(
    'SELECT dbo.AI_OrderApprovalContractIsLiveFnc(SYSUTCDATETIME()) AS IsLive;')).recordset[0].IsLive;
  return { isLive, rows };
}

/* Chứng minh trên dữ liệu thật, luôn rollback: quản lý tự duyệt được, kế toán thì không. */
async function proveOnRealData(pool) {
  const tx = new sql.Transaction(pool);
  await tx.begin();
  try {
    const manager = (await new sql.Request(tx).query(`
      SELECT TOP (1) U.UserName, U.BranchID, O.DocumentID
      FROM dbo.SY_User U
      INNER JOIN dbo.AR_OrderTbl O ON O.UserCreate = U.UserName AND O.StatusID = 0 AND O.BranchID = U.BranchID
      WHERE COALESCE(U.Disable, 0) = 0 AND COALESCE(U.BranchID, '') <> ''
        AND (COALESCE(U.Manager, 0) = 1 OR UPPER(COALESCE(U.UserGroupID, '')) IN ('QL', 'QLMN'))
      ORDER BY O.DocumentID;
    `)).recordset[0];
    if (!manager) return { Skipped: 'Không tìm thấy quản lý nào đang có đơn StatusID=0 do chính mình tạo trong chi nhánh mình.' };

    const context = (await new sql.Request(tx)
      .input('Username', sql.VarChar(50), manager.UserName)
      .input('DocumentID', sql.VarChar(50), manager.DocumentID)
      .execute('dbo.API_DonHang_ApprovalContext_AI')).recordset[0];

    const result = (await new sql.Request(tx)
      .input('Username', sql.VarChar(50), manager.UserName)
      .input('DocumentID', sql.VarChar(50), manager.DocumentID)
      .input('Action', sql.VarChar(20), 'APPROVE')
      .input('ExpectedStatusID', sql.Int, 0)
      .input('IdempotencyKey', sql.VarChar(128), 'testcontract-' + Date.now())
      .input('RequestID', sql.VarChar(100), 'req-testcontract-' + Date.now())
      .execute('dbo.API_DonHang_ApproveTransition_AI')).recordset[0];
    const statusAfter = (await new sql.Request(tx)
      .input('DocumentID', sql.VarChar(50), manager.DocumentID)
      .query('SELECT StatusID FROM dbo.AR_OrderTbl WHERE DocumentID = @DocumentID;')).recordset[0].StatusID;

    if (result.MsgType !== 5 || statusAfter !== 1) {
      throw new Error('Quản lý vẫn chưa tự duyệt được đơn mình tạo: ' + JSON.stringify({ result, statusAfter }));
    }

    /* Kế toán vẫn phải bị maker-checker chặn — nới lỏng chỉ dành cho quản lý. */
    const accountant = (await new sql.Request(tx).query(`
      SELECT TOP (1) UserName FROM dbo.SY_User
      WHERE COALESCE(Disable, 0) = 0 AND UPPER(COALESCE(UserGroupID, '')) IN ('KTDH', 'KTDH2', 'TN KTDH')
      ORDER BY UserName;
    `)).recordset[0];
    let accountantSelfBlocked = 'SKIPPED_NO_ACCOUNTANT';
    if (accountant) {
      const otherOrder = (await new sql.Request(tx).query(
        'SELECT TOP (1) DocumentID, BranchID FROM dbo.AR_OrderTbl WHERE StatusID = 0 ORDER BY DocumentID;')).recordset[0];
      await new sql.Request(tx)
        .input('BranchID', sql.VarChar(50), otherOrder.BranchID)
        .input('UserName', sql.VarChar(50), accountant.UserName)
        .query('UPDATE dbo.SY_User SET BranchID = @BranchID WHERE UserName = @UserName;');
      await new sql.Request(tx)
        .input('UserName', sql.VarChar(30), accountant.UserName)
        .input('DocumentID', sql.VarChar(50), otherOrder.DocumentID)
        .query('UPDATE dbo.AR_OrderTbl SET UserCreate = @UserName WHERE DocumentID = @DocumentID;');
      const selfTry = (await new sql.Request(tx)
        .input('Username', sql.VarChar(50), accountant.UserName)
        .input('DocumentID', sql.VarChar(50), otherOrder.DocumentID)
        .input('Action', sql.VarChar(20), 'APPROVE')
        .input('ExpectedStatusID', sql.Int, 0)
        .input('IdempotencyKey', sql.VarChar(128), 'testcontract-kt-' + Date.now())
        .input('RequestID', sql.VarChar(100), 'req-testcontract-kt-' + Date.now())
        .execute('dbo.API_DonHang_ApproveTransition_AI')).recordset[0];
      if (selfTry.Code !== 'SELF_APPROVAL_BLOCKED') {
        throw new Error('Kế toán KHÔNG được tự duyệt, nhưng thực tế: ' + JSON.stringify(selfTry));
      }
      accountantSelfBlocked = selfTry.Code;
    }

    return {
      ManagerTried: manager.UserName,
      ManagerBranch: manager.BranchID,
      OwnOrder: manager.DocumentID,
      ContextCanApprove: context.CanApprove,
      ApproveMsg: result.Msg,
      StatusBefore: 0,
      StatusAfter: statusAfter,
      AccountantSelfApproval: accountantSelfBlocked,
    };
  } finally {
    await tx.rollback();
  }
}

async function main() {
  const apply = process.argv.includes('--apply');
  const retire = process.argv.includes('--retire');
  if (apply && retire) throw new Error('Chọn một trong hai: --apply hoặc --retire.');

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
    if (context.DatabaseName !== 'medtest') {
      throw new Error(`Chế độ test chỉ chạy trên medtest; hiện tại ${context.DatabaseName}.`);
    }

    let action = 'INSPECT';
    let proof = null;

    if (apply) {
      action = 'ENABLED_TEST_CONTRACT';
      const source = fs.readFileSync(path.join(root, ENABLE_FILE), 'utf8');
      for (const batch of batches(source)) await new sql.Request(pool).batch(batch);
      proof = await proveOnRealData(pool);
    } else if (retire) {
      action = 'RETIRED_TEST_CONTRACT';
      const retired = (await pool.request()
        .input('TestApprover', sql.VarChar(100), TEST_APPROVER)
        .query(`
          UPDATE dbo.AI_OrderApprovalTransitionTbl
          SET Status = 'RETIRED', EffectiveTo = SYSUTCDATETIME(), ModifiedAt = SYSUTCDATETIME()
          WHERE ApprovedBy = @TestApprover AND Status = 'APPROVED';
          DECLARE @T INT = @@ROWCOUNT;
          UPDATE dbo.AI_OrderApprovalRoleTbl
          SET Status = 'RETIRED', EffectiveTo = SYSUTCDATETIME(), ModifiedAt = SYSUTCDATETIME()
          WHERE ApprovedBy = @TestApprover AND Status = 'APPROVED';
          SELECT @T AS TransitionsRetired, @@ROWCOUNT AS RolesRetired;
        `)).recordset[0];
      proof = retired;
    }

    const state = await contractState(pool);
    console.log(JSON.stringify({
      Task: 'ORDER-APPROVAL-003-TEST-CONTRACT',
      Status: 'PASS',
      Action: action,
      Database: context.DatabaseName,
      ContractIsLive: state.isLive,
      Contract: state.rows,
      Proof: proof,
      Warning: state.isLive
        ? 'Hợp đồng đang SỐNG ở chế độ TEST (ApprovedBy=TEST-ORDER-APPROVAL-003). Đây KHÔNG phải sign-off của khách.'
        : 'Hợp đồng đang fail-closed: không ai duyệt được đơn nào.',
    }, null, 2));
  } finally {
    await pool.close();
  }
}

main().catch((error) => {
  console.error(JSON.stringify({ Task: 'ORDER-APPROVAL-003-TEST-CONTRACT', Status: 'FAIL', Error: error.message }, null, 2));
  process.exitCode = 1;
});
