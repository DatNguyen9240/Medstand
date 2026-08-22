CREATE OR ALTER PROCEDURE [dbo].[API_CongNoKhachHang_AI]
   @DenNgay     DATETIME     = NULL,
   @MaKhachHang  NVARCHAR(100) = '',
   @Username   VARCHAR(50)
AS
BEGIN
   SET NOCOUNT ON
    
    DECLARE @SYS_BranchID   VARCHAR(50) = ''
    DECLARE @SYSUserGroupID VARCHAR(50) = ''

    SELECT 
        @SYS_BranchID   = COALESCE(BranchID, ''),
        @SYSUserGroupID = COALESCE(UserGroupID, '')
    FROM dbo.SY_User 
    WHERE UserName = @Username AND COALESCE(Disable, 0) = 0
    
    

   -- CLEAN AI EXTRACTED BRACKETS
   -- Lấy ']' đầu tiên NẰM SAU '[' để không sinh độ dài âm cho SUBSTRING (Msg 536)
   DECLARE @BracketOpen  INT = CHARINDEX('[', @MaKhachHang)
   DECLARE @BracketClose INT = CHARINDEX(']', @MaKhachHang, @BracketOpen + 1)
   IF @BracketOpen > 0 AND @BracketClose > @BracketOpen
   BEGIN
       SET @MaKhachHang = SUBSTRING(@MaKhachHang, @BracketOpen + 1, @BracketClose - @BracketOpen - 1)
   END

    IF @DenNgay IS NULL SET @DenNgay = GETDATE()
    ELSE SET @DenNgay = DATEADD(SECOND, -1, DATEADD(DAY, 1, CAST(CAST(@DenNgay AS DATE) AS DATETIME)))
    
    -- SMART CUSTOMER RESOLUTION (NAME TO ID)
     IF @MaKhachHang <> '' AND NOT EXISTS (SELECT 1 FROM dbo.CF_ObjectTbl WHERE ObjectID = @MaKhachHang)
     BEGIN
         DECLARE @ResolvedID VARCHAR(50) = ''
         DECLARE @CleanSearch NVARCHAR(100) = dbo.ufn_clean_customer_name(@MaKhachHang)

         -- 1. Fast Path: Match by ObjectID or ObjectName directly without scalar function scan
         SELECT TOP 1 @ResolvedID = ObjectID 
         FROM dbo.CF_ObjectTbl 
         WHERE (ObjectID LIKE '%' + @CleanSearch + '%'
            OR ObjectName LIKE '%' + @CleanSearch + '%')
           AND ISNULL(isCustomer, 0) = 1
           AND ISNULL(isDisable, 0) = 0
           AND (@SYS_BranchID = '' OR BranchID = @SYS_BranchID)
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
                OR ObjectID LIKE '%' + @CleanSearch + '%')
               AND ISNULL(isCustomer, 0) = 1
               AND ISNULL(isDisable, 0) = 0
               AND (@SYS_BranchID = '' OR BranchID = @SYS_BranchID)
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
   
   

   IF @MaKhachHang = '' OR @MaKhachHang IS NULL
   BEGIN
       -- Dùng bảng tạm để tổng hợp trước, tránh query view nhiều lần
       DECLARE @CongNo TABLE (ObjectID VARCHAR(50), TongNo MONEY)
       INSERT INTO @CongNo
       SELECT ObjectID, SUM(Amount) AS TongNo
       FROM vCongNoBanHang
       WHERE DocumentDate <= @DenNgay
       GROUP BY ObjectID
       HAVING SUM(Amount) > 0

       SELECT TOP 20
           O.ObjectName AS TenKH,
           C.TongNo,
           C.ObjectID AS MaKH,
           -- Phân nhóm công nợ (Chatbot tự động sinh Tab bộ lọc tương ứng)
           CASE 
               WHEN C.TongNo >= 500000000 THEN N'Nợ Khủng'
               WHEN C.TongNo >= 100000000 THEN N'Nợ Vừa'
               ELSE N'Nợ Nhỏ'
           END AS PhanLoai,
           CASE WHEN ISNULL(O.isCustomer, 0) = 1 THEN N'CUSTOMER' ELSE N'UNKNOWN' END AS ObjectType,
           C.ObjectID AS CustomerID,
           O.ObjectName AS CustomerName,
           C.TongNo AS TotalDebt,
           N'DUE_DATE_UNKNOWN' AS PaymentStatus,
           CASE
               WHEN C.TongNo >= 500000000 THEN N'LARGE'
               WHEN C.TongNo >= 100000000 THEN N'MEDIUM'
               ELSE N'SMALL'
           END AS DebtSize,
           N'DUE_DATE_UNKNOWN' AS DueStatus,
           @DenNgay AS AsOfDate,
           N'DEBT-V1-DRAFT' AS RuleVersion,
           N'vCongNoBanHang' AS DataSource
       FROM @CongNo C
       LEFT JOIN CF_ObjectTbl O ON C.ObjectID = O.ObjectID
       WHERE (
           UPPER(@SYSUserGroupID) = 'ADMIN'
           OR (
               (ISNULL(@SYS_BranchID, '') = '' OR O.BranchID = @SYS_BranchID)
               AND C.ObjectID IN (SELECT ObjectID FROM AR_GetObjectByUserFnc(@Username))
           )
       )
       AND ISNULL(O.isCustomer, 0) = 1
       ORDER BY C.TongNo DESC
       
       RETURN
   END

   SELECT
       O.ObjectName AS TenKH,
       SUM(A.DebitAmount - A.CreditAmount) AS TongNo,
       A.ObjectID AS MaKH,
       -- Phân nhóm công nợ khi xem lẻ
       CASE 
           WHEN SUM(A.DebitAmount - A.CreditAmount) >= 500000000 THEN N'Nợ Khủng'
           WHEN SUM(A.DebitAmount - A.CreditAmount) >= 100000000 THEN N'Nợ Vừa'
           ELSE N'Nợ Nhỏ'
       END AS PhanLoai,
       CASE WHEN ISNULL(O.isCustomer, 0) = 1 THEN N'CUSTOMER' ELSE N'UNKNOWN' END AS ObjectType,
       A.ObjectID AS CustomerID,
       O.ObjectName AS CustomerName,
       SUM(A.DebitAmount - A.CreditAmount) AS TotalDebt,
       N'DUE_DATE_UNKNOWN' AS PaymentStatus,
       CASE
           WHEN SUM(A.DebitAmount - A.CreditAmount) >= 500000000 THEN N'LARGE'
           WHEN SUM(A.DebitAmount - A.CreditAmount) >= 100000000 THEN N'MEDIUM'
           ELSE N'SMALL'
       END AS DebtSize,
       N'DUE_DATE_UNKNOWN' AS DueStatus,
       @DenNgay AS AsOfDate,
       N'DEBT-V1-DRAFT' AS RuleVersion,
       N'SY_GetDebitDocFnc' AS DataSource
   FROM SY_GetDebitDocFnc(@DenNgay, @MaKhachHang, '131', '') A
   LEFT JOIN dbo.CF_ObjectTbl O ON A.ObjectID = O.ObjectID
   WHERE A.ObjectID = @MaKhachHang
     AND ISNULL(O.isCustomer, 0) = 1
     AND ISNULL(O.isDisable, 0) = 0
     AND (
         UPPER(@SYSUserGroupID) = 'ADMIN'
         OR (
             (ISNULL(@SYS_BranchID, '') = '' OR O.BranchID = @SYS_BranchID)
             AND A.ObjectID IN (SELECT ObjectID FROM AR_GetObjectByUserFnc(@Username))
         )
     )
   GROUP BY A.ObjectID, O.ObjectName, O.isCustomer
END
