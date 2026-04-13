CREATE OR ALTER PROCEDURE dbo.API_DanhsachTonKho_AI
    @Username VARCHAR(50),
    @ItemID VARCHAR(50) = '',
    @ItemName VARCHAR(200) = ''
AS
BEGIN
    SET NOCOUNT ON
    IF NOT EXISTS (SELECT 1 FROM SY_User WHERE UserName = @Username AND COALESCE(Disable, 0) = 0)
    BEGIN
        SELECT N'User không tồn tại hoặc đã bị khóa' AS Msg, 1 AS MsgType
        RETURN
    END
    DECLARE @SYSBranchID VARCHAR(50) = ''
    SELECT @SYSBranchID = COALESCE(BranchID, '')
    FROM SY_User WHERE UserName = @Username
    SELECT 
        A.ItemID, I.ItemName, A.StoreHouseID, A.BranchID,
        A.Lot, A.ExpireDate,
        SUM(CASE WHEN A.Quantity >= 0 THEN A.Quantity ELSE 0 END) AS Nhap,
        SUM(CASE WHEN A.Quantity < 0 THEN -A.Quantity ELSE 0 END) AS Xuat,
        SUM(ISNULL(A.Quantity,0)) AS TonCuoi
    FROM IV_StockTransactionTbl A
    LEFT JOIN CF_ItemTbl I ON A.ItemID = I.ItemID
    WHERE (@ItemID = '' OR A.ItemID = @ItemID)
      AND (@ItemName = '' OR I.ItemName LIKE '%' + @ItemName + '%')
      AND (@SYSBranchID = '' OR A.BranchID = @SYSBranchID)
    GROUP BY A.ItemID, I.ItemName, A.StoreHouseID, A.BranchID,
             A.Lot, A.ExpireDate
END
GO