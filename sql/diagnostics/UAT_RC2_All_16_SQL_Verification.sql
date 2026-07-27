USE medtest;
GO

/*
    READ-ONLY verification for MEDSTAND-UAT-20260727-11.110-RC2.

    Scope:
      - 15 stored procedures from the release manifest.
      - 1 metadata bootstrap result (dbo.API_Definition and generated API metadata).

    This script does not execute business procedures and changes no data.
    PASS_SOURCE_MARKERS proves that the expected RC2 fix markers are present in
    database definitions. It does not prove business-output correctness.
*/
SET NOCOUNT ON;

DECLARE @ExpectedDatabase SYSNAME = N'medtest';

DECLARE @ExpectedObjects TABLE (
    DeployOrder INT NOT NULL PRIMARY KEY,
    ObjectName SYSNAME NOT NULL,
    ApiCode VARCHAR(100) NOT NULL,
    MetadataProcedure SYSNAME NOT NULL,
    SourceFile NVARCHAR(400) NOT NULL,
    SourceFileSha256 CHAR(64) NOT NULL,
    RequiredMarker1 NVARCHAR(400) NULL,
    RequiredMarker2 NVARCHAR(400) NULL
);

INSERT INTO @ExpectedObjects
    (DeployOrder, ObjectName, ApiCode, MetadataProcedure, SourceFile, SourceFileSha256, RequiredMarker1, RequiredMarker2)
