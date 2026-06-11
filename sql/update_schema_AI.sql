-- =========================================================================
-- MEDSTAND ERP — SCRIPT NÂNG CẤP DATABASE CHO HỆ THỐNG PRODUCTION AI (V4)
-- =========================================================================
USE medtest;
GO

BEGIN TRANSACTION;
BEGIN TRY

    -- 1. BẢNG TRI THỨC SẢN PHẨM (AI PRODUCT KNOWLEDGE)
    -- Tách biệt hoàn toàn khỏi bảng gốc CF_ItemTbl của ERP
    IF OBJECT_ID('dbo.AI_ProductKnowledgeTbl', 'U') IS NULL
    BEGIN
        CREATE TABLE dbo.AI_ProductKnowledgeTbl (
            ItemID VARCHAR(50) NOT NULL,
            Ingredients NVARCHAR(1000) NULL,
            MainUses NVARCHAR(MAX) NULL,
            TargetPatients NVARCHAR(500) NULL,
            UsageInstructions NVARCHAR(1000) NULL,
            Contraindications NVARCHAR(1000) NULL,
            SideEffects NVARCHAR(1000) NULL,
            Keywords NVARCHAR(1000) NULL,
            Confidence VARCHAR(20) NULL,
            SourceText NVARCHAR(MAX) NULL,
            ExtractedJson NVARCHAR(MAX) NULL,
            Status VARCHAR(20) NOT NULL CONSTRAINT DF_AI_ProductKnowledge_Status DEFAULT 'Pending',
            VersionNo INT NOT NULL CONSTRAINT DF_AI_ProductKnowledge_Version DEFAULT 1,
            ApprovedBy VARCHAR(50) NULL,
            ApprovedDate DATETIME NULL,
            DateUpdate DATETIME NOT NULL CONSTRAINT DF_AI_ProductKnowledge_DateUpdate DEFAULT GETDATE(),
            CONSTRAINT PK_AI_ProductKnowledge PRIMARY KEY (ItemID)
        );
        PRINT '✅ Da tao bang AI_ProductKnowledgeTbl thanh cong.';
    END
    ELSE
    BEGIN
        PRINT 'ℹ️ Bang AI_ProductKnowledgeTbl da ton tai.';
    END

    -- 2. BẢNG NHẬT KÝ PHÊ DUYỆT ADMIN (AI APPROVAL LOG)
    IF OBJECT_ID('dbo.AI_ApprovalLogTbl', 'U') IS NULL
    BEGIN
        CREATE TABLE dbo.AI_ApprovalLogTbl (
            ApprovalID INT IDENTITY(1,1) NOT NULL,
            ItemID VARCHAR(50) NOT NULL,
            Action VARCHAR(20) NOT NULL, -- 'APPROVE', 'REJECT', 'UPDATE'
            UserName VARCHAR(50) NOT NULL,
            DateTime DATETIME NOT NULL CONSTRAINT DF_AI_ApprovalLog_DateTime DEFAULT GETDATE(),
            OldVersion INT NULL,
            NewVersion INT NULL,
            CONSTRAINT PK_AI_ApprovalLog PRIMARY KEY (ApprovalID)
        );
        PRINT '✅ Da tao bang AI_ApprovalLogTbl thanh cong.';
    END
    ELSE
    BEGIN
        PRINT 'ℹ️ Bang AI_ApprovalLogTbl da ton tai.';
    END

    -- 3. BẢNG CẤU HÌNH CHIẾT KHẤU ĐỘNG (DOCKING PROMOTION RULES)
    IF OBJECT_ID('dbo.AR_AI_DiscountConfigTbl', 'U') IS NULL
    BEGIN
        CREATE TABLE dbo.AR_AI_DiscountConfigTbl (
            ConfigID INT IDENTITY(1,1) NOT NULL,
            LoaiDeXuat VARCHAR(50) NOT NULL, -- 'XA_HANG_SAU', 'COMBO_DAY_HANG'
            NguongThoiGian_Thang INT NOT NULL,
            PhanTramDeXuat DECIMAL(5,2) NOT NULL,
            IsActive BIT NOT NULL CONSTRAINT DF_AR_AI_DiscountConfig_IsActive DEFAULT 1,
            TuNgay DATE NULL,
            DenNgay DATE NULL,
            GhiChu NVARCHAR(255) NULL,
            CONSTRAINT PK_AR_AI_DiscountConfig PRIMARY KEY (ConfigID)
        );
        PRINT '✅ Da tao bang AR_AI_DiscountConfigTbl thanh cong.';
        
        -- Insert mock configs
        INSERT INTO dbo.AR_AI_DiscountConfigTbl (LoaiDeXuat, NguongThoiGian_Thang, PhanTramDeXuat, TuNgay, DenNgay, GhiChu)
        VALUES ('XA_HANG_SAU', 3, 50.00, '2026-01-01', '2026-12-31', N'Xả hàng khẩn cấp cận 3 tháng'),
               ('XA_HANG_SAU', 6, 25.00, '2026-01-01', '2026-12-31', N'Xả hàng cận date 6 tháng'),
               ('COMBO_DAY_HANG', 6, 15.00, '2026-01-01', '2026-12-31', N'Khuyến khích bán combo hàng chậm');
    END
    ELSE
    BEGIN
        PRINT 'ℹ️ Bang AR_AI_DiscountConfigTbl da ton tai.';
    END

    -- 4. BẢNG PHÂN QUYỀN KHO HÀNG CHO USER (DEFAULT-DENY SECURE WAREHOUSE)
    IF OBJECT_ID('dbo.SY_UserStoreHouseTbl', 'U') IS NULL
    BEGIN
        CREATE TABLE dbo.SY_UserStoreHouseTbl (
            UserName VARCHAR(50) NOT NULL,
            StoreHouseID VARCHAR(50) NOT NULL,
            CONSTRAINT PK_SY_UserStoreHouseTbl PRIMARY KEY (UserName, StoreHouseID)
        );
        PRINT '✅ Da tao bang SY_UserStoreHouseTbl thanh cong.';
    END
    ELSE
    BEGIN
        PRINT 'ℹ️ Bang SY_UserStoreHouseTbl da ton tai.';
    END

    COMMIT TRANSACTION;
    PRINT '🎉 TOAN BO CAC BANG AI DA DUOC NANG CAP THANH CONG!';

END TRY
BEGIN CATCH
    ROLLBACK TRANSACTION;
    PRINT '❌ LOI KHI NANG CAP SCHEMA: ' + ERROR_MESSAGE();
END CATCH;
GO
