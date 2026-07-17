/* P1-02: versioned metadata contract. Safe to run repeatedly. */
SET NOCOUNT ON;
SET XACT_ABORT ON;

IF OBJECT_ID('dbo.API_Definition', 'U') IS NULL OR OBJECT_ID('dbo.API_Field', 'U') IS NULL
    THROW 51220, N'API metadata tables are missing.', 1;

IF COL_LENGTH('dbo.API_Definition', 'ContractVersion') IS NULL
    ALTER TABLE dbo.API_Definition ADD ContractVersion VARCHAR(40) NULL;
IF COL_LENGTH('dbo.API_Definition', 'ContractChecksum') IS NULL
    ALTER TABLE dbo.API_Definition ADD ContractChecksum VARCHAR(64) NULL;
IF COL_LENGTH('dbo.API_Definition', 'ContractUpdatedAt') IS NULL
    ALTER TABLE dbo.API_Definition ADD ContractUpdatedAt DATETIME2(0) NULL;
IF COL_LENGTH('dbo.API_Definition', 'ContractUpdatedBy') IS NULL
    ALTER TABLE dbo.API_Definition ADD ContractUpdatedBy VARCHAR(100) NULL;

IF COL_LENGTH('dbo.API_Field', 'SourceOfTruth') IS NULL
    ALTER TABLE dbo.API_Field ADD SourceOfTruth VARCHAR(30) NULL;
IF COL_LENGTH('dbo.API_Field', 'ValidationRule') IS NULL
    ALTER TABLE dbo.API_Field ADD ValidationRule NVARCHAR(500) NULL;

IF OBJECT_ID('dbo.API_Filter', 'U') IS NOT NULL
BEGIN
    IF COL_LENGTH('dbo.API_Filter', 'SourceOfTruth') IS NULL
        ALTER TABLE dbo.API_Filter ADD SourceOfTruth VARCHAR(30) NULL;
    IF COL_LENGTH('dbo.API_Filter', 'ValidationRule') IS NULL
        ALTER TABLE dbo.API_Filter ADD ValidationRule NVARCHAR(500) NULL;
END;

IF OBJECT_ID('dbo.API_Metadata_Field_Override', 'U') IS NOT NULL
BEGIN
    IF COL_LENGTH('dbo.API_Metadata_Field_Override', 'SourceOfTruth') IS NULL
        ALTER TABLE dbo.API_Metadata_Field_Override ADD SourceOfTruth VARCHAR(30) NULL;
    IF COL_LENGTH('dbo.API_Metadata_Field_Override', 'ValidationRule') IS NULL
        ALTER TABLE dbo.API_Metadata_Field_Override ADD ValidationRule NVARCHAR(500) NULL;
END;

GO

SET NOCOUNT ON;
SET XACT_ABORT ON;
BEGIN TRANSACTION;

UPDATE f
SET
    SourceOfTruth = CASE
        WHEN ISNULL(f.IsSystemParam, 0) = 1 THEN 'SERVER_MAPPING'
        WHEN NULLIF(f.DataSourceType, '') IS NOT NULL THEN 'DATASOURCE'
        WHEN NULLIF(f.DefaultValue, '') IS NOT NULL THEN 'STATIC_DEFAULT'
        ELSE 'USER_INPUT'
    END,
    ValidationRule = CASE
        WHEN LOWER(f.FieldCode) IN ('@tungay', '@denngay', '@fromdate', '@todate', '@startdate', '@enddate')
            OR LOWER(f.ControlType) = 'date' THEN N'ISO_DATE;RANGE_ORDER'
        WHEN LOWER(f.FieldCode) LIKE '%topn' THEN N'POSITIVE_INTEGER;MAX=200'
        WHEN LOWER(f.FieldCode) IN ('@page', '@pageindex') THEN N'POSITIVE_INTEGER;MAX=10000'
        WHEN LOWER(f.FieldCode) IN ('@pagesize', '@limit') THEN N'POSITIVE_INTEGER;MIN=1;MAX=200'
        WHEN LOWER(f.ControlType) = 'number' THEN N'NUMBER'
        WHEN NULLIF(f.OptionsJson, '') IS NOT NULL THEN N'ENUM_OPTIONS'
        WHEN LOWER(f.ControlType) = 'combobox' AND NULLIF(f.DataSourceType, '') IS NOT NULL THEN N'DATASOURCE_ID_IN_SCOPE'
        ELSE NULL
    END
FROM dbo.API_Field f;

/* Only requirements proven by current stored-procedure business contracts. */
UPDATE f
SET f.IsRequired = 1,
    f.SourceOfTruth = 'USER_INPUT',
    f.ValidationRule = CASE
        WHEN LOWER(f.ControlType) = 'combobox' THEN N'REQUIRED;DATASOURCE_ID_IN_SCOPE'
        ELSE N'REQUIRED;NON_EMPTY'
    END
FROM dbo.API_Field f
JOIN dbo.API_Definition d ON d.ApiID = f.ApiID
WHERE (d.ApiCode = '@cong_no_chi_tiet' AND f.FieldCode = '@MaKhachHang')
   OR (d.ApiCode = '@hoa_don_chi_tiet' AND f.FieldCode = '@DocumentID')
   OR (d.ApiCode = '@khao_sat360' AND f.FieldCode = '@ObjectID');

