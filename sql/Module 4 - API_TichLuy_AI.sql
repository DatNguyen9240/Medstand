IF OBJECT_ID('API_TichLuy_AI', 'P') IS NOT NULL DROP PROCEDURE API_TichLuy_AI;
GO

CREATE PROCEDURE API_TichLuy_AI
   @Username   VARCHAR(50)   = '',
   @khachhang  VARCHAR(50)   = '',
   @ProgramID  VARCHAR(50)   = '',
   @TuNgay   DATETIME      = NULL,
   @DenNgay     DATETIME      = NULL,
   @ItemIDs    NVARCHAR(MAX) = ''
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
   
   IF @TuNgay IS NULL OR @DenNgay IS NULL
       SELECT @TuNgay = FromDate, @DenNgay = ToDate FROM AR_SanPhamTrongTamTbl WHERE DocumentID = @ProgramID


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
   WHERE I.DocumentDate BETWEEN @TuNgay AND @DenNgay AND ISNULL(I.StatusID, 0) != 10
     AND (@SYSBranchID = '' OR I.BranchID = @SYSBranchID)
   GROUP BY I.ObjectID


   SELECT R.ObjectID, SUM(D.TotalAmount) AS TongTraHang INTO #TraHang
   FROM AR_ReturnTbl R JOIN AR_ReturnDetailTbl D ON R.DocumentID = D.DocumentID
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
                THEN N'💡 Thiếu ' + FORMAT((SELECT TOP 1 TuDiem FROM AR_PromotionGiftTbl WHERE DocumentID = @ProgramID AND TuDiem > ISNULL(TL.TongTichLuy,0) ORDER BY TuDiem ASC) - ISNULL(TL.TongTichLuy,0), 'N0') + N'đ để đạt mốc tiếp theo.'
           ELSE N'🎉 Tuyệt vời! Bạn đã đạt mốc quà cao nhất trong chương trình.'
       END AS LoiNhacAI

   FROM CF_ObjectTbl KH
   LEFT JOIN #TichLuy TL ON KH.ObjectID = TL.ObjectID
   WHERE (@khachhang != '' AND KH.ObjectID = @khachhang)
      OR (@khachhang = '' AND EXISTS (SELECT 1 FROM AR_PromotionGiftTbl G WHERE G.DocumentID = @ProgramID AND ISNULL(TL.TongTichLuy,0) >= G.TuDiem * 0.7))
   ORDER BY ISNULL(TL.TongTichLuy,0) DESC;


   -- ════════════════════════════════════════════════════
   -- BẢNG 2: SẢN PHẨM TRỌNG TÂM CHƯA PHÁT SINH DOANH SỐ (GỢI Ý)
   -- ════════════════════════════════════════════════════
   IF @khachhang != ''
   BEGIN
       SELECT DISTINCT D.ItemID
       INTO #ItemsBought
       FROM AR_InvoiceTbl I JOIN AR_InvoiceDetailTbl D ON I.DocumentID = D.DocumentID
       WHERE I.ObjectID = @khachhang 
         AND I.DocumentDate BETWEEN @TuNgay AND @DenNgay
         AND ISNULL(I.StatusID, 0) != 10
         AND D.ItemID IN (SELECT ItemID FROM #TrongTam)

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
EXEC API_TichLuy_AI @Username = 'admin', @khachhang = 'KH001';

-- Kịch bản 2: Tra cứu tổng hợp toàn bộ các khách hàng tiềm năng
EXEC API_TichLuy_AI @Username = 'admin', @khachhang = '';
*/
