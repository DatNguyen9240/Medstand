CREATE OR ALTER PROCEDURE [dbo].[API_DeXuatKhuyenMai_AI]
    @Username VARCHAR(50) = ''
AS
BEGIN
    SET NOCOUNT ON
    DECLARE @SYSBranchID VARCHAR(50) = ''
    SELECT @SYSBranchID = COALESCE(BranchID, '') FROM SY_User WHERE UserName = @Username

    -- 1. ĐỌC CẤU HÌNH CHIẾT KHẤU ĐỘNG TỪ DATABASE
    -- Cấu hình xả hàng khẩn cấp (< 3 tháng)
    DECLARE @XaSauKhapCap_Thang INT = 3
    DECLARE @XaSauKhapCap_PhanTram DECIMAL(5,2) = 50.00
    SELECT TOP 1 
        @XaSauKhapCap_Thang = NguongThoiGian_Thang, 
        @XaSauKhapCap_PhanTram = PhanTramDeXuat 
    FROM dbo.AR_AI_DiscountConfigTbl 
    WHERE LoaiDeXuat = 'XA_HANG_SAU' 
      AND NguongThoiGian_Thang <= 3 
      AND IsActive = 1
      AND (TuNgay IS NULL OR TuNgay <= GETDATE())
      AND (DenNgay IS NULL OR DenNgay >= GETDATE())
    ORDER BY NguongThoiGian_Thang ASC, PhanTramDeXuat DESC

    -- Cấu hình xả hàng cận date (< 6 tháng)
    DECLARE @XaSauCanDate_Thang INT = 6
    DECLARE @XaSauCanDate_PhanTram DECIMAL(5,2) = 25.00
    SELECT TOP 1 
        @XaSauCanDate_Thang = NguongThoiGian_Thang, 
        @XaSauCanDate_PhanTram = PhanTramDeXuat 
    FROM dbo.AR_AI_DiscountConfigTbl 
    WHERE LoaiDeXuat = 'XA_HANG_SAU' 
      AND NguongThoiGian_Thang > 3 AND NguongThoiGian_Thang <= 6
      AND IsActive = 1
      AND (TuNgay IS NULL OR TuNgay <= GETDATE())
      AND (DenNgay IS NULL OR DenNgay >= GETDATE())
    ORDER BY NguongThoiGian_Thang ASC, PhanTramDeXuat DESC

    -- Cấu hình đẩy hàng chậm (combo)
    DECLARE @ComboDayHang_Thang INT = 6
    DECLARE @ComboDayHang_PhanTram DECIMAL(5,2) = 15.00
    SELECT TOP 1 
        @ComboDayHang_Thang = NguongThoiGian_Thang, 
        @ComboDayHang_PhanTram = PhanTramDeXuat 
    FROM dbo.AR_AI_DiscountConfigTbl 
    WHERE LoaiDeXuat = 'COMBO_DAY_HANG' 
      AND IsActive = 1
      AND (TuNgay IS NULL OR TuNgay <= GETDATE())
      AND (DenNgay IS NULL OR DenNgay >= GETDATE())
    ORDER BY NguongThoiGian_Thang DESC, PhanTramDeXuat DESC


    -- 2. Tính tốc độ bán (Số lượng trung bình bán ra mỗi ngày trong 30 ngày qua)
    SELECT D.ItemID, SUM(D.Quantity) / 30.0 AS TocDo INTO #V 
    FROM AR_InvoiceDetailTbl D JOIN AR_InvoiceTbl I ON D.DocumentID = I.DocumentID 
    WHERE I.DocumentDate >= DATEADD(DAY, -30, GETDATE()) 
      AND ISNULL(I.StatusID, 0) != 10 
      AND (@SYSBranchID = '' OR I.BranchID = @SYSBranchID) 
    GROUP BY D.ItemID

    -- 3. Lấy hạn dùng gần nhất của các mặt hàng (Chỉ lấy lô còn hiệu lực)
    SELECT ItemID, MIN(ExpireDate) AS HanDungNhat 
    INTO #Lot 
    FROM CF_LotTbl 
    WHERE ExpireDate >= GETDATE()
    GROUP BY ItemID

    -- 4. Đề xuất chiến lược Khuyến mại (Bản Final)
    SELECT 
        I.ItemID, CF.ItemName, CF.Unit,
        CAST(I.QuantityinStock AS INT) AS TonKho,
        L.HanDungNhat AS HanDung,
        CASE 
            WHEN L.HanDungNhat <= DATEADD(MONTH, @XaSauCanDate_Thang, GETDATE()) THEN N'XẢ HÀNG SÂU'
            WHEN I.QuantityinStock > 0 AND (ISNULL(V.TocDo,0) = 0 OR (I.QuantityinStock / NULLIF(V.TocDo, 0)) > (@ComboDayHang_Thang * 30)) 
                THEN N'COMBO/ĐẨY HÀNG'
            ELSE N'THEO DÕI' 
        END AS LoaiDeXuat,
        CASE 
            WHEN L.HanDungNhat <= DATEADD(MONTH, @XaSauCanDate_Thang, GETDATE()) THEN
                CASE WHEN L.HanDungNhat <= DATEADD(MONTH, @XaSauKhapCap_Thang, GETDATE()) THEN @XaSauKhapCap_PhanTram ELSE @XaSauCanDate_PhanTram END
            WHEN I.QuantityinStock > 0 AND (ISNULL(V.TocDo,0) = 0 OR (I.QuantityinStock / NULLIF(V.TocDo, 0)) > (@ComboDayHang_Thang * 30)) THEN @ComboDayHang_PhanTram
            ELSE 0.00
        END AS PhanTramDeXuat,
        CASE 
            -- Trường hợp cận date
            WHEN L.HanDungNhat <= DATEADD(MONTH, @XaSauKhapCap_Thang, GETDATE()) 
                THEN N'KHẨN CẤP: Hạn dùng chỉ còn < ' + CAST(@XaSauKhapCap_Thang AS VARCHAR) + N' tháng (' + CONVERT(VARCHAR, L.HanDungNhat, 103) + N'). Đề xuất giảm giá ' + CAST(CAST(@XaSauKhapCap_PhanTram AS INT) AS VARCHAR) + N'% để xả ngay!'
            WHEN L.HanDungNhat <= DATEADD(MONTH, @XaSauCanDate_Thang, GETDATE()) 
                THEN N'CẬN DATE: Hạn dùng còn < ' + CAST(@XaSauCanDate_Thang AS VARCHAR) + N' tháng (' + CONVERT(VARCHAR, L.HanDungNhat, 103) + N'). Đề xuất giảm giá ' + CAST(CAST(@XaSauCanDate_PhanTram AS INT) AS VARCHAR) + N'%.'
            
            -- Trường hợp hàng chậm, vòng quay thấp
            WHEN I.QuantityinStock > 0 AND ISNULL(V.TocDo,0) = 0 
                THEN N'⚡ CẢNH BÁO: Hàng chậm bán (30 ngày qua không bán được). Đề xuất chiết khấu ' + CAST(CAST(@ComboDayHang_PhanTram AS INT) AS VARCHAR) + N'% khi chạy combo tặng kèm.'
            WHEN I.QuantityinStock > 0 AND (I.QuantityinStock / NULLIF(V.TocDo, 0)) > (@ComboDayHang_Thang * 30) 
                THEN N'📦 TỒN KHO CAO: Dự kiến ' + CAST(CAST(I.QuantityinStock / NULLIF(V.TocDo, 0) AS INT) AS VARCHAR) + N' ngày mới hết. Khuyến khích giảm ' + CAST(CAST(@ComboDayHang_PhanTram AS INT) AS VARCHAR) + N'% khi ghép combo.'
            
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
        CASE WHEN L.HanDungNhat <= DATEADD(MONTH, @XaSauCanDate_Thang, GETDATE()) THEN 1 
             WHEN ISNULL(V.TocDo,0) = 0 THEN 2 
             ELSE 3 END ASC, 
        TonKho DESC

    DROP TABLE #V; DROP TABLE #Lot;
END



