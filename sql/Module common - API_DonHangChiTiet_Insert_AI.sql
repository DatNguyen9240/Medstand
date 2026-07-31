/*
  Medstand AI-only order mutation.
  This procedure does not alter dbo.API_DonHang_Insert used by other systems.
*/
SET ANSI_NULLS ON;
GO
SET QUOTED_IDENTIFIER ON;
GO

CREATE OR ALTER PROCEDURE dbo.API_DonHangChiTiet_Insert_AI
    @Username VARCHAR(50) = '',
    @DocumentID VARCHAR(50) = '',
    @ObjectID VARCHAR(50) = '',
    @ItemList NVARCHAR(MAX) = ''
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;

    IF NOT EXISTS (SELECT 1 FROM dbo.SY_User WHERE UserName = @Username AND COALESCE(Disable, 0) = 0)
    BEGIN
        SELECT NULL AS DocumentID, N'Tài khoản không tồn tại hoặc đã bị khóa' AS Msg, 1 AS MsgType;
        RETURN;
    END;

    IF COALESCE(@ObjectID, '') = '' OR NOT EXISTS (SELECT 1 FROM dbo.CF_ObjectTbl WHERE ObjectID = @ObjectID)
    BEGIN
        SELECT NULL AS DocumentID, N'Khách hàng không tồn tại' AS Msg, 1 AS MsgType;
        RETURN;
    END;

    IF NOT EXISTS (SELECT 1 FROM dbo.AR_GetObjectByUserFnc(@Username) WHERE ObjectID = @ObjectID)
    BEGIN
        SELECT NULL AS DocumentID, N'Bạn không có quyền tạo đơn cho khách hàng này' AS Msg, 1 AS MsgType;
        RETURN;
    END;

    IF COALESCE(@ItemList, '') = '' OR ISJSON(@ItemList) <> 1
    BEGIN
        SELECT NULL AS DocumentID, N'Danh sách sản phẩm không hợp lệ' AS Msg, 1 AS MsgType;
        RETURN;
    END;

    DECLARE @BranchID VARCHAR(50) = '';
    DECLARE @ManagerID VARCHAR(50) = '';
    DECLARE @EmployeeID VARCHAR(50) = '';
    DECLARE @CeoID VARCHAR(50) = '';
    DECLARE @IsGlobal BIT = 0;
    DECLARE @IsManager BIT = 0;
    DECLARE @AllowedStores TABLE (StoreHouseID VARCHAR(50) PRIMARY KEY);

    SELECT @BranchID = COALESCE(BranchID, ''),
           @ManagerID = COALESCE(ManagerID, ''),
           @EmployeeID = COALESCE(EmployeeID, ''),
           @CeoID = COALESCE(CeoID, ''),
           @IsGlobal = CASE WHEN UserGroupID IN ('Admin', 'SADM', 'BGD', 'GD') THEN 1 ELSE 0 END,
           @IsManager = COALESCE(Manager, 0)
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
        SELECT NULL AS DocumentID, N'Tài khoản chưa được phân quyền kho' AS Msg, 1 AS MsgType;
        RETURN;
    END;

    CREATE TABLE #Items (
        ItemID VARCHAR(50) NULL,
        Quantity DECIMAL(18,2) NULL,
        UnitPrice DECIMAL(18,4) NULL,
        DiscountPercent DECIMAL(18,2) NOT NULL,
        ItemName NVARCHAR(500) NULL,
        ErpUnitPrice DECIMAL(18,4) NULL,
        DiemSanPham DECIMAL(18,2) NULL
    );

    INSERT #Items (ItemID, Quantity, UnitPrice, DiscountPercent, ItemName, ErpUnitPrice, DiemSanPham)
    SELECT J.ItemID,
           SUM(J.Quantity),
           MAX(J.UnitPrice),
           MAX(COALESCE(J.DiscountPercent, 0)),
           MAX(I.ItemName),
           MAX(P.UnitPrice),
           MAX(P.DiemSanPham)
    FROM OPENJSON(@ItemList)
    WITH (
        ItemID VARCHAR(50) '$.ItemID',
        Quantity DECIMAL(18,2) '$.Quantity',
        UnitPrice DECIMAL(18,4) '$.UnitPrice',
        DiscountPercent DECIMAL(18,2) '$.DiscountPercent'
    ) J
    LEFT JOIN dbo.CF_ItemTbl I ON I.ItemID = J.ItemID
    OUTER APPLY (
        SELECT TOP (1) UnitPrice, DiemSanPham
        FROM dbo.AR_LayGiaSanPhamFnc(CAST(GETDATE() AS DATE), @ObjectID, J.ItemID)
    ) P
    GROUP BY J.ItemID, J.UnitPrice;

    IF NOT EXISTS (SELECT 1 FROM #Items)
       OR EXISTS (
           SELECT 1
           FROM #Items X
           LEFT JOIN dbo.CF_ItemTbl C ON C.ItemID = X.ItemID
           WHERE COALESCE(X.ItemID, '') = '' OR X.ItemName IS NULL OR C.ItemGroupID <> 'HH1'
              OR X.Quantity IS NULL OR X.Quantity <= 0 OR X.Quantity <> FLOOR(X.Quantity)
       )
       OR EXISTS (SELECT 1 FROM #Items WHERE DiscountPercent < 0 OR DiscountPercent > 100)
    BEGIN
        SELECT NULL AS DocumentID, N'Sản phẩm, số lượng hoặc chiết khấu không hợp lệ' AS Msg, 1 AS MsgType;
        RETURN;
    END;

    /* Dòng giá 0 chỉ hợp lệ khi cùng mã có dòng mua; dòng mua phải khớp giá ERP. */
    IF EXISTS (
        SELECT 1 FROM #Items I
        WHERE (I.UnitPrice > 0 AND (I.ErpUnitPrice IS NULL OR ABS(I.UnitPrice - I.ErpUnitPrice) > 0.01))
           OR (I.UnitPrice = 0 AND NOT EXISTS (SELECT 1 FROM #Items B WHERE B.ItemID = I.ItemID AND B.UnitPrice > 0))
           OR I.UnitPrice IS NULL OR I.UnitPrice < 0
    )
    BEGIN
        SELECT NULL AS DocumentID, N'Giá sản phẩm không hợp lệ' AS Msg, 1 AS MsgType;
        RETURN;
    END;

    BEGIN TRY
        BEGIN TRANSACTION;

        IF COALESCE(@DocumentID, '') <> '' AND @DocumentID <> 'AUTO_GEN'
        BEGIN
            IF EXISTS (SELECT 1 FROM dbo.AR_OrderTbl WITH (UPDLOCK, HOLDLOCK) WHERE DocumentID = @DocumentID)
            BEGIN
                IF EXISTS (
                    SELECT 1 FROM dbo.AR_OrderTbl
                    WHERE DocumentID = @DocumentID
                      AND (UserCreate <> @Username OR ObjectID <> @ObjectID OR BranchID <> @BranchID OR EmployeeID <> @EmployeeID)
                )
                OR EXISTS (
                    SELECT ItemID, UnitPrice, SUM(Quantity), MAX(DiscountPercent)
                    FROM dbo.AR_OrderDetailTbl WHERE DocumentID = @DocumentID GROUP BY ItemID, UnitPrice
                    EXCEPT
                    SELECT ItemID, UnitPrice, SUM(Quantity), MAX(DiscountPercent)
                    FROM #Items GROUP BY ItemID, UnitPrice
                )
                OR EXISTS (
                    SELECT ItemID, UnitPrice, SUM(Quantity), MAX(DiscountPercent)
                    FROM #Items GROUP BY ItemID, UnitPrice
                    EXCEPT
                    SELECT ItemID, UnitPrice, SUM(Quantity), MAX(DiscountPercent)
                    FROM dbo.AR_OrderDetailTbl WHERE DocumentID = @DocumentID GROUP BY ItemID, UnitPrice
                )
                BEGIN
                    ROLLBACK TRANSACTION;
                    SELECT NULL AS DocumentID, N'Mã request đã được dùng cho một nội dung đơn khác' AS Msg, 1 AS MsgType;
                    RETURN;
                END;

                COMMIT TRANSACTION;
                SELECT @DocumentID AS DocumentID, N'Đơn hàng đã được tạo trước đó' AS Msg, 5 AS MsgType;
                RETURN;
            END;
        END
        ELSE
        BEGIN
            DECLARE @Prefix VARCHAR(20) = 'D' + COALESCE(NULLIF(@BranchID, ''), 'MB')
                + RIGHT('0' + CAST(MONTH(GETDATE()) AS VARCHAR), 2)
                + RIGHT(CAST(YEAR(GETDATE()) AS VARCHAR), 2) + '/';
            DECLARE @MaxNum INT;
            SELECT @MaxNum = COALESCE(MAX(TRY_CAST(SUBSTRING(DocumentID, LEN(@Prefix) + 1, 99) AS INT)), 0)
            FROM dbo.AR_OrderTbl WITH (UPDLOCK, HOLDLOCK)
            WHERE DocumentID LIKE @Prefix + '%';
            SET @DocumentID = @Prefix + CAST(@MaxNum + 1 AS VARCHAR);
        END;

        IF EXISTS (
            SELECT 1
            FROM (
                SELECT ItemID, SUM(Quantity) AS RequestedQuantity
                FROM #Items
                GROUP BY ItemID
            ) R
            OUTER APPLY (
                SELECT SUM(CASE WHEN T.ExpireDate IS NULL OR T.ExpireDate >= CAST(GETDATE() AS DATE) THEN T.Quantity ELSE 0 END) AS AvailableQuantity
                FROM dbo.IV_StockTransactionTbl T WITH (UPDLOCK, HOLDLOCK)
                WHERE T.ItemID = R.ItemID
                  AND T.StoreHouseID IN ('CTY', 'DL02', 'DL03')
                  AND (@IsGlobal = 1 OR T.StoreHouseID IN (SELECT StoreHouseID FROM @AllowedStores))
            ) S
            WHERE R.RequestedQuantity > COALESCE(S.AvailableQuantity, 0)
        )
        BEGIN
            ROLLBACK TRANSACTION;
            SELECT NULL AS DocumentID, N'Số lượng đặt vượt tồn khả dụng trong kho được cấp' AS Msg, 1 AS MsgType;
            RETURN;
        END;

        INSERT dbo.AR_OrderTbl (
            DocumentID, DocumentDate, EmployeeID, ManagerID, CeoID,
            ObjectID, BranchID, UserCreate, DateCreate, StatusID
        ) VALUES (
            @DocumentID, GETDATE(), @EmployeeID, @ManagerID, @CeoID,
            @ObjectID, @BranchID, @Username, GETDATE(), 0
        );

        INSERT dbo.AR_OrderDetailTbl (
            UserAutoID, DocumentID, ItemID, UnitPrice, Quantity, SoLuongTang,
            Amount, DiscountPercent, DiscountAmount, TotalAmount,
            DiemSanPham, DiemTichLuy, Notes
        )
        SELECT NEWID(), @DocumentID, ItemID, UnitPrice, Quantity, 0,
               Quantity * UnitPrice,
               DiscountPercent,
               Quantity * UnitPrice * DiscountPercent / 100.0,
               Quantity * UnitPrice * (1.0 - DiscountPercent / 100.0),
               COALESCE(DiemSanPham, 0),
               Quantity * COALESCE(DiemSanPham, 0),
               N''
        FROM #Items;

        EXEC dbo.AR_Order_AfterSaveStp @DocumentID;

        UPDATE dbo.AR_OrderTbl
        SET BaseTotal = COALESCE((SELECT SUM(TotalAmount) FROM dbo.AR_OrderDetailTbl WHERE DocumentID = @DocumentID), 0)
        WHERE DocumentID = @DocumentID;

        COMMIT TRANSACTION;
    END TRY
    BEGIN CATCH
        IF @@TRANCOUNT > 0 ROLLBACK TRANSACTION;
        SELECT NULL AS DocumentID, N'Hệ thống chưa thể tạo đơn hàng: ' + ERROR_MESSAGE() AS Msg, 1 AS MsgType;
        RETURN;
    END CATCH;

    SELECT @DocumentID AS DocumentID, N'Tạo đơn hàng thành công' AS Msg, 5 AS MsgType;
END;
GO
