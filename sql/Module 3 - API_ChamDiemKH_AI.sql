USE medtest;
GO

-- ╔══════════════════════════════════════════════════════════════════════╗
-- ║  MODULE 3: AI CHẤM ĐIỂM KHÁCH HÀNG (RFM-C FRAMEWORK)              ║
-- ║  Triết lý: Không hardcode ngưỡng. Dùng PERCENT_RANK() để tự động   ║
-- ║  phân cụm dựa trên phân phối thực tế của toàn bộ thị trường.       ║
-- ║  Nhóm A = Top 20% doanh số. Nhóm B = Tiếp theo 30%. C = Còn lại.  ║
-- ╚══════════════════════════════════════════════════════════════════════╝
CREATE OR ALTER PROCEDURE API_ChamDiemKH_AI
    @Username      VARCHAR(50) = '',
    @MaKhachHang   NVARCHAR(100) = '',
    @NhomFilter    VARCHAR(50) = '',
    @EmployeeID    VARCHAR(50) = '',
    @BranchID      VARCHAR(50) = '',
    @RiskLevel     VARCHAR(20) = '',
    @Page          INT = 1,
    @PageSize      INT = 50,
    -- Trọng số RFM-C (CEO tùy chỉnh, mặc định cân bằng 4 chiều)
    @W_Recency     DECIMAL(18,2) = 0.25,  -- Trọng số Recency
    @W_Frequency   DECIMAL(18,2) = 0.25,  -- Trọng số Frequency
    @W_Monetary    DECIMAL(18,2) = 0.30,  -- Trọng số Monetary (ưu tiên hơn 1 chút)
    @W_Consumption DECIMAL(18,2) = 0.20   -- Trọng số Consumption
