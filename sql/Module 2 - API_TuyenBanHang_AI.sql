USE medtest;
GO

-- =========================================================================
-- 1. NÂNG CẤP STORED PROCEDURE API_TuyenBanHang_AI:
-- Bổ sung cột ObjectName, Latitude và Longitude bằng cách LEFT JOIN với CF_ObjectMapTbl.
-- =========================================================================

CREATE OR ALTER PROCEDURE [dbo].[API_TuyenBanHang_AI]
    @Username      VARCHAR(50)   = '',
    @MaKhachHang   NVARCHAR(100) = '',
    @SoNgayVangMat INT           = 45,
    @NgayBaoDong   INT           = 5,
    @TopN          INT           = 8,
    @NgayTarget    VARCHAR(20)   = ''
AS
BEGIN
    SET NOCOUNT ON
    -- Defend against NULL or non-positive bounds passed by web server binders
    IF @TopN IS NULL OR @TopN <= 0 SET @TopN = 8;

    -- 2. KIỂM TRA USER HỢP LỆ
    IF NOT EXISTS (SELECT 1 FROM SY_User WHERE UserName = @Username AND COALESCE(Disable, 0) = 0)
    BEGIN
        SELECT N'User không tồn tại hoặc đã bị khóa' AS Msg, 1 AS MsgType
        RETURN
    END

    -- 3. THIẾT LẬP THỜI GIAN & THỨ TRONG TUẦN
    SET DATEFIRST 7  -- Chủ nhật = 1, Thứ 2 = 2, ..., Thứ 7 = 7
    DECLARE @TuNgay DATETIME = CASE WHEN @NgayTarget = '' THEN GETDATE() ELSE TRY_CAST(@NgayTarget AS DATETIME) END
    IF @TuNgay IS NULL SET @TuNgay = GETDATE()
    
    DECLARE @ThuHomNay VARCHAR(1) = CAST(DATEPART(dw, @TuNgay) AS VARCHAR)
    DECLARE @TenThuHomNay NVARCHAR(20) = ''
    
    SELECT @TenThuHomNay = CASE @ThuHomNay
        WHEN '1' THEN N'Chủ nhật'
        WHEN '2' THEN N'Thứ 2'
        WHEN '3' THEN N'Thứ 3'
        WHEN '4' THEN N'Thứ 4'
        WHEN '5' THEN N'Thứ 5'
        WHEN '6' THEN N'Thứ 6'
        WHEN '7' THEN N'Thứ 7'
    END

    -- 4. PHÂN QUYỀN USER (TDV / QUẢN LÝ / ADMIN)
    DECLARE @SYSBranchID    VARCHAR(50) = ''
    DECLARE @SYSCeoID       VARCHAR(50) = ''
    DECLARE @SYSManagerID   VARCHAR(50) = ''
    DECLARE @SYSUserGroupID VARCHAR(50) = ''

    SELECT
        @SYSBranchID    = COALESCE(BranchID,  ''),
        @SYSCeoID       = COALESCE(CeoID,     ''),
        @SYSManagerID   = COALESCE(ManagerID, ''),
        @SYSUserGroupID = COALESCE(UserGroupID, '')
    FROM SY_User WHERE UserName = @Username AND COALESCE(Disable, 0) = 0

    -- Cache allowed objects based on username to optimize query plan
    CREATE TABLE #AllowedObjects (ObjectID VARCHAR(50) PRIMARY KEY);
    INSERT INTO #AllowedObjects (ObjectID)
    SELECT ObjectID FROM dbo.AR_GetObjectByUserFnc(@Username);

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

    -- 1. KIỂM TRA MÃ KHÁCH HÀNG HỢP LỆ (Nếu có truyền vào)
    IF @MaKhachHang <> '' AND NOT EXISTS (SELECT 1 FROM CF_ObjectTbl WHERE ObjectID = @MaKhachHang)
    BEGIN
        SELECT 'N/A' AS ObjectID, N'Không tìm thấy mã khách hàng.' AS TenCuaHang, NULL AS Phone, 0 AS TichLuyDatDuoc, N'Vui lòng kiểm tra lại mã khách hàng.' AS TrangThaiAI;
        RETURN;
    END

    -- 5. LẤY LỊCH SỬ HÓA ĐƠN CUỐI (BR-ROUTE-002).
    -- Đơn hàng chưa giao không được coi là lần mua hợp lệ.
    SELECT
        T.ObjectID,
        MAX(T.DocumentDate)                             AS LanMuaCuoi,
        DATEDIFF(DAY, MAX(T.DocumentDate), @TuNgay)     AS SoNgayKhongMua
    INTO #LanMuaCuoi
    FROM (
        SELECT ObjectID, DocumentDate, BranchID, CeoID, ManagerID 
        FROM AR_InvoiceTbl WHERE StatusID IN (3, 6, 7, 8)
    ) T
    WHERE (@MaKhachHang = '' OR T.ObjectID = @MaKhachHang)
      AND (
          UPPER(@SYSUserGroupID) = 'ADMIN'
          OR (
              (ISNULL(@SYSBranchID, '') = '' OR T.BranchID = @SYSBranchID)
              AND EXISTS (SELECT 1 FROM #AllowedObjects AO WHERE AO.ObjectID = T.ObjectID)
          )
      )
    GROUP BY T.ObjectID

    -- 6. TÍNH CHU KÝ MUA TRUNG BÌNH (6 tháng gần nhất)
    SELECT
        I.ObjectID,
        CASE
            WHEN COUNT(DISTINCT I.DocumentID) >= 3
            THEN DATEDIFF(DAY, MIN(I.DocumentDate), MAX(I.DocumentDate))
                 / (COUNT(DISTINCT I.DocumentID) - 1)
            ELSE 30 -- fallback tham khảo; chưa đủ 3 hóa đơn để tin cậy
        END AS ChuKyTB
    INTO #ChuKy
    FROM AR_InvoiceTbl I
    WHERE I.DocumentDate >= DATEADD(MONTH, -6, @TuNgay) AND I.DocumentDate <= @TuNgay
      AND I.StatusID IN (3, 6, 7, 8)
      AND (@MaKhachHang = '' OR I.ObjectID = @MaKhachHang)
      AND (
          UPPER(@SYSUserGroupID) = 'ADMIN'
          OR (
              (ISNULL(@SYSBranchID, '') = '' OR I.BranchID = @SYSBranchID)
              AND EXISTS (SELECT 1 FROM #AllowedObjects AO WHERE AO.ObjectID = I.ObjectID)
          )
      )
    GROUP BY I.ObjectID

    -- 7. TÍNH ĐIỂM ƯU TIÊN VÀ GỢI Ý (LEFT JOIN để hỗ trợ cả khách hàng mới chưa mua hàng)
    SELECT
        KH.ObjectID,
        LMC.LanMuaCuoi,
        COALESCE(LMC.SoNgayKhongMua, 999) AS SoNgayKhongMua,
        COALESCE(CK.ChuKyTB, 30) AS ChuKyMuaTB_Ngay,
        DATEADD(DAY, COALESCE(CK.ChuKyTB, 30), COALESCE(LMC.LanMuaCuoi, @TuNgay)) AS NgayDuDoanHetHang,
        DATEDIFF(DAY, @TuNgay, DATEADD(DAY, COALESCE(CK.ChuKyTB, 30), COALESCE(LMC.LanMuaCuoi, @TuNgay))) AS NgayConLaiHetHang,
        CAST(
            (CASE
                -- Sắp hết hàng hoặc quá hạn hết hàng
                WHEN DATEDIFF(DAY, @TuNgay, DATEADD(DAY, COALESCE(CK.ChuKyTB, 30), COALESCE(LMC.LanMuaCuoi, @TuNgay))) <= 0 THEN 100
                WHEN DATEDIFF(DAY, @TuNgay, DATEADD(DAY, COALESCE(CK.ChuKyTB, 30), COALESCE(LMC.LanMuaCuoi, @TuNgay))) <= @NgayBaoDong THEN 80
                WHEN DATEDIFF(DAY, @TuNgay, DATEADD(DAY, COALESCE(CK.ChuKyTB, 30), COALESCE(LMC.LanMuaCuoi, @TuNgay))) <= 14 THEN 50
                ELSE 0 END)
            -- Lâu chưa mua
            + (CASE WHEN COALESCE(LMC.SoNgayKhongMua, 999) >= @SoNgayVangMat THEN 40 WHEN COALESCE(LMC.SoNgayKhongMua, 999) >= 30 THEN 20 ELSE 0 END)
            -- Đúng lịch ghé hôm nay (Cộng thêm điểm ưu tiên)
            + (CASE WHEN KH.ThuTrongTuan LIKE '%' + @TenThuHomNay + '%' THEN 30 ELSE 0 END)
        AS INT) AS DiemUuTien
    INTO #Logic
    FROM CF_ObjectTbl KH
    LEFT JOIN #LanMuaCuoi LMC ON KH.ObjectID = LMC.ObjectID
    LEFT JOIN #ChuKy CK       ON KH.ObjectID = CK.ObjectID
    WHERE ISNULL(KH.isDisable, 0) = 0 
      AND ISNULL(KH.isCustomer, 0) = 1
      AND (
          UPPER(@SYSUserGroupID) = 'ADMIN'
          OR (
              (ISNULL(@SYSBranchID, '') = '' OR KH.BranchID = @SYSBranchID)
              AND EXISTS (SELECT 1 FROM #AllowedObjects AO WHERE AO.ObjectID = KH.ObjectID)
          )
      )

    -- 8. KẾT QUẢ CUỐI CÙNG: LỌC CỨNG THEO TUYẾN NGÀY HỎI (Hoặc xem chi tiết 1 khách cụ thể)
    SELECT TOP (@TopN)
        KH.ObjectID, 
        KH.ObjectName AS TenCuaHang,
        KH.Phone AS [Phone], 
        KH.Address AS [Address],
        KH.ZoneID AS [Tuyen], 
        KH.ThuTrongTuan AS [LichGhe], 
        CASE WHEN L.LanMuaCuoi IS NULL THEN 'N/A' ELSE FORMAT(L.LanMuaCuoi, 'dd/MM/yyyy') END AS [LanMuaCuoi], 
        CASE WHEN L.SoNgayKhongMua = 999 THEN NULL ELSE L.SoNgayKhongMua END AS [SoNgayKhongMua],
        L.ChuKyMuaTB_Ngay AS [ChuKyTB], 
        CASE WHEN L.LanMuaCuoi IS NULL THEN 'N/A' ELSE FORMAT(L.NgayDuDoanHetHang, 'dd/MM/yyyy') END AS [NgayDuDoan],
        CASE WHEN L.NgayConLaiHetHang < 0 THEN 0 ELSE L.NgayConLaiHetHang END AS [ConLai],
        L.DiemUuTien AS [DiemUuTien],
        CONCAT(
            CASE
                WHEN L.LanMuaCuoi IS NULL THEN N'Khách hàng mới chưa có đơn'
                WHEN L.NgayConLaiHetHang < 0 THEN N'Chưa phát sinh đơn hàng ' + CAST(ABS(L.NgayConLaiHetHang) AS VARCHAR) + N' ngày'
                WHEN L.NgayConLaiHetHang <= @NgayBaoDong THEN N'Sắp hết hàng (Còn ' + CAST(L.NgayConLaiHetHang AS VARCHAR) + N' ngày)'
                ELSE N'Theo lịch ghé'
            END,
            CASE WHEN KH.ZoneID IS NULL THEN N' | Ngoài tuyến' ELSE '' END
        ) AS [LyDoGhe],
        CAST(@TuNgay AS DATE) AS [WorkDate],
        @TenThuHomNay AS [AppliedWeekday],
        @SYSBranchID AS [ScopeBranchID],
        N'AR_InvoiceTbl' AS [LastPurchaseSource],
        N'CHECKIN_SOURCE_UNAVAILABLE' AS [LastVisitStatus],
        N'LEGACY_DEFAULT' AS [RuleSource],
        N'BR-ROUTE-V1' AS [RuleVersion],
        M.Latitude AS [Latitude],
        M.Longitude AS [Longitude]
    FROM CF_ObjectTbl KH
    JOIN #Logic L ON KH.ObjectID = L.ObjectID
    OUTER APPLY (
        SELECT TOP (1) Map.Latitude, Map.Longitude
        FROM dbo.CF_ObjectMapTbl Map
        WHERE Map.ObjectID = KH.ObjectID
        ORDER BY Map.MapDate DESC, Map.UserAutoID DESC
    ) M
    WHERE (@MaKhachHang = '' OR KH.ObjectID = @MaKhachHang)
      AND (
          -- Nếu tra cứu 1 khách hàng cụ thể thì trả về luôn không lọc Thứ
          @MaKhachHang <> '' 
          -- Hoặc lọc cứng đúng tuyến ngày cần đi
          OR KH.ThuTrongTuan LIKE '%' + @TenThuHomNay + '%'
      )
    ORDER BY DiemUuTien DESC, NgayConLaiHetHang ASC, KH.ObjectID ASC;

    DROP TABLE #LanMuaCuoi; DROP TABLE #ChuKy; DROP TABLE #Logic; DROP TABLE #AllowedObjects;
END
GO


-- =========================================================================
-- 2. THÊM TỌA ĐỘ MOCK CHO 8 KHÁCH HÀNG TRÊN UAT (QUANH TRUNG TÂM HÀ NỘI):
-- Để Sales có thể thấy hiển thị marker và chạy thử tính năng vẽ đường.
-- =========================================================================
-- Dữ liệu mock bị vô hiệu hóa trong script triển khai chính để không ghi đè
-- tọa độ thật. Chỉ bật thủ công trong một script seed UAT riêng khi cần.
IF 1 = 0
BEGIN

-- QANB347 (Quầy Thuốc Tây Mỹ Liên 2)
IF NOT EXISTS (SELECT 1 FROM dbo.CF_ObjectMapTbl WHERE ObjectID = 'QANB347')
    INSERT INTO dbo.CF_ObjectMapTbl (UserAutoID, ObjectID, Latitude, Longitude, MapDate)
    VALUES (CAST(NEWID() AS VARCHAR(50)), 'QANB347', 21.0305, 105.8522, GETDATE());
ELSE
    UPDATE dbo.CF_ObjectMapTbl SET Latitude = 21.0305, Longitude = 105.8522 WHERE ObjectID = 'QANB347';

-- DONA0733 (Nhà thuốc tiện lợi Medophar)
IF NOT EXISTS (SELECT 1 FROM dbo.CF_ObjectMapTbl WHERE ObjectID = 'DONA0733')
    INSERT INTO dbo.CF_ObjectMapTbl (UserAutoID, ObjectID, Latitude, Longitude, MapDate)
    VALUES (CAST(NEWID() AS VARCHAR(50)), 'DONA0733', 21.0265, 105.8562, GETDATE());
ELSE
    UPDATE dbo.CF_ObjectMapTbl SET Latitude = 21.0265, Longitude = 105.8562 WHERE ObjectID = 'DONA0733';

-- NAA123 (Shop Mẹ và Bé Changs House)
IF NOT EXISTS (SELECT 1 FROM dbo.CF_ObjectMapTbl WHERE ObjectID = 'NAA123')
    INSERT INTO dbo.CF_ObjectMapTbl (UserAutoID, ObjectID, Latitude, Longitude, MapDate)
    VALUES (CAST(NEWID() AS VARCHAR(50)), 'NAA123', 21.0295, 105.8502, GETDATE());
ELSE
    UPDATE dbo.CF_ObjectMapTbl SET Latitude = 21.0295, Longitude = 105.8502 WHERE ObjectID = 'NAA123';

-- NAC158 (Quầy Thuốc Thành Mùi)
IF NOT EXISTS (SELECT 1 FROM dbo.CF_ObjectMapTbl WHERE ObjectID = 'NAC158')
    INSERT INTO dbo.CF_ObjectMapTbl (UserAutoID, ObjectID, Latitude, Longitude, MapDate)
    VALUES (CAST(NEWID() AS VARCHAR(50)), 'NAC158', 21.0315, 105.8552, GETDATE());
ELSE
    UPDATE dbo.CF_ObjectMapTbl SET Latitude = 21.0315, Longitude = 105.8552 WHERE ObjectID = 'NAC158';

-- HPA191 (Hiệu thuốc Thuỷ Nguyên)
IF NOT EXISTS (SELECT 1 FROM dbo.CF_ObjectMapTbl WHERE ObjectID = 'HPA191')
    INSERT INTO dbo.CF_ObjectMapTbl (UserAutoID, ObjectID, Latitude, Longitude, MapDate)
    VALUES (CAST(NEWID() AS VARCHAR(50)), 'HPA191', 21.0255, 105.8522, GETDATE());
ELSE
    UPDATE dbo.CF_ObjectMapTbl SET Latitude = 21.0255, Longitude = 105.8522 WHERE ObjectID = 'HPA191';

-- SGGV0211 (Nhà Thuốc Hương Nhi)
IF NOT EXISTS (SELECT 1 FROM dbo.CF_ObjectMapTbl WHERE ObjectID = 'SGGV0211')
    INSERT INTO dbo.CF_ObjectMapTbl (UserAutoID, ObjectID, Latitude, Longitude, MapDate)
    VALUES (CAST(NEWID() AS VARCHAR(50)), 'SGGV0211', 21.0275, 105.8582, GETDATE());
ELSE
    UPDATE dbo.CF_ObjectMapTbl SET Latitude = 21.0275, Longitude = 105.8582 WHERE ObjectID = 'SGGV0211';

-- DOTA0029 (Quầy thuốc Thanh Tuấn)
IF NOT EXISTS (SELECT 1 FROM dbo.CF_ObjectMapTbl WHERE ObjectID = 'DOTA0029')
    INSERT INTO dbo.CF_ObjectMapTbl (UserAutoID, ObjectID, Latitude, Longitude, MapDate)
    VALUES (CAST(NEWID() AS VARCHAR(50)), 'DOTA0029', 21.0325, 105.8512, GETDATE());
ELSE
    UPDATE dbo.CF_ObjectMapTbl SET Latitude = 21.0325, Longitude = 105.8512 WHERE ObjectID = 'DOTA0029';

-- YBA063 (Nhà Thuốc Huyền Yến)
IF NOT EXISTS (SELECT 1 FROM dbo.CF_ObjectMapTbl WHERE ObjectID = 'YBA063')
    INSERT INTO dbo.CF_ObjectMapTbl (UserAutoID, ObjectID, Latitude, Longitude, MapDate)
    VALUES (CAST(NEWID() AS VARCHAR(50)), 'YBA063', 21.0245, 105.8532, GETDATE());
ELSE
    UPDATE dbo.CF_ObjectMapTbl SET Latitude = 21.0245, Longitude = 105.8532 WHERE ObjectID = 'YBA063';
END
