CREATE OR ALTER PROCEDURE [dbo].[API_CongNoChiTiet_AI]
   @MaKhachHang  NVARCHAR(100),
   @Username   VARCHAR(50),
   @DenNgay     DATETIME = NULL
AS
BEGIN
   SET NOCOUNT ON
    
    DECLARE @SYS_BranchID   VARCHAR(50) = ''
    DECLARE @SYSUserGroupID VARCHAR(50) = ''

    SELECT 
        @SYS_BranchID   = COALESCE(BranchID, ''),
        @SYSUserGroupID = COALESCE(UserGroupID, '')
    FROM dbo.SY_User WITH (NOLOCK)
    WHERE UserName = @Username AND COALESCE(Disable, 0) = 0
   IF @DenNgay IS NULL SET @DenNgay = GETDATE()
   ELSE SET @DenNgay = DATEADD(SECOND, -1, DATEADD(DAY, 1, CAST(CAST(@DenNgay AS DATE) AS DATETIME)))
   -- CLEAN AI EXTRACTED BRACKETS
   IF @MaKhachHang LIKE '%\[%\]%' ESCAPE '\'
   BEGIN
       SET @MaKhachHang = SUBSTRING(@MaKhachHang, CHARINDEX('[', @MaKhachHang) + 1, CHARINDEX(']', @MaKhachHang) - CHARINDEX('[', @MaKhachHang) - 1)
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

    IF @MaKhachHang = ''
    BEGIN
        SELECT N'Vui lòng cung cấp mã khách hàng để xem chi tiết.' AS [Msg], 1 AS [MsgType]
        RETURN
    END
     

     IF UPPER(@SYSUserGroupID) <> 'ADMIN'
     BEGIN
         -- Đảm bảo khách hàng thuộc chi nhánh và có trong danh sách phân quyền của user
         IF NOT EXISTS (
             SELECT 1 FROM dbo.CF_ObjectTbl O WITH (NOLOCK)
             WHERE O.ObjectID = @MaKhachHang
               AND (ISNULL(@SYS_BranchID, '') = '' OR O.BranchID = @SYS_BranchID)
               AND O.ObjectID IN (SELECT ObjectID FROM AR_GetObjectByUserFnc(@Username))
         )
         BEGIN
             SELECT N'Bạn không có quyền xem công nợ khách hàng này.' AS [Msg], 1 AS [MsgType]
             RETURN
         END
     END
    SELECT TOP 20
        DocumentID AS [MaHD],
        FORMAT(DocumentDate, 'dd/MM/yyyy') AS [Ngay],
        (DebitAmount - CreditAmount) AS [SoTien],
        Memo AS [DienGiai],
        COUNT(*) OVER() AS [TongSoHoaDon],
        SUM(DebitAmount - CreditAmount) OVER() AS [TongTienNoThucTe],
        @MaKhachHang AS [ObjectID]
    FROM SY_GetDebitDocFnc(@DenNgay, @MaKhachHang, '131', '')
    WHERE (DebitAmount - CreditAmount) <> 0
    ORDER BY DocumentDate DESC
END


