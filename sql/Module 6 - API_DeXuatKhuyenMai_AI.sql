CREATE OR ALTER PROCEDURE [dbo].[API_DeXuatKhuyenMai_AI]
    @Username VARCHAR(50) = ''
AS
BEGIN
    SET NOCOUNT ON
    DECLARE @SYSBranchID VARCHAR(50) = ''
    SELECT @SYSBranchID = COALESCE(BranchID, '') FROM SY_User WHERE UserName = @Username

    -- 1. Tính tốc độ bán (Số lượng trung bình bán ra mỗi ngày trong 30 ngày qua)
    SELECT D.ItemID, SUM(D.Quantity) / 30.0 AS TocDo INTO #V 
    FROM AR_InvoiceDetailTbl D JOIN AR_InvoiceTbl I ON D.DocumentID = I.DocumentID 
    WHERE I.DocumentDate >= DATEADD(DAY, -30, GETDATE()) 
      AND ISNULL(I.StatusID, 0) != 10 
      AND (@SYSBranchID = '' OR I.BranchID = @SYSBranchID) 
    GROUP BY D.ItemID

    -- 2. Lấy hạn dùng gần nhất của các mặt hàng (Chỉ lấy lô còn hiệu lực)
    SELECT ItemID, MIN(ExpireDate) AS HanDungNhat 
    INTO #Lot 
    FROM CF_LotTbl 
    WHERE ExpireDate >= GETDATE()
    GROUP BY ItemID

    -- 3. Đề xuất chiến lược Khuyến mại (Bản Final)
    SELECT 
        I.ItemID, CF.ItemName, CF.Unit,
        CAST(I.QuantityinStock AS INT) AS TonKho,
        L.HanDungNhat AS HanDung,
        CASE 
            WHEN L.HanDungNhat <= DATEADD(MONTH, 6, GETDATE()) THEN N'XẢ HÀNG SÂU'
            WHEN I.QuantityinStock > 0 AND (ISNULL(V.TocDo,0) = 0 OR (I.QuantityinStock / NULLIF(V.TocDo, 0)) > 180) 
                THEN N'COMBO/ĐẨY HÀNG'
            ELSE N'THEO DÕI' 
        END AS LoaiDeXuat,
        CASE 
            -- Trường hợp cận date (Ưu tiên cảnh báo đầu tiên)
            WHEN L.HanDungNhat <= DATEADD(MONTH, 3, GETDATE()) 
                THEN N'KHẨN CẤP: Hạn dùng chỉ còn < 3 tháng (' + CONVERT(VARCHAR, L.HanDungNhat, 103) + N'). Xả hàng ngay!'
            WHEN L.HanDungNhat <= DATEADD(MONTH, 6, GETDATE()) 
                THEN N'CẬN DATE: Hạn dùng còn < 6 tháng (' + CONVERT(VARCHAR, L.HanDungNhat, 103) + N'). Nên giảm giá sâu.'
            
            -- Trường hợp hàng chậm, vòng quay thấp
            WHEN I.QuantityinStock > 0 AND ISNULL(V.TocDo,0) = 0 
                THEN N'⚡ CẢNH BÁO: Hàng tồn kho nhưng 30 ngày qua không phát sinh đơn. Cần chạy Combo tặng kèm để kích cầu.'
            WHEN I.QuantityinStock > 0 AND (I.QuantityinStock / NULLIF(V.TocDo, 0)) > 180 
                THEN N'📦 TỒN KHO CAO: Dự kiến ' + CAST(CAST(I.QuantityinStock / NULLIF(V.TocDo, 0) AS INT) AS VARCHAR) + N' ngày mới hết. Nên đóng combo.'
            
            ELSE N'Ổn định: Tốc độ bán tốt.'
        END AS ChiTietAI
    FROM IV_StockTbl I 
    JOIN CF_ItemTbl CF ON I.ItemID = CF.ItemID 
    LEFT JOIN #V V ON I.ItemID = V.ItemID
    LEFT JOIN #Lot L ON I.ItemID = L.ItemID
    WHERE I.QuantityinStock > 0 
      AND ISNULL(CF.ItemGroupID, '') = 'HH1' -- Lọc hàng HH1
    ORDER BY 
        -- Ưu tiên hàng cận date lên đầu, sau đó đến hàng chậm
        CASE WHEN L.HanDungNhat <= DATEADD(MONTH, 6, GETDATE()) THEN 1 
             WHEN ISNULL(V.TocDo,0) = 0 THEN 2 
             ELSE 3 END ASC, 
        TonKho DESC

    DROP TABLE #V; DROP TABLE #Lot;
END



