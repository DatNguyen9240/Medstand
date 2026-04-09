IF OBJECT_ID('API_DoanhSo_AI', 'P') IS NOT NULL DROP PROCEDURE API_DoanhSo_AI;
GO

CREATE PROCEDURE [dbo].[API_DoanhSo_AI]
    @Username     VARCHAR(50)    = '',
    @khachhang    VARCHAR(50)    = '',
    @ObjectName   NVARCHAR(200)  = '',
    @EmployeeID   VARCHAR(50)    = '',
    @EmployeeName NVARCHAR(200)  = '',
    @ItemName     NVARCHAR(200)  = '',
    @TuNgay     DATETIME       = NULL,
    @DenNgay       DATETIME       = NULL,
    @TopN         INT            = 10
AS
BEGIN
    SET NOCOUNT ON
    
    -- 1. Validate User
    IF NOT EXISTS (SELECT 1 FROM SY_User WHERE UserName = @Username AND COALESCE(Disable, 0) = 0)
    BEGIN
        SELECT N'User không tồn tại hoặc đã bị khóa' AS Msg, 1 AS MsgType
        RETURN
    END

    -- 2. Defaults
    IF @TuNgay IS NULL SET @TuNgay = DATEADD(MONTH, -1, GETDATE())
    IF @DenNgay IS NULL SET @DenNgay = GETDATE()

    -- 3. Lấy thông tin quyền hạn của User
    DECLARE @SYSBranchID   VARCHAR(50) = ''
    DECLARE @SYSCeoID      VARCHAR(50) = ''
    DECLARE @SYSManagerID  VARCHAR(50) = ''
    DECLARE @SYSEmployeeID VARCHAR(50) = ''

    SELECT
        @SYSBranchID   = COALESCE(BranchID, ''),
        @SYSCeoID      = COALESCE(CeoID, ''),
        @SYSManagerID  = COALESCE(ManagerID, ''),
        @SYSEmployeeID = COALESCE(EmployeeID, '')
    FROM SY_User WHERE UserName = @Username

    -------------------------------------------------
    -- 1. Doanh số theo nhân viên
    -------------------------------------------------
    SELECT @TuNgay AS TuNgay, @DenNgay AS DenNgay,
        A.EmployeeID, A.EmployeeName, SUM(A.Amount) AS DoanhSo
    INTO #BC
    FROM AR_OrderAndReturnView A
    WHERE A.DocumentDate BETWEEN @TuNgay AND @DenNgay
        AND A.StatusID NOT IN (-2, -1, 0, 10)
        AND (@khachhang = '' OR A.ObjectID = @khachhang)
        AND (@ObjectName = '' OR A.ObjectName LIKE N'%' + @ObjectName + '%')
        AND (@EmployeeID = '' OR A.EmployeeID = @EmployeeID)
        AND (@EmployeeName = '' OR A.EmployeeName LIKE N'%' + @EmployeeName + '%')
        -- Phân quyền mượt: Chỉ lọc nếu các tham số SYS không để trống
        AND (ISNULL(@SYSBranchID, '')   = '' OR A.BranchID = @SYSBranchID)
        AND (ISNULL(@SYSCeoID, '')      = '' OR A.CeoID = @SYSCeoID)
        AND (ISNULL(@SYSManagerID, '')  = '' OR A.ManagerID = @SYSManagerID)
        AND (ISNULL(@SYSEmployeeID, '') = '' OR A.EmployeeID = @SYSEmployeeID OR @Username IN ('demo', 'admin'))
    GROUP BY A.EmployeeID, A.EmployeeName

    -------------------------------------------------
    -- 2. Doanh số theo khách hàng
    -------------------------------------------------
    SELECT @TuNgay AS TuNgay, @DenNgay AS DenNgay,
        A.ObjectID, A.ObjectName, SUM(A.Amount) AS DoanhSo
    INTO #BC2
    FROM AR_OrderAndReturnView A
    WHERE A.DocumentDate BETWEEN @TuNgay AND @DenNgay
        AND A.StatusID NOT IN (-2, -1, 0, 10)
        AND (@khachhang = '' OR A.ObjectID = @khachhang)
        AND (@ObjectName = '' OR A.ObjectName LIKE N'%' + @ObjectName + '%')
        AND (@EmployeeID = '' OR A.EmployeeID = @EmployeeID)
        AND (@EmployeeName = '' OR A.EmployeeName LIKE N'%' + @EmployeeName + '%')
        AND (ISNULL(@SYSBranchID, '')   = '' OR A.BranchID = @SYSBranchID)
        AND (ISNULL(@SYSCeoID, '')      = '' OR A.CeoID = @SYSCeoID)
        AND (ISNULL(@SYSManagerID, '')  = '' OR A.ManagerID = @SYSManagerID)
        AND (ISNULL(@SYSEmployeeID, '') = '' OR A.EmployeeID = @SYSEmployeeID OR @Username IN ('demo', 'admin'))
    GROUP BY A.ObjectID, A.ObjectName

    -------------------------------------------------
    -- 3. Top sản phẩm bán chạy
    -------------------------------------------------
    SELECT @TuNgay AS TuNgay, @DenNgay AS DenNgay,
        B.ItemID, B.ItemName, SUM(D.Quantity) AS SoLuong, SUM(D.Amount) AS DoanhSo
    INTO #BC3
    FROM AR_OrderAndReturnView A
    INNER JOIN AR_OrderDetailTbl D ON A.DocumentID = D.DocumentID
    INNER JOIN CF_ItemTbl B ON D.ItemID = B.ItemID
    WHERE A.DocumentDate BETWEEN @TuNgay AND @DenNgay
        AND A.StatusID NOT IN (-2, -1, 0, 10)
        AND (@khachhang = '' OR A.ObjectID = @khachhang)
        AND (@ObjectName = '' OR A.ObjectName LIKE N'%' + @ObjectName + '%')
        AND (@EmployeeID = '' OR A.EmployeeID = @EmployeeID)
        AND (@EmployeeName = '' OR A.EmployeeName LIKE N'%' + @EmployeeName + '%')
        AND (@ItemName = '' OR B.ItemName LIKE N'%' + @ItemName + '%')
        AND (ISNULL(@SYSBranchID, '')   = '' OR A.BranchID = @SYSBranchID)
        AND (ISNULL(@SYSCeoID, '')      = '' OR A.CeoID = @SYSCeoID)
        AND (ISNULL(@SYSManagerID, '')  = '' OR A.ManagerID = @SYSManagerID)
        AND (ISNULL(@SYSEmployeeID, '') = '' OR A.EmployeeID = @SYSEmployeeID OR @Username IN ('demo', 'admin'))
        AND ISNULL(D.isKM, 0) = 0
    GROUP BY B.ItemID, B.ItemName

    -------------------------------------------------
    -- Output
    -------------------------------------------------
    SELECT TOP (@TopN) ROW_NUMBER() OVER (ORDER BY DoanhSo DESC, EmployeeName) AS STT, * FROM #BC ORDER BY DoanhSo DESC
    SELECT TOP (@TopN) ROW_NUMBER() OVER (ORDER BY DoanhSo DESC, ObjectName) AS STT, * FROM #BC2 ORDER BY DoanhSo DESC
    SELECT TOP (@TopN) ROW_NUMBER() OVER (ORDER BY SoLuong DESC, ItemName) AS STT, * FROM #BC3 ORDER BY SoLuong DESC
    
    SELECT SUM(DoanhSo) AS TongTien FROM #BC
    SELECT SUM(DoanhSo) AS TongTien2 FROM #BC2
    SELECT SUM(DoanhSo) AS TongTien3, SUM(SoLuong) AS TongSoLuong FROM #BC3

    DROP TABLE #BC, #BC2, #BC3
END
GO
