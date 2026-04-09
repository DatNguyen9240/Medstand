CREATE OR ALTER PROCEDURE [dbo].[API_CongNoChiTiet_AI]
   @khachhang  VARCHAR(50),
   @Username   VARCHAR(50),
   @ToDate     DATETIME = NULL
AS
BEGIN
   SET NOCOUNT ON
   IF @ToDate IS NULL SET @ToDate = GETDATE()
   IF @khachhang = ''
   BEGIN
       SELECT N'Vui lòng cung cấp mã khách hàng để xem chi tiết.' AS [Msg], 1 AS [MsgType]
       RETURN
   END
   DECLARE @BanLanhDao BIT
   SELECT @BanLanhDao = COALESCE(Manager, 0) FROM dbo.SY_User WHERE UserName = @Username
   IF @BanLanhDao = 0
      AND NOT EXISTS (
          SELECT 1 FROM AR_GetObjectByUserFnc(@Username) WHERE ObjectID = @khachhang
      )
   BEGIN
       SELECT N'Bạn không có quyền xem công nợ khách hàng này.' AS [Msg], 1 AS [MsgType]
       RETURN
   END
   SELECT TOP 20
       DocumentID AS [MaHD],
       FORMAT(DocumentDate, 'dd/MM/yyyy') AS [Ngay],
       (DebitAmount - CreditAmount) AS [SoTien],
       Memo AS [DienGiai],
       COUNT(*) OVER() AS [TongSoHoaDon],
       SUM(DebitAmount - CreditAmount) OVER() AS [TongTienNoThucTe]
   FROM SY_GetDebitDocFnc(@ToDate, @khachhang, '131', '')
   WHERE (DebitAmount - CreditAmount) <> 0
   ORDER BY DocumentDate DESC
END


