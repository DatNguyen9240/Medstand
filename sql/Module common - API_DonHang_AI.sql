IF OBJECT_ID('API_DonHang_AI', 'P') IS NOT NULL DROP PROCEDURE API_DonHang_AI;
GO

CREATE PROCEDURE [dbo].[API_DonHang_AI]
   @Username    VARCHAR(50)   = '',
   @TuNgay    DATETIME      = NULL,
   @DenNgay      DATETIME      = NULL,
   @StatusID    INT           = NULL,
   @StatusName  NVARCHAR(50)  = '',
   @EmployeeID  VARCHAR(50)   = '',
   @khachhang   VARCHAR(50)   = '',
   @timkiem  NVARCHAR(50)  = '',
   @TopN        INT           = 10
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

   -- 4. Lấy quyền user
   DECLARE @SYSBranchID    VARCHAR(50) = ''
   DECLARE @SYSCeoID       VARCHAR(50) = ''
   DECLARE @SYSManagerID   VARCHAR(50) = ''
   DECLARE @SYSEmployeeID  VARCHAR(50) = ''
   DECLARE @IsManager      BIT         = 0

   SELECT
       @SYSBranchID   = ISNULL(BranchID, ''),
       @SYSCeoID      = ISNULL(CeoID, ''),
       @SYSManagerID  = ISNULL(ManagerID, ''),
       @SYSEmployeeID = ISNULL(EmployeeID, ''),
       @IsManager     = ISNULL(Manager, 0)
   FROM SY_User WHERE UserName = @Username

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
       A.DateCreate
   FROM dbo.AR_OrderTbl A
   LEFT JOIN dbo.CF_ObjectTbl O ON O.ObjectID = A.ObjectID
   LEFT JOIN dbo.CF_ObjectTbl E ON E.ObjectID = A.EmployeeID
   LEFT JOIN dbo.AR_OrderStatusTbl S ON S.StatusID = A.StatusID
   WHERE CAST(A.DocumentDate AS DATE) BETWEEN @TuNgay AND @DenNgay
       AND (@StatusID IS NULL OR A.StatusID = @StatusID)
       AND (@khachhang = '' OR A.ObjectID = @khachhang)
       AND (@EmployeeID = '' OR A.EmployeeID = @EmployeeID)
       -- Phân quyền mượt: Cho phép Quản lý (Manager=1) xem toàn bộ
       AND (ISNULL(@SYSBranchID, '')   = '' OR ISNULL(A.BranchID, '') = @SYSBranchID   OR @IsManager = 1)
       AND (ISNULL(@SYSCeoID, '')      = '' OR ISNULL(A.CeoID, '')    = @SYSCeoID      OR @IsManager = 1)
       AND (ISNULL(@SYSManagerID, '')  = '' OR ISNULL(A.ManagerID, '') = @SYSManagerID OR @IsManager = 1)
       AND (ISNULL(@SYSEmployeeID, '') = '' OR A.EmployeeID = @SYSEmployeeID           OR @IsManager = 1)
       AND (@timkiem = ''
            OR A.DocumentID LIKE '%' + @timkiem + '%'
            OR O.ObjectName LIKE N'%' + @timkiem + '%'
            OR O.Phone LIKE '%' + @timkiem + '%')
   ORDER BY A.DateCreate DESC, A.DocumentID DESC
END
GO
