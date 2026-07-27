[CmdletBinding()]
param(
    [string]$Server,
    [string]$Database = 'medtest',
    [string]$Username,
    [securestring]$Password,
    [switch]$IntegratedSecurity,
    [switch]$Apply,
    [switch]$SkipBackup,
    [string]$EvidenceDirectory,
    [string]$SqlCmdPath = 'sqlcmd'
)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

$workspaceRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$releaseId = 'MEDSTAND-UAT-20260727-11.110-RC2'
$expectedDatabase = 'medtest'

$deploymentFiles = @(
    @{ Order = 1;  Path = 'sql/Module 1 - API_GoiYDonHang_AI.sql';                  Object = 'dbo.API_GoiYDonHang_AI';             Hash = '61b859fd343af3930f63b74c3b582e770f0263bb9a375b9c9598747a8c786c19' },
    @{ Order = 2;  Path = 'sql/Module 10 - API_SanPhamTrongTam_AI.sql';             Object = 'dbo.API_SanPhamTrongTam_AI';        Hash = '3d297fb2585fe9befd57f50ebc839b13f1d4105d0eb088ef2c8ee9d3af5f90fa' },
    @{ Order = 3;  Path = 'sql/Module 10 - API_TraCuuSanPham_AI.sql';               Object = 'dbo.API_TraCuuSanPham_AI';          Hash = '4bd9a544c9c9c528538206d5790bcaae320160d345c2ef037a33b32ec05186e6' },
    @{ Order = 4;  Path = 'sql/Module 2 - API_TuyenBanHang_AI.sql';                 Object = 'dbo.API_TuyenBanHang_AI';           Hash = '43221682f047f5a599fe0deeed81e2d71653f751a31f4f0fa7b4ed1f96d2d394' },
    @{ Order = 5;  Path = 'sql/Module 3 - API_ChamDiemKH_AI.sql';                   Object = 'dbo.API_ChamDiemKH_AI';             Hash = '8ca6d2017971a28e0a242f4fd5ba892817ca9975c17c0cd31c5bb23961329157' },
    @{ Order = 6;  Path = 'sql/Module 4 - API_TichLuy_AI.sql';                     Object = 'dbo.API_TichLuy_AI';                Hash = 'ade58d5754b513bae92096860dcb1dc627ccb520d58785f119ba35da7c4d6cb8' },
    @{ Order = 7;  Path = 'sql/Module 5 - API_UpsellGoiY_AI.sql';                   Object = 'dbo.API_UpsellGoiY_AI';             Hash = 'd671b65c2016d67d87045b99cdafe4125fbeebb3f56b5941c3ffe3bab52dd6e0' },
    @{ Order = 8;  Path = 'sql/Module 6 - API_DeXuatKhuyenMai_AI.sql';              Object = 'dbo.API_DeXuatKhuyenMai_AI';        Hash = '1d8738988c5a1d74ef07c92f743cd3f71eeb83f3c6ba9d224c9210ed9da4688c' },
    @{ Order = 9;  Path = 'sql/Module common - API_CongNoChiTiet_AI.sql';           Object = 'dbo.API_CongNoChiTiet_AI';          Hash = '2c0513471cf5314541e55a362e85e76cdebc323927a7c23bb2c5d24534710009' },
    @{ Order = 10; Path = 'sql/Module common - API_CongNoKhachHang_AI.sql';         Object = 'dbo.API_CongNoKhachHang_AI';        Hash = '92c4b6211c27704859117eaba114a976c78c08621a2f13d0345f5c92fd8becaa' },
    @{ Order = 11; Path = 'sql/Module common - API_DanhMuc_AI.sql';                 Object = 'dbo.API_DanhMuc_Core_AI';           Hash = '308578daba4c41589a3f69c4b871688d152836756434bc7d370facacc3a35901' },
    @{ Order = 12; Path = 'sql/Module common - API_DoanhSo_AI.sql';                 Object = 'dbo.API_DoanhSo_AI';                Hash = '2ea9566c64b007255507d566b5dfd8c5f8eb2c92690c4f5619fd11d542ef49b8' },
    @{ Order = 13; Path = 'sql/Module common - API_DonHangChiTiet_Insert_AI.sql';   Object = 'dbo.API_DonHangChiTiet_Insert_AI';  Hash = '3513ad8c33f3be5f3e18686591ba7b3e3220721097d2e28aef9ba1f0ae8ffc05' },
    @{ Order = 14; Path = 'sql/Module common - API_DonHang_AI.sql';                 Object = 'dbo.API_DonHang_AI';                Hash = 'de59d3c39003d06c88769cce8d8ea2f8e0d1138a2649539aec8ec9cbeb54741b' },
    @{ Order = 15; Path = 'sql/Module common - API_HoaDon_AI.sql';                 Object = 'dbo.API_HoaDon_AI';                 Hash = 'df497486cccb3c0d193e7840890dd5491992816344f1ff732f253d11e697cee3' },
    @{ Order = 16; Path = 'sql/Bootstrap_API_Metadata_Auto_AI.sql';                Object = 'METADATA_BOOTSTRAP';                Hash = '4ff9cc5d9bebf80ff779f77852db3d457ae596095f16452c507ff7f939ad9194' }
)

