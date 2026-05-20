ALTER PROCEDURE [dbo].[API_DoanhSo_AI]
    @BotType      VARCHAR(50)    = '',
    @Username     VARCHAR(50)    = '',
    @MaKhachHang    VARCHAR(50)    = '',
    @ObjectName   NVARCHAR(200)  = '',
    @EmployeeID   VARCHAR(50)    = '',
    @TenNhanVien NVARCHAR(200)  = '',
    @TenSanPham     NVARCHAR(200)  = '',
    @TuNgay       DATETIME       = NULL,
    @DenNgay      DATETIME       = NULL,
    @TopN         INT            = 50,
    @LoaiBaoCao   VARCHAR(50)    = 'TatCa',
    @ManagerID    VARCHAR(50)    = ''
AS
BEGIN
    SET NOCOUNT ON;
    SET ANSI_WARNINGS OFF;
    DECLARE @BC TABLE (EmployeeID VARCHAR(50), EmployeeName NVARCHAR(200), ManagerID VARCHAR(50), BranchID VARCHAR(50), DoanhSo MONEY);
    DECLARE @BC2 TABLE (ObjectID VARCHAR(50), ObjectName NVARCHAR(200), DoanhSo MONEY);
    DECLARE @BC3 TABLE (ItemID VARCHAR(50), ItemName NVARCHAR(200), SoLuong FLOAT, DoanhSo MONEY);
    
    -- 1. Validate User
    IF NOT EXISTS (SELECT 1 FROM SY_User WHERE (UserName = @Username OR HoTen = @Username) AND COALESCE(Disable, 0) = 0)
    BEGIN
        SELECT N'User không tồn tại hoặc đã bị khóa' AS Msg, 1 AS MsgType
        RETURN
    END

    -- 2. Defaults
    IF @TuNgay IS NULL SET @TuNgay = DATEADD(DAY, 1 - DAY(GETDATE()), CAST(GETDATE() AS DATE))
    IF @DenNgay IS NULL SET @DenNgay = GETDATE()

    -- Fix bounds: 00:00:00 to 23:59:59 (Safe Math Version)
    SET @TuNgay = DATEADD(DAY, DATEDIFF(DAY, 0, @TuNgay), 0)
    SET @DenNgay = DATEADD(SECOND, -1, DATEADD(DAY, 1, DATEADD(DAY, DATEDIFF(DAY, 0, @DenNgay), 0)))

    -- SMART AI ID ROUTING
    DECLARE @ExtractedID VARCHAR(50) = ''

    IF @TenNhanVien LIKE '%\[%\]%' ESCAPE '\'
    BEGIN
        SET @ExtractedID = SUBSTRING(@TenNhanVien, CHARINDEX('[', @TenNhanVien) + 1, CHARINDEX(']', @TenNhanVien) - CHARINDEX('[', @TenNhanVien) - 1)
        IF EXISTS (SELECT 1 FROM SY_User WHERE EmployeeID = @ExtractedID)
        BEGIN
            SET @EmployeeID = @ExtractedID
            SET @TenNhanVien = ''
        END
    END

    -- Trích xuất ManagerID dạng ngoặc vuông [QLBH024] nếu có
    IF @ManagerID LIKE '%\[%\]%' ESCAPE '\'
    BEGIN
        SET @ExtractedID = SUBSTRING(@ManagerID, CHARINDEX('[', @ManagerID) + 1, CHARINDEX(']', @ManagerID) - CHARINDEX('[', @ManagerID) - 1)
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

    -- 3. Lấy thông tin quyền hạn của User
    DECLARE @SYSBranchID    VARCHAR(50) = ''
    DECLARE @SYSCeoID       VARCHAR(50) = ''
    DECLARE @SYSManagerID   VARCHAR(50) = ''
    DECLARE @SYSEmployeeID  VARCHAR(50) = ''
    DECLARE @IsManager      BIT         = 0
    DECLARE @SYSUserGroupID VARCHAR(50) = ''

    SELECT
        @SYSBranchID    = COALESCE(BranchID, ''),
        @SYSCeoID       = COALESCE(CeoID, ''),
        @SYSManagerID   = COALESCE(ManagerID, ''),
        @SYSEmployeeID  = COALESCE(EmployeeID, ''),
        @IsManager      = COALESCE(Manager, 0),
        @SYSUserGroupID = COALESCE(UserGroupID, '')
    FROM SY_User WHERE UserName = @Username OR HoTen = @Username

    -------------------------------------------------
    -- Báo Cáo Nhân Viên
    -------------------------------------------------
    IF @LoaiBaoCao = 'NhanVien' OR @LoaiBaoCao = 'TatCa'
    BEGIN
        INSERT INTO @BC (EmployeeID, EmployeeName, ManagerID, BranchID, DoanhSo)
        SELECT A.EmployeeID, A.EmployeeName, MAX(A.ManagerID) AS ManagerID, MAX(A.BranchID) AS BranchID, SUM(A.Amount) AS DoanhSo
        FROM AR_OrderAndReturnView A
        WHERE A.DocumentDate BETWEEN @TuNgay AND @DenNgay
            AND A.StatusID NOT IN (-2, -1, 0)
            AND (@MaKhachHang = '' OR A.ObjectID = @MaKhachHang)
            AND (@ObjectName = '' OR A.ObjectName LIKE N'%' + @ObjectName + '%')
            AND (@EmployeeID = '' OR A.EmployeeID = @EmployeeID)
            AND (@TenNhanVien = '' OR A.EmployeeName LIKE N'%' + @TenNhanVien + '%')
            AND (@ManagerID = '' OR A.ManagerID = @ManagerID)
            AND (
                @SYSUserGroupID = 'Admin'
                OR A.EmployeeID = @SYSEmployeeID
                OR A.ManagerID = @SYSEmployeeID
                OR A.CeoID = @SYSEmployeeID
            )
        GROUP BY A.EmployeeID, A.EmployeeName

        IF @LoaiBaoCao = 'NhanVien' 
        BEGIN
            SELECT TOP (@TopN) ROW_NUMBER() OVER (ORDER BY DoanhSo DESC, EmployeeName) AS STT, 
                FORMAT(@TuNgay, 'dd/MM/yyyy') AS [Từ Ngày], FORMAT(@DenNgay, 'dd/MM/yyyy') AS [Đến Ngày],
                EmployeeID AS [Mã NV], EmployeeName AS [Tên NV], 
                ManagerID AS [Mã Quản Lý], BranchID AS [Chi Nhánh],
                FORMAT(DoanhSo, '#,##0') AS [Doanh Số]
            FROM @BC ORDER BY DoanhSo DESC
            RETURN;
        END
    END

    -------------------------------------------------
    -- Báo Cáo Khách Hàng
    -------------------------------------------------
    IF @LoaiBaoCao = 'KhachHang' OR @LoaiBaoCao = 'TatCa'
    BEGIN
        INSERT INTO @BC2 (ObjectID, ObjectName, DoanhSo)
        SELECT A.ObjectID, A.ObjectName, SUM(A.Amount) AS DoanhSo
        FROM AR_OrderAndReturnView A
        WHERE A.DocumentDate BETWEEN @TuNgay AND @DenNgay
            AND A.StatusID NOT IN (-2, -1, 0)
            AND (@MaKhachHang = '' OR A.ObjectID = @MaKhachHang)
            AND (@ObjectName = '' OR A.ObjectName LIKE N'%' + @ObjectName + '%')
            AND (@EmployeeID = '' OR A.EmployeeID = @EmployeeID)
            AND (@TenNhanVien = '' OR A.EmployeeName LIKE N'%' + @TenNhanVien + '%')
            AND (@ManagerID = '' OR A.ManagerID = @ManagerID)
            AND (
                @SYSUserGroupID = 'Admin'
                OR A.EmployeeID = @SYSEmployeeID
                OR A.ManagerID = @SYSEmployeeID
                OR A.CeoID = @SYSEmployeeID
            )
        GROUP BY A.ObjectID, A.ObjectName

        IF @LoaiBaoCao = 'KhachHang'
        BEGIN
            SELECT TOP (@TopN) ROW_NUMBER() OVER (ORDER BY DoanhSo DESC, ObjectName) AS STT, 
                FORMAT(@TuNgay, 'dd/MM/yyyy') AS [Từ Ngày], FORMAT(@DenNgay, 'dd/MM/yyyy') AS [Đến Ngày],
                ObjectID AS [Mã KH], ObjectName AS [Tên Khách Hàng], FORMAT(DoanhSo, '#,##0') AS [Doanh Số]
            FROM @BC2 ORDER BY DoanhSo DESC
            RETURN;
        END
    END

    -------------------------------------------------
    -- Báo Cáo Sản Phẩm
    -------------------------------------------------
    IF @LoaiBaoCao = 'SanPham' OR @LoaiBaoCao = 'TatCa'
    BEGIN
        INSERT INTO @BC3 (ItemID, ItemName, SoLuong, DoanhSo)
        SELECT B.ItemID, B.ItemName, SUM(D.Quantity) AS SoLuong, SUM(D.Amount) AS DoanhSo
        FROM AR_OrderAndReturnView A
        INNER JOIN AR_OrderDetailTbl D ON A.DocumentID = D.DocumentID
        INNER JOIN CF_ItemTbl B ON D.ItemID = B.ItemID
        WHERE A.DocumentDate BETWEEN @TuNgay AND @DenNgay
            AND A.StatusID NOT IN (-2, -1, 0)
            AND (@MaKhachHang = '' OR A.ObjectID = @MaKhachHang)
            AND (@ObjectName = '' OR A.ObjectName LIKE N'%' + @ObjectName + '%')
            AND (@EmployeeID = '' OR A.EmployeeID = @EmployeeID)
            AND (@TenNhanVien = '' OR A.EmployeeName LIKE N'%' + @TenNhanVien + '%')
            AND (@TenSanPham = '' OR B.ItemName LIKE N'%' + @TenSanPham + '%')
            AND (@ManagerID = '' OR A.ManagerID = @ManagerID)
            AND (
                @SYSUserGroupID = 'Admin'
                OR A.EmployeeID = @SYSEmployeeID
                OR A.ManagerID = @SYSEmployeeID
                OR A.CeoID = @SYSEmployeeID
            )
            AND ISNULL(D.isKM, 0) = 0
        GROUP BY B.ItemID, B.ItemName

        IF @LoaiBaoCao = 'SanPham'
        BEGIN
            SELECT TOP (@TopN) ROW_NUMBER() OVER (ORDER BY SoLuong DESC, ItemName) AS STT, 
                FORMAT(@TuNgay, 'dd/MM/yyyy') AS [Từ Ngày], FORMAT(@DenNgay, 'dd/MM/yyyy') AS [Đến Ngày],
                ItemID AS [Mã SP], ItemName AS [Tên Sản Phẩm], SoLuong AS [Số Lượng], FORMAT(DoanhSo, '#,##0') AS [Doanh Số]
            FROM @BC3 ORDER BY SoLuong DESC
            RETURN;
        END
    END

    -- Fallback for TatCa defaults to NhanVien to prevent Node Crash
    SELECT TOP (@TopN) ROW_NUMBER() OVER (ORDER BY DoanhSo DESC, EmployeeName) AS STT, 
            FORMAT(@TuNgay, 'dd/MM/yyyy') AS [Từ Ngày], FORMAT(@DenNgay, 'dd/MM/yyyy') AS [Đến Ngày],
            EmployeeID AS [Mã NV], EmployeeName AS [Tên NV], 
            ManagerID AS [Mã Quản Lý], BranchID AS [Chi Nhánh],
            FORMAT(DoanhSo, '#,##0') AS [Doanh Số]
        FROM @BC ORDER BY DoanhSo DESC
END
GO
