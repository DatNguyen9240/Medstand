USE medtest;
GO

CREATE OR ALTER PROCEDURE [dbo].[API_HoaDon_AI]
    @Username   VARCHAR(50)   = '',
    @TuNgay   DATETIME      = NULL,
    @DenNgay     DATETIME      = NULL,
    @timkiem NVARCHAR(50)  = '',
    @MaKhachHang NVARCHAR(100) = ''
AS
BEGIN
    SET NOCOUNT ON

    -- ═══ GUARD: dọn temp table còn sót lại từ request lỗi trước trên cùng connection ═══
    IF OBJECT_ID('tempdb..#BC') IS NOT NULL DROP TABLE #BC;

    -- 1. Validate User
    IF NOT EXISTS (SELECT 1 FROM SY_User WHERE UserName = @Username AND COALESCE(Disable, 0) = 0)
    BEGIN
        SELECT N'User không tồn tại hoặc đã bị khóa' AS Msg, 1 AS MsgType
        RETURN
    END

    -- 2. Defaults (Mặc định xem 10 ngày gần nhất, với UAT date fallback)
    IF @TuNgay IS NULL
    BEGIN
        IF @timkiem <> ''
        BEGIN
            SET @TuNgay = DATEADD(YEAR, -10, GETDATE())
        END
        ELSE IF EXISTS (SELECT 1 FROM dbo.AR_InvoiceTbl WITH (NOLOCK) WHERE DocumentDate >= DATEADD(DAY, -10, GETDATE()))
        BEGIN
            SET @TuNgay = DATEADD(DAY, -10, GETDATE())
        END
        ELSE
        BEGIN
            SET @TuNgay = DATEADD(YEAR, -10, GETDATE())
        END
    END
    IF @DenNgay IS NULL SET @DenNgay = GETDATE()
    SET @TuNgay = CAST(@TuNgay AS DATE)
    SET @DenNgay = DATEADD(DAY, 1, CAST(@DenNgay AS DATE))

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

    -- SMART CUSTOMER RESOLUTION (NAME TO ID)
    -- SEARCH-005: không còn tự lấy TOP 1 khi có NHIỀU khách gần đúng cùng khớp —
    -- chỉ tự resolve khi khớp chính xác mã hoặc chỉ có đúng 1 khách gần đúng;
    -- nhiều hơn 1 thì trả NEEDS_SELECTION (MsgType=2) kèm danh sách để tầng gọi
    -- bắt người dùng chọn, thay vì đoán bừa một khách rồi lọc nhầm hóa đơn.
     IF @MaKhachHang <> '' AND NOT EXISTS (SELECT 1 FROM dbo.CF_ObjectTbl WHERE ObjectID = @MaKhachHang)
     BEGIN
         DECLARE @ResolvedID VARCHAR(50) = ''
         DECLARE @CleanSearch NVARCHAR(100) = dbo.ufn_clean_customer_name(@MaKhachHang)

         -- 0. Khớp chính xác MÃ (khoá thật, duy nhất) luôn quyết định ngay. Cố
         --    tình KHÔNG áp dụng lối tắt này cho tên trùng khớp tuyệt đối — xem
         --    lý do ở Module_Common_API_CongNoKhachHang_AI.sql.
         SELECT TOP 1 @ResolvedID = ObjectID
         FROM dbo.CF_ObjectTbl
         WHERE ObjectID = @CleanSearch AND (@SYSBranchID = '' OR BranchID = @SYSBranchID);

         IF @ResolvedID = ''
         BEGIN
             -- 1. Fast Path: đếm số khách khớp trước, không tự lấy TOP 1 khi >1.
             DECLARE @FastMatchCount INT
             SELECT @FastMatchCount = COUNT(DISTINCT ObjectID)
             FROM dbo.CF_ObjectTbl
             WHERE (ObjectID LIKE '%' + @CleanSearch + '%'
                OR ObjectName LIKE '%' + @CleanSearch + '%') AND (@SYSBranchID = '' OR BranchID = @SYSBranchID)

             IF @FastMatchCount > 1
             BEGIN
                 DECLARE @CandidateJsonFast NVARCHAR(MAX) =
                 (
                     SELECT TOP 8 ObjectID AS id, ObjectName AS label, Phone AS phone
                     FROM dbo.CF_ObjectTbl
                     WHERE (ObjectID LIKE '%' + @CleanSearch + '%' OR ObjectName LIKE '%' + @CleanSearch + '%')
                       AND (@SYSBranchID = '' OR BranchID = @SYSBranchID)
                       AND ObjectID IN (SELECT ObjectID FROM dbo.AR_GetObjectByUserFnc(@Username)) /* SEARCH-005-SCOPE */
                     ORDER BY ObjectName
                     FOR JSON PATH
                 )
                 IF @CandidateJsonFast IS NOT NULL /* SEARCH-005-SCOPE-GUARD */
                 BEGIN
                     SELECT N'Có nhiều khách hàng trùng khớp, vui lòng chọn.' AS Msg, 2 AS MsgType,
                        'NEEDS_SELECTION' AS Code, @CandidateJsonFast AS CandidateJson
                 RETURN
                 END
             END
             ELSE IF @FastMatchCount = 1
             BEGIN
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
             END
             ELSE
             BEGIN
                 -- 2. Slow Path: Fallback to heavy clean function scan only if Fast Path found nothing
                 DECLARE @SlowMatchCount INT
                 SELECT @SlowMatchCount = COUNT(DISTINCT ObjectID)
                 FROM dbo.CF_ObjectTbl
                 WHERE (dbo.ufn_clean_customer_name(ObjectName) LIKE '%' + @CleanSearch + '%'
                    OR ObjectID LIKE '%' + @CleanSearch + '%') AND (@SYSBranchID = '' OR BranchID = @SYSBranchID)

                 IF @SlowMatchCount > 1
                 BEGIN
                     DECLARE @CandidateJsonSlow NVARCHAR(MAX) =
                     (
                         SELECT TOP 8 ObjectID AS id, ObjectName AS label, Phone AS phone
                         FROM dbo.CF_ObjectTbl
                         WHERE (dbo.ufn_clean_customer_name(ObjectName) LIKE '%' + @CleanSearch + '%' OR ObjectID LIKE '%' + @CleanSearch + '%')
                           AND (@SYSBranchID = '' OR BranchID = @SYSBranchID)
                           AND ObjectID IN (SELECT ObjectID FROM dbo.AR_GetObjectByUserFnc(@Username)) /* SEARCH-005-SCOPE */
                         ORDER BY ObjectName
                         FOR JSON PATH
                     )
                     IF @CandidateJsonSlow IS NOT NULL /* SEARCH-005-SCOPE-GUARD */
                     BEGIN
                         SELECT N'Có nhiều khách hàng trùng khớp, vui lòng chọn.' AS Msg, 2 AS MsgType,
                            'NEEDS_SELECTION' AS Code, @CandidateJsonSlow AS CandidateJson
                     RETURN
                     END
                 END
                 ELSE IF @SlowMatchCount = 1
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
             END
         END

         IF @ResolvedID <> ''
         BEGIN
             SET @MaKhachHang = @ResolvedID
         END
     END

    -------------------------------------------------
    -- 4. Truy vấn dữ liệu hóa đơn
    -------------------------------------------------
    SELECT  
        ROW_NUMBER() OVER (ORDER BY A.DocumentDate DESC) AS STT, 
        A.DocumentID, A.DocumentDate,
        A.ObjectID, O.ObjectName, O.Address, O.Phone,
        A.Memo, A.Notes, 
        M.ObjectName AS ManagerName, 
        COALESCE(EU.HoTen, E.ObjectName, A.EmployeeID) AS EmployeeName,
        A.EmployeeID, A.BranchID,
        A.BaseTotal, A.StatusID,
        S.StatusName, S.BackColor AS StatusBackColor
    INTO #BC
    FROM dbo.AR_InvoiceTbl A WITH (NOLOCK)
    LEFT JOIN dbo.CF_ObjectTbl O WITH (NOLOCK) ON O.ObjectID = A.ObjectID
    LEFT JOIN dbo.CF_ObjectTbl E WITH (NOLOCK) ON E.ObjectID = A.EmployeeID
    OUTER APPLY (
        SELECT TOP 1 NULLIF(LTRIM(RTRIM(U.HoTen)), '') AS HoTen
        FROM dbo.SY_User U WITH (NOLOCK)
        WHERE U.EmployeeID = A.EmployeeID
          AND COALESCE(U.Disable, 0) = 0
        ORDER BY CASE WHEN U.UserName = @Username THEN 0 ELSE 1 END, U.UserName
    ) EU
    LEFT JOIN dbo.CF_ObjectTbl M WITH (NOLOCK) ON M.ObjectID = A.ManagerID
    LEFT JOIN dbo.AR_InvoiceStatusTbl S WITH (NOLOCK) ON S.StatusID = A.StatusID
    WHERE A.DocumentDate >= @TuNgay
      AND A.DocumentDate < @DenNgay
      AND (@MaKhachHang = '' OR A.ObjectID = @MaKhachHang)
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
        SELECT TOP 0 * FROM #BC -- Keep the same schema when no invoices match
    END
    ELSE
    BEGIN
        -- Bảng 1: Danh sách chi tiết
        SELECT * FROM #BC ORDER BY DocumentDate DESC
    END
    
    DROP TABLE #BC
END
GO
