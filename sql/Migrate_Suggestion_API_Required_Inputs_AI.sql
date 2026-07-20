SET XACT_ABORT ON;
BEGIN TRANSACTION;

DECLARE @OrderApiID INT;
DECLARE @OrderCustomerFieldID INT;
DECLARE @DrugApiID INT;
DECLARE @DrugSearchFieldID INT;

SELECT @OrderApiID = ApiID
FROM dbo.API_Definition
WHERE ApiCode = '@goi_ydon_hang'
  AND StoredProcedure = 'API_GoiYDonHang_AI';

SELECT @DrugApiID = ApiID
FROM dbo.API_Definition
WHERE ApiCode = '@goi_ydon_thuoc'
  AND StoredProcedure = 'API_GoiYDonThuoc_AI';

IF @OrderApiID IS NULL THROW 51000, 'Missing API definition for @goi_ydon_hang.', 1;
IF @DrugApiID IS NULL THROW 51000, 'Missing API definition for @goi_ydon_thuoc.', 1;

SELECT @OrderCustomerFieldID = FieldID
FROM dbo.API_Field
WHERE ApiID = @OrderApiID AND FieldCode = '@MaKhachHang';

SELECT @DrugSearchFieldID = FieldID
FROM dbo.API_Field
WHERE ApiID = @DrugApiID AND FieldCode = '@timkiem';

IF @OrderCustomerFieldID IS NULL THROW 51000, 'Missing @MaKhachHang metadata for @goi_ydon_hang.', 1;
IF @DrugSearchFieldID IS NULL THROW 51000, 'Missing @timkiem metadata for @goi_ydon_thuoc.', 1;

UPDATE dbo.API_Field
SET IsRequired = 1,
    FieldName = N'Khách hàng',
    ControlType = 'combobox',
    DataSourceType = 'APICODE',
    DataSourceValue = N'@danh_muc|@Type=khachhang|@timkiem={q}',
    SourceOfTruth = 'USER_INPUT',
    ValidationRule = N'REQUIRED;DATASOURCE_ID_IN_SCOPE',
    Placeholder = N'Chọn khách hàng cần gợi ý đơn hàng'
WHERE FieldID = @OrderCustomerFieldID;

UPDATE dbo.API_Field
SET IsRequired = 1,
    FieldName = N'Sản phẩm gốc',
    ControlType = 'combobox',
    DataSourceType = 'APICODE',
    DataSourceValue = N'@danh_muc|@Type=sanpham|@timkiem={q}',
    SourceOfTruth = 'USER_INPUT',
    ValidationRule = N'REQUIRED;MIN_LENGTH=2',
    Placeholder = N'Chọn sản phẩm gốc hoặc nhập tên sản phẩm'
WHERE FieldID = @DrugSearchFieldID;

UPDATE dbo.API_Action_Field
SET IsRequired = 1
WHERE FieldID IN (@OrderCustomerFieldID, @DrugSearchFieldID);

IF OBJECT_ID('dbo.API_Filter', 'U') IS NOT NULL
BEGIN
    UPDATE dbo.API_Filter
    SET IsRequired = 1,
        SourceOfTruth = 'USER_INPUT',
        ValidationRule = CASE WHEN ApiID = @OrderApiID
                              THEN N'REQUIRED;DATASOURCE_ID_IN_SCOPE'
                              ELSE N'REQUIRED;MIN_LENGTH=2' END,
        Placeholder = CASE WHEN ApiID = @OrderApiID
                           THEN N'Chọn khách hàng cần gợi ý đơn hàng'
                           ELSE N'Chọn sản phẩm gốc hoặc nhập tên sản phẩm' END
    WHERE (ApiID = @OrderApiID AND FieldCode = '@MaKhachHang')
       OR (ApiID = @DrugApiID AND FieldCode = '@timkiem');
END;

IF OBJECT_ID('dbo.API_Metadata_Field_Override', 'U') IS NOT NULL
BEGIN
    MERGE dbo.API_Metadata_Field_Override AS target
    USING (VALUES
        ('API_GoiYDonHang_AI', '@MaKhachHang', N'Khách hàng', 'combobox', CAST(1 AS BIT), 'APICODE', N'@danh_muc|@Type=khachhang|@timkiem={q}', CAST(1 AS BIT), 'USER_INPUT', N'REQUIRED;DATASOURCE_ID_IN_SCOPE'),
        ('API_GoiYDonThuoc_AI', '@timkiem', N'Sản phẩm gốc', 'combobox', CAST(1 AS BIT), 'APICODE', N'@danh_muc|@Type=sanpham|@timkiem={q}', CAST(1 AS BIT), 'USER_INPUT', N'REQUIRED;MIN_LENGTH=2')
    ) AS source (
        StoredProcedure, FieldCode, FieldName, ControlType, IsRequired,
        DataSourceType, DataSourceValue, FilterIsRequired, SourceOfTruth, ValidationRule
    )
    ON target.StoredProcedure = source.StoredProcedure AND target.FieldCode = source.FieldCode
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
    ) VALUES (
        source.StoredProcedure, source.FieldCode, source.FieldName, source.ControlType,
        source.IsRequired, source.DataSourceType, source.DataSourceValue,
        source.FilterIsRequired, source.SourceOfTruth, source.ValidationRule
    );
END;

COMMIT TRANSACTION;
GO
