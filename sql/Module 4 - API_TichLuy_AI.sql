CREATE OR ALTER PROCEDURE API_TichLuy_AI
   @Username   VARCHAR(50)   = '',
   @MaKhachHang  NVARCHAR(100) = '',
   @ProgramID  VARCHAR(50)   = '',
   @TuNgay   DATETIME      = NULL,
   @DenNgay     DATETIME      = NULL,
   @ItemIDs    NVARCHAR(MAX) = ''
AS
BEGIN
   SET NOCOUNT ON
    
    DECLARE @SYSBranchID VARCHAR(50) = ''
    DECLARE @SYSUserGroupID VARCHAR(50) = ''
    SELECT @SYSBranchID = COALESCE(BranchID, ''),
           @SYSUserGroupID = COALESCE(UserGroupID, '')
    FROM SY_User WITH (NOLOCK) WHERE UserName = @Username AND COALESCE(Disable, 0) = 0
   
    -- 1. KIỂM TRA QUYỀN
    IF NOT EXISTS (SELECT 1 FROM SY_User WITH (NOLOCK) WHERE UserName = @Username AND COALESCE(Disable, 0) = 0)
    BEGIN
        SELECT N'User không tồn tại hoặc đã bị khóa' AS Msg, 1 AS MsgType RETURN
    END

    IF UPPER(@SYSUserGroupID) <> 'ADMIN' AND @SYSBranchID = ''
    BEGIN
        SELECT N'Tài khoản chưa được cấp phạm vi chi nhánh.' AS Msg, 1 AS MsgType
        RETURN
    END


     -- SMART CUSTOMER RESOLUTION (NAME TO ID)
     IF @MaKhachHang <> '' AND NOT EXISTS (SELECT 1 FROM dbo.CF_ObjectTbl WHERE ObjectID = @MaKhachHang)
     BEGIN
         DECLARE @ResolvedID VARCHAR(50) = ''
         DECLARE @CleanSearch NVARCHAR(100) = dbo.ufn_clean_customer_name(@MaKhachHang)

         -- 1. Fast Path: Match by ObjectID or ObjectName directly without scalar function scan
         SELECT TOP 1 @ResolvedID = ObjectID 
         FROM dbo.CF_ObjectTbl 
         WHERE (ObjectID LIKE '%' + @CleanSearch + '%'
            OR ObjectName LIKE '%' + @CleanSearch + '%') AND (@SYSBranchID = '' OR BranchID = @SYSBranchID)
         ORDER BY 
             CASE WHEN ObjectID = @CleanSearch THEN 1
                  WHEN ObjectName = @CleanSearch THEN 2
                  WHEN ObjectName LIKE @CleanSearch + '%' THEN 3
                  ELSE 4
             END,
             COALESCE((SELECT MAX(DocumentDate) FROM AR_InvoiceTbl WHERE ObjectID = CF_ObjectTbl.ObjectID), '1900-01-01') DESC,
             LEN(ObjectName) ASC;

         -- 2. Slow Path: Fallback to heavy clean function scan only if Fast Path found nothing
         IF @ResolvedID = ''
         BEGIN
             SELECT TOP 1 @ResolvedID = ObjectID 
             FROM dbo.CF_ObjectTbl 
             WHERE (dbo.ufn_clean_customer_name(ObjectName) LIKE '%' + @CleanSearch + '%'
                OR ObjectID LIKE '%' + @CleanSearch + '%') AND (@SYSBranchID = '' OR BranchID = @SYSBranchID)
             ORDER BY 
                 CASE WHEN ObjectID = @CleanSearch THEN 1
                      WHEN dbo.ufn_clean_customer_name(ObjectName) = @CleanSearch THEN 2
                      WHEN dbo.ufn_clean_customer_name(ObjectName) LIKE @CleanSearch + '%' THEN 3
                      ELSE 4
                 END,
                 COALESCE((SELECT MAX(DocumentDate) FROM AR_InvoiceTbl WHERE ObjectID = CF_ObjectTbl.ObjectID), '1900-01-01') DESC,
                 LEN(ObjectName) ASC;
         END

         IF @ResolvedID <> ''
         BEGIN
             SET @MaKhachHang = @ResolvedID
         END
     END

     


    -- 2. XÁC ĐỊNH CHƯƠNG TRÌNH
    IF @ProgramID = ''
        SELECT TOP 1 @ProgramID = DocumentID FROM AR_SanPhamTrongTamTbl WITH (NOLOCK) ORDER BY ToDate DESC
    
    IF @TuNgay IS NULL OR @DenNgay IS NULL
        SELECT @TuNgay = FromDate, @DenNgay = ToDate FROM AR_SanPhamTrongTamTbl WITH (NOLOCK) WHERE DocumentID = @ProgramID


    -- 3. DANH SÁCH SẢN PHẨM TRỌNG TÂM
    SELECT DISTINCT ItemID INTO #TrongTam FROM (
        SELECT CAST(value AS VARCHAR(50)) AS ItemID FROM STRING_SPLIT(@ItemIDs, ',') WHERE @ItemIDs != ''
        UNION ALL
        SELECT ItemID FROM AR_SanPhamTrongTamDetailTbl WITH (NOLOCK) WHERE @ItemIDs = '' AND DocumentID = @ProgramID
    ) X


     -- 4. TỔNG MUA & TRẢ HÀNG TRỌNG TÂM (Tính cả hóa đơn & đơn nháp)
     SELECT I.ObjectID, SUM(I.TotalAmount) AS TongHoaDon INTO #HoaDon
     FROM (
         SELECT I.ObjectID, I.DocumentDate, I.BranchID, I.StatusID, D.ItemID, D.TotalAmount
         FROM AR_InvoiceTbl I WITH (NOLOCK) JOIN AR_InvoiceDetailTbl D WITH (NOLOCK) ON I.DocumentID = D.DocumentID
         UNION ALL
         SELECT O.ObjectID, O.DocumentDate, O.BranchID, O.StatusID, D.ItemID, D.TotalAmount
         FROM AR_OrderTbl O WITH (NOLOCK) JOIN AR_OrderDetailTbl D WITH (NOLOCK) ON O.DocumentID = D.DocumentID
     ) I
     JOIN #TrongTam T ON I.ItemID = T.ItemID
     WHERE I.DocumentDate BETWEEN @TuNgay AND @DenNgay AND ISNULL(I.StatusID, 0) != 10
       AND (@SYSBranchID = '' OR I.BranchID = @SYSBranchID)
     GROUP BY I.ObjectID


    SELECT R.ObjectID, SUM(D.TotalAmount) AS TongTraHang INTO #TraHang
    FROM AR_ReturnTbl R WITH (NOLOCK) JOIN AR_ReturnDetailTbl D WITH (NOLOCK) ON R.DocumentID = D.DocumentID
    JOIN #TrongTam T ON D.ItemID = T.ItemID
    WHERE R.DocumentDate BETWEEN @TuNgay AND @DenNgay AND (@SYSBranchID = '' OR R.BranchID = @SYSBranchID)
    GROUP BY R.ObjectID


   SELECT
       H.ObjectID,
       CAST(H.TongHoaDon - ISNULL(T.TongTraHang, 0) AS DECIMAL(18,2)) AS TongTichLuy
   INTO #TichLuy
   FROM #HoaDon H LEFT JOIN #TraHang T ON H.ObjectID = T.ObjectID


   -- ════════════════════════════════════════════════════
   -- KẾT QUẢ: TÍCH HỢP SÂU CÁC CỘT CHO ROBOT AI
   -- ════════════════════════════════════════════════════
   SELECT
       @ProgramID      AS ProgramID,
       KH.ObjectID,
       KH.ObjectName   AS TenCuaHang,
       CAST(ISNULL(TL.TongTichLuy, 0) AS BIGINT) AS TichLuyDatDuoc,
       
       -- Quà tặng hiện tại
       ISNULL((SELECT TOP 1 QuaTang FROM AR_PromotionGiftTbl WHERE DocumentID = @ProgramID AND TuDiem <= ISNULL(TL.TongTichLuy,0) ORDER BY TuDiem DESC), N'Chưa đạt quà') AS QuaDaDat,
       
       -- Số lượng quà
       CASE WHEN ISNULL(TL.TongTichLuy,0) >= 1000000 THEN (SELECT COUNT(*) FROM AR_PromotionGiftTbl WHERE DocumentID = @ProgramID AND TuDiem <= ISNULL(TL.TongTichLuy,0)) ELSE 0 END AS SoPhanQua,

       -- Mốc mục tiêu tiếp theo
       ISNULL((SELECT TOP 1 CAST(TuDiem AS BIGINT) FROM AR_PromotionGiftTbl WHERE DocumentID = @ProgramID AND TuDiem > ISNULL(TL.TongTichLuy,0) ORDER BY TuDiem ASC),
              (SELECT TOP 1 CAST(TuDiem AS BIGINT) FROM AR_PromotionGiftTbl WHERE DocumentID = @ProgramID ORDER BY TuDiem DESC)) AS MucTieu,
       
       -- Tiến độ %
       CASE
          WHEN EXISTS (SELECT 1 FROM AR_PromotionGiftTbl WHERE DocumentID = @ProgramID AND TuDiem > ISNULL(TL.TongTichLuy,0))
          THEN CAST(ISNULL(TL.TongTichLuy,0) * 100 / (SELECT TOP 1 TuDiem FROM AR_PromotionGiftTbl WHERE DocumentID = @ProgramID AND TuDiem > ISNULL(TL.TongTichLuy,0) ORDER BY TuDiem ASC) AS INT)
          ELSE 100
       END AS [Percentage],

       CASE
           WHEN EXISTS (SELECT 1 FROM AR_PromotionGiftTbl WHERE DocumentID = @ProgramID AND TuDiem > ISNULL(TL.TongTichLuy,0))
                THEN N'Thiếu ' + FORMAT((SELECT TOP 1 TuDiem FROM AR_PromotionGiftTbl WHERE DocumentID = @ProgramID AND TuDiem > ISNULL(TL.TongTichLuy,0) ORDER BY TuDiem ASC) - ISNULL(TL.TongTichLuy,0), 'N0') + N'đ để đạt mốc tiếp theo.'
           ELSE N'Tuyệt vời! Bạn đã đạt mốc quà cao nhất trong chương trình.'
       END AS LoiNhacAI

   FROM CF_ObjectTbl KH
   LEFT JOIN #TichLuy TL ON KH.ObjectID = TL.ObjectID
   WHERE (@MaKhachHang != '' AND KH.ObjectID = @MaKhachHang)
      OR (@MaKhachHang = '' AND EXISTS (SELECT 1 FROM AR_PromotionGiftTbl G WHERE G.DocumentID = @ProgramID AND ISNULL(TL.TongTichLuy,0) >= G.TuDiem * 0.7))
   ORDER BY ISNULL(TL.TongTichLuy,0) DESC;


   -- ════════════════════════════════════════════════════
   -- BẢNG 2: SẢN PHẨM TRỌNG TÂM CHƯA PHÁT SINH DOANH SỐ (GỢI Ý)
   -- ════════════════════════════════════════════════════
   IF @MaKhachHang != ''
   BEGIN
       SELECT DISTINCT I.ItemID
       INTO #ItemsBought
       FROM (
           SELECT I.ObjectID, I.DocumentDate, I.StatusID, D.ItemID
           FROM AR_InvoiceTbl I JOIN AR_InvoiceDetailTbl D ON I.DocumentID = D.DocumentID
           UNION ALL
           SELECT O.ObjectID, O.DocumentDate, O.StatusID, D.ItemID
           FROM AR_OrderTbl O JOIN AR_OrderDetailTbl D ON O.DocumentID = D.DocumentID
       ) I
       WHERE I.ObjectID = @MaKhachHang 
         AND I.DocumentDate BETWEEN @TuNgay AND @DenNgay
         AND ISNULL(I.StatusID, 0) != 10
         AND I.ItemID IN (SELECT ItemID FROM #TrongTam)

       SELECT TOP 12
           I.ItemID,
           I.ItemName,
           I.Unit
       FROM #TrongTam T
       JOIN CF_ItemTbl I ON T.ItemID = I.ItemID
       WHERE NOT EXISTS (SELECT 1 FROM #ItemsBought DM WHERE DM.ItemID = T.ItemID)
       ORDER BY I.ItemName ASC

       DROP TABLE #ItemsBought
   END
   ELSE
   BEGIN
       SELECT TOP 0 '' AS ItemID, '' AS ItemName, '' AS Unit
   END


   DROP TABLE #HoaDon; DROP TABLE #TraHang; DROP TABLE #TrongTam; DROP TABLE #TichLuy;
END
GO

/* -- TEST SCRIPT --
-- Kịch bản 1: Tra cứu tích lũy và gợi ý hàng chưa mua cho 1 khách
EXEC API_TichLuy_AI @Username = 'admin', @MaKhachHang = 'KH001';

-- Kịch bản 2: Tra cứu tổng hợp toàn bộ các khách hàng tiềm năng
EXEC API_TichLuy_AI @Username = 'admin', @MaKhachHang = '';
*/
