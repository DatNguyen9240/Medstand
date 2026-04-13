CREATE OR ALTER PROCEDURE [dbo].[API_DanhMuc_Core_AI]
    @Type NVARCHAR(50) = NULL,
    @timkiem NVARCHAR(255) = ''
AS
BEGIN
    SET NOCOUNT ON

    SET @timkiem = ISNULL(@timkiem, '')

    -- =========================================
    -- 1. Không truyền type → trả categories
    -- =========================================
    IF ISNULL(@Type, '') = ''
    BEGIN
        SELECT 'sanpham' AS type, N'Sản phẩm' AS label, N'💊' AS icon, '@tra_cuu_san_pham|@TopN=50' AS DataSourceValue
        UNION ALL SELECT 'khachhang', N'Khách hàng', N'👤', '@danh_muc|@Type=khachhang'
        UNION ALL SELECT 'donhang', N'Đơn hàng', N'📋', 'API_DonHang_AI|@Username={username}'
        UNION ALL SELECT 'khohang', N'Kho hàng', N'📦', 'API_DanhsachTonKho_AI|@Username={username}'
        UNION ALL SELECT 'nhanvien', N'Nhân viên', N'👨‍💼', '@danh_muc|@Type=nhanvien'
        RETURN
    END

    -- =========================================
    -- 2. Search ALL (dành cho AI/autocomplete)
    -- =========================================
    IF @Type = 'all'
    BEGIN
        -- KHÁCH HÀNG
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
        FROM CF_ObjectTbl
        WHERE isCustomer = 1 AND ISNULL(isDisable, 0) = 0
          AND (@timkiem = '' 
               OR ObjectName LIKE N'%' + @timkiem + '%'
               OR ObjectID LIKE '%' + @timkiem + '%'
               OR Phone LIKE '%' + @timkiem + '%')

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
        FROM CF_ItemTbl I
        WHERE @timkiem = ''
           OR I.ItemID LIKE '%' + @timkiem + '%'
           OR I.ItemName LIKE N'%' + @timkiem + '%'

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
        FROM AR_OrderTbl A
        LEFT JOIN CF_ObjectTbl O ON O.ObjectID = A.ObjectID
        WHERE @timkiem = ''
           OR A.DocumentID LIKE '%' + @timkiem + '%'
           OR O.ObjectName LIKE N'%' + @timkiem + '%'

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
        FROM CF_ObjectTbl
        WHERE isEmployee = 1 AND ISNULL(isDisable, 0) = 0
          AND (@timkiem = ''
               OR ObjectName LIKE N'%' + @timkiem + '%'
               OR Phone LIKE '%' + @timkiem + '%')

        RETURN
    END

    -- =========================================
    -- 3. Search từng loại (giữ nguyên logic cũ)
    -- =========================================

    IF @Type = 'khachhang'
    BEGIN
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
        FROM CF_ObjectTbl
        WHERE isCustomer = 1 AND ISNULL(isDisable, 0) = 0
          AND (@timkiem = '' 
               OR ObjectName LIKE N'%' + @timkiem + '%'
               OR ObjectID LIKE '%' + @timkiem + '%'
               OR TaxCode LIKE '%' + @timkiem + '%'
               OR Phone LIKE '%' + @timkiem + '%')
        ORDER BY ObjectName
    END

    ELSE IF @Type = 'sanpham'
    BEGIN
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
        FROM CF_ItemTbl I
        OUTER APPLY (
            SELECT TOP 1 UnitPrice, DiemSanPham
            FROM AR_PriceView P
            WHERE P.ItemID = I.ItemID
              AND P.isDisable = 0 
              AND GETDATE() BETWEEN P.FromDate AND P.ToDate
            ORDER BY P.FromDate DESC
        ) P
        WHERE @timkiem = '' 
           OR I.ItemID LIKE '%' + @timkiem + '%' 
           OR I.ItemName LIKE N'%' + @timkiem + '%'
        ORDER BY I.ItemName
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
        FROM CF_StoreHouseTbl
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
        FROM AR_OrderTbl A
        LEFT JOIN CF_ObjectTbl O ON O.ObjectID = A.ObjectID
        LEFT JOIN CF_ObjectTbl E ON E.ObjectID = A.EmployeeID
        LEFT JOIN AR_OrderStatusTbl S ON S.StatusID = A.StatusID
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
        FROM CF_ObjectTbl
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