VALUES
    (1,  N'API_GoiYDonHang_AI',            '@goi_ydon_hang',       N'API_GoiYDonHang_AI',           N'sql/Module 1 - API_GoiYDonHang_AI.sql',                '61b859fd343af3930f63b74c3b582e770f0263bb9a375b9c9598747a8c786c19', N'OBJECT_ID(''tempdb..#AllowedObjects'') IS NOT NULL', N'@BracketClose > @BracketOpen'),
    (2,  N'API_SanPhamTrongTam_AI',         '@san_pham_trong_tam',  N'API_SanPhamTrongTam_AI',       N'sql/Module 10 - API_SanPhamTrongTam_AI.sql',           '3d297fb2585fe9befd57f50ebc839b13f1d4105d0eb088ef2c8ee9d3af5f90fa', N'OBJECT_ID(''tempdb..#FocusItems'') IS NOT NULL', NULL),
    (3,  N'API_TraCuuSanPham_AI',           '@tra_cuu_san_pham',    N'API_TraCuuSanPham_AI',         N'sql/Module 10 - API_TraCuuSanPham_AI.sql',             '4bd9a544c9c9c528538206d5790bcaae320160d345c2ef037a33b32ec05186e6', N'OBJECT_ID(''tempdb..#MatchedItems'') IS NOT NULL', N'OBJECT_ID(''tempdb..#FinalPrices'') IS NOT NULL'),
    (4,  N'API_TuyenBanHang_AI',            '@tuyen_ban_hang',      N'API_TuyenBanHang_AI',          N'sql/Module 2 - API_TuyenBanHang_AI.sql',               '43221682f047f5a599fe0deeed81e2d71653f751a31f4f0fa7b4ed1f96d2d394', N'OBJECT_ID(''tempdb..#AllowedObjects'') IS NOT NULL', N'@BracketClose > @BracketOpen'),
    (5,  N'API_ChamDiemKH_AI',              '@cham_diem_kh',        N'API_ChamDiemKH_AI',            N'sql/Module 3 - API_ChamDiemKH_AI.sql',                 '8ca6d2017971a28e0a242f4fd5ba892817ca9975c17c0cd31c5bb23961329157', N'OBJECT_ID(''tempdb..#AllowedObjects'') IS NOT NULL', N'OBJECT_ID(''tempdb..#Segmented'') IS NOT NULL'),
    (6,  N'API_TichLuy_AI',                 '@tich_luy',            N'API_TichLuy_AI',               N'sql/Module 4 - API_TichLuy_AI.sql',                    'ade58d5754b513bae92096860dcb1dc627ccb520d58785f119ba35da7c4d6cb8', N'OBJECT_ID(''tempdb..#TrongTam'') IS NOT NULL', N'OBJECT_ID(''tempdb..#ItemsBought'') IS NOT NULL'),
    (7,  N'API_UpsellGoiY_AI',              '@upsell_goi_y',        N'API_UpsellGoiY_AI',            N'sql/Module 5 - API_UpsellGoiY_AI.sql',                 'd671b65c2016d67d87045b99cdafe4125fbeebb3f56b5941c3ffe3bab52dd6e0', N'OBJECT_ID(''tempdb..#TrongTam'') IS NOT NULL', N'@BracketClose > @BracketOpen'),
    (8,  N'API_DeXuatKhuyenMai_AI',         '@de_xuat_khuyen_mai',  N'API_DeXuatKhuyenMai_AI',       N'sql/Module 6 - API_DeXuatKhuyenMai_AI.sql',            '1d8738988c5a1d74ef07c92f743cd3f71eeb83f3c6ba9d224c9210ed9da4688c', N'OBJECT_ID(''tempdb..#StockByLot'') IS NOT NULL', N'OBJECT_ID(''tempdb..#SalesVelocity'') IS NOT NULL'),
    (9,  N'API_CongNoChiTiet_AI',           '@cong_no_chi_tiet',    N'API_CongNoChiTiet_AI',         N'sql/Module common - API_CongNoChiTiet_AI.sql',         '2c0513471cf5314541e55a362e85e76cdebc323927a7c23bb2c5d24534710009', N'@BracketClose > @BracketOpen', NULL),
    (10, N'API_CongNoKhachHang_AI',         '@cong_no_khach_hang',  N'API_CongNoKhachHang_AI',       N'sql/Module common - API_CongNoKhachHang_AI.sql',       '92c4b6211c27704859117eaba114a976c78c08621a2f13d0345f5c92fd8becaa', N'@BracketClose > @BracketOpen', NULL),
    (11, N'API_DanhMuc_Core_AI',            '@danh_muc',            N'API_DanhMuc_AI',               N'sql/Module common - API_DanhMuc_AI.sql',               '308578daba4c41589a3f69c4b871688d152836756434bc7d370facacc3a35901', N'OBJECT_ID(''tempdb..#TempAllKH'') IS NOT NULL', N'OBJECT_ID(''tempdb..#TempSP'') IS NOT NULL'),
    (12, N'API_DoanhSo_AI',                 '@doanh_so',            N'API_DoanhSo_AI',               N'sql/Module common - API_DoanhSo_AI.sql',               '2ea9566c64b007255507d566b5dfd8c5f8eb2c92690c4f5619fd11d542ef49b8', N'@BracketClose > @BracketOpen', NULL),
    (13, N'API_DonHangChiTiet_Insert_AI',   '@lap_don_hang',        N'API_DonHangChiTiet_Insert_AI', N'sql/Module common - API_DonHangChiTiet_Insert_AI.sql', '3513ad8c33f3be5f3e18686591ba7b3e3220721097d2e28aef9ba1f0ae8ffc05', N'OBJECT_ID(''tempdb..#Items'') IS NOT NULL', NULL),
    (14, N'API_DonHang_AI',                 '@don_hang',            N'API_DonHang_AI',               N'sql/Module common - API_DonHang_AI.sql',               'de59d3c39003d06c88769cce8d8ea2f8e0d1138a2649539aec8ec9cbeb54741b', N'@BracketClose > @BracketOpen', NULL),
    (15, N'API_HoaDon_AI',                  '@hoa_don',             N'API_HoaDon_AI',                N'sql/Module common - API_HoaDon_AI.sql',                'df497486cccb3c0d193e7840890dd5491992816344f1ff732f253d11e697cee3', N'OBJECT_ID(''tempdb..#BC'') IS NOT NULL', NULL);

/* Result 1: target database. */
SELECT
    N'DATABASE_TARGET' AS CheckCode,
    DB_NAME() AS ActualDatabase,
    @ExpectedDatabase AS ExpectedDatabase,
    CASE WHEN DB_NAME() = @ExpectedDatabase THEN N'PASS' ELSE N'FAIL' END AS Status,
    SUSER_SNAME() AS ExecutedBy,
    SYSUTCDATETIME() AS CheckedAtUtc;

