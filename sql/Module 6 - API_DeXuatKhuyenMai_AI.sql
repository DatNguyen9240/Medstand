CREATE OR ALTER PROCEDURE [dbo].[API_DeXuatKhuyenMai_AI]
    @Username VARCHAR(50) = ''
AS
BEGIN
    SET NOCOUNT ON;

    DECLARE @SYSBranchID VARCHAR(50) = '';
    DECLARE @SYSUserGroupID VARCHAR(50) = '';
    DECLARE @EmployeeID VARCHAR(50) = '';
    DECLARE @IsGlobal BIT = 0;
    DECLARE @IsManager BIT = 0;
    DECLARE @AllowedStores TABLE (StoreHouseID VARCHAR(50) PRIMARY KEY);

    SELECT
        @SYSBranchID = COALESCE(BranchID, ''),
        @SYSUserGroupID = COALESCE(UserGroupID, ''),
        @EmployeeID = COALESCE(EmployeeID, ''),
        @IsGlobal = CASE WHEN UPPER(COALESCE(UserGroupID, '')) IN ('ADMIN', 'SADM', 'BGD', 'GD') THEN 1 ELSE 0 END,
        @IsManager = CASE WHEN COALESCE(Manager, 0) = 1 OR UPPER(COALESCE(UserGroupID, '')) = 'QL' THEN 1 ELSE 0 END
    FROM dbo.SY_User WITH (NOLOCK)
    WHERE UserName = @Username
      AND COALESCE(Disable, 0) = 0;

    IF @SYSUserGroupID = ''
    BEGIN
        SELECT N'User không tồn tại hoặc đã bị khóa.' AS Msg, 1 AS MsgType;
        RETURN;
    END;

    /*
       Sale chỉ được xem chương trình APPROVED_ACTIVE của công ty. Schema medtest
       hiện chưa có cột/bảng chứng minh trạng thái phê duyệt của AR_PromotionTbl,
       vì vậy không được dùng isDisable/ngày hiệu lực để giả định là đã duyệt.
       Khi owner ERP xác nhận nguồn approval, nhánh này mới được nối dữ liệu thật.
    */
    IF @IsGlobal = 0 AND @IsManager = 0
    BEGIN
        SELECT TOP (0)
            CAST(NULL AS VARCHAR(50)) AS ProgramID,
            CAST(NULL AS NVARCHAR(250)) AS ProgramName,
            CAST(NULL AS DATETIME) AS EffectiveFrom,
            CAST(NULL AS DATETIME) AS EffectiveTo,
            CAST(NULL AS NVARCHAR(50)) AS ProgramStatus,
            CAST(NULL AS NVARCHAR(50)) AS ViewMode,
            CAST(NULL AS NVARCHAR(50)) AS Audience,
            CAST(NULL AS NVARCHAR(50)) AS RuleVersion;
        RETURN;
    END;

    INSERT INTO @AllowedStores (StoreHouseID)
    SELECT DISTINCT US.StoreHouseID
    FROM dbo.SY_UserStoreHouseTbl US WITH (NOLOCK)
    WHERE US.UserName = @Username
      AND ISNULL(US.StoreHouseID, '') <> '';

    IF @IsManager = 1 AND ISNULL(@EmployeeID, '') <> ''
    BEGIN
        INSERT INTO @AllowedStores (StoreHouseID)
        SELECT DISTINCT US.StoreHouseID
        FROM dbo.SY_User U WITH (NOLOCK)
        JOIN dbo.SY_UserStoreHouseTbl US WITH (NOLOCK)
          ON US.UserName = U.UserName
        WHERE U.ManagerID = @EmployeeID
          AND ISNULL(U.Disable, 0) = 0
          AND ISNULL(US.StoreHouseID, '') <> ''
          AND NOT EXISTS (
              SELECT 1
              FROM @AllowedStores A
              WHERE A.StoreHouseID = US.StoreHouseID
          );
    END;

    IF @IsGlobal = 0 AND NOT EXISTS (SELECT 1 FROM @AllowedStores)
    BEGIN
        SELECT N'Tài khoản chưa được phân quyền kho.' AS Msg, 1 AS MsgType;
        RETURN;
    END;

    /* Tồn vật lý còn lại theo lô trong đúng phạm vi kho của Manager/Admin. */
    SELECT
        T.ItemID,
        T.StoreHouseID,
        T.Lot,
        T.ExpireDate,
        SUM(ISNULL(T.Quantity, 0)) AS RemainingPhysical
    INTO #StockByLot
    FROM dbo.IV_StockTransactionTbl T WITH (NOLOCK)
    WHERE @IsGlobal = 1
       OR T.StoreHouseID IN (SELECT StoreHouseID FROM @AllowedStores)
    GROUP BY T.ItemID, T.StoreHouseID, T.Lot, T.ExpireDate
    HAVING SUM(ISNULL(T.Quantity, 0)) > 0;

    SELECT
        ItemID,
        SUM(RemainingPhysical) AS PhysicalStock,
        SUM(CASE
            WHEN ExpireDate IS NULL OR CAST(ExpireDate AS DATE) >= CAST(GETDATE() AS DATE)
                THEN RemainingPhysical
            ELSE 0
        END) AS AvailableStock,
        MIN(CASE WHEN ExpireDate >= GETDATE() THEN ExpireDate END) AS NearestExpireDate
    INTO #PhysicalStock
    FROM #StockByLot
    GROUP BY ItemID
    HAVING SUM(RemainingPhysical) > 0;

    /* Tốc độ bán 30 ngày chỉ dùng hóa đơn hoàn tất trong phạm vi chi nhánh. */
    SELECT
        D.ItemID,
        SUM(ISNULL(D.Quantity, 0)) / 30.0 AS DailySalesVelocity
    INTO #SalesVelocity
    FROM dbo.AR_InvoiceDetailTbl D WITH (NOLOCK)
    JOIN dbo.AR_InvoiceTbl I WITH (NOLOCK)
      ON I.DocumentID = D.DocumentID
    WHERE I.DocumentDate >= DATEADD(DAY, -30, GETDATE())
      AND I.StatusID IN (3, 6, 7, 8)
      AND (@IsGlobal = 1 OR I.BranchID = @SYSBranchID)
    GROUP BY D.ItemID;

    ;WITH Candidate AS (
        SELECT
            S.ItemID,
            Item.ItemName,
            Item.Unit,
            S.PhysicalStock,
            S.AvailableStock,
            S.NearestExpireDate,
            ISNULL(V.DailySalesVelocity, 0) AS DailySalesVelocity,
            CASE
                WHEN S.NearestExpireDate <= DATEADD(MONTH, 3, GETDATE()) THEN N'NEAR_EXPIRY_URGENT'
                WHEN S.NearestExpireDate <= DATEADD(MONTH, 6, GETDATE()) THEN N'NEAR_EXPIRY'
                WHEN ISNULL(V.DailySalesVelocity, 0) = 0 THEN N'NO_SALES_30D'
                WHEN S.PhysicalStock / NULLIF(V.DailySalesVelocity, 0) > 180 THEN N'HIGH_STOCK_SLOW_MOVING'
                ELSE N'MONITOR'
            END AS ProposalReasonCode
        FROM #PhysicalStock S
        JOIN dbo.CF_ItemTbl Item WITH (NOLOCK)
          ON Item.ItemID = S.ItemID
        LEFT JOIN #SalesVelocity V
          ON V.ItemID = S.ItemID
        WHERE ISNULL(Item.ItemGroupID, '') = 'HH1'
    )
    SELECT TOP (50)
        C.ItemID,
        C.ItemName,
        C.Unit,
        CAST(C.PhysicalStock AS DECIMAL(18, 2)) AS TonKho,
        CAST(C.PhysicalStock AS DECIMAL(18, 2)) AS PhysicalStock,
        CAST(C.AvailableStock AS DECIMAL(18, 2)) AS AvailableStock,
        CASE
            WHEN C.AvailableStock > 0 THEN N'PHYSICAL_AS_SELLABLE_TEMPORARY'
            ELSE N'EXPIRED_NOT_SELLABLE'
        END AS StockDataStatus,
        C.NearestExpireDate AS HanDung,
        C.ProposalReasonCode,
        CASE C.ProposalReasonCode
            WHEN N'NEAR_EXPIRY_URGENT' THEN N'Hạn dùng còn dưới 3 tháng; cần kiểm tra lô và xem xét phương án xử lý.'
            WHEN N'NEAR_EXPIRY' THEN N'Hạn dùng còn dưới 6 tháng; cần theo dõi và xem xét chương trình phù hợp.'
            WHEN N'NO_SALES_30D' THEN N'Không phát sinh bán trong 30 ngày gần nhất.'
            WHEN N'HIGH_STOCK_SLOW_MOVING' THEN N'Tồn vật lý cao so với tốc độ bán 30 ngày gần nhất.'
            ELSE N'Cần tiếp tục theo dõi.'
        END AS ProposalReason,
        CASE C.ProposalReasonCode
            WHEN N'NEAR_EXPIRY_URGENT' THEN N'CẬN HẠN KHẨN CẤP'
            WHEN N'NEAR_EXPIRY' THEN N'CẬN HẠN'
            WHEN N'NO_SALES_30D' THEN N'CHẬM BÁN'
            WHEN N'HIGH_STOCK_SLOW_MOVING' THEN N'TỒN CAO / BÁN CHẬM'
            ELSE N'THEO DÕI'
        END AS LoaiDeXuat,
        CAST(NULL AS DECIMAL(5, 2)) AS PhanTramDeXuat,
        N'AI không tự đề xuất mức giảm giá. Manager/Admin cần kiểm tra và gửi người có thẩm quyền quyết định.' AS ChiTietAI,
        N'REFERENCE_ONLY_APPROVAL_REQUIRED' AS ActionStatus,
        N'PENDING_COMPANY_APPROVAL' AS ApprovalStatus,
        N'MANAGER_REVIEW' AS ViewMode,
        N'MANAGER_ADMIN' AS Audience,
        N'IV_StockTransactionTbl' AS DataSource,
        N'BR-ACTION-V1-DRAFT' AS RuleVersion
    FROM Candidate C
    WHERE C.ProposalReasonCode <> N'MONITOR'
    ORDER BY
        CASE C.ProposalReasonCode
            WHEN N'NEAR_EXPIRY_URGENT' THEN 1
            WHEN N'NEAR_EXPIRY' THEN 2
            WHEN N'NO_SALES_30D' THEN 3
            WHEN N'HIGH_STOCK_SLOW_MOVING' THEN 4
            ELSE 5
        END,
        C.PhysicalStock DESC;

    DROP TABLE #SalesVelocity;
    DROP TABLE #PhysicalStock;
    DROP TABLE #StockByLot;
END;
GO
