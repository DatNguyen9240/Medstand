CREATE OR ALTER PROCEDURE API_SanPhamTrongTam_AI
    @Username   VARCHAR(50) = '',
    @MaKhachHang  VARCHAR(50) = '', -- Mã khách hàng
    @TopN       INT = 500         
AS
BEGIN
    SET NOCOUNT ON;

    IF NOT EXISTS (SELECT 1 FROM SY_User WHERE UserName = @Username AND COALESCE(Disable, 0) = 0)
    BEGIN
        SELECT N'User không tồn tại hoặc đã bị khóa' AS Msg, 1 AS MsgType
        RETURN
    END

    -- LOG FOR AUDITING
    EXEC AI_WriteAuditLog
        @Username     = @Username,
        @ActionType   = 'AI_QUERY',
        @TargetEntity = 'API_SanPhamTrongTam_AI',
        @TargetID     = @MaKhachHang,
        @TargetName   = NULL,
        @ExtraInfo    = NULL;

    -- Defend against NULL or non-positive bounds passed by web server binders
    IF @TopN IS NULL OR @TopN <= 0 SET @TopN = 500;


    -- 1. Xác định chương trình đang hoạt động
    DECLARE @ProgramID VARCHAR(50) = ''
    SELECT TOP 1 @ProgramID = DocumentID FROM AR_SanPhamTrongTamTbl
    WHERE GETDATE() BETWEEN FromDate AND ToDate OR ToDate >= CAST(GETDATE() AS DATE)
    ORDER BY ToDate DESC


    -- 2. Kết quả Bảng 1: TRẠNG THÁI & LỘ TRÌNH
    DECLARE @ProgramInfo TABLE (DocumentID VARCHAR(50), TenChuongTrinh NVARCHAR(200), FromDate DATETIME, ToDate DATETIME)
    INSERT INTO @ProgramInfo SELECT DocumentID, Memo, FromDate, ToDate FROM AR_SanPhamTrongTamTbl WHERE DocumentID = @ProgramID;

    -- Lấy thông tin từ ngày, đến ngày của chương trình
    DECLARE @TuNgay DATETIME, @DenNgay DATETIME
    SELECT @TuNgay = FromDate, @DenNgay = ToDate FROM AR_SanPhamTrongTamTbl WHERE DocumentID = @ProgramID

    -- Lấy BranchID của User để phân quyền
    DECLARE @SYSBranchID VARCHAR(50) = ''
    DECLARE @SYSUserGroupID VARCHAR(50) = ''
    SELECT @SYSBranchID = COALESCE(BranchID, ''),
           @SYSUserGroupID = COALESCE(UserGroupID, '')
    FROM SY_User WHERE UserName = @Username AND COALESCE(Disable, 0) = 0

    IF UPPER(@SYSUserGroupID) <> 'ADMIN' AND @SYSBranchID = ''
    BEGIN
        SELECT N'Tài khoản chưa được cấp phạm vi chi nhánh.' AS Msg, 1 AS MsgType
        RETURN
    END

    -- Danh sách sản phẩm trọng tâm
    SELECT DISTINCT ItemID INTO #TrongTam FROM AR_SanPhamTrongTamDetailTbl WHERE DocumentID = @ProgramID

    -- Tính tổng mua từ hóa đơn và đơn hàng nháp (StatusID != 10)
    DECLARE @TongHoaDon DECIMAL(18,2) = 0
    SELECT @TongHoaDon = ISNULL(SUM(I.TotalAmount), 0)
    FROM (
        SELECT I.ObjectID, I.DocumentDate, I.BranchID, I.StatusID, D.ItemID, D.TotalAmount
        FROM AR_InvoiceTbl I JOIN AR_InvoiceDetailTbl D ON I.DocumentID = D.DocumentID
        UNION ALL
        SELECT O.ObjectID, O.DocumentDate, O.BranchID, O.StatusID, D.ItemID, D.TotalAmount
        FROM AR_OrderTbl O JOIN AR_OrderDetailTbl D ON O.DocumentID = D.DocumentID
    ) I
    JOIN #TrongTam T ON I.ItemID = T.ItemID
    WHERE I.ObjectID = @MaKhachHang
      AND I.DocumentDate BETWEEN @TuNgay AND @DenNgay 
      AND ISNULL(I.StatusID, 0) != 10
      AND (@SYSBranchID = '' OR I.BranchID = @SYSBranchID)

    -- Tính tổng trả hàng trọng tâm
    DECLARE @TongTraHang DECIMAL(18,2) = 0
    SELECT @TongTraHang = ISNULL(SUM(D.TotalAmount), 0)
    FROM AR_ReturnTbl R 
    JOIN AR_ReturnDetailTbl D ON R.DocumentID = D.DocumentID
    JOIN #TrongTam T ON D.ItemID = T.ItemID
    WHERE R.ObjectID = @MaKhachHang
      AND R.DocumentDate BETWEEN @TuNgay AND @DenNgay 
      AND (@SYSBranchID = '' OR R.BranchID = @SYSBranchID)

    -- Doanh số tích lũy thực tế
    DECLARE @CurrentSales BIGINT = 0;
    SET @CurrentSales = CAST(ISNULL(@TongHoaDon - @TongTraHang, 0) AS BIGINT)

    DROP TABLE #TrongTam;

    -- Nén thang quà tặng thành chuỗi mũi tên trực quan
    DECLARE @GiftLadder NVARCHAR(MAX) = ''
    SET @GiftLadder = STUFF((
        SELECT ' -> [' + CAST(CAST(TuDiem AS BIGINT) AS VARCHAR(20)) + ': ' + QuaTang + ']'
        FROM AR_PromotionGiftTbl
        WHERE DocumentID = @ProgramID
        ORDER BY TuDiem ASC
        FOR XML PATH(''), TYPE).value('.', 'NVARCHAR(MAX)'), 1, 4, '')

    ;WITH NextGoal AS (
        SELECT TOP 1 TuDiem, QuaTang FROM AR_PromotionGiftTbl
        WHERE DocumentID = @ProgramID AND TuDiem > @CurrentSales ORDER BY TuDiem ASC
    )
    SELECT 
        P.TenChuongTrinh AS [Chương Trình],
        P.FromDate AS [Từ Ngày], P.ToDate AS [Đến Ngày],
        @MaKhachHang AS [Mã Khách], 
        @CurrentSales AS [Doanh Số Hiện Tại],
        CAST(ISNULL(G.TuDiem, 0) AS BIGINT) AS [Mốc Kế Tiếp],
        CASE WHEN G.TuDiem IS NOT NULL THEN CAST(G.TuDiem - @CurrentSales AS BIGINT) ELSE 0 END AS [Còn Thiếu],
        ISNULL(G.QuaTang, N'Đã đạt mốc cao nhất') AS [Quà Kế Tiếp],
        ISNULL(@GiftLadder, N'') AS [Thang Quà Tặng Toàn Bộ]
    FROM @ProgramInfo P
    LEFT JOIN NextGoal G ON 1=1;


    -- 3. Kết quả Bảng 2: DANH MỤC SẢN PHẨM TRỌNG TÂM
    SELECT TOP (@TopN)
        D.ItemID AS [Mã sp], 
        I.ItemName AS [Sản Phẩm], 
        I.Unit AS [ĐVT],
        ISNULL((SELECT SUM(QuantityinStock) FROM IV_StockTbl WHERE ItemID = D.ItemID), 0) AS [Tồn Kho],
        CAST(ISNULL((
            SELECT TOP 1 P.UnitPrice FROM AR_PriceDetailTbl P 
            JOIN AR_PriceTbl H ON P.DocumentID = H.DocumentID
            WHERE P.ItemID = D.ItemID AND H.isDisable = 0 AND H.FromDate <= GETDATE()
            ORDER BY H.FromDate DESC
        ), 0) AS BIGINT) AS [Giá Bán]
    FROM AR_SanPhamTrongTamDetailTbl D
    JOIN CF_ItemTbl I ON D.ItemID = I.ItemID
    WHERE D.DocumentID = @ProgramID
      AND ISNULL(I.ItemGroupID, '') NOT IN ('KM', 'DV', 'VT', 'BB', 'Vat Tu', 'Bao Bi', 'TUI')
      AND I.ItemID NOT LIKE 'BB%' AND I.ItemID NOT LIKE 'TUI%' AND I.ItemID NOT LIKE 'PB%' AND I.ItemID NOT LIKE 'NY%'
    ORDER BY I.ItemName ASC;
END
GO