/* Result 2: all 15 procedure definitions and source markers. */
;WITH ObjectChecks AS (
    SELECT
        e.DeployOrder,
        e.ObjectName,
        e.ApiCode,
        e.SourceFile,
        e.SourceFileSha256,
        o.object_id,
        o.type_desc AS ObjectType,
        o.modify_date AS ModifyDate,
        OBJECT_DEFINITION(o.object_id) AS ObjectDefinition,
        e.RequiredMarker1,
        e.RequiredMarker2
    FROM @ExpectedObjects e
    LEFT JOIN sys.objects o
        ON o.schema_id = SCHEMA_ID(N'dbo')
       AND o.name = e.ObjectName
)
SELECT
    DeployOrder,
    ObjectName,
    ApiCode,
    ObjectType,
    ModifyDate,
    SourceFile,
    SourceFileSha256,
    CONVERT(VARCHAR(64), HASHBYTES('SHA2_256', CONVERT(VARBINARY(MAX), COALESCE(ObjectDefinition, N''))), 2) AS DatabaseDefinitionSha256,
    CASE
        WHEN object_id IS NULL THEN N'FAIL_MISSING_OBJECT'
        WHEN ObjectDefinition IS NULL THEN N'FAIL_NO_DEFINITION'
        WHEN RequiredMarker1 IS NOT NULL AND CHARINDEX(RequiredMarker1, ObjectDefinition) = 0 THEN N'FAIL_OLD_DEFINITION_MARKER_1'
        WHEN RequiredMarker2 IS NOT NULL AND CHARINDEX(RequiredMarker2, ObjectDefinition) = 0 THEN N'FAIL_OLD_DEFINITION_MARKER_2'
        ELSE N'PASS_SOURCE_MARKERS'
    END AS Status
FROM ObjectChecks
ORDER BY DeployOrder;

/* Result 3: API metadata mapping for all 15 APIs. */
IF OBJECT_ID(N'dbo.API_Definition', N'U') IS NULL
BEGIN
    SELECT
        e.DeployOrder,
        e.ApiCode,
        e.MetadataProcedure AS ExpectedProcedure,
        CAST(NULL AS SYSNAME) AS ActualProcedure,
        CAST(NULL AS BIT) AS IsActive,
        N'FAIL_API_DEFINITION_TABLE_MISSING' AS Status
    FROM @ExpectedObjects e
    ORDER BY e.DeployOrder;
END
ELSE
BEGIN
    SELECT
        e.DeployOrder,
        e.ApiCode,
        e.MetadataProcedure AS ExpectedProcedure,
        d.StoredProcedure AS ActualProcedure,
        d.IsActive,
        CASE
            WHEN d.ApiCode IS NULL THEN N'FAIL_METADATA_MISSING'
            WHEN ISNULL(d.IsActive, 0) <> 1 THEN N'FAIL_METADATA_INACTIVE'
            WHEN d.StoredProcedure <> e.MetadataProcedure THEN N'FAIL_WRONG_PROCEDURE'
            WHEN OBJECT_ID(N'dbo.' + d.StoredProcedure, N'P') IS NULL THEN N'FAIL_TARGET_PROCEDURE_MISSING'
            ELSE N'PASS'
        END AS Status
    FROM @ExpectedObjects e
    LEFT JOIN dbo.API_Definition d ON d.ApiCode = e.ApiCode
    ORDER BY e.DeployOrder;
END;

/* Result 4: bootstrap/metadata infrastructure created or maintained by file 16. */
DECLARE @BootstrapChecks TABLE (
    CheckOrder INT NOT NULL PRIMARY KEY,
    CheckCode VARCHAR(100) NOT NULL,
    Status NVARCHAR(100) NOT NULL,
    Detail NVARCHAR(500) NULL
);

