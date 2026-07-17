CREATE OR ALTER PROCEDURE dbo.API_DanhsachTonKho_AI
    @Username VARCHAR(50),
    @ItemID VARCHAR(50) = '',
    @TenSanPham VARCHAR(200) = '',
    @timkiem NVARCHAR(200) = ''
AS
BEGIN
    SET NOCOUNT ON
    IF NOT EXISTS (SELECT 1 FROM SY_User WHERE UserName = @Username AND COALESCE(Disable, 0) = 0)
    BEGIN
        SELECT N'User không tồn tại hoặc đã bị khóa' AS Msg, 1 AS MsgType
        RETURN
    END
    DECLARE @SYSBranchID VARCHAR(50) = ''
    DECLARE @IsGlobal BIT = 0
    DECLARE @IsManager BIT = 0
    DECLARE @EmployeeID VARCHAR(50) = ''
    DECLARE @AllowedStores TABLE (StoreHouseID VARCHAR(50) PRIMARY KEY)
    SELECT @SYSBranchID = COALESCE(BranchID, ''),
           @IsGlobal = CASE WHEN UserGroupID IN ('Admin', 'SADM', 'BGD', 'GD') THEN 1 ELSE 0 END,
           @IsManager = COALESCE(Manager, 0),
           @EmployeeID = COALESCE(EmployeeID, '')
    FROM SY_User WHERE UserName = @Username

    INSERT INTO @AllowedStores (StoreHouseID)
    SELECT DISTINCT US.StoreHouseID
    FROM dbo.SY_UserStoreHouseTbl US WITH (NOLOCK)
    WHERE US.UserName = @Username
      AND ISNULL(US.StoreHouseID, '') <> ''

    IF @IsManager = 1 AND ISNULL(@EmployeeID, '') <> ''
    BEGIN
        INSERT INTO @AllowedStores (StoreHouseID)
        SELECT DISTINCT US.StoreHouseID
        FROM dbo.SY_User U WITH (NOLOCK)
        JOIN dbo.SY_UserStoreHouseTbl US WITH (NOLOCK)
          ON US.UserName = U.UserName
        WHERE U.ManagerID = @EmployeeID
          AND ISNULL(U.Disable, 0) = 0
          AND ISNULL(US.StoreHouseID, '') <> ''
          AND NOT EXISTS (
              SELECT 1 FROM @AllowedStores A
              WHERE A.StoreHouseID = US.StoreHouseID
          )
    END

    IF @IsGlobal = 0 AND NOT EXISTS (SELECT 1 FROM @AllowedStores)
    BEGIN
        SELECT N'Tài khoản chưa được phân quyền kho.' AS Msg, 1 AS MsgType
        RETURN
    END
    SELECT
        A.ItemID, I.ItemName, I.Unit AS DonViTinh,
        A.StoreHouseID, SH.StoreHouseName, A.BranchID,
        A.Lot, A.ExpireDate,
        SUM(CASE WHEN A.Quantity >= 0 THEN A.Quantity ELSE 0 END) AS Nhap,
        SUM(CASE WHEN A.Quantity < 0 THEN -A.Quantity ELSE 0 END) AS Xuat,
        SUM(ISNULL(A.Quantity,0)) AS TonCuoi,
        CASE
            WHEN SUM(ISNULL(A.Quantity,0)) < 0 THEN N'Cần đối soát'
            WHEN A.ExpireDate IS NOT NULL AND A.ExpireDate < GETDATE() THEN N'Hết hạn'
            ELSE N'Còn hàng'
        END AS TrangThai
    FROM IV_StockTransactionTbl A
    LEFT JOIN CF_ItemTbl I ON A.ItemID = I.ItemID
    LEFT JOIN CF_StoreHouseTbl SH ON SH.StoreHouseID = A.StoreHouseID
    WHERE (@ItemID = '' OR A.ItemID = @ItemID)
      AND (@TenSanPham = '' OR I.ItemName LIKE '%' + @TenSanPham + '%')
      AND (@timkiem = '' OR I.ItemName LIKE '%' + @timkiem + '%' OR A.ItemID LIKE '%' + @timkiem + '%')
      AND (
          @IsGlobal = 1
          OR A.StoreHouseID IN (SELECT StoreHouseID FROM @AllowedStores)
      )
    GROUP BY A.ItemID, I.ItemName, I.Unit, A.StoreHouseID, SH.StoreHouseName, A.BranchID,
             A.Lot, A.ExpireDate
    HAVING SUM(ISNULL(A.Quantity, 0)) <> 0
END
GO
