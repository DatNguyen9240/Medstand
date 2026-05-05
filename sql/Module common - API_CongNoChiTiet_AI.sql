CREATE OR ALTER PROCEDURE [dbo].[API_CongNoChiTiet_AI]
   @MaKhachHang  VARCHAR(50),
   @Username   VARCHAR(50),
   @DenNgay     DATETIME = NULL
AS
BEGIN
   SET NOCOUNT ON
   IF @DenNgay IS NULL SET @DenNgay = GETDATE()
   ELSE SET @DenNgay = DATEADD(SECOND, -1, DATEADD(DAY, 1, CAST(CAST(@DenNgay AS DATE) AS DATETIME)))
   IF @MaKhachHang = ''
   BEGIN
       SELECT N'Vui lòng cung cấp mã khách hàng để xem chi tiết.' AS [Msg], 1 AS [MsgType]
       RETURN
   END
   DECLARE @BanLanhDao BIT
   SELECT @BanLanhDao = COALESCE(Manager, 0) FROM dbo.SY_User WHERE UserName = @Username
   IF @BanLanhDao = 0
      AND NOT EXISTS (
          SELECT 1 FROM AR_GetObjectByUserFnc(@Username) WHERE ObjectID = @MaKhachHang
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
   FROM SY_GetDebitDocFnc(@DenNgay, @MaKhachHang, '131', '')
   WHERE (DebitAmount - CreditAmount) <> 0
   ORDER BY DocumentDate DESC
END


