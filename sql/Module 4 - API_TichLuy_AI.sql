IF OBJECT_ID('API_TichLuy_AI', 'P') IS NOT NULL DROP PROCEDURE API_TichLuy_AI;
GO

CREATE PROCEDURE API_TichLuy_AI
   @Username  VARCHAR(50)   = '',
   @ObjectID  VARCHAR(50)   = '',
   @ProgramID VARCHAR(50)   = '',
   @FromDate  DATETIME      = NULL,
   @ToDate    DATETIME      = NULL,
   @ItemIDs   NVARCHAR(MAX) = ''
AS
BEGIN
   SET NOCOUNT ON
   
   -- 1. KIỂM TRA QUYỀN
   IF NOT EXISTS (SELECT 1 FROM SY_User WHERE UserName = @Username AND COALESCE(Disable, 0) = 0)
   BEGIN
       SELECT N'User không tồn tại hoặc đã bị khóa' AS Msg, 1 AS MsgType RETURN
   END


   DECLARE @SYSBranchID VARCHAR(50) = ''
   SELECT @SYSBranchID = COALESCE(BranchID, '') FROM SY_User WHERE UserName = @Username


   -- 2. XÁC ĐỊNH CHƯƠNG TRÌNH
   IF @ProgramID = ''
       SELECT TOP 1 @ProgramID = DocumentID FROM AR_SanPhamTrongTamTbl ORDER BY ToDate DESC
   
   IF @FromDate IS NULL OR @ToDate IS NULL
       SELECT @FromDate = FromDate, @ToDate = ToDate FROM AR_SanPhamTrongTamTbl WHERE DocumentID = @ProgramID


   -- 3. DANH SÁCH SẢN PHẨM TRỌNG TÂM
   SELECT DISTINCT ItemID INTO #TrongTam FROM (
       SELECT CAST(value AS VARCHAR(50)) AS ItemID FROM STRING_SPLIT(@ItemIDs, ',') WHERE @ItemIDs != ''
       UNION ALL
       SELECT ItemID FROM AR_SanPhamTrongTamDetailTbl WHERE @ItemIDs = '' AND DocumentID = @ProgramID
   ) X


   -- 4. TỔNG MUA & TRẢ HÀNG TRỌNG TÂM
   SELECT I.ObjectID, SUM(D.TotalAmount) AS TongHoaDon INTO #HoaDon
   FROM AR_InvoiceTbl I JOIN AR_InvoiceDetailTbl D ON I.DocumentID = D.DocumentID
   JOIN #TrongTam T ON D.ItemID = T.ItemID
   WHERE I.DocumentDate BETWEEN @FromDate AND @ToDate AND ISNULL(I.StatusID, 0) != 10
     AND (@SYSBranchID = '' OR I.BranchID = @SYSBranchID)
   GROUP BY I.ObjectID


   SELECT R.ObjectID, SUM(D.TotalAmount) AS TongTraHang INTO #TraHang
   FROM AR_ReturnTbl R JOIN AR_ReturnDetailTbl D ON R.DocumentID = D.DocumentID
   JOIN #TrongTam T ON D.ItemID = T.ItemID
   WHERE R.DocumentDate BETWEEN @FromDate AND @ToDate AND (@SYSBranchID = '' OR R.BranchID = @SYSBranchID)
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
       
       -- Số lượng quà (Dành cho AI robot hiển thị số phần)
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
                THEN N'💡 Thiếu ' + FORMAT((SELECT TOP 1 TuDiem FROM AR_PromotionGiftTbl WHERE DocumentID = @ProgramID AND TuDiem > ISNULL(TL.TongTichLuy,0) ORDER BY TuDiem ASC) - ISNULL(TL.TongTichLuy,0), 'N0') + N'đ để đạt mốc tiếp theo.'
           ELSE N'🎉 Tuyệt vời! Bạn đã đạt mốc quà cao nhất trong chương trình.'
       END AS LoiNhacAI


   FROM CF_ObjectTbl KH
   LEFT JOIN #TichLuy TL ON KH.ObjectID = TL.ObjectID
   WHERE (@ObjectID != '' AND KH.ObjectID = @ObjectID)
      OR (@ObjectID = '' AND EXISTS (SELECT 1 FROM AR_PromotionGiftTbl G WHERE G.DocumentID = @ProgramID AND ISNULL(TL.TongTichLuy,0) >= G.TuDiem * 0.7))
   ORDER BY ISNULL(TL.TongTichLuy,0) DESC;


   DROP TABLE #HoaDon; DROP TABLE #TraHang; DROP TABLE #TrongTam; DROP TABLE #TichLuy;
END
GO
