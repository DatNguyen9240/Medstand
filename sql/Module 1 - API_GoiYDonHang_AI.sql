IF OBJECT_ID('API_GoiYDonHang_AI', 'P') IS NOT NULL DROP PROCEDURE API_GoiYDonHang_AI;
GO

CREATE PROCEDURE API_GoiYDonHang_AI
    @Username   VARCHAR(50) = '',
    @khachhang  VARCHAR(50) = '',
    @TopN       INT         = 10
AS
BEGIN
    SET NOCOUNT ON

    -- ═══ 1. Validate User ═══
    IF NOT EXISTS (SELECT 1 FROM SY_User WHERE UserName = @Username AND COALESCE(Disable, 0) = 0)
    BEGIN
        SELECT N'User không tồn tại hoặc đã bị khóa' AS Msg, 1 AS MsgType
        RETURN
    END

    IF @khachhang <> '' AND NOT EXISTS (SELECT 1 FROM CF_ObjectTbl WHERE ObjectID = @khachhang)
    BEGIN
        SELECT 'N/A' AS [Mã SP], N'❌ Không tìm thấy mã khách hàng này.' AS [Sản phẩm], 0 AS [Đã mua (đ)], NULL AS [Lần cuối], 0 AS [Chu kỳ], 0 AS [Còn (ngày)], N'Vui lòng kiểm tra lại.' AS [Gợi ý];
        RETURN;
    END

    -- ═══ 2. Phân quyền ═══
    DECLARE @SYSBranchID   VARCHAR(50) = ''
    SELECT @SYSBranchID = COALESCE(BranchID, '') FROM SY_User WHERE UserName = @Username

    -- ═══════════════════════════════════════════════════
    -- KHÔNG TRUYỀN khách hàng (khachhang) → Top sản phẩm bán chạy nhất
    -- ═══════════════════════════════════════════════════
    IF @khachhang = ''
    BEGIN
        SELECT TOP (@TopN)
            D.ItemID                                     AS [Mã SP],
            CF.ItemName                                  AS [Sản phẩm],
            COUNT(DISTINCT I.DocumentID)                 AS [Số HĐ],
            CAST(SUM(D.TotalAmount) AS BIGINT)           AS [Doanh số],
            N'📊 Bán chạy trong chi nhánh'               AS [Gợi ý]
        FROM AR_InvoiceTbl I
        JOIN AR_InvoiceDetailTbl D ON I.DocumentID = D.DocumentID
        JOIN CF_ItemTbl CF         ON CF.ItemID    = D.ItemID
        WHERE I.DocumentDate >= DATEADD(DAY, -30, GETDATE())
          AND ISNULL(I.StatusID, 0) != 10
          AND (@SYSBranchID  = '' OR I.BranchID  = @SYSBranchID)
        GROUP BY D.ItemID, CF.ItemName
        ORDER BY [Doanh số] DESC
        RETURN
    END

    -- ═══════════════════════════════════════════════════
    -- CÓ ObjectID → Gợi ý cá nhân hóa (Personalized)
    -- ═══════════════════════════════════════════════════

    -- TIÊU CHÍ 1: Lịch sử mua hàng (6 tháng gần nhất)
    SELECT
        D.ItemID,
        COUNT(DISTINCT I.DocumentID)                    AS SoLanMua,
        SUM(D.TotalAmount)                              AS TongTien,
        MAX(I.DocumentDate)                             AS LanMuaCuoi,
        DATEDIFF(DAY, MAX(I.DocumentDate), GETDATE())   AS SoNgayTuLanCuoi
    INTO #LichSu
    FROM AR_InvoiceTbl I
    JOIN AR_InvoiceDetailTbl D ON I.DocumentID = D.DocumentID
        WHERE I.ObjectID = @khachhang
      AND I.DocumentDate >= DATEADD(MONTH, -6, GETDATE())
      AND ISNULL(I.StatusID, 0) != 10
    GROUP BY D.ItemID

    -- TIÊU CHÍ 2: Chu kỳ mua hàng trung bình (Average Purchase Cycle)
    -- Sửa logic: Khoảng cách trung bình = (MaxDate - MinDate) / (Số lần mua - 1)
    SELECT
        L.ItemID,
        CASE
            WHEN L.SoLanMua >= 2
            THEN DATEDIFF(DAY, 
                    (SELECT MIN(I2.DocumentDate) 
                     FROM AR_InvoiceTbl I2 
                     JOIN AR_InvoiceDetailTbl D2 ON I2.DocumentID = D2.DocumentID 
                     WHERE I2.ObjectID = @khachhang AND D2.ItemID = L.ItemID AND I2.DocumentDate >= DATEADD(MONTH,-6,GETDATE())), 
                    L.LanMuaCuoi) 
                 / (L.SoLanMua - 1)
            ELSE 30 -- Mặc định 30 ngày nếu chỉ mua 1 lần
        END AS ChuKyTrungBinh
    INTO #ChuKy
    FROM #LichSu L

    -- TIÊU CHÍ 3: Mùa vụ (Cùng tháng này năm trước)
    SELECT D.ItemID INTO #MuaVu
    FROM AR_InvoiceTbl I JOIN AR_InvoiceDetailTbl D ON I.DocumentID = D.DocumentID
    WHERE I.ObjectID = @khachhang AND MONTH(I.DocumentDate) = MONTH(GETDATE()) AND YEAR(I.DocumentDate) = YEAR(GETDATE()) - 1
    GROUP BY D.ItemID

    -- TIÊU CHÍ 4: Khuyến mãi đang chạy
    SELECT DISTINCT PD.ItemID INTO #KhuyenMai
    FROM AR_PromotionTbl P JOIN AR_PromotionDetailTbl PD ON P.DocumentID = PD.DocumentID
    WHERE GETDATE() BETWEEN P.FromDate AND P.ToDate AND ISNULL(P.isDisable, 0) = 0

    -- TIÊU CHÍ 5: Sản phẩm trọng tâm (Focus Items)
    DECLARE @CurProgramID VARCHAR(50) = ''
    SELECT TOP 1 @CurProgramID = DocumentID FROM AR_SanPhamTrongTamTbl 
    WHERE GETDATE() BETWEEN FromDate AND ToDate ORDER BY ToDate DESC

    SELECT DISTINCT ItemID INTO #TrongTam 
    FROM AR_SanPhamTrongTamDetailTbl WHERE DocumentID = @CurProgramID

    -- KẾT QUẢ CUỐI CÙNG: Tập trung vào "Thời điểm vàng"
    SELECT TOP (@TopN)
        L.ItemID                                        AS [Mã SP],
        CF.ItemName                                     AS [Sản phẩm],
        CAST(L.TongTien AS BIGINT)                      AS [Đã mua (đ)],
        FORMAT(L.LanMuaCuoi, 'MM/dd')                   AS [Lần cuối],
        CK.ChuKyTrungBinh                               AS [Chu kỳ (ngày)],
        -- Dự kiến còn lại: Nếu < 0 (đã quá hạn) thì hiện 0 cho trực quan
        CASE WHEN (CK.ChuKyTrungBinh - L.SoNgayTuLanCuoi) < 0 THEN 0 
             ELSE CAST(CK.ChuKyTrungBinh - L.SoNgayTuLanCuoi AS INT) END AS [Còn (ngày)],
        CONCAT(
            CASE 
                WHEN L.SoNgayTuLanCuoi >= CK.ChuKyTrungBinh 
                THEN N'☢️ Quá hạn mua ' + CAST(L.SoNgayTuLanCuoi - CK.ChuKyTrungBinh AS VARCHAR) + N' ngày'
                WHEN CK.ChuKyTrungBinh - L.SoNgayTuLanCuoi <= 7 
                THEN N'✨ THỜI ĐIỂM VÀNG (~' + CAST(CK.ChuKyTrungBinh - L.SoNgayTuLanCuoi AS VARCHAR) + N' ngày)'
                ELSE N'📦 Ổn định'
            END,
            CASE WHEN TT.ItemID IS NOT NULL THEN N' | 🔥 Trọng tâm' ELSE '' END,
            CASE WHEN MV.ItemID IS NOT NULL THEN N' | 📅 Mùa vụ' ELSE '' END,
            CASE WHEN KM.ItemID IS NOT NULL THEN N' | 🎁 Khuyến mãi' ELSE '' END
        )                                               AS [Gợi ý]
    FROM #LichSu L
    JOIN #ChuKy CK          ON L.ItemID = CK.ItemID
    LEFT JOIN #MuaVu MV     ON L.ItemID = MV.ItemID
    LEFT JOIN #KhuyenMai KM ON L.ItemID = KM.ItemID
    LEFT JOIN #TrongTam TT  ON L.ItemID = TT.ItemID
    LEFT JOIN CF_ItemTbl CF ON L.ItemID = CF.ItemID
    WHERE ISNULL(CF.ItemGroupID, '') NOT IN ('KM', 'DV', 'VT', 'BB', 'Vat Tu', 'Bao Bi', 'TUI') -- Lọc rác
      AND CF.ItemID NOT LIKE 'KM%' AND CF.ItemID NOT LIKE 'BB%'
    ORDER BY (CASE WHEN TT.ItemID IS NOT NULL THEN 1 ELSE 0 END) DESC, -- Ưu tiên hàng trọng tâm lên hàng đầu
             (CASE WHEN L.SoNgayTuLanCuoi >= CK.ChuKyTrungBinh THEN 1 ELSE 0 END) DESC, 
             (CASE WHEN (CK.ChuKyTrungBinh - L.SoNgayTuLanCuoi) <= 7 THEN 1 ELSE 0 END) DESC,
             L.SoLanMua DESC

    DROP TABLE #LichSu; DROP TABLE #ChuKy; DROP TABLE #MuaVu; DROP TABLE #KhuyenMai; DROP TABLE #TrongTam;
END
GO

/* -- TEST SCRIPT --
-- Kịch bản 1: Tra cứu gợi ý cho một khách hàng cụ thể
EXEC API_GoiYDonHang_AI @Username = 'admin', @khachhang = 'KH001', @TopN = 10;

-- Kịch bản 2: Tra cứu danh sách bán chạy chung cho chi nhánh (ObjectID để trống)
EXEC API_GoiYDonHang_AI @Username = 'admin', @khachhang = '', @TopN = 10;
*/



