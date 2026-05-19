IF OBJECT_ID('API_UpsellGoiY_AI', 'P') IS NOT NULL DROP PROCEDURE API_UpsellGoiY_AI;
GO
CREATE PROCEDURE API_UpsellGoiY_AI
    @Username    VARCHAR(50)  = '',
    @MaKhachHang   VARCHAR(50)  = '',
    @timkiem   NVARCHAR(50) = '',      
    @TopN        INT          = 10
AS
BEGIN
    SET NOCOUNT ON

    -- ═══ Validate User ═══
    IF NOT EXISTS (SELECT 1 FROM SY_User WHERE UserName = @Username AND COALESCE(Disable, 0) = 0)
    BEGIN
        SELECT N'User không tồn tại hoặc đã bị khóa' AS Msg, 1 AS MsgType
        RETURN
    END

    DECLARE @SYSBranchID VARCHAR(50) = ''
    SELECT @SYSBranchID = COALESCE(BranchID, '') FROM SY_User WHERE UserName = @Username

    DECLARE @DoanhSoHienTai FLOAT = 0
    DECLARE @MucTarget      FLOAT = 0
    DECLARE @SoTienThieu    FLOAT = 0
    DECLARE @ProgramID      VARCHAR(50) = ''

    -- ═══ Validate khachhang ═══
    IF @MaKhachHang <> '' AND NOT EXISTS (SELECT 1 FROM CF_ObjectTbl WHERE ObjectID = @MaKhachHang)
    BEGIN
        SELECT N'Không tìm thấy mã khách hàng này trong hệ thống.' AS Msg, 1 AS MsgType
        RETURN;
    END

    -- ═══ 1. Xác định chương trình đang hoạt động ═══
    SELECT TOP 1 @ProgramID = DocumentID 
    FROM AR_SanPhamTrongTamTbl
    WHERE GETDATE() BETWEEN FromDate AND ToDate
    ORDER BY ToDate DESC

    -- ═══ 2. Doanh số hiện tại của khách trong tháng (Tính cả hóa đơn & đơn nháp) ═══
    SELECT @DoanhSoHienTai = ISNULL(SUM(I.TotalAmount), 0)
    FROM (
        SELECT I.ObjectID, I.DocumentDate, I.BranchID, I.StatusID, D.TotalAmount
        FROM AR_InvoiceTbl I JOIN AR_InvoiceDetailTbl D ON I.DocumentID = D.DocumentID
        UNION ALL
        SELECT O.ObjectID, O.DocumentDate, O.BranchID, O.StatusID, D.TotalAmount
        FROM AR_OrderTbl O JOIN AR_OrderDetailTbl D ON O.DocumentID = D.DocumentID
    ) I
    WHERE I.ObjectID = @MaKhachHang
      AND ISNULL(I.StatusID, 0) != 10
      AND I.DocumentDate >= DATEADD(month, DATEDIFF(month, 0, GETDATE()), 0)
      AND (@SYSBranchID = '' OR I.BranchID = @SYSBranchID)

    -- ═══ 3. Tự động tìm mốc thưởng tiếp theo ═══
    IF @ProgramID <> ''
    BEGIN
        SELECT TOP 1 @MucTarget = CAST(TuDiem AS FLOAT)
        FROM AR_PromotionGiftTbl
        WHERE DocumentID = @ProgramID AND TuDiem > @DoanhSoHienTai
        ORDER BY TuDiem ASC
    END

    SET @SoTienThieu = CASE WHEN @MucTarget > 0 THEN @MucTarget - @DoanhSoHienTai ELSE 0 END

    -- (ĐÃ LOẠI BỎ BẢNG 1 RỜI RẠC. DỮ LIỆU TÍCH LŨY SẼ ĐƯỢC NHÚNG VÀO TỪNG CỘT CỦA BẢNG 2 BÊN DƯỚI)
    -- ═══ 4. Giá mới nhất từ Bảng giá ═══
    SELECT
        D.ItemID,
        MAX(H.FromDate) AS MaxFromDate
    INTO #LatestPriceHeader
    FROM AR_PriceDetailTbl D
    JOIN AR_PriceTbl H ON D.DocumentID = H.DocumentID
    WHERE H.isDisable = 0
      AND H.FromDate <= GETDATE()
      AND (H.ToDate IS NULL OR H.ToDate >= GETDATE())
    GROUP BY D.ItemID;

    SELECT
        D.ItemID,
        MAX(D.UnitPrice) AS GiaHienTai
    INTO #GiaThiTruong
    FROM AR_PriceDetailTbl D
    JOIN AR_PriceTbl H ON D.DocumentID = H.DocumentID
    JOIN #LatestPriceHeader L ON D.ItemID = L.ItemID AND H.FromDate = L.MaxFromDate
    WHERE H.isDisable = 0
    GROUP BY D.ItemID;

    -- ═══ 5. Hàng khách hay mua (6 tháng gần nhất) ═══
    SELECT D.ItemID, COUNT(DISTINCT I.DocumentID) AS TanSuatMua
    INTO #KhachQuen 
    FROM AR_InvoiceTbl I JOIN AR_InvoiceDetailTbl D ON I.DocumentID = D.DocumentID
    WHERE I.ObjectID = @MaKhachHang 
      AND ISNULL(I.StatusID,0) != 10 
      AND I.DocumentDate >= DATEADD(MONTH, -6, GETDATE())
    GROUP BY D.ItemID

    -- ═══ 6. Top 50 bán chạy tại chi nhánh ═══
    SELECT TOP 50 D.ItemID, SUM(D.TotalAmount) AS DoanhSoChiNhanh
    INTO #BanChay 
    FROM AR_InvoiceTbl I JOIN AR_InvoiceDetailTbl D ON I.DocumentID = D.DocumentID
    WHERE I.DocumentDate >= DATEADD(DAY, -180, GETDATE()) 
      AND ISNULL(I.StatusID, 0) != 10 
      AND (@SYSBranchID = '' OR I.BranchID = @SYSBranchID)
    GROUP BY D.ItemID

    -- ═══ 7. Tồn kho tổng hợp ═══
    SELECT ItemID, SUM(QuantityinStock) AS QuantityinStock
    INTO #TonKho
    FROM IV_StockTbl
    GROUP BY ItemID

    -- ═══ 7.5. Danh sách sản phẩm trọng tâm ═══
    SELECT DISTINCT ItemID INTO #TrongTam 
    FROM AR_SanPhamTrongTamDetailTbl 
    WHERE DocumentID = @ProgramID

    -- ════════════════════════════════════════════════════
    -- BẢNG 2: GỢI Ý SẢN PHẨM (KỊCH BẢN CHIA NHÁNH BẰNG IF ELSE)
    -- ════════════════════════════════════════════════════

    -- Xử lý triệt để dấu câu và khoảng trắng dư thừa
    SET @timkiem = LTRIM(RTRIM(REPLACE(REPLACE(REPLACE(@timkiem, '.', ''), ',', ''), '-', '')));

    IF @timkiem != ''
    BEGIN
        -- ====================================================================
        -- KỊCH BẢN 1: TÌM SẢN PHẨM THEO TRIỆU CHỨNG (SEARCH KEY)
        -- Yêu cầu: Trả về chính xác hàng khớp từ khóa. Tuyệt đối không nhét Trọng Tâm vào.
        -- ====================================================================
        SELECT TOP (@TopN)
            CAST(@DoanhSoHienTai AS BIGINT) AS DoanhSoDaDat,
            CAST(@MucTarget AS BIGINT)      AS MucTieuTiepTheo,
            CAST(@SoTienThieu AS BIGINT)    AS SoTienConThieu,
            CASE 
                WHEN @ProgramID = '' THEN N'Hiện không có chương trình tích lũy nào đang chạy.'
                WHEN @MucTarget > 0  THEN N'Khách thiếu ' + FORMAT(@SoTienThieu, 'N0') + N'đ để đạt mốc thưởng kế tiếp.'
                ELSE N'Chúc mừng! Khách đã vượt mọi mốc thưởng cao nhất tháng này.'
            END AS LoiNhacAI,

            I.ItemID, 
            I.ItemName, 
            I.Unit,
            CAST(ISNULL(G.GiaHienTai, 0) AS BIGINT)   AS GiaBan,
            ISNULL(S.QuantityinStock, 0)               AS TonKho,
            (
                (CASE WHEN ISNULL(S.QuantityinStock,0) > 0 THEN 2000000 ELSE 0 END) +
                
                -- Ưu tiên 1: Tên chứa từ khoá nguyên bản ở đầu (VD: Bắt đầu bằng chữ "Thuốc ho")
                (CASE WHEN I.ItemName COLLATE Vietnamese_CI_AS LIKE REPLACE(@timkiem, 'thuoc ', '') + N'%' OR I.ItemName COLLATE Vietnamese_CI_AS LIKE @timkiem + N'%' THEN 500000 ELSE 0 END) +
                
                -- Ưu tiên 2: Tên chứa chính xác từ khóa rời rạc (Full-text match)
                (CASE WHEN CHARINDEX(' '+@timkiem+' ', ' '+REPLACE(REPLACE(REPLACE(I.ItemName COLLATE Vietnamese_CI_AS,',',' '),'.',' '),'-',' ')+' ') > 0 THEN 300000 ELSE 0 END) +
                
                -- Ưu tiên 3: Tên chỉ nằm đâu đó trong chuỗi (Contains)
                (CASE WHEN I.ItemName COLLATE Vietnamese_CI_AS LIKE N'%'+@timkiem+N'%' THEN 100000 ELSE 0 END) +
                
                -- Ưu tiên 4: Từ khóa (TuKhoa) chứa full-text match
                (CASE WHEN CHARINDEX(' '+@timkiem+' ', ' '+REPLACE(REPLACE(REPLACE(ISNULL(I.TuKhoa,'') COLLATE Vietnamese_CI_AS,',',' '),'.',' '),'-',' ')+' ') > 0 THEN 50000 ELSE 0 END) +
                
                -- Ưu tiên 5: Từ khóa (TuKhoa) contains
                (CASE WHEN I.TuKhoa COLLATE Vietnamese_CI_AS LIKE N'%'+@timkiem+N'%' THEN 10000 ELSE 0 END)
            ) AS PriorityScore,
            N'Triệu chứng: ' + @timkiem + CASE WHEN ISNULL(S.QuantityinStock, 0) <= 0 THEN N' | Hết hàng' ELSE N' | Còn hàng' END AS LyDoGoiY
        INTO #KetQuaKichBan1
        FROM CF_ItemTbl I
        LEFT JOIN #TonKho S ON I.ItemID = S.ItemID  
        LEFT JOIN #GiaThiTruong G ON I.ItemID = G.ItemID
        WHERE ISNULL(I.isDisable, 0) = 0
          AND ISNULL(I.ItemGroupID, '') NOT IN ('KM', 'DV', 'VT', 'BB', 'Vat Tu', 'Bao Bi', 'TUI')
          AND I.ItemID NOT LIKE 'BB%' AND I.ItemID NOT LIKE 'TUI%' AND I.ItemID NOT LIKE 'PB%' AND I.ItemID NOT LIKE 'NY%'
          AND (I.ItemName COLLATE Vietnamese_CI_AS LIKE N'%'+@timkiem+N'%' OR I.TuKhoa COLLATE Vietnamese_CI_AS LIKE N'%'+@timkiem+N'%')
        ORDER BY PriorityScore DESC;

        -- Fallback nếu không tìm thấy gì
        IF NOT EXISTS (SELECT 1 FROM #KetQuaKichBan1)
        BEGIN
            SELECT 
                0 AS DoanhSoDaDat,
                0 AS MucTieuTiepTheo,
                0 AS SoTienConThieu,
                N'Rất tiếc, hệ thống không tìm thấy kết quả nào' AS LoiNhacAI,
                'N/A' AS ItemID, 
                N'Không tìm thấy sản phẩm' AS ItemName, 
                '' AS Unit, 
                0 AS GiaBan,
                0 AS TonKho,
                0 AS PriorityScore,
                N'Vui lòng thử lại với từ khóa khác hoặc kiểm tra lại tên.' AS LyDoGoiY;
        END
        ELSE
        BEGIN
            SELECT * FROM #KetQuaKichBan1 ORDER BY PriorityScore DESC;
        END
        DROP TABLE #KetQuaKichBan1;
    END
    ELSE
    BEGIN
        -- ====================================================================
        -- KỊCH BẢN 2: GỢI Ý UPSELL TỰ ĐỘNG (KHÔNG CÓ TRIỆU CHỨNG)
        -- Yêu cầu: Gợi ý Hàng Trọng Tâm, Hàng Bán Chạy, Khách Quen
        -- ====================================================================
        SELECT TOP (@TopN)
            CAST(@DoanhSoHienTai AS BIGINT) AS DoanhSoDaDat,
            CAST(@MucTarget AS BIGINT)      AS MucTieuTiepTheo,
            CAST(@SoTienThieu AS BIGINT)    AS SoTienConThieu,
            CASE 
                WHEN @ProgramID = '' THEN N'Hiện không có chương trình tích lũy nào đang chạy.'
                WHEN @MucTarget > 0  THEN N'Khách thiếu ' + FORMAT(@SoTienThieu, 'N0') + N'đ để đạt mốc thưởng kế tiếp.'
                ELSE N'Chúc mừng! Khách đã vượt mọi mốc thưởng cao nhất tháng này.'
            END AS LoiNhacAI,

            I.ItemID, 
            I.ItemName, 
            I.Unit,
            CAST(ISNULL(G.GiaHienTai, 0) AS BIGINT)   AS GiaBan,
            ISNULL(S.QuantityinStock, 0)               AS TonKho,
            (
                (CASE WHEN TT.ItemID IS NOT NULL THEN 300000 ELSE 0 END) +
                (CASE WHEN ISNULL(S.QuantityinStock,0) > 0 THEN 200000 ELSE 0 END) +
                (CASE WHEN BC.ItemID IS NOT NULL THEN 100000 ELSE 0 END) +
                (CASE WHEN KQ.ItemID IS NOT NULL THEN 500 ELSE 0 END)
            ) AS PriorityScore,
            CASE
                WHEN TT.ItemID IS NOT NULL THEN N'Hàng TRỌNG TÂM - Cần đẩy!'
                WHEN KQ.ItemID IS NOT NULL THEN N'Combo: Hàng khách quen'
                WHEN BC.ItemID IS NOT NULL THEN N'Combo: Hàng bán chạy'
                ELSE N'Gợi ý sẵn có'
            END AS LyDoGoiY
        FROM CF_ItemTbl I
        LEFT JOIN #TonKho S ON I.ItemID = S.ItemID  
        LEFT JOIN #GiaThiTruong G ON I.ItemID = G.ItemID
        LEFT JOIN #KhachQuen KQ ON I.ItemID = KQ.ItemID
        LEFT JOIN #BanChay BC ON I.ItemID = BC.ItemID
        LEFT JOIN #TrongTam TT ON I.ItemID = TT.ItemID
        WHERE ISNULL(I.isDisable, 0) = 0
          AND ISNULL(I.ItemGroupID, '') NOT IN ('KM', 'DV', 'VT', 'BB', 'Vat Tu', 'Bao Bi', 'TUI')
          AND I.ItemID NOT LIKE 'BB%' AND I.ItemID NOT LIKE 'TUI%' AND I.ItemID NOT LIKE 'PB%' AND I.ItemID NOT LIKE 'NY%'
          AND ISNULL(S.QuantityinStock, 0) > 0
          AND (TT.ItemID IS NOT NULL OR KQ.ItemID IS NOT NULL OR BC.ItemID IS NOT NULL)
        ORDER BY PriorityScore DESC, ISNULL(KQ.TanSuatMua, 0) DESC
    END

    DROP TABLE #GiaThiTruong; DROP TABLE #KhachQuen; DROP TABLE #BanChay; DROP TABLE #TonKho; DROP TABLE #LatestPriceHeader; DROP TABLE #TrongTam;
END
GO

/* -- TEST SCRIPT --
-- Kịch bản 1: Tìm sản phẩm theo triệu chứng (SearchKey)
EXEC API_UpsellGoiY_AI @Username = 'admin', @MaKhachHang = 'KH001', @timkiem = N'ho', @TopN = 10;

-- Kịch bản 2: Gợi ý Upsell tự động
EXEC API_UpsellGoiY_AI @Username = 'admin', @MaKhachHang = 'KH001', @timkiem = '', @TopN = 10;
*/
