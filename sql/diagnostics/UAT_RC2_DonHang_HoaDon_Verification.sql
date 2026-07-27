USE medtest;
GO

/*
    READ-ONLY verification for the two RC2 procedures imported manually:
      - dbo.API_DonHang_AI
      - dbo.API_HoaDon_AI

    This script changes no data and executes neither business procedure.
*/
SET NOCOUNT ON;

SELECT
    N'DATABASE_TARGET' AS CheckCode,
    DB_NAME() AS ActualDatabase,
    N'medtest' AS ExpectedDatabase,
    CASE WHEN DB_NAME() = N'medtest' THEN N'PASS' ELSE N'FAIL' END AS Status,
    SUSER_SNAME() AS ExecutedBy,
    SYSUTCDATETIME() AS CheckedAtUtc;

DECLARE @ExpectedObjects TABLE (
    ObjectName SYSNAME NOT NULL PRIMARY KEY,
    ApiCode VARCHAR(100) NOT NULL
);

INSERT INTO @ExpectedObjects (ObjectName, ApiCode)
VALUES
    (N'API_DonHang_AI', '@don_hang'),
    (N'API_HoaDon_AI', '@hoa_don');

SELECT
    e.ObjectName,
    e.ApiCode,
    o.type_desc AS ObjectType,
    o.modify_date AS ModifyDate,
    CASE
        WHEN o.object_id IS NULL THEN N'FAIL_MISSING'
        WHEN OBJECT_DEFINITION(o.object_id) IS NULL THEN N'FAIL_NO_DEFINITION'
        ELSE N'PASS'
    END AS DefinitionStatus,
    CONVERT(
        VARCHAR(64),
        HASHBYTES('SHA2_256', CONVERT(VARBINARY(MAX), COALESCE(OBJECT_DEFINITION(o.object_id), N''))),
        2
    ) AS DatabaseDefinitionSha256
FROM @ExpectedObjects e
LEFT JOIN sys.objects o
    ON o.schema_id = SCHEMA_ID(N'dbo')
   AND o.name = e.ObjectName
ORDER BY e.ObjectName;

SELECT
    e.ObjectName,
    required.ParameterName,
    p.name AS ActualParameter,
    CASE WHEN p.parameter_id IS NULL THEN N'FAIL_MISSING' ELSE N'PASS' END AS Status
FROM @ExpectedObjects e
CROSS APPLY (
    SELECT ParameterName
    FROM (VALUES
        (N'API_DonHang_AI', N'@Username'),
        (N'API_DonHang_AI', N'@TuNgay'),
        (N'API_DonHang_AI', N'@DenNgay'),
        (N'API_DonHang_AI', N'@MaKhachHang'),
        (N'API_DonHang_AI', N'@timkiem'),
        (N'API_DonHang_AI', N'@SYSBranchID'),
        (N'API_DonHang_AI', N'@SYSEmployeeID'),
        (N'API_HoaDon_AI', N'@Username'),
        (N'API_HoaDon_AI', N'@TuNgay'),
        (N'API_HoaDon_AI', N'@DenNgay'),
        (N'API_HoaDon_AI', N'@MaKhachHang'),
        (N'API_HoaDon_AI', N'@timkiem')
    ) v(ObjectName, ParameterName)
    WHERE v.ObjectName = e.ObjectName
) required
LEFT JOIN sys.parameters p
    ON p.object_id = OBJECT_ID(N'dbo.' + e.ObjectName)
   AND p.name = required.ParameterName
ORDER BY e.ObjectName, required.ParameterName;

SELECT
    N'API_DonHang_AI' AS ObjectName,
    N'BRACKET_SUBSTRING_GUARD' AS CheckCode,
    CASE
        WHEN OBJECT_DEFINITION(OBJECT_ID(N'dbo.API_DonHang_AI')) LIKE N'%@BracketClose > @BracketOpen%'
            THEN N'PASS'
        ELSE N'FAIL'
    END AS Status
UNION ALL
SELECT
    N'API_HoaDon_AI',
    N'TEMP_TABLE_GUARD',
    CASE
        WHEN OBJECT_DEFINITION(OBJECT_ID(N'dbo.API_HoaDon_AI')) LIKE N'%OBJECT_ID(''tempdb..#BC'') IS NOT NULL%'
            THEN N'PASS'
        ELSE N'FAIL'
    END;

IF OBJECT_ID(N'dbo.API_Definition', N'U') IS NULL
BEGIN
    SELECT
        N'API_METADATA' AS CheckCode,
        N'FAIL_API_DEFINITION_MISSING' AS Status,
        CAST(NULL AS VARCHAR(100)) AS ApiCode,
        CAST(NULL AS SYSNAME) AS StoredProcedure;
END
ELSE
BEGIN
    SELECT
        N'API_METADATA' AS CheckCode,
        CASE
            WHEN d.ApiCode IS NULL THEN N'FAIL_MISSING'
            WHEN ISNULL(d.IsActive, 0) <> 1 THEN N'FAIL_INACTIVE'
            WHEN d.StoredProcedure <> e.ObjectName THEN N'FAIL_WRONG_PROCEDURE'
            ELSE N'PASS'
        END AS Status,
        e.ApiCode,
        d.StoredProcedure
    FROM @ExpectedObjects e
    LEFT JOIN dbo.API_Definition d ON d.ApiCode = e.ApiCode
    ORDER BY e.ApiCode;
END;

SELECT
    N'VERIFICATION_SUMMARY' AS CheckCode,
    CASE
        WHEN DB_NAME() <> N'medtest' THEN N'FAIL_WRONG_DATABASE'
        WHEN OBJECT_ID(N'dbo.API_DonHang_AI', N'P') IS NULL THEN N'FAIL_DON_HANG_MISSING'
        WHEN OBJECT_ID(N'dbo.API_HoaDon_AI', N'P') IS NULL THEN N'FAIL_HOA_DON_MISSING'
        WHEN OBJECT_DEFINITION(OBJECT_ID(N'dbo.API_DonHang_AI')) NOT LIKE N'%@BracketClose > @BracketOpen%' THEN N'FAIL_DON_HANG_OLD_DEFINITION'
        WHEN OBJECT_DEFINITION(OBJECT_ID(N'dbo.API_HoaDon_AI')) NOT LIKE N'%OBJECT_ID(''tempdb..#BC'') IS NOT NULL%' THEN N'FAIL_HOA_DON_OLD_DEFINITION'
        ELSE N'PASS_SOURCE_MARKERS'
    END AS Status,
    N'API metadata results above must also be PASS before closing the two-file verification.' AS Note;
GO

