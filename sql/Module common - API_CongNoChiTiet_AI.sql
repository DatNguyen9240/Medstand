CREATE OR ALTER PROCEDURE [dbo].[API_CongNoChiTiet_AI]
   @MaKhachHang  VARCHAR(50),
   @Username   VARCHAR(50),
   @DenNgay     DATETIME = NULL
AS
BEGIN
   SET NOCOUNT ON
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
       DECLARE @CleanSearch VARCHAR(100) = REPLACE(REPLACE(@MaKhachHang, ' ', ''), N' ', '')

       SELECT TOP 1 @ResolvedID = ObjectID 
       FROM dbo.CF_ObjectTbl 
       WHERE (REPLACE(REPLACE(ObjectName, ' ', ''), N' ', '') COLLATE Latin1_General_CI_AI) LIKE ('%' + @CleanSearch + '%' COLLATE Latin1_General_CI_AI)
          OR (ObjectID COLLATE Latin1_General_CI_AI) LIKE ('%' + @CleanSearch + '%' COLLATE Latin1_General_CI_AI)
       ORDER BY 
           CASE WHEN ObjectID = @CleanSearch THEN 1
                WHEN REPLACE(REPLACE(ObjectName, ' ', ''), N' ', '') = @CleanSearch THEN 2
                WHEN REPLACE(REPLACE(ObjectName, ' ', ''), N' ', '') LIKE @CleanSearch + '%' THEN 3
                ELSE 4
           END,
           LEN(ObjectName) ASC;

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
    DECLARE @SYS_BranchID   VARCHAR(50) = ''
    DECLARE @SYSUserGroupID VARCHAR(50) = ''
    
    SELECT 
        @SYS_BranchID   = COALESCE(BranchID, ''),
        @SYSUserGroupID = COALESCE(UserGroupID, '')
    FROM dbo.SY_User 
    WHERE UserName = @Username AND COALESCE(Disable, 0) = 0

    IF UPPER(@SYSUserGroupID) <> 'ADMIN'
    BEGIN
        -- Đảm bảo khách hàng thuộc chi nhánh và có trong danh sách phân quyền của user
        IF NOT EXISTS (
            SELECT 1 FROM dbo.CF_ObjectTbl O
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
       SUM(DebitAmount - CreditAmount) OVER() AS [TongTienNoThucTe]
   FROM SY_GetDebitDocFnc(@DenNgay, @MaKhachHang, '131', '')
   WHERE (DebitAmount - CreditAmount) <> 0
   ORDER BY DocumentDate DESC
END


