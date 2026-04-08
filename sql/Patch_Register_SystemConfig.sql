-- ═══════════════════════════════════════════════════════════════════════════
-- ĐĂNG KÝ HỆ THỐNG: @system_get_config
-- Đưa API_GetConfig vào danh sách API hợp lệ để lách lỗi Object not support2-
-- ═══════════════════════════════════════════════════════════════════════════
USE [medtest]
GO

SET NOCOUNT ON;

-- 1. Xóa nếu đã tồn tại để tránh trùng lặp
DECLARE @OldApiID INT;
SELECT @OldApiID = ApiID FROM API_Definition WHERE ApiCode = '@system_get_config';

IF @OldApiID IS NOT NULL
BEGIN
    DELETE FROM API_Filter WHERE ApiID = @OldApiID;
    DELETE FROM API_Action_Field WHERE ActionID IN (SELECT ActionID FROM API_Action WHERE ApiID = @OldApiID);
    DELETE FROM API_Field WHERE ApiID = @OldApiID;
    DELETE FROM API_Action WHERE ApiID = @OldApiID;
    DELETE FROM API_Bulk_Config WHERE ApiID = @OldApiID;
    DELETE FROM API_Definition WHERE ApiID = @OldApiID;
END

-- 2. Thêm mới Hệ thống API_GetConfig
INSERT INTO API_Definition (ApiCode, ApiName, ApiDescription, StoredProcedure, Category, IconEmoji, IsActive, OrderIndex)
VALUES ('@system_get_config', N'Hệ thống: Lấy Cấu hình API', N'API nội bộ để lấy form metadata', 'API_GetConfig', N'System', '⚙️', 1, 999);

DECLARE @ApiID INT = SCOPE_IDENTITY();

-- 3. Thêm Action thực thi
INSERT INTO API_Action (ApiID, ActionCode, ActionName, ExecutionType, IsDefault, IsConfirm, IsActive)
VALUES (@ApiID, 'VIEW', N'Xem cấu hình', 'QUERY', 1, 0, 1);

-- 4. Thêm Field định nghĩa tham số đầu vào (cho SP API_GetConfig)
INSERT INTO API_Field (ApiID, FieldCode, FieldName, DataType, ControlType, IsRequired, IsSystemParam, OrderIndex)
VALUES (@ApiID, '@Code', N'Mã API', 'VARCHAR', 'text', 1, 0, 1);

PRINT N'✅ Đã đăng ký thành công @system_get_config vào database!';
GO

-- KIỂM TRA LẠI:
-- SELECT * FROM API_Definition WHERE ApiCode = '@system_get_config';
