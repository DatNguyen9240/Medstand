SET NOCOUNT ON;
SET XACT_ABORT ON;

IF OBJECT_ID(N'dbo.API_Definition', N'U') IS NULL
    THROW 51330, N'API_Definition metadata table is required.', 1;

DECLARE @ApiCode NVARCHAR(100) = N'@thong_bao';
DECLARE @ProcedureName SYSNAME = N'API_ThongBao_AI';

-- Metadata schemas differ between Medstand releases. Update only columns that
-- exist, and fail closed when the required API definition cannot be represented.
IF COL_LENGTH('dbo.API_Definition', 'ApiCode') IS NOT NULL
   AND COL_LENGTH('dbo.API_Definition', 'ProcedureName') IS NOT NULL
BEGIN
    IF EXISTS (SELECT 1 FROM dbo.API_Definition WHERE ApiCode = @ApiCode)
        UPDATE dbo.API_Definition
        SET ProcedureName = @ProcedureName
        WHERE ApiCode = @ApiCode;
    ELSE
        INSERT dbo.API_Definition (ApiCode, ProcedureName)
        VALUES (@ApiCode, @ProcedureName);
END
ELSE IF COL_LENGTH('dbo.API_Definition', 'APIName') IS NOT NULL
        AND COL_LENGTH('dbo.API_Definition', 'StoreName') IS NOT NULL
BEGIN
    IF EXISTS (SELECT 1 FROM dbo.API_Definition WHERE APIName = @ApiCode)
        UPDATE dbo.API_Definition SET StoreName = @ProcedureName WHERE APIName = @ApiCode;
    ELSE
        INSERT dbo.API_Definition (APIName, StoreName) VALUES (@ApiCode, @ProcedureName);
END
ELSE
    THROW 51331, N'Unsupported API_Definition metadata schema.', 1;

-- Action-level authorization remains enforced by the gateway and SQL procedure.
-- Keep this migration separate so an unknown metadata schema cannot partially
-- deploy the core notification tables/procedures.
