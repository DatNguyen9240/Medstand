USE medtest;
GO

/*
    READ-ONLY discovery pack for Business Rule v1.
    Purpose: discover real schema/meaning before changing production formulas.
    This script is metadata/data read-only. It never changes schema, data,
    procedure state, or rule activation.
*/
SET NOCOUNT ON;

SELECT DB_NAME() AS DatabaseName, SUSER_SNAME() AS ExecutedBy, SYSUTCDATETIME() AS CheckedAtUtc;

/* 1. Candidate tables/views for each unresolved contract dependency. */
SELECT
    s.name AS SchemaName,
    o.name AS ObjectName,
    o.type_desc AS ObjectType,
    o.create_date,
    o.modify_date
FROM sys.objects o
JOIN sys.schemas s ON s.schema_id = o.schema_id
WHERE o.name LIKE '%Invoice%'
   OR o.name LIKE '%Return%'
   OR o.name LIKE '%Adjust%'
   OR o.name LIKE '%Stock%'
   OR o.name LIKE '%Reserv%'
   OR o.name LIKE '%Block%'
   OR o.name LIKE '%Visit%'
   OR o.name LIKE '%CheckIn%'
   OR o.name LIKE '%Program%'
   OR o.name LIKE '%Promotion%'
   OR o.name LIKE '%StoreHouse%'
   OR o.name LIKE '%Warehouse%'
ORDER BY o.type_desc, s.name, o.name;

/* 2. Candidate columns for invoice status, VAT/net/gross and adjustments. */
SELECT
    s.name AS SchemaName,
    t.name AS TableName,
    c.name AS ColumnName,
    ty.name AS DataType,
    c.max_length,
    c.is_nullable
FROM sys.tables t
JOIN sys.schemas s ON s.schema_id = t.schema_id
JOIN sys.columns c ON c.object_id = t.object_id
JOIN sys.types ty ON ty.user_type_id = c.user_type_id
WHERE (
       t.name LIKE '%Invoice%'
    OR t.name LIKE '%Return%'
    OR t.name LIKE '%Adjust%'
    OR t.name LIKE '%Order%'
    OR t.name LIKE '%Stock%'
    OR t.name LIKE '%Program%'
    OR t.name LIKE '%Promotion%'
)
AND (
       c.name LIKE '%Status%'
    OR c.name LIKE '%VAT%'
    OR c.name LIKE '%Tax%'
    OR c.name LIKE '%Net%'
    OR c.name LIKE '%Gross%'
    OR c.name LIKE '%Amount%'
    OR c.name LIKE '%Total%'
    OR c.name LIKE '%Adjust%'
    OR c.name LIKE '%Return%'
    OR c.name LIKE '%Reservation%'
    OR c.name LIKE '%Reserve%'
    OR c.name LIKE '%Block%'
    OR c.name LIKE '%Damage%'
    OR c.name LIKE '%Expire%'
    OR c.name LIKE '%Update%'
    OR c.name LIKE '%Modified%'
    OR c.name LIKE '%Date%'
)
ORDER BY s.name, t.name, c.column_id;

/* 3. Status dictionary evidence. Meanings are intentionally not inferred. */
IF OBJECT_ID(N'dbo.AR_InvoiceTbl', N'U') IS NOT NULL
BEGIN
    SELECT
        'STATUS_DICTIONARY_REQUIRED' AS EvidenceCode,
        StatusID,
        COUNT_BIG(*) AS InvoiceCount,
        MIN(DocumentDate) AS FirstDocumentDate,
        MAX(DocumentDate) AS LastDocumentDate
    FROM dbo.AR_InvoiceTbl WITH (NOLOCK)
    GROUP BY StatusID
    ORDER BY StatusID;
END
ELSE
    SELECT 'STATUS_DICTIONARY_REQUIRED' AS EvidenceCode, 'AR_InvoiceTbl missing' AS Note;

/* 3b. Explicit nullable column probes for the most important contracts. */
SELECT
    'AR_InvoiceTbl.StatusID' AS ColumnProbe,
    COL_LENGTH(N'dbo.AR_InvoiceTbl', N'StatusID') AS ColumnLength,
    CASE WHEN COL_LENGTH(N'dbo.AR_InvoiceTbl', N'StatusID') IS NULL THEN 'MISSING_OR_UNCONFIRMED' ELSE 'PRESENT' END AS ProbeStatus
