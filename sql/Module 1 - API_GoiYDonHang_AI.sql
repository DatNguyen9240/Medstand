USE medtest;
GO

/*
 ═══════════════════════════════════════════════════════════════
  API_GoiYDonHang_AI — Gợi ý đơn hàng thông minh
  ─────────────────────────────────────────────────────────────
  [2026-05-20] FIX: Sau khi chạy script này, cần chạy thêm:

    UPDATE dbo.API_Field
    SET IsSystemParam = 1
    WHERE ApiID = (SELECT ApiID FROM dbo.API_Definition WHERE StoredProcedure = 'API_GoiYDonHang_AI')
      AND FieldCode IN ('@SYSBranchID', '@SYSCeoID', '@SYSManagerID', '@SYSEmployeeID', '@User');

    UPDATE af
    SET af.IsVisible = 0, af.IsEditable = 0
    FROM dbo.API_Action_Field af
    JOIN dbo.API_Field f ON f.FieldID = af.FieldID
    WHERE f.ApiID = (SELECT ApiID FROM dbo.API_Definition WHERE StoredProcedure = 'API_GoiYDonHang_AI')
      AND f.FieldCode IN ('@SYSBranchID', '@SYSCeoID', '@SYSManagerID', '@SYSEmployeeID', '@User');

  Hoặc đơn giản chạy lại AutoBootstrap:
    EXEC dbo.API_Metadata_AutoBootstrap_AI @Apply = 1, @UpdateExisting = 1;
 ═══════════════════════════════════════════════════════════════
*/
CREATE OR ALTER PROCEDURE API_GoiYDonHang_AI
    @Username     VARCHAR(50)   = '',
    @User         VARCHAR(50)   = '',         -- Dashboard/Chatbot alias
    @MaKhachHang  NVARCHAR(100) = '',         -- Original parameter name
    @ObjectID     NVARCHAR(100) = '',         -- AI Scenarios Guide / Frontend alias
    @TopN         INT           = 10,
    -- Context parameters injected automatically by .NET server from claims
    @SYSBranchID  VARCHAR(50)   = '',
    @SYSCeoID     VARCHAR(50)   = '',
    @SYSManagerID VARCHAR(50)   = '',
    @SYSEmployeeID VARCHAR(50)  = ''
