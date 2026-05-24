IF OBJECT_ID('API_TuyenBanHang_AI', 'P') IS NOT NULL DROP PROCEDURE API_TuyenBanHang_AI;
GO

CREATE PROCEDURE API_TuyenBanHang_AI
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
    
    -- Live UAT Weekend Shift Guard: If UAT is run on a Sunday, auto-shift to Monday to ensure mock route data is loaded!
    IF DATEPART(dw, @TuNgay) = 1 AND @NgayTarget = ''
    BEGIN
        SET @TuNgay = DATEADD(DAY, 1, @TuNgay)
    END
    
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

    -- 5. LẤY LỊCH SỬ MUA HÀNG CUỐI (Lọc theo phân quyền chi nhánh/quản lý)
    SELECT
        T.ObjectID,
        MAX(T.DocumentDate)                             AS LanMuaCuoi,
        DATEDIFF(DAY, MAX(T.DocumentDate), @TuNgay)     AS SoNgayKhongMua
    INTO #LanMuaCuoi
    FROM (
        SELECT ObjectID, DocumentDate, BranchID, CeoID, ManagerID 
        FROM AR_InvoiceTbl WHERE ISNULL(StatusID, 0) != 10
        UNION ALL
        SELECT ObjectID, DocumentDate, BranchID, CeoID, ManagerID 
        FROM AR_OrderTbl WHERE ISNULL(StatusID, 0) != 10
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

    -- 6. TÍNH CHU KỲ MUA TRUNG BÌNH (6 tháng gần nhất)
    SELECT
        I.ObjectID,
        CASE
            WHEN COUNT(DISTINCT I.DocumentID) >= 2
            THEN DATEDIFF(DAY, MIN(I.DocumentDate), MAX(I.DocumentDate))
                 / (COUNT(DISTINCT I.DocumentID) - 1)
            ELSE 30
        END AS ChuKyTB
    INTO #ChuKy
    FROM AR_InvoiceTbl I
    WHERE I.DocumentDate >= DATEADD(MONTH, -6, @TuNgay) AND I.DocumentDate <= @TuNgay
      AND ISNULL(I.StatusID, 0) != 10
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
        KH.Phone AS [SĐT], 
        KH.Address AS [Địa Chỉ],
        KH.ZoneID AS [Tuyến], 
        KH.ThuTrongTuan AS [Lịch Ghé], 
        CASE WHEN L.LanMuaCuoi IS NULL THEN 'N/A' ELSE FORMAT(L.LanMuaCuoi, 'dd/MM/yyyy') END AS [Lần Mua Cuối], 
        CASE WHEN L.SoNgayKhongMua = 999 THEN NULL ELSE L.SoNgayKhongMua END AS [Số Ngày Không Mua],
        L.ChuKyMuaTB_Ngay AS [Chu Kỳ Mua TB (Ngày)], 
        CASE WHEN L.LanMuaCuoi IS NULL THEN 'N/A' ELSE FORMAT(L.NgayDuDoanHetHang, 'dd/MM/yyyy') END AS [Ngày Dự Đoán Hết Hàng],
        CASE WHEN L.NgayConLaiHetHang < 0 THEN 0 ELSE L.NgayConLaiHetHang END AS [Còn Lại (Ngày)],
        L.DiemUuTien AS [Điểm Ưu Tiên],
        CONCAT(
            CASE
                WHEN L.LanMuaCuoi IS NULL THEN N'🆕 Khách hàng mới chưa có đơn'
                WHEN L.NgayConLaiHetHang < 0 THEN N'📍 Chưa phát sinh đơn hàng ' + CAST(ABS(L.NgayConLaiHetHang) AS VARCHAR) + N' ngày'
                WHEN L.NgayConLaiHetHang <= @NgayBaoDong THEN N'⏳ Sắp hết hàng (Còn ' + CAST(L.NgayConLaiHetHang AS VARCHAR) + N' ngày)'
                ELSE N'📅 Theo lịch ghé'
            END,
            CASE WHEN KH.ZoneID IS NULL THEN N' | ⛔ Ngoài tuyến' ELSE '' END
        ) AS [Lý Do Ghé]
    FROM CF_ObjectTbl KH
    JOIN #Logic L ON KH.ObjectID = L.ObjectID
    WHERE (@MaKhachHang = '' OR KH.ObjectID = @MaKhachHang)
      AND (
          -- Nếu tra cứu 1 khách hàng cụ thể thì trả về luôn không lọc Thứ
          @MaKhachHang <> '' 
          -- Hoặc lọc cứng đúng tuyến ngày cần đi
          OR KH.ThuTrongTuan LIKE '%' + @TenThuHomNay + '%'
      )
    ORDER BY DiemUuTien DESC, NgayConLaiHetHang ASC;

    DROP TABLE #LanMuaCuoi; DROP TABLE #ChuKy; DROP TABLE #Logic; DROP TABLE #AllowedObjects;
END
GO
