-- ═══════════════════════════════════════════════════════════════════════════
-- BƯỚC 1: SỬA ĐỔI THAM SỐ CỦA STORED PROCEDURE (Đổi thành @TargetApiCode)
-- ═══════════════════════════════════════════════════════════════════════════
USE [medtest]
GO

IF OBJECT_ID('API_GetConfig','P') IS NOT NULL DROP PROCEDURE API_GetConfig;
GO

CREATE PROCEDURE API_GetConfig 
    @TargetApiCode VARCHAR(100) = '' -- Tên biến duy nhất, không trùng hệ thống
AS
BEGIN
    SET NOCOUNT ON;
    
    SELECT 
        D.ApiID, D.ApiCode, D.ApiName, D.ApiDescription,
        D.StoredProcedure, D.Category, D.IconEmoji,
        A.ActionID, A.ActionCode, A.ExecutionType, A.IsConfirm,
        (
            SELECT F.FieldCode, F.FieldName, F.DataType, F.ControlType,
                   F.IsRequired, F.IsSystemParam, F.DefaultValue, F.Placeholder,
                   F.MinValue, F.MaxValue, F.OptionsJson,
                   F.DataSourceType, F.DataSourceValue, F.OrderIndex
            FROM API_Field F WHERE F.ApiID = D.ApiID 
            ORDER BY F.OrderIndex FOR JSON PATH
        ) AS FieldsJSON,
        (
            SELECT FL.FieldCode, FL.FieldName, FL.DataType, FL.ControlType,
                   FL.Operator, FL.DefaultValue, FL.Placeholder, FL.OptionsJson,
                   FL.DataSourceType, FL.DataSourceValue,
                   FL.IsRequired, FL.OrderIndex
            FROM API_Filter FL WHERE FL.ApiID = D.ApiID 
            ORDER BY FL.OrderIndex FOR JSON PATH
        ) AS FiltersJSON
    FROM API_Definition D
    JOIN API_Action A ON A.ApiID = D.ApiID AND A.IsDefault = 1 AND A.IsActive = 1
    WHERE D.ApiCode = @TargetApiCode AND D.IsActive = 1;
END
GO
PRINT N'✅ Đã cập nhật SP API_GetConfig với biến @TargetApiCode';
GO

-- ═══════════════════════════════════════════════════════════════════════════
-- BƯỚC 2: ĐĂNG KÝ THÀNH API CHÍNH THỨC CỦA HỆ THỐNG
-- ═══════════════════════════════════════════════════════════════════════════
DECLARE @OldApiID INT;
SELECT @OldApiID = ApiID FROM API_Definition WHERE ApiCode = '@system_get_config';

IF @OldApiID IS NOT NULL
BEGIN
    DELETE FROM API_Filter WHERE ApiID = @OldApiID;
    DELETE FROM API_Action_Field WHERE ActionID IN (SELECT ActionID FROM API_Action WHERE ApiID = @OldApiID);
    DELETE FROM API_Field WHERE ApiID = @OldApiID;
    DELETE FROM API_Action WHERE ApiID = @OldApiID;
    DELETE FROM API_Bulk_Config WHERE ApiID = @OldApiID;
    DELETE FROM API_Definition WHERE ApiID = @OldApiID;
END

INSERT INTO API_Definition (ApiCode, ApiName, ApiDescription, StoredProcedure, Category, IconEmoji, IsActive, OrderIndex)
VALUES ('@system_get_config', N'Lấy Metadata Cấu hình', N'API lấy config form từ frontend', 'API_GetConfig', N'System', '⚙️', 1, 999);

DECLARE @NewApiID INT = SCOPE_IDENTITY();

INSERT INTO API_Action (ApiID, ActionCode, ActionName, ExecutionType, IsDefault, IsConfirm, IsActive)
VALUES (@NewApiID, 'VIEW', N'Xem cấu hình', 'QUERY', 1, 0, 1);

-- Khai báo ĐÚNG tên parameter của bảng là @TargetApiCode
INSERT INTO API_Field (ApiID, FieldCode, FieldName, DataType, ControlType, IsRequired, IsSystemParam, OrderIndex)
VALUES (@NewApiID, '@TargetApiCode', N'Mã API Mục Tiêu', 'VARCHAR', 'text', 1, 0, 1);

PRINT N'✅ Đã đăng ký API @system_get_config với tham số @TargetApiCode!';
GO
