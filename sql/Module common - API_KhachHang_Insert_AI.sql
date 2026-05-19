
GO

SET ANSI_NULLS ON
GO
SET QUOTED_IDENTIFIER ON
GO

-- Xóa SP cũ nếu còn tồn tại (cleanup từ tên cũ)
IF OBJECT_ID('API_ThemKhachHang_AI', 'P') IS NOT NULL
    DROP PROCEDURE API_ThemKhachHang_AI;
GO

CREATE OR ALTER PROCEDURE [dbo].[API_KhachHang_Insert_AI]
    @Username       VARCHAR(50),
    @TenKhachHang   NVARCHAR(300),
    @SoDienThoai    VARCHAR(100),
    @DiaChi         NVARCHAR(500) = '',
    @ObjectGroupID  VARCHAR(50)   = 'KH' 
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @ResultMsg NVARCHAR(MAX);
    DECLARE @NewID VARCHAR(50);
    DECLARE @BranchID VARCHAR(50);

    -- 1. Lấy BranchID từ User, nếu không có lấy mặc định từ hệ thống
    SELECT @BranchID = BranchID FROM SY_User WHERE UserName = @Username;
    IF @BranchID IS NULL 
        SELECT TOP 1 @BranchID = BranchID FROM CF_ObjectTbl WHERE BranchID IS NOT NULL;

    -- 2. Validation cơ bản
    IF ISNULL(@TenKhachHang, '') = ''
    BEGIN
        SELECT N'Lỗi: Tên khách hàng không được để trống.' AS [message], 'chat' AS [action];
        RETURN;
    END

    -- 3. Sinh mã ObjectID (Quy tắc: KH + YYMM + 4 số thứ tự)
    DECLARE @Prefix VARCHAR(10) = 'KH' + RIGHT(CAST(YEAR(GETDATE()) AS VARCHAR), 2) + RIGHT('0' + CAST(MONTH(GETDATE()) AS VARCHAR), 2);
    DECLARE @MaxNum INT;
    
    SELECT @MaxNum = ISNULL(MAX(CAST(REPLACE(ObjectID, @Prefix, '') AS INT)), 0)
    FROM CF_ObjectTbl
    WHERE ObjectID LIKE @Prefix + '%';
    
    SET @NewID = @Prefix + RIGHT('000' + CAST(@MaxNum + 1 AS VARCHAR), 4);

    -- 4. INSERT với đầy đủ các cột bắt buộc theo Schema
    BEGIN TRY
        INSERT INTO CF_ObjectTbl (
            ObjectID, BranchID, ObjectName, Phone, Address, 
            ObjectGroupID, 
            RevAccID, PayAccID, 
            isCustomer, isEmployee, isManager, isVendor, isAgency, isDefault, isDisable, 
            CongNoDonHang, IsForeign,
            UserCreate, DateCreate
        )
        VALUES (
            @NewID, 
            ISNULL(@BranchID, ''), 
            @TenKhachHang, 
            @SoDienThoai, 
            @DiaChi,
            @ObjectGroupID,
            '1311', '3311', 
            1, 0, 0, 0, 0, 0, 0, 
            0, 0, 
            @Username, GETDATE()
        );

        SELECT N'Đã thêm khách hàng thành công!' + CHAR(13)
             + N'👤 Tên: ' + @TenKhachHang + CHAR(13)
             + N'🆔 Mã: ' + @NewID + CHAR(13)
             + N'📞 SĐT: ' + @SoDienThoai AS [message], 'chat' AS [action];
    END TRY
    BEGIN CATCH
        SELECT N'Lỗi SQL (' + CAST(ERROR_NUMBER() AS VARCHAR) + '): ' + ERROR_MESSAGE() AS [message], 'chat' AS [action];
    END CATCH
END
GO
