:on error exit

-- Run from the repository root with SQLCMD mode enabled.
-- Configuration must exist before the lookup function/procedures are compiled.
:r "sql\Migrate_Demo_Customer_SelfAssign_AI.sql"
:r "sql\Module_Common_API_ObjectGroupByUser_AI.sql"
:r "sql\Module_Common_API_EmployeeByManager_AI.sql"
:r "sql\Module_Common_API_TinhThanhByUser_AI.sql"
:r "sql\Module_Common_API_KhachHang_Insert_AI.sql"

