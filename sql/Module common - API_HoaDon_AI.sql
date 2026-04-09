IF OBJECT_ID('API_HoaDon_AI', 'P') IS NOT NULL DROP PROCEDURE API_HoaDon_AI;
GO

CREATE PROCEDURE [dbo].[API_HoaDon_AI]
    @Username   VARCHAR(50)   = '',
    @TuNgay   DATETIME      = NULL,
    @DenNgay     DATETIME      = NULL,
    @timkiem NVARCHAR(50)  = ''
AS
BEGIN
    SET NOCOUNT ON
    
    -- 1. Validate User
    IF NOT EXISTS (SELECT 1 FROM SY_User WHERE UserName = @Username AND COALESCE(Disable, 0) = 0)
    BEGIN
        SELECT N'User không tồn tại hoặc đã bị khóa' AS Msg, 1 AS MsgType
        RETURN
    END

    -- 2. Defaults (Mặc định xem 10 ngày gần nhất)
    IF @TuNgay IS NULL SET @TuNgay = DATEADD(DAY, -10, GETDATE())
    IF @DenNgay IS NULL SET @DenNgay = GETDATE()

    -- 3. Phân quyền
    DECLARE @SYSBranchID    VARCHAR(50) = ''
    DECLARE @SYSCeoID       VARCHAR(50) = ''
    DECLARE @SYSManagerID   VARCHAR(50) = ''
    DECLARE @SYSEmployeeID  VARCHAR(50) = ''

    SELECT
        @SYSBranchID   = ISNULL(BranchID, ''),
        @SYSCeoID      = ISNULL(CeoID, ''),
        @SYSManagerID  = ISNULL(ManagerID, ''),
        @SYSEmployeeID = ISNULL(EmployeeID, '')
    FROM SY_User WHERE UserName = @Username

    -------------------------------------------------
    -- 4. Truy vấn dữ liệu hóa đơn
    -------------------------------------------------
    SELECT  
        ROW_NUMBER() OVER (ORDER BY A.DocumentDate DESC) AS STT, 
        A.DocumentID, A.DocumentDate,  
        O.ObjectName, O.Address, O.Phone, 
        A.Memo, A.Notes, 
        M.ObjectName AS ManagerName, 
        E.ObjectName AS EmployeeName, 
        A.BaseTotal, 
        S.StatusName, S.BackColor AS StatusBackColor
    INTO #BC
    FROM dbo.AR_InvoiceTbl A
    LEFT JOIN dbo.CF_ObjectTbl O ON O.ObjectID = A.ObjectID
    LEFT JOIN dbo.CF_ObjectTbl E ON E.ObjectID = A.EmployeeID
    LEFT JOIN dbo.CF_ObjectTbl M ON M.ObjectID = A.ManagerID
    LEFT JOIN dbo.AR_InvoiceStatusTbl S ON S.StatusID = A.StatusID
    WHERE A.DocumentDate BETWEEN @TuNgay AND @DenNgay
      AND (@timkiem = '' OR A.ObjectID LIKE '%' + @timkiem + '%' 
           OR O.ObjectName LIKE N'%' + @timkiem + '%'  
           OR O.Address LIKE N'%' + @timkiem + '%' 
           OR O.Phone LIKE '%' + @timkiem + '%')
      -- Phân quyền mượt: Cho phép AI (demo/admin) xem toàn bộ
      AND (ISNULL(@SYSBranchID, '')   = '' OR A.BranchID = @SYSBranchID   OR @Username IN ('demo', 'admin'))
      AND (ISNULL(@SYSCeoID, '')      = '' OR A.CeoID = @SYSCeoID         OR @Username IN ('demo', 'admin'))
      AND (ISNULL(@SYSManagerID, '')  = '' OR A.ManagerID = @SYSManagerID OR @Username IN ('demo', 'admin'))
      AND (ISNULL(@SYSEmployeeID, '') = '' OR A.EmployeeID = @SYSEmployeeID OR @Username IN ('demo', 'admin'))

    -------------------------------------------------
    -- 5. Kết quả Output (Trả về 2 Result Sets)
    -------------------------------------------------
    -- Bảng 1: Danh sách chi tiết
    SELECT * FROM #BC ORDER BY DocumentDate DESC
    
    -- Bảng 2: Tổng cộng
    SELECT SUM(BaseTotal) AS TongTien FROM #BC
    
    DROP TABLE #BC
END
GO
