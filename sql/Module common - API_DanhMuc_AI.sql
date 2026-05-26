CREATE OR ALTER PROCEDURE [dbo].[API_DanhMuc_Core_AI]
    @Type NVARCHAR(50) = NULL,
    @timkiem NVARCHAR(255) = '',
    @Username VARCHAR(50) = ''
AS
BEGIN
    SET NOCOUNT ON

    SET @timkiem = ISNULL(@timkiem, '')
    SET @timkiem = REPLACE(REPLACE(@timkiem, '"', ''), '''', '')
    DECLARE @CleanTimKiem NVARCHAR(255) = ''
    IF @timkiem <> ''
    BEGIN
        SET @CleanTimKiem = dbo.ufn_remove_accents(@timkiem)
    END

    DECLARE @SYSBranchID    VARCHAR(50) = ''
    DECLARE @SYSCeoID       VARCHAR(50) = ''
    DECLARE @SYSManagerID   VARCHAR(50) = ''
    DECLARE @AllowedObjects TABLE (ObjectID VARCHAR(50) PRIMARY KEY)
    
    IF @Username <> ''
    BEGIN
        SELECT
            @SYSBranchID   = ISNULL(BranchID, ''),
            @SYSCeoID      = ISNULL(CeoID, ''),
            @SYSManagerID  = ISNULL(ManagerID, '')
        FROM SY_User WITH (NOLOCK) WHERE UserName = @Username

        INSERT INTO @AllowedObjects (ObjectID)
        SELECT ObjectID FROM AR_GetObjectByUserFnc(@Username)
    END

    -- =========================================
    -- 1. Không truyền type → trả categories
    -- =========================================
    IF ISNULL(@Type, '') = ''
    BEGIN
        SELECT 'sanpham' AS type, N'Sản phẩm' AS label, N'' AS icon, '@tra_cuu_san_pham|@TopN=50' AS DataSourceValue
        UNION ALL SELECT 'khachhang', N'Khách hàng', N'', '@danh_muc|@Type=khachhang'
        UNION ALL SELECT 'donhang', N'Đơn hàng', N'', 'API_DonHang_AI|@Username={username}'
        UNION ALL SELECT 'khohang', N'Kho hàng', N'', 'API_DanhsachTonKho_AI|@Username={username}'
        UNION ALL SELECT 'nhanvien', N'Nhân viên', N'', '@danh_muc|@Type=nhanvien'
        RETURN
    END

    -- =========================================
    -- 2. Search ALL (dành cho AI/autocomplete)
    -- =========================================
    IF @Type = 'all'
    BEGIN
        CREATE TABLE #TempAllKH (
            Type VARCHAR(50),
            MaDanhMuc VARCHAR(50),
            Name NVARCHAR(250),
            PhanLoai NVARCHAR(100),
            Phone VARCHAR(50),
            TaxCode VARCHAR(50),
            ExtraData NVARCHAR(MAX)
        )

        IF @Username = ''
        BEGIN
            INSERT INTO #TempAllKH
            SELECT TOP 10 
                'khachhang' AS Type,
                ObjectID AS MaDanhMuc,
                ObjectName AS Name,
                N'Khách hàng' AS PhanLoai,
                Phone,
                TaxCode,
                (
                    SELECT 
                        Phone,
                        TaxCode,
                        N'Khách hàng' AS PhanLoai
                    FOR JSON PATH, WITHOUT_ARRAY_WRAPPER, INCLUDE_NULL_VALUES
                ) AS ExtraData
            FROM CF_ObjectTbl WITH (NOLOCK)
            WHERE isCustomer = 1 AND ISNULL(isDisable, 0) = 0
              AND (@timkiem = '' 
                   OR ObjectName LIKE N'%' + @timkiem + '%'
                   OR ObjectID LIKE '%' + @timkiem + '%'
                   OR Phone LIKE '%' + @timkiem + '%')
        END
        ELSE
        BEGIN
            INSERT INTO #TempAllKH
            SELECT TOP 10 
                'khachhang' AS Type,
                C.ObjectID AS MaDanhMuc,
                C.ObjectName AS Name,
                N'Khách hàng' AS PhanLoai,
                C.Phone,
                C.TaxCode,
                (
                    SELECT 
                        C.Phone,
                        C.TaxCode,
                        N'Khách hàng' AS PhanLoai
                    FOR JSON PATH, WITHOUT_ARRAY_WRAPPER, INCLUDE_NULL_VALUES
                ) AS ExtraData
            FROM CF_ObjectTbl C WITH (NOLOCK)
            INNER JOIN @AllowedObjects A ON C.ObjectID = A.ObjectID
            WHERE C.isCustomer = 1 AND ISNULL(C.isDisable, 0) = 0
              AND (@timkiem = '' 
                   OR C.ObjectName LIKE N'%' + @timkiem + '%'
                   OR C.ObjectID LIKE '%' + @timkiem + '%'
                   OR C.Phone LIKE '%' + @timkiem + '%')
        END

        IF NOT EXISTS (SELECT 1 FROM #TempAllKH) AND @timkiem <> ''
        BEGIN
            IF @Username = ''
            BEGIN
                INSERT INTO #TempAllKH
                SELECT TOP 10 
                    'khachhang' AS Type,
                    ObjectID AS MaDanhMuc,
                    ObjectName AS Name,
                    N'Khách hàng' AS PhanLoai,
                    Phone,
                    TaxCode,
                    (
                        SELECT 
                            Phone,
                            TaxCode,
                            N'Khách hàng' AS PhanLoai
                        FOR JSON PATH, WITHOUT_ARRAY_WRAPPER, INCLUDE_NULL_VALUES
                    ) AS ExtraData
                FROM CF_ObjectTbl WITH (NOLOCK)
                WHERE isCustomer = 1 AND ISNULL(isDisable, 0) = 0
                  AND (dbo.ufn_remove_accents(ObjectName) LIKE '%' + @CleanTimKiem + '%')
            END
            ELSE
            BEGIN
                INSERT INTO #TempAllKH
                SELECT TOP 10 
                    'khachhang' AS Type,
                    C.ObjectID AS MaDanhMuc,
                    C.ObjectName AS Name,
                    N'Khách hàng' AS PhanLoai,
                    C.Phone,
                    C.TaxCode,
                    (
                        SELECT 
                            C.Phone,
                            C.TaxCode,
                            N'Khách hàng' AS PhanLoai
                        FOR JSON PATH, WITHOUT_ARRAY_WRAPPER, INCLUDE_NULL_VALUES
                    ) AS ExtraData
                FROM CF_ObjectTbl C WITH (NOLOCK)
                INNER JOIN @AllowedObjects A ON C.ObjectID = A.ObjectID
                WHERE C.isCustomer = 1 AND ISNULL(C.isDisable, 0) = 0
                  AND (dbo.ufn_remove_accents(C.ObjectName) LIKE '%' + @CleanTimKiem + '%')
            END
        END

        SELECT * FROM #TempAllKH
        UNION ALL

        -- SẢN PHẨM
        SELECT TOP 10 
            'sanpham' AS Type,
            I.ItemID AS MaDanhMuc, 
            I.ItemName AS Name,
            N'Sản phẩm' AS PhanLoai, 
            NULL AS Phone,
            NULL AS TaxCode,
            (
                SELECT 
                    N'Sản phẩm' AS PhanLoai
                FOR JSON PATH, WITHOUT_ARRAY_WRAPPER, INCLUDE_NULL_VALUES
            ) AS ExtraData
        FROM CF_ItemTbl I WITH (NOLOCK)
        WHERE ISNULL(I.isDisable, 0) = 0
          AND ISNULL(I.ItemGroupID, '') NOT IN ('KM', 'DV', 'VT', 'BB', 'Vat Tu', 'Bao Bi', 'TUI')
          AND (@timkiem = ''
           OR I.ItemID LIKE '%' + @timkiem + '%'
           OR I.ItemName LIKE N'%' + @timkiem + '%')

        UNION ALL

        -- ĐƠN HÀNG
        SELECT TOP 10 
            'donhang' AS Type,
            A.DocumentID AS MaDanhMuc,
            O.ObjectName AS Name,
            N'Đơn hàng' AS PhanLoai,
            O.Phone,
            NULL AS TaxCode,
            (
                SELECT 
                    O.Phone,
                    N'Đơn hàng' AS PhanLoai
                FOR JSON PATH, WITHOUT_ARRAY_WRAPPER, INCLUDE_NULL_VALUES
            ) AS ExtraData
        FROM AR_OrderTbl A WITH (NOLOCK)
        LEFT JOIN CF_ObjectTbl O WITH (NOLOCK) ON O.ObjectID = A.ObjectID
        WHERE (ISNULL(@SYSBranchID, '') = '' OR A.BranchID = @SYSBranchID)
          AND (ISNULL(@SYSCeoID, '') = '' OR A.CeoID = @SYSCeoID)
          AND (ISNULL(@SYSManagerID, '') = '' OR A.ManagerID = @SYSManagerID)
          AND (@timkiem = ''
           OR A.DocumentID LIKE '%' + @timkiem + '%'
           OR O.ObjectName LIKE N'%' + @timkiem + '%')

        UNION ALL

        -- NHÂN VIÊN
        SELECT TOP 10 
            'nhanvien' AS Type,
            ObjectID AS MaDanhMuc,
            ObjectName AS Name,
            N'Nhân viên' AS PhanLoai,
            Phone,
            NULL AS TaxCode,
            (
                SELECT 
                    Phone,
                    N'Nhân viên' AS PhanLoai
                FOR JSON PATH, WITHOUT_ARRAY_WRAPPER, INCLUDE_NULL_VALUES
            ) AS ExtraData
        FROM CF_ObjectTbl WITH (NOLOCK)
        WHERE isEmployee = 1 AND ISNULL(isDisable, 0) = 0
          AND (ISNULL(@SYSBranchID, '') = '' OR BranchID = @SYSBranchID)
          AND (ISNULL(@SYSCeoID, '') = '' OR CeoID = @SYSCeoID)
          AND (@timkiem = ''
               OR ObjectName LIKE N'%' + @timkiem + '%'
               OR Phone LIKE '%' + @timkiem + '%')

        DROP TABLE #TempAllKH
        RETURN
    END

    -- =========================================
    -- 3. Search từng loại (giữ nguyên logic cũ)
    -- =========================================

    IF @Type = 'khachhang'
    BEGIN
        CREATE TABLE #TempKH (
            Type VARCHAR(50),
            MaDanhMuc VARCHAR(50),
            Name NVARCHAR(250),
            PhanLoai NVARCHAR(100),
            Address NVARCHAR(500),
            TaxCode VARCHAR(50),
            Phone VARCHAR(50),
            ExtraData NVARCHAR(MAX)
        )

        -- 1. Tìm kiếm nhanh chính xác bằng LIKE
        IF @Username = ''
        BEGIN
            INSERT INTO #TempKH
            SELECT TOP 20 
                'khachhang' AS Type,
                ObjectID AS MaDanhMuc, 
                ObjectName AS Name, 
                N'Khách hàng' AS PhanLoai, 
                Address, 
                TaxCode,
                Phone,
                (
                    SELECT 
                        Address,
                        TaxCode,
                        Phone,
                        N'Khách hàng' AS PhanLoai
                    FOR JSON PATH, WITHOUT_ARRAY_WRAPPER, INCLUDE_NULL_VALUES
                ) AS ExtraData
            FROM CF_ObjectTbl WITH (NOLOCK)
            WHERE isCustomer = 1 AND ISNULL(isDisable, 0) = 0
              AND (@timkiem = '' 
                   OR ObjectName LIKE N'%' + @timkiem + '%'
                   OR ObjectID LIKE '%' + @timkiem + '%'
                   OR TaxCode LIKE '%' + @timkiem + '%'
                   OR Phone LIKE '%' + @timkiem + '%')
        END
        ELSE
        BEGIN
            INSERT INTO #TempKH
            SELECT TOP 20 
                'khachhang' AS Type,
                C.ObjectID AS MaDanhMuc, 
                C.ObjectName AS Name, 
                N'Khách hàng' AS PhanLoai, 
                C.Address, 
                C.TaxCode,
                C.Phone,
                (
                    SELECT 
                        C.Address,
                        C.TaxCode,
                        C.Phone,
                        N'Khách hàng' AS PhanLoai
                    FOR JSON PATH, WITHOUT_ARRAY_WRAPPER, INCLUDE_NULL_VALUES
                ) AS ExtraData
            FROM CF_ObjectTbl C WITH (NOLOCK)
            INNER JOIN @AllowedObjects A ON C.ObjectID = A.ObjectID
            WHERE C.isCustomer = 1 AND ISNULL(C.isDisable, 0) = 0
              AND (@timkiem = '' 
                   OR C.ObjectName LIKE N'%' + @timkiem + '%'
                   OR C.ObjectID LIKE '%' + @timkiem + '%'
                   OR C.TaxCode LIKE '%' + @timkiem + '%'
                   OR C.Phone LIKE '%' + @timkiem + '%')
        END

        -- 2. Fallback tìm chậm bằng ufn_remove_accents
        IF NOT EXISTS (SELECT 1 FROM #TempKH) AND @timkiem <> ''
        BEGIN
            IF @Username = ''
            BEGIN
                INSERT INTO #TempKH
                SELECT TOP 20 
                    'khachhang' AS Type,
                    ObjectID AS MaDanhMuc, 
                    ObjectName AS Name, 
                    N'Khách hàng' AS PhanLoai, 
                    Address, 
                    TaxCode,
                    Phone,
                    (
                        SELECT 
                            Address,
                            TaxCode,
                            Phone,
                            N'Khách hàng' AS PhanLoai
                        FOR JSON PATH, WITHOUT_ARRAY_WRAPPER, INCLUDE_NULL_VALUES
                    ) AS ExtraData
                FROM CF_ObjectTbl WITH (NOLOCK)
                WHERE isCustomer = 1 AND ISNULL(isDisable, 0) = 0
                  AND (dbo.ufn_remove_accents(ObjectName) LIKE '%' + @CleanTimKiem + '%')
            END
            ELSE
            BEGIN
                INSERT INTO #TempKH
                SELECT TOP 20 
                    'khachhang' AS Type,
                    C.ObjectID AS MaDanhMuc, 
                    C.ObjectName AS Name, 
                    N'Khách hàng' AS PhanLoai, 
                    C.Address, 
                    C.TaxCode,
                    C.Phone,
                    (
                        SELECT 
                            C.Address,
                            C.TaxCode,
                            C.Phone,
                            N'Khách hàng' AS PhanLoai
                        FOR JSON PATH, WITHOUT_ARRAY_WRAPPER, INCLUDE_NULL_VALUES
                    ) AS ExtraData
                FROM CF_ObjectTbl C WITH (NOLOCK)
                INNER JOIN @AllowedObjects A ON C.ObjectID = A.ObjectID
                WHERE C.isCustomer = 1 AND ISNULL(C.isDisable, 0) = 0
                  AND (dbo.ufn_remove_accents(C.ObjectName) LIKE '%' + @CleanTimKiem + '%')
            END
        END

        SELECT * FROM #TempKH 
        ORDER BY 
            CASE WHEN MaDanhMuc = @timkiem THEN 0 ELSE 1 END,
            CASE WHEN Name LIKE N'%DỪNG XUẤT%' OR Name LIKE N'%DUNG XUAT%' OR Name LIKE N'%TRÙNG%' THEN 1 ELSE 0 END,
            Name
        DROP TABLE #TempKH
    END

    ELSE IF @Type = 'sanpham'
    BEGIN
        CREATE TABLE #TempSP (
            Type VARCHAR(50),
            MaDanhMuc VARCHAR(50),
            Name NVARCHAR(250),
            PhanLoai NVARCHAR(100),
            UnitPrice DECIMAL(18,2),
            DiemSanPham INT,
            ExtraData NVARCHAR(MAX)
        )

        -- 1. Tìm kiếm nhanh chính xác bằng LIKE
        INSERT INTO #TempSP
        SELECT TOP 20 
            'sanpham' AS Type,
            I.ItemID AS MaDanhMuc, 
            I.ItemName AS Name,
            N'Sản phẩm' AS PhanLoai, 
            P.UnitPrice, 
            P.DiemSanPham,
            (
                SELECT 
                    P.UnitPrice,
                    P.DiemSanPham,
                    N'Sản phẩm' AS PhanLoai
                FOR JSON PATH, WITHOUT_ARRAY_WRAPPER, INCLUDE_NULL_VALUES
            ) AS ExtraData
        FROM CF_ItemTbl I WITH (NOLOCK)
        OUTER APPLY (
            SELECT TOP 1 UnitPrice, DiemSanPham
            FROM AR_PriceView P WITH (NOLOCK)
            WHERE P.ItemID = I.ItemID
              AND P.isDisable = 0 
            ORDER BY 
              CASE WHEN GETDATE() BETWEEN P.FromDate AND P.ToDate THEN 1 ELSE 2 END,
              P.FromDate DESC
        ) P
        WHERE ISNULL(I.isDisable, 0) = 0
          AND ISNULL(I.ItemGroupID, '') NOT IN ('KM', 'DV', 'VT', 'BB', 'Vat Tu', 'Bao Bi', 'TUI')
          AND (@timkiem = '' 
               OR I.ItemID LIKE '%' + @timkiem + '%' 
               OR I.ItemName LIKE N'%' + @timkiem + '%')

        -- 2. Fallback tìm chậm bằng ufn_remove_accents
        IF NOT EXISTS (SELECT 1 FROM #TempSP) AND @timkiem <> ''
        BEGIN
            INSERT INTO #TempSP
            SELECT TOP 20 
                'sanpham' AS Type,
                I.ItemID AS MaDanhMuc, 
                I.ItemName AS Name,
                N'Sản phẩm' AS PhanLoai, 
                P.UnitPrice, 
                P.DiemSanPham,
                (
                    SELECT 
                        P.UnitPrice,
                        P.DiemSanPham,
                        N'Sản phẩm' AS PhanLoai
                    FOR JSON PATH, WITHOUT_ARRAY_WRAPPER, INCLUDE_NULL_VALUES
                ) AS ExtraData
            FROM CF_ItemTbl I WITH (NOLOCK)
            OUTER APPLY (
                SELECT TOP 1 UnitPrice, DiemSanPham
                FROM AR_PriceView P WITH (NOLOCK)
                WHERE P.ItemID = I.ItemID
                  AND P.isDisable = 0 
                ORDER BY 
                  CASE WHEN GETDATE() BETWEEN P.FromDate AND P.ToDate THEN 1 ELSE 2 END,
                  P.FromDate DESC
            ) P
            WHERE ISNULL(I.isDisable, 0) = 0
              AND ISNULL(I.ItemGroupID, '') NOT IN ('KM', 'DV', 'VT', 'BB', 'Vat Tu', 'Bao Bi', 'TUI')
              AND (dbo.ufn_remove_accents(I.ItemName) LIKE '%' + @CleanTimKiem + '%')
        END

        SELECT * FROM #TempSP ORDER BY Name
        DROP TABLE #TempSP
    END

    ELSE IF @Type = 'khohang'
    BEGIN
        SELECT TOP 20 
            'khohang' AS Type,
            StoreHouseID AS MaDanhMuc, 
            StoreHouseName AS Name,
            N'Kho hàng' AS PhanLoai, 
            (
                SELECT 
                    N'Kho hàng' AS PhanLoai
                FOR JSON PATH, WITHOUT_ARRAY_WRAPPER, INCLUDE_NULL_VALUES
            ) AS ExtraData
        FROM CF_StoreHouseTbl WITH (NOLOCK)
        WHERE @timkiem = '' 
           OR StoreHouseID LIKE '%' + @timkiem + '%' 
           OR StoreHouseName LIKE N'%' + @timkiem + '%'
        ORDER BY StoreHouseName
    END

    ELSE IF @Type = 'donhang'
    BEGIN
        SELECT TOP 20 
            'donhang' AS Type,
            A.DocumentID AS MaDanhMuc, 
            O.ObjectName AS Name,
            N'Đơn hàng' AS PhanLoai, 
            A.DocumentDate,
            A.BaseTotal,
            S.StatusName,
            A.EmployeeID,
            E.ObjectName AS EmployeeName,
            A.DateCreate,
            (
                SELECT 
                    A.DocumentDate,
                    A.BaseTotal,
                    S.StatusName,
                    A.EmployeeID,
                    E.ObjectName AS EmployeeName,
                    A.DateCreate,
                    N'Đơn hàng' AS PhanLoai
                FOR JSON PATH, WITHOUT_ARRAY_WRAPPER, INCLUDE_NULL_VALUES
            ) AS ExtraData
        FROM AR_OrderTbl A WITH (NOLOCK)
        LEFT JOIN CF_ObjectTbl O WITH (NOLOCK) ON O.ObjectID = A.ObjectID
        LEFT JOIN CF_ObjectTbl E WITH (NOLOCK) ON E.ObjectID = A.EmployeeID
        LEFT JOIN AR_OrderStatusTbl S WITH (NOLOCK) ON S.StatusID = A.StatusID
        WHERE @timkiem = ''
           OR A.DocumentID LIKE '%' + @timkiem + '%'
           OR O.ObjectName LIKE N'%' + @timkiem + '%'
           OR O.Phone LIKE '%' + @timkiem + '%'
        ORDER BY A.DateCreate DESC
    END

    ELSE IF @Type = 'nhanvien'
    BEGIN
        SELECT TOP 20 
            'nhanvien' AS Type,
            ObjectID AS MaDanhMuc, 
            ObjectName AS Name, 
            N'Nhân viên' AS PhanLoai, 
            Phone, 
            Email,
            (
                SELECT 
                    Phone,
                    Email,
                    N'Nhân viên' AS PhanLoai
                FOR JSON PATH, WITHOUT_ARRAY_WRAPPER, INCLUDE_NULL_VALUES
            ) AS ExtraData
        FROM CF_ObjectTbl WITH (NOLOCK)
        WHERE isEmployee = 1 AND ISNULL(isDisable, 0) = 0
          AND (@timkiem = '' 
               OR ObjectID LIKE '%' + @timkiem + '%' 
               OR ObjectName LIKE N'%' + @timkiem + '%'
               OR Phone LIKE '%' + @timkiem + '%')
        ORDER BY ObjectName
    END

    ELSE
    BEGIN
        SELECT N'Type không hợp lệ (' + ISNULL(@Type, 'NULL') + ')' AS Msg, 1 AS MsgType
    END
END
