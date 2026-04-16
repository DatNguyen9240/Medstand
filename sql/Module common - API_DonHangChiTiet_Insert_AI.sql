
GO
SET ANSI_NULLS ON
GO
SET QUOTED_IDENTIFIER ON
GO
CREATE OR ALTER PROCEDURE [dbo].[API_DonHangChiTiet_Insert_AI]
    @Username    VARCHAR(50)   = '',
    @DocumentID  VARCHAR(50)   = '',
    @ObjectID    VARCHAR(50)   = '',
    @ItemList    NVARCHAR(MAX) = ''
AS
SET NOCOUNT ON
SET XACT_ABORT ON
-- ═══ 1. VALIDATION ═══
IF NOT EXISTS (SELECT 1 FROM SY_User WHERE UserName = @Username AND COALESCE(Disable, 0) = 0)
BEGIN
    SELECT N'ERR:User không tồn tại hoặc đã bị khóa' AS DocumentID
    RETURN
END
IF COALESCE(@ItemList, '') = '' OR @ItemList = '[]'
BEGIN
    SELECT N'ERR:Danh sách sản phẩm trống' AS DocumentID
    RETURN
END
IF COALESCE(@ObjectID, '') = ''
BEGIN
    SELECT N'ERR:Chưa chọn khách hàng (ObjectID là bắt buộc)' AS DocumentID
    RETURN
END
IF NOT EXISTS (SELECT 1 FROM CF_ObjectTbl WHERE ObjectID = @ObjectID)
BEGIN
    SELECT N'ERR:Mã khách hàng không tồn tại: ' + @ObjectID AS DocumentID
    RETURN
END
IF COALESCE(@DocumentID, '') <> '' AND NOT EXISTS (SELECT 1 FROM AR_OrderTbl WHERE DocumentID = @DocumentID)
BEGIN
    SELECT N'ERR:Đơn hàng không tồn tại' AS DocumentID
    RETURN
END
-- ═══ 2. PARSE JSON + LẤY GIÁ ═══
SELECT 
    J.ItemID, SUM(J.Quantity) AS Quantity, MAX(I.ItemName) AS ItemName, MAX(P.UnitPrice) AS UnitPrice, MAX(P.DiemSanPham) AS DiemSanPham
INTO #Items
FROM OPENJSON(@ItemList)
WITH (
    ItemID   VARCHAR(50)   '$.ItemID',
    Quantity DECIMAL(18,2) '$.Quantity'
) J
LEFT JOIN CF_ItemTbl I ON I.ItemID = J.ItemID
OUTER APPLY (
    SELECT TOP 1 UnitPrice, DiemSanPham
    FROM AR_PriceView
    WHERE ItemID = J.ItemID
      AND isDisable = 0
      AND GETDATE() BETWEEN FromDate AND ToDate
    ORDER BY FromDate DESC
) P
GROUP BY J.ItemID
IF EXISTS (SELECT 1 FROM #Items WHERE ItemName IS NULL)
BEGIN
    DECLARE @BadItems NVARCHAR(500)
    SELECT @BadItems = STRING_AGG(ItemID, ', ') FROM #Items WHERE ItemName IS NULL
    DROP TABLE #Items
    SELECT N'ERR:Sản phẩm không tồn tại: ' + @BadItems AS DocumentID
    RETURN
END
IF EXISTS (SELECT 1 FROM #Items WHERE COALESCE(Quantity, 0) <= 0)
BEGIN
    DROP TABLE #Items
    SELECT N'ERR:Số lượng phải lớn hơn 0' AS DocumentID
    RETURN
END
IF EXISTS (SELECT 1 FROM #Items WHERE UnitPrice IS NULL)
BEGIN
    DECLARE @NoPrice NVARCHAR(500)
    SELECT @NoPrice = STRING_AGG(ItemID, ', ') FROM #Items WHERE UnitPrice IS NULL
    DROP TABLE #Items
    SELECT N'ERR:Sản phẩm chưa có giá: ' + @NoPrice AS DocumentID
    RETURN
END
-- ═══ 3. TẠO ĐƠN + CHI TIẾT ═══
BEGIN TRANSACTION
BEGIN TRY
    IF COALESCE(@DocumentID, '') = ''
    BEGIN
        DECLARE @Prefix VARCHAR(10) = 'DMB' + RIGHT('0' + CAST(MONTH(GETDATE()) AS VARCHAR), 2)
                                           + RIGHT(CAST(YEAR(GETDATE()) AS VARCHAR), 2)
        DECLARE @MaxNum INT
        SELECT @MaxNum = ISNULL(MAX(CAST(
            SUBSTRING(DocumentID, CHARINDEX('/', DocumentID) + 1, LEN(DocumentID)) AS INT
        )), 0)
        FROM AR_OrderTbl WITH (UPDLOCK, HOLDLOCK)
        WHERE DocumentID LIKE @Prefix + '/%'
        SET @DocumentID = @Prefix + '/' + CAST(@MaxNum + 1 AS VARCHAR)
        INSERT INTO AR_OrderTbl (
            DocumentID, DocumentDate, EmployeeID, ManagerID, CeoID,
            ObjectID, BranchID, UserCreate, DateCreate, StatusID
        )
        SELECT @DocumentID, GETDATE(),
               COALESCE(EmployeeID, ''),
               COALESCE(ManagerID, ''),
               COALESCE(CeoID, ''),
               @ObjectID,
               COALESCE(BranchID, ''),
               @Username, GETDATE(), 0
        FROM SY_User WHERE UserName = @Username
    END
    INSERT INTO AR_OrderDetailTbl (
        UserAutoID, DocumentID, ItemID, UnitPrice, Quantity, SoLuongTang,
        Amount, DiscountPercent, DiscountAmount, TotalAmount,
        DiemSanPham, DiemTichLuy, Notes
    )
    SELECT 
        NEWID(), @DocumentID, ItemID,
        COALESCE(UnitPrice, 0), Quantity, 0,
        COALESCE(Quantity, 0) * COALESCE(UnitPrice, 0),
        0, 0,
        COALESCE(Quantity, 0) * COALESCE(UnitPrice, 0),
        COALESCE(DiemSanPham, 0),
        COALESCE(Quantity, 0) * COALESCE(DiemSanPham, 0),
        ''
    FROM #Items

    -- Tính toán lại tổng tiền/kho (nếu có các Stp bổ trợ)
    EXEC AR_Order_AfterSaveStp @DocumentID

    COMMIT TRANSACTION
END TRY
BEGIN CATCH
    IF @@TRANCOUNT > 0 ROLLBACK TRANSACTION
    DECLARE @ErrMsg NVARCHAR(500) = ERROR_MESSAGE()
    DROP TABLE IF EXISTS #Items
    SELECT N'ERR:' + @ErrMsg AS DocumentID
    RETURN
END CATCH
DROP TABLE IF EXISTS #Items
-- ═══ 4. THÀNH CÔNG → trả DocumentID thật ═══
SELECT @DocumentID AS DocumentID
GO