$requiredApiCodes = @(
    '@goi_ydon_hang', '@san_pham_trong_tam', '@tra_cuu_san_pham',
    '@tuyen_ban_hang', '@cham_diem_kh', '@tich_luy', '@upsell_goi_y',
    '@de_xuat_khuyen_mai', '@cong_no_chi_tiet', '@cong_no_khach_hang',
    '@danh_muc', '@doanh_so', '@lap_don_hang', '@don_hang', '@hoa_don'
)

function Get-PlainText([securestring]$SecureValue) {
    $pointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($SecureValue)
    try { return [Runtime.InteropServices.Marshal]::PtrToStringBSTR($pointer) }
    finally { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($pointer) }
}

function Get-ConnectionArguments {
    # -y 0 keeps full NVARCHAR(MAX) object definitions in rollback/evidence files.
    $arguments = @('-S', $Server, '-d', $Database, '-b', '-r', '1', '-l', '15', '-t', '120', '-I', '-y', '0')
    if ($IntegratedSecurity) {
        return $arguments + @('-E')
    }
    if ([string]::IsNullOrWhiteSpace($Username) -or $null -eq $Password) {
        throw 'SQL authentication requires both -Username and -Password. Use -IntegratedSecurity for Windows authentication.'
    }
    return $arguments + @('-U', $Username, '-P', (Get-PlainText $Password))
}

function Invoke-SqlCmdFile([string]$InputFile, [string]$OutputFile) {
    $arguments = (Get-ConnectionArguments) + @('-i', $InputFile, '-u', '-o', $OutputFile)
    & $SqlCmdPath @arguments
    if ($LASTEXITCODE -ne 0) { throw "sqlcmd failed for $InputFile with exit code $LASTEXITCODE. See $OutputFile" }
}

function Invoke-SqlCmdQuery([string]$Query, [string]$OutputFile) {
    $arguments = (Get-ConnectionArguments) + @('-Q', $Query, '-u', '-o', $OutputFile)
    & $SqlCmdPath @arguments
    if ($LASTEXITCODE -ne 0) { throw "sqlcmd query failed with exit code $LASTEXITCODE. See $OutputFile" }
}

function Assert-LocalReleaseFiles {
    foreach ($entry in $deploymentFiles) {
        $absolutePath = Join-Path $workspaceRoot $entry.Path
        if (-not (Test-Path -LiteralPath $absolutePath)) { throw "Required SQL file is missing: $($entry.Path)" }
        $actualHash = (Get-FileHash -Algorithm SHA256 -LiteralPath $absolutePath).Hash.ToLowerInvariant()
        if ($actualHash -ne $entry.Hash) {
            throw "Hash mismatch for $($entry.Path). Expected $($entry.Hash), actual $actualHash. Create a new release candidate instead of deploying drifted source."
        }
    }
}

function New-VerificationSql([string]$OutputPath) {
    $objectRows = $deploymentFiles | Where-Object { $_.Object -ne 'METADATA_BOOTSTRAP' } | ForEach-Object {
        $parts = $_.Object.Split('.')
        "(N'$($parts[0])', N'$($parts[1])', N'$($_.Path.Replace("'", "''"))', '$($_.Hash)')"
    }
    $apiRows = $requiredApiCodes | ForEach-Object { "(N'$_')" }
    $query = @"
SET NOCOUNT ON;
DECLARE @ExpectedDatabase SYSNAME = N'$expectedDatabase';

SELECT
    N'DATABASE_TARGET' AS CheckCode,
    DB_NAME() AS ActualDatabase,
    @ExpectedDatabase AS ExpectedDatabase,
    CASE WHEN DB_NAME() = @ExpectedDatabase THEN N'PASS' ELSE N'FAIL' END AS Status,
    SUSER_SNAME() AS ExecutedBy,
    SYSUTCDATETIME() AS CheckedAtUtc;

