-- ═══════════════════════════════════════════════════════════════════════════
-- Patch_API_GetConfig_ForJSON.sql
-- Cập nhật SP API_GetConfig để trả FiltersJSON + FieldsJSON (FOR JSON PATH)
-- Giải quyết: Panel filter không hiện dù đã có dữ liệu trong API_Filter
--
-- Nguyên nhân cũ: SP trả 4 resultset riêng → backend chỉ gói resultset 1
-- Giải pháp:      Trả 1 row duy nhất với FieldsJSON + FiltersJSON là JSON string
-- ═══════════════════════════════════════════════════════════════════════════
USE [medtest]
GO

IF OBJECT_ID('API_GetConfig','P') IS NOT NULL DROP PROCEDURE API_GetConfig;
GO

CREATE PROCEDURE API_GetConfig @ApiCode VARCHAR(100) = ''
AS
BEGIN
    SET NOCOUNT ON;

    -- Trả 1 row: info + FieldsJSON + FiltersJSON
    -- Frontend: JSON.parse(row.FiltersJSON) → mảng filter fields để render UI
    SELECT
        D.ApiID,
        D.ApiCode,
        D.ApiName,
        D.ApiDescription,
        D.StoredProcedure,
        D.Category,
        D.IconEmoji,
        A.ActionID,
        A.ActionCode,
        A.ExecutionType,   -- QUERY / CART / SINGLE / BULK
        A.IsConfirm,
        (
            -- Tất cả tham số SP (kể cả system params như @Username)
            SELECT
                F.FieldCode,
                F.FieldName,
                F.DataType,
                F.ControlType,
                F.IsRequired,
                F.IsSystemParam,
                F.DefaultValue,
                F.Placeholder,
                F.MinValue,
                F.MaxValue,
                F.OptionsJson,
                F.DataSourceType,
                F.DataSourceValue,
                F.OrderIndex
            FROM API_Field F
            WHERE F.ApiID = D.ApiID
            ORDER BY F.OrderIndex
            FOR JSON PATH
        ) AS FieldsJSON,
        (
            -- Filter fields hiện lên panel UI cho user điền trước khi execute
            SELECT
                FL.FieldCode,
                FL.FieldName,
                FL.DataType,
                FL.ControlType,
                FL.Operator,
                FL.DefaultValue,
                FL.Placeholder,
                FL.OptionsJson,
                FL.DataSourceType,
                FL.DataSourceValue,
                FL.IsRequired,
                FL.OrderIndex
            FROM API_Filter FL
            WHERE FL.ApiID = D.ApiID
            ORDER BY FL.OrderIndex
            FOR JSON PATH
        ) AS FiltersJSON
    FROM API_Definition D
    JOIN API_Action A ON A.ApiID = D.ApiID
        AND A.IsDefault = 1
        AND A.IsActive = 1
    WHERE D.ApiCode = @ApiCode
      AND D.IsActive = 1;
END
GO

PRINT N'✅ API_GetConfig đã cập nhật (FOR JSON PATH)';
GO

-- Kiểm tra ngay
-- EXEC API_GetConfig '@goi_y_don_hang';
-- EXEC API_GetConfig '@tra_cuu_san_pham';
-- EXEC API_GetConfig '@xem_don_hang';
