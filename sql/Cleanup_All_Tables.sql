-- ═══════════════════════════════════════════════════════════════════════════
-- DỌN DẸP TOÀN BỘ CẤU TRÚC BẢNG METADATA CŨ (RESET TỪ ĐẦU)
-- Chạy file này TRƯỚC KHI import lại Bootstrap_API_Metadata_Auto.sql
-- ═══════════════════════════════════════════════════════════════════════════
USE [medtest];
GO

PRINT N'Bắt đầu quá trình xóa các bảng Metadata cũ...';

-- 1. Xóa các bảng con (Chứa khóa ngoại)
IF OBJECT_ID('API_Bulk_Config', 'U') IS NOT NULL 
BEGIN
    DROP TABLE API_Bulk_Config;
    PRINT N' - Đã xóa bảng API_Bulk_Config';
END

IF OBJECT_ID('API_Filter', 'U') IS NOT NULL 
BEGIN
    DROP TABLE API_Filter;
    PRINT N' - Đã xóa bảng API_Filter';
END

IF OBJECT_ID('API_Action_Field', 'U') IS NOT NULL 
BEGIN
    DROP TABLE API_Action_Field;
    PRINT N' - Đã xóa bảng API_Action_Field';
END

-- 2. Xóa các bảng cấp 2
IF OBJECT_ID('API_Field', 'U') IS NOT NULL 
BEGIN
    DROP TABLE API_Field;
    PRINT N' - Đã xóa bảng API_Field';
END

IF OBJECT_ID('API_Action', 'U') IS NOT NULL 
BEGIN
    DROP TABLE API_Action;
    PRINT N' - Đã xóa bảng API_Action';
END

-- 3. Xóa bảng gốc (Parent Table)
IF OBJECT_ID('API_Definition', 'U') IS NOT NULL 
BEGIN
    DROP TABLE API_Definition;
    PRINT N' - Đã xóa bảng API_Definition';
END

-- 4. Xóa luôn các Stored Procedure hệ thống (Để tạo lại)
IF OBJECT_ID('API_ListActive', 'P') IS NOT NULL 
BEGIN
    DROP PROCEDURE API_ListActive;
    PRINT N' - Đã xóa procedure API_ListActive';
END

IF OBJECT_ID('API_GetConfig', 'P') IS NOT NULL 
BEGIN
    DROP PROCEDURE API_GetConfig;
    PRINT N' - Đã xóa procedure API_GetConfig';
END

PRINT N'✅ ĐÃ XÓA SẠCH SẼ HOÀN TOÀN! BẠN CÓ THỂ CHẠY IMPORT Bootstrap_API_Metadata_Auto.sql BÂY GIỜ.';
GO
