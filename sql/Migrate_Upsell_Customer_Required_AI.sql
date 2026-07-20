SET XACT_ABORT ON;
BEGIN TRANSACTION;

DECLARE @ApiID INT;
DECLARE @FieldID INT;

SELECT @ApiID = ApiID
FROM dbo.API_Definition
WHERE ApiCode = '@upsell_goi_y'
  AND StoredProcedure = 'API_UpsellGoiY_AI';

IF @ApiID IS NULL
    THROW 51000, 'Missing API definition for @upsell_goi_y.', 1;

SELECT @FieldID = FieldID
FROM dbo.API_Field
WHERE ApiID = @ApiID
  AND FieldCode = '@MaKhachHang';

IF @FieldID IS NULL
    THROW 51000, 'Missing @MaKhachHang field metadata for @upsell_goi_y.', 1;

UPDATE dbo.API_Field
SET IsRequired = 1,
    SourceOfTruth = 'USER_INPUT',
    ValidationRule = N'REQUIRED;DATASOURCE_ID_IN_SCOPE',
    Placeholder = N'Chọn khách hàng cần gợi ý bán kèm'
WHERE FieldID = @FieldID;

UPDATE dbo.API_Action_Field
SET IsRequired = 1
WHERE FieldID = @FieldID;

IF OBJECT_ID('dbo.API_Filter', 'U') IS NOT NULL
BEGIN
    UPDATE dbo.API_Filter
    SET IsRequired = 1,
        SourceOfTruth = 'USER_INPUT',
        ValidationRule = N'REQUIRED;DATASOURCE_ID_IN_SCOPE',
        Placeholder = N'Chọn khách hàng cần gợi ý bán kèm'
    WHERE ApiID = @ApiID
      AND FieldCode = '@MaKhachHang';
END;

MERGE dbo.API_Metadata_Field_Override AS target
USING (VALUES (
    'API_UpsellGoiY_AI',
    '@MaKhachHang',
    N'Khách hàng',
    'combobox',
    CAST(1 AS BIT),
    'APICODE',
    N'@danh_muc|@Type=khachhang|@timkiem={q}',
    CAST(1 AS BIT),
    'USER_INPUT',
    N'REQUIRED;DATASOURCE_ID_IN_SCOPE'
)) AS source (
    StoredProcedure, FieldCode, FieldName, ControlType, IsRequired,
    DataSourceType, DataSourceValue, FilterIsRequired, SourceOfTruth, ValidationRule
)
ON target.StoredProcedure = source.StoredProcedure
AND target.FieldCode = source.FieldCode
WHEN MATCHED THEN UPDATE SET
    FieldName = source.FieldName,
    ControlType = source.ControlType,
    IsRequired = source.IsRequired,
    DataSourceType = source.DataSourceType,
    DataSourceValue = source.DataSourceValue,
    FilterIsRequired = source.FilterIsRequired,
    SourceOfTruth = source.SourceOfTruth,
    ValidationRule = source.ValidationRule
WHEN NOT MATCHED THEN INSERT (
    StoredProcedure, FieldCode, FieldName, ControlType, IsRequired,
    DataSourceType, DataSourceValue, FilterIsRequired, SourceOfTruth, ValidationRule
)
VALUES (
    source.StoredProcedure, source.FieldCode, source.FieldName, source.ControlType,
    source.IsRequired, source.DataSourceType, source.DataSourceValue,
    source.FilterIsRequired, source.SourceOfTruth, source.ValidationRule
);

COMMIT TRANSACTION;

SELECT
    d.ApiCode,
    f.FieldCode,
    f.IsRequired,
    f.ControlType,
    f.DataSourceType,
    f.DataSourceValue,
    f.SourceOfTruth,
    f.ValidationRule
FROM dbo.API_Definition d
JOIN dbo.API_Field f ON f.ApiID = d.ApiID
WHERE d.ApiCode = '@upsell_goi_y'
  AND f.FieldCode = '@MaKhachHang';
GO
