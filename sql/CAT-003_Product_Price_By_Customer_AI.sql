SET ANSI_NULLS ON;
GO
SET QUOTED_IDENTIFIER ON;
GO

CREATE OR ALTER PROCEDURE dbo.API_GiaSanPhamTheoKhachHang_AI
    @Username VARCHAR(50) = '',
    @ObjectID VARCHAR(50) = '',
    @ItemID VARCHAR(50) = ''
AS
BEGIN
    SET NOCOUNT ON;

    SET @Username = LTRIM(RTRIM(COALESCE(@Username, '')));
    SET @ObjectID = LTRIM(RTRIM(COALESCE(@ObjectID, '')));
    SET @ItemID = LTRIM(RTRIM(COALESCE(@ItemID, '')));

    IF NOT EXISTS
    (
        SELECT 1
        FROM dbo.SY_User
        WHERE UserName = @Username
          AND COALESCE(Disable, 0) = 0
    )
    BEGIN
        SELECT N'Tài khoản không tồn tại hoặc đã bị khóa.' AS Msg,
               1 AS MsgType,
               'OUT_OF_SCOPE' AS Severity;
        RETURN;
    END;

    IF @ObjectID = '' OR NOT EXISTS
    (
        SELECT 1
        FROM dbo.AR_GetObjectByUserFnc(@Username)
        WHERE ObjectID = @ObjectID
    )
    BEGIN
        SELECT N'Khách hàng không thuộc phạm vi được cấp.' AS Msg,
               1 AS MsgType,
               'OUT_OF_SCOPE' AS Severity;
        RETURN;
    END;

    DECLARE @BranchID VARCHAR(50) = '';
    SELECT @BranchID = COALESCE(BranchID, '')
    FROM dbo.SY_User
    WHERE UserName = @Username;

    IF @ItemID = '' OR NOT EXISTS
    (
        SELECT 1
        FROM dbo.CF_ItemTbl
        WHERE ItemID = @ItemID
          AND CASE
                  WHEN @BranchID = 'MB' THEN COALESCE(IsDisableMB, 0)
                  WHEN @BranchID = 'MN' THEN COALESCE(IsDisableMN, 0)
                  WHEN @BranchID = 'MT' THEN COALESCE(IsDisableMT, 0)
                  ELSE COALESCE(IsDisable, 0)
              END = 0
    )
    BEGIN
        SELECT N'Sản phẩm không tồn tại hoặc đã ngừng bán tại chi nhánh.' AS Msg,
               1 AS MsgType,
               'VALIDATION_ERROR' AS Severity;
        RETURN;
    END;

    DECLARE @PriceAsOfDate DATE = CAST(GETDATE() AS DATE);

    SELECT
        I.ItemID,
        I.ItemName,
        O.ObjectID,
        O.ObjectName,
        CAST(P.UnitPrice AS DECIMAL(18,2)) AS UnitPrice,
        CAST(P.DiscountAmount AS DECIMAL(18,2)) AS DiscountAmount,
        CAST(P.DiemSanPham AS DECIMAL(18,2)) AS ProductPoints,
        P.GhiChu AS PriceNote,
        @PriceAsOfDate AS PriceAsOfDate,
        CASE WHEN P.UnitPrice IS NULL THEN 'NO_ACTIVE_PRICE' ELSE 'ACTIVE_PRICE' END AS PriceStatus,
        CAST(CASE WHEN P.UnitPrice IS NULL OR P.UnitPrice <= 0 THEN 0 ELSE 1 END AS BIT) AS IsOrderableByPrice,
        'AR_LayGiaSanPhamFnc' AS PriceSource,
        'CUSTOMER_THEN_GROUP_THEN_GENERAL' AS PriceSelectionRule,
        'API_GiaSanPhamTheoKhachHang_AI' AS DataSource
    FROM dbo.CF_ItemTbl I
    INNER JOIN dbo.CF_ObjectTbl O ON O.ObjectID = @ObjectID
    OUTER APPLY
    (
        SELECT TOP (1) UnitPrice, DiscountAmount, DiemSanPham, GhiChu
        FROM dbo.AR_LayGiaSanPhamFnc(@PriceAsOfDate, @ObjectID, I.ItemID)
    ) P
    WHERE I.ItemID = @ItemID;
END;
GO
