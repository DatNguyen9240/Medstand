IF OBJECT_ID('API_UpsellGoiY_AI', 'P') IS NOT NULL DROP PROCEDURE API_UpsellGoiY_AI;
GO
CREATE PROCEDURE API_UpsellGoiY_AI
    @Username      VARCHAR(50)  = '',
    @ObjectID      VARCHAR(50)  = '',
    @MucTarget     FLOAT        = 10000000,
    @SearchKey     NVARCHAR(50) = '',      
    @TopN          INT          = 10
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
    DECLARE @SoTienThieu    FLOAT = 0

    -- ═══ Validate ObjectID ═══
    IF @ObjectID <> '' AND NOT EXISTS (SELECT 1 FROM CF_ObjectTbl WHERE ObjectID = @ObjectID)
    BEGIN
        SELECT 0 AS DoanhSoDaDat, @MucTarget AS MucTieuTiepTheo, @MucTarget AS SoTienConThieu, 
               N'❌ Không tìm thấy mã khách hàng này trong hệ thống.' AS LoiNhacAI;
        RETURN;
    END

    -- ═══ Doanh số hiện tại của khách trong tháng ═══
    SELECT @DoanhSoHienTai = ISNULL(SUM(D.TotalAmount), 0)
    FROM AR_InvoiceTbl I
    JOIN AR_InvoiceDetailTbl D ON I.DocumentID = D.DocumentID
    WHERE I.ObjectID = @ObjectID
      AND ISNULL(I.StatusID, 0) != 10
      AND I.DocumentDate >= DATEADD(month, DATEDIFF(month, 0, GETDATE()), 0)
      AND (@SYSBranchID = '' OR I.BranchID = @SYSBranchID)

    SET @SoTienThieu = CASE WHEN @DoanhSoHienTai < @MucTarget 
                            THEN @MucTarget - @DoanhSoHienTai 
                            ELSE 0 END

    -- ═══ 1. Giá thị trường (6 tháng gần nhất) ═══
    SELECT D.ItemID, AVG(D.TotalAmount / NULLIF(D.Quantity, 0)) AS GiaHienTai
    INTO #GiaThiTruong 
    FROM AR_InvoiceDetailTbl D JOIN AR_InvoiceTbl I ON D.DocumentID = I.DocumentID
    WHERE I.DocumentDate >= DATEADD(MONTH, -6, GETDATE()) 
      AND ISNULL(I.StatusID, 0) != 10
    GROUP BY D.ItemID

    -- ═══ 2. Hàng khách hay mua (6 tháng gần nhất) ═══
    SELECT D.ItemID, COUNT(DISTINCT I.DocumentID) AS TanSuatMua
    INTO #KhachQuen 
    FROM AR_InvoiceTbl I JOIN AR_InvoiceDetailTbl D ON I.DocumentID = D.DocumentID
    WHERE I.ObjectID = @ObjectID 
      AND ISNULL(I.StatusID,0) != 10 
      AND I.DocumentDate >= DATEADD(MONTH, -6, GETDATE())
    GROUP BY D.ItemID

    -- ═══ 3. Top 50 bán chạy tại chi nhánh (6 tháng gần nhất) ═══
    SELECT TOP 50 D.ItemID, SUM(D.TotalAmount) AS DoanhSoChiNhanh
    INTO #BanChay 
    FROM AR_InvoiceTbl I JOIN AR_InvoiceDetailTbl D ON I.DocumentID = D.DocumentID
    WHERE I.DocumentDate >= DATEADD(DAY, -180, GETDATE()) 
      AND ISNULL(I.StatusID, 0) != 10 
      AND (@SYSBranchID = '' OR I.BranchID = @SYSBranchID)
    GROUP BY D.ItemID

    -- ═══ 4. Tồn kho tổng hợp (FIX: SUM để tránh lỗi nhiều kho/chi nhánh) ═══
    SELECT ItemID, SUM(QuantityinStock) AS QuantityinStock
    INTO #TonKho
    FROM IV_StockTbl
    GROUP BY ItemID

    -- ════════════════════════════════════════════════════
    -- BẢNG 1: THÔNG BÁO DOANH SỐ HIỆN TẠI
    -- ════════════════════════════════════════════════════
    SELECT 
        CAST(@DoanhSoHienTai AS BIGINT) AS DoanhSoDaDat, 
        CAST(@MucTarget AS BIGINT)      AS MucTieuTiepTheo, 
        CAST(@SoTienThieu AS BIGINT)    AS SoTienConThieu,
        CASE WHEN @SoTienThieu > 0 
             THEN N'💡 Khách thiếu ' + FORMAT(@SoTienThieu, 'N0') + N'đ để đạt thưởng.' 
             ELSE N'🎉 Đạt thưởng!' 
        END AS LoiNhacAI

    -- ════════════════════════════════════════════════════
    -- BẢNG 2: GỢI Ý SẢN PHẨM
    -- ════════════════════════════════════════════════════
    SELECT TOP (@TopN)
        I.ItemID, 
        I.ItemName, 
        I.Unit,
        CAST(ISNULL(G.GiaHienTai, 0) AS BIGINT)   AS GiaBan,
        ISNULL(S.QuantityinStock, 0)               AS TonKho,
        (
            -- Ưu tiên hàng còn tồn kho (+200,000đ)
            (CASE WHEN ISNULL(S.QuantityinStock,0) > 0 THEN 200000 ELSE 0 END) +
            -- Khớp từ khóa chính xác - word boundary (+100,000đ)
            (CASE WHEN @SearchKey != '' AND (
                CHARINDEX(' '+@SearchKey+' ', ' '+REPLACE(REPLACE(REPLACE(I.ItemName COLLATE Vietnamese_CI_AS,',',' '),'.',' '),'-',' ')+' ') > 0 OR
                CHARINDEX(' '+@SearchKey+' ', ' '+REPLACE(REPLACE(REPLACE(ISNULL(I.TuKhoa,'') COLLATE Vietnamese_CI_AS,',',' '),'.',' '),'-',' ')+' ') > 0
            ) THEN 100000 ELSE 0 END) +
            -- Khớp từ khóa chuỗi con (+50,000đ)
            (CASE WHEN @SearchKey != '' AND (
                I.ItemName COLLATE Vietnamese_CI_AS LIKE N'%'+@SearchKey+N'%' OR
                I.TuKhoa   COLLATE Vietnamese_CI_AS LIKE N'%'+@SearchKey+N'%'
            ) THEN 50000 ELSE 0 END) +
            -- Hàng bán chạy tại chi nhánh (+100,000đ)
            (CASE WHEN BC.ItemID IS NOT NULL THEN 100000 ELSE 0 END) +
            -- Hàng khách từng mua (+500đ)
            (CASE WHEN KQ.ItemID IS NOT NULL THEN 500 ELSE 0 END)
        ) AS PriorityScore,
        CASE
            -- Kịch bản 1: Tìm theo triệu chứng → Gắn nhãn tình trạng kho
            WHEN @SearchKey != '' AND (
                I.ItemName COLLATE Vietnamese_CI_AS LIKE N'%'+@SearchKey+N'%' OR 
                I.TuKhoa   COLLATE Vietnamese_CI_AS LIKE N'%'+@SearchKey+N'%')
                THEN N'🔍 Triệu chứng: ' + @SearchKey + 
                     CASE WHEN ISNULL(S.QuantityinStock, 0) <= 0 
                          THEN N' | ⚠️ Hết hàng - Cần đặt thêm' 
                          ELSE N' | ✅ Còn hàng' END
            -- Kịch bản 2: Upsell → Phân loại lý do gợi ý
            WHEN KQ.ItemID IS NOT NULL THEN N'🎁 Combo: Hàng khách quen'
            WHEN BC.ItemID IS NOT NULL THEN N'🎁 Combo: Hàng bán chạy'
            ELSE N'✨ Gợi ý sẵn có'
        END AS LyDoGoiY
    FROM CF_ItemTbl I
    LEFT JOIN #TonKho        S  ON I.ItemID = S.ItemID  -- FIX: Dùng #TonKho đã SUM thay vì JOIN thẳng
    LEFT JOIN #GiaThiTruong  G  ON I.ItemID = G.ItemID
    LEFT JOIN #KhachQuen     KQ ON I.ItemID = KQ.ItemID
    LEFT JOIN #BanChay       BC ON I.ItemID = BC.ItemID
    WHERE ISNULL(I.isDisable, 0) = 0
      AND ISNULL(I.ItemGroupID, '') NOT IN ('KM', 'DV', 'VT', 'BB', 'Vat Tu', 'Bao Bi', 'TUI')
      AND I.ItemID NOT LIKE 'BB%' AND I.ItemID NOT LIKE 'TUI%' 
      AND I.ItemID NOT LIKE 'PB%' AND I.ItemID NOT LIKE 'NY%'
      AND (
          -- Kịch bản 1: Tìm theo triệu chứng → Hiện tất cả (kể cả hết hàng, có gắn nhãn cảnh báo)
          (@SearchKey != '' AND (
              I.ItemName COLLATE Vietnamese_CI_AS LIKE N'%'+@SearchKey+N'%' OR 
              I.TuKhoa   COLLATE Vietnamese_CI_AS LIKE N'%'+@SearchKey+N'%'
          ))
          -- Kịch bản 2: Upsell → Chỉ hiện hàng còn kho
          OR (@SearchKey = '' AND ISNULL(S.QuantityinStock, 0) > 0
              AND (KQ.ItemID IS NOT NULL OR BC.ItemID IS NOT NULL))
          OR (@SearchKey = '' AND ISNULL(S.QuantityinStock, 0) > 0
              AND KQ.ItemID IS NULL AND BC.ItemID IS NULL)
      )
    ORDER BY PriorityScore DESC, ISNULL(KQ.TanSuatMua, 0) DESC

    DROP TABLE #GiaThiTruong; DROP TABLE #KhachQuen; DROP TABLE #BanChay; DROP TABLE #TonKho;
END
GO