AS
BEGIN
    SET NOCOUNT ON

    SET @Page = CASE WHEN ISNULL(@Page, 0) < 1 THEN 1 ELSE @Page END
    SET @PageSize = CASE WHEN ISNULL(@PageSize, 0) < 1 THEN 50 WHEN @PageSize > 100 THEN 100 ELSE @PageSize END
    SET @EmployeeID = ISNULL(@EmployeeID, '')
    SET @BranchID = ISNULL(@BranchID, '')
    SET @RiskLevel = UPPER(ISNULL(@RiskLevel, ''))
    IF @RiskLevel NOT IN ('', 'LOW', 'MEDIUM', 'HIGH') SET @RiskLevel = ''

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

    -- Phạm vi tối đa luôn lấy từ ERP. Không có mapping thì không có dữ liệu
    -- (fail-closed), thay vì hiểu BranchID rỗng là được xem toàn hệ thống.
    CREATE TABLE #AllowedObjects (ObjectID VARCHAR(50) PRIMARY KEY)
    INSERT INTO #AllowedObjects (ObjectID)
    SELECT DISTINCT ObjectID FROM dbo.AR_GetObjectByUserFnc(@Username)

    -- Bộ lọc chi nhánh do client gửi chỉ được phép thu hẹp phạm vi của user.
    IF @SYSBranchID <> '' AND @BranchID <> '' AND @BranchID <> @SYSBranchID
    BEGIN
        SELECT N'Bạn không có quyền xem dữ liệu của chi nhánh đã chọn.' AS Msg, 1 AS MsgType
        DROP TABLE #AllowedObjects
        RETURN
    END

    -- SMART CUSTOMER RESOLUTION (NAME TO ID)
     IF @MaKhachHang <> '' AND NOT EXISTS (SELECT 1 FROM dbo.CF_ObjectTbl WHERE ObjectID = @MaKhachHang)
     BEGIN
         DECLARE @ResolvedID VARCHAR(50) = ''
         DECLARE @CleanSearch NVARCHAR(100) = dbo.ufn_clean_customer_name(@MaKhachHang)

         -- 1. Fast Path: Match by ObjectID or ObjectName directly without scalar function scan
         SELECT TOP 1 @ResolvedID = ObjectID 
         FROM dbo.CF_ObjectTbl 
         WHERE (ObjectID LIKE '%' + @CleanSearch + '%'
            OR ObjectName LIKE '%' + @CleanSearch + '%') AND (@SYSBranchID = '' OR BranchID = @SYSBranchID)
         ORDER BY 
             CASE WHEN ObjectID = @CleanSearch THEN 1
                  WHEN ObjectName = @CleanSearch THEN 2
                  WHEN ObjectName LIKE @CleanSearch + '%' THEN 3
                  ELSE 4
             END,
             COALESCE((SELECT MAX(DocumentDate) FROM AR_InvoiceTbl WHERE ObjectID = CF_ObjectTbl.ObjectID), '1900-01-01') DESC,
             LEN(ObjectName) ASC;

         -- 2. Slow Path: Fallback to heavy clean function scan only if Fast Path found nothing
         IF @ResolvedID = ''
         BEGIN
             SELECT TOP 1 @ResolvedID = ObjectID 
             FROM dbo.CF_ObjectTbl 
             WHERE (dbo.ufn_clean_customer_name(ObjectName) LIKE '%' + @CleanSearch + '%'
                OR ObjectID LIKE '%' + @CleanSearch + '%') AND (@SYSBranchID = '' OR BranchID = @SYSBranchID)
             ORDER BY 
                 CASE WHEN ObjectID = @CleanSearch THEN 1
                      WHEN dbo.ufn_clean_customer_name(ObjectName) = @CleanSearch THEN 2
                      WHEN dbo.ufn_clean_customer_name(ObjectName) LIKE @CleanSearch + '%' THEN 3
                      ELSE 4
                 END,
                 COALESCE((SELECT MAX(DocumentDate) FROM AR_InvoiceTbl WHERE ObjectID = CF_ObjectTbl.ObjectID), '1900-01-01') DESC,
                 LEN(ObjectName) ASC;
         END

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
    JOIN #AllowedObjects AO ON AO.ObjectID = I.ObjectID
    WHERE I.DocumentDate >= DATEADD(MONTH, -12, GETDATE())
      AND ISNULL(I.StatusID, 0) != 10
      AND (@SYSBranchID = '' OR I.BranchID = @SYSBranchID)
      AND (@BranchID = '' OR I.BranchID = @BranchID)
      AND (@EmployeeID = '' OR I.EmployeeID = @EmployeeID)
    GROUP BY I.ObjectID

    -- ═══ BƯỚC 2: NORMALIZATION — Chuẩn hóa về thang 0-100 bằng PERCENT_RANK ═══
    -- Không hardcode ngưỡng. Hệ thống tự tính dựa trên phân phối thực tế.
    SELECT
        ObjectID,
        Recency_Days, Frequency_6M, Monetary_12M, LanMuaCuoi,
        DoanhSo3ThangGan, DoanhSo3ThangTruoc,
        -- R: Đảo ngược (ngày ít = tốt hơn)
        CAST(PERCENT_RANK() OVER (ORDER BY Recency_Days DESC) * 100 AS INT)                AS R_Score,
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
    -- Nhom/ValueSegment phản ánh giá trị RFM-C. RiskLevel là chiều rủi ro
    -- riêng, tránh ép khách giá trị cao xuống nhóm C chỉ vì lâu chưa mua.
    SELECT
        F.*,
        CASE
            WHEN TotalScore >= PERCENTILE_CONT(0.80) WITHIN GROUP (ORDER BY TotalScore) OVER () THEN 'A'
            WHEN TotalScore >= PERCENTILE_CONT(0.50) WITHIN GROUP (ORDER BY TotalScore) OVER () THEN 'B'
            ELSE 'C'
        END AS ValueSegment,
        CASE
            WHEN TotalScore >= PERCENTILE_CONT(0.80) WITHIN GROUP (ORDER BY TotalScore) OVER () THEN 'A'
            WHEN TotalScore >= PERCENTILE_CONT(0.50) WITHIN GROUP (ORDER BY TotalScore) OVER () THEN 'B'
            ELSE 'C'
        END AS Nhom,
        CASE WHEN Recency_Days >= 90 THEN 'HIGH'
             WHEN Recency_Days >= 45 OR DoanhSo3ThangGan < DoanhSo3ThangTruoc * 0.8 THEN 'MEDIUM'
             ELSE 'LOW' END AS RiskLevel
    INTO #Segmented
    FROM #Final F

    -- ═══ KẾT QUẢ ═══
    ;WITH Result AS (
        SELECT
            KH.ObjectID, KH.ObjectName AS TenCuaHang, KH.Phone,
            S.Nhom, S.ValueSegment, S.RiskLevel,
            CASE S.Nhom WHEN 'A' THEN N'Khách VIP (Top 20%)'
                        WHEN 'B' THEN N'Khách hàng thường'
                        WHEN 'C' THEN N'Khách giá trị thấp' END AS PhanLoai,
            S.TotalScore AS DiemTongHop,
            S.R_Score, S.F_Score, S.M_Score, S.C_Score,
            CAST(S.Monetary_12M AS BIGINT) AS DoanhSo12Thang,
            CAST(S.DoanhSo3ThangGan AS BIGINT) AS DoanhSo3ThangGan,
            S.LanMuaCuoi, S.Recency_Days AS SoNgayKhongMua,
            CASE WHEN S.DoanhSo3ThangTruoc = 0 THEN N'Khách mới hoặc chưa đủ chu kỳ'
                 WHEN S.DoanhSo3ThangGan > S.DoanhSo3ThangTruoc * 1.1 THEN N'Tăng trưởng'
                 WHEN S.DoanhSo3ThangGan < S.DoanhSo3ThangTruoc * 0.9 THEN N'Sụt giảm'
                 ELSE N'Ổn định' END AS XuHuong,
            CASE WHEN S.Recency_Days >= 90
                    THEN N'Không phát sinh đơn hàng trong ' + CAST(S.Recency_Days AS NVARCHAR(10)) + N' ngày.'
                 WHEN S.DoanhSo3ThangTruoc > 0 AND S.DoanhSo3ThangGan < S.DoanhSo3ThangTruoc * 0.8
                    THEN N'Doanh số 3 tháng gần nhất giảm trên 20% so với kỳ trước.'
                 WHEN KH.DateCreate >= DATEADD(DAY,-30,GETDATE())
                    THEN N'Khách mới, chưa đủ dữ liệu lịch sử để đánh giá ổn định.'
                 ELSE N'Phân nhóm theo điểm Recency, Frequency, Monetary và Consumption.' END AS LyDoChinh,
            CASE WHEN S.RiskLevel = 'HIGH' THEN 3 WHEN S.RiskLevel = 'MEDIUM' THEN 2 ELSE 1 END AS RiskPriority
        FROM CF_ObjectTbl KH
        JOIN #Segmented S ON KH.ObjectID = S.ObjectID
        WHERE ISNULL(KH.isDisable, 0) = 0 AND ISNULL(KH.isCustomer, 0) = 1
          AND (@MaKhachHang = '' OR KH.ObjectID = @MaKhachHang)
          AND (@NhomFilter = '' OR S.Nhom = @NhomFilter)
          AND (@RiskLevel = '' OR S.RiskLevel = @RiskLevel)
    ), Numbered AS (
        SELECT *, COUNT(*) OVER () AS TotalRows
        FROM Result
    )
    SELECT ObjectID, TenCuaHang, Phone, Nhom, ValueSegment, RiskLevel,
           PhanLoai, DiemTongHop, R_Score, F_Score, M_Score, C_Score,
           DoanhSo12Thang, DoanhSo3ThangGan,
           CONVERT(VARCHAR(10), LanMuaCuoi, 103) AS LanMuaCuoi,
           SoNgayKhongMua, XuHuong, LyDoChinh, TotalRows,
           @Page AS [Page], @PageSize AS PageSize
    FROM Numbered
    ORDER BY RiskPriority DESC, DiemTongHop DESC, ObjectID ASC
    OFFSET ((@Page - 1) * @PageSize) ROWS FETCH NEXT @PageSize ROWS ONLY

    DROP TABLE #AllowedObjects; DROP TABLE #Raw; DROP TABLE #Scored; DROP TABLE #Final; DROP TABLE #Segmented;
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
