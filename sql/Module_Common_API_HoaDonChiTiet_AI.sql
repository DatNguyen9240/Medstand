USE medtest;
GO

CREATE OR ALTER PROCEDURE dbo.API_HoaDonChiTiet_AI
    @Username   VARCHAR(50),
    @DocumentID VARCHAR(50)
AS
BEGIN
    SET NOCOUNT ON;

    SET @Username = LTRIM(RTRIM(ISNULL(@Username, '')));
    SET @DocumentID = LTRIM(RTRIM(ISNULL(@DocumentID, '')));

    IF @Username = '' OR NOT EXISTS (
        SELECT 1
        FROM dbo.SY_User WITH (NOLOCK)
        WHERE UserName = @Username AND ISNULL(Disable, 0) = 0
    )
    BEGIN
        SELECT N'Tài khoản không hợp lệ hoặc đã bị khóa.' AS Msg, 1 AS MsgType;
        RETURN;
    END

    IF @DocumentID = ''
    BEGIN
        SELECT N'Vui lòng cung cấp mã hóa đơn.' AS Msg, 1 AS MsgType;
        RETURN;
    END

    DECLARE @BranchID VARCHAR(50) = '';
    DECLARE @EmployeeID VARCHAR(50) = '';
    DECLARE @UserGroupID VARCHAR(50) = '';

    SELECT
        @BranchID = ISNULL(BranchID, ''),
        @EmployeeID = ISNULL(EmployeeID, ''),
        @UserGroupID = ISNULL(UserGroupID, '')
    FROM dbo.SY_User WITH (NOLOCK)
    WHERE UserName = @Username AND ISNULL(Disable, 0) = 0;

    IF NOT EXISTS (
        SELECT 1
        FROM dbo.AR_InvoiceTbl I WITH (NOLOCK)
        WHERE I.DocumentID = @DocumentID
          AND (
              UPPER(@UserGroupID) = 'ADMIN'
              OR (
                  (@BranchID = '' OR ISNULL(I.BranchID, '') = @BranchID)
                  AND (
                      I.EmployeeID = @EmployeeID
                      OR I.ManagerID = @EmployeeID
                      OR I.CeoID = @EmployeeID
                  )
              )
          )
    )
    BEGIN
        IF EXISTS (SELECT 1 FROM dbo.AR_InvoiceTbl WITH (NOLOCK) WHERE DocumentID = @DocumentID)
            SELECT N'Bạn không có quyền xem hóa đơn này.' AS Msg, 1 AS MsgType;
        ELSE
            SELECT N'Mã hóa đơn không tồn tại.' AS Msg, 1 AS MsgType;
        RETURN;
    END

    SELECT
        ROW_NUMBER() OVER (ORDER BY D.UserAutoID) AS STT,
        I.DocumentID,
        I.DocumentDate,
        I.ObjectID,
        O.ObjectName,
        I.BranchID,
        D.ItemID,
        P.ItemName,
        P.Unit AS DonViTinh,
        D.Quantity,
        D.UnitPrice,
        D.Amount,
        D.TotalAmount,
        D.StoreHouseID,
        SH.StoreHouseName
    FROM dbo.AR_InvoiceTbl I WITH (NOLOCK)
    INNER JOIN dbo.AR_InvoiceDetailTbl D WITH (NOLOCK) ON D.DocumentID = I.DocumentID
    LEFT JOIN dbo.CF_ObjectTbl O WITH (NOLOCK) ON O.ObjectID = I.ObjectID
    LEFT JOIN dbo.CF_ItemTbl P WITH (NOLOCK) ON P.ItemID = D.ItemID
    LEFT JOIN dbo.CF_StoreHouseTbl SH WITH (NOLOCK) ON SH.StoreHouseID = D.StoreHouseID
    WHERE I.DocumentID = @DocumentID
    ORDER BY STT;
END
GO
