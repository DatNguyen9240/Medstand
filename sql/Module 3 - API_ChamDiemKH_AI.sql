IF OBJECT_ID('API_ChamDiemKH_AI', 'P') IS NOT NULL DROP PROCEDURE API_ChamDiemKH_AI;
GO

-- ╔══════════════════════════════════════════════════════════════════════╗
-- ║  MODULE 3: AI CHẤM ĐIỂM KHÁCH HÀNG (RFM-C FRAMEWORK)              ║
-- ║  Triết lý: Không hardcode ngưỡng. Dùng PERCENT_RANK() để tự động   ║
-- ║  phân cụm dựa trên phân phối thực tế của toàn bộ thị trường.       ║
-- ║  Nhóm A = Top 20% doanh số. Nhóm B = Tiếp theo 30%. C = Còn lại.  ║
-- ╚══════════════════════════════════════════════════════════════════════╝
CREATE PROCEDURE API_ChamDiemKH_AI
    @Username      VARCHAR(50) = '',
    @MaKhachHang   NVARCHAR(100) = '',
    @NhomFilter    VARCHAR(50) = '',
    -- Trọng số RFM-C (CEO tùy chỉnh, mặc định cân bằng 4 chiều)
    @W_Recency     DECIMAL(18,2) = 0.25,  -- Trọng số Recency
    @W_Frequency   DECIMAL(18,2) = 0.25,  -- Trọng số Frequency
    @W_Monetary    DECIMAL(18,2) = 0.30,  -- Trọng số Monetary (ưu tiên hơn 1 chút)
    @W_Consumption DECIMAL(18,2) = 0.20   -- Trọng số Consumption
