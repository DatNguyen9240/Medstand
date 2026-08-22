:ON ERROR EXIT

USE medtest;
GO

SET XACT_ABORT ON;
BEGIN TRANSACTION;
GO

:r "sql\Module_Common_API_TinhThanhByUser_AI.sql"
:r "sql\Module_Common_API_PhuongXa_AI.sql"
:r "sql\Module_Common_API_KhachHang_Insert_AI.sql"
:r "sql\Migrate_API_Capability_Customer_Location_AI.sql"

IF (SELECT COUNT(*) FROM dbo.AI_GetTinhThanhByUserFnc('QLBH013.MED')) <> 5
    THROW 51421, 'Unexpected QLBH013 province scope after deploy.', 1;

IF OBJECT_DEFINITION(OBJECT_ID('dbo.API_KhachHang_Insert_AI')) NOT LIKE '%LOCATION_OUT_OF_SCOPE%'
    THROW 51422, 'Customer location scope guard is missing.', 1;

IF NOT EXISTS
(
    SELECT 1
    FROM sys.parameters
    WHERE object_id = OBJECT_ID('dbo.API_PhuongXa')
      AND name = '@QuanHuyen'
)
    THROW 51423, 'API_PhuongXa is missing @QuanHuyen.', 1;

IF NOT EXISTS
(
    SELECT 1
    FROM dbo.API_Definition
    WHERE StoredProcedure = 'API_TinhThanhByUser_AI'
      AND OperationType = 'READ'
      AND RequiredCapability = 'api.read'
)
    THROW 51424, 'Province API capability metadata is invalid.', 1;

COMMIT TRANSACTION;
GO

SELECT 'DEPLOY_PASS' AS Result,
       (SELECT COUNT(*) FROM dbo.AI_GetTinhThanhByUserFnc('QLBH013.MED')) AS QLBH013ProvinceCount,
       (SELECT COUNT(*) FROM sys.parameters WHERE object_id = OBJECT_ID('dbo.API_PhuongXa')) AS WardApiParameterCount;
GO

