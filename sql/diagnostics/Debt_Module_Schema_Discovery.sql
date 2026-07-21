USE medtest;
GO

/*
  Read-only metadata and definition discovery for the debt module.
  Run on the test database. No data or schema mutation is performed.
*/
SET NOCOUNT ON;

IF DB_NAME() <> N'medtest'
    THROW 51000, 'Debt diagnostics are restricted to the medtest database.', 1;

SELECT
    DB_NAME() AS DatabaseName,
    SUSER_SNAME() AS ExecutedBy,
    SYSUTCDATETIME() AS CheckedAtUtc;

SELECT
    s.name AS SchemaName,
    o.name AS ObjectName,
    o.type_desc AS ObjectType,
    o.modify_date AS ModifyDate
FROM sys.objects o
JOIN sys.schemas s ON s.schema_id = o.schema_id
WHERE o.name IN
(
    N'API_CongNoKhachHang_AI',
    N'API_CongNoChiTiet_AI',
    N'vCongNoBanHang',
    N'SY_GetDebitDocFnc',
    N'CF_ObjectTbl',
    N'AR_InvoiceTbl',
    N'AR_InvoiceStatusTbl'
)
ORDER BY s.name, o.name;

SELECT
    s.name AS SchemaName,
    t.name AS TableName,
    c.column_id,
    c.name AS ColumnName,
    ty.name AS DataType,
    c.max_length,
    c.is_nullable
FROM sys.tables t
JOIN sys.schemas s ON s.schema_id = t.schema_id
JOIN sys.columns c ON c.object_id = t.object_id
JOIN sys.types ty ON ty.user_type_id = c.user_type_id
WHERE t.name IN
(
    N'CF_ObjectTbl',
    N'AR_InvoiceTbl',
    N'AR_InvoiceStatusTbl',
    N'SY_User'
)
ORDER BY t.name, c.column_id;

SELECT
    o.name AS ObjectName,
    CASE WHEN OBJECT_DEFINITION(o.object_id) IS NULL THEN N'MISSING' ELSE N'FOUND' END AS DefinitionStatus,
    CONVERT(VARCHAR(64), HASHBYTES('SHA2_256', CONVERT(VARBINARY(MAX), COALESCE(OBJECT_DEFINITION(o.object_id), N''))), 2) AS DefinitionSha256,
    OBJECT_DEFINITION(o.object_id) AS DefinitionText
FROM sys.objects o
WHERE o.name IN
(
    N'API_CongNoKhachHang_AI',
    N'API_CongNoChiTiet_AI',
    N'vCongNoBanHang',
    N'SY_GetDebitDocFnc'
)
ORDER BY o.name;

SELECT
    c.name AS ColumnName,
    ty.name AS DataType
FROM sys.columns c
JOIN sys.types ty ON ty.user_type_id = c.user_type_id
WHERE c.object_id = OBJECT_ID(N'dbo.CF_ObjectTbl')
  AND c.name IN
  (
      N'ObjectID', N'ObjectName', N'isCustomer', N'isEmployee',
      N'ObjectType', N'BranchID', N'Phone', N'EmployeeID'
  )
ORDER BY c.column_id;
