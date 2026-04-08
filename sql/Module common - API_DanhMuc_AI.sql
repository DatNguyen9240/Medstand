ALTER PROC [dbo].[API_DanhMuc_AI]
    @Type NVARCHAR(50) = NULL,
    @SearchText NVARCHAR(255) = ''
AS
BEGIN
    SET NOCOUNT ON

    SET @SearchText = ISNULL(@SearchText, '')

    -- =========================================
    -- 1. Không truyền type → trả categories
    -- =========================================
    IF ISNULL(@Type, '') = ''
    BEGIN
        SELECT 'sanpham' AS type, N'Sản phẩm' AS label, N'💊' AS icon
        UNION ALL SELECT 'khachhang', N'Khách hàng', N'👤'
        UNION ALL SELECT 'donhang', N'Đơn hàng', N'📋'
        UNION ALL SELECT 'khohang', N'Kho hàng', N'🏭'
        UNION ALL SELECT 'nhanvien', N'Nhân viên', N'👨‍💼'
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
            N'Khách hàng' AS PhanLoai,
            ObjectID AS MaDanhMuc,
            ObjectName AS Name,
            Phone,
            TaxCode
        FROM CF_ObjectTbl
        WHERE isCustomer = 1 AND ISNULL(isDisable, 0) = 0
          AND (@SearchText = '' 
               OR ObjectName LIKE N'%' + @SearchText + '%'
               OR ObjectID LIKE '%' + @SearchText + '%'
               OR Phone LIKE '%' + @SearchText + '%')

        UNION ALL

        -- SẢN PHẨM
        SELECT TOP 10 
            'sanpham',
            N'Sản phẩm',
            I.ItemID,
            I.ItemName,
            NULL,
            NULL
        FROM CF_ItemTbl I
        WHERE @SearchText = ''
           OR I.ItemID LIKE '%' + @SearchText + '%'
           OR I.ItemName LIKE N'%' + @SearchText + '%'

        UNION ALL

        -- ĐƠN HÀNG
        SELECT TOP 10 
            'donhang',
            N'Đơn hàng',
            A.DocumentID,
            O.ObjectName,
            O.Phone,
            NULL
        FROM AR_OrderTbl A
        LEFT JOIN CF_ObjectTbl O ON O.ObjectID = A.ObjectID
        WHERE @SearchText = ''
           OR A.DocumentID LIKE '%' + @SearchText + '%'
           OR O.ObjectName LIKE N'%' + @SearchText + '%'

        UNION ALL

        -- NHÂN VIÊN
        SELECT TOP 10 
            'nhanvien',
            N'Nhân viên',
            ObjectID,
            ObjectName,
            Phone,
            NULL
        FROM CF_ObjectTbl
        WHERE isEmployee = 1 AND ISNULL(isDisable, 0) = 0
          AND (@SearchText = ''
               OR ObjectName LIKE N'%' + @SearchText + '%'
               OR Phone LIKE '%' + @SearchText + '%')

        RETURN
    END

    -- =========================================
    -- 3. Search từng loại (giữ nguyên logic cũ)
    -- =========================================

    IF @Type = 'khachhang'
    BEGIN
        SELECT TOP 20 
            N'Khách hàng' AS PhanLoai, 
            ObjectID AS MaDanhMuc, 
            ObjectName AS Name, 
            Address, 
            TaxCode
        FROM CF_ObjectTbl
        WHERE isCustomer = 1 AND ISNULL(isDisable, 0) = 0
          AND (@SearchText = '' 
               OR ObjectName LIKE N'%' + @SearchText + '%'
               OR ObjectID LIKE '%' + @SearchText + '%'
               OR TaxCode LIKE '%' + @SearchText + '%'
               OR Phone LIKE '%' + @SearchText + '%')
        ORDER BY ObjectName
    END

    ELSE IF @Type = 'sanpham'
    BEGIN
        SELECT TOP 20 
            N'Sản phẩm' AS PhanLoai, 
            I.ItemID AS MaDanhMuc, 
            I.ItemName AS Name,
            P.UnitPrice, 
            P.DiemSanPham
        FROM CF_ItemTbl I
        OUTER APPLY (
            SELECT TOP 1 UnitPrice, DiemSanPham
            FROM AR_PriceView P
            WHERE P.ItemID = I.ItemID
              AND P.isDisable = 0 
              AND GETDATE() BETWEEN P.FromDate AND P.ToDate
            ORDER BY P.FromDate DESC
        ) P
        WHERE @SearchText = '' 
           OR I.ItemID LIKE '%' + @SearchText + '%' 
           OR I.ItemName LIKE N'%' + @SearchText + '%'
        ORDER BY I.ItemName
    END

    ELSE IF @Type = 'khohang'
    BEGIN
        SELECT TOP 20 
            N'Kho hàng' AS PhanLoai, 
            StoreHouseID AS MaDanhMuc, 
            StoreHouseName AS Name
        FROM CF_StoreHouseTbl
        WHERE @SearchText = '' 
           OR StoreHouseID LIKE '%' + @SearchText + '%' 
           OR StoreHouseName LIKE N'%' + @SearchText + '%'
        ORDER BY StoreHouseName
    END

    ELSE IF @Type = 'donhang'
    BEGIN
        SELECT TOP 20 
               N'Đơn hàng' AS PhanLoai, 
               A.DocumentID AS MaDanhMuc, 
               O.ObjectName AS Name,
               A.DocumentDate,
               A.BaseTotal,
               S.StatusName,
               A.EmployeeID,
               E.ObjectName AS EmployeeName,
               A.DateCreate
        FROM AR_OrderTbl A
        LEFT JOIN CF_ObjectTbl O ON O.ObjectID = A.ObjectID
        LEFT JOIN CF_ObjectTbl E ON E.ObjectID = A.EmployeeID
        LEFT JOIN AR_OrderStatusTbl S ON S.StatusID = A.StatusID
        WHERE @SearchText = ''
           OR A.DocumentID LIKE '%' + @SearchText + '%'
           OR O.ObjectName LIKE N'%' + @SearchText + '%'
           OR O.Phone LIKE '%' + @SearchText + '%'
        ORDER BY A.DateCreate DESC
    END

    ELSE IF @Type = 'nhanvien'
    BEGIN
        SELECT TOP 20 
            N'Nhân viên' AS PhanLoai, 
            ObjectID AS MaDanhMuc, 
            ObjectName AS Name, 
            Phone, 
            Email
        FROM CF_ObjectTbl
        WHERE isEmployee = 1 AND ISNULL(isDisable, 0) = 0
          AND (@SearchText = '' 
               OR ObjectID LIKE '%' + @SearchText + '%' 
               OR ObjectName LIKE N'%' + @SearchText + '%'
               OR Phone LIKE '%' + @SearchText + '%')
        ORDER BY ObjectName
    END

    ELSE
    BEGIN
        SELECT N'Type không hợp lệ' AS Msg, 1 AS MsgType
    END
END