IF OBJECT_ID('API_ChamDiemKH_AI', 'P') IS NOT NULL DROP PROCEDURE API_ChamDiemKH_AI;
GO
CREATE PROCEDURE API_ChamDiemKH_AI
    @Username       VARCHAR(50) = '',
    @ObjectID       VARCHAR(50) = '',
    @NhomFilter     VARCHAR(5)  = ''
AS
BEGIN
    SET NOCOUNT ON
    IF NOT EXISTS (SELECT 1 FROM SY_User WHERE UserName = @Username AND COALESCE(Disable, 0) = 0)
    BEGIN
        SELECT N'User không tồn tại hoặc đã bị khóa' AS Msg, 1 AS MsgType RETURN
    END




    DECLARE @SYSBranchID VARCHAR(50) = ''
    SELECT @SYSBranchID = COALESCE(BranchID, '') FROM SY_User WHERE UserName = @Username




    SELECT
        I.ObjectID,
        SUM(D.TotalAmount) / 12.0 AS DoanhSoTBThang,
        SUM(CASE WHEN I.DocumentDate >= DATEADD(MONTH,-3,GETDATE()) THEN D.TotalAmount ELSE 0 END) AS DoanhSo3Thang,
        SUM(CASE WHEN I.DocumentDate BETWEEN DATEADD(MONTH,-6,GETDATE()) AND DATEADD(MONTH,-3,GETDATE()) THEN D.TotalAmount ELSE 0 END) AS DoanhSo3ThangTruoc,
        MAX(I.DocumentDate) AS LanMuaCuoi,
        DATEDIFF(DAY, MAX(I.DocumentDate), GETDATE()) AS SoNgayKhongMua
    INTO #DoanhSo
    FROM AR_InvoiceTbl I JOIN AR_InvoiceDetailTbl D ON I.DocumentID = D.DocumentID
    WHERE I.DocumentDate >= DATEADD(MONTH, -12, GETDATE()) AND ISNULL(I.StatusID, 0) != 10
      AND (@SYSBranchID = '' OR I.BranchID = @SYSBranchID)
    GROUP BY I.ObjectID




    SELECT ObjectID, TenCuaHang, Phone, DoanhSoTBThang, DoanhSo3ThangGanNhat, SoNgayKhongMua, Nhom, PhanLoai, XuHuong, PhanTramThayDoi, CanhBaoAI
    FROM (
        SELECT
            KH.ObjectID, KH.ObjectName AS TenCuaHang, KH.Phone,
            CAST(DS.DoanhSoTBThang AS BIGINT) AS DoanhSoTBThang,
            CAST(DS.DoanhSo3Thang AS BIGINT) AS DoanhSo3ThangGanNhat,
            DS.SoNgayKhongMua,
            CASE WHEN DS.SoNgayKhongMua >= 90 THEN 'C'
                 WHEN DS.DoanhSoTBThang >= 50000000 THEN 'A'
                 WHEN DS.DoanhSoTBThang >= 30000000 THEN 'B'
            END AS Nhom,
            CASE WHEN DS.SoNgayKhongMua >= 90 THEN N'🔴 Nguy cơ rời bỏ'
                 WHEN DS.DoanhSoTBThang >= 50000000 THEN N'⭐ Khách VIP'
                 WHEN DS.DoanhSoTBThang >= 30000000 THEN N'🟢 Khách ổn định'
            END AS PhanLoai,
            CASE
                WHEN DS.SoNgayKhongMua >= 90 THEN N'🔴 Nguy cơ rời bỏ'
                WHEN KH.DateCreate >= DATEADD(DAY, -30, GETDATE()) THEN N'📈 Khách mới'
                WHEN DS.DoanhSo3Thang > DS.DoanhSo3ThangTruoc * 1.1 THEN N'📈 Tăng trưởng'
                WHEN DS.DoanhSo3Thang < DS.DoanhSo3ThangTruoc * 0.9 THEN N'📉 Sụt giảm'
                ELSE N'➡️ Ổn định'
            END AS XuHuong,
            CASE WHEN DS.DoanhSo3ThangTruoc = 0 THEN NULL
                 ELSE CAST((DS.DoanhSo3Thang - DS.DoanhSo3ThangTruoc) * 100.0 / NULLIF(DS.DoanhSo3ThangTruoc,0) AS INT)
            END AS PhanTramThayDoi,
            CASE
                WHEN DS.SoNgayKhongMua >= 90 THEN N'🔴 NGUY CƠ RỜI BỎ: Đã quá 90 ngày chưa có đơn hàng'
                WHEN DS.DoanhSoTBThang >= 30000000 AND DS.DoanhSo3Thang < DS.DoanhSo3ThangTruoc * 0.7 THEN N'⚠️ Cảnh báo: Sụt giảm doanh số mạnh'
                WHEN KH.DateCreate >= DATEADD(DAY, -30, GETDATE()) THEN N'📰 Khách mới: Cần chăm sóc đơn đầu tiên'
                ELSE NULL
            END AS CanhBaoAI,
            ROW_NUMBER() OVER (PARTITION BY (CASE WHEN DS.SoNgayKhongMua >= 90 THEN 'C' WHEN DS.DoanhSoTBThang >= 50000000 THEN 'A' WHEN DS.DoanhSoTBThang >= 30000000 THEN 'B' END) ORDER BY DS.DoanhSoTBThang DESC) AS STT
        FROM CF_ObjectTbl KH JOIN #DoanhSo DS ON KH.ObjectID = DS.ObjectID
        WHERE ISNULL(KH.isDisable, 0) = 0 AND ISNULL(KH.isCustomer, 0) = 1
          AND (@ObjectID = '' OR KH.ObjectID = @ObjectID)
          AND (@ObjectID != '' OR (DS.SoNgayKhongMua >= 90 OR DS.DoanhSoTBThang >= 30000000))
    ) T
    WHERE (@NhomFilter = '' OR Nhom = @NhomFilter)
      AND (@ObjectID != '' OR STT <= 5)
    ORDER BY Nhom ASC, DoanhSoTBThang DESC


    DROP TABLE #DoanhSo
END
GO












