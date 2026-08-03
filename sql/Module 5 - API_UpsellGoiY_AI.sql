CREATE OR ALTER PROCEDURE API_UpsellGoiY_AI
    @Username     VARCHAR(50)   = '',
    @MaKhachHang  NVARCHAR(100) = '',
    @timkiem      NVARCHAR(50)  = '',      
    @TopN         INT           = 10
AS
BEGIN
    SET NOCOUNT ON

    -- ═══ GUARD: dọn temp table còn sót lại từ request lỗi trước trên cùng connection ═══
    IF OBJECT_ID('tempdb..#TrongTam') IS NOT NULL DROP TABLE #TrongTam;
    IF OBJECT_ID('tempdb..#LatestPriceHeader') IS NOT NULL DROP TABLE #LatestPriceHeader;
    IF OBJECT_ID('tempdb..#GiaThiTruong') IS NOT NULL DROP TABLE #GiaThiTruong;
    IF OBJECT_ID('tempdb..#KhachQuen') IS NOT NULL DROP TABLE #KhachQuen;
    IF OBJECT_ID('tempdb..#BanChay') IS NOT NULL DROP TABLE #BanChay;
    IF OBJECT_ID('tempdb..#TonKho') IS NOT NULL DROP TABLE #TonKho;
    IF OBJECT_ID('tempdb..#KetQuaKichBan1') IS NOT NULL DROP TABLE #KetQuaKichBan1;
    IF OBJECT_ID('tempdb..#KetQuaKichBan2') IS NOT NULL DROP TABLE #KetQuaKichBan2;

    -- Defend against NULL or non-positive bounds passed by web server binders
    IF @TopN IS NULL OR @TopN <= 0 SET @TopN = 10;

    -- ═══ Validate User ═══
    IF NOT EXISTS (SELECT 1 FROM SY_User WHERE UserName = @Username AND COALESCE(Disable, 0) = 0)
    BEGIN
        SELECT N'User không tồn tại hoặc đã bị khóa' AS Msg, 1 AS MsgType
        RETURN
    END

    DECLARE @SYSBranchID VARCHAR(50) = ''
    DECLARE @SYSUserGroupID VARCHAR(50) = ''
    DECLARE @EmployeeID VARCHAR(50) = ''
    DECLARE @IsGlobal BIT = 0
    DECLARE @IsManager BIT = 0
    DECLARE @AllowedStores TABLE (StoreHouseID VARCHAR(50) PRIMARY KEY)
    DECLARE @StockAsOfUtc DATETIME2(0) = SYSUTCDATETIME()
    DECLARE @StockRuleVersion VARCHAR(30) = NULL
    SELECT @SYSBranchID = COALESCE(BranchID, ''),
           @SYSUserGroupID = COALESCE(UserGroupID, ''),
           @EmployeeID = COALESCE(EmployeeID, ''),
           @IsGlobal = CASE WHEN UPPER(COALESCE(UserGroupID, '')) IN ('ADMIN', 'SADM', 'BGD', 'GD') THEN 1 ELSE 0 END,
           @IsManager = CASE WHEN COALESCE(Manager, 0) = 1 OR UPPER(COALESCE(UserGroupID, '')) = 'QL' THEN 1 ELSE 0 END
    FROM SY_User WHERE UserName = @Username AND COALESCE(Disable, 0) = 0

    IF UPPER(@SYSUserGroupID) <> 'ADMIN' AND @SYSBranchID = ''
    BEGIN
        SELECT N'Tài khoản chưa được cấp phạm vi chi nhánh.' AS Msg, 1 AS MsgType
        RETURN
    END

    INSERT INTO @AllowedStores (StoreHouseID)
    SELECT StoreHouseID
    FROM dbo.AI_WarehouseByUserFnc(@Username, @StockAsOfUtc);

    SELECT TOP (1) @StockRuleVersion = RuleVersion
    FROM dbo.AI_WarehouseByUserFnc(@Username, @StockAsOfUtc);

    IF NOT EXISTS (SELECT 1 FROM @AllowedStores)
    BEGIN
        SELECT N'Tài khoản chưa được phân quyền kho.' AS Msg, 1 AS MsgType;
        RETURN;
    END

    SET @MaKhachHang = LTRIM(RTRIM(COALESCE(@MaKhachHang, '')));

    -- Upsell là gợi ý riêng cho từng khách hàng. Không được rơi xuống danh sách
    -- bán chạy/sản phẩm trọng tâm chung khi caller chưa chọn khách.
    IF @MaKhachHang = ''
    BEGIN
        SELECT
            N'Vui lòng chọn khách hàng để gợi ý bán kèm.' AS Msg,
            1 AS MsgType,
            N'VALIDATION_ERROR' AS Severity,
            N'MISSING_CUSTOMER' AS Code;
        RETURN;
    END

    DECLARE @DoanhSoHienTai FLOAT = 0
    DECLARE @MucTarget      FLOAT = 0
    DECLARE @SoTienThieu    FLOAT = 0
    DECLARE @ProgramID      VARCHAR(50) = ''

    -- TỰ ĐỘNG KHẮC PHỤC TÊN KHÁCH HÀNG / ẢO GIÁC:
    IF @MaKhachHang <> '' AND NOT EXISTS (SELECT 1 FROM CF_ObjectTbl WHERE ObjectID = @MaKhachHang)
    BEGIN
        DECLARE @ResolvedID VARCHAR(50) = '';
        
        -- Lấy ']' đầu tiên NẰM SAU '[' để không sinh độ dài âm cho SUBSTRING (Msg 536)
        DECLARE @BracketOpen  INT = CHARINDEX('[', @MaKhachHang);
        DECLARE @BracketClose INT = CHARINDEX(']', @MaKhachHang, @BracketOpen + 1);
        IF @BracketOpen > 0 AND @BracketClose > @BracketOpen
        BEGIN
            SET @MaKhachHang = SUBSTRING(@MaKhachHang, @BracketOpen + 1, @BracketClose - @BracketOpen - 1);
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
              
            -- Fallback tìm toàn quốc (chỉ chạy cho admin)
            IF @ResolvedID = '' AND UPPER(@SYSUserGroupID) = 'ADMIN'
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

    -- RLS GUARD: Non-global users must pass both the explicit branch boundary and
    -- the ERP customer-scope function. The branch check prevents a broad ERP
    -- function result from exposing a customer in another region.
    IF @MaKhachHang <> '' AND @Username <> '' AND @IsGlobal = 0 AND (
        NOT EXISTS (
            SELECT 1
            FROM dbo.CF_ObjectTbl O WITH (NOLOCK)
            WHERE O.ObjectID = @MaKhachHang
              AND O.BranchID = @SYSBranchID
        )
        OR NOT EXISTS (
            SELECT 1
            FROM dbo.AR_GetObjectByUserFnc(@Username)
            WHERE ObjectID = @MaKhachHang
        )
    )
    BEGIN
        SELECT
            N'Bạn không có quyền xem thông tin của khách hàng này.' AS Msg,
            1 AS MsgType,
            N'OUT_OF_SCOPE' AS Severity,
            N'CUSTOMER_OUT_OF_SCOPE' AS Code;
        RETURN;
    END

    -- LOG FOR AUDITING
    EXEC AI_WriteAuditLog
        @Username     = @Username,
        @ActionType   = 'AI_QUERY',
        @TargetEntity = 'API_UpsellGoiY_AI',
        @TargetID     = @MaKhachHang,
        @TargetName   = @timkiem,
        @ExtraInfo    = NULL;

    -- ═══ 1. Xác định chương trình đang hoạt động ═══
    SELECT TOP 1 @ProgramID = DocumentID 
    FROM AR_SanPhamTrongTamTbl WITH (NOLOCK)
    WHERE GETDATE() BETWEEN FromDate AND ToDate
    ORDER BY ToDate DESC;

    -- ═══ 2. Doanh số hiện tại của khách trong tháng (chỉ hóa đơn hợp lệ) ═══
    SELECT @DoanhSoHienTai = ISNULL(SUM(I.TotalAmount), 0)
    FROM (
        SELECT I.ObjectID, I.DocumentDate, I.BranchID, I.StatusID, D.TotalAmount
        FROM AR_InvoiceTbl I WITH (NOLOCK) JOIN AR_InvoiceDetailTbl D WITH (NOLOCK) ON I.DocumentID = D.DocumentID
    ) I
    WHERE I.ObjectID = @MaKhachHang
      AND I.StatusID IN (3, 6, 7, 8)
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

    -- ═══ 3.5. Danh sách sản phẩm trọng tâm ═══
    SELECT DISTINCT ItemID INTO #TrongTam 
    FROM AR_SanPhamTrongTamDetailTbl WITH (NOLOCK) 
    WHERE DocumentID = @ProgramID;

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
      AND I.StatusID IN (3, 6, 7, 8)
      AND I.DocumentDate >= DATEADD(MONTH, -6, GETDATE())
    GROUP BY D.ItemID;

    -- UAT FALLBACK: Lấy tất cả lịch sử mua
    IF NOT EXISTS (SELECT 1 FROM #KhachQuen)
    BEGIN
        INSERT INTO #KhachQuen (ItemID, TanSuatMua)
        SELECT D.ItemID, COUNT(DISTINCT I.DocumentID) AS TanSuatMua
        FROM AR_InvoiceTbl I WITH (NOLOCK) JOIN AR_InvoiceDetailTbl D WITH (NOLOCK) ON I.DocumentID = D.DocumentID
        WHERE I.ObjectID = @MaKhachHang 
          AND I.StatusID IN (3, 6, 7, 8)
        GROUP BY D.ItemID;
    END

    -- ═══ 6. Top 50 bán chạy tại chi nhánh ═══
    IF NOT EXISTS (SELECT 1 FROM #KhachQuen)
    BEGIN
        DECLARE @UpsellCustomerName NVARCHAR(500) = NULL;
        SELECT @UpsellCustomerName = ObjectName
        FROM dbo.CF_ObjectTbl WITH (NOLOCK)
        WHERE ObjectID = @MaKhachHang;

        SELECT CONCAT(
                   N'Khách ', COALESCE(NULLIF(@UpsellCustomerName, ''), @MaKhachHang),
                   N' là khách mới hoặc chưa đủ lịch sử mua hàng. Hệ thống chưa gợi ý bán kèm riêng để tránh tư vấn sai. Hãy hỏi sản phẩm khách đang quan tâm, sau đó tìm sản phẩm liên quan và kiểm tra tồn kho trước khi bán.'
               ) AS Msg,
               0 AS MsgType,
               N'NO_DATA' AS Severity,
               N'NO_CUSTOMER_PURCHASE_HISTORY' AS Code;

        DROP TABLE #GiaThiTruong;
        DROP TABLE #KhachQuen;
        DROP TABLE #LatestPriceHeader;
        DROP TABLE #TrongTam;
        RETURN;
    END

    SELECT TOP 50 D.ItemID, SUM(D.TotalAmount) AS DoanhSoChiNhanh
    INTO #BanChay 
    FROM AR_InvoiceTbl I WITH (NOLOCK) JOIN AR_InvoiceDetailTbl D WITH (NOLOCK) ON I.DocumentID = D.DocumentID
    WHERE I.DocumentDate >= DATEADD(DAY, -180, GETDATE()) 
      AND I.StatusID IN (3, 6, 7, 8)
      AND (@SYSBranchID = '' OR I.BranchID = @SYSBranchID)
    GROUP BY D.ItemID;

    -- UAT FALLBACK: Lấy top bán chạy mọi thời đại
    IF NOT EXISTS (SELECT 1 FROM #BanChay)
    BEGIN
        INSERT INTO #BanChay (ItemID, DoanhSoChiNhanh)
        SELECT TOP 50 D.ItemID, SUM(D.TotalAmount) AS DoanhSoChiNhanh
        FROM AR_InvoiceTbl I WITH (NOLOCK) JOIN AR_InvoiceDetailTbl D WITH (NOLOCK) ON I.DocumentID = D.DocumentID
        WHERE I.StatusID IN (3, 6, 7, 8)
          AND (@SYSBranchID = '' OR I.BranchID = @SYSBranchID)
        GROUP BY D.ItemID
        ORDER BY DoanhSoChiNhanh DESC;
    END

    -- STOCK-001: chọn đúng một kho được cấp có tồn khả dụng cao nhất cho mỗi sản phẩm.
    SELECT ItemID, StoreHouseID, StoreHouseName,
           PhysicalStock, ReservedStock,
           AvailableStock AS QuantityinStock,
           WarehouseScope, StockDataStatus,
           StockUpdatedAt, StockAsOfAt, LatestStockMovementDate,
           StockDataSource, RuleVersion
    INTO #TonKho
    FROM
    (
        SELECT S.*,
               ROW_NUMBER() OVER
               (
                   PARTITION BY S.ItemID
                   ORDER BY S.AvailableStock DESC, S.StoreHouseID
               ) AS StockRank
        FROM dbo.AI_StockAvailableByUserFnc(@Username, '', @StockAsOfUtc) S
        WHERE S.AvailableStock > 0
    ) RankedStock
    WHERE StockRank = 1;

    -- ═══ 7.5. Danh sách sản phẩm trọng tâm     -- Chuẩn hóa các liên từ nối tiếng Việt thành khoảng trắng/dấu phẩy đề phòng n8n chưa xử lý
    SET @timkiem = REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(@timkiem, N' cùng với ', ','), N' Cùng với ', ','), N' đi kèm ', ','), N' Đi kèm ', ','), N' và ', ','), N' Và ', ',');
    
    -- Map common symptoms to accent-free keywords matching 'An ngủ ngon Medstand'
    IF @timkiem LIKE N'%mất ngủ%' OR @timkiem LIKE N'%mat ngu%' OR @timkiem LIKE N'%ngủ%'
    BEGIN
        SET @timkiem = @timkiem + N' ngon'
    END
    IF @timkiem LIKE N'%mệt mỏi%' OR @timkiem LIKE N'%met moi%' OR @timkiem LIKE N'%mệt%'
    BEGIN
        SET @timkiem = @timkiem + N' ngon'
    END
    IF @timkiem LIKE N'%lười ăn%' OR @timkiem LIKE N'%luoi an%' 
       OR @timkiem LIKE N'%biếng ăn%' OR @timkiem LIKE N'%bieng an%'
       OR @timkiem LIKE N'%chán ăn%' OR @timkiem LIKE N'%chan an%'
       OR @timkiem LIKE N'%kén ăn%' OR @timkiem LIKE N'%ken an%'
       OR @timkiem LIKE N'%ăn kém%' OR @timkiem LIKE N'%an kem%'
       OR @timkiem LIKE N'%ăn ngon%' OR @timkiem LIKE N'%an ngon%'
    BEGIN
        SET @timkiem = @timkiem + N' ngon'
    END
    SET @timkiem = REPLACE(REPLACE(REPLACE(REPLACE(@timkiem, N' với ', ','), N' Với ', ','), N' & ', ','), N' + ', ',');

    -- Xử lý triệt để dấu câu và khoảng trắng dư thừa
    SET @timkiem = LTRIM(RTRIM(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(@timkiem, '.', ''), ',', ''), '-', ''), '"', ''), '''', '')));

    -- Loại bỏ từ khóa chung chung (stop words) nếu chỉ tìm kiếm duy nhất từ đó để tránh khớp sai vào Thuốc ho
    IF LOWER(@timkiem) IN (
        N'thuốc', N'thuoc', 
        N'uống', N'uong', 
        N'bác sĩ', N'bac si', N'bác sỹ', N'bac sy',
        N'cho', N'trị', N'tri', N'điều trị', N'dieu tri',
        N'bệnh', N'benh', N'bị', N'bi',
        N'em', N'bé', N'be', N'trẻ', N'tre', N'con',
        N'tui', N'tôi', N'toi', N'gì', N'gi', N'nào', N'nao',
        N'uống thuốc', N'uong thuoc'
    ) OR LEN(@timkiem) <= 1
    BEGIN
        SET @timkiem = '';
    END

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
            ISNULL(S.PhysicalStock, 0)                 AS PhysicalStock,
            ISNULL(S.ReservedStock, 0)                 AS ReservedStock,
            ISNULL(S.QuantityinStock, 0)               AS AvailableStock,
            S.StoreHouseID,
            S.StoreHouseName,
            S.WarehouseScope,
            S.StockDataStatus,
            S.StockUpdatedAt,
            S.StockAsOfAt,
            S.LatestStockMovementDate,
            S.StockDataSource,
            S.RuleVersion                              AS StockRuleVersion,
            (
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
                    WHERE N' ' + REPLACE(REPLACE(REPLACE(I.ItemName COLLATE Vietnamese_CI_AS, ',', ' '), '.', ' '), '-', ' ') + N' ' LIKE N'% ' + T.Term + N' %' 
                       OR N' ' + REPLACE(REPLACE(REPLACE(ISNULL(I.TuKhoa,'') COLLATE Vietnamese_CI_AS, ',', ' '), '.', ' '), '-', ' ') + N' ' LIKE N'% ' + T.Term + N' %'
                ), 0)
            ) AS PriorityScore,
            N'Triệu chứng: ' + @timkiem + N' | Có thể bán theo kho được phân quyền' AS LyDoGoiY,
            N'LEGACY_UPSELL_DRAFT' AS RuleSource,
            N'BR-UPSELL-V1-DRAFT' AS RuleVersion
        INTO #KetQuaKichBan1
        FROM CF_ItemTbl I WITH (NOLOCK)
        LEFT JOIN #TonKho S ON I.ItemID = S.ItemID  
        LEFT JOIN #GiaThiTruong G ON I.ItemID = G.ItemID
        WHERE ISNULL(I.isDisable, 0) = 0
          AND CASE WHEN @SYSBranchID = 'MB' THEN COALESCE(I.IsDisableMB, 0)
                   WHEN @SYSBranchID = 'MN' THEN COALESCE(I.IsDisableMN, 0)
                   ELSE CASE WHEN COALESCE(I.IsDisableMB, 0) = 0 OR COALESCE(I.IsDisableMN, 0) = 0 THEN 0 ELSE 1 END
              END = 0
          AND EXISTS
          (
              SELECT 1
              FROM dbo.AI_BusinessRuleConfigTbl C
              CROSS APPLY STRING_SPLIT(C.ConfigValue, ',') V
              WHERE C.RuleCode = 'BR-STOCK-001'
                AND C.RuleVersion = @StockRuleVersion
                AND C.ConfigKey = 'SellableItemGroupIDs'
                AND LTRIM(RTRIM(V.value)) = I.ItemGroupID
          )
          AND ISNULL(I.ItemGroupID, '') NOT IN ('KM', 'DV', 'VT', 'BB', 'Vat Tu', 'Bao Bi', 'TUI')
          AND I.ItemID NOT LIKE 'BB%' AND I.ItemID NOT LIKE 'TUI%' AND I.ItemID NOT LIKE 'PB%' AND I.ItemID NOT LIKE 'NY%'
          AND ISNULL(S.QuantityinStock, 0) > 0
          AND ISNULL(G.GiaHienTai, 0) > 0
          AND (
              I.ItemName COLLATE Vietnamese_CI_AS LIKE N'%'+@timkiem+N'%' OR 
              I.TuKhoa COLLATE Vietnamese_CI_AS LIKE N'%'+@timkiem+N'%' OR
              EXISTS (
                  SELECT 1 FROM @Terms T 
                  WHERE N' ' + REPLACE(REPLACE(REPLACE(I.ItemName COLLATE Vietnamese_CI_AS, ',', ' '), '.', ' '), '-', ' ') + N' ' LIKE N'% ' + T.Term + N' %' 
                     OR N' ' + REPLACE(REPLACE(REPLACE(ISNULL(I.TuKhoa,'') COLLATE Vietnamese_CI_AS, ',', ' '), '.', ' '), '-', ' ') + N' ' LIKE N'% ' + T.Term + N' %'
              )
          )
        ORDER BY PriorityScore DESC;

        -- Fallback nếu không tìm thấy gì
        IF NOT EXISTS (SELECT 1 FROM #KetQuaKichBan1)
        BEGIN
            SELECT 
                N'Không tìm thấy sản phẩm liên quan còn tồn khả dụng và có giá bán.' AS Msg,
                0 AS MsgType,
                N'NO_DATA' AS Severity,
                N'NO_SELLABLE_STOCK' AS Code;
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
            ISNULL(S.PhysicalStock, 0)                 AS PhysicalStock,
            ISNULL(S.ReservedStock, 0)                 AS ReservedStock,
            ISNULL(S.QuantityinStock, 0)               AS AvailableStock,
            S.StoreHouseID,
            S.StoreHouseName,
            S.WarehouseScope,
            S.StockDataStatus,
            S.StockUpdatedAt,
            S.StockAsOfAt,
            S.LatestStockMovementDate,
            S.StockDataSource,
            S.RuleVersion                              AS StockRuleVersion,
            (
                (CASE WHEN TT.ItemID IS NOT NULL THEN 300000 ELSE 0 END) +
                (CASE WHEN BC.ItemID IS NOT NULL THEN 100000 ELSE 0 END) +
                (CASE WHEN KQ.ItemID IS NOT NULL THEN 500 ELSE 0 END)
            ) AS PriorityScore,
            CASE
                WHEN TT.ItemID IS NOT NULL THEN N'Hàng TRỌNG TÂM - Cần đẩy!'
                WHEN KQ.ItemID IS NOT NULL THEN N'Combo: Hàng khách quen'
                WHEN BC.ItemID IS NOT NULL THEN N'Combo: Hàng bán chạy'
                ELSE N'Gợi ý sẵn có'
            END + N' | Có thể bán theo kho được phân quyền' AS LyDoGoiY,
            N'LEGACY_UPSELL_DRAFT' AS RuleSource,
            N'BR-UPSELL-V1-DRAFT' AS RuleVersion
        INTO #KetQuaKichBan2
        FROM CF_ItemTbl I WITH (NOLOCK)
        LEFT JOIN #TonKho S ON I.ItemID = S.ItemID  
        LEFT JOIN #GiaThiTruong G ON I.ItemID = G.ItemID
        LEFT JOIN #KhachQuen KQ ON I.ItemID = KQ.ItemID
        LEFT JOIN #BanChay BC ON I.ItemID = BC.ItemID
        LEFT JOIN #TrongTam TT ON I.ItemID = TT.ItemID
        WHERE ISNULL(I.isDisable, 0) = 0
          AND CASE WHEN @SYSBranchID = 'MB' THEN COALESCE(I.IsDisableMB, 0)
                   WHEN @SYSBranchID = 'MN' THEN COALESCE(I.IsDisableMN, 0)
                   ELSE CASE WHEN COALESCE(I.IsDisableMB, 0) = 0 OR COALESCE(I.IsDisableMN, 0) = 0 THEN 0 ELSE 1 END
              END = 0
          AND EXISTS
          (
              SELECT 1
              FROM dbo.AI_BusinessRuleConfigTbl C
              CROSS APPLY STRING_SPLIT(C.ConfigValue, ',') V
              WHERE C.RuleCode = 'BR-STOCK-001'
                AND C.RuleVersion = @StockRuleVersion
                AND C.ConfigKey = 'SellableItemGroupIDs'
                AND LTRIM(RTRIM(V.value)) = I.ItemGroupID
          )
          AND ISNULL(I.ItemGroupID, '') NOT IN ('KM', 'DV', 'VT', 'BB', 'Vat Tu', 'Bao Bi', 'TUI')
          AND I.ItemID NOT LIKE 'BB%' AND I.ItemID NOT LIKE 'TUI%' AND I.ItemID NOT LIKE 'PB%' AND I.ItemID NOT LIKE 'NY%'
          AND ISNULL(S.QuantityinStock, 0) > 0
          AND ISNULL(G.GiaHienTai, 0) > 0
          AND (TT.ItemID IS NOT NULL OR KQ.ItemID IS NOT NULL OR BC.ItemID IS NOT NULL);

        -- Fallback khi không có sản phẩm thuộc các nhóm trọng tâm/khách quen/bán chạy.
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
                ISNULL(S.PhysicalStock, 0)                 AS PhysicalStock,
                ISNULL(S.ReservedStock, 0)                 AS ReservedStock,
                ISNULL(S.QuantityinStock, 0)               AS AvailableStock,
                S.StoreHouseID,
                S.StoreHouseName,
                S.WarehouseScope,
                S.StockDataStatus,
                S.StockUpdatedAt,
                S.StockAsOfAt,
                S.LatestStockMovementDate,
                S.StockDataSource,
                S.RuleVersion                              AS StockRuleVersion,
                (
                    (CASE WHEN TT.ItemID IS NOT NULL THEN 300000 ELSE 0 END) +
                    (CASE WHEN BC.ItemID IS NOT NULL THEN 100000 ELSE 0 END) +
                    (CASE WHEN KQ.ItemID IS NOT NULL THEN 500 ELSE 0 END)
                ) AS PriorityScore,
                CASE
                    WHEN TT.ItemID IS NOT NULL THEN N'Hàng TRỌNG TÂM'
                    WHEN KQ.ItemID IS NOT NULL THEN N'Combo: Hàng khách quen'
                    WHEN BC.ItemID IS NOT NULL THEN N'Combo: Hàng bán chạy'
                    ELSE N'Gợi ý sẵn có'
                END + N' | Có thể bán theo kho được phân quyền' AS LyDoGoiY,
                N'LEGACY_UPSELL_DRAFT' AS RuleSource,
                N'BR-UPSELL-V1-DRAFT' AS RuleVersion
            FROM CF_ItemTbl I WITH (NOLOCK)
            LEFT JOIN #TonKho S ON I.ItemID = S.ItemID  
            LEFT JOIN #GiaThiTruong G ON I.ItemID = G.ItemID
            LEFT JOIN #KhachQuen KQ ON I.ItemID = KQ.ItemID
            LEFT JOIN #BanChay BC ON I.ItemID = BC.ItemID
            LEFT JOIN #TrongTam TT ON I.ItemID = TT.ItemID
            WHERE ISNULL(I.isDisable, 0) = 0
              AND CASE WHEN @SYSBranchID = 'MB' THEN COALESCE(I.IsDisableMB, 0)
                       WHEN @SYSBranchID = 'MN' THEN COALESCE(I.IsDisableMN, 0)
                       ELSE CASE WHEN COALESCE(I.IsDisableMB, 0) = 0 OR COALESCE(I.IsDisableMN, 0) = 0 THEN 0 ELSE 1 END
                  END = 0
              AND EXISTS
              (
                  SELECT 1
                  FROM dbo.AI_BusinessRuleConfigTbl C
                  CROSS APPLY STRING_SPLIT(C.ConfigValue, ',') V
                  WHERE C.RuleCode = 'BR-STOCK-001'
                    AND C.RuleVersion = @StockRuleVersion
                    AND C.ConfigKey = 'SellableItemGroupIDs'
                    AND LTRIM(RTRIM(V.value)) = I.ItemGroupID
              )
              AND ISNULL(I.ItemGroupID, '') NOT IN ('KM', 'DV', 'VT', 'BB', 'Vat Tu', 'Bao Bi', 'TUI')
              AND I.ItemID NOT LIKE 'BB%' AND I.ItemID NOT LIKE 'TUI%' AND I.ItemID NOT LIKE 'PB%' AND I.ItemID NOT LIKE 'NY%'
              AND ISNULL(S.QuantityinStock, 0) > 0
              AND ISNULL(G.GiaHienTai, 0) > 0
              AND (TT.ItemID IS NOT NULL OR KQ.ItemID IS NOT NULL OR BC.ItemID IS NOT NULL);
        END

        IF NOT EXISTS (SELECT 1 FROM #KetQuaKichBan2)
        BEGIN
            SELECT N'Không có sản phẩm còn tồn khả dụng và có giá bán trong phạm vi kho của tài khoản.' AS Msg,
                   0 AS MsgType,
                   N'NO_DATA' AS Severity,
                   N'NO_SELLABLE_STOCK' AS Code;
        END
        ELSE
        BEGIN
            SELECT * FROM #KetQuaKichBan2 ORDER BY PriorityScore DESC, ItemID ASC;
        END
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
