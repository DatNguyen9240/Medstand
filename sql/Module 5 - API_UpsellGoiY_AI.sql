USE medtest;
GO

IF OBJECT_ID('API_UpsellGoiY_AI', 'P') IS NOT NULL DROP PROCEDURE API_UpsellGoiY_AI;
GO
CREATE PROCEDURE API_UpsellGoiY_AI
    @Username     VARCHAR(50)   = '',
    @MaKhachHang  NVARCHAR(100) = '',
    @timkiem      NVARCHAR(50)  = '',      
    @TopN         INT           = 10
AS
BEGIN
    SET NOCOUNT ON

    -- Defend against NULL or non-positive bounds passed by web server binders
    IF @TopN IS NULL OR @TopN <= 0 SET @TopN = 10;

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

    -- TỰ ĐỘNG KHẮC PHỤC TÊN KHÁCH HÀNG / ẢO GIÁC:
    IF @MaKhachHang <> '' AND NOT EXISTS (SELECT 1 FROM CF_ObjectTbl WHERE ObjectID = @MaKhachHang)
    BEGIN
        DECLARE @ResolvedID VARCHAR(50) = '';
        
        IF @MaKhachHang LIKE '%\[%\]%' ESCAPE '\'
        BEGIN
            SET @MaKhachHang = SUBSTRING(@MaKhachHang, CHARINDEX('[', @MaKhachHang) + 1, CHARINDEX(']', @MaKhachHang) - CHARINDEX('[', @MaKhachHang) - 1);
        END

        IF EXISTS (SELECT 1 FROM CF_ObjectTbl WHERE ObjectID = @MaKhachHang)
        BEGIN
            SET @ResolvedID = @MaKhachHang;
        END
        ELSE
        BEGIN
            -- Ưu tiên tìm khách hàng cùng chi nhánh trước và có nhiều giao dịch nhất
            SELECT TOP 1 @ResolvedID = O.ObjectID 
            FROM CF_ObjectTbl O
            LEFT JOIN (
                SELECT ObjectID, COUNT(*) AS Cnt 
                FROM AR_InvoiceTbl 
                GROUP BY ObjectID
            ) I ON O.ObjectID = I.ObjectID
            WHERE (
                O.ObjectName COLLATE SQL_Latin1_General_CP1_CI_AI = @MaKhachHang COLLATE SQL_Latin1_General_CP1_CI_AI
                OR O.ObjectName COLLATE SQL_Latin1_General_CP1_CI_AI LIKE N'%' + @MaKhachHang + '%' COLLATE SQL_Latin1_General_CP1_CI_AI
                OR REPLACE(O.ObjectName, ' ', '') COLLATE SQL_Latin1_General_CP1_CI_AI LIKE N'%' + REPLACE(@MaKhachHang, ' ', '') + '%' COLLATE SQL_Latin1_General_CP1_CI_AI
            )
              AND (ISNULL(@SYSBranchID, '') = '' OR O.BranchID = @SYSBranchID)
            ORDER BY ISNULL(I.Cnt, 0) DESC;
              
            -- Fallback tìm toàn quốc
            IF @ResolvedID = ''
            BEGIN
                SELECT TOP 1 @ResolvedID = O.ObjectID 
                FROM CF_ObjectTbl O
                LEFT JOIN (
                    SELECT ObjectID, COUNT(*) AS Cnt 
                    FROM AR_InvoiceTbl 
                    GROUP BY ObjectID
                ) I ON O.ObjectID = I.ObjectID
                WHERE (
                    O.ObjectName COLLATE SQL_Latin1_General_CP1_CI_AI = @MaKhachHang COLLATE SQL_Latin1_General_CP1_CI_AI
                    OR O.ObjectName COLLATE SQL_Latin1_General_CP1_CI_AI LIKE N'%' + @MaKhachHang + '%' COLLATE SQL_Latin1_General_CP1_CI_AI
                    OR REPLACE(O.ObjectName, ' ', '') COLLATE SQL_Latin1_General_CP1_CI_AI LIKE N'%' + REPLACE(@MaKhachHang, ' ', '') + '%' COLLATE SQL_Latin1_General_CP1_CI_AI
                )
                ORDER BY ISNULL(I.Cnt, 0) DESC;
            END
        END

        IF NULLIF(@ResolvedID, '') IS NOT NULL
        BEGIN
            SET @MaKhachHang = @ResolvedID;
        END
    END

    -- ═══ Validate khachhang ═══
    IF @MaKhachHang <> '' AND NOT EXISTS (SELECT 1 FROM CF_ObjectTbl WITH (NOLOCK) WHERE ObjectID = @MaKhachHang)
    BEGIN
        SELECT N'Không tìm thấy mã khách hàng này trong hệ thống.' AS Msg, 1 AS MsgType
        RETURN;
    END

    -- ═══ 1. Xác định chương trình đang hoạt động ═══
    SELECT TOP 1 @ProgramID = DocumentID 
    FROM AR_SanPhamTrongTamTbl WITH (NOLOCK)
    WHERE GETDATE() BETWEEN FromDate AND ToDate
    ORDER BY ToDate DESC;

    -- UAT FALLBACK: Nếu không có chương trình đang chạy, lấy chương trình mới nhất
    IF ISNULL(@ProgramID, '') = ''
    BEGIN
        SELECT TOP 1 @ProgramID = DocumentID 
        FROM AR_SanPhamTrongTamTbl WITH (NOLOCK)
        ORDER BY ToDate DESC;
    END

    -- ═══ 2. Doanh số hiện tại của khách trong tháng (Tính cả hóa đơn & đơn nháp) ═══
    SELECT @DoanhSoHienTai = ISNULL(SUM(I.TotalAmount), 0)
    FROM (
        SELECT I.ObjectID, I.DocumentDate, I.BranchID, I.StatusID, D.TotalAmount
        FROM AR_InvoiceTbl I WITH (NOLOCK) JOIN AR_InvoiceDetailTbl D WITH (NOLOCK) ON I.DocumentID = D.DocumentID
        UNION ALL
        SELECT O.ObjectID, O.DocumentDate, O.BranchID, O.StatusID, D.TotalAmount
        FROM AR_OrderTbl O WITH (NOLOCK) JOIN AR_OrderDetailTbl D WITH (NOLOCK) ON O.DocumentID = D.DocumentID
    ) I
    WHERE I.ObjectID = @MaKhachHang
      AND ISNULL(I.StatusID, 0) != 10
      AND I.DocumentDate >= DATEADD(month, DATEDIFF(month, 0, GETDATE()), 0)
      AND (@SYSBranchID = '' OR I.BranchID = @SYSBranchID);

    -- ═══ 3. Tự động tìm mốc thưởng tiếp theo ═══
    IF @ProgramID <> ''
    BEGIN
        SELECT TOP 1 @MucTarget = CAST(TuDiem AS FLOAT)
        FROM AR_PromotionGiftTbl WITH (NOLOCK)
        WHERE DocumentID = @ProgramID AND TuDiem > @DoanhSoHienTai
        ORDER BY TuDiem ASC;
    END

    SET @SoTienThieu = CASE WHEN @MucTarget > 0 THEN @MucTarget - @DoanhSoHienTai ELSE 0 END;

    -- ═══ 4. Giá mới nhất từ Bảng giá ═══
    SELECT
        D.ItemID,
        MAX(H.FromDate) AS MaxFromDate
    INTO #LatestPriceHeader
    FROM AR_PriceDetailTbl D WITH (NOLOCK)
    JOIN AR_PriceTbl H WITH (NOLOCK) ON D.DocumentID = H.DocumentID
    WHERE H.isDisable = 0
      AND H.FromDate <= GETDATE()
      AND (H.ToDate IS NULL OR H.ToDate >= GETDATE())
    GROUP BY D.ItemID;

    -- UAT FALLBACK: Nếu không có bảng giá hoạt động hôm nay, lấy bảng giá mới nhất mọi thời đại
    IF NOT EXISTS (SELECT 1 FROM #LatestPriceHeader)
    BEGIN
        INSERT INTO #LatestPriceHeader (ItemID, MaxFromDate)
        SELECT
            D.ItemID,
            MAX(H.FromDate) AS MaxFromDate
        FROM AR_PriceDetailTbl D WITH (NOLOCK)
        JOIN AR_PriceTbl H WITH (NOLOCK) ON D.DocumentID = H.DocumentID
        WHERE H.isDisable = 0
        GROUP BY D.ItemID;
    END

    SELECT
        D.ItemID,
        MAX(D.UnitPrice) AS GiaHienTai
    INTO #GiaThiTruong
    FROM AR_PriceDetailTbl D WITH (NOLOCK)
    JOIN AR_PriceTbl H WITH (NOLOCK) ON D.DocumentID = H.DocumentID
    JOIN #LatestPriceHeader L ON D.ItemID = L.ItemID AND H.FromDate = L.MaxFromDate
    WHERE H.isDisable = 0
    GROUP BY D.ItemID;

    -- ═══ 5. Hàng khách hay mua (6 tháng gần nhất) ═══
    SELECT D.ItemID, COUNT(DISTINCT I.DocumentID) AS TanSuatMua
    INTO #KhachQuen 
    FROM AR_InvoiceTbl I WITH (NOLOCK) JOIN AR_InvoiceDetailTbl D WITH (NOLOCK) ON I.DocumentID = D.DocumentID
    WHERE I.ObjectID = @MaKhachHang 
      AND ISNULL(I.StatusID,0) != 10 
      AND I.DocumentDate >= DATEADD(MONTH, -6, GETDATE())
    GROUP BY D.ItemID;

    -- UAT FALLBACK: Lấy tất cả lịch sử mua
    IF NOT EXISTS (SELECT 1 FROM #KhachQuen)
    BEGIN
        INSERT INTO #KhachQuen (ItemID, TanSuatMua)
        SELECT D.ItemID, COUNT(DISTINCT I.DocumentID) AS TanSuatMua
        FROM AR_InvoiceTbl I WITH (NOLOCK) JOIN AR_InvoiceDetailTbl D WITH (NOLOCK) ON I.DocumentID = D.DocumentID
        WHERE I.ObjectID = @MaKhachHang 
          AND ISNULL(I.StatusID,0) != 10
        GROUP BY D.ItemID;
    END

    -- ═══ 6. Top 50 bán chạy tại chi nhánh ═══
    SELECT TOP 50 D.ItemID, SUM(D.TotalAmount) AS DoanhSoChiNhanh
    INTO #BanChay 
    FROM AR_InvoiceTbl I WITH (NOLOCK) JOIN AR_InvoiceDetailTbl D WITH (NOLOCK) ON I.DocumentID = D.DocumentID
    WHERE I.DocumentDate >= DATEADD(DAY, -180, GETDATE()) 
      AND ISNULL(I.StatusID, 0) != 10 
      AND (@SYSBranchID = '' OR I.BranchID = @SYSBranchID)
    GROUP BY D.ItemID;

    -- UAT FALLBACK: Lấy top bán chạy mọi thời đại
    IF NOT EXISTS (SELECT 1 FROM #BanChay)
    BEGIN
        INSERT INTO #BanChay (ItemID, DoanhSoChiNhanh)
        SELECT TOP 50 D.ItemID, SUM(D.TotalAmount) AS DoanhSoChiNhanh
        FROM AR_InvoiceTbl I WITH (NOLOCK) JOIN AR_InvoiceDetailTbl D WITH (NOLOCK) ON I.DocumentID = D.DocumentID
        WHERE ISNULL(I.StatusID, 0) != 10 
          AND (@SYSBranchID = '' OR I.BranchID = @SYSBranchID)
        GROUP BY D.ItemID
        ORDER BY DoanhSoChiNhanh DESC;
    END

    -- ═══ 7. Tồn kho tổng hợp ═══
    SELECT ItemID, SUM(QuantityinStock) AS QuantityinStock
    INTO #TonKho
    FROM IV_StockTbl WITH (NOLOCK)
    GROUP BY ItemID;

    -- ═══ 7.5. Danh sách sản phẩm trọng tâm �    -- Chuẩn hóa các liên từ nối tiếng Việt thành khoảng trắng/dấu phẩy đề phòng n8n chưa xử lý
    SET @timkiem = REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(@timkiem, N' cùng với ', ','), N' Cùng với ', ','), N' đi kèm ', ','), N' Đi kèm ', ','), N' và ', ','), N' Và ', ',');
    SET @timkiem = REPLACE(REPLACE(REPLACE(REPLACE(@timkiem, N' với ', ','), N' Với ', ','), N' & ', ','), N' + ', ',');

    -- Xử lý triệt để dấu câu và khoảng trắng dư thừa
    SET @timkiem = LTRIM(RTRIM(REPLACE(REPLACE(REPLACE(@timkiem, '.', ''), ',', ''), '-', '')));

    IF @timkiem != ''
    BEGIN
        -- Clean and split keyword using stop words
        DECLARE @Terms TABLE (Term NVARCHAR(100));
        DECLARE @StopWords TABLE (Word NVARCHAR(100));
        INSERT INTO @StopWords (Word) VALUES 
        (N'và'), (N'của'), (N'thuốc'), (N'bị'), (N'cho'), (N'nên'), (N'uống'), (N'gì'), (N'tư'), (N'vấn'), 
        (N'thành'), (N'phần'), (N'công'), (N'dụng'), (N'giá'), (N'tìm'), (N'hiệu'), (N'quả'), (N'tốt'), 
        (N'nhất'), (N'có'), (N'thể'), (N'được'), (N'là'), (N'trong'), (N'với'), (N'cùng'), (N'đi'), 
        (N'kèm'), (N'khách'), (N'em'), (N'tôi'), (N'mình'), (N'bác'), (N'sĩ'), (N'nhà'), (N'hỏi'), 
        (N'muốn'), (N'mua'), (N'bán'), (N'thông'), (N'tin'), (N'chi'), (N'tiết'), (N'sản'),
        (N'thì'), (N'ở'), (N'hộ'), (N'giúp'), (N'bởi'), (N'vì'), (N'như'), (N'thế'), (N'nào'), (N'a'), (N'ạ');

        DECLARE @clean_timkiem NVARCHAR(200) = @timkiem;
        SET @clean_timkiem = REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(@clean_timkiem, N' cùng với ', ' '), N' Cùng với ', ' '), N' đi kèm ', ' '), N' Đi kèm ', ' '), N' và ', ' '), N' Và ', ' ');
        SET @clean_timkiem = REPLACE(REPLACE(REPLACE(REPLACE(@clean_timkiem, N' với ', ' '), N' Với ', ' '), N' & ', ' '), N' + ', ' ');
        SET @clean_timkiem = REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(@clean_timkiem, '.', ' '), ',', ' '), '-', ' '), '?', ' '), '!', ' '), ':', ' ');
        SET @clean_timkiem = REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(@clean_timkiem, ';', ' '), '(', ' '), ')', ' '), '[', ' '), ']', ' ');

        INSERT INTO @Terms (Term)
        SELECT DISTINCT LTRIM(RTRIM(value))
        FROM STRING_SPLIT(@clean_timkiem, ' ')
        WHERE LTRIM(RTRIM(value)) <> '' 
          AND LTRIM(RTRIM(value)) NOT IN (SELECT Word FROM @StopWords);

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
                (CASE WHEN I.TuKhoa COLLATE Vietnamese_CI_AS LIKE N'%'+@timkiem+N'%' THEN 10000 ELSE 0 END) +

                -- Ưu tiên 6: Số lượng từ khoá con khớp (+50000 điểm cho mỗi từ khớp)
                COALESCE((
                    SELECT COUNT(*) * 50000 
                    FROM @Terms T 
                    WHERE I.ItemName COLLATE Vietnamese_CI_AS LIKE N'%' + T.Term + N'%' 
                       OR I.TuKhoa COLLATE Vietnamese_CI_AS LIKE N'%' + T.Term + N'%'
                ), 0)
            ) AS PriorityScore,
            N'Triệu chứng: ' + @timkiem + CASE WHEN ISNULL(S.QuantityinStock, 0) <= 0 THEN N' | Hết hàng' ELSE N' | Còn hàng' END AS LyDoGoiY
        INTO #KetQuaKichBan1
        FROM CF_ItemTbl I WITH (NOLOCK)
        LEFT JOIN #TonKho S ON I.ItemID = S.ItemID  
        LEFT JOIN #GiaThiTruong G ON I.ItemID = G.ItemID
        WHERE ISNULL(I.isDisable, 0) = 0
          AND ISNULL(I.ItemGroupID, '') NOT IN ('KM', 'DV', 'VT', 'BB', 'Vat Tu', 'Bao Bi', 'TUI')
          AND I.ItemID NOT LIKE 'BB%' AND I.ItemID NOT LIKE 'TUI%' AND I.ItemID NOT LIKE 'PB%' AND I.ItemID NOT LIKE 'NY%'
          AND (
              I.ItemName COLLATE Vietnamese_CI_AS LIKE N'%'+@timkiem+N'%' OR 
              I.TuKhoa COLLATE Vietnamese_CI_AS LIKE N'%'+@timkiem+N'%' OR
              EXISTS (
                  SELECT 1 FROM @Terms T 
                  WHERE I.ItemName COLLATE Vietnamese_CI_AS LIKE N'%' + T.Term + N'%' 
                     OR I.TuKhoa COLLATE Vietnamese_CI_AS LIKE N'%' + T.Term + N'%'
              )
          )0000 ELSE 0 END)
            ) AS PriorityScore,
            N'Triệu chứng: ' + @timkiem + CASE WHEN ISNULL(S.QuantityinStock, 0) <= 0 THEN N' | Hết hàng' ELSE N' | Còn hàng' END AS LyDoGoiY
        INTO #KetQuaKichBan1
        FROM CF_ItemTbl I WITH (NOLOCK)
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
        INTO #KetQuaKichBan2
        FROM CF_ItemTbl I WITH (NOLOCK)
        LEFT JOIN #TonKho S ON I.ItemID = S.ItemID  
        LEFT JOIN #GiaThiTruong G ON I.ItemID = G.ItemID
        LEFT JOIN #KhachQuen KQ ON I.ItemID = KQ.ItemID
        LEFT JOIN #BanChay BC ON I.ItemID = BC.ItemID
        LEFT JOIN #TrongTam TT ON I.ItemID = TT.ItemID
        WHERE ISNULL(I.isDisable, 0) = 0
          AND ISNULL(I.ItemGroupID, '') NOT IN ('KM', 'DV', 'VT', 'BB', 'Vat Tu', 'Bao Bi', 'TUI')
          AND I.ItemID NOT LIKE 'BB%' AND I.ItemID NOT LIKE 'TUI%' AND I.ItemID NOT LIKE 'PB%' AND I.ItemID NOT LIKE 'NY%'
          AND ISNULL(S.QuantityinStock, 0) > 0
          AND (TT.ItemID IS NOT NULL OR KQ.ItemID IS NOT NULL OR BC.ItemID IS NOT NULL);

        -- UAT FALLBACK: Nếu không có sản phẩm nào có sẵn tồn kho, lấy cả sản phẩm hết hàng
        IF NOT EXISTS (SELECT 1 FROM #KetQuaKichBan2)
        BEGIN
            INSERT INTO #KetQuaKichBan2
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
                    WHEN TT.ItemID IS NOT NULL THEN N'Hàng TRỌNG TÂM (Hết hàng)'
                    WHEN KQ.ItemID IS NOT NULL THEN N'Combo: Hàng khách quen (Hết hàng)'
                    WHEN BC.ItemID IS NOT NULL THEN N'Combo: Hàng bán chạy (Hết hàng)'
                    ELSE N'Gợi ý sẵn có (Hết hàng)'
                END AS LyDoGoiY
            FROM CF_ItemTbl I WITH (NOLOCK)
            LEFT JOIN #TonKho S ON I.ItemID = S.ItemID  
            LEFT JOIN #GiaThiTruong G ON I.ItemID = G.ItemID
            LEFT JOIN #KhachQuen KQ ON I.ItemID = KQ.ItemID
            LEFT JOIN #BanChay BC ON I.ItemID = BC.ItemID
            LEFT JOIN #TrongTam TT ON I.ItemID = TT.ItemID
            WHERE ISNULL(I.isDisable, 0) = 0
              AND ISNULL(I.ItemGroupID, '') NOT IN ('KM', 'DV', 'VT', 'BB', 'Vat Tu', 'Bao Bi', 'TUI')
              AND I.ItemID NOT LIKE 'BB%' AND I.ItemID NOT LIKE 'TUI%' AND I.ItemID NOT LIKE 'PB%' AND I.ItemID NOT LIKE 'NY%'
              AND (TT.ItemID IS NOT NULL OR KQ.ItemID IS NOT NULL OR BC.ItemID IS NOT NULL);
        END

        SELECT * FROM #KetQuaKichBan2 ORDER BY PriorityScore DESC, TonKho DESC;
        DROP TABLE #KetQuaKichBan2;
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