DECLARE @ExpectedObjects TABLE (
    SchemaName SYSNAME NOT NULL,
    ObjectName SYSNAME NOT NULL,
    SourceFile NVARCHAR(400) NOT NULL,
    SourceFileSha256 CHAR(64) NOT NULL
);
INSERT INTO @ExpectedObjects VALUES
$($objectRows -join ",`n");

SELECT
    e.SchemaName,
    e.ObjectName,
    e.SourceFile,
    e.SourceFileSha256,
    o.type_desc AS ObjectType,
    o.modify_date AS ModifyDate,
    CASE WHEN o.object_id IS NULL THEN N'MISSING'
         WHEN OBJECT_DEFINITION(o.object_id) IS NULL THEN N'NO_DEFINITION'
         ELSE N'PRESENT' END AS DefinitionStatus,
    CONVERT(VARCHAR(64), HASHBYTES('SHA2_256', CONVERT(VARBINARY(MAX), COALESCE(OBJECT_DEFINITION(o.object_id), N''))), 2) AS DatabaseDefinitionSha256
FROM @ExpectedObjects e
LEFT JOIN sys.schemas s ON s.name = e.SchemaName
LEFT JOIN sys.objects o ON o.schema_id = s.schema_id AND o.name = e.ObjectName
ORDER BY e.ObjectName;

SELECT
    N'OBJECT_SET' AS CheckCode,
    COUNT(*) AS ExpectedCount,
    SUM(CASE WHEN o.object_id IS NOT NULL AND OBJECT_DEFINITION(o.object_id) IS NOT NULL THEN 1 ELSE 0 END) AS PresentCount,
    CASE WHEN COUNT(*) = SUM(CASE WHEN o.object_id IS NOT NULL AND OBJECT_DEFINITION(o.object_id) IS NOT NULL THEN 1 ELSE 0 END)
         THEN N'PASS' ELSE N'FAIL' END AS Status
FROM @ExpectedObjects e
LEFT JOIN sys.schemas s ON s.name = e.SchemaName
LEFT JOIN sys.objects o ON o.schema_id = s.schema_id AND o.name = e.ObjectName;

DECLARE @RequiredApiCodes TABLE (ApiCode VARCHAR(100) NOT NULL PRIMARY KEY);
INSERT INTO @RequiredApiCodes VALUES
$($apiRows -join ",`n");

IF OBJECT_ID(N'dbo.API_Definition', N'U') IS NULL
BEGIN
    SELECT N'API_DEFINITION_TABLE' AS CheckCode, N'FAIL' AS Status, N'dbo.API_Definition is missing.' AS Note;
END
ELSE
BEGIN
    SELECT
        r.ApiCode,
        d.StoredProcedure,
        d.IsActive,
        CASE WHEN d.ApiCode IS NULL THEN N'MISSING'
             WHEN ISNULL(d.IsActive, 0) <> 1 THEN N'INACTIVE'
             WHEN NULLIF(d.StoredProcedure, '') IS NULL THEN N'NO_PROCEDURE'
             WHEN OBJECT_ID(N'dbo.' + d.StoredProcedure, N'P') IS NULL THEN N'PROCEDURE_MISSING'
             ELSE N'PASS' END AS Status
    FROM @RequiredApiCodes r
    LEFT JOIN dbo.API_Definition d ON d.ApiCode = r.ApiCode
    ORDER BY r.ApiCode;

    SELECT
        N'REQUIRED_API_SET' AS CheckCode,
        COUNT(*) AS ExpectedCount,
        SUM(CASE WHEN d.ApiCode IS NOT NULL
                      AND ISNULL(d.IsActive, 0) = 1
                      AND NULLIF(d.StoredProcedure, '') IS NOT NULL
                      AND OBJECT_ID(N'dbo.' + d.StoredProcedure, N'P') IS NOT NULL THEN 1 ELSE 0 END) AS PassCount,
        CASE WHEN COUNT(*) = SUM(CASE WHEN d.ApiCode IS NOT NULL
                                           AND ISNULL(d.IsActive, 0) = 1
                                           AND NULLIF(d.StoredProcedure, '') IS NOT NULL
                                           AND OBJECT_ID(N'dbo.' + d.StoredProcedure, N'P') IS NOT NULL THEN 1 ELSE 0 END)
             THEN N'PASS' ELSE N'FAIL' END AS Status
    FROM @RequiredApiCodes r
    LEFT JOIN dbo.API_Definition d ON d.ApiCode = r.ApiCode;
END;
"@
    Set-Content -LiteralPath $OutputPath -Value $query -Encoding utf8
}

