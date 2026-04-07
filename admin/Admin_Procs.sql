-- ═══════════════════════════════════════════════════════════════════════════
-- Admin_Metadata_Procs.sql
-- CÁC THỦ TỤC HỖ TRỢ GIAO DIỆN QUẢN TRỊ METADATA
-- ═══════════════════════════════════════════════════════════════════════════
USE [medtest]
GO

-- 1. LẤY TOÀN BỘ CẤU HÌNH CỦA MỘT MODULE (CHO ADMIN)
CREATE OR ALTER PROCEDURE API_Admin_GetFullConfig
    @ApiCode VARCHAR(100)
AS
BEGIN
    DECLARE @ApiID INT;
    SELECT @ApiID = ApiID FROM API_Definition WHERE ApiCode = @ApiCode;

    -- Kết quả 1: Thông tin chung (Definition)
    SELECT * FROM API_Definition WHERE ApiID = @ApiID;

    -- Kết quả 2: Danh sách Actions
    SELECT * FROM API_Action WHERE ApiID = @ApiID ORDER BY OrderIndex;

    -- Kết quả 3: Danh sách Fields
    SELECT * FROM API_Field WHERE ApiID = @ApiID ORDER BY OrderIndex;

    -- Kết quả 4: Danh sách Filters
    SELECT * FROM API_Filter WHERE ApiID = @ApiID ORDER BY OrderIndex;

    -- Kết quả 5: Mapping Action-Field
    SELECT af.*, f.FieldCode 
    FROM API_Action_Field af 
    JOIN API_Field f ON af.FieldID = f.FieldID
    JOIN API_Action a ON af.ActionID = a.ActionID
    WHERE a.ApiID = @ApiID;
END
GO

-- 2. ĐỒNG BỘ CẤU HÌNH (UPSERT MODAL)
-- Ghi chú: Procedure này dùng để lưu các thay đổi cơ bản của Module
CREATE OR ALTER PROCEDURE API_Admin_SaveBasicConfig
    @ApiCode         VARCHAR(100),
    @ApiName         NVARCHAR(200),
    @StoredProcedure VARCHAR(200),
    @Category        NVARCHAR(100),
    @IconEmoji       NVARCHAR(10)
AS
BEGIN
    IF EXISTS (SELECT 1 FROM API_Definition WHERE ApiCode = @ApiCode)
    BEGIN
        UPDATE API_Definition SET
            ApiName = @ApiName,
            StoredProcedure = @StoredProcedure,
            Category = @Category,
            IconEmoji = @IconEmoji
        WHERE ApiCode = @ApiCode;
    END
    ELSE
    BEGIN
        INSERT INTO API_Definition (ApiCode, ApiName, StoredProcedure, Category, IconEmoji)
        VALUES (@ApiCode, @ApiName, @StoredProcedure, @Category, @IconEmoji);
    END
END
GO

-- 3. LƯU THÔNG TIN FIELD (UPSERT)
CREATE OR ALTER PROCEDURE API_Admin_SaveField
    @ApiCode         VARCHAR(100),
    @FieldCode       VARCHAR(100),
    @FieldName       NVARCHAR(200),
    @DataType        VARCHAR(20),
    @ControlType     VARCHAR(50),
    @IsRequired      BIT,
    @IsSystemParam   BIT,
    @DefaultValue    NVARCHAR(500),
    @Placeholder     NVARCHAR(200),
    @DataSourceType  VARCHAR(50),
    @DataSourceValue NVARCHAR(MAX),
    @OrderIndex      INT
AS
BEGIN
    DECLARE @ApiID INT;
    SELECT @ApiID = ApiID FROM API_Definition WHERE ApiCode = @ApiCode;
    IF @ApiID IS NULL RETURN;

    IF EXISTS (SELECT 1 FROM API_Field WHERE ApiID = @ApiID AND FieldCode = @FieldCode)
    BEGIN
        UPDATE API_Field SET
            FieldName = @FieldName,
            DataType = @DataType,
            ControlType = @ControlType,
            IsRequired = @IsRequired,
            IsSystemParam = @IsSystemParam,
            DefaultValue = @DefaultValue,
            Placeholder = @Placeholder,
            DataSourceType = @DataSourceType,
            DataSourceValue = @DataSourceValue,
            OrderIndex = @OrderIndex
        WHERE ApiID = @ApiID AND FieldCode = @FieldCode;
    END
    ELSE
    BEGIN
        INSERT INTO API_Field (ApiID, FieldCode, FieldName, DataType, ControlType, IsRequired, IsSystemParam, DefaultValue, Placeholder, DataSourceType, DataSourceValue, OrderIndex)
        VALUES (@ApiID, @FieldCode, @FieldName, @DataType, @ControlType, @IsRequired, @IsSystemParam, @DefaultValue, @Placeholder, @DataSourceType, @DataSourceValue, @OrderIndex);
        
        -- Tự động map vào Action mặc định nếu có
        DECLARE @ActionID INT;
        SELECT TOP 1 @ActionID = ActionID FROM API_Action WHERE ApiID = @ApiID AND IsDefault = 1;
        IF @ActionID IS NOT NULL
        BEGIN
            DECLARE @FieldID INT = SCOPE_IDENTITY();
            INSERT INTO API_Action_Field (ActionID, FieldID, IsVisible, IsEditable, IsRequired)
            VALUES (@ActionID, @FieldID, 1, 1, @IsRequired);
        END
    END
END
GO

-- 4. XÓA FIELD
CREATE OR ALTER PROCEDURE API_Admin_DeleteField
    @ApiCode   VARCHAR(100),
    @FieldCode VARCHAR(100)
