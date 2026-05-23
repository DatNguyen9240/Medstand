CREATE OR ALTER PROCEDURE [dbo].[API_CongNoKhachHang_AI]
   @DenNgay     DATETIME     = NULL,
   @MaKhachHang  VARCHAR(50)  = '',
   @Username   VARCHAR(50)
AS
BEGIN
   SET NOCOUNT ON

   -- CLEAN AI EXTRACTED BRACKETS
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

   IF @DenNgay IS NULL SET @DenNgay = GETDATE()
   ELSE SET @DenNgay = DATEADD(SECOND, -1, DATEADD(DAY, 1, CAST(CAST(@DenNgay AS DATE) AS DATETIME)))
    DECLARE @SYS_BranchID   VARCHAR(50) = ''
    DECLARE @SYSUserGroupID VARCHAR(50) = ''

    SELECT 
        @SYS_BranchID   = COALESCE(BranchID, ''),
        @SYSUserGroupID = COALESCE(UserGroupID, '')
    FROM dbo.SY_User 
    WHERE UserName = @Username AND COALESCE(Disable, 0) = 0

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
            C.ObjectID AS MaKH
        FROM @CongNo C
        LEFT JOIN CF_ObjectTbl O ON C.ObjectID = O.ObjectID
        WHERE (
            UPPER(@SYSUserGroupID) = 'ADMIN'
            OR (
                (ISNULL(@SYS_BranchID, '') = '' OR O.BranchID = @SYS_BranchID)
                AND C.ObjectID IN (SELECT ObjectID FROM AR_GetObjectByUserFnc(@Username))
            )
        )
        ORDER BY C.TongNo DESC
        
        RETURN
    END
    SELECT
        O.ObjectName,
        SUM(A.DebitAmount - A.CreditAmount) AS TongNo,
        A.ObjectID
    FROM SY_GetDebitDocFnc(@DenNgay, @MaKhachHang, '131', '') A
    LEFT JOIN dbo.CF_ObjectTbl O ON A.ObjectID = O.ObjectID
    WHERE A.ObjectID = @MaKhachHang
      AND (
          UPPER(@SYSUserGroupID) = 'ADMIN'
          OR (
              (ISNULL(@SYS_BranchID, '') = '' OR O.BranchID = @SYS_BranchID)
              AND A.ObjectID IN (SELECT ObjectID FROM AR_GetObjectByUserFnc(@Username))
          )
      )
    GROUP BY A.ObjectID, O.ObjectName
END
