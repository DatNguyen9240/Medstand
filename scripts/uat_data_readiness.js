'use strict';

/* CUSTOMER-UAT-001 — chẩn đoán chuỗi dữ liệu tối thiểu để một tài khoản lập được đơn.

     node scripts/uat_data_readiness.js --user=demo --customer=DL011 --item=A008
     node scripts/uat_data_readiness.js --user=demo --customer=DL011 --search="Thymo"
     node scripts/uat_data_readiness.js --user=demo --customer=DL011 --item=A008 \
          --created-by="Nguyễn A" --data-source=UI --cleanup-plan=KEEP --out=reports/uat-manifest.json

   VÌ SAO CẦN SCRIPT NÀY
   API_HangHoaList_AI loại sản phẩm thiếu giá/tồn/quyền TRƯỚC KHI trả kết quả, nên UI chỉ
   nói được "không tìm thấy" hoặc "không còn bán được hoặc không có giá/tồn hợp lệ".
   Người test không biết thiếu cái gì. Script này đi ngược lại: kiểm TỪNG LỚP một cách độc
   lập và nói rõ lớp nào hỏng, để lấy bằng chứng cho UAT.

   ĐÂY LÀ CÔNG CỤ KIỂM CHỨNG, KHÔNG PHẢI BẢN VÁ. Việc để chính API trả nguyên nhân là một
   thay đổi production riêng (xem PRODUCT-DIAG-001 trong backlog), không làm lén trong task UAT.

   Script CHỈ ĐỌC: không INSERT/UPDATE/DELETE, không tự sinh dữ liệu để test pass.
   CTBH là TÙY CHỌN: không có CTBH vẫn phải lập đơn được, nên lớp PROMOTION chỉ là INFO.

   TRẠNG THÁI TRẢ VỀ — cố ý KHÔNG có "PASS" trần:
     READINESS_FAIL             (exit 1) còn lớp FAIL, chưa lập đơn được.
     EVIDENCE_INCOMPLETE        (exit 3) dữ liệu đủ, nhưng manifest thiếu nguồn gốc do người test khai.
     READINESS_PASS_WITH_WARNINGS (exit 0) đủ điều kiện, nhưng có cảnh báo phải đọc trước khi tin.
     READINESS_PASS             (exit 0) đủ điều kiện lập đơn và manifest đủ nguồn gốc.
   Script này KHÔNG BAO GIỜ phát ra E2E_PASS: nó không lập đơn, nên không thể chứng minh
   luồng chạy được. E2E_PASS là kết luận của người chạy UAT sau khi có mã đơn thật. */

const fs = require('fs');
const path = require('path');
const sql = require('mssql');

const root = path.resolve(__dirname, '..');

/* Dùng lại ĐÚNG parser CTBH note-text của frontend thay vì viết lại. Nếu luật đọc ghi chú
   đổi thì chẩn đoán đổi theo, không lệch âm thầm. */
const MedstandPromotion = require(path.join(root, 'src', 'js', 'utils', 'promotion.js'));

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

function arg(name, fallback) {
  const prefix = `--${name}=`;
  const found = process.argv.find((a) => a.startsWith(prefix));
  return found ? found.slice(prefix.length) : fallback;
}

function layer(name, status, code, message, evidence) {
  return { Layer: name, Status: status, Code: code, Message: message, Evidence: evidence || null };
}

