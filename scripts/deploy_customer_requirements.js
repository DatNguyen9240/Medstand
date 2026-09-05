'use strict';

const fs = require('fs');
const path = require('path');
const sql = require('mssql');

const root = path.resolve(__dirname, '..');
const files = [
  'sql/CUSTOMER-CONTRACT-001_Analytics_AI.sql',
  'sql/PROMO-AUTH-001_Permission_Matrix_AI.sql',
  'sql/PROMO-CFG-001_Promotion_Program_Admin_AI.sql',
  'sql/PROMO-AI-001_CTBH_Product_Query_AI.sql'
];

function readEnv(relativePath) {
  const values = {};
  const file = path.join(root, relativePath);
  if (!fs.existsSync(file)) return values;
  for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
    const match = line.match(/^\s*([^#=]+)=(.*)$/);
    if (match) values[match[1].trim()] = match[2].trim().replace(/^['"]|['"]$/g, '');
  }
  return values;
}

function batches(source) {
  return source.split(/^\s*GO\s*(?:--.*)?$/gim).map((part) => part.trim()).filter(Boolean);
}

async function main() {
  const apply = process.argv.includes('--apply');
  const env = { ...readEnv('.env'), ...readEnv('.env.uat.local'), ...process.env };
  const pool = await sql.connect({
    server: env.TEST_DB_SERVER,
    port: Number(env.TEST_DB_PORT || 1433),
    database: env.TEST_DB_DATABASE,
    user: env.TEST_DB_USER,
    password: env.TEST_DB_PASSWORD,
    options: { encrypt: false, trustServerCertificate: true },
    connectionTimeout: 15000,
    requestTimeout: 180000,
    pool: { max: 1, min: 0, idleTimeoutMillis: 10000 }
  });
  const context = (await pool.request().query('SELECT DB_NAME() DatabaseName, SUSER_SNAME() ExecutedBy;')).recordset[0];
  if (String(context.DatabaseName).toLowerCase() !== 'medtest') {
    throw new Error(`Chỉ cho phép triển khai vào medtest; hiện tại là ${context.DatabaseName}.`);
  }

  const transaction = new sql.Transaction(pool);
  let open = false;
  try {
    await transaction.begin(sql.ISOLATION_LEVEL.SERIALIZABLE);
    open = true;
    const deployed = [];
    let batchCount = 0;
    for (const relativeFile of files) {
      for (const batch of batches(fs.readFileSync(path.join(root, relativeFile), 'utf8'))) {
        await new sql.Request(transaction).batch(batch);
        batchCount += 1;
      }
      deployed.push(relativeFile);
    }

    const required = [
      'AI_ContractCustomerAssignmentFnc', 'API_ContractCustomerStats_AI',
      'API_ContractCustomerNoSales_AI', 'AI_PromotionPermissionFnc',
      'API_PromotionPermissionContext_AI', 'API_PromotionProgram_History_AI',
      'API_CTBHSanPham_AI'
    ];
    const request = new sql.Request(transaction).input('Names', sql.NVarChar(sql.MAX), JSON.stringify(required));
    const objects = (await request.query(`
      SELECT O.name FROM sys.objects O
      WHERE O.name IN (SELECT value FROM OPENJSON(@Names));
    `)).recordset.map((row) => row.name);
    const missing = required.filter((name) => !objects.includes(name));
    if (missing.length) throw new Error('Thiếu object sau triển khai: ' + missing.join(', '));

    const assignment = (await new sql.Request(transaction).query(`
      SELECT COUNT_BIG(*) TotalRows, COUNT_BIG(DISTINCT CanonicalObjectID) UniqueCustomers
      FROM dbo.AI_ContractCustomerAssignmentFnc(2026, CONVERT(date, GETDATE()));
    `)).recordset[0];
    if (Number(assignment.TotalRows) !== Number(assignment.UniqueCustomers)) {
      throw new Error('Nguồn hợp đồng còn trùng khách sau chuẩn hóa.');
    }

    const actors = (await new sql.Request(transaction).query(`
      SELECT
        (SELECT TOP (1) UserName FROM dbo.SY_User WHERE COALESCE(Disable,0)=0 AND UPPER(COALESCE(UserGroupID,'')) IN ('ADMIN','SADM','BGD','GD') ORDER BY UserName) GlobalUser,
        (SELECT TOP (1) UserName FROM dbo.SY_User WHERE COALESCE(Disable,0)=0 AND COALESCE(BranchID,'')<>'' AND (COALESCE(Manager,0)=1 OR UPPER(COALESCE(UserGroupID,'')) IN ('QL','QLMN')) AND UPPER(COALESCE(UserGroupID,'')) NOT IN ('ADMIN','SADM','BGD','GD') ORDER BY UserName) ManagerUser;
    `)).recordset[0];
    if (!actors.GlobalUser || !actors.ManagerUser) throw new Error('Thiếu tài khoản global hoặc QLBH để kiểm tra phân quyền.');

    const managerPermission = (await new sql.Request(transaction)
      .input('Username', sql.VarChar(50), actors.ManagerUser)
      .execute('dbo.API_PromotionPermissionContext_AI')).recordset[0];
    const globalPermission = (await new sql.Request(transaction)
      .input('Username', sql.VarChar(50), actors.GlobalUser)
      .execute('dbo.API_PromotionPermissionContext_AI')).recordset[0];
    if (Number(managerPermission.CanCreate) !== 1 || Number(managerPermission.CanApprove) !== 0 || managerPermission.ScopeMode !== 'OWN_BRANCH') {
      throw new Error('Ma trận quyền QLBH không đúng chính sách khai báo chi nhánh.');
    }
    if (Number(globalPermission.CanApprove) !== 1 || globalPermission.ScopeMode !== 'ALL') {
      throw new Error('Ma trận quyền phê duyệt toàn cục không đúng chính sách.');
    }

    const stats = (await new sql.Request(transaction)
      .input('Username', sql.VarChar(50), actors.GlobalUser)
      .input('ContractYear', sql.Int, 2026)
      .input('AsOfDate', sql.Date, new Date())
      .execute('dbo.API_ContractCustomerStats_AI')).recordset;
    if (!stats.length || stats[0].ScopeLevel !== 'TOTAL') throw new Error('API thống kê KH hợp đồng không trả dòng TOTAL.');
    const noSales = (await new sql.Request(transaction)
      .input('Username', sql.VarChar(50), actors.GlobalUser)
      .input('ContractYear', sql.Int, 2026)
      .input('AsOfDate', sql.Date, new Date())
      .input('TopN', sql.Int, 5)
      .execute('dbo.API_ContractCustomerNoSales_AI')).recordset;
    if (noSales.some((row) => Number(row.RevenueLast3Months) > 0)) {
      throw new Error('API cảnh báo trả khách có doanh số dương trong kỳ.');
    }

    const product = (await new sql.Request(transaction).query(`
      SELECT TOP (1) ItemID FROM dbo.CF_ItemTbl WHERE COALESCE(isDisable,0)=0 ORDER BY ItemID;
    `)).recordset[0];
    if (!product) throw new Error('Không có sản phẩm để kiểm tra API CTBH.');
    const candidates = (await new sql.Request(transaction).query(`
      SELECT TOP (50) UserName FROM dbo.SY_User
      WHERE COALESCE(Disable,0)=0 AND COALESCE(EmployeeID,'')<>''
      ORDER BY CASE WHEN COALESCE(Manager,0)=0 THEN 0 ELSE 1 END, UserName;
    `)).recordset;
    let ctbh = [];
    let ctbhUser = '';
    for (const candidate of candidates) {
      const rows = (await new sql.Request(transaction)
        .input('Username', sql.VarChar(50), candidate.UserName)
        .input('timkiem', sql.NVarChar(100), product.ItemID)
        .input('TopN', sql.Int, 1)
        .execute('dbo.API_CTBHSanPham_AI')).recordset;
      if (!rows.some((row) => Number(row.MsgType) === 1)) {
        ctbh = rows;
        ctbhUser = candidate.UserName;
        break;
      }
    }
    if (!ctbhUser) throw new Error('Không tìm thấy tài khoản có phạm vi kho để kiểm tra API CTBH theo sản phẩm.');

    await new sql.Request(transaction).query('SAVE TRANSACTION PromotionPermissionTest;');
    let promotionEvidence;
    try {
      const testCode = 'PROMO_AUTH_VERIFY_' + Date.now();
      const validBranches = JSON.stringify([managerPermission.BranchID]);
      const rules = JSON.stringify([{
        RuleOrder: 1, ItemID: product.ItemID, RuleType: 'QUANTITY_DISCOUNT',
        MinimumQuantity: 1, DiscountPercent: 5
      }]);
      const crossBranch = (await new sql.Request(transaction)
        .input('PromotionCode', sql.VarChar(50), testCode + '_DENY')
        .input('PromotionName', sql.NVarChar(300), 'Kiểm tra chặn khác chi nhánh')
        .input('ProgramType', sql.VarChar(20), 'EVENT')
        .input('EffectiveFrom', sql.DateTime2(0), new Date(Date.now() - 60000))
        .input('EffectiveTo', sql.DateTime2(0), new Date(Date.now() + 86400000))
        .input('BranchScopeMode', sql.VarChar(10), 'INCLUDE')
        .input('JsonBranchIDs', sql.NVarChar(sql.MAX), JSON.stringify(['ZZ_OUT_OF_SCOPE']))
        .input('SourceDocument', sql.NVarChar(500), 'deploy_customer_requirements.js')
        .input('JsonRules', sql.NVarChar(sql.MAX), rules)
        .input('Username', sql.VarChar(50), actors.ManagerUser)
        .input('Apply', sql.Bit, 0)
        .execute('dbo.API_PromotionProgram_Upsert_AI')).recordset[0];
      if (Number(crossBranch?.MsgType) !== 1) throw new Error('QLBH chưa bị chặn khi khai báo CTKM khác chi nhánh.');

      const created = (await new sql.Request(transaction)
        .input('PromotionCode', sql.VarChar(50), testCode)
        .input('PromotionName', sql.NVarChar(300), 'Kiểm tra phân quyền CTKM')
        .input('ProgramType', sql.VarChar(20), 'EVENT')
        .input('EffectiveFrom', sql.DateTime2(0), new Date(Date.now() - 60000))
        .input('EffectiveTo', sql.DateTime2(0), new Date(Date.now() + 86400000))
        .input('BranchScopeMode', sql.VarChar(10), 'INCLUDE')
        .input('JsonBranchIDs', sql.NVarChar(sql.MAX), validBranches)
        .input('SourceDocument', sql.NVarChar(500), 'deploy_customer_requirements.js')
        .input('JsonRules', sql.NVarChar(sql.MAX), rules)
        .input('Username', sql.VarChar(50), actors.ManagerUser)
        .input('Apply', sql.Bit, 1)
        .execute('dbo.API_PromotionProgram_Upsert_AI')).recordset[0];
      if (!created?.PromotionProgramID || Number(created.MsgType) !== 0) {
        throw new Error('QLBH không tạo được CTKM đúng chi nhánh: ' + JSON.stringify({ managerPermission, created }));
      }

      const approved = (await new sql.Request(transaction)
        .input('PromotionProgramID', sql.BigInt, created.PromotionProgramID)
        .input('Action', sql.VarChar(20), 'APPROVE')
        .input('Username', sql.VarChar(50), actors.GlobalUser)
        .input('Apply', sql.Bit, 1)
        .input('Reason', sql.NVarChar(500), null)
        .execute('dbo.API_PromotionProgram_Approve_AI')).recordset[0];
      if (approved?.Status !== 'APPROVED') throw new Error('Nhóm toàn cục không duyệt được CTKM của QLBH.');
      promotionEvidence = {
        CrossBranchBlocked: true, ManagerCreatedOwnBranch: true,
        ApprovedByDifferentGlobalUser: true
      };
    } finally {
      await new sql.Request(transaction).query('ROLLBACK TRANSACTION PromotionPermissionTest;');
    }

    if (apply) {
      await transaction.commit();
    } else {
      await transaction.rollback();
    }
    open = false;
    console.log(JSON.stringify({
      Task: 'CUSTOMER-REQUESTS-DEPLOY', Status: 'PASS', Mode: apply ? 'APPLY' : 'ROLLBACK_PREFLIGHT',
      Database: context.DatabaseName, ExecutedBy: context.ExecutedBy, BatchCount: batchCount,
      Files: deployed, ContractCustomers2026: Number(assignment.UniqueCustomers),
      SaleRows: stats.filter((row) => row.ScopeLevel === 'SALE').length,
      NoSalesSampleRows: noSales.length,
      PermissionEvidence: {
        ManagerUser: actors.ManagerUser, ManagerScope: managerPermission.ScopeMode,
        ManagerCanCreate: Number(managerPermission.CanCreate), ManagerCanApprove: Number(managerPermission.CanApprove),
        GlobalUser: actors.GlobalUser, GlobalScope: globalPermission.ScopeMode,
        GlobalCanApprove: Number(globalPermission.CanApprove), ...promotionEvidence
      },
      CtbhUserSample: ctbhUser, CtbhProductSample: product.ItemID, CtbhRows: ctbh.length
    }, null, 2));
  } finally {
    if (open) {
      try { await transaction.rollback(); } catch (_) { /* transaction may already be aborted */ }
    }
    await pool.close();
  }
}

main().catch((error) => {
  console.error(JSON.stringify({ Task: 'CUSTOMER-REQUESTS-DEPLOY', Status: 'FAIL', Error: error.message }, null, 2));
  process.exitCode = 1;
});