$sqlCmd = Get-Command $SqlCmdPath -ErrorAction SilentlyContinue
if ($null -eq $sqlCmd) { throw "sqlcmd was not found: $SqlCmdPath" }
Assert-LocalReleaseFiles

if (-not $Apply) {
    Write-Output "DRY_RUN_OK: $releaseId"
    Write-Output 'Local file existence and SHA-256 checks passed for 16/16 release SQL files.'
    Write-Output 'No database connection was opened and no SQL was executed. Pass -Apply with connection parameters to deploy.'
    exit 0
}

if ([string]::IsNullOrWhiteSpace($Server)) { throw '-Server is required when -Apply is used.' }
if ($Database -ne $expectedDatabase) { throw "This release is locked to database '$expectedDatabase'. Received '$Database'." }

if ([string]::IsNullOrWhiteSpace($EvidenceDirectory)) {
    $stamp = Get-Date -Format 'yyyyMMdd-HHmmss'
    $EvidenceDirectory = Join-Path $workspaceRoot "reports/uat-sql-deploy/$stamp"
}
New-Item -ItemType Directory -Path $EvidenceDirectory -Force | Out-Null
$EvidenceDirectory = (Resolve-Path $EvidenceDirectory).Path

$targetCheckFile = Join-Path $EvidenceDirectory '00-target-check.txt'
Invoke-SqlCmdQuery "SET NOCOUNT ON; SELECT DB_NAME() AS DatabaseName, SUSER_SNAME() AS ExecutedBy, SYSUTCDATETIME() AS CheckedAtUtc; IF DB_NAME() <> N'$expectedDatabase' THROW 51000, N'Wrong target database', 1;" $targetCheckFile

$preDeployFile = Join-Path $workspaceRoot 'sql/diagnostics/Business_Rule_V1_PreDeploy_Verification.sql'
Invoke-SqlCmdFile $preDeployFile (Join-Path $EvidenceDirectory '01-predeploy.txt')

if (-not $SkipBackup) {
    $backupQuery = @"
SET NOCOUNT ON;
SELECT
    s.name AS SchemaName,
    o.name AS ObjectName,
    o.type_desc AS ObjectType,
    o.modify_date AS ModifyDate,
    OBJECT_DEFINITION(o.object_id) AS ObjectDefinition
FROM sys.objects o
JOIN sys.schemas s ON s.schema_id = o.schema_id
WHERE s.name = N'dbo'
  AND o.name IN ($(($deploymentFiles | Where-Object { $_.Object -ne 'METADATA_BOOTSTRAP' } | ForEach-Object { "N'$($_.Object.Split('.')[1])'" }) -join ','))
ORDER BY o.name;
"@
    Invoke-SqlCmdQuery $backupQuery (Join-Path $EvidenceDirectory '02-before-object-definitions.txt')
}

foreach ($entry in $deploymentFiles) {
    $absolutePath = Join-Path $workspaceRoot $entry.Path
    $safeName = ([IO.Path]::GetFileNameWithoutExtension($entry.Path) -replace '[^A-Za-z0-9_-]', '_')
    $outputFile = Join-Path $EvidenceDirectory ('{0:D2}-{1}.txt' -f (10 + [int]$entry.Order), $safeName)
    Write-Output ("Applying {0:D2}/16: {1}" -f $entry.Order, $entry.Path)
    Invoke-SqlCmdFile $absolutePath $outputFile
}

$postDeployFile = Join-Path $workspaceRoot 'sql/diagnostics/Business_Rule_V1_PostDeploy_Verification.sql'
Invoke-SqlCmdFile $postDeployFile (Join-Path $EvidenceDirectory '30-postdeploy-business-rule.txt')

$verificationSql = Join-Path $EvidenceDirectory '31-release-verification.sql'
New-VerificationSql $verificationSql
Invoke-SqlCmdFile $verificationSql (Join-Path $EvidenceDirectory '32-release-verification.txt')

$summary = @{
    releaseId = $releaseId
    server = $Server
    database = $Database
    appliedAt = (Get-Date).ToString('o')
    sqlFiles = $deploymentFiles | ForEach-Object { @{ order = $_.Order; path = $_.Path; object = $_.Object; sha256 = $_.Hash } }
    evidenceDirectory = $EvidenceDirectory
}
$summary | ConvertTo-Json -Depth 5 | Set-Content -LiteralPath (Join-Path $EvidenceDirectory 'deploy-summary.json') -Encoding utf8

Write-Output "DEPLOY_COMPLETED: $releaseId"
Write-Output "Evidence: $EvidenceDirectory"
Write-Output 'Review 32-release-verification.txt before marking UAT-003 DONE.'
