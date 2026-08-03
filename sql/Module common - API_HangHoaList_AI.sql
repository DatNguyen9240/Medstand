/*
  Medstand AI-only product catalog for order creation.
  Does not alter dbo.API_HangHoaList used by other applications/enterprises.
*/
SET ANSI_NULLS ON;
GO
SET QUOTED_IDENTIFIER ON;
GO

CREATE OR ALTER PROCEDURE dbo.API_HangHoaList_AI
    @Username VARCHAR(50) = '',
    @ObjectID VARCHAR(50) = '',
    @ItemID VARCHAR(50) = '',
    @SearchText NVARCHAR(50) = '',
    @SeachText NVARCHAR(50) = '',
    @DocumentDate DATETIME = NULL
AS
BEGIN
    SET NOCOUNT ON;

    IF NOT EXISTS (SELECT 1 FROM dbo.SY_User WHERE UserName = @Username AND COALESCE(Disable, 0) = 0)
    BEGIN
        SELECT N'Tài khoản không tồn tại hoặc đã bị khóa' AS Msg, 1 AS MsgType;
        RETURN;
    END;

    IF COALESCE(@ObjectID, '') = ''
       OR NOT EXISTS (SELECT 1 FROM dbo.AR_GetObjectByUserFnc(@Username) WHERE ObjectID = @ObjectID)
    BEGIN
        SELECT N'Khách hàng không thuộc phạm vi được cấp' AS Msg, 1 AS MsgType;
        RETURN;
    END;

    DECLARE @ToDate DATE = CAST(COALESCE(@DocumentDate, GETDATE()) AS DATE);
    DECLARE @BranchID VARCHAR(50) = '';
    DECLARE @IsGlobal BIT = 0;
    DECLARE @IsManager BIT = 0;
    DECLARE @EmployeeID VARCHAR(50) = '';
    DECLARE @AllowedStores TABLE (StoreHouseID VARCHAR(50) PRIMARY KEY);

    SELECT @BranchID = COALESCE(BranchID, ''),
           @IsGlobal = CASE WHEN UserGroupID IN ('Admin', 'SADM', 'BGD', 'GD') THEN 1 ELSE 0 END,
           @IsManager = COALESCE(Manager, 0),
           @EmployeeID = COALESCE(EmployeeID, '')
    FROM dbo.SY_User
    WHERE UserName = @Username;

    INSERT @AllowedStores (StoreHouseID)
    SELECT DISTINCT StoreHouseID
    FROM dbo.SY_UserStoreHouseTbl
    WHERE UserName = @Username AND StoreHouseID IN ('CTY', 'DL02', 'DL03');

    IF @IsManager = 1 AND @EmployeeID <> ''
    BEGIN
        INSERT @AllowedStores (StoreHouseID)
        SELECT DISTINCT US.StoreHouseID
        FROM dbo.SY_User U
        JOIN dbo.SY_UserStoreHouseTbl US ON US.UserName = U.UserName
        WHERE U.ManagerID = @EmployeeID
          AND COALESCE(U.Disable, 0) = 0
          AND US.StoreHouseID IN ('CTY', 'DL02', 'DL03')
          AND NOT EXISTS (SELECT 1 FROM @AllowedStores A WHERE A.StoreHouseID = US.StoreHouseID);
    END;

    IF @IsGlobal = 0 AND NOT EXISTS (SELECT 1 FROM @AllowedStores)
    BEGIN
        SELECT N'Tài khoản chưa được phân quyền kho' AS Msg, 1 AS MsgType;
        RETURN;
    END;

    IF @SeachText <> '' SET @SearchText = @SeachText;

    SELECT I.ItemID,
           I.ItemName + COALESCE(' (' + P.GhiChu + ')', '') AS ItemName,
           I.Unit,
           I.ItemGroupID,
           I.CategoryID,
           I.HangSX,
           P.UnitPrice,
           P.DiemSanPham,
           P.GhiChu,
           CAST(CASE WHEN COALESCE(S.AvailableQuantity, 0) > 0 THEN S.AvailableQuantity ELSE 0 END AS DECIMAL(18,2)) AS QuantityinStock,
           CAST(CASE WHEN COALESCE(S.AvailableQuantity, 0) > 0 THEN S.AvailableQuantity ELSE 0 END AS DECIMAL(18,2)) AS TonKho,
           S.StoreHouseID,
           N'SELECTED_AUTHORIZED_STORE' AS WarehouseScope,
           SYSDATETIMEOFFSET() AS StockUpdatedAt
    FROM dbo.CF_ItemTbl I
    OUTER APPLY (
        SELECT TOP (1) UnitPrice, DiemSanPham, GhiChu
        FROM dbo.AR_LayGiaSanPhamFnc(@ToDate, @ObjectID, I.ItemID)
    ) P
    OUTER APPLY (
        SELECT TOP (1)
               PStock.StoreHouseID,
               PStock.PhysicalQuantity - COALESCE(RStock.ReservedQuantity, 0) AS AvailableQuantity
        FROM (
            SELECT T.StoreHouseID,
                   SUM(CASE WHEN T.ExpireDate IS NULL OR CAST(T.ExpireDate AS DATE) >= @ToDate THEN T.Quantity ELSE 0 END) AS PhysicalQuantity
            FROM dbo.IV_StockTransactionTbl T
            WHERE T.ItemID = I.ItemID
              AND T.StoreHouseID IN ('CTY', 'DL02', 'DL03')
              AND (@IsGlobal = 1 OR T.StoreHouseID IN (SELECT StoreHouseID FROM @AllowedStores))
            GROUP BY T.StoreHouseID
        ) PStock
        OUTER APPLY (
            SELECT SUM(COALESCE(D.Quantity, 0) + COALESCE(D.SoLuongTang, 0)) AS ReservedQuantity
            FROM dbo.AR_OrderDetailTbl D
            JOIN dbo.AR_OrderTbl O ON O.DocumentID = D.DocumentID
            WHERE D.ItemID = I.ItemID
              AND D.StoreHouseID = PStock.StoreHouseID
              AND O.StatusID IN (-2, -1, 0, 1, 2, 4)
        ) RStock
        ORDER BY PStock.PhysicalQuantity - COALESCE(RStock.ReservedQuantity, 0) DESC,
                 PStock.StoreHouseID
    ) S
    WHERE I.ItemGroupID = 'HH1'
      AND (@ItemID = '' OR I.ItemID = @ItemID)
      AND CASE WHEN @BranchID = 'MB' THEN COALESCE(I.IsDisableMB, 0)
               WHEN @BranchID = 'MN' THEN COALESCE(I.IsDisableMN, 0)
               WHEN @BranchID = 'MT' THEN COALESCE(I.IsDisableMT, 0)
               ELSE COALESCE(I.IsDisable, 0) END = 0
      AND (I.ItemID LIKE '%' + @SearchText + '%' OR I.ItemName LIKE '%' + @SearchText + '%')
      AND P.UnitPrice IS NOT NULL
    ORDER BY I.ItemName;
END;
GO
