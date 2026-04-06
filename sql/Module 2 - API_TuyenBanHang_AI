IF OBJECT_ID('API_TuyenBanHang_AI', 'P') IS NOT NULL DROP PROCEDURE API_TuyenBanHang_AI;
GO
CREATE PROCEDURE API_TuyenBanHang_AI
    @Username      VARCHAR(50) = '',
    @ObjectID      VARCHAR(50) = '',
    @SoNgayVangMat INT        = 45,
    @TopN          INT        = 8
AS
BEGIN
    SET NOCOUNT ON
   
   -- 0. KIỂM TRA ObjectID HỢP LỆ (Nếu có truyền vào)
   IF @ObjectID <> '' AND NOT EXISTS (SELECT 1 FROM CF_ObjectTbl WHERE ObjectID = @ObjectID)
   BEGIN
       SELECT 'N/A' AS ObjectID, N'❌ Không tìm thấy mã khách hàng.' AS TenCuaHang, NULL AS Phone, 0 AS TichLuyDatDuoc, N'Vui lòng kiểm tra lại mã khách hàng.' AS TrangThaiAI;
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
    DECLARE @ThuHomNay    VARCHAR(1)  = CAST(DATEPART(dw, GETDATE()) AS VARCHAR)


    SELECT
        @SYSBranchID  = COALESCE(BranchID,  ''),
        @SYSCeoID     = COALESCE(CeoID,     ''),
        @SYSManagerID = COALESCE(ManagerID, '')
    FROM SY_User WHERE UserName = @Username


    -- ═══ Lần mua cuối + Số ngày không mua ═══
    SELECT
        I.ObjectID,
        MAX(I.DocumentDate)                             AS LanMuaCuoi,
        DATEDIFF(DAY, MAX(I.DocumentDate), GETDATE())   AS SoNgayKhongMua
    INTO #LanMuaCuoi
    FROM AR_InvoiceTbl I
    WHERE ISNULL(I.StatusID, 0) != 10
      AND (@ObjectID     = '' OR I.ObjectID  = @ObjectID)
      AND (@SYSBranchID  = '' OR I.BranchID  = @SYSBranchID)
      AND (@SYSCeoID     = '' OR I.CeoID     = @SYSCeoID)
      AND (@SYSManagerID = '' OR I.ManagerID = @SYSManagerID)
    GROUP BY I.ObjectID


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
    WHERE I.DocumentDate >= DATEADD(MONTH, -6, GETDATE())
      AND ISNULL(I.StatusID, 0) != 10
      AND (@ObjectID     = '' OR I.ObjectID  = @ObjectID)
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
        DATEDIFF(DAY, GETDATE(), DATEADD(DAY, CK.ChuKyTB, LMC.LanMuaCuoi)) AS NgayConLaiHetHang,
        CAST(
            (CASE
                WHEN DATEDIFF(DAY, GETDATE(), DATEADD(DAY, CK.ChuKyTB, LMC.LanMuaCuoi)) <= 0  THEN 100
                WHEN DATEDIFF(DAY, GETDATE(), DATEADD(DAY, CK.ChuKyTB, LMC.LanMuaCuoi)) <= 5  THEN 80
                WHEN DATEDIFF(DAY, GETDATE(), DATEADD(DAY, CK.ChuKyTB, LMC.LanMuaCuoi)) <= 14 THEN 50
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
        KH.ObjectID, KH.ObjectName AS TenCuaHang, KH.Phone, KH.Address,
        KH.ZoneID AS Tuyen, KH.ThuTrongTuan AS LichGhe, FORMAT(L.LanMuaCuoi, 'MM/dd') AS LanMuaCuoi, L.SoNgayKhongMua,
        L.ChuKyMuaTB_Ngay, FORMAT(L.NgayDuDoanHetHang, 'MM/dd') AS NgayDuDoanHetHang,
        CASE WHEN L.NgayConLaiHetHang < 0 THEN 0 ELSE L.NgayConLaiHetHang END AS NgayConLaiHetHang,
        L.DiemUuTien,
        CONCAT(
            CASE
                WHEN L.NgayConLaiHetHang < 0 THEN N'📍 Chưa phát sinh đơn hàng ' + CAST(ABS(L.NgayConLaiHetHang) AS VARCHAR) + N' ngày'
                WHEN L.NgayConLaiHetHang <= 5 THEN N'⏳ Sắp hết hàng (Còn ' + CAST(L.NgayConLaiHetHang AS VARCHAR) + N' ngày)'
                ELSE N'📅 Theo lịch ghé'
            END,
            CASE WHEN KH.ZoneID IS NULL THEN N' | ⛔ Ngoài tuyến' ELSE '' END
        ) AS LyDoGhe
    FROM CF_ObjectTbl KH
    JOIN #Logic L ON KH.ObjectID = L.ObjectID
    WHERE (@ObjectID = '' OR KH.ObjectID = @ObjectID)
      AND L.SoNgayKhongMua >= @SoNgayVangMat
    ORDER BY DiemUuTien DESC, NgayConLaiHetHang ASC;


    DROP TABLE #LanMuaCuoi; DROP TABLE #ChuKy; DROP TABLE #Logic;
END
GO
