'use strict';

/* ORDER-APPROVAL-003 — deploy hợp đồng duyệt đơn + 2 procedure + metadata API.

   Sau khi deploy, script tự chứng minh trạng thái FAIL-CLOSED: mọi dòng hợp đồng vẫn là DRAFT
   và một lệnh duyệt thật (chạy trong transaction luôn rollback) bị từ chối với mã
   APPROVAL_CONTRACT_NOT_APPROVED. Đó là kết quả ĐÚNG khi khách chưa ký ORDER-APPROVAL-002 —
   không được "sửa cho chạy" bằng cách bật APPROVED hộ khách. */
const fs = require('fs');
const path = require('path');
const sql = require('mssql');

const root = path.resolve(__dirname, '..');
const FILES = [
  'sql/ORDER-APPROVAL-003_Approval_Contract_AI.sql',
  'sql/ORDER-APPROVAL-002_DonHang_ApproveTransition_AI.sql',
  'sql/ORDER-APPROVAL-002_ApprovalContext_AI.sql',
  'sql/ORDER-APPROVAL-003_API_Metadata_AI.sql',
];

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

async function main() {
  if (!process.argv.includes('--apply')) throw new Error('Thêm --apply để chạy deploy thật.');
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
      throw new Error(`ORDER-APPROVAL-003 chỉ deploy trên medtest; hiện tại ${context.DatabaseName}.`);
    }

    /* Không bọc transaction ngoài: từng file SQL đã tự quản lý transaction của nó
       (BEGIN/COMMIT + CATCH rollback), lồng thêm một lớp nữa sẽ làm lệch @@TRANCOUNT. */
    const deployed = [];
    for (const relativePath of FILES) {
      const source = fs.readFileSync(path.join(root, relativePath), 'utf8');
      let batchCount = 0;
      for (const batch of batches(source)) {
        await new sql.Request(pool).batch(batch);
        batchCount += 1;
      }
      deployed.push({ File: relativePath, Batches: batchCount });
    }

    const objects = (await pool.request().query(`
      SELECT name, type_desc FROM sys.objects
      WHERE name IN ('AI_OrderApprovalTransitionTbl', 'AI_OrderApprovalRoleTbl',
                     'AI_OrderApprovalTransitionFnc', 'AI_OrderApprovalRoleFnc',
                     'AI_OrderApprovalContractIsLiveFnc',
                     'API_DonHang_ApproveTransition_AI', 'API_DonHang_ApprovalContext_AI')
      ORDER BY name;
    `)).recordset;
    if (objects.length !== 7) {
      throw new Error(`Thiếu object sau deploy: ${objects.map((o) => o.name).join(',')} (${objects.length}/7).`);
    }

    const contractRows = (await pool.request().query(`
      SELECT 'TRANSITION' AS Kind, Status, COUNT(*) AS Cnt FROM dbo.AI_OrderApprovalTransitionTbl GROUP BY Status
      UNION ALL
      SELECT 'ROLE', Status, COUNT(*) FROM dbo.AI_OrderApprovalRoleTbl GROUP BY Status;
    `)).recordset;
    const contractLive = (await pool.request().query(
      'SELECT dbo.AI_OrderApprovalContractIsLiveFnc(SYSUTCDATETIME()) AS IsLive;'
    )).recordset[0].IsLive;

    const metadata = (await pool.request().query(`
      SELECT ApiCode, OperationType, RequiredCapability, ScopeResolver, OwnershipRule, ContractVersion
      FROM dbo.API_Definition
      WHERE ApiCode IN ('@don_hang_approve_transition', '@don_hang_approval_context')
      ORDER BY ApiCode;
    `)).recordset;
    const missingMetadata = metadata.filter((row) => !row.OperationType || !row.RequiredCapability
      || !row.ScopeResolver || !row.OwnershipRule || !row.ContractVersion);
    if (metadata.length !== 2 || missingMetadata.length) {
      throw new Error('Metadata phân quyền của 2 API duyệt đơn vẫn còn trống: ' + JSON.stringify(metadata));
    }

    /* Bằng chứng hành vi trên dữ liệu thật, luôn rollback.

       Kỳ vọng phụ thuộc trạng thái hợp đồng: chưa chốt thì mọi lệnh duyệt phải bị chặn; đang
       bật chế độ test (scripts/apply_order_approval_test_contract.js) thì phải duyệt được.
       Không hard-code một kỳ vọng rồi bắt DB chiều theo. */
    const transaction = new sql.Transaction(pool);
    await transaction.begin();
    let failClosedEvidence = null;
    try {
      const order = (await new sql.Request(transaction).query(
        'SELECT TOP (1) DocumentID, StatusID, BranchID FROM dbo.AR_OrderTbl WHERE StatusID = 0 ORDER BY DocumentID;'
      )).recordset[0];
      const approver = (await new sql.Request(transaction).query(`
        SELECT TOP (1) UserName FROM dbo.SY_User
        WHERE COALESCE(Disable, 0) = 0 AND UPPER(COALESCE(UserGroupID, '')) IN ('KTDH', 'KTDH2', 'TN KTDH')
        ORDER BY UserName;
      `)).recordset[0];
      if (!order || !approver) throw new Error('medtest thiếu đơn StatusID=0 hoặc tài khoản kế toán để chứng minh fail-closed.');

      const result = (await new sql.Request(transaction)
        .input('Username', sql.VarChar(50), approver.UserName)
        .input('DocumentID', sql.VarChar(50), order.DocumentID)
        .input('Action', sql.VarChar(20), 'APPROVE')
        .input('ExpectedStatusID', sql.Int, 0)
        .input('IdempotencyKey', sql.VarChar(128), 'deploy-failclosed-' + Date.now())
        .input('RequestID', sql.VarChar(100), 'req-deploy-' + Date.now())
        .execute('dbo.API_DonHang_ApproveTransition_AI')).recordset[0];

      if (!contractLive) {
        if (!(result && result.MsgType === 1 && result.Code === 'APPROVAL_CONTRACT_NOT_APPROVED')) {
          throw new Error('Hợp đồng chưa chốt mà API vẫn không fail-closed đúng mã: ' + JSON.stringify(result));
        }
      } else if (!(result && (result.MsgType === 5 || result.Code))) {
        throw new Error('Hợp đồng đang sống mà API trả kết quả không đọc được: ' + JSON.stringify(result));
      }

      const statusAfter = (await new sql.Request(transaction)
        .input('DocumentID', sql.VarChar(50), order.DocumentID)
        .query('SELECT StatusID FROM dbo.AR_OrderTbl WHERE DocumentID = @DocumentID;')).recordset[0].StatusID;
      if (!contractLive && statusAfter !== 0) {
        throw new Error('Trạng thái đơn bị đổi trong khi lệnh duyệt bị từ chối.');
      }

      failClosedEvidence = {
        ContractIsLive: contractLive,
        DocumentID: order.DocumentID,
        ApproverTried: approver.UserName,
        Code: result.Code || null,
        Msg: result.Msg,
        StatusBefore: 0,
        StatusAfter: statusAfter,
      };
    } finally {
      await transaction.rollback();
    }

    console.log(JSON.stringify({
      Task: 'ORDER-APPROVAL-003-DEPLOY',
      Status: 'PASS',
      Database: context.DatabaseName,
      ExecutedBy: context.ExecutedBy,
      Deployed: deployed,
      Objects: objects.map((o) => `${o.name} (${o.type_desc})`),
      ContractRows: contractRows,
      ContractIsLive: contractLive,
      ApiMetadata: metadata,
      RuntimeEvidence: failClosedEvidence,
      Note: contractLive
        ? 'Hợp đồng đang SỐNG. Kiểm tra cột ApprovedBy: TEST-ORDER-APPROVAL-003 nghĩa là chế độ test nội bộ, chưa phải sign-off của khách.'
        : 'ContractIsLive=0 là ĐÚNG cho tới khi khách ký ORDER-APPROVAL-002.',
    }, null, 2));
  } finally {
    await pool.close();
  }
}

main().catch((error) => {
  console.error(JSON.stringify({ Task: 'ORDER-APPROVAL-003-DEPLOY', Status: 'FAIL', Error: error.message }, null, 2));
  process.exitCode = 1;
});