INSERT INTO @BootstrapChecks VALUES
    (1, 'BOOTSTRAP_API_DEFINITION_TABLE',
        CASE WHEN OBJECT_ID(N'dbo.API_Definition', N'U') IS NOT NULL THEN N'PASS' ELSE N'FAIL_MISSING' END,
        N'dbo.API_Definition'),
    (2, 'BOOTSTRAP_API_FIELD_TABLE',
        CASE WHEN OBJECT_ID(N'dbo.API_Field', N'U') IS NOT NULL THEN N'PASS' ELSE N'FAIL_MISSING' END,
        N'dbo.API_Field'),
    (3, 'BOOTSTRAP_API_ACTION_TABLE',
        CASE WHEN OBJECT_ID(N'dbo.API_Action', N'U') IS NOT NULL THEN N'PASS' ELSE N'FAIL_MISSING' END,
        N'dbo.API_Action'),
    (4, 'BOOTSTRAP_API_GET_CONFIG',
        CASE WHEN OBJECT_ID(N'dbo.API_GetConfig', N'P') IS NOT NULL THEN N'PASS' ELSE N'FAIL_MISSING' END,
        N'dbo.API_GetConfig'),
    (5, 'BOOTSTRAP_API_LIST_ACTIVE',
        CASE WHEN OBJECT_ID(N'dbo.API_ListActive', N'P') IS NOT NULL THEN N'PASS' ELSE N'FAIL_MISSING' END,
        N'dbo.API_ListActive'),
    (6, 'BOOTSTRAP_API_GET_SYSTEM_META',
        CASE WHEN OBJECT_ID(N'dbo.API_GetSystemMeta', N'P') IS NOT NULL THEN N'PASS' ELSE N'FAIL_MISSING' END,
        N'dbo.API_GetSystemMeta'),
    (7, 'BOOTSTRAP_TEMP_TABLE_GUARD_MARKER',
        CASE WHEN OBJECT_DEFINITION(OBJECT_ID(N'dbo.API_Metadata_AutoBootstrap_AI')) LIKE N'%OBJECT_ID(''tempdb..#AI_META'') IS NOT NULL%'
             THEN N'PASS' ELSE N'FAIL_OLD_OR_MISSING_DEFINITION' END,
        N'dbo.API_Metadata_AutoBootstrap_AI contains RC2 #AI_META guard');

SELECT CheckOrder, CheckCode, Status, Detail
FROM @BootstrapChecks
ORDER BY CheckOrder;

/* Result 5: one summary row. */
DECLARE @ObjectFailCount INT;
DECLARE @MetadataFailCount INT;
DECLARE @BootstrapFailCount INT;

;WITH ObjectChecks AS (
    SELECT
        e.ObjectName,
        o.object_id,
        OBJECT_DEFINITION(o.object_id) AS ObjectDefinition,
        e.RequiredMarker1,
        e.RequiredMarker2
    FROM @ExpectedObjects e
    LEFT JOIN sys.objects o
        ON o.schema_id = SCHEMA_ID(N'dbo')
       AND o.name = e.ObjectName
)
SELECT @ObjectFailCount = COUNT(*)
FROM ObjectChecks
WHERE object_id IS NULL
   OR ObjectDefinition IS NULL
   OR (RequiredMarker1 IS NOT NULL AND CHARINDEX(RequiredMarker1, ObjectDefinition) = 0)
   OR (RequiredMarker2 IS NOT NULL AND CHARINDEX(RequiredMarker2, ObjectDefinition) = 0);

IF OBJECT_ID(N'dbo.API_Definition', N'U') IS NULL
BEGIN
    SET @MetadataFailCount = (SELECT COUNT(*) FROM @ExpectedObjects);
END
ELSE
BEGIN
    SELECT @MetadataFailCount = COUNT(*)
    FROM @ExpectedObjects e
    LEFT JOIN dbo.API_Definition d ON d.ApiCode = e.ApiCode
    WHERE d.ApiCode IS NULL
       OR ISNULL(d.IsActive, 0) <> 1
       OR d.StoredProcedure <> e.MetadataProcedure
       OR OBJECT_ID(N'dbo.' + d.StoredProcedure, N'P') IS NULL;
END;

SELECT @BootstrapFailCount = COUNT(*)
FROM @BootstrapChecks
WHERE Status <> N'PASS';

SELECT
    N'VERIFICATION_SUMMARY' AS CheckCode,
    15 AS ExpectedProcedures,
    @ObjectFailCount AS ProcedureFailures,
    @MetadataFailCount AS MetadataFailures,
    7 AS ExpectedBootstrapChecks,
    @BootstrapFailCount AS BootstrapFailures,
    CASE
        WHEN DB_NAME() <> @ExpectedDatabase THEN N'FAIL_WRONG_DATABASE'
        WHEN @ObjectFailCount > 0 THEN N'FAIL_PROCEDURE_SET'
        WHEN @MetadataFailCount > 0 THEN N'FAIL_API_METADATA'
        WHEN @BootstrapFailCount > 0 THEN N'FAIL_BOOTSTRAP'
        ELSE N'PASS_ALL_16_SOURCE_AND_METADATA_CHECKS'
    END AS Status,
    N'Read-only verification. Business runtime/smoke tests remain required before UAT-003 DONE.' AS Note;
GO
