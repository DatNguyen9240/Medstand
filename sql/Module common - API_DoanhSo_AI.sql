USE medtest;
GO

CREATE OR ALTER PROCEDURE [dbo].[API_DoanhSo_AI]
    @BotType      VARCHAR(50)    = '',
    @Username     VARCHAR(50)    = '',
    @User         VARCHAR(50)    = '', -- Dashboard alias
    @MaKhachHang  NVARCHAR(100)   = '',
    @ObjectName   NVARCHAR(200)  = '',
    @EmployeeID   VARCHAR(50)    = '',
    @TenNhanVien  NVARCHAR(200)  = '',
    @TenSanPham   NVARCHAR(200)  = '',
    @TuNgay       DATETIME       = NULL,
    @DenNgay      DATETIME       = NULL,
    @FromDate     DATETIME       = NULL, -- Dashboard alias
    @ToDate       DATETIME       = NULL, -- Dashboard alias
    @TopN         INT            = 50,
    @LoaiBaoCao   VARCHAR(50)    = 'TatCa',
    @ManagerID    VARCHAR(50)    = '',
    @BranchID     VARCHAR(50)    = '', -- Dashboard alias
    @CeoID        VARCHAR(50)    = '', -- Dashboard alias
    -- Context parameters injected automatically by .NET server from claims
    @SYSBranchID  VARCHAR(50)    = '',
    @SYSCeoID     VARCHAR(50)    = '',
    @SYSManagerID VARCHAR(50)    = '',
    @SYSEmployeeID VARCHAR(50)   = ''
