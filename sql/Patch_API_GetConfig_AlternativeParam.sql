-- ═══════════════════════════════════════════════════════════════════════════
-- Cập nhật API_GetConfig sử dụng @Code thay vì @ApiCode để tránh trùng keyword
-- ═══════════════════════════════════════════════════════════════════════════
USE [medtest]
GO

IF OBJECT_ID('API_GetConfig','P') IS NOT NULL DROP PROCEDURE API_GetConfig;
GO

CREATE PROCEDURE API_GetConfig 
    @Code VARCHAR(100) = '' -- Đổi tên từ @ApiCode sang @Code
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
            FROM API_Field F 
            WHERE F.ApiID = D.ApiID 
            ORDER BY F.OrderIndex 
            FOR JSON PATH
        ) AS FieldsJSON,
        (
            SELECT FL.FieldCode, FL.FieldName, FL.DataType, FL.ControlType,
                   FL.Operator, FL.DefaultValue, FL.Placeholder, FL.OptionsJson,
                   FL.DataSourceType, FL.DataSourceValue,
                   FL.IsRequired, FL.OrderIndex
            FROM API_Filter FL 
            WHERE FL.ApiID = D.ApiID 
            ORDER BY FL.OrderIndex 
            FOR JSON PATH
        ) AS FiltersJSON
    FROM API_Definition D
    JOIN API_Action A ON A.ApiID = D.ApiID AND A.IsDefault = 1 AND A.IsActive = 1
    WHERE D.ApiCode = @Code AND D.IsActive = 1; -- Dùng @Code lọc theo ApiCode
END
GO

PRINT N'✅ API_GetConfig đã cập nhật tham số @Code';
GO