AS
BEGIN
    SET NOCOUNT ON

    -- ═══ 0. Mapping Dashboard/Frontend Alias ═══
    IF NULLIF(@User, '') IS NOT NULL AND EXISTS (SELECT 1 FROM SY_User WITH (NOLOCK) WHERE UserName = @User AND COALESCE(Disable, 0) = 0)
    BEGIN
        SET @Username = @User;
    END
    
    -- Allow @ObjectID mapping to MaKhachHang even if it is a name, to ensure name-to-ID resolution runs
    IF NULLIF(@ObjectID, '') IS NOT NULL AND (NULLIF(@MaKhachHang, '') IS NULL OR @MaKhachHang = '')
    BEGIN
        SET @MaKhachHang = @ObjectID;
    END
    
    IF @TopN IS NULL OR @TopN <= 0 SET @TopN = 10;

    -- Danh tính là bắt buộc. Không cho phép Username rỗng trở thành truy vấn
    -- toàn hệ thống khi gateway/token không truyền được người dùng.
    IF NULLIF(@Username, '') IS NULL
       OR NOT EXISTS (SELECT 1 FROM SY_User WITH (NOLOCK)
                      WHERE UserName = @Username AND COALESCE(Disable, 0) = 0)
    BEGIN
        SELECT N'Không xác định được tài khoản hoặc tài khoản đã bị khóa.' AS Msg,
               1 AS MsgType;
        RETURN;
    END

    -- ═══ 1. Lấy quyền user thực tế & Fallback ═══
    DECLARE @SYS_BranchID    VARCHAR(50) = ISNULL(@SYSBranchID, '')
    DECLARE @SYS_CeoID       VARCHAR(50) = ISNULL(@SYSCeoID, '')
    DECLARE @SYS_ManagerID   VARCHAR(50) = ISNULL(@SYSManagerID, '')
    DECLARE @SYS_EmployeeID  VARCHAR(50) = ISNULL(@SYSEmployeeID, '')

    IF NULLIF(@Username, '') IS NOT NULL
    BEGIN
        SELECT
            @SYS_BranchID    = ISNULL(BranchID, ''),
            @SYS_CeoID       = ISNULL(CeoID, ''),
            @SYS_ManagerID   = ISNULL(ManagerID, ''),
            @SYS_EmployeeID  = ISNULL(EmployeeID, '')
        FROM SY_User WITH (NOLOCK)
        WHERE UserName = @Username AND COALESCE(Disable, 0) = 0
    END
    ELSE IF NULLIF(@SYS_EmployeeID, '') IS NOT NULL
    BEGIN
        SELECT TOP 1
            @Username        = UserName,
            @SYS_BranchID    = ISNULL(BranchID, ''),
            @SYS_CeoID       = ISNULL(CeoID, ''),
            @SYS_ManagerID   = ISNULL(ManagerID, '')
        FROM SY_User WITH (NOLOCK)
        WHERE EmployeeID = @SYS_EmployeeID AND COALESCE(Disable, 0) = 0
    END

    -- TỰ ĐỘNG KHẮC PHỤC ẢO GIÁC/TÊN KHÁCH HÀNG:
    IF @MaKhachHang <> '' AND NOT EXISTS (SELECT 1 FROM CF_ObjectTbl WITH (NOLOCK) WHERE ObjectID = @MaKhachHang)
    BEGIN
        DECLARE @ResolvedID VARCHAR(50) = '';
        DECLARE @OriginalInput NVARCHAR(100) = @MaKhachHang;
        
        IF @MaKhachHang LIKE '%\[%\]%' ESCAPE '\'
        BEGIN
            SET @MaKhachHang = SUBSTRING(@MaKhachHang, CHARINDEX('[', @MaKhachHang) + 1, CHARINDEX(']', @MaKhachHang) - CHARINDEX('[', @MaKhachHang) - 1);
        END

        IF EXISTS (SELECT 1 FROM CF_ObjectTbl WITH (NOLOCK) WHERE ObjectID = @MaKhachHang)
        BEGIN
            SET @ResolvedID = @MaKhachHang;
        END
        ELSE
        BEGIN
            DECLARE @CleanSearch NVARCHAR(100) = dbo.ufn_clean_customer_name(@MaKhachHang)

            -- 1. Fast Path (Branch-filtered)
            SELECT TOP 1 @ResolvedID = ObjectID 
            FROM CF_ObjectTbl WITH (NOLOCK)
            WHERE (ObjectID LIKE '%' + @CleanSearch + '%' OR ObjectName LIKE '%' + @CleanSearch + '%')
              AND (ISNULL(@SYS_BranchID, '') = '' OR BranchID = @SYS_BranchID)
            ORDER BY 
                CASE WHEN ObjectID = @CleanSearch THEN 1
                     WHEN ObjectName = @CleanSearch THEN 2
                     WHEN ObjectName LIKE @CleanSearch + '%' THEN 3
                     ELSE 4
                END,
                COALESCE((SELECT MAX(DocumentDate) FROM AR_InvoiceTbl WITH (NOLOCK) WHERE ObjectID = CF_ObjectTbl.ObjectID), '1900-01-01') DESC,
                LEN(ObjectName) ASC;
                
            -- 2. Slow Path (Branch-filtered, fallback)
            IF @ResolvedID = ''
            BEGIN
                SELECT TOP 1 @ResolvedID = ObjectID 
                FROM CF_ObjectTbl WITH (NOLOCK)
                WHERE (dbo.ufn_clean_customer_name(ObjectName) LIKE '%' + @CleanSearch + '%' OR ObjectID LIKE '%' + @CleanSearch + '%')
                  AND (ISNULL(@SYS_BranchID, '') = '' OR BranchID = @SYS_BranchID)
                ORDER BY 
                    CASE WHEN ObjectID = @CleanSearch THEN 1
                         WHEN dbo.ufn_clean_customer_name(ObjectName) = @CleanSearch THEN 2
                         WHEN dbo.ufn_clean_customer_name(ObjectName) LIKE @CleanSearch + '%' THEN 3
                         ELSE 4
                    END,
                    COALESCE((SELECT MAX(DocumentDate) FROM AR_InvoiceTbl WITH (NOLOCK) WHERE ObjectID = CF_ObjectTbl.ObjectID), '1900-01-01') DESC,
                    LEN(ObjectName) ASC;
            END

            -- 3. Fast Path (Nationwide fallback - Only for admin/cross-branch user)
            IF @ResolvedID = '' AND @SYS_BranchID = ''
            BEGIN
                SELECT TOP 1 @ResolvedID = ObjectID 
                FROM CF_ObjectTbl WITH (NOLOCK)
                WHERE (ObjectID LIKE '%' + @CleanSearch + '%' OR ObjectName LIKE '%' + @CleanSearch + '%')
                ORDER BY 
                    CASE WHEN ObjectID = @CleanSearch THEN 1
                         WHEN ObjectName = @CleanSearch THEN 2
                         WHEN ObjectName LIKE @CleanSearch + '%' THEN 3
                         ELSE 4
                    END,
                    COALESCE((SELECT MAX(DocumentDate) FROM AR_InvoiceTbl WITH (NOLOCK) WHERE ObjectID = CF_ObjectTbl.ObjectID), '1900-01-01') DESC,
                    LEN(ObjectName) ASC;
            END

            -- 4. Slow Path (Nationwide fallback, final - Only for admin/cross-branch user)
            IF @ResolvedID = '' AND @SYS_BranchID = ''
            BEGIN
                SELECT TOP 1 @ResolvedID = ObjectID 
                FROM CF_ObjectTbl WITH (NOLOCK)
                WHERE (dbo.ufn_clean_customer_name(ObjectName) LIKE '%' + @CleanSearch + '%' OR ObjectID LIKE '%' + @CleanSearch + '%')
                ORDER BY 
                    CASE WHEN ObjectID = @CleanSearch THEN 1
                         WHEN dbo.ufn_clean_customer_name(ObjectName) = @CleanSearch THEN 2
                         WHEN dbo.ufn_clean_customer_name(ObjectName) LIKE @CleanSearch + '%' THEN 3
                         ELSE 4
                    END,
                    COALESCE((SELECT MAX(DocumentDate) FROM AR_InvoiceTbl WITH (NOLOCK) WHERE ObjectID = CF_ObjectTbl.ObjectID), '1900-01-01') DESC,
                    LEN(ObjectName) ASC;
            END
        END

        IF NULLIF(@ResolvedID, '') IS NOT NULL
        BEGIN
            SET @MaKhachHang = @ResolvedID;
        END

        -- LOG FOR DEBUGGING
        EXEC AI_WriteAuditLog
            @Username     = @Username,
            @ActionType   = 'DEBUG_RESOLUTION',
            @TargetEntity = 'API_GoiYDonHang_AI',
            @TargetID     = @MaKhachHang,
            @TargetName   = @ResolvedID,
            @ExtraInfo    = @OriginalInput;
    END

    -- Cache đúng phạm vi khách hàng do ERP cấp cho user/manager hiện tại.
    -- Nếu mapping rỗng thì kết quả cũng rỗng (fail-closed).
    CREATE TABLE #AllowedObjects (ObjectID VARCHAR(50) PRIMARY KEY);
    INSERT INTO #AllowedObjects (ObjectID)
    SELECT DISTINCT ObjectID FROM dbo.AR_GetObjectByUserFnc(@Username);

    -- BR-CONTRACT-V1: gợi ý cá nhân bắt buộc có khách hàng; không trả bảng bán chạy
    -- như một kết quả thay thế vì sẽ làm client hiểu sai ý định người dùng.
    IF ISNULL(@MaKhachHang, '') = ''
    BEGIN
        SELECT N'Vui lòng cung cấp mã khách hàng để tạo gợi ý đơn hàng.' AS Msg,
               1 AS MsgType,
               N'VALIDATION_ERROR' AS Severity;
        RETURN;
    END

    IF @MaKhachHang <> '' AND NOT EXISTS (SELECT 1 FROM CF_ObjectTbl WITH (NOLOCK) WHERE ObjectID = @MaKhachHang)
    BEGIN
        SELECT N'Không tìm thấy mã khách hàng này.' AS Msg,
               1 AS MsgType,
               N'VALIDATION_ERROR' AS Severity;
        RETURN;
    END

    -- RLS GUARD: Reuse ERP permission system (AR_GetObjectByUserFnc) to handle branch/manager hierarchy securely
    IF @MaKhachHang <> '' AND @Username <> '' AND NOT EXISTS (
        SELECT 1 FROM dbo.AR_GetObjectByUserFnc(@Username) WHERE ObjectID = @MaKhachHang
    )
    BEGIN
        SELECT N'Bạn không có quyền xem thông tin của khách hàng này.' AS Msg,
               1 AS MsgType,
               N'OUT_OF_SCOPE' AS Severity;
        RETURN;
    END

    -- ═══════════════════════════════════════════════════
    -- KHÔNG TRUYỀN khách hàng (khachhang) → Top sản phẩm bán chạy nhất
    -- ═══════════════════════════════════════════════════
    IF @MaKhachHang = ''
    BEGIN
        CREATE TABLE #TopChiNhanh
        (
            [Mã SP]     VARCHAR(50)   NOT NULL,
            [Sản phẩm]  NVARCHAR(500) NULL,
            [Số HĐ]     INT           NOT NULL,
            [Doanh số]  BIGINT        NULL,
            [Gợi ý]     NVARCHAR(500) NULL
        );

        INSERT INTO #TopChiNhanh ([Mã SP], [Sản phẩm], [Số HĐ], [Doanh số], [Gợi ý])
        SELECT TOP (@TopN)
            D.ItemID                                     AS [Mã SP],
            CF.ItemName                                  AS [Sản phẩm],
            COUNT(DISTINCT I.DocumentID)                 AS [Số HĐ],
            CAST(SUM(D.TotalAmount) AS BIGINT)           AS [Doanh số],
            N'Bán chạy trong chi nhánh'                  AS [Gợi ý]
        FROM AR_InvoiceTbl I WITH (NOLOCK)
        JOIN AR_InvoiceDetailTbl D WITH (NOLOCK) ON I.DocumentID = D.DocumentID
        JOIN CF_ItemTbl CF WITH (NOLOCK)         ON CF.ItemID    = D.ItemID
        JOIN #AllowedObjects AO                  ON AO.ObjectID  = I.ObjectID
        WHERE I.DocumentDate >= DATEADD(DAY, -30, GETDATE())
          AND I.StatusID IN (3, 6, 7, 8)
          AND (@SYS_BranchID  = '' OR I.BranchID  = @SYS_BranchID)
          AND ISNULL(CF.ItemGroupID, '') = 'HH1'
        GROUP BY D.ItemID, CF.ItemName;

        -- Fallback if empty in UAT (take all time)
        IF NOT EXISTS (SELECT 1 FROM #TopChiNhanh)
        BEGIN
            INSERT INTO #TopChiNhanh ([Mã SP], [Sản phẩm], [Số HĐ], [Doanh số], [Gợi ý])
            SELECT TOP (@TopN)
                D.ItemID                                     AS [Mã SP],
                CF.ItemName                                  AS [Sản phẩm],
                COUNT(DISTINCT I.DocumentID)                 AS [Số HĐ],
                CAST(SUM(D.TotalAmount) AS BIGINT)           AS [Doanh số],
                N'Bán chạy trong chi nhánh (Toàn thời gian)' AS [Gợi ý]
            FROM AR_InvoiceTbl I WITH (NOLOCK)
            JOIN AR_InvoiceDetailTbl D WITH (NOLOCK) ON I.DocumentID = D.DocumentID
            JOIN CF_ItemTbl CF WITH (NOLOCK)         ON CF.ItemID    = D.ItemID
            JOIN #AllowedObjects AO                  ON AO.ObjectID  = I.ObjectID
            WHERE I.StatusID IN (3, 6, 7, 8)
              AND (@SYS_BranchID  = '' OR I.BranchID  = @SYS_BranchID)
              AND ISNULL(CF.ItemGroupID, '') = 'HH1'
            GROUP BY D.ItemID, CF.ItemName;
        END

        SELECT * FROM #TopChiNhanh ORDER BY [Doanh số] DESC;
        DROP TABLE #TopChiNhanh;
        DROP TABLE #AllowedObjects;
        RETURN;
    END

    -- ═══════════════════════════════════════════════════
    -- CÓ ObjectID → Gợi ý cá nhân hóa (Personalized)
    -- ═══════════════════════════════════════════════════

    -- TIÊU CHÍ 1: Lịch sử mua hàng (6 tháng gần nhất)
    SELECT
        D.ItemID,
        COUNT(DISTINCT I.DocumentID)                    AS SoLanMua,
        SUM(D.TotalAmount)                              AS TongTien,
        MAX(I.DocumentDate)                             AS LanMuaCuoi,
        MIN(I.DocumentDate)                             AS LanMuaDau,
        DATEDIFF(DAY, MAX(I.DocumentDate), GETDATE())   AS SoNgayTuLanCuoi
    INTO #LichSu
    FROM AR_InvoiceTbl I WITH (NOLOCK)
    JOIN AR_InvoiceDetailTbl D WITH (NOLOCK) ON I.DocumentID = D.DocumentID
    WHERE I.ObjectID = @MaKhachHang
      AND I.DocumentDate >= DATEADD(MONTH, -6, GETDATE())
      AND I.StatusID IN (3, 6, 7, 8)
    GROUP BY D.ItemID;

    -- UAT FALLBACK: Nếu không có lịch sử mua trong 6 tháng, lấy tất cả lịch sử mua
    IF NOT EXISTS (SELECT 1 FROM #LichSu)
    BEGIN
        INSERT INTO #LichSu (ItemID, SoLanMua, TongTien, LanMuaCuoi, LanMuaDau, SoNgayTuLanCuoi)
        SELECT
            D.ItemID,
            COUNT(DISTINCT I.DocumentID)                    AS SoLanMua,
            SUM(D.TotalAmount)                              AS TongTien,
            MAX(I.DocumentDate)                             AS LanMuaCuoi,
            MIN(I.DocumentDate)                             AS LanMuaDau,
            DATEDIFF(DAY, MAX(I.DocumentDate), GETDATE())   AS SoNgayTuLanCuoi
        FROM AR_InvoiceTbl I WITH (NOLOCK)
        JOIN AR_InvoiceDetailTbl D WITH (NOLOCK) ON I.DocumentID = D.DocumentID
        WHERE I.ObjectID = @MaKhachHang
          AND I.StatusID IN (3, 6, 7, 8)
        GROUP BY D.ItemID;
    END

    -- TIÊU CHÍ 2: Chu kỳ mua hàng trung bình (Average Purchase Cycle)
    IF NOT EXISTS (SELECT 1 FROM #LichSu)
    BEGIN
        DECLARE @CustomerName NVARCHAR(500) = NULL;
        SELECT @CustomerName = ObjectName
        FROM dbo.CF_ObjectTbl WITH (NOLOCK)
        WHERE ObjectID = @MaKhachHang;

        SELECT CONCAT(
                   N'Khách ', COALESCE(NULLIF(@CustomerName, ''), @MaKhachHang),
                   N' chưa có hóa đơn hoàn tất (trạng thái 3/6/7/8), nên chưa đủ dữ liệu để gợi ý đơn hàng. Hãy chăm sóc như khách mới.'
               ) AS Msg,
               0 AS MsgType,
               N'NO_DATA' AS Severity,
               N'NEW_CUSTOMER_NO_FULFILLED_HISTORY' AS Code;

        DROP TABLE #AllowedObjects;
        DROP TABLE #LichSu;
        RETURN;
    END

    SELECT
        L.ItemID,
        CASE
            -- BR-SALES-006: chỉ coi chu kỳ cá nhân là đủ tin cậy từ 3 hóa đơn hợp lệ.
            WHEN L.SoLanMua >= 3
            THEN DATEDIFF(DAY, L.LanMuaDau, L.LanMuaCuoi) / (L.SoLanMua - 1)
            ELSE CAST(NULL AS INT) -- Không đoán chu kỳ khi chưa đủ 3 hóa đơn hợp lệ.
        END AS ChuKyTrungBinh
    INTO #ChuKy
    FROM #LichSu L;

    -- TIÊU CHÍ 3: Mùa vụ (Cùng tháng này năm trước)
    SELECT D.ItemID INTO #MuaVu
    FROM AR_InvoiceTbl I WITH (NOLOCK)
    JOIN AR_InvoiceDetailTbl D WITH (NOLOCK) ON I.DocumentID = D.DocumentID
    WHERE I.ObjectID = @MaKhachHang AND MONTH(I.DocumentDate) = MONTH(GETDATE()) AND YEAR(I.DocumentDate) = YEAR(GETDATE()) - 1
      AND I.StatusID IN (3, 6, 7, 8)
    GROUP BY D.ItemID;

    -- TIÊU CHÍ 4: Khuyến mãi đang chạy
    SELECT DISTINCT PD.ItemID INTO #KhuyenMai
    FROM AR_PromotionTbl P WITH (NOLOCK)
    JOIN AR_PromotionDetailTbl PD WITH (NOLOCK) ON P.DocumentID = PD.DocumentID
    WHERE GETDATE() BETWEEN P.FromDate AND P.ToDate AND ISNULL(P.isDisable, 0) = 0;

    -- TIÊU CHÍ 5: Sản phẩm trọng tâm (Focus Items)
    DECLARE @CurProgramID VARCHAR(50) = ''
    SELECT TOP 1 @CurProgramID = DocumentID FROM AR_SanPhamTrongTamTbl WITH (NOLOCK)
    WHERE GETDATE() BETWEEN FromDate AND ToDate ORDER BY ToDate DESC;

    SELECT DISTINCT ItemID INTO #TrongTam 
    FROM AR_SanPhamTrongTamDetailTbl WITH (NOLOCK) WHERE DocumentID = @CurProgramID;

    -- TIÊU CHÍ 6: Đã mua hôm nay. Chỉ dùng hóa đơn hợp lệ; đơn nháp chưa giao
    -- không được loại sản phẩm khỏi gợi ý (BR-SALES-001).
    SELECT DISTINCT ItemID INTO #DaMuaHomNay FROM (
        SELECT D.ItemID
        FROM AR_InvoiceTbl I WITH (NOLOCK) JOIN AR_InvoiceDetailTbl D WITH (NOLOCK) ON I.DocumentID = D.DocumentID
        WHERE I.ObjectID = @MaKhachHang AND CAST(I.DocumentDate AS DATE) = CAST(GETDATE() AS DATE) AND I.StatusID IN (3, 6, 7, 8)
    ) T;

    -- KẾT QUẢ CUỐI CÙNG: Tập trung vào "Thời điểm vàng"
    SELECT TOP (@TopN)
        @MaKhachHang                                   AS [MaKhachHang],
        KH.ObjectName                                  AS [TenKhachHang],
        L.ItemID                                        AS [MaSanPham],
        CF.ItemName                                     AS [TenSanPham],
        L.SoLanMua                                      AS [SoLanMua],
        CAST(L.TongTien AS BIGINT)                      AS [TongDaMua],
        FORMAT(L.LanMuaCuoi, 'MM/dd')                   AS [LanMuaCuoi],
        CK.ChuKyTrungBinh                               AS [ChuKyNgay],
        CASE WHEN L.SoLanMua < 3 OR CK.ChuKyTrungBinh IS NULL THEN NULL
             WHEN (CK.ChuKyTrungBinh - L.SoNgayTuLanCuoi) < 0 THEN 0
             ELSE CAST(CK.ChuKyTrungBinh - L.SoNgayTuLanCuoi AS INT) END AS [ConLaiNgay],
        CAST(NULL AS DECIMAL(18,2))                     AS [AvailableStock],
        N'PHYSICAL_STOCK_NOT_QUERIED'                   AS [StockDataStatus],
        CASE 
            WHEN L.SoLanMua < 3 OR CK.ChuKyTrungBinh IS NULL THEN N'Khách mới cần chăm sóc'
            WHEN L.SoNgayTuLanCuoi >= CK.ChuKyTrungBinh THEN N'Cần nhập thêm'
            WHEN CK.ChuKyTrungBinh - L.SoNgayTuLanCuoi <= 7 THEN N'Thời điểm vàng'
            ELSE N'Ổn định'
        END                                             AS [TrangThai],
        CASE WHEN L.SoLanMua >= 3 THEN N'PERSONAL_CYCLE_ELIGIBLE' ELSE N'INSUFFICIENT_HISTORY' END AS [DoTinCay],
        CASE WHEN L.SoLanMua >= 3 THEN N'PERSONAL_PURCHASE_HISTORY' ELSE N'INSUFFICIENT_HISTORY' END AS [RuleSource],
        N'BR-SALES-V1-DRAFT'                              AS [RuleVersion],
        CONCAT(
            CASE 
                WHEN L.SoLanMua < 3 OR CK.ChuKyTrungBinh IS NULL THEN N'Chưa đủ 3 hóa đơn hợp lệ để ước tính chu kỳ mua lại'
                WHEN L.SoNgayTuLanCuoi >= CK.ChuKyTrungBinh THEN N'Cần nhập thêm ' + CAST(L.SoNgayTuLanCuoi - CK.ChuKyTrungBinh AS VARCHAR) + N' ngày'
                WHEN CK.ChuKyTrungBinh - L.SoNgayTuLanCuoi <= 7 THEN N'Thời điểm vàng'
                ELSE N'Ổn định'
            END,
            CASE WHEN TT.ItemID IS NOT NULL THEN N' | Trọng tâm' ELSE '' END,
            CASE WHEN MV.ItemID IS NOT NULL THEN N' | Mùa vụ' ELSE '' END,
            CASE WHEN KM.ItemID IS NOT NULL THEN N' | Khuyến mãi' ELSE '' END
        )                                               AS [ChiTiet],
        CONCAT(
            CASE
                WHEN L.SoLanMua < 3 OR CK.ChuKyTrungBinh IS NULL THEN N'NEW_CUSTOMER|INSUFFICIENT_HISTORY'
                WHEN L.SoNgayTuLanCuoi >= CK.ChuKyTrungBinh THEN N'REORDER_OVERDUE'
                WHEN CK.ChuKyTrungBinh - L.SoNgayTuLanCuoi <= 7 THEN N'REORDER_WINDOW'
                ELSE N'CYCLE_STABLE'
            END,
            CASE WHEN TT.ItemID IS NOT NULL THEN N'|FOCUS_ITEM' ELSE '' END,
            CASE WHEN MV.ItemID IS NOT NULL THEN N'|SEASONAL' ELSE '' END,
            CASE WHEN KM.ItemID IS NOT NULL THEN N'|ACTIVE_PROMOTION_REFERENCE' ELSE '' END
        )                                               AS [RecommendationReason],
        N'SIX_MONTH_WITH_ALL_HISTORY_FALLBACK'          AS [DataWindow]
    FROM #LichSu L
    JOIN #ChuKy CK          ON L.ItemID = CK.ItemID
    LEFT JOIN #MuaVu MV     ON L.ItemID = MV.ItemID
    LEFT JOIN #KhuyenMai KM ON L.ItemID = KM.ItemID
    LEFT JOIN #TrongTam TT  ON L.ItemID = TT.ItemID
    LEFT JOIN #DaMuaHomNay HN ON L.ItemID = HN.ItemID
    LEFT JOIN CF_ItemTbl CF WITH (NOLOCK) ON L.ItemID = CF.ItemID
    LEFT JOIN CF_ObjectTbl KH WITH (NOLOCK) ON KH.ObjectID = @MaKhachHang
    WHERE ISNULL(CF.ItemGroupID, '') = 'HH1'
      AND HN.ItemID IS NULL -- Lọc Real-time: Chưa mua hôm nay
    ORDER BY (CASE WHEN TT.ItemID IS NOT NULL THEN 1 ELSE 0 END) DESC, -- Ưu tiên hàng trọng tâm lên hàng đầu
             (CASE WHEN L.SoLanMua >= 3 AND CK.ChuKyTrungBinh IS NOT NULL THEN 1 ELSE 0 END) DESC,
             (CASE WHEN L.SoLanMua >= 3 AND L.SoNgayTuLanCuoi >= CK.ChuKyTrungBinh THEN 1 ELSE 0 END) DESC,
             (CASE WHEN L.SoLanMua >= 3 AND (CK.ChuKyTrungBinh - L.SoNgayTuLanCuoi) <= 7 THEN 1 ELSE 0 END) DESC,
             L.SoLanMua DESC;

    DROP TABLE #AllowedObjects; DROP TABLE #LichSu; DROP TABLE #ChuKy; DROP TABLE #MuaVu; DROP TABLE #KhuyenMai; DROP TABLE #TrongTam; DROP TABLE #DaMuaHomNay;
END
GO

/* -- TEST SCRIPT --
-- Kịch bản 1: Tra cứu gợi ý cho một khách hàng cụ thể
EXEC API_GoiYDonHang_AI @Username = 'admin', @MaKhachHang = 'KH001', @TopN = 10;

-- Kịch bản 2: Tra cứu danh sách bán chạy chung cho chi nhánh (ObjectID để trống)
EXEC API_GoiYDonHang_AI @Username = 'admin', @MaKhachHang = '', @TopN = 10;
*/



