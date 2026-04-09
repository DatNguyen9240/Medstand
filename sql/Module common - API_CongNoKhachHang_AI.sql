CREATE OR ALTER PROCEDURE [dbo].[API_CongNoKhachHang_AI]
   @DenNgay     DATETIME     = NULL,
   @khachhang  VARCHAR(50)  = '',
   @Username   VARCHAR(50)
AS
BEGIN
   SET NOCOUNT ON
   IF @DenNgay IS NULL SET @DenNgay = GETDATE()
   DECLARE @BanLanhDao BIT
   SELECT @BanLanhDao = COALESCE(Manager, 0) FROM dbo.SY_User WHERE UserName = @Username
   IF @khachhang = '' OR @khachhang IS NULL
   BEGIN
       -- Dùng bảng tạm để tổng hợp trước, tránh query view nhiều lần
       CREATE TABLE #CongNo (ObjectID VARCHAR(50), TongNo MONEY)
       INSERT INTO #CongNo
       SELECT ObjectID, SUM(Amount) AS TongNo
       FROM vCongNoBanHang
       WHERE DocumentDate <= @DenNgay
       GROUP BY ObjectID
       HAVING SUM(Amount) > 0
       SELECT TOP 20
           O.ObjectName AS TenKH,
           C.TongNo,
           C.ObjectID AS MaKH
       FROM #CongNo C
       LEFT JOIN CF_ObjectTbl O ON C.ObjectID = O.ObjectID
       WHERE (
           @BanLanhDao = 1
           OR C.ObjectID IN (SELECT ObjectID FROM AR_GetObjectByUserFnc(@Username))
       )
       ORDER BY C.TongNo DESC
       DROP TABLE #CongNo
       RETURN
   END
   SELECT
       O.ObjectName,
       SUM(A.DebitAmount - A.CreditAmount) AS TongNo,
       A.ObjectID
   FROM SY_GetDebitDocFnc(@DenNgay, @khachhang, '131', '') A
   LEFT JOIN dbo.CF_ObjectTbl O ON A.ObjectID = O.ObjectID
   WHERE A.ObjectID = @khachhang
     AND (
         @BanLanhDao = 1
         OR A.ObjectID IN (SELECT ObjectID FROM AR_GetObjectByUserFnc(@Username))
     )
   GROUP BY A.ObjectID, O.ObjectName
END


