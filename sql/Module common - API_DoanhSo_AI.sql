IF OBJECT_ID('API_DoanhSo_AI', 'P') IS NOT NULL DROP PROCEDURE API_DoanhSo_AI;
GO

CREATE PROCEDURE [dbo].[API_DoanhSo_AI]
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
    @LoaiBaoCao   VARCHAR(50)    = 'TatCa'
AS
BEGIN
    SET NOCOUNT ON;
    SET ANSI_WARNINGS OFF;
    DECLARE @BC TABLE (EmployeeID VARCHAR(50), EmployeeName NVARCHAR(200), DoanhSo MONEY);
    DECLARE @BC2 TABLE (ObjectID VARCHAR(50), ObjectName NVARCHAR(200), DoanhSo MONEY);
    DECLARE @BC3 TABLE (ItemID VARCHAR(50), ItemName NVARCHAR(200), SoLuong FLOAT, DoanhSo MONEY);
    
    -- 1. Validate User
    IF NOT EXISTS (SELECT 1 FROM SY_User WHERE UserName = @Username AND COALESCE(Disable, 0) = 0)
    BEGIN
        SELECT N'User không tồn tại hoặc đã bị khóa' AS Msg, 1 AS MsgType
        RETURN
    END

    -- 2. Defaults
    -- Cập nhật: Mặc định nếu không truyền ngày thì lấy từ ĐẦU THÁNG HIỆN TẠI đến hiện tại
    IF @TuNgay IS NULL SET @TuNgay = DATEADD(DAY, 1 - DAY(GETDATE()), CAST(GETDATE() AS DATE))
    IF @DenNgay IS NULL SET @DenNgay = GETDATE()

    -- Fix bounds: 00:00:00 to 23:59:59 (Safe Math Version to avoid string conversion errors)
    SET @TuNgay = DATEADD(DAY, DATEDIFF(DAY, 0, @TuNgay), 0)
    SET @DenNgay = DATEADD(SECOND, -1, DATEADD(DAY, 1, DATEADD(DAY, DATEDIFF(DAY, 0, @DenNgay), 0)))

    -- 3. Lấy thông tin quyền hạn của User
    DECLARE @SYSBranchID   VARCHAR(50) = ''
    DECLARE @SYSCeoID      VARCHAR(50) = ''
    DECLARE @SYSManagerID  VARCHAR(50) = ''
    DECLARE @SYSEmployeeID VARCHAR(50) = ''
    DECLARE @IsManager     BIT         = 0

    SELECT
        @SYSBranchID   = COALESCE(BranchID, ''),
        @SYSCeoID      = COALESCE(CeoID, ''),
        @SYSManagerID  = COALESCE(ManagerID, ''),
        @SYSEmployeeID = COALESCE(EmployeeID, ''),
        @IsManager     = COALESCE(Manager, 0)
    FROM SY_User WHERE UserName = @Username

    -------------------------------------------------
    -- Báo Cáo Nhân Viên
    -------------------------------------------------
    IF @LoaiBaoCao = 'NhanVien' OR @LoaiBaoCao = 'TatCa'
    BEGIN
        INSERT INTO @BC (EmployeeID, EmployeeName, DoanhSo)
        SELECT A.EmployeeID, A.EmployeeName, SUM(A.Amount) AS DoanhSo
        FROM AR_OrderAndReturnView A
        WHERE A.DocumentDate BETWEEN @TuNgay AND @DenNgay
            AND A.StatusID NOT IN (-2, -1, 0)
            AND (@MaKhachHang = '' OR A.ObjectID = @MaKhachHang)
            AND (@ObjectName = '' OR A.ObjectName LIKE N'%' + @ObjectName + '%')
            AND (@EmployeeID = '' OR A.EmployeeID = @EmployeeID)
            AND (@TenNhanVien = '' OR A.EmployeeName LIKE N'%' + @TenNhanVien + '%')
            AND (ISNULL(@SYSBranchID, '')   = '' OR A.BranchID = @SYSBranchID   OR @IsManager = 1)
            AND (ISNULL(@SYSCeoID, '')      = '' OR A.CeoID = @SYSCeoID         OR @IsManager = 1)
            AND (ISNULL(@SYSManagerID, '')  = '' OR A.ManagerID = @SYSManagerID OR @IsManager = 1)
            AND (ISNULL(@SYSEmployeeID, '') = '' OR A.EmployeeID = @SYSEmployeeID OR @IsManager = 1)
            -- BẢO MẬT RLS: Nếu không phải Manager, user BẮT BUỘC phải được gán ít nhất 1 mã định danh.
            -- Nếu user cấu hình thiếu (trắng toàn bộ mã), chặn đứng xem toàn bộ dữ liệu (Chống lỗi Tautology)
            AND (
                @IsManager = 1 
                OR NULLIF(@SYSBranchID, '') IS NOT NULL 
                OR NULLIF(@SYSCeoID, '') IS NOT NULL 
                OR NULLIF(@SYSManagerID, '') IS NOT NULL 
                OR NULLIF(@SYSEmployeeID, '') IS NOT NULL
            )
        GROUP BY A.EmployeeID, A.EmployeeName

        IF @LoaiBaoCao = 'NhanVien' 
        BEGIN
            SELECT TOP (@TopN) ROW_NUMBER() OVER (ORDER BY DoanhSo DESC, EmployeeName) AS STT, 
                FORMAT(@TuNgay, 'dd/MM/yyyy') AS [Từ Ngày], FORMAT(@DenNgay, 'dd/MM/yyyy') AS [Đến Ngày],
                EmployeeID AS [Mã NV], EmployeeName AS [Tên NV], FORMAT(DoanhSo, '#,##0') AS [Doanh Số]
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
            AND (ISNULL(@SYSBranchID, '')   = '' OR A.BranchID = @SYSBranchID   OR @IsManager = 1)
            AND (ISNULL(@SYSCeoID, '')      = '' OR A.CeoID = @SYSCeoID         OR @IsManager = 1)
            AND (ISNULL(@SYSManagerID, '')  = '' OR A.ManagerID = @SYSManagerID OR @IsManager = 1)
            AND (ISNULL(@SYSEmployeeID, '') = '' OR A.EmployeeID = @SYSEmployeeID OR @IsManager = 1)
            AND (
                @IsManager = 1 
                OR NULLIF(@SYSBranchID, '') IS NOT NULL 
                OR NULLIF(@SYSCeoID, '') IS NOT NULL 
                OR NULLIF(@SYSManagerID, '') IS NOT NULL 
                OR NULLIF(@SYSEmployeeID, '') IS NOT NULL
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
    -- Báo Cáo Sản Phẩm Bán Chạy
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
            AND (ISNULL(@SYSBranchID, '')   = '' OR A.BranchID = @SYSBranchID   OR @IsManager = 1)
            AND (ISNULL(@SYSCeoID, '')      = '' OR A.CeoID = @SYSCeoID         OR @IsManager = 1)
            AND (ISNULL(@SYSManagerID, '')  = '' OR A.ManagerID = @SYSManagerID OR @IsManager = 1)
            AND (ISNULL(@SYSEmployeeID, '') = '' OR A.EmployeeID = @SYSEmployeeID OR @IsManager = 1)
            AND (
                @IsManager = 1 
                OR NULLIF(@SYSBranchID, '') IS NOT NULL 
                OR NULLIF(@SYSCeoID, '') IS NOT NULL 
                OR NULLIF(@SYSManagerID, '') IS NOT NULL 
                OR NULLIF(@SYSEmployeeID, '') IS NOT NULL
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

    -- Fallback for TatCa defaults to NhanVien to prevent Node Crash from multi-recordsets
    SELECT TOP (@TopN) ROW_NUMBER() OVER (ORDER BY DoanhSo DESC, EmployeeName) AS STT, 
            FORMAT(@TuNgay, 'dd/MM/yyyy') AS [Từ Ngày], FORMAT(@DenNgay, 'dd/MM/yyyy') AS [Đến Ngày],
            EmployeeID AS [Mã NV], EmployeeName AS [Tên NV], FORMAT(DoanhSo, '#,##0') AS [Doanh Số]
        FROM @BC ORDER BY DoanhSo DESC
END
GO
