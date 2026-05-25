IF OBJECT_ID('API_DonHang_AI', 'P') IS NOT NULL DROP PROCEDURE API_DonHang_AI;
GO

CREATE PROCEDURE [dbo].[API_DonHang_AI]
   @Username     VARCHAR(50)   = '',
   @User         VARCHAR(50)   = '',         -- Dashboard/Frontend alias
   @TuNgay       DATETIME      = NULL,
   @DenNgay      DATETIME      = NULL,
   @FromDate     DATETIME      = NULL,       -- Dashboard/Frontend alias
   @ToDate       DATETIME      = NULL,       -- Dashboard/Frontend alias
   @StatusID     INT           = NULL,
   @StatusName   NVARCHAR(50)  = '',
   @EmployeeID   VARCHAR(50)   = '',
   @MaKhachHang  NVARCHAR(100) = '',         -- Chatbot parameter
   @ObjectID     VARCHAR(50)   = '',         -- Frontend parameter alias
   @timkiem      NVARCHAR(50)  = '',         -- Chatbot parameter
   @SearchText   NVARCHAR(50)  = '',         -- Frontend parameter alias
   @BranchID     VARCHAR(50)   = '',         -- Frontend parameter alias
   @TopN         INT           = 10,
   @page         INT           = 1,          -- Pagination: sent by .NET server, handled server-side
   @limit        INT           = 500,        -- Pagination: sent by .NET server, used as TopN cap
   -- Context parameters injected automatically by .NET server from claims
   @SYSBranchID  VARCHAR(50)   = '',
   @SYSCeoID     VARCHAR(50)   = '',
   @SYSManagerID VARCHAR(50)   = '',
   @SYSEmployeeID VARCHAR(50)  = ''