AS
BEGIN
    SET NOCOUNT ON;
    SET ANSI_WARNINGS OFF;
    
    -- MAPPING DASHBOARD PARAMETERS
    IF NULLIF(@User, '') IS NOT NULL AND EXISTS (SELECT 1 FROM SY_User WITH (NOLOCK) WHERE (UserName = @User OR HoTen = @User) AND COALESCE(Disable, 0) = 0)
    BEGIN
        SET @Username = @User;
    END
    IF @FromDate IS NOT NULL SET @TuNgay = @FromDate;
    IF @ToDate IS NOT NULL SET @DenNgay = @ToDate;
    IF @TopN IS NULL OR @TopN <= 0 SET @TopN = 50;
    
    -- SANITIZE NULLS FROM C# WRAPPER
    SET @MaKhachHang = COALESCE(@MaKhachHang, '');
    SET @ObjectName = COALESCE(@ObjectName, '');
    SET @EmployeeID = COALESCE(@EmployeeID, '');
    SET @TenNhanVien = COALESCE(@TenNhanVien, '');
    SET @ManagerID = COALESCE(@ManagerID, '');
    SET @BranchID = COALESCE(@BranchID, '');
    SET @CeoID = COALESCE(@CeoID, '');
    SET @TenSanPham = COALESCE(@TenSanPham, '');
    SET @LoaiBaoCao = COALESCE(@LoaiBaoCao, 'TatCa');

    DECLARE @BC TABLE (EmployeeID VARCHAR(50), EmployeeName NVARCHAR(200), ManagerID VARCHAR(50), BranchID VARCHAR(50), DoanhSo MONEY, DoanhThuDaThu MONEY);
    DECLARE @BC2 TABLE (ObjectID VARCHAR(50), ObjectName NVARCHAR(200), DoanhSo MONEY, DoanhThuDaThu MONEY);
    DECLARE @BC3 TABLE (ItemID VARCHAR(50), ItemName NVARCHAR(200), SoLuong FLOAT, DoanhSo MONEY, DoanhThuDaThu MONEY);
    
    -- 1. Validate User
    IF NOT EXISTS (SELECT 1 FROM SY_User WHERE (UserName = @Username OR HoTen = @Username) AND COALESCE(Disable, 0) = 0)
    BEGIN
        SELECT N'User không tồn tại hoặc đã bị khóa' AS Msg, 1 AS MsgType
        RETURN
    END

    -- 3. Lấy quyền user cục bộ với cơ chế fallback thông minh (moved up for date fallback)
    DECLARE @SYS_BranchID    VARCHAR(50) = ISNULL(@SYSBranchID, '')
    DECLARE @SYS_CeoID       VARCHAR(50) = ISNULL(@SYSCeoID, '')
    DECLARE @SYS_ManagerID   VARCHAR(50) = ISNULL(@SYSManagerID, '')
    DECLARE @SYS_EmployeeID  VARCHAR(50) = ISNULL(@SYSEmployeeID, '')
    DECLARE @IsManager       BIT         = 0
    DECLARE @SYSUserGroupID VARCHAR(50)  = ''

    -- Ưu tiên tìm theo UserName trước
    IF NULLIF(@Username, '') IS NOT NULL
    BEGIN
        SELECT TOP 1
            @SYS_BranchID    = COALESCE(BranchID, ''),
            @SYS_CeoID       = COALESCE(CeoID, ''),
            @SYS_ManagerID   = COALESCE(ManagerID, ''),
            @SYS_EmployeeID  = COALESCE(EmployeeID, ''),
            @IsManager       = COALESCE(Manager, 0),
            @SYSUserGroupID = COALESCE(UserGroupID, '')
        FROM SY_User 
        WHERE (UserName = @Username OR HoTen = @Username) AND COALESCE(Disable, 0) = 0
    END
    -- Nếu không có Username nhưng có mã EmployeeID, tra cứu ngược lại từ SY_User
    ELSE IF NULLIF(@SYS_EmployeeID, '') IS NOT NULL OR NULLIF(@EmployeeID, '') IS NOT NULL
    BEGIN
        DECLARE @EmpLookup VARCHAR(50) = COALESCE(NULLIF(@SYS_EmployeeID, ''), @EmployeeID)
        SELECT TOP 1
            @Username        = UserName,
            @SYS_BranchID    = COALESCE(BranchID, ''),
            @SYS_CeoID       = COALESCE(CeoID, ''),
            @SYS_ManagerID   = COALESCE(ManagerID, ''),
            @SYS_EmployeeID  = COALESCE(EmployeeID, ''),
            @IsManager       = COALESCE(Manager, 0),
            @SYSUserGroupID  = COALESCE(UserGroupID, '')
        FROM SY_User 
        WHERE EmployeeID = @EmpLookup AND COALESCE(Disable, 0) = 0
        ORDER BY Manager DESC
    END

    -- 2. Defaults (with UAT date fallback)
    IF @TuNgay IS NULL
    BEGIN
        IF EXISTS (SELECT 1 FROM dbo.AR_InvoiceTbl WITH (NOLOCK) WHERE DocumentDate >= DATEADD(MONTH, -1, GETDATE()))
        BEGIN
            SET @TuNgay = DATEADD(MONTH, -1, GETDATE())
        END
        ELSE
        BEGIN
            SET @TuNgay = DATEADD(YEAR, -10, GETDATE())
        END
    END
    IF @DenNgay IS NULL SET @DenNgay = GETDATE()

    -- Fix bounds: 00:00:00 to 23:59:59 (Safe Math Version)
    SET @TuNgay = DATEADD(DAY, DATEDIFF(DAY, 0, @TuNgay), 0)
    SET @DenNgay = DATEADD(SECOND, -1, DATEADD(DAY, 1, DATEADD(DAY, DATEDIFF(DAY, 0, @DenNgay), 0)))

    -- SMART CUSTOMER RESOLUTION (NAME TO ID)
     IF @MaKhachHang <> '' AND NOT EXISTS (SELECT 1 FROM dbo.CF_ObjectTbl WHERE ObjectID = @MaKhachHang)
     BEGIN
         DECLARE @ResolvedID VARCHAR(50) = ''
         DECLARE @CleanSearch NVARCHAR(100) = dbo.ufn_clean_customer_name(@MaKhachHang)

         -- 1. Fast Path: Match by ObjectID or ObjectName directly without scalar function scan
         SELECT TOP 1 @ResolvedID = ObjectID 
         FROM dbo.CF_ObjectTbl 
         WHERE (ObjectID LIKE '%' + @CleanSearch + '%'
            OR ObjectName LIKE '%' + @CleanSearch + '%') AND (@SYS_BranchID = '' OR BranchID = @SYS_BranchID)
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
                OR REPLACE(dbo.ufn_clean_customer_name(ObjectName), ' ', '') LIKE '%' + REPLACE(@CleanSearch, ' ', '') + '%'
                OR ObjectID LIKE '%' + @CleanSearch + '%') AND (@SYS_BranchID = '' OR BranchID = @SYS_BranchID)
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

     IF @MaKhachHang <> '' AND NOT EXISTS (
         SELECT 1 FROM dbo.CF_ObjectTbl
         WHERE ObjectID = @MaKhachHang AND ISNULL(isCustomer, 0) = 1 AND ISNULL(isDisable, 0) = 0
     )
     BEGIN
         SELECT N'Mã khách hàng không hợp lệ hoặc không tồn tại.' AS Msg, 1 AS MsgType
         RETURN
     END

    -- SMART AI ID ROUTING
    DECLARE @ExtractedID VARCHAR(50) = ''
    -- Lấy ']' đầu tiên NẰM SAU '[' để không sinh độ dài âm cho SUBSTRING (Msg 536)
    DECLARE @BracketOpen  INT = 0
    DECLARE @BracketClose INT = 0


    SET @BracketOpen  = CHARINDEX('[', @TenNhanVien)
    SET @BracketClose = CHARINDEX(']', @TenNhanVien, @BracketOpen + 1)
    IF @BracketOpen > 0 AND @BracketClose > @BracketOpen
    BEGIN
        SET @ExtractedID = SUBSTRING(@TenNhanVien, @BracketOpen + 1, @BracketClose - @BracketOpen - 1)
        IF EXISTS (SELECT 1 FROM SY_User WHERE EmployeeID = @ExtractedID)
        BEGIN
            SET @EmployeeID = @ExtractedID
            SET @TenNhanVien = ''
        END
    END

    -- Trích xuất ManagerID dạng ngoặc vuông [QLBH024] nếu có
    SET @BracketOpen  = CHARINDEX('[', @ManagerID)
    SET @BracketClose = CHARINDEX(']', @ManagerID, @BracketOpen + 1)
    IF @BracketOpen > 0 AND @BracketClose > @BracketOpen
    BEGIN
        SET @ExtractedID = SUBSTRING(@ManagerID, @BracketOpen + 1, @BracketClose - @BracketOpen - 1)
        IF EXISTS (SELECT 1 FROM SY_User WHERE EmployeeID = @ExtractedID)
        BEGIN
            SET @ManagerID = @ExtractedID
        END
    END

    -- TỰ ĐỘNG CHUYỂN HƯỚNG MÃ SALE SANG MÃ QUẢN LÝ (Nếu mã đó thực chất là một Manager)
    IF @EmployeeID <> '' AND EXISTS (SELECT 1 FROM SY_User WHERE EmployeeID = @EmployeeID AND COALESCE(Manager, 0) = 1)
    BEGIN
        SET @ManagerID = @EmployeeID
        SET @EmployeeID = ''
    END

    -- TỰ ĐỘNG CHUYỂN HƯỚNG TÊN QUẢN LÝ SANG @ManagerID (Để hiển thị doanh số nhân viên cấp dưới)
    IF @TenNhanVien <> '' AND EXISTS (SELECT 1 FROM SY_User WHERE (HoTen LIKE '%' + @TenNhanVien + '%' OR UserName LIKE '%' + @TenNhanVien + '%') AND COALESCE(Manager, 0) = 1)
    BEGIN
        SELECT TOP 1 @ManagerID = EmployeeID FROM SY_User WHERE (HoTen LIKE '%' + @TenNhanVien + '%' OR UserName LIKE '%' + @TenNhanVien + '%') AND COALESCE(Manager, 0) = 1
        SET @TenNhanVien = ''
    END

    -- 3. (User permissions loaded at the top to resolve date fallback)
    -- Kept empty to preserve line layout structure.

    -- =========================================================
    -- DỒN LỰC KHẮC PHỤC LỖI CLAIMS CACHE TRÊN WEB DASHBOARD
    -- Nếu C# backend truyền sai/cũ các bộ lọc do nhớ cache claims,
    -- stored procedure tự động ghi đè bằng dữ liệu thực tế từ SY_User.
    -- =========================================================
    IF NULLIF(@Username, '') IS NOT NULL AND @SYSUserGroupID <> 'Admin'
    BEGIN
        IF @IsManager = 1
        BEGIN
            -- Nếu là Manager: Giữ nguyên BranchID để lọc chi nhánh nếu đúng
            IF @BranchID = '' OR @BranchID <> @SYS_BranchID SET @BranchID = @SYS_BranchID;
            -- Bắt buộc lọc theo đúng ManagerID thực tế của họ trong DB
            SET @ManagerID = @SYS_EmployeeID;
            -- Bỏ qua lọc EmployeeID nếu họ chưa chọn nhân viên cụ thể
            IF @EmployeeID <> '' AND NOT EXISTS (SELECT 1 FROM SY_User WHERE EmployeeID = @EmployeeID AND ManagerID = @SYS_EmployeeID)
            BEGIN
                SET @EmployeeID = ''; -- Tránh manager truyền bậy mã NV không thuộc quyền quản lý
            END
        END
        ELSE
        BEGIN
            -- Nếu là Trình Dược Viên (TDV):
            -- Bắt buộc lọc chính xác theo EmployeeID thực tế của họ trong DB
            SET @EmployeeID = @SYS_EmployeeID;
            -- Xóa trắng các bộ lọc khác của Quản lý/CEO để tránh xung đột gây rỗng dữ liệu
            SET @ManagerID = '';
            SET @CeoID = '';
            SET @BranchID = '';
        END
    END

    -- TatCa giữ nguyên để trả đủ ba nhóm trong phạm vi phân quyền:
    -- nhân viên, khách hàng và sản phẩm.

    -- =========================================================
    -- ĐẶC CÁCH CHO WEB DASHBOARD.
    -- AR_OrderAndReturnView là nguồn net hiện có của hệ thống; VAT chưa được
    -- xác nhận ở schema nên không tự trừ/thêm VAT trong API.
    -- Trả về đúng format ngày tháng để vẽ Biểu Đồ và Tính Tổng
    -- =========================================================
    -- @User cũng được API chatbot truyền để xác định tài khoản đăng nhập,
    -- nên không được dùng riêng tham số này để nhận diện Dashboard.
    IF (@FromDate IS NOT NULL OR @ToDate IS NOT NULL)
       AND COALESCE(NULLIF(@LoaiBaoCao, ''), 'TatCa') = 'TatCa'
    BEGIN
        SELECT 
            DAY(DocumentDate) AS NgayBan,
            CAST(DocumentDate AS DATE) AS Ngay,
            SUM(CASE WHEN StatusID IN (3, 6, 7, 8, 99) THEN TotalAmount ELSE 0 END) AS Amount,
            SUM(CASE WHEN StatusID IN (3, 6, 7, 8, 99) THEN TotalAmount ELSE 0 END) AS DoanhSoDaXuat,
            SUM(CASE WHEN StatusID IN (8, 99) THEN TotalAmount ELSE 0 END) AS DoanhThuDaThu,
            FORMAT(SUM(CASE WHEN StatusID IN (3, 6, 7, 8, 99) THEN TotalAmount ELSE 0 END), '#,##0') AS [Doanh Số],
            FORMAT(SUM(CASE WHEN StatusID IN (3, 6, 7, 8, 99) THEN TotalAmount ELSE 0 END), '#,##0') AS [Doanh Số Đã Xuất/Giao],
            FORMAT(SUM(CASE WHEN StatusID IN (8, 99) THEN TotalAmount ELSE 0 END), '#,##0') AS [Doanh Thu Đã Thu],
            N'AR_OrderAndReturnView.TotalAmount' AS RevenueBasis,
            N'FULFILLED=3,6,7,8;COLLECTED=8;RETURN=99' AS RevenueRecognition,
            N'COORDINATOR_DECISION' AS RuleSource,
            N'BR-SALES-V1-C-DRAFT' AS RuleVersion
        FROM AR_OrderAndReturnView
        WHERE DocumentDate BETWEEN @TuNgay AND @DenNgay
          AND (
              @SYSUserGroupID = 'Admin'
              OR EmployeeID = @SYS_EmployeeID
              OR ManagerID = @SYS_EmployeeID
              OR CeoID = @SYS_EmployeeID
          )
          AND (@EmployeeID = '' OR EmployeeID = @EmployeeID)
          AND (@ManagerID = '' OR ManagerID = @ManagerID)
          AND (@BranchID = '' OR BranchID = @BranchID)
          AND (@CeoID = '' OR CeoID = @CeoID)
          AND StatusID IN (3, 6, 7, 8, 99)
        GROUP BY DAY(DocumentDate), CAST(DocumentDate AS DATE)
        ORDER BY CAST(DocumentDate AS DATE)
        
        RETURN;
    END

    -------------------------------------------------
    -- Báo Cáo Nhân Viên
    -------------------------------------------------
    IF @LoaiBaoCao = 'NhanVien' OR @LoaiBaoCao = 'TatCa'
    BEGIN
        INSERT INTO @BC (EmployeeID, EmployeeName, ManagerID, BranchID, DoanhSo, DoanhThuDaThu)
        SELECT 
            A.EmployeeID, 
            COALESCE(NULLIF(A.EmployeeName, ''), U.HoTen, A.EmployeeID) AS EmployeeName, 
            MAX(A.ManagerID) AS ManagerID, 
            MAX(A.BranchID) AS BranchID, 
            SUM(CASE WHEN A.StatusID IN (3, 6, 7, 8, 99) THEN A.TotalAmount ELSE 0 END) AS DoanhSo,
            SUM(CASE WHEN A.StatusID IN (8, 99) THEN A.TotalAmount ELSE 0 END) AS DoanhThuDaThu
        FROM AR_OrderAndReturnView A
        LEFT JOIN SY_User U ON A.EmployeeID = U.EmployeeID
        WHERE A.DocumentDate BETWEEN @TuNgay AND @DenNgay
            AND A.StatusID IN (3, 6, 7, 8, 99)
            AND (@MaKhachHang = '' OR A.ObjectID = @MaKhachHang)
            AND (@ObjectName = '' OR A.ObjectName LIKE N'%' + @ObjectName + '%')
            AND (@EmployeeID = '' OR A.EmployeeID = @EmployeeID)
            AND (@TenNhanVien = '' OR A.EmployeeName LIKE N'%' + @TenNhanVien + '%' OR U.HoTen LIKE N'%' + @TenNhanVien + '%')
            AND (@ManagerID = '' OR A.ManagerID = @ManagerID)
            AND (@BranchID = '' OR A.BranchID = @BranchID)
            AND (
                @SYSUserGroupID = 'Admin'
                OR A.EmployeeID = @SYS_EmployeeID
                OR A.ManagerID = @SYS_EmployeeID
                OR A.CeoID = @SYS_EmployeeID
            )
        GROUP BY A.EmployeeID, COALESCE(NULLIF(A.EmployeeName, ''), U.HoTen, A.EmployeeID)

        IF @LoaiBaoCao = 'NhanVien' 
        BEGIN
            SELECT TOP (@TopN) ROW_NUMBER() OVER (ORDER BY DoanhSo DESC, EmployeeName) AS STT, 
                FORMAT(@TuNgay, 'dd/MM/yyyy') AS [Từ Ngày], FORMAT(@DenNgay, 'dd/MM/yyyy') AS [Đến Ngày],
                EmployeeID AS [Mã NV], EmployeeName AS [Tên NV], 
                ManagerID AS [Mã Quản Lý], BranchID AS [Chi Nhánh],
                FORMAT(DoanhSo, '#,##0') AS [Doanh Số],
                FORMAT(DoanhSo, '#,##0') AS [Doanh Số Đã Xuất/Giao],
                FORMAT(DoanhThuDaThu, '#,##0') AS [Doanh Thu Đã Thu],
                N'AR_OrderAndReturnView.TotalAmount' AS RevenueBasis,
                N'FULFILLED=3,6,7,8;COLLECTED=8;RETURN=99' AS RevenueRecognition,
                N'COORDINATOR_DECISION' AS RuleSource,
                N'BR-SALES-V1-C-DRAFT' AS RuleVersion
            FROM @BC ORDER BY DoanhSo DESC
            RETURN;
        END
    END

    -------------------------------------------------
    -- Báo Cáo Khách Hàng
    -------------------------------------------------
    IF @LoaiBaoCao = 'KhachHang' OR @LoaiBaoCao = 'TatCa'
    BEGIN
        INSERT INTO @BC2 (ObjectID, ObjectName, DoanhSo, DoanhThuDaThu)
        SELECT A.ObjectID, A.ObjectName,
            SUM(CASE WHEN A.StatusID IN (3, 6, 7, 8, 99) THEN A.TotalAmount ELSE 0 END) AS DoanhSo,
            SUM(CASE WHEN A.StatusID IN (8, 99) THEN A.TotalAmount ELSE 0 END) AS DoanhThuDaThu
        FROM AR_OrderAndReturnView A
        LEFT JOIN SY_User U ON A.EmployeeID = U.EmployeeID
        WHERE A.DocumentDate BETWEEN @TuNgay AND @DenNgay
            AND A.StatusID IN (3, 6, 7, 8, 99)
            AND (@MaKhachHang = '' OR A.ObjectID = @MaKhachHang)
            AND (@ObjectName = '' OR A.ObjectName LIKE N'%' + @ObjectName + '%')
            AND (@EmployeeID = '' OR A.EmployeeID = @EmployeeID)
            AND (@TenNhanVien = '' OR A.EmployeeName LIKE N'%' + @TenNhanVien + '%' OR U.HoTen LIKE N'%' + @TenNhanVien + '%')
            AND (@ManagerID = '' OR A.ManagerID = @ManagerID)
            AND (@BranchID = '' OR A.BranchID = @BranchID)
            AND (
                @SYSUserGroupID = 'Admin'
                OR A.EmployeeID = @SYS_EmployeeID
                OR A.ManagerID = @SYS_EmployeeID
                OR A.CeoID = @SYS_EmployeeID
            )
        GROUP BY A.ObjectID, A.ObjectName

        IF @LoaiBaoCao = 'KhachHang'
        BEGIN
            SELECT TOP (@TopN) ROW_NUMBER() OVER (ORDER BY DoanhSo DESC, ObjectName) AS STT, 
                FORMAT(@TuNgay, 'dd/MM/yyyy') AS [Từ Ngày], FORMAT(@DenNgay, 'dd/MM/yyyy') AS [Đến Ngày],
                ObjectID AS [Mã KH], ObjectName AS [Tên Khách Hàng], 
                FORMAT(DoanhSo, '#,##0') AS [Doanh Số],
                FORMAT(DoanhSo, '#,##0') AS [Doanh Số Đã Xuất/Giao],
                FORMAT(DoanhThuDaThu, '#,##0') AS [Doanh Thu Đã Thu],
                N'AR_OrderAndReturnView.TotalAmount' AS RevenueBasis,
                N'FULFILLED=3,6,7,8;COLLECTED=8;RETURN=99' AS RevenueRecognition,
                N'COORDINATOR_DECISION' AS RuleSource,
                N'BR-SALES-V1-C-DRAFT' AS RuleVersion
            FROM @BC2 ORDER BY DoanhSo DESC
            RETURN;
        END
    END

    -------------------------------------------------
    -- Báo Cáo Sản Phẩm
    -------------------------------------------------
    IF @LoaiBaoCao = 'SanPham' OR @LoaiBaoCao = 'TatCa'
    BEGIN
        INSERT INTO @BC3 (ItemID, ItemName, SoLuong, DoanhSo, DoanhThuDaThu)
        SELECT B.ItemID, B.ItemName,
            SUM(CASE WHEN A.StatusID IN (3, 6, 7, 8, 99) THEN A.Quantity ELSE 0 END) AS SoLuong,
            SUM(CASE WHEN A.StatusID IN (3, 6, 7, 8, 99) THEN A.TotalAmount ELSE 0 END) AS DoanhSo,
            SUM(CASE WHEN A.StatusID IN (8, 99) THEN A.TotalAmount ELSE 0 END) AS DoanhThuDaThu
        FROM AR_OrderAndReturnView A
        INNER JOIN CF_ItemTbl B ON A.ItemID = B.ItemID
        LEFT JOIN (
            SELECT DocumentID, ItemID,
                MAX(CASE WHEN ISNULL(isKM, 0) = 0 THEN 1 ELSE 0 END) AS HasRegularSaleLine
            FROM AR_OrderDetailTbl
            GROUP BY DocumentID, ItemID
        ) PM ON A.StatusID <> 99 AND A.DocumentID = PM.DocumentID AND A.ItemID = PM.ItemID
        LEFT JOIN SY_User U ON A.EmployeeID = U.EmployeeID
        WHERE A.DocumentDate BETWEEN @TuNgay AND @DenNgay
            AND A.StatusID IN (3, 6, 7, 8, 99)
            AND (@MaKhachHang = '' OR A.ObjectID = @MaKhachHang)
            AND (@ObjectName = '' OR A.ObjectName LIKE N'%' + @ObjectName + '%')
            AND (@EmployeeID = '' OR A.EmployeeID = @EmployeeID)
            AND (@TenNhanVien = '' OR A.EmployeeName LIKE N'%' + @TenNhanVien + '%' OR U.HoTen LIKE N'%' + @TenNhanVien + '%')
            AND (@TenSanPham = '' OR B.ItemName LIKE N'%' + @TenSanPham + '%')
            AND (@ManagerID = '' OR A.ManagerID = @ManagerID)
            AND (@BranchID = '' OR A.BranchID = @BranchID)
            AND (A.StatusID = 99 OR PM.HasRegularSaleLine = 1)
            AND (
                @SYSUserGroupID = 'Admin'
                OR A.EmployeeID = @SYS_EmployeeID
                OR A.ManagerID = @SYS_EmployeeID
                OR A.CeoID = @SYS_EmployeeID
            )
        GROUP BY B.ItemID, B.ItemName

        IF @LoaiBaoCao = 'SanPham'
        BEGIN
            SELECT TOP (@TopN) ROW_NUMBER() OVER (ORDER BY DoanhSo DESC, ItemName) AS STT, 
                FORMAT(@TuNgay, 'dd/MM/yyyy') AS [Từ Ngày], FORMAT(@DenNgay, 'dd/MM/yyyy') AS [Đến Ngày],
                ItemID AS [Mã SP], ItemName AS [Tên Sản Phẩm], 
                FORMAT(SoLuong, '#,##0.##') AS [Số Lượng], 
                FORMAT(DoanhSo, '#,##0') AS [Doanh Số],
                FORMAT(DoanhSo, '#,##0') AS [Doanh Số Đã Xuất/Giao],
                FORMAT(DoanhThuDaThu, '#,##0') AS [Doanh Thu Đã Thu],
                N'AR_OrderAndReturnView.TotalAmount' AS RevenueBasis,
                N'FULFILLED=3,6,7,8;COLLECTED=8;RETURN=99' AS RevenueRecognition,
                N'COORDINATOR_DECISION' AS RuleSource,
                N'BR-SALES-V1-C-DRAFT' AS RuleVersion
            FROM @BC3 ORDER BY DoanhSo DESC
            RETURN;
        END
    END

    -- TatCa dùng một result set thống nhất để n8n không làm mất nhóm thứ 2/3.
    -- FE dựa vào cột [Nhóm] để chia thành Nhân viên / Khách hàng / Sản phẩm.
    IF @LoaiBaoCao = 'TatCa'
    BEGIN
        SELECT
            ROW_NUMBER() OVER (
                PARTITION BY X.ReportGroup
                ORDER BY X.DoanhSoValue DESC, X.DisplayName
            ) AS STT,
            FORMAT(@TuNgay, 'dd/MM/yyyy') AS [Từ Ngày],
            FORMAT(@DenNgay, 'dd/MM/yyyy') AS [Đến Ngày],
            X.ReportGroup AS [Nhóm],
            X.EntityID AS [Mã],
            X.DisplayName AS [Tên],
            CASE WHEN X.ReportGroup = N'Sản phẩm'
                 THEN FORMAT(X.QuantityValue, '#,##0.##')
                 ELSE NULL END AS [Số Lượng],
            FORMAT(X.DoanhSoValue, '#,##0') AS [Doanh Số],
            FORMAT(X.DoanhSoValue, '#,##0') AS [Doanh Số Đã Xuất/Giao],
            FORMAT(X.DoanhThuDaThuValue, '#,##0') AS [Doanh Thu Đã Thu],
            N'AR_OrderAndReturnView.TotalAmount' AS RevenueBasis,
            N'FULFILLED=3,6,7,8;COLLECTED=8;RETURN=99' AS RevenueRecognition,
            N'COORDINATOR_DECISION' AS RuleSource,
            N'BR-SALES-V1-C-DRAFT' AS RuleVersion
        FROM (
            SELECT
                N'Nhân viên' AS ReportGroup,
                EmployeeID AS EntityID,
                EmployeeName AS DisplayName,
                CAST(NULL AS DECIMAL(18, 2)) AS QuantityValue,
                DoanhSo AS DoanhSoValue,
                DoanhThuDaThu AS DoanhThuDaThuValue
            FROM (
                SELECT TOP (@TopN) EmployeeID, EmployeeName, DoanhSo, DoanhThuDaThu
                FROM @BC
                ORDER BY DoanhSo DESC, EmployeeName
            ) E

            UNION ALL

            SELECT
                N'Khách hàng', ObjectID, ObjectName,
                CAST(NULL AS DECIMAL(18, 2)), DoanhSo, DoanhThuDaThu
            FROM (
                SELECT TOP (@TopN) ObjectID, ObjectName, DoanhSo, DoanhThuDaThu
                FROM @BC2
                ORDER BY DoanhSo DESC, ObjectName
            ) C

            UNION ALL

            SELECT
                N'Sản phẩm', ItemID, ItemName,
                CAST(SoLuong AS DECIMAL(18, 2)), DoanhSo, DoanhThuDaThu
            FROM (
                SELECT TOP (@TopN) ItemID, ItemName, SoLuong, DoanhSo, DoanhThuDaThu
                FROM @BC3
                ORDER BY DoanhSo DESC, ItemName
            ) P
        ) X
        ORDER BY
            CASE X.ReportGroup
                WHEN N'Nhân viên' THEN 1
                WHEN N'Khách hàng' THEN 2
                ELSE 3
            END,
            X.DoanhSoValue DESC;
        RETURN;
    END
END
GO
