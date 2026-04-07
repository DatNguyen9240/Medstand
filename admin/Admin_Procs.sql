-- ═══════════════════════════════════════════════════════════════════════════
-- Admin_Metadata_Procs.sql
-- CÁC THỦ TỤC HỖ TRỢ GIAO DIỆN QUẢN TRỊ METADATA
-- ═══════════════════════════════════════════════════════════════════════════
USE [medtest]
GO

-- 1. LẤY TOÀN BỘ CẤU HÌNH CỦA MỘT MODULE (CHO ADMIN)
CREATE OR ALTER PROCEDURE API_Admin_GetFullConfig
    @ApiCode VARCHAR(100)
AS
BEGIN
    DECLARE @ApiID INT;
    SELECT @ApiID = ApiID FROM API_Definition WHERE ApiCode = @ApiCode;

    -- Kết quả 1: Thông tin chung (Definition)
    SELECT * FROM API_Definition WHERE ApiID = @ApiID;

    -- Kết quả 2: Danh sách Actions
    SELECT * FROM API_Action WHERE ApiID = @ApiID ORDER BY OrderIndex;

    -- Kết quả 3: Danh sách Fields
    SELECT * FROM API_Field WHERE ApiID = @ApiID ORDER BY OrderIndex;

    -- Kết quả 4: Danh sách Filters
    SELECT * FROM API_Filter WHERE ApiID = @ApiID ORDER BY OrderIndex;

    -- Kết quả 5: Mapping Action-Field
    SELECT af.*, f.FieldCode 
    FROM API_Action_Field af 
    JOIN API_Field f ON af.FieldID = f.FieldID
    JOIN API_Action a ON af.ActionID = a.ActionID
    WHERE a.ApiID = @ApiID;
END
GO

-- 2. ĐỒNG BỘ CẤU HÌNH (UPSERT MODAL)
-- Ghi chú: Procedure này dùng để lưu các thay đổi cơ bản của Module
CREATE OR ALTER PROCEDURE API_Admin_SaveBasicConfig
    @ApiCode         VARCHAR(100),
    @ApiName         NVARCHAR(200),
    @StoredProcedure VARCHAR(200),
    @Category        NVARCHAR(100),
    @IconEmoji       NVARCHAR(10)
AS
BEGIN
    IF EXISTS (SELECT 1 FROM API_Definition WHERE ApiCode = @ApiCode)
    BEGIN
        UPDATE API_Definition SET
            ApiName = @ApiName,
            StoredProcedure = @StoredProcedure,
            Category = @Category,
            IconEmoji = @IconEmoji
        WHERE ApiCode = @ApiCode;
    END
    ELSE
    BEGIN
        INSERT INTO API_Definition (ApiCode, ApiName, StoredProcedure, Category, IconEmoji)
        VALUES (@ApiCode, @ApiName, @StoredProcedure, @Category, @IconEmoji);
    END
END
GO

PRINT N'✅ Đã cài đặt các Stored Procedures hỗ trợ Admin';
GO