AS
BEGIN
   SET NOCOUNT ON
   
   -- 0. Mapping Dashboard/Frontend Alias
   IF NULLIF(@User, '') IS NOT NULL AND EXISTS (SELECT 1 FROM SY_User WITH (NOLOCK) WHERE UserName = @User AND COALESCE(Disable, 0) = 0)
   BEGIN
       SET @Username = @User;
   END
   IF @FromDate IS NOT NULL SET @TuNgay = @FromDate;
   IF @ToDate IS NOT NULL SET @DenNgay = @ToDate;
   
    -- Allow @ObjectID mapping to MaKhachHang even if it is a name, to ensure name-to-ID resolution runs
    IF NULLIF(@ObjectID, '') IS NOT NULL AND (NULLIF(@MaKhachHang, '') IS NULL OR @MaKhachHang = '')
    BEGIN
        SET @MaKhachHang = @ObjectID;
    END
    
    IF NULLIF(@SearchText, '') IS NOT NULL SET @timkiem = @SearchText;
    
    -- Defend against NULL or non-positive bounds passed by web server model binders
    IF @TopN IS NULL OR @TopN <= 0 SET @TopN = 10;
    
    -- @limit từ web/server override @TopN (max 5000 để tránh quá tải)
    IF @limit IS NOT NULL AND @limit > 0 AND @limit <= 5000 SET @TopN = @limit;
    
    -- 1. Validate User (Skip strict validation if username not provided yet, fallback to employee id resolution)
    IF @Username <> '' AND NOT EXISTS (SELECT 1 FROM SY_User WITH (NOLOCK) WHERE UserName = @Username AND COALESCE(Disable, 0) = 0)
    BEGIN
        SELECT N'User không tồn tại hoặc đã bị khóa' AS Msg, 1 AS MsgType
        RETURN
    END

    -- 2. Defaults & Normalize Bounds (With UAT date fallback)
    IF @TuNgay IS NULL
    BEGIN
        IF EXISTS (SELECT 1 FROM dbo.AR_OrderTbl WITH (NOLOCK) WHERE DocumentDate >= DATEADD(MONTH, -1, GETDATE()))
        BEGIN
            SET @TuNgay = DATEADD(MONTH, -1, GETDATE())
        END
        ELSE
        BEGIN
            SET @TuNgay = DATEADD(YEAR, -10, GETDATE())
        END
    END
    IF @DenNgay IS NULL SET @DenNgay = GETDATE()
   
   SET @TuNgay = DATEADD(DAY, DATEDIFF(DAY, 0, @TuNgay), 0)
   SET @DenNgay = DATEADD(SECOND, -1, DATEADD(DAY, 1, DATEADD(DAY, DATEDIFF(DAY, 0, @DenNgay), 0)))
   
   -- CLEAN AI EXTRACTED BRACKETS
   IF @EmployeeID LIKE '%\[%\]%' ESCAPE '\'
   BEGIN
       SET @EmployeeID = SUBSTRING(@EmployeeID, CHARINDEX('[', @EmployeeID) + 1, CHARINDEX(']', @EmployeeID) - CHARINDEX('[', @EmployeeID) - 1)
   END
   IF @MaKhachHang LIKE '%\[%\]%' ESCAPE '\'
   BEGIN
       SET @MaKhachHang = SUBSTRING(@MaKhachHang, CHARINDEX('[', @MaKhachHang) + 1, CHARINDEX(']', @MaKhachHang) - CHARINDEX('[', @MaKhachHang) - 1)
   END

   -- ANTI-HALLUCINATION: Clear hallucinated IDs (e.g. LLM compressed a name like 'TRẦNVĂNHƯỞNG')
   -- Valid IDs without numbers are very rare and short.
   IF @MaKhachHang <> '' AND LEN(@MaKhachHang) > 8 AND @MaKhachHang NOT LIKE '%[0-9]%'
   BEGIN
       SET @MaKhachHang = ''
   END

   DECLARE @SYS_BranchID VARCHAR(50) = ISNULL(@SYSBranchID, '')
    IF @SYS_BranchID = '' AND @Username <> ''
    BEGIN
        SELECT @SYS_BranchID = COALESCE(BranchID, '') FROM SY_User WITH (NOLOCK) WHERE UserName = @Username AND COALESCE(Disable, 0) = 0
    END

    -- SMART CUSTOMER RESOLUTION (NAME TO ID)
   IF @MaKhachHang <> '' AND NOT EXISTS (SELECT 1 FROM dbo.CF_ObjectTbl WHERE ObjectID = @MaKhachHang)
   BEGIN
       DECLARE @ResolvedID VARCHAR(50) = ''
       DECLARE @CleanSearch NVARCHAR(100) = REPLACE(dbo.ufn_remove_accents(@MaKhachHang), ' ', '')

       SELECT TOP 1 @ResolvedID = ObjectID 
       FROM dbo.CF_ObjectTbl 
       WHERE (REPLACE(dbo.ufn_remove_accents(ObjectName), ' ', '') LIKE '%' + @CleanSearch + '%'
          OR ObjectID LIKE '%' + @CleanSearch + '%') AND (@SYS_BranchID = '' OR BranchID = @SYS_BranchID)
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

   IF @EmployeeID <> '' AND LEN(@EmployeeID) > 8 AND @EmployeeID NOT LIKE '%[0-9]%'
   BEGIN
       SET @EmployeeID = ''
   END
   
   SET @timkiem = ISNULL(@timkiem, '')
   SET @StatusName = ISNULL(@StatusName, '')

   -- 3. Resolve StatusName → StatusID
   IF @StatusID IS NULL AND @StatusName <> ''
   BEGIN
       SET @StatusID = -999; -- Force rỗng nếu không tìm thấy tên chính xác
       SELECT TOP 1 @StatusID = StatusID
       FROM AR_OrderStatusTbl
       WHERE StatusName LIKE N'%' + @StatusName + '%'
   END

   -- 4. Lấy quyền user (Hỗ trợ định danh thông qua nhiều nguồn: @Username, @User, @SYSEmployeeID, @EmployeeID)
   SET @SYS_BranchID    = ISNULL(@SYSBranchID, '')
   DECLARE @SYS_CeoID       VARCHAR(50) = ISNULL(@SYSCeoID, '')
   DECLARE @SYS_ManagerID   VARCHAR(50) = ISNULL(@SYSManagerID, '')
   DECLARE @SYS_EmployeeID  VARCHAR(50) = ISNULL(@SYSEmployeeID, '')
   DECLARE @IsManager       BIT         = 0
   DECLARE @SYSUserGroupID  VARCHAR(50) = ''

   -- Ưu tiên tìm theo UserName trước
   IF NULLIF(@Username, '') IS NOT NULL
   BEGIN
       SELECT
           @SYS_BranchID    = ISNULL(BranchID, ''),
           @SYS_CeoID       = ISNULL(CeoID, ''),
           @SYS_ManagerID   = ISNULL(ManagerID, ''),
           @SYS_EmployeeID  = ISNULL(EmployeeID, ''),
           @IsManager       = ISNULL(Manager, 0),
           @SYSUserGroupID  = ISNULL(UserGroupID, '')
       FROM SY_User WHERE UserName = @Username AND COALESCE(Disable, 0) = 0
   END
   -- Nếu không có Username nhưng có mã EmployeeID, tra cứu ngược lại từ SY_User
   ELSE IF NULLIF(@SYS_EmployeeID, '') IS NOT NULL OR NULLIF(@EmployeeID, '') IS NOT NULL
   BEGIN
       DECLARE @EmpLookup VARCHAR(50) = COALESCE(NULLIF(@SYS_EmployeeID, ''), @EmployeeID)
       SELECT TOP 1
           @Username        = UserName,
           @SYS_BranchID    = ISNULL(BranchID, ''),
           @SYS_CeoID       = ISNULL(CeoID, ''),
           @SYS_ManagerID   = ISNULL(ManagerID, ''),
           @SYS_EmployeeID  = ISNULL(EmployeeID, ''),
           @IsManager       = ISNULL(Manager, 0),
           @SYSUserGroupID  = ISNULL(UserGroupID, '')
       FROM SY_User WHERE EmployeeID = @EmpLookup AND COALESCE(Disable, 0) = 0
       ORDER BY Manager DESC
   END

   -- Áp dụng phân quyền Row-Level Security (RLS) thông minh
   IF UPPER(@SYSUserGroupID) = 'ADMIN'
   BEGIN
       SET @SYS_BranchID = ''
       SET @SYS_CeoID = ''
       SET @SYS_ManagerID = ''
       SET @SYS_EmployeeID = ''
       SET @EmployeeID = ''
       SET @BranchID = ''
   END
   ELSE IF @IsManager = 1
   BEGIN
       -- Nếu là Quản lý: Cho phép xem toàn bộ nhân viên cấp dưới trực thuộc hoặc chính mình.
       -- Nếu tham số @EmployeeID là mã của chính quản lý hoặc để trống thì xóa lọc @EmployeeID để xem tất cả nhân viên.
       IF @EmployeeID = @SYS_EmployeeID OR @EmployeeID = ''
       BEGIN
           SET @EmployeeID = ''
       END
   END
   ELSE
   BEGIN
       -- Nếu là Nhân viên thường: Chỉ được phép xem đơn hàng của chính mình.
       SET @EmployeeID = @SYS_EmployeeID
   END

   -------------------------------------------------
   -- 5. Truy vấn danh sách đơn hàng
   -------------------------------------------------
    SELECT TOP (@TopN)
        ROW_NUMBER() OVER (ORDER BY A.DateCreate DESC, A.DocumentID DESC) AS STT,
        A.DocumentID,
        A.DocumentDate,
        A.DeliverDate,
        A.ObjectID,
        O.ObjectName,
        O.Phone AS CustomerPhone,
        A.EmployeeID,
        E.ObjectName AS EmployeeName,
        A.StatusID,
        S.StatusName,
        A.BaseTotal,
        A.DepositAmount,
        A.Notes,
        A.DateCreate,
        (SELECT SUM(COALESCE(DiemTichLuy, 0)) FROM AR_OrderDetailTbl X WITH (NOLOCK) WHERE X.DocumentID = A.DocumentID) AS DiemTichLuy
   FROM dbo.AR_OrderTbl A WITH (NOLOCK)
   LEFT JOIN dbo.CF_ObjectTbl O WITH (NOLOCK) ON O.ObjectID = A.ObjectID
   LEFT JOIN dbo.CF_ObjectTbl E WITH (NOLOCK) ON E.ObjectID = A.EmployeeID
   LEFT JOIN dbo.AR_OrderStatusTbl S WITH (NOLOCK) ON S.StatusID = A.StatusID
   WHERE A.DocumentDate BETWEEN @TuNgay AND @DenNgay
       AND (@StatusID IS NULL OR A.StatusID = @StatusID)
       AND (@MaKhachHang = '' OR A.ObjectID = @MaKhachHang)
       AND (@EmployeeID = '' OR A.EmployeeID = @EmployeeID)
       AND (@BranchID = '' OR A.BranchID = @BranchID)
        -- Phân quyền mượt: Cho phép xem dữ liệu theo sơ đồ tổ chức (Admin -> CEO -> Manager -> Nhân viên)
        AND (
            UPPER(@SYSUserGroupID) = 'ADMIN'
            OR (
                (ISNULL(@SYS_BranchID, '') = '' OR ISNULL(A.BranchID, '') = @SYS_BranchID)
                AND (
                    A.EmployeeID = @SYS_EmployeeID
                    OR A.ManagerID = @SYS_EmployeeID
                    OR A.CeoID = @SYS_EmployeeID
                )
            )
        )
       AND (@timkiem = ''
            OR A.DocumentID LIKE '%' + @timkiem + '%'
            OR O.ObjectName LIKE N'%' + @timkiem + '%'
            OR O.Phone LIKE '%' + @timkiem + '%')
   ORDER BY A.DateCreate DESC, A.DocumentID DESC
END
GO
