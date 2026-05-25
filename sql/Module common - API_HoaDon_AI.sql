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

    -- 2. Defaults (Mặc định xem 10 ngày gần nhất, với UAT date fallback)
    IF @TuNgay IS NULL
    BEGIN
        IF EXISTS (SELECT 1 FROM dbo.AR_InvoiceTbl WITH (NOLOCK) WHERE DocumentDate >= DATEADD(DAY, -10, GETDATE()))
        BEGIN
            SET @TuNgay = DATEADD(DAY, -10, GETDATE())
        END
        ELSE
        BEGIN
            SET @TuNgay = DATEADD(YEAR, -10, GETDATE())
        END
    END
    IF @DenNgay IS NULL SET @DenNgay = GETDATE()

    -- 3. Phân quyền
    DECLARE @SYSBranchID    VARCHAR(50) = ''
    DECLARE @SYSCeoID       VARCHAR(50) = ''
    DECLARE @SYSManagerID   VARCHAR(50) = ''
    DECLARE @SYSEmployeeID  VARCHAR(50) = ''
    DECLARE @IsManager      BIT         = 0
    DECLARE @SYSUserGroupID VARCHAR(50) = ''

    SELECT
        @SYSBranchID   = ISNULL(BranchID, ''),
        @SYSCeoID      = ISNULL(CeoID, ''),
        @SYSManagerID  = ISNULL(ManagerID, ''),
        @SYSEmployeeID = ISNULL(EmployeeID, ''),
        @IsManager     = ISNULL(Manager, 0),
        @SYSUserGroupID = ISNULL(UserGroupID, '')
    FROM SY_User WITH (NOLOCK) WHERE UserName = @Username

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
    FROM dbo.AR_InvoiceTbl A WITH (NOLOCK)
    LEFT JOIN dbo.CF_ObjectTbl O WITH (NOLOCK) ON O.ObjectID = A.ObjectID
    LEFT JOIN dbo.CF_ObjectTbl E WITH (NOLOCK) ON E.ObjectID = A.EmployeeID
    LEFT JOIN dbo.CF_ObjectTbl M WITH (NOLOCK) ON M.ObjectID = A.ManagerID
    LEFT JOIN dbo.AR_InvoiceStatusTbl S WITH (NOLOCK) ON S.StatusID = A.StatusID
    WHERE A.DocumentDate BETWEEN @TuNgay AND @DenNgay
      AND (@timkiem = '' OR A.DocumentID LIKE '%' + @timkiem + '%'
           OR A.ObjectID LIKE '%' + @timkiem + '%' 
           OR O.ObjectName LIKE N'%' + @timkiem + '%'  
           OR O.Address LIKE N'%' + @timkiem + '%' 
           OR O.Phone LIKE '%' + @timkiem + '%')
      -- Phân quyền mượt: Cho phép xem dữ liệu theo sơ đồ tổ chức (Admin -> CEO -> Manager -> Nhân viên)
      AND (
          UPPER(@SYSUserGroupID) = 'ADMIN'
          OR (
              (ISNULL(@SYSBranchID, '') = '' OR ISNULL(A.BranchID, '') = @SYSBranchID)
              AND (
                  A.EmployeeID = @SYSEmployeeID
                  OR A.ManagerID = @SYSEmployeeID
                  OR A.CeoID = @SYSEmployeeID
              )
          )
      )

    -------------------------------------------------
    -- 5. Kết quả Output
    -------------------------------------------------
    IF NOT EXISTS (SELECT 1 FROM #BC)
    BEGIN
        SELECT TOP 0 1 AS NoData -- Return empty recordset instead of NULL sum
    END
    ELSE
    BEGIN
        -- Bảng 1: Danh sách chi tiết
        SELECT * FROM #BC ORDER BY DocumentDate DESC
    END
    
    DROP TABLE #BC
END
GO
