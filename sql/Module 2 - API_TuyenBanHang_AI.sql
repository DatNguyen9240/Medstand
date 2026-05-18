IF OBJECT_ID('API_TuyenBanHang_AI', 'P') IS NOT NULL DROP PROCEDURE API_TuyenBanHang_AI;
GO
CREATE PROCEDURE API_TuyenBanHang_AI
    @Username      VARCHAR(50) = '',
    @MaKhachHang   VARCHAR(50) = '',
    @SoNgayVangMat INT        = 45,
    @NgayBaoDong   INT        = 5,
    @TopN          INT        = 8,
    @NgayTarget    VARCHAR(20) = ''
AS
BEGIN
    SET NOCOUNT ON
   
   -- 0. KIỂM TRA khachhang HỢP LỆ (Nếu có truyền vào)
   IF @MaKhachHang <> '' AND NOT EXISTS (SELECT 1 FROM CF_ObjectTbl WHERE ObjectID = @MaKhachHang)
   BEGIN
       SELECT 'N/A' AS ObjectID, N'Không tìm thấy mã khách hàng.' AS TenCuaHang, NULL AS Phone, 0 AS TichLuyDatDuoc, N'Vui lòng kiểm tra lại mã khách hàng.' AS TrangThaiAI;
       RETURN;
   END
    SET DATEFIRST 7  -- Chủ nhật = 1, Thứ 2 = 2, ..., Thứ 7 = 7


    IF NOT EXISTS (SELECT 1 FROM SY_User WHERE UserName = @Username AND COALESCE(Disable, 0) = 0)
    BEGIN
        SELECT N'User không tồn tại hoặc đã bị khóa' AS Msg, 1 AS MsgType
        RETURN
    END


    DECLARE @SYSBranchID  VARCHAR(50) = ''
    DECLARE @SYSCeoID     VARCHAR(50) = ''
    DECLARE @SYSManagerID VARCHAR(50) = ''
    DECLARE @TuNgay DATETIME = CASE WHEN @NgayTarget = '' THEN GETDATE() ELSE TRY_CAST(@NgayTarget AS DATETIME) END
    IF @TuNgay IS NULL SET @TuNgay = GETDATE()
    DECLARE @ThuHomNay    VARCHAR(1)  = CAST(DATEPART(dw, @TuNgay) AS VARCHAR)


    SELECT
        @SYSBranchID  = COALESCE(BranchID,  ''),
        @SYSCeoID     = COALESCE(CeoID,     ''),
        @SYSManagerID = COALESCE(ManagerID, '')
    FROM SY_User WHERE UserName = @Username


    -- ═══ Lần mua cuối + Số ngày không mua (Tính cả hóa đơn & đơn nháp) ═══
    SELECT
        T.ObjectID,
        MAX(T.DocumentDate)                             AS LanMuaCuoi,
        DATEDIFF(DAY, MAX(T.DocumentDate), @TuNgay)   AS SoNgayKhongMua
    INTO #LanMuaCuoi
    FROM (
        SELECT ObjectID, DocumentDate, BranchID, CeoID, ManagerID 
        FROM AR_InvoiceTbl WHERE ISNULL(StatusID, 0) != 10
        UNION ALL
        SELECT ObjectID, DocumentDate, BranchID, CeoID, ManagerID 
        FROM AR_OrderTbl WHERE ISNULL(StatusID, 0) != 10
    ) T
    WHERE (@MaKhachHang   = '' OR T.ObjectID  = @MaKhachHang)
      AND (@SYSBranchID  = '' OR T.BranchID  = @SYSBranchID)
      AND (@SYSCeoID     = '' OR T.CeoID     = @SYSCeoID)
      AND (@SYSManagerID = '' OR T.ManagerID = @SYSManagerID)
    GROUP BY T.ObjectID


    -- ═══ Chu kỳ mua TB theo khách ═══
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
      AND (@MaKhachHang   = '' OR I.ObjectID  = @MaKhachHang)
      AND (@SYSBranchID  = '' OR I.BranchID  = @SYSBranchID)
      AND (@SYSCeoID     = '' OR I.CeoID     = @SYSCeoID)
      AND (@SYSManagerID = '' OR I.ManagerID = @SYSManagerID)
    GROUP BY I.ObjectID


    -- ═══════════════════════════════════════════════════════
    -- 3. LOGIC TÍNH TOÁN ĐIỂM & ĐỀ XUẤT
    -- ═══════════════════════════════════════════════════════
    SELECT
        KH.ObjectID,
        LMC.LanMuaCuoi,
        LMC.SoNgayKhongMua,
        CK.ChuKyTB AS ChuKyMuaTB_Ngay,
        DATEADD(DAY, CK.ChuKyTB, LMC.LanMuaCuoi) AS NgayDuDoanHetHang,
        DATEDIFF(DAY, @TuNgay, DATEADD(DAY, CK.ChuKyTB, LMC.LanMuaCuoi)) AS NgayConLaiHetHang,
        CAST(
            (CASE
                WHEN DATEDIFF(DAY, @TuNgay, DATEADD(DAY, CK.ChuKyTB, LMC.LanMuaCuoi)) <= 0  THEN 100
                WHEN DATEDIFF(DAY, @TuNgay, DATEADD(DAY, CK.ChuKyTB, LMC.LanMuaCuoi)) <= @NgayBaoDong  THEN 80
                WHEN DATEDIFF(DAY, @TuNgay, DATEADD(DAY, CK.ChuKyTB, LMC.LanMuaCuoi)) <= 14 THEN 50
                ELSE 0 END)
            + (CASE WHEN LMC.SoNgayKhongMua >= @SoNgayVangMat THEN 40 WHEN LMC.SoNgayKhongMua >= 30 THEN 20 ELSE 0 END)
            + (CASE WHEN KH.ThuTrongTuan LIKE '%' + @ThuHomNay + '%' THEN 30 ELSE 0 END)
        AS INT) AS DiemUuTien
    INTO #Logic
    FROM CF_ObjectTbl KH
    JOIN #LanMuaCuoi LMC ON KH.ObjectID = LMC.ObjectID
    JOIN #ChuKy CK       ON KH.ObjectID = CK.ObjectID
    WHERE ISNULL(KH.isDisable, 0) = 0 AND ISNULL(KH.isCustomer, 0) = 1;


    -- ═══════════════════════════════════════════════════════
    -- KẾT QUẢ 1: DANH SÁCH TUYẾN GHÉ (Tối ưu cho Sale)
    -- ═══════════════════════════════════════════════════════
    SELECT TOP (@TopN)
        KH.ObjectID, KH.ObjectName AS TenCuaHang, KH.Phone AS [SĐT], KH.Address AS [Địa Chỉ],
        KH.ZoneID AS [Tuyến], KH.ThuTrongTuan AS [Lịch Ghé], FORMAT(L.LanMuaCuoi, 'dd/MM/yyyy') AS [Lần Mua Cuối], L.SoNgayKhongMua AS [Số Ngày Không Mua],
        L.ChuKyMuaTB_Ngay AS [Chu Kỳ Mua TB (Ngày)], FORMAT(L.NgayDuDoanHetHang, 'dd/MM/yyyy') AS [Ngày Dự Đoán Hết Hàng],
        CASE WHEN L.NgayConLaiHetHang < 0 THEN 0 ELSE L.NgayConLaiHetHang END AS [Còn Lại (Ngày)],
        L.DiemUuTien AS [Điểm Ưu Tiên],
        CONCAT(
            CASE
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
          L.SoNgayKhongMua >= @SoNgayVangMat 
          OR L.NgayConLaiHetHang <= @NgayBaoDong 
          OR KH.ThuTrongTuan LIKE '%' + @ThuHomNay + '%'
      )
    ORDER BY DiemUuTien DESC, NgayConLaiHetHang ASC;


    DROP TABLE #LanMuaCuoi; DROP TABLE #ChuKy; DROP TABLE #Logic;
END
GO