AS
BEGIN
    SET NOCOUNT ON

    -- Tự động chuẩn hóa nếu người dùng truyền trọng số dạng % (ví dụ: 30.0 thay vì 0.3)
    IF @W_Recency > 1.0 OR @W_Frequency > 1.0 OR @W_Monetary > 1.0 OR @W_Consumption > 1.0
    BEGIN
        SET @W_Recency = @W_Recency / 100.0
        SET @W_Frequency = @W_Frequency / 100.0
        SET @W_Monetary = @W_Monetary / 100.0
        SET @W_Consumption = @W_Consumption / 100.0
    END

    -- 0. Kiểm tra quyền
    IF NOT EXISTS (SELECT 1 FROM SY_User WHERE UserName = @Username AND COALESCE(Disable, 0) = 0)
    BEGIN
        SELECT N'User không tồn tại hoặc đã bị khóa' AS Msg, 1 AS MsgType RETURN
    END

    -- Chuẩn hóa tham số NhomFilter (chấp nhận cả tiếng Việt lẫn ký tự)
    IF UPPER(@NhomFilter) LIKE '%VIP%' OR @NhomFilter = 'A'           SET @NhomFilter = 'A'
    ELSE IF UPPER(@NhomFilter) LIKE '%ỔN ĐỊNH%' OR @NhomFilter = 'B' SET @NhomFilter = 'B'
    ELSE IF UPPER(@NhomFilter) LIKE '%NGUY CƠ%' OR @NhomFilter = 'C' SET @NhomFilter = 'C'
    ELSE IF @NhomFilter != ''                                          SET @NhomFilter = ''

    -- Dọn rác nếu AI nhận diện nhầm NhomFilter thành MaKhachHang
    IF @MaKhachHang LIKE '%NhomFilter%' OR UPPER(@MaKhachHang) LIKE '%VIP%'
       OR UPPER(@MaKhachHang) LIKE '%ỔN ĐỊNH%' OR UPPER(@MaKhachHang) LIKE '%NGUY CƠ%'
        SET @MaKhachHang = ''

    DECLARE @SYSBranchID VARCHAR(50) = ''
    SELECT @SYSBranchID = COALESCE(BranchID, '') FROM SY_User WHERE UserName = @Username

    -- SMART CUSTOMER RESOLUTION (NAME TO ID)
    IF @MaKhachHang <> '' AND NOT EXISTS (SELECT 1 FROM dbo.CF_ObjectTbl WHERE ObjectID = @MaKhachHang)
    BEGIN
        DECLARE @ResolvedID VARCHAR(50) = ''
        DECLARE @CleanSearch NVARCHAR(100) = REPLACE(dbo.ufn_remove_accents(@MaKhachHang), ' ', '')

        SELECT TOP 1 @ResolvedID = ObjectID 
        FROM dbo.CF_ObjectTbl 
        WHERE (REPLACE(dbo.ufn_remove_accents(ObjectName), ' ', '') LIKE '%' + @CleanSearch + '%'
           OR ObjectID LIKE '%' + @CleanSearch + '%')
           AND (@SYSBranchID = '' OR BranchID = @SYSBranchID)
        ORDER BY 
            CASE WHEN ObjectID = @CleanSearch THEN 1
                 WHEN REPLACE(dbo.ufn_remove_accents(ObjectName), ' ', '') = @CleanSearch THEN 2
                 WHEN REPLACE(dbo.ufn_remove_accents(ObjectName), ' ', '') LIKE @CleanSearch + '%' THEN 3
                 ELSE 4
            END,
            COALESCE((SELECT MAX(DocumentDate) FROM AR_InvoiceTbl WHERE ObjectID = CF_ObjectTbl.ObjectID), '1900-01-01') DESC,
            LEN(ObjectName) ASC;

        IF @ResolvedID <> ''
        BEGIN
            SET @MaKhachHang = @ResolvedID
        END
    END


    -- ═══ BƯỚC 1: AGGREGATION — Gom dữ liệu 12 tháng gần nhất ═══
    SELECT
        I.ObjectID,
        -- R: Recency — Số ngày kể từ lần mua gần nhất (càng thấp càng tốt)
        DATEDIFF(DAY, MAX(I.DocumentDate), GETDATE())                                       AS Recency_Days,
        -- F: Frequency — Số đơn hàng trong 6 tháng
        COUNT(DISTINCT CASE WHEN I.DocumentDate >= DATEADD(MONTH,-6,GETDATE())
                            THEN I.DocumentID END)                                           AS Frequency_6M,
        -- M: Monetary — Tổng doanh số 12 tháng
        SUM(D.TotalAmount)                                                                  AS Monetary_12M,
        -- C: Consumption — Doanh số 3 tháng gần / Doanh số 3 tháng trước
        -- (Đo tốc độ tiêu thụ thực tế, không phải tồn kho)
        SUM(CASE WHEN I.DocumentDate >= DATEADD(MONTH,-3,GETDATE())
                 THEN D.TotalAmount ELSE 0 END)                                             AS DoanhSo3ThangGan,
        SUM(CASE WHEN I.DocumentDate BETWEEN DATEADD(MONTH,-6,GETDATE())
                                         AND DATEADD(MONTH,-3,GETDATE())
                 THEN D.TotalAmount ELSE 0 END)                                             AS DoanhSo3ThangTruoc,
        MAX(I.DocumentDate)                                                                 AS LanMuaCuoi
    INTO #Raw
    FROM AR_InvoiceTbl I
    JOIN AR_InvoiceDetailTbl D ON I.DocumentID = D.DocumentID
    WHERE I.DocumentDate >= DATEADD(MONTH, -12, GETDATE())
      AND ISNULL(I.StatusID, 0) != 10
      AND (@SYSBranchID = '' OR I.BranchID = @SYSBranchID)
    GROUP BY I.ObjectID

    -- ═══ BƯỚC 2: NORMALIZATION — Chuẩn hóa về thang 0-100 bằng PERCENT_RANK ═══
    -- Không hardcode ngưỡng. Hệ thống tự tính dựa trên phân phối thực tế.
    SELECT
        ObjectID,
        Recency_Days, Frequency_6M, Monetary_12M, LanMuaCuoi,
        DoanhSo3ThangGan, DoanhSo3ThangTruoc,
        -- R: Đảo ngược (ngày ít = tốt hơn)
        CAST((1 - PERCENT_RANK() OVER (ORDER BY Recency_Days DESC)) * 100 AS INT)          AS R_Score,
        -- F: Thuận chiều (nhiều đơn = tốt hơn)
        CAST(PERCENT_RANK() OVER (ORDER BY Frequency_6M ASC) * 100 AS INT)                 AS F_Score,
        -- M: Thuận chiều (doanh số cao = tốt hơn)
        CAST(PERCENT_RANK() OVER (ORDER BY Monetary_12M ASC) * 100 AS INT)                 AS M_Score,
        -- C: Tốc độ tăng tiêu thụ (3T gần / 3T trước — phòng thủ chia cho 0)
        CAST(PERCENT_RANK() OVER (
            ORDER BY (DoanhSo3ThangGan * 1.0 / NULLIF(DoanhSo3ThangTruoc, 0)) ASC
        ) * 100 AS INT)                                                                     AS C_Score
    INTO #Scored
    FROM #Raw

    -- ═══ BƯỚC 3: SCORING — Tính điểm tổng hợp theo trọng số CEO ═══
    SELECT
        ObjectID, Recency_Days, Frequency_6M, Monetary_12M, LanMuaCuoi,
        DoanhSo3ThangGan, DoanhSo3ThangTruoc,
        R_Score, F_Score, M_Score, C_Score,
        CAST(
            (@W_Recency * R_Score)
          + (@W_Frequency * F_Score)
          + (@W_Monetary * M_Score)
          + (@W_Consumption * C_Score)
        AS INT)                                                                              AS TotalScore
    INTO #Final
    FROM #Scored

    -- ═══ BƯỚC 4: SEGMENTATION — Phân cụm tự động theo phân phối ═══
    -- Nhóm A = Top 20% TotalScore (không hardcode 50tr)
    -- Nhóm B = Tiếp theo 30%
    -- Nhóm C = 50% còn lại hoặc không mua > 90 ngày
    SELECT
        F.*,
        CASE
            WHEN Recency_Days >= 90 THEN 'C'     -- Ưu tiên: bỏ rơi = luôn là C
            WHEN TotalScore >= PERCENTILE_CONT(0.80) WITHIN GROUP (ORDER BY TotalScore) OVER () THEN 'A'
            WHEN TotalScore >= PERCENTILE_CONT(0.50) WITHIN GROUP (ORDER BY TotalScore) OVER () THEN 'B'
            ELSE 'C'
        END AS Nhom
    INTO #Segmented
    FROM #Final F

    -- ═══ KẾT QUẢ ═══
    SELECT
        KH.ObjectID,
        KH.ObjectName                   AS TenCuaHang,
        KH.Phone,
        S.Nhom,
        CASE S.Nhom
            WHEN 'A' THEN N'Khách VIP (Top 20%)'
            WHEN 'B' THEN N'Khách Hàng Thường'
            WHEN 'C' THEN N'Khách Có Nguy Cơ (Dưới chuẩn)'
        END                             AS PhanLoai,
        S.TotalScore                    AS DiemTongHop,
        S.R_Score, S.F_Score, S.M_Score, S.C_Score,
        CAST(S.Monetary_12M AS BIGINT)  AS DoanhSo12Thang,
        CAST(S.DoanhSo3ThangGan AS BIGINT) AS DoanhSo3ThangGan,
        FORMAT(S.LanMuaCuoi,'dd/MM/yyyy') AS LanMuaCuoi,
        S.Recency_Days                  AS SoNgayKhongMua,
        -- Xu hướng tiêu thụ (C): Phòng thủ NULLIF
        CASE
            WHEN S.DoanhSo3ThangTruoc = 0                                      THEN N'Khách mới (chưa đủ chu kỳ)'
            WHEN S.DoanhSo3ThangGan > S.DoanhSo3ThangTruoc * 1.1              THEN N'Tăng trưởng'
            WHEN S.DoanhSo3ThangGan < S.DoanhSo3ThangTruoc * 0.9              THEN N'Sụt giảm'
            ELSE N'Ổn định'
        END                             AS XuHuong,
        -- Cảnh báo AI
        CASE
            WHEN S.Recency_Days >= 90  THEN N'NGUY CƠ: Đã quá 90 ngày chưa có đơn hàng'
            WHEN S.Nhom = 'A' AND S.DoanhSo3ThangGan < S.DoanhSo3ThangTruoc * 0.8
                                       THEN N'Cảnh báo: Khách VIP đang sụt giảm mạnh'
            WHEN KH.DateCreate >= DATEADD(DAY,-30,GETDATE())
                                       THEN N'Khách mới: Cần chăm sóc đơn đầu tiên'
            ELSE NULL
        END                             AS CanhBaoAI
    FROM CF_ObjectTbl KH
    JOIN #Segmented S ON KH.ObjectID = S.ObjectID
    WHERE ISNULL(KH.isDisable, 0) = 0 AND ISNULL(KH.isCustomer, 0) = 1
      AND (@MaKhachHang = '' OR KH.ObjectID = @MaKhachHang)
      AND (@NhomFilter  = '' OR S.Nhom = @NhomFilter)
    ORDER BY S.TotalScore DESC

    DROP TABLE #Raw; DROP TABLE #Scored; DROP TABLE #Final; DROP TABLE #Segmented;
END
GO

/* -- TEST SCRIPT --
-- Xem toàn bộ bảng xếp hạng
EXEC API_ChamDiemKH_AI @Username = 'admin';

-- Chỉ xem nhóm VIP
EXEC API_ChamDiemKH_AI @Username = 'admin', @NhomFilter = 'A';

-- Thay trọng số: CEO muốn ưu tiên tần suất mua hơn
EXEC API_ChamDiemKH_AI @Username = 'admin', @W_Recency=0.20, @W_Frequency=0.40, @W_Monetary=0.25, @W_Consumption=0.15;

-- Xem chi tiết 1 khách
EXEC API_ChamDiemKH_AI @Username = 'admin', @MaKhachHang = 'KH001';
*/