async function main() {
  const username = arg('user', '');
  const objectId = arg('customer', '');
  const itemId = arg('item', '');
  const searchText = arg('search', '');

  if (!username || !objectId || (!itemId && !searchText)) {
    throw new Error('Cú pháp: --user=<tài khoản> --customer=<ObjectID> (--item=<ItemID> hoặc --search=<từ khóa>)');
  }

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

  const runId = 'UATCHK-' + new Date().toISOString().replace(/[-:.TZ]/g, '').slice(0, 14)
    + '-' + Math.random().toString(36).slice(2, 8);
  const layers = [];

  try {
    const context = (await pool.request()
      .query('SELECT DB_NAME() AS DatabaseName, SUSER_SNAME() AS ExecutedBy, SYSUTCDATETIME() AS AsOfUtc;')).recordset[0];

    /* ---------- 1. TÀI KHOẢN ---------- */
    const account = (await pool.request()
      .input('Username', sql.VarChar(50), username)
      .query(`
        SELECT UserName, COALESCE(Disable, 0) AS Disable, COALESCE(BranchID, '') AS BranchID,
               COALESCE(EmployeeID, '') AS EmployeeID, COALESCE(ManagerID, '') AS ManagerID,
               COALESCE(UserGroupID, '') AS UserGroupID, COALESCE(Manager, 0) AS Manager
        FROM dbo.SY_User WHERE UserName = @Username;
      `)).recordset[0];

    if (!account) {
      layers.push(layer('ACCOUNT', 'FAIL', 'ACCOUNT_NOT_FOUND', 'Tài khoản không tồn tại trong SY_User.', { UserName: username }));
    } else if (account.Disable) {
      layers.push(layer('ACCOUNT', 'FAIL', 'ACCOUNT_DISABLED', 'Tài khoản đang bị khóa (Disable = 1).', account));
    } else if (!account.BranchID) {
      layers.push(layer('ACCOUNT', 'FAIL', 'ACCOUNT_BRANCH_MISSING',
        'Tài khoản chưa có BranchID. Không lập đơn được, và cũng không duyệt được đơn theo chi nhánh.', account));
    } else if (!account.EmployeeID) {
      /* Không có EmployeeID vẫn có thể lập đơn, NHƯNG chỉ khi thoả ĐỦ BA điều kiện mà
         API_DonHangChiTiet_Insert_AI đòi: EmployeeID rỗng VÀ Manager = 1 VÀ thuộc nhóm global.
         Chỉ thấy dòng cấu hình rồi kết luận "ổn" là báo WARN cho một tài khoản thật ra sẽ
         chết với USER_SCOPE_INCOMPLETE.

         Danh sách nhóm global ở đây bám theo proc tạo đơn ('Admin','SADM','BGD','GD'), KHÔNG
         phải GlobalUserGroupIDs của BR-STOCK-001 — hai chỗ đó khác nhau, và cái quyết định
         việc lập đơn là proc. */
      const INSERT_PROC_GLOBAL_GROUPS = ['ADMIN', 'SADM', 'BGD', 'GD'];
      const isGlobal = INSERT_PROC_GLOBAL_GROUPS.indexOf(String(account.UserGroupID).toUpperCase()) !== -1;
      const isManager = Number(account.Manager) === 1;

      const actor = (await pool.request()
        .input('Username', sql.VarChar(50), username)
        .query(`
          SELECT TOP (1) ConfigValue, RuleVersion, Status, EffectiveFrom, EffectiveTo
          FROM dbo.AI_BusinessRuleConfigTbl
          WHERE RuleCode = 'BR-ORDER-ACTOR-001' AND ConfigKey = LOWER(@Username)
            AND Status = 'APPROVED'
            AND (EffectiveFrom IS NULL OR EffectiveFrom <= SYSUTCDATETIME())
            AND (EffectiveTo IS NULL OR EffectiveTo > SYSUTCDATETIME())
          ORDER BY EffectiveFrom DESC;
        `)).recordset[0];
      const actorUsable = Boolean(actor) && isManager && isGlobal;

      if (actorUsable) {
        layers.push(layer('ACCOUNT', 'WARN', 'ACCOUNT_EMPLOYEE_FROM_CONFIG',
          'Tài khoản không gắn nhân viên ERP; đang mượn cấu hình BR-ORDER-ACTOR-001. '
          + 'Tài khoản UAT mới sẽ KHÔNG có dòng này — phải gắn EmployeeID thật hoặc thêm cấu hình.',
          { Account: account, ActorConfig: actor, IsManager: isManager, IsGlobalPerInsertProc: isGlobal }));
      } else if (actor) {
        layers.push(layer('ACCOUNT', 'FAIL', 'USER_SCOPE_INCOMPLETE',
          'CÓ cấu hình actor cho tài khoản này nhưng procedure tạo đơn sẽ KHÔNG dùng: nó chỉ áp dụng '
          + `khi Manager = 1 và nhóm thuộc ${INSERT_PROC_GLOBAL_GROUPS.join('/')}. `
          + `Thực tế: Manager = ${account.Manager}, UserGroupID = "${account.UserGroupID}".`,
          { Account: account, ActorConfig: actor, IsManager: isManager, IsGlobalPerInsertProc: isGlobal }));
      } else {
        layers.push(layer('ACCOUNT', 'FAIL', 'USER_SCOPE_INCOMPLETE',
          'Tài khoản chưa gắn EmployeeID và cũng không có cấu hình actor đã duyệt.', account));
      }
    } else {
      layers.push(layer('ACCOUNT', 'PASS', 'ACCOUNT_OK', 'Tài khoản hoạt động, có chi nhánh và nhân viên.', account));
    }

    /* ---------- 2. QUYỀN KHO ---------- */
    const warehouses = (await pool.request()
      .input('Username', sql.VarChar(50), username)
      .query('SELECT StoreHouseID, BranchID, IsGlobal, WarehouseScope, RuleVersion FROM dbo.AI_WarehouseByUserFnc(@Username, SYSUTCDATETIME());')).recordset;
    let stockRuleVersion = warehouses.length ? warehouses[0].RuleVersion : null;
    let ruleVersionSource = warehouses.length ? 'USER_WAREHOUSE_SCOPE' : null;

    /* Tài khoản không có quyền kho thì AI_WarehouseByUserFnc trả rỗng, kéo theo RuleVersion = NULL.
       Nếu cứ thế đi tiếp thì lớp PRODUCT sẽ kết luận "nhóm hàng không được bán" cho MỌI sản phẩm —
       một nguyên nhân SAI che mất nguyên nhân thật là thiếu quyền kho. Lấy rule version độc lập. */
    if (!stockRuleVersion) {
      const activeRule = (await pool.request().query(`
        SELECT TOP (1) C.RuleVersion
        FROM dbo.AI_BusinessRuleConfigTbl C
        WHERE C.RuleCode = 'BR-STOCK-001' AND C.Status = 'APPROVED'
          AND (C.EffectiveFrom IS NULL OR C.EffectiveFrom <= SYSUTCDATETIME())
          AND (C.EffectiveTo IS NULL OR C.EffectiveTo > SYSUTCDATETIME())
          AND C.ConfigKey IN ('SalesWarehouseIDs', 'ReservedOrderStatusIDs', 'GlobalUserGroupIDs',
                              'ManagerUserGroupIDs', 'SellableItemGroupIDs', 'UtcOffsetMinutes')
        GROUP BY C.RuleVersion
        HAVING COUNT(DISTINCT C.ConfigKey) = 6
        ORDER BY MAX(COALESCE(C.EffectiveFrom, CONVERT(DATETIME2(0), '19000101'))) DESC, C.RuleVersion DESC;
      `)).recordset[0];
      if (activeRule) {
        stockRuleVersion = activeRule.RuleVersion;
        ruleVersionSource = 'GLOBAL_ACTIVE_RULE';
      }
    }

    layers.push(warehouses.length
      ? layer('WAREHOUSE_SCOPE', 'PASS', 'WAREHOUSE_OK',
        `Tài khoản được ${warehouses.length} kho bán hàng.`,
        { RuleVersion: stockRuleVersion, StoreHouseIDs: warehouses.map((w) => w.StoreHouseID) })
      : layer('WAREHOUSE_SCOPE', 'FAIL', 'WAREHOUSE_SCOPE_REQUIRED',
        'Tài khoản chưa được phân quyền kho (SY_UserStoreHouseTbl trống, không phải nhóm global, '
        + 'hoặc cấu hình BR-STOCK-001 chưa đủ 6 ConfigKey đã duyệt).', { RuleVersion: stockRuleVersion }));

    /* ---------- 3. KHÁCH HÀNG ---------- */
    const customer = (await pool.request()
      .input('ObjectID', sql.VarChar(50), objectId)
      .query(`
        SELECT ObjectID, ObjectName, COALESCE(ObjectGroupID, '') AS ObjectGroupID,
               COALESCE(Phone, '') AS Phone, COALESCE(BranchID, '') AS BranchID,
               COALESCE(SaleID, '') AS SaleID, COALESCE(UserCreate, '') AS UserCreate, DateCreate,
               COALESCE(isCustomer, 0) AS isCustomer, COALESCE(isDisable, 0) AS isDisable
        FROM dbo.CF_ObjectTbl WHERE ObjectID = @ObjectID;
      `)).recordset[0];

    const inScope = customer ? (await pool.request()
      .input('Username', sql.VarChar(50), username)
      .input('ObjectID', sql.VarChar(50), objectId)
      .query('SELECT COUNT(*) AS Hit FROM dbo.AR_GetObjectByUserFnc(@Username) WHERE ObjectID = @ObjectID;')).recordset[0].Hit : 0;

    if (!customer) {
      layers.push(layer('CUSTOMER', 'FAIL', 'CUSTOMER_NOT_FOUND', 'Khách hàng không tồn tại trong CF_ObjectTbl.', { ObjectID: objectId }));
    } else if (customer.isDisable) {
      layers.push(layer('CUSTOMER', 'FAIL', 'CUSTOMER_DISABLED', 'Khách hàng đã bị khóa (isDisable = 1).', customer));
    } else if (!customer.isCustomer) {
      layers.push(layer('CUSTOMER', 'FAIL', 'NOT_A_CUSTOMER', 'Bản ghi tồn tại nhưng không phải khách hàng (isCustomer = 0).', customer));
    } else if (!inScope) {
      layers.push(layer('CUSTOMER', 'FAIL', 'CUSTOMER_OUT_OF_SCOPE',
        'Khách hàng không nằm trong phạm vi AR_GetObjectByUserFnc của tài khoản này '
        + '(sai ObjectGroupID, sai SaleID hoặc sai nhánh quản lý).', customer));
    } else if (!customer.Phone) {
      layers.push(layer('CUSTOMER', 'FAIL', 'CUSTOMER_PHONE_REQUIRED',
        'Khách hàng chưa có số điện thoại — API tạo đơn chặn ở bước này.', customer));
    } else {
      layers.push(layer('CUSTOMER', 'PASS', 'CUSTOMER_OK', 'Khách hợp lệ và thuộc phạm vi tài khoản.', customer));
    }

    /* ---------- 4/5/6/7. THEO SẢN PHẨM ---------- */
    let targetItem = itemId;

    if (!targetItem && searchText) {
      const found = (await pool.request()
        .input('SearchText', sql.NVarChar(50), searchText)
        .query(`
          SELECT TOP (10) ItemID, ItemName, ItemGroupID FROM dbo.CF_ItemTbl
          WHERE ItemID LIKE '%' + @SearchText + '%' OR ItemName LIKE N'%' + @SearchText + '%'
          ORDER BY ItemName;
        `)).recordset;
      if (!found.length) {
        layers.push(layer('PRODUCT', 'FAIL', 'ITEM_NOT_FOUND',
          `Không có sản phẩm nào khớp "${searchText}" trong CF_ItemTbl. Sản phẩm chưa được nhập vào danh mục.`,
          { SearchText: searchText }));
      } else {
        targetItem = found[0].ItemID;
        layers.push(layer('PRODUCT_SEARCH', 'PASS', 'ITEM_SEARCH_OK',
          `Tìm thấy ${found.length} sản phẩm khớp; chẩn đoán tiếp trên ${targetItem}.`, found));
      }
    }

    if (targetItem) {
      const branchId = account ? account.BranchID : '';
      const item = (await pool.request()
        .input('ItemID', sql.VarChar(50), targetItem)
        .query(`
          SELECT ItemID, ItemName, COALESCE(ItemGroupID, '') AS ItemGroupID, COALESCE(Unit, '') AS Unit,
                 COALESCE(IsDisable, 0) AS IsDisable, COALESCE(IsDisableMB, 0) AS IsDisableMB,
                 COALESCE(IsDisableMN, 0) AS IsDisableMN, COALESCE(IsDisableMT, 0) AS IsDisableMT
          FROM dbo.CF_ItemTbl WHERE ItemID = @ItemID;
        `)).recordset[0];

      if (!item) {
        layers.push(layer('PRODUCT', 'FAIL', 'ITEM_NOT_FOUND', 'Sản phẩm không tồn tại trong CF_ItemTbl.', { ItemID: targetItem }));
      } else {
        const disabledAtBranch = branchId === 'MB' ? item.IsDisableMB
          : branchId === 'MN' ? item.IsDisableMN
            : branchId === 'MT' ? item.IsDisableMT : item.IsDisable;

        const sellableGroup = stockRuleVersion ? (await pool.request()
          .input('RuleVersion', sql.VarChar(30), stockRuleVersion)
          .input('ItemGroupID', sql.VarChar(50), item.ItemGroupID)
          .query(`
            SELECT COALESCE(MAX(C.ConfigValue), '') AS SellableItemGroupIDs,
                   SUM(CASE WHEN LTRIM(RTRIM(V.value)) = @ItemGroupID THEN 1 ELSE 0 END) AS Matched
            FROM dbo.AI_BusinessRuleConfigTbl C
            CROSS APPLY STRING_SPLIT(C.ConfigValue, ',') V
            WHERE C.RuleCode = 'BR-STOCK-001' AND C.RuleVersion = @RuleVersion
              AND C.ConfigKey = 'SellableItemGroupIDs';
          `)).recordset[0] : { SellableItemGroupIDs: '', Matched: 0 };

        if (disabledAtBranch) {
          layers.push(layer('PRODUCT', 'FAIL', 'ITEM_DISABLED_AT_BRANCH',
            `Sản phẩm bị khóa tại chi nhánh ${branchId || '(mặc định)'}.`, item));
        } else if (!stockRuleVersion) {
          layers.push(layer('PRODUCT', 'UNKNOWN', 'SELLABLE_RULE_UNAVAILABLE',
            'Không có cấu hình BR-STOCK-001 nào đã duyệt và còn hiệu lực, nên KHÔNG kết luận được '
            + 'nhóm hàng có bán được hay không. Đây là lỗi cấu hình hệ thống, không phải lỗi dữ liệu sản phẩm.', item));
        } else if (!sellableGroup.Matched) {
          layers.push(layer('PRODUCT', 'FAIL', 'ITEM_GROUP_NOT_SELLABLE',
            `Nhóm hàng "${item.ItemGroupID}" không nằm trong danh sách được bán của BR-STOCK-001.`,
            { Item: item, SellableItemGroupIDs: sellableGroup.SellableItemGroupIDs, RuleVersion: stockRuleVersion }));
        } else {
          layers.push(layer('PRODUCT', 'PASS', 'ITEM_OK', 'Sản phẩm tồn tại, mở tại chi nhánh và thuộc nhóm được bán.', item));
        }

        /* ---------- 5. TỒN ---------- */
        const stock = (await pool.request()
          .input('Username', sql.VarChar(50), username)
          .input('ItemID', sql.VarChar(50), targetItem)
          .query(`
            SELECT StoreHouseID, StoreHouseName, PhysicalStock, ReservedStock, AvailableStock,
                   WarehouseScope, StockDataStatus, StockUpdatedAt, StockAsOfAt, LatestStockMovementDate, StockDataSource
            FROM dbo.AI_StockAvailableByUserFnc(@Username, @ItemID, SYSUTCDATETIME())
            ORDER BY AvailableStock DESC, StoreHouseID;
          `)).recordset;
        const sellableStock = stock.filter((s) => s.AvailableStock > 0 && s.StockDataStatus === 'AVAILABLE_FOR_SALE');

        if (!stock.length) {
          layers.push(layer('STOCK', 'FAIL', warehouses.length ? 'STOCK_NO_ROW' : 'STOCK_BLOCKED_BY_WAREHOUSE_SCOPE',
            warehouses.length
              ? 'Không có dòng tồn nào cho sản phẩm này trong phạm vi kho của tài khoản.'
              : 'Không đọc được tồn vì tài khoản chưa có kho nào. Nguyên nhân thật nằm ở lớp WAREHOUSE_SCOPE, '
                + 'không phải ở sản phẩm.',
            { StoreHouseIDs: warehouses.map((w) => w.StoreHouseID) }));
        } else if (!sellableStock.length) {
          layers.push(layer('STOCK', 'FAIL', 'STOCK_ZERO_AVAILABLE',
            'Có kho nhưng tồn khả dụng = 0 hoặc trạng thái không bán được. '
            + 'Lưu ý AvailableStock = PhysicalStock - ReservedStock (đơn đang mở giữ hàng).', stock));
        } else {
          layers.push(layer('STOCK', 'PASS', 'STOCK_OK',
            `Còn ${sellableStock.length} kho bán được, tồn khả dụng cao nhất ${sellableStock[0].AvailableStock}.`, sellableStock));
        }

        /* Gọi API danh mục SỚM (lớp CATALOG_API vẫn được in ở cuối cho dễ đọc) vì lớp GIÁ
           cần giá mà UI thật sự hiển thị để đối chiếu. */
        const catalog = await pool.request()
          .input('Username', sql.VarChar(50), username)
          .input('ObjectID', sql.VarChar(50), objectId)
          .input('ItemID', sql.VarChar(50), targetItem)
          .input('SearchText', sql.NVarChar(50), '')
          .execute('dbo.API_HangHoaList_AI');
        const catalogRows = catalog.recordset || [];
        const catalogRow = catalogRows.find((r) => String(r.ItemID || '').toUpperCase() === targetItem.toUpperCase()) || null;

        /* ---------- 6. GIÁ ---------- */
        /* Hệ thống có HAI nguồn giá và chúng là hai đoạn code khác nhau:
             - API_HangHoaList_AI  : giá NGƯỜI DÙNG NHÌN THẤY (tự dựng lại logic, không gọi ERP fn).
             - AR_LayGiaSanPhamFnc : giá CỔNG TẠO ĐƠN dùng để chặn PRICE_CHANGED
                                     (API_DonHangChiTiet_Insert_AI, chênh > 0.01 là từ chối).
           Lệch nhau = người test chọn hàng từ danh sách rồi bị từ chối mà không hiểu vì sao,
           nên phải đối chiếu chứ không chọn một bên. */
        const erpPrice = (await pool.request()
          .input('ObjectID', sql.VarChar(50), objectId)
          .input('ItemID', sql.VarChar(50), targetItem)
          .query(`
            SELECT TOP (1) UnitPrice, DiemSanPham, GhiChu
            FROM dbo.AR_LayGiaSanPhamFnc(CAST(GETDATE() AS DATE), @ObjectID, @ItemID);
          `)).recordset[0] || null;

        /* Cố tình KHÔNG lọc theo ngày ở đây: cần phân biệt "chưa có bảng giá" với
           "có bảng giá nhưng hết hiệu lực" — hai nguyên nhân này UI đang gộp làm một. */
        const prices = (await pool.request()
          .input('ObjectID', sql.VarChar(50), objectId)
          .input('ObjectGroupID', sql.VarChar(50), customer ? customer.ObjectGroupID : '')
          .input('ItemID', sql.VarChar(50), targetItem)
          .query(`
            DECLARE @ToDate DATE = CAST(GETDATE() AS DATE);

            SELECT 'OBJECT_PRICE' AS PriceSource, 1 AS Tier, Y.UnitPrice,
                   Y.UserAutoID, Y.Notes AS GhiChu, M.DocumentID,
                   M.FromDate, M.ToDate, COALESCE(M.isDisable, 0) AS isDisable,
                   CASE WHEN COALESCE(M.isDisable, 0) = 0
                          AND COALESCE(M.FromDate, '20000101') <= @ToDate
                          AND COALESCE(M.ToDate, '20990101') >= @ToDate
                        THEN 1 ELSE 0 END AS IsEffectiveToday
            FROM dbo.AR_PriceObjectTbl X
            INNER JOIN dbo.AR_PriceDetailTbl Y ON Y.DocumentID = X.DocumentID AND Y.ItemID = @ItemID
            INNER JOIN dbo.AR_PriceTbl M ON M.DocumentID = X.DocumentID AND COALESCE(M.isObjectPrice, 0) = 1
            WHERE X.ObjectID = @ObjectID

            UNION ALL

            SELECT 'OBJECT_GROUP_PRICE', 2, Y.UnitPrice, Y.UserAutoID, Y.Notes, M.DocumentID,
                   M.FromDate, M.ToDate, COALESCE(M.isDisable, 0),
                   CASE WHEN COALESCE(M.isDisable, 0) = 0
                          AND COALESCE(M.FromDate, '20000101') <= @ToDate
                          AND COALESCE(M.ToDate, '20990101') >= @ToDate
                        THEN 1 ELSE 0 END
            FROM dbo.AR_PriceObjectGroupTbl X
            INNER JOIN dbo.AR_PriceDetailTbl Y ON Y.DocumentID = X.DocumentID AND Y.ItemID = @ItemID
            INNER JOIN dbo.AR_PriceTbl M ON M.DocumentID = X.DocumentID AND COALESCE(M.isObjectPrice, 0) = 1
            WHERE X.ObjectGroupID = @ObjectGroupID

            UNION ALL

            SELECT 'GENERAL_PRICE', 3, Y.UnitPrice, Y.UserAutoID, Y.Notes, X.DocumentID,
                   X.FromDate, X.ToDate, COALESCE(X.isDisable, 0),
                   CASE WHEN COALESCE(X.isDisable, 0) = 0
                          AND COALESCE(X.FromDate, '20000101') <= @ToDate
                          AND COALESCE(X.ToDate, '20990101') >= @ToDate
                        THEN 1 ELSE 0 END
            FROM dbo.AR_PriceTbl X
            INNER JOIN dbo.AR_PriceDetailTbl Y ON Y.DocumentID = X.DocumentID AND Y.ItemID = @ItemID
            WHERE COALESCE(X.isObjectPrice, 0) = 0

            /* Tie-break PHẢI giống RankedPrice của API_HangHoaList_AI (PricePriority rồi
               UserAutoID DESC). Thiếu vế UserAutoID thì hai bảng giá cùng tầng cùng hiệu lực
               sẽ cho ra giá khác UI — đã từng xảy ra thật với B037 (79.000 vs 105.000). */
            ORDER BY Tier, IsEffectiveToday DESC, UserAutoID DESC;
          `)).recordset;
        const effectivePrice = prices.find((p) => p.IsEffectiveToday === 1);

        const catalogPrice = catalogRow && catalogRow.UnitPrice != null ? Number(catalogRow.UnitPrice) : null;
        const gatePrice = erpPrice && erpPrice.UnitPrice != null ? Number(erpPrice.UnitPrice) : null;
        const diagnosticPrice = effectivePrice ? Number(effectivePrice.UnitPrice) : null;
        const priceSources = {
          CatalogShown: catalogPrice,          /* API_HangHoaList_AI — cái người dùng thấy */
          OrderGate: gatePrice,                /* AR_LayGiaSanPhamFnc — cái proc tạo đơn chấp nhận */
          DiagnosticTierPick: diagnosticPrice,
        };
        /* Ngưỡng 0.01 lấy đúng từ điều kiện ABS(...) <= 0.01 trong API_DonHangChiTiet_Insert_AI.
           So sánh cả 3 nguồn (Catalog, OrderGate, DiagnosticTierPick) để bảo vệ chính logic chẩn đoán. */
        const pricePairs = [
          [catalogPrice, gatePrice],
          [catalogPrice, diagnosticPrice],
          [gatePrice, diagnosticPrice],
        ];
        const diverges = pricePairs.some(([a, b]) => a !== null && b !== null && Math.abs(a - b) > 0.01);

        if (!prices.length) {
          layers.push(layer('PRICE', 'FAIL', 'PRICE_NOT_FOUND',
            'Sản phẩm chưa có bảng giá nào: không có giá riêng cho khách, không có giá theo nhóm khách, '
            + 'cũng không có bảng giá chung.', { ObjectID: objectId, ObjectGroupID: customer ? customer.ObjectGroupID : '', ItemID: targetItem, PriceSources: priceSources }));
        } else if (!effectivePrice) {
          layers.push(layer('PRICE', 'FAIL', 'PRICE_EXPIRED_OR_DISABLED',
            'CÓ bảng giá nhưng không dòng nào còn hiệu lực hôm nay (hết hạn, chưa tới hạn hoặc đã bị tắt). '
            + 'Đây là ca UI đang báo nhầm thành "không tìm thấy sản phẩm".',
            { PriceSources: priceSources, AllCandidates: prices }));
        } else if (diverges) {
          layers.push(layer('PRICE', 'FAIL', 'PRICE_SOURCE_DIVERGENCE',
            `Phát hiện sai lệch giữa các nguồn giá (Catalog=${catalogPrice}, OrderGate=${gatePrice}, DiagnosticTierPick=${diagnosticPrice}). `
            + 'Người test sẽ chọn hàng từ danh sách rồi bị từ chối với PRICE_CHANGED mà không hiểu vì sao. '
            + 'Đây là lỗi sản phẩm, không phải lỗi dữ liệu UAT.',
            { PriceSources: priceSources, Applied: effectivePrice, AllCandidates: prices }));
        } else {
          layers.push(layer('PRICE', 'PASS', 'PRICE_OK',
            `Giá áp dụng ${effectivePrice.UnitPrice} từ nguồn ${effectivePrice.PriceSource}`
            + (catalogPrice !== null && gatePrice !== null ? ' (danh mục, cổng tạo đơn và chẩn đoán khớp nhau).' : '.'),
            { PriceSources: priceSources, Applied: effectivePrice, AllCandidates: prices }));
        }

        /* ---------- 7. CTBH (TÙY CHỌN) ---------- */
        const promotions = (await pool.request()
          .input('Username', sql.VarChar(50), username)
          .input('ItemID', sql.VarChar(50), targetItem)
          .query(`
            SELECT PromotionCode, PromotionName, ProgramType, EffectiveFrom, EffectiveTo,
                   RuleType, PromotionStatus
            FROM dbo.AI_ActivePromotionByUserFnc(@Username, @ItemID, SYSUTCDATETIME());
          `)).recordset;

        /* CTBH có HAI nguồn, phải phân biệt chứ không gộp:
             1. Rule cấu hình đã duyệt (AI_PromotionProgramTbl) — khả dụng nếu đạt điều kiện min/max.
             2. Ghi chú note-text trong AR_PriceDetailTbl.Notes — đường lùi khi không có rule.
           Trả về "không có CTBH" trong khi ghi chú đang chứa "Mua 10+2..." là tự mâu thuẫn
           với chính lớp CATALOG_API ngay bên dưới. */
        const noteText = String((erpPrice && erpPrice.GhiChu)
          || (catalogRow && catalogRow.GhiChu)
          || (effectivePrice && effectivePrice.GhiChu) || '').trim();
        const noteRule = noteText ? MedstandPromotion.parse(noteText) : null;
        const noteIsPromotion = Boolean(noteRule
          && (noteRule.buyTiers.length > 0
            || noteRule.belowMinimumDiscountPercent !== null
            || noteRule.pricingMode === 'full_price'));

        if (promotions.length) {
          layers.push(layer('PROMOTION', 'INFO', 'PROMOTION_CONFIG_AVAILABLE',
            `Có ${promotions.length} CTBH cấu hình khả dụng đã duyệt — khi lập đơn, rule cấu hình sẽ được ưu tiên áp dụng nếu thỏa điều kiện dòng hàng (số lượng/giá trị).`,
            { ConfigRules: promotions, NoteText: noteText || null }));
        } else if (noteIsPromotion) {
          layers.push(layer('PROMOTION', 'INFO', 'PROMOTION_NOTE_TEXT_ONLY',
            'Không có CTBH cấu hình, nhưng ghi chú bảng giá CÓ chứa ưu đãi và sẽ được áp dụng theo note-text. '
            + 'Ca này phải test riêng: cách tính đi qua parser ghi chú, không qua rule đã duyệt.',
            { NoteText: noteText, ParsedRule: noteRule }));
        } else {
          layers.push(layer('PROMOTION', 'INFO', 'NO_PROMOTION',
            'Không có CTBH ở cả hai nguồn (cấu hình lẫn ghi chú). ĐÂY KHÔNG PHẢI LỖI — '
            + 'sản phẩm có giá và tồn vẫn phải lập đơn được.',
            { NoteText: noteText || null }));
        }

        /* ---------- 8. ĐỐI CHIẾU VỚI ĐÚNG API MÀ UI GỌI ---------- */
        /* Kết quả đã lấy ở trên (trước lớp GIÁ); ở đây chỉ kết luận. */
        const apiError = catalogRows.length === 1 && catalogRows[0].MsgType === 1 ? catalogRows[0].Msg : null;

        layers.push(catalogRow
          ? layer('CATALOG_API', 'PASS', 'CATALOG_VISIBLE',
            'API_HangHoaList_AI trả sản phẩm này — UI chọn được.', [catalogRow])
          : layer('CATALOG_API', 'FAIL', apiError ? 'CATALOG_BLOCKED' : 'CATALOG_HIDDEN',
            apiError
              ? `API trả lỗi: ${apiError}`
              : 'API_HangHoaList_AI KHÔNG trả sản phẩm này. UI sẽ chỉ nói "không còn bán được hoặc không có '
                + 'giá/tồn hợp lệ". Nguyên nhân thật nằm ở các lớp FAIL phía trên.',
            { RowsReturned: catalogRows.length, ApiMsg: apiError }));
      }
    }

    /* ---------- KẾT LUẬN ---------- */
    const failed = layers.filter((l) => l.Status === 'FAIL');
    const warned = layers.filter((l) => l.Status === 'WARN');
    const unknown = layers.filter((l) => l.Status === 'UNKNOWN');

    /* Ba trường do người test khai. Validate giá trị hợp lệ:
       - DataSource: UI | BACK_OFFICE | API
       - CleanupPlan: KEEP | DELETE_AFTER_UAT
       - DataCreatedBy: chuỗi định danh người tạo (>= 2 ký tự)
       Thiếu hoặc sai giá trị hợp lệ thì manifest KHÔNG đủ tư cách làm bằng chứng UAT. */
    const VALID_DATA_SOURCES = new Set(['UI', 'BACK_OFFICE', 'API']);
    const VALID_CLEANUP_PLANS = new Set(['KEEP', 'DELETE_AFTER_UAT']);

    const rawCreatedBy = arg('created-by', null);
    const rawDataSource = arg('data-source', null);
    const rawCleanupPlan = arg('cleanup-plan', null);

    const dataCreatedBy = rawCreatedBy && String(rawCreatedBy).trim().length >= 2 ? String(rawCreatedBy).trim() : null;
    const dataSource = rawDataSource && VALID_DATA_SOURCES.has(String(rawDataSource).trim().toUpperCase())
      ? String(rawDataSource).trim().toUpperCase() : null;
    const cleanupPlan = rawCleanupPlan && VALID_CLEANUP_PLANS.has(String(rawCleanupPlan).trim().toUpperCase())
      ? String(rawCleanupPlan).trim().toUpperCase() : null;

    const testerFields = {
      DataCreatedBy: dataCreatedBy,
      DataSource: dataSource, /* UI | BACK_OFFICE | API */
      CleanupPlan: cleanupPlan, /* KEEP | DELETE_AFTER_UAT */
      OrderRequestID: null,
      OrderIdempotencyKey: null,
      OrderDocumentID: null,
      OrderStatusID: null,
    };
    const missingTesterFields = [];
    if (!dataCreatedBy) missingTesterFields.push('DataCreatedBy (chuỗi định danh người tạo >= 2 ký tự)');
    if (!dataSource) missingTesterFields.push('DataSource (phải là: UI | BACK_OFFICE | API)');
    if (!cleanupPlan) missingTesterFields.push('CleanupPlan (phải là: KEEP | DELETE_AFTER_UAT)');

    /* Thứ tự có chủ ý: FAIL (dữ liệu hỏng) → EVIDENCE_INCOMPLETE (không truy được nguồn) →
       PASS_WITH_WARNINGS → PASS. Không bao giờ trả "PASS" trần, và không bao giờ trả E2E_PASS. */
    const status = failed.length ? 'READINESS_FAIL'
      : missingTesterFields.length ? 'EVIDENCE_INCOMPLETE'
        : warned.length ? 'READINESS_PASS_WITH_WARNINGS'
          : 'READINESS_PASS';

    const manifest = {
      Task: 'CUSTOMER-UAT-001-DATA-READINESS',
      Status: status,
      RunID: runId,
      RunAtUtc: context.AsOfUtc,
      Environment: { Database: context.DatabaseName, Server: env.TEST_DB_SERVER, ExecutedBy: context.ExecutedBy },
      Account: account ? {
        UserName: account.UserName, BranchID: account.BranchID, EmployeeID: account.EmployeeID,
        UserGroupID: account.UserGroupID, Manager: account.Manager,
      } : { UserName: username, NotFound: true },
      Customer: customer ? {
        ObjectID: customer.ObjectID, ObjectName: customer.ObjectName, ObjectGroupID: customer.ObjectGroupID,
        BranchID: customer.BranchID, SaleID: customer.SaleID,
        CreatedBy: customer.UserCreate, CreatedAt: customer.DateCreate,
      } : { ObjectID: objectId, NotFound: true },
      Item: targetItem || null,
      StockRuleVersion: stockRuleVersion,
      StockRuleVersionSource: ruleVersionSource,
      Layers: layers,
      BlockingCodes: failed.map((l) => l.Code),
      Warnings: warned.map((l) => l.Code),
      Undetermined: unknown.map((l) => l.Code),
      /* Những trường sau chỉ người chạy UAT mới điền được. Để trống có chủ ý,
         KHÔNG bịa: manifest thiếu nguồn gốc dữ liệu thì không dùng để tuyên bố PASS. */
      TesterFields: testerFields,
      MissingTesterFields: missingTesterFields,
      Verdict: failed.length
        ? `Chưa lập đơn được. Nguyên nhân thật: ${failed.map((l) => l.Code).join(', ')}.`
        : missingTesterFields.length
          ? 'Dữ liệu đủ để THỬ lập đơn, nhưng manifest chưa dùng làm bằng chứng được: thiếu hoặc không hợp lệ: '
            + `${missingTesterFields.join(', ')}. Bổ sung bằng --created-by/--data-source=[UI|BACK_OFFICE|API]/--cleanup-plan=[KEEP|DELETE_AFTER_UAT].`
          : 'Đủ điều kiện lập đơn cho cặp khách × sản phẩm này. '
            + 'Đây KHÔNG phải bằng chứng đã lập đơn thành công — mã đơn và request ID phải do người test điền sau.',
    };

    console.log(JSON.stringify(manifest, null, 2));

    const outPath = arg('out', '');
    if (outPath) {
      const absolute = path.isAbsolute(outPath) ? outPath : path.join(root, outPath);
      fs.mkdirSync(path.dirname(absolute), { recursive: true });
      fs.writeFileSync(absolute, JSON.stringify(manifest, null, 2), 'utf8');
      console.error(`Manifest đã ghi: ${absolute}`);
    }

    if (status === 'READINESS_FAIL') process.exitCode = 1;
    else if (status === 'EVIDENCE_INCOMPLETE') process.exitCode = 3;
  } finally {
    await pool.close();
  }
}

main().catch((error) => {
  console.error(JSON.stringify({ Task: 'CUSTOMER-UAT-001-DATA-READINESS', Status: 'ERROR', Error: error.message }, null, 2));
  process.exitCode = 2;
});
