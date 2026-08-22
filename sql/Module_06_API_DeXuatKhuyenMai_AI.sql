CREATE OR ALTER PROCEDURE [dbo].[API_DeXuatKhuyenMai_AI]
    @Username VARCHAR(50) = ''
AS
BEGIN
    SET NOCOUNT ON;

    -- ═══ GUARD: dọn temp table còn sót lại từ request lỗi trước trên cùng connection ═══
    IF OBJECT_ID('tempdb..#StockByLot') IS NOT NULL DROP TABLE #StockByLot;
    IF OBJECT_ID('tempdb..#PhysicalStock') IS NOT NULL DROP TABLE #PhysicalStock;
    IF OBJECT_ID('tempdb..#SalesVelocity') IS NOT NULL DROP TABLE #SalesVelocity;

    DECLARE @SYSBranchID VARCHAR(50) = '';
    DECLARE @SYSUserGroupID VARCHAR(50) = '';
    DECLARE @EmployeeID VARCHAR(50) = '';
    DECLARE @IsGlobal BIT = 0;
    DECLARE @IsManager BIT = 0;
    DECLARE @StockAsOfUtc DATETIME2(0) = SYSUTCDATETIME();
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
    /* CHỈ CẤP QUẢN LÝ TRỞ LÊN — chủ dự án chốt ngày 31/07/2026.

       Phân biệt ba mức, đừng lẫn lộn khi bảo trì:

         1. Procedure NÀY (@de_xuat_khuyen_mai) — GỢI Ý hàng nên đẩy khuyến mãi,
            tính từ tồn kho + hạn dùng + tốc độ bán. CHƯA AI DUYỆT. Chỉ quản lý.
         2. API_SanPhamTrongTam_AI — chương trình sản phẩm trọng tâm ĐÃ ĐƯỢC
            CÔNG TY DUYỆT. Ai cũng xem được, kể cả nhân viên bán hàng.
         3. API_SanPhamTrongTam_Import_AI — nạp/sửa chương trình. Quản lý trở lên,
            và chỉ xem, không ghi (xem @Apply trong file đó).

       Vì sao mức 1 phải chặn dù mức 2 mở: nội dung ở đây là ĐỀ XUẤT, không phải
       ưu đãi có thật. Một dòng "khăn lau còn 373 hộp, hạn 29/08 — nên giảm giá"
       rất dễ bị hiểu thành "đang có khuyến mãi món này", rồi nhân viên nói miệng
       với nhà thuốc lúc đi tuyến. Điều khoản bán hàng chính thức mà nhân viên
       cần thì đã có sẵn ở nơi khác: API_HangHoaList_AI trả cột GhiChu nguyên văn
       ("Mua 8+2, 30+10 (< 8h ck 10%)"...) cho 117/117 sản phẩm, cộng với mức 2.
       Nên chặn ở đây không làm nhân viên thiếu thông tin để bán hàng.

       [Sửa 31/07/2026] Trước đây nhánh này trả SELECT TOP (0) — bảng rỗng đúng
       cấu trúc nhưng KHÔNG kèm dòng Msg nào, nên 6/6 tài khoản sale trong bộ UAT
       nhận màn hình trắng, không phân biệt được là chưa có dữ liệu, hỏng, hay
       mất quyền. Quyết định chặn giữ nguyên; chỉ đổi cách báo sang Msg để người
       dùng hiểu. Client hiển thị mọi dòng có cả Msg lẫn MsgType thành câu trả
       lời (chatbot-widget/js/chatbot-api-engine.js), và hai rào chặn khác trong
       chính procedure này cũng đã dùng đúng dạng đó.

       MsgType = 0 vì đây không phải lỗi: tài khoản hợp lệ, quyền hợp lệ, chỉ là
       nội dung này không dành cho vai trò đó. MsgType = 1 dành cho lỗi thật. */
    IF @IsGlobal = 0 AND @IsManager = 0
    BEGIN
        SELECT N'Đề xuất khuyến mãi là nội dung tham mưu nội bộ, chỉ hiển thị cho cấp quản lý. '
             + N'Chương trình đã được công ty duyệt thì bạn xem ở mục Sản phẩm trọng tâm, '
             + N'còn điều khoản bán hàng của từng mặt hàng đã có trong ghi chú sản phẩm.' AS Msg,
               0 AS MsgType;
        RETURN;
    END;

    INSERT INTO @AllowedStores (StoreHouseID)
    SELECT StoreHouseID
    FROM dbo.AI_WarehouseByUserFnc(@Username, @StockAsOfUtc);

    IF NOT EXISTS (SELECT 1 FROM @AllowedStores)
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
    WHERE T.StoreHouseID IN (SELECT StoreHouseID FROM @AllowedStores)
    GROUP BY T.ItemID, T.StoreHouseID, T.Lot, T.ExpireDate
    HAVING SUM(ISNULL(T.Quantity, 0)) > 0;

    SELECT
        S.ItemID,
        S.StoreHouseID,
        S.StoreHouseName,
        S.PhysicalStock,
        S.ReservedStock,
        S.AvailableStock,
        S.WarehouseScope,
        S.StockDataStatus,
        S.StockUpdatedAt,
        S.StockAsOfAt,
        S.LatestStockMovementDate,
        S.StockDataSource,
        S.RuleVersion,
        LotInfo.NearestExpireDate
    INTO #PhysicalStock
    FROM
    (
        SELECT Stock.*,
               ROW_NUMBER() OVER
               (
                   PARTITION BY Stock.ItemID
                   ORDER BY Stock.AvailableStock DESC, Stock.StoreHouseID
               ) AS StockRank
        FROM dbo.AI_StockAvailableByUserFnc(@Username, '', @StockAsOfUtc) Stock
        WHERE Stock.AvailableStock > 0
    ) S
    OUTER APPLY
    (
        SELECT MIN(L.ExpireDate) AS NearestExpireDate
        FROM #StockByLot L
        WHERE L.ItemID = S.ItemID
          AND L.StoreHouseID = S.StoreHouseID
          AND (L.ExpireDate IS NULL OR L.ExpireDate >= GETDATE())
    ) LotInfo
    WHERE S.StockRank = 1;

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
            S.ReservedStock,
            S.AvailableStock,
            S.StoreHouseID,
            S.StoreHouseName,
            S.WarehouseScope,
            S.StockDataStatus,
            S.StockUpdatedAt,
            S.StockAsOfAt,
            S.LatestStockMovementDate,
            S.StockDataSource,
            S.RuleVersion AS StockRuleVersion,
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
        WHERE S.AvailableStock > 0
          AND EXISTS
          (
              SELECT 1
              FROM dbo.AI_BusinessRuleConfigTbl C
              CROSS APPLY STRING_SPLIT(C.ConfigValue, ',') V
              WHERE C.RuleCode = 'BR-STOCK-001'
                AND C.RuleVersion = S.RuleVersion
                AND C.ConfigKey = 'SellableItemGroupIDs'
                AND LTRIM(RTRIM(V.value)) = Item.ItemGroupID
          )
    )
    SELECT TOP (50)
        C.ItemID,
        C.ItemName,
        C.Unit,
        CAST(C.PhysicalStock AS DECIMAL(18, 2)) AS TonKho,
        CAST(C.PhysicalStock AS DECIMAL(18, 2)) AS PhysicalStock,
        CAST(C.ReservedStock AS DECIMAL(18, 2)) AS ReservedStock,
        CAST(C.AvailableStock AS DECIMAL(18, 2)) AS AvailableStock,
        C.StoreHouseID,
        C.StoreHouseName,
        C.WarehouseScope,
        C.StockDataStatus,
        C.StockUpdatedAt,
        C.StockAsOfAt,
        C.LatestStockMovementDate,
        C.StockRuleVersion,
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
        C.StockDataSource AS DataSource,
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