UNION ALL
SELECT
    'AR_InvoiceTbl.TotalAmount',
    COL_LENGTH(N'dbo.AR_InvoiceTbl', N'TotalAmount'),
    CASE WHEN COL_LENGTH(N'dbo.AR_InvoiceTbl', N'TotalAmount') IS NULL THEN 'MISSING_OR_UNCONFIRMED' ELSE 'PRESENT' END;

/* 4. Candidate warehouse scope and user mappings. */
SELECT
    s.name AS SchemaName,
    t.name AS TableName,
    c.name AS ColumnName,
    ty.name AS DataType
FROM sys.tables t
JOIN sys.schemas s ON s.schema_id = t.schema_id
JOIN sys.columns c ON c.object_id = t.object_id
JOIN sys.types ty ON ty.user_type_id = c.user_type_id
WHERE (t.name LIKE '%User%' OR t.name LIKE '%StoreHouse%' OR t.name LIKE '%Warehouse%' OR t.name LIKE '%Branch%')
  AND (c.name LIKE '%User%' OR c.name LIKE '%Store%' OR c.name LIKE '%House%' OR c.name LIKE '%Warehouse%' OR c.name LIKE '%Branch%' OR c.name LIKE '%Role%')
ORDER BY s.name, t.name, c.column_id;

/* 5. Candidate check-in/visit sources and update timestamps. */
SELECT
    s.name AS SchemaName,
    o.name AS ObjectName,
    o.type_desc AS ObjectType,
    c.name AS ColumnName,
    ty.name AS DataType
FROM sys.objects o
JOIN sys.schemas s ON s.schema_id = o.schema_id
JOIN sys.columns c ON c.object_id = o.object_id
JOIN sys.types ty ON ty.user_type_id = c.user_type_id
WHERE (o.name LIKE '%Visit%' OR o.name LIKE '%CheckIn%' OR o.name LIKE '%Route%' OR o.name LIKE '%Ghe%')
  AND (c.name LIKE '%Object%' OR c.name LIKE '%Customer%' OR c.name LIKE '%Visit%' OR c.name LIKE '%Check%' OR c.name LIKE '%Date%' OR c.name LIKE '%Time%')
ORDER BY s.name, o.name, c.column_id;

/* 6. Candidate program approval/effective/stacking fields. */
SELECT
    s.name AS SchemaName,
    t.name AS TableName,
    c.name AS ColumnName,
    ty.name AS DataType
FROM sys.tables t
JOIN sys.schemas s ON s.schema_id = t.schema_id
JOIN sys.columns c ON c.object_id = t.object_id
JOIN sys.types ty ON ty.user_type_id = c.user_type_id
WHERE (t.name LIKE '%Promotion%' OR t.name LIKE '%Program%' OR t.name LIKE '%TrongTam%')
  AND (c.name LIKE '%Status%' OR c.name LIKE '%Active%' OR c.name LIKE '%Approve%' OR c.name LIKE '%Effective%' OR c.name LIKE '%FromDate%' OR c.name LIKE '%ToDate%' OR c.name LIKE '%Stack%')
ORDER BY s.name, t.name, c.column_id;

/* 7. Current deployed procedure definitions and checksums. */
SELECT
    o.name AS ObjectName,
    o.object_id,
    o.modify_date,
    CASE WHEN OBJECT_DEFINITION(o.object_id) IS NULL THEN 'MISSING_OR_NOT_A_MODULE' ELSE 'FOUND' END AS DefinitionStatus,
    CONVERT(VARCHAR(64), HASHBYTES('SHA2_256', CONVERT(VARBINARY(MAX), COALESCE(OBJECT_DEFINITION(o.object_id), N''))), 2) AS DefinitionSha256,
    OBJECT_DEFINITION(o.object_id) AS DefinitionText
FROM sys.objects o
WHERE o.schema_id = SCHEMA_ID(N'dbo')
  AND o.name IN
  (
      N'API_DoanhSo_AI', N'API_DanhsachTonKho_AI', N'API_GoiYDonHang_AI',
      N'API_TuyenBanHang_AI', N'API_ChamDiemKH_AI', N'API_TichLuy_AI',
      N'API_UpsellGoiY_AI', N'API_DeXuatKhuyenMai_AI', N'AI_GetBusinessRuleConfig'
  )
ORDER BY o.name;

SELECT
    'STATUS_DICTIONARY_REQUIRED' AS EvidenceCode,
    'No semantic status mapping is inferred by this script. Business owner/ERP dictionary must map each observed StatusID.' AS RequiredAction;
GO