IF OBJECT_ID('dbo.API_Filter', 'U') IS NOT NULL
BEGIN
    UPDATE fl
    SET fl.IsRequired = f.IsRequired,
        fl.SourceOfTruth = f.SourceOfTruth,
        fl.ValidationRule = f.ValidationRule
    FROM dbo.API_Filter fl
    JOIN dbo.API_Field f ON f.ApiID = fl.ApiID AND f.FieldCode = fl.FieldCode;
END;

IF OBJECT_ID('dbo.API_Metadata_Field_Override', 'U') IS NOT NULL
BEGIN
    MERGE dbo.API_Metadata_Field_Override AS target
    USING (VALUES
        ('API_CongNoChiTiet_AI', '@MaKhachHang', 'USER_INPUT', N'REQUIRED;DATASOURCE_ID_IN_SCOPE'),
        ('API_HoaDonChiTiet_AI', '@DocumentID', 'USER_INPUT', N'REQUIRED;NON_EMPTY'),
        ('API_KhaoSat360_AI', '@ObjectID', 'USER_INPUT', N'REQUIRED;DATASOURCE_ID_IN_SCOPE')
    ) AS source (StoredProcedure, FieldCode, SourceOfTruth, ValidationRule)
    ON target.StoredProcedure = source.StoredProcedure AND target.FieldCode = source.FieldCode
    WHEN MATCHED THEN UPDATE SET
        IsRequired = 1, FilterIsRequired = 1,
        SourceOfTruth = source.SourceOfTruth, ValidationRule = source.ValidationRule
    WHEN NOT MATCHED THEN INSERT
        (StoredProcedure, FieldCode, IsRequired, FilterIsRequired, SourceOfTruth, ValidationRule)
        VALUES (source.StoredProcedure, source.FieldCode, 1, 1, source.SourceOfTruth, source.ValidationRule);
END;

;WITH ContractText AS (
    SELECT
        d.ApiID,
        STRING_AGG(CONVERT(NVARCHAR(MAX), CONCAT(
            f.FieldCode, ':', f.DataType, ':', f.IsRequired, ':',
            ISNULL(f.DefaultValue, ''), ':', ISNULL(f.SourceOfTruth, ''), ':',
            ISNULL(f.ValidationRule, '')
        )), '|') WITHIN GROUP (ORDER BY f.OrderIndex, f.FieldCode) AS CanonicalContract
    FROM dbo.API_Definition d
    LEFT JOIN dbo.API_Field f ON f.ApiID = d.ApiID
    WHERE d.IsActive = 1
    GROUP BY d.ApiID
)
UPDATE d
SET d.ContractVersion = '2026.07.15.1',
    d.ContractChecksum = CONVERT(VARCHAR(64), HASHBYTES('SHA2_256', ISNULL(c.CanonicalContract, '')), 2),
    d.ContractUpdatedAt = SYSUTCDATETIME(),
    d.ContractUpdatedBy = 'Codex:P1-02'
FROM dbo.API_Definition d
JOIN ContractText c ON c.ApiID = d.ApiID;

EXEC(N'
ALTER PROCEDURE dbo.API_GetConfig
    @ApiCode VARCHAR(100)
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @ApiID INT;
    SELECT TOP 1 @ApiID = ApiID FROM dbo.API_Definition
    WHERE ApiCode = @ApiCode OR ApiCode = ''@'' + REPLACE(@ApiCode, ''@'', '''');

    IF @ApiID IS NULL
    BEGIN
        SELECT FieldCode = ''@Invalid'', FieldName = N''Không tìm thấy cấu hình.'', IsRequired = 0;
        RETURN;
    END;

    SELECT
        f.FieldCode,
        FieldName = ISNULL(f.FieldName, REPLACE(f.FieldCode, ''@'', '''')),
        f.Placeholder,
        IsRequired = ISNULL(f.IsRequired, 0),
        f.DataType,
        f.ControlType,
        f.DefaultValue,
        f.OrderIndex,
        IsSystemParam = ISNULL(f.IsSystemParam, 0),
        f.DataSourceType,
        f.DataSourceValue,
        f.SourceOfTruth,
        f.ValidationRule,
        d.UiTemplate,
        d.ContractVersion,
        d.ContractChecksum,
        UpdatedAt = d.ContractUpdatedAt,
        UpdatedBy = d.ContractUpdatedBy
    FROM dbo.API_Field f
    JOIN dbo.API_Definition d ON d.ApiID = f.ApiID
    WHERE f.ApiID = @ApiID
    ORDER BY f.OrderIndex, f.FieldCode;
END');

COMMIT TRANSACTION;

SELECT
    ActiveContractCount = SUM(CASE WHEN IsActive = 1 AND ContractVersion IS NOT NULL THEN 1 ELSE 0 END),
    MissingVersionCount = SUM(CASE WHEN IsActive = 1 AND ContractVersion IS NULL THEN 1 ELSE 0 END),
    ContractVersion = MAX(ContractVersion)
FROM dbo.API_Definition;

SELECT d.ApiCode, f.FieldCode, f.IsRequired, f.DataType, f.SourceOfTruth, f.ValidationRule,
       d.ContractVersion, d.ContractChecksum
FROM dbo.API_Definition d
JOIN dbo.API_Field f ON f.ApiID = d.ApiID
WHERE d.IsActive = 1
ORDER BY d.ApiCode, f.OrderIndex, f.FieldCode;