AS
BEGIN
    DECLARE @ApiID INT, @FieldID INT;
    SELECT @ApiID = ApiID FROM API_Definition WHERE ApiCode = @ApiCode;
    SELECT @FieldID = FieldID FROM API_Field WHERE ApiID = @ApiID AND FieldCode = @FieldCode;
    
    IF @FieldID IS NOT NULL
    BEGIN
        DELETE FROM API_Action_Field WHERE FieldID = @FieldID;
        DELETE FROM API_Field WHERE FieldID = @FieldID;
    END
END
GO

-- 5. LƯU BỘ LỌC (FILTER)
CREATE OR ALTER PROCEDURE API_Admin_SaveFilter
    @ApiCode         VARCHAR(100),
    @FieldCode       VARCHAR(100),
    @FieldName       NVARCHAR(200),
    @DataType        VARCHAR(20),
    @ControlType     VARCHAR(50),
    @DataSourceType  VARCHAR(50),
    @DataSourceValue NVARCHAR(MAX),
    @IsRequired      BIT,
    @OrderIndex      INT
AS
BEGIN
    DECLARE @ApiID INT;
    SELECT @ApiID = ApiID FROM API_Definition WHERE ApiCode = @ApiCode;
    IF @ApiID IS NULL RETURN;

    IF EXISTS (SELECT 1 FROM API_Filter WHERE ApiID = @ApiID AND FieldCode = @FieldCode)
    BEGIN
        UPDATE API_Filter SET
            FieldName = @FieldName,
            DataType = @DataType,
            ControlType = @ControlType,
            DataSourceType = @DataSourceType,
            DataSourceValue = @DataSourceValue,
            IsRequired = @IsRequired,
            OrderIndex = @OrderIndex
        WHERE ApiID = @ApiID AND FieldCode = @FieldCode;
    END
    ELSE
    BEGIN
        INSERT INTO API_Filter (ApiID, FieldCode, FieldName, DataType, ControlType, DataSourceType, DataSourceValue, IsRequired, OrderIndex)
        VALUES (@ApiID, @FieldCode, @FieldName, @DataType, @ControlType, @DataSourceType, @DataSourceValue, @IsRequired, @OrderIndex);
    END
END
GO

-- 6. XÓA BỘ LỌC
CREATE OR ALTER PROCEDURE API_Admin_DeleteFilter
    @ApiCode   VARCHAR(100),
    @FieldCode VARCHAR(100)
AS
BEGIN
    DECLARE @ApiID INT;
    SELECT @ApiID = ApiID FROM API_Definition WHERE ApiCode = @ApiCode;
    DELETE FROM API_Filter WHERE ApiID = @ApiID AND FieldCode = @FieldCode;
END
GO

-- 7. LƯU ACTION
CREATE OR ALTER PROCEDURE API_Admin_SaveAction
    @ApiCode       VARCHAR(100),
    @ActionCode    VARCHAR(50),
    @ActionName    NVARCHAR(200),
    @ExecutionType VARCHAR(20),
    @IsConfirm     BIT,
    @IsDefault     BIT,
    @OrderIndex    INT
AS
BEGIN
    DECLARE @ApiID INT;
    SELECT @ApiID = ApiID FROM API_Definition WHERE ApiCode = @ApiCode;
    IF @ApiID IS NULL RETURN;

    IF EXISTS (SELECT 1 FROM API_Action WHERE ApiID = @ApiID AND ActionCode = @ActionCode)
    BEGIN
        UPDATE API_Action SET
            ActionName = @ActionName,
            ExecutionType = @ExecutionType,
            IsConfirm = @IsConfirm,
            IsDefault = @IsDefault,
            OrderIndex = @OrderIndex
        WHERE ApiID = @ApiID AND ActionCode = @ActionCode;
    END
    ELSE
    BEGIN
        INSERT INTO API_Action (ApiID, ActionCode, ActionName, ExecutionType, IsConfirm, IsDefault, OrderIndex)
        VALUES (@ApiID, @ActionCode, @ActionName, @ExecutionType, @IsConfirm, @IsDefault, @OrderIndex);
    END
END
GO

-- 8. XÓA ACTION
CREATE OR ALTER PROCEDURE API_Admin_DeleteAction
    @ApiCode    VARCHAR(100),
    @ActionCode VARCHAR(50)
AS
BEGIN
    DECLARE @ApiID INT, @ActionID INT;
    SELECT @ApiID = ApiID FROM API_Definition WHERE ApiCode = @ApiCode;
    SELECT @ActionID = ActionID FROM API_Action WHERE ApiID = @ApiID AND ActionCode = @ActionCode;

    IF @ActionID IS NOT NULL
    BEGIN
        DELETE FROM API_Action_Field WHERE ActionID = @ActionID;
        DELETE FROM API_Action WHERE ActionID = @ActionID;
    END
END
GO

-- 9. XÓA TOÀN BỘ MODULE
CREATE OR ALTER PROCEDURE API_Admin_DeleteModule
    @ApiCode VARCHAR(100)
AS
BEGIN
    DECLARE @ApiID INT;
    SELECT @ApiID = ApiID FROM API_Definition WHERE ApiCode = @ApiCode;

    IF @ApiID IS NOT NULL
    BEGIN
        DELETE FROM API_Action_Field WHERE ActionID IN (SELECT ActionID FROM API_Action WHERE ApiID = @ApiID);
        DELETE FROM API_Action WHERE ApiID = @ApiID;
        DELETE FROM API_Field  WHERE ApiID = @ApiID;
        DELETE FROM API_Filter WHERE ApiID = @ApiID;
        DELETE FROM API_Bulk_Config WHERE ApiID = @ApiID;
        DELETE FROM API_Definition WHERE ApiID = @ApiID;
    END
END
GO

PRINT N'✅ Đã cài đặt các Stored Procedures hỗ trợ Admin';
GO
