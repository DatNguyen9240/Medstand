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
IF OBJECT_ID('API_GoiYDonHang_AI', 'P') IS NOT NULL DROP PROCEDURE API_GoiYDonHang_AI;
GO

CREATE PROCEDURE API_GoiYDonHang_AI
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

            -- 3. Fast Path (Nationwide fallback)
            IF @ResolvedID = ''
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

            -- 4. Slow Path (Nationwide fallback, final)
            IF @ResolvedID = ''
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

    -- ═══ 2. Validate User ═══
    IF @Username <> '' AND NOT EXISTS (SELECT 1 FROM SY_User WITH (NOLOCK) WHERE UserName = @Username AND COALESCE(Disable, 0) = 0)
    BEGIN
        SELECT N'User không tồn tại hoặc đã bị khóa' AS Msg, 1 AS MsgType
        RETURN
    END

    IF @MaKhachHang <> '' AND NOT EXISTS (SELECT 1 FROM CF_ObjectTbl WITH (NOLOCK) WHERE ObjectID = @MaKhachHang)
    BEGIN
        SELECT 'N/A' AS [Mã SP], N'Không tìm thấy mã khách hàng này.' AS [Sản phẩm], 0 AS [Đã mua (đ)], NULL AS [Lần cuối], 0 AS [Chu kỳ], 0 AS [Còn (ngày)], N'Vui lòng kiểm tra lại.' AS [Gợi ý];
        RETURN;
    END

    -- ═══════════════════════════════════════════════════
    -- KHÔNG TRUYỀN khách hàng (khachhang) → Top sản phẩm bán chạy nhất
    -- ═══════════════════════════════════════════════════
    IF @MaKhachHang = ''
    BEGIN
        SELECT TOP (@TopN)
            D.ItemID                                     AS [Mã SP],
            CF.ItemName                                  AS [Sản phẩm],
            COUNT(DISTINCT I.DocumentID)                 AS [Số HĐ],
            CAST(SUM(D.TotalAmount) AS BIGINT)           AS [Doanh số],
            N'Bán chạy trong chi nhánh'                  AS [Gợi ý]
        INTO #TopChiNhanh
        FROM AR_InvoiceTbl I WITH (NOLOCK)
        JOIN AR_InvoiceDetailTbl D WITH (NOLOCK) ON I.DocumentID = D.DocumentID
        JOIN CF_ItemTbl CF WITH (NOLOCK)         ON CF.ItemID    = D.ItemID
        WHERE I.DocumentDate >= DATEADD(DAY, -30, GETDATE())
          AND ISNULL(I.StatusID, 0) != 10
          AND (@SYS_BranchID  = '' OR I.BranchID  = @SYS_BranchID)
          AND ISNULL(CF.ItemGroupID, '') = 'HH1'
        GROUP BY D.ItemID, CF.ItemName;

        -- Fallback if empty in UAT (take all time)
        IF NOT EXISTS (SELECT 1 FROM #TopChiNhanh)
        BEGIN
            INSERT INTO #TopChiNhanh
            SELECT TOP (@TopN)
                D.ItemID                                     AS [Mã SP],
                CF.ItemName                                  AS [Sản phẩm],
                COUNT(DISTINCT I.DocumentID)                 AS [Số HĐ],
                CAST(SUM(D.TotalAmount) AS BIGINT)           AS [Doanh số],
                N'Bán chạy trong chi nhánh (Toàn thời gian)' AS [Gợi ý]
            FROM AR_InvoiceTbl I WITH (NOLOCK)
            JOIN AR_InvoiceDetailTbl D WITH (NOLOCK) ON I.DocumentID = D.DocumentID
            JOIN CF_ItemTbl CF WITH (NOLOCK)         ON CF.ItemID    = D.ItemID
            WHERE ISNULL(I.StatusID, 0) != 10
              AND (@SYS_BranchID  = '' OR I.BranchID  = @SYS_BranchID)
              AND ISNULL(CF.ItemGroupID, '') = 'HH1'
            GROUP BY D.ItemID, CF.ItemName;
        END

        SELECT * FROM #TopChiNhanh ORDER BY [Doanh số] DESC;
        DROP TABLE #TopChiNhanh;
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
      AND ISNULL(I.StatusID, 0) != 10
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
          AND ISNULL(I.StatusID, 0) != 10
        GROUP BY D.ItemID;
    END

    -- TIÊU CHÍ 2: Chu kỳ mua hàng trung bình (Average Purchase Cycle)
    SELECT
        L.ItemID,
        CASE
            WHEN L.SoLanMua >= 2
            THEN DATEDIFF(DAY, L.LanMuaDau, L.LanMuaCuoi) / (L.SoLanMua - 1)
            ELSE 30 -- Mặc định 30 ngày nếu chỉ mua 1 lần
        END AS ChuKyTrungBinh
    INTO #ChuKy
    FROM #LichSu L;

    -- TIÊU CHÍ 3: Mùa vụ (Cùng tháng này năm trước)
    SELECT D.ItemID INTO #MuaVu
    FROM AR_InvoiceTbl I WITH (NOLOCK)
    JOIN AR_InvoiceDetailTbl D WITH (NOLOCK) ON I.DocumentID = D.DocumentID
    WHERE I.ObjectID = @MaKhachHang AND MONTH(I.DocumentDate) = MONTH(GETDATE()) AND YEAR(I.DocumentDate) = YEAR(GETDATE()) - 1
    GROUP BY D.ItemID;

    -- TIÊU CHÍ 4: Khuyến mãi đang chạy
    SELECT DISTINCT PD.ItemID INTO #KhuyenMai
    FROM AR_PromotionTbl P WITH (NOLOCK)
    JOIN AR_PromotionDetailTbl PD WITH (NOLOCK) ON P.DocumentID = PD.DocumentID
    WHERE GETDATE() BETWEEN P.FromDate AND P.ToDate AND ISNULL(P.isDisable, 0) = 0;

    -- Fallback nếu không có KM chạy hôm nay
    IF NOT EXISTS (SELECT 1 FROM #KhuyenMai)
    BEGIN
        INSERT INTO #KhuyenMai (ItemID)
        SELECT TOP 100 PD.ItemID
        FROM AR_PromotionTbl P WITH (NOLOCK)
        JOIN AR_PromotionDetailTbl PD WITH (NOLOCK) ON P.DocumentID = PD.DocumentID
        WHERE ISNULL(P.isDisable, 0) = 0
        GROUP BY PD.ItemID
        ORDER BY MAX(P.ToDate) DESC;
    END

    -- TIÊU CHÍ 5: Sản phẩm trọng tâm (Focus Items)
    DECLARE @CurProgramID VARCHAR(50) = ''
    SELECT TOP 1 @CurProgramID = DocumentID FROM AR_SanPhamTrongTamTbl WITH (NOLOCK)
    WHERE GETDATE() BETWEEN FromDate AND ToDate ORDER BY ToDate DESC;

    -- Fallback nếu không có chương trình chạy hôm nay
    IF @CurProgramID = ''
    BEGIN
        SELECT TOP 1 @CurProgramID = DocumentID FROM AR_SanPhamTrongTamTbl WITH (NOLOCK)
        ORDER BY ToDate DESC;
    END

    SELECT DISTINCT ItemID INTO #TrongTam 
    FROM AR_SanPhamTrongTamDetailTbl WITH (NOLOCK) WHERE DocumentID = @CurProgramID;

    -- TIÊU CHÍ 6: Đã mua hôm nay (Real-time Filter) quét cả đơn nháp (Order) và hóa đơn (Invoice)
    SELECT DISTINCT ItemID INTO #DaMuaHomNay FROM (
        SELECT D.ItemID
        FROM AR_InvoiceTbl I WITH (NOLOCK) JOIN AR_InvoiceDetailTbl D WITH (NOLOCK) ON I.DocumentID = D.DocumentID
        WHERE I.ObjectID = @MaKhachHang AND CAST(I.DocumentDate AS DATE) = CAST(GETDATE() AS DATE) AND ISNULL(I.StatusID, 0) != 10
        UNION
        SELECT D.ItemID
        FROM AR_OrderTbl O WITH (NOLOCK) JOIN AR_OrderDetailTbl D WITH (NOLOCK) ON O.DocumentID = D.DocumentID
        WHERE O.ObjectID = @MaKhachHang AND CAST(O.DocumentDate AS DATE) = CAST(GETDATE() AS DATE) AND ISNULL(O.StatusID, 0) != 10
    ) T;

    -- KẾT QUẢ CUỐI CÙNG: Tập trung vào "Thời điểm vàng"
    SELECT TOP (@TopN)
        L.ItemID                                        AS [MaSanPham],
        CF.ItemName                                     AS [TenSanPham],
        CAST(L.TongTien AS BIGINT)                      AS [TongDaMua],
        FORMAT(L.LanMuaCuoi, 'MM/dd')                   AS [LanMuaCuoi],
        CK.ChuKyTrungBinh                               AS [ChuKyNgay],
        CASE WHEN (CK.ChuKyTrungBinh - L.SoNgayTuLanCuoi) < 0 THEN 0 
             ELSE CAST(CK.ChuKyTrungBinh - L.SoNgayTuLanCuoi AS INT) END AS [TonKho],
        CASE 
            WHEN L.SoNgayTuLanCuoi >= CK.ChuKyTrungBinh THEN N'Cần nhập thêm'
            WHEN CK.ChuKyTrungBinh - L.SoNgayTuLanCuoi <= 7 THEN N'Thời điểm vàng'
            ELSE N'Ổn định'
        END                                             AS [TrangThai],
        CONCAT(
            CASE 
                WHEN L.SoNgayTuLanCuoi >= CK.ChuKyTrungBinh THEN N'Cần nhập thêm ' + CAST(L.SoNgayTuLanCuoi - CK.ChuKyTrungBinh AS VARCHAR) + N' ngày'
                WHEN CK.ChuKyTrungBinh - L.SoNgayTuLanCuoi <= 7 THEN N'Thời điểm vàng'
                ELSE N'Ổn định'
            END,
            CASE WHEN TT.ItemID IS NOT NULL THEN N' | Trọng tâm' ELSE '' END,
            CASE WHEN MV.ItemID IS NOT NULL THEN N' | Mùa vụ' ELSE '' END,
            CASE WHEN KM.ItemID IS NOT NULL THEN N' | Khuyến mãi' ELSE '' END
        )                                               AS [ChiTiet]
    FROM #LichSu L
    JOIN #ChuKy CK          ON L.ItemID = CK.ItemID
    LEFT JOIN #MuaVu MV     ON L.ItemID = MV.ItemID
    LEFT JOIN #KhuyenMai KM ON L.ItemID = KM.ItemID
    LEFT JOIN #TrongTam TT  ON L.ItemID = TT.ItemID
    LEFT JOIN #DaMuaHomNay HN ON L.ItemID = HN.ItemID
    LEFT JOIN CF_ItemTbl CF WITH (NOLOCK) ON L.ItemID = CF.ItemID
    WHERE ISNULL(CF.ItemGroupID, '') = 'HH1'
      AND HN.ItemID IS NULL -- Lọc Real-time: Chưa mua hôm nay
    ORDER BY (CASE WHEN TT.ItemID IS NOT NULL THEN 1 ELSE 0 END) DESC, -- Ưu tiên hàng trọng tâm lên hàng đầu
             (CASE WHEN L.SoNgayTuLanCuoi >= CK.ChuKyTrungBinh THEN 1 ELSE 0 END) DESC, 
             (CASE WHEN (CK.ChuKyTrungBinh - L.SoNgayTuLanCuoi) <= 7 THEN 1 ELSE 0 END) DESC,
             L.SoLanMua DESC;

    DROP TABLE #LichSu; DROP TABLE #ChuKy; DROP TABLE #MuaVu; DROP TABLE #KhuyenMai; DROP TABLE #TrongTam; DROP TABLE #DaMuaHomNay;
END
GO

/* -- TEST SCRIPT --
-- Kịch bản 1: Tra cứu gợi ý cho một khách hàng cụ thể
EXEC API_GoiYDonHang_AI @Username = 'admin', @MaKhachHang = 'KH001', @TopN = 10;

-- Kịch bản 2: Tra cứu danh sách bán chạy chung cho chi nhánh (ObjectID để trống)
EXEC API_GoiYDonHang_AI @Username = 'admin', @MaKhachHang = '', @TopN = 10;
*/



