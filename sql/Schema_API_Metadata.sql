-- ═══════════════════════════════════════════════════════════════════════════
-- Schema_API_Metadata.sql
-- PHẦN 1: Schema 6 bảng + Module 1 → 10 (Specialized AI Modules)
--
-- Bao gồm các module:
--   Module 1  - API_GoiYDonHang_AI
--   Module 2  - API_TuyenBanHang_AI
--   Module 3  - API_ChamDiemKH_AI
--   Module 4  - API_TichLuy_AI
--   Module 5  - API_UpsellGoiY_AI
--   Module 6  - API_DeXuatKhuyenMai_AI
--   Module 8  - API_GoiYDonThuoc_AI
--   Module 10 - API_SanPhamTrongTam_AI
--   Module 10 - API_SanPhamTrongTam_Import_AI
--   Module 10 - API_TraCuuSanPham_AI
--
-- Chạy trong SSMS với sqlcmd mode bật (:r sẽ include file bên ngoài)
-- ═══════════════════════════════════════════════════════════════════════════
USE [medtest]
GO

-- ═══════════════════════════════════════════════════════════════════════════
-- BƯỚC 0: DROP TABLES (thứ tự ngược FK)
-- ═══════════════════════════════════════════════════════════════════════════
IF OBJECT_ID('API_Bulk_Config',  'U') IS NOT NULL DROP TABLE API_Bulk_Config;
IF OBJECT_ID('API_Filter',       'U') IS NOT NULL DROP TABLE API_Filter;
IF OBJECT_ID('API_Action_Field', 'U') IS NOT NULL DROP TABLE API_Action_Field;
IF OBJECT_ID('API_Field',        'U') IS NOT NULL DROP TABLE API_Field;
IF OBJECT_ID('API_Action',       'U') IS NOT NULL DROP TABLE API_Action;
IF OBJECT_ID('API_Definition',   'U') IS NOT NULL DROP TABLE API_Definition;
GO
PRINT N'✅ Đã xóa bảng cũ (nếu có)';
GO

-- ═══════════════════════════════════════════════════════════════════════════
-- BẢNG 1: API_Definition
-- ═══════════════════════════════════════════════════════════════════════════
CREATE TABLE API_Definition (
    ApiID           INT            NOT NULL PRIMARY KEY IDENTITY(1,1),
    ApiCode         VARCHAR(100)   NOT NULL UNIQUE,
    ApiName         NVARCHAR(200)  NOT NULL,
    ApiDescription  NVARCHAR(500)  NULL,
    StoredProcedure VARCHAR(200)   NOT NULL,
    Category        NVARCHAR(100)  NULL,
    IconEmoji       NVARCHAR(10)   NULL,
    IsActive        BIT            NOT NULL DEFAULT 1,
    OrderIndex      INT            NOT NULL DEFAULT 0
);
GO

-- ═══════════════════════════════════════════════════════════════════════════
-- BẢNG 2: API_Action
-- ═══════════════════════════════════════════════════════════════════════════
CREATE TABLE API_Action (
    ActionID      INT           NOT NULL PRIMARY KEY IDENTITY(1,1),
    ApiID         INT           NOT NULL REFERENCES API_Definition(ApiID),
    ActionCode    VARCHAR(50)   NOT NULL,
    ActionName    NVARCHAR(200) NOT NULL,
    ExecutionType VARCHAR(20)   NOT NULL,  -- SINGLE / QUERY / CART / BULK
    HttpMethod    VARCHAR(10)   NOT NULL DEFAULT 'POST',
    IsConfirm     BIT           NOT NULL DEFAULT 0,
    IsDefault     BIT           NOT NULL DEFAULT 1,
    IsActive      BIT           NOT NULL DEFAULT 1,
    OrderIndex    INT           NOT NULL DEFAULT 0
);
GO

-- ═══════════════════════════════════════════════════════════════════════════
-- BẢNG 3: API_Field
-- ═══════════════════════════════════════════════════════════════════════════
CREATE TABLE API_Field (
    FieldID       INT            NOT NULL PRIMARY KEY IDENTITY(1,1),
    ApiID         INT            NOT NULL REFERENCES API_Definition(ApiID),
    FieldCode     VARCHAR(100)   NOT NULL,
    FieldName     NVARCHAR(200)  NOT NULL,
    DataType      VARCHAR(20)    NOT NULL,
    ControlType   VARCHAR(50)    NOT NULL,
    IsRequired    BIT            NOT NULL DEFAULT 0,
    IsSystemParam BIT            NOT NULL DEFAULT 0,
    DefaultValue  NVARCHAR(500)  NULL,
    Placeholder   NVARCHAR(200)  NULL,
    MinValue      NVARCHAR(50)   NULL,
    MaxValue      NVARCHAR(50)   NULL,
    OptionsJson   NVARCHAR(MAX)  NULL,
    DataSourceType  VARCHAR(50)  NULL,   -- STATIC / SQL / APICODE / API
    DataSourceValue NVARCHAR(MAX) NULL,
    OrderIndex    INT            NOT NULL DEFAULT 0
);
GO

-- ═══════════════════════════════════════════════════════════════════════════
-- BẢNG 4: API_Action_Field
-- ═══════════════════════════════════════════════════════════════════════════
CREATE TABLE API_Action_Field (
    ID         INT NOT NULL PRIMARY KEY IDENTITY(1,1),
    ActionID   INT NOT NULL REFERENCES API_Action(ActionID),
    FieldID    INT NOT NULL REFERENCES API_Field(FieldID),
    IsVisible  BIT NOT NULL DEFAULT 1,
    IsEditable BIT NOT NULL DEFAULT 1,
    IsRequired BIT NOT NULL DEFAULT 0
);
GO

-- ═══════════════════════════════════════════════════════════════════════════
-- BẢNG 5: API_Filter
-- ═══════════════════════════════════════════════════════════════════════════
CREATE TABLE API_Filter (
    FilterID     INT            NOT NULL PRIMARY KEY IDENTITY(1,1),
    ApiID        INT            NOT NULL REFERENCES API_Definition(ApiID),
    FieldCode    VARCHAR(100)   NOT NULL,
    FieldName    NVARCHAR(200)  NOT NULL,
    DataType     VARCHAR(20)    NOT NULL DEFAULT 'VARCHAR',
    ControlType  VARCHAR(50)    NOT NULL,
    Operator     VARCHAR(20)    NOT NULL DEFAULT '=',
    DefaultValue NVARCHAR(500)  NULL,
    Placeholder  NVARCHAR(200)  NULL,
    OptionsJson  NVARCHAR(MAX)  NULL,
    DataSourceType  VARCHAR(50)  NULL,
    DataSourceValue NVARCHAR(MAX) NULL,
    IsRequired   BIT            NOT NULL DEFAULT 0,
    OrderIndex   INT            NOT NULL DEFAULT 0
);
GO

-- ═══════════════════════════════════════════════════════════════════════════
-- BẢNG 6: API_Bulk_Config (optional)
-- ═══════════════════════════════════════════════════════════════════════════
CREATE TABLE API_Bulk_Config (
    ApiID            INT         NOT NULL PRIMARY KEY REFERENCES API_Definition(ApiID),
    AllowUpload      BIT         NOT NULL DEFAULT 0,
    AllowMultiSelect BIT         NOT NULL DEFAULT 0,
    TemplateUrl      VARCHAR(500) NULL,
    MaxRows          INT         NULL DEFAULT 500
);
GO
PRINT N'✅ Đã tạo 6 bảng schema';
GO

-- ═══════════════════════════════════════════════════════════════════════════
-- BƯỚC 1: CÀI ĐẶT STORED PROCEDURES — Module 1 → 10
-- Bật sqlcmd mode trong SSMS: Menu Tools → Options → Query Execution → SQL Server → By Default...
-- hoặc Query menu → SQLCMD Mode
-- ═══════════════════════════════════════════════════════════════════════════
PRINT N'📦 Đang install Stored Procedures Module 1→10...';
GO

:r "Module 1 - API_GoiYDonHang_AI.sql"
:r "Module 2 - API_TuyenBanHang_AI.sql"
:r "Module 3 - API_ChamDiemKH_AI.sql"
:r "Module 4 - API_TichLuy_AI.sql"
:r "Module 5 - API_UpsellGoiY_AI.sql"
:r "Module 6 - API_DeXuatKhuyenMai_AI.sql"
:r "Module 8 - API_GoiYDonThuoc_AI.sql"
:r "Module 10 - API_SanPhamTrongTam_AI.sql"
:r "Module 10 - API_SanPhamTrongTam_Import_AI.sql"
:r "Module 10 - API_TraCuuSanPham_AI.sql"

PRINT N'✅ Đã install SP Module 1→10';
GO

-- ═══════════════════════════════════════════════════════════════════════════
-- BƯỚC 2: METADATA — API_Definition (Module 1→10)
-- ═══════════════════════════════════════════════════════════════════════════
INSERT INTO API_Definition (ApiCode, ApiName, ApiDescription, StoredProcedure, Category, IconEmoji, IsActive, OrderIndex)
VALUES
-- Nhóm: Bán hàng
('@goi_y_don_hang',     N'Gợi ý đơn hàng',              N'Gợi ý sản phẩm cá nhân hóa theo lịch sử mua hàng',      'API_GoiYDonHang_AI',            N'Bán hàng',   N'🛒', 1,  10),
('@upsell_goi_y',       N'Upsell & Gợi ý sản phẩm',     N'Gợi ý thêm sản phẩm để tăng giá trị đơn hàng',          'API_UpsellGoiY_AI',             N'Bán hàng',   N'✨', 1,  30),
('@goi_y_don_thuoc',    N'Gợi ý đơn thuốc',              N'Tìm thuốc theo triệu chứng & gợi ý bán chéo',            'API_GoiYDonThuoc_AI',           N'Bán hàng',   N'💊', 1,  40),

-- Nhóm: Tuyến & Khách hàng
('@tuyen_ban_hang',     N'Lịch tuyến bán hàng',          N'DS khách hàng cần ghé thăm hôm nay theo tuyến',          'API_TuyenBanHang_AI',           N'Khách hàng', N'🗺️', 1, 50),
('@cham_diem_kh',       N'Chấm điểm khách hàng',         N'Phân loại khách hàng A/B/C theo doanh số & xu hướng',    'API_ChamDiemKH_AI',             N'Khách hàng', N'⭐', 1,  60),

-- Nhóm: Tích lũy & Khuyến mãi
('@tich_luy',           N'Tích lũy chương trình',        N'Xem tiến độ tích lũy, gợi ý SP chưa mua trong kỳ',       'API_TichLuy_AI',                N'Khuyến mại', N'🎁', 1,  70),
('@san_pham_trong_tam', N'Sản phẩm trọng tâm',           N'Xem chương trình sản phẩm trọng tâm đang chạy',          'API_SanPhamTrongTam_AI',        N'Khuyến mại', N'🔥', 1,  80),
('@de_xuat_khuyen_mai', N'Đề xuất khuyến mãi',           N'AI gợi ý sản phẩm cần xả hàng hoặc chạy combo',         'API_DeXuatKhuyenMai_AI',        N'Khuyến mại', N'📢', 1,  90),
('@import_trong_tam',   N'Cập nhật chương trình trọng tâm', N'Import DS sản phẩm & mốc thưởng — CHỈ ADMIN',        'API_SanPhamTrongTam_Import_AI', N'Khuyến mại', N'📤', 0, 100),  -- 🔴 Disabled

-- Nhóm: Tra cứu
('@tra_cuu_san_pham',   N'Tra cứu sản phẩm',             N'Tìm sản phẩm theo tên/mã, xem giá và tồn kho',          'API_TraCuuSanPham_AI',          N'Tra cứu',    N'🔍', 1, 110);
GO
PRINT N'✅ Đã insert API_Definition cho 10 module';
GO

-- ═══════════════════════════════════════════════════════════════════════════
-- BƯỚC 3: API_Action
-- ═══════════════════════════════════════════════════════════════════════════
INSERT INTO API_Action (ApiID, ActionCode, ActionName, ExecutionType, IsConfirm, IsDefault, IsActive, OrderIndex)
SELECT ApiID, 'VIEW',   N'Xem gợi ý đơn hàng',           'QUERY',   0, 1, 1, 1 FROM API_Definition WHERE ApiCode = '@goi_y_don_hang'   UNION ALL
SELECT ApiID, 'VIEW',   N'Gợi ý Upsell',                  'QUERY',   0, 1, 1, 1 FROM API_Definition WHERE ApiCode = '@upsell_goi_y'      UNION ALL
SELECT ApiID, 'VIEW',   N'Tìm đơn thuốc',                 'QUERY',   0, 1, 1, 1 FROM API_Definition WHERE ApiCode = '@goi_y_don_thuoc'  UNION ALL
SELECT ApiID, 'VIEW',   N'Xem tuyến bán hàng',            'QUERY',   0, 1, 1, 1 FROM API_Definition WHERE ApiCode = '@tuyen_ban_hang'   UNION ALL
SELECT ApiID, 'VIEW',   N'Chấm điểm khách hàng',          'QUERY',   0, 1, 1, 1 FROM API_Definition WHERE ApiCode = '@cham_diem_kh'     UNION ALL
SELECT ApiID, 'VIEW',   N'Xem tích lũy',                  'QUERY',   0, 1, 1, 1 FROM API_Definition WHERE ApiCode = '@tich_luy'         UNION ALL
SELECT ApiID, 'VIEW',   N'Xem sản phẩm trọng tâm',        'QUERY',   0, 1, 1, 1 FROM API_Definition WHERE ApiCode = '@san_pham_trong_tam' UNION ALL
SELECT ApiID, 'VIEW',   N'Xem đề xuất khuyến mãi',        'QUERY', 0, 1, 1, 1 FROM API_Definition WHERE ApiCode = '@de_xuat_khuyen_mai' UNION ALL
SELECT ApiID, 'UPDATE', N'Cập nhật chương trình trọng tâm','QUERY', 1, 1, 1, 1 FROM API_Definition WHERE ApiCode = '@import_trong_tam' UNION ALL
SELECT ApiID, 'VIEW',   N'Tìm sản phẩm',                  'QUERY',   0, 1, 1, 1 FROM API_Definition WHERE ApiCode = '@tra_cuu_san_pham';
GO

-- ═══════════════════════════════════════════════════════════════════════════
-- BƯỚC 4: API_Field — Tham số từng SP
-- IsSystemParam = 1 → inject từ session, KHÔNG hiện UI
-- ═══════════════════════════════════════════════════════════════════════════

-- @goi_y_don_hang → API_GoiYDonHang_AI(@Username, @ObjectID, @TopN)
INSERT INTO API_Field (ApiID, FieldCode, FieldName, DataType, ControlType, IsRequired, IsSystemParam, DefaultValue, Placeholder, MinValue, MaxValue, DataSourceType, DataSourceValue, OrderIndex)
SELECT ApiID, '@Username', N'Người dùng',     'VARCHAR',  'hidden',          1,1,NULL, NULL,'','', NULL, NULL, 1 FROM API_Definition WHERE ApiCode = '@goi_y_don_hang' UNION ALL
SELECT ApiID, '@ObjectID', N'Mã khách hàng',  'VARCHAR',  'combobox',        0,0,NULL, N'Nhập mã/tên KH','','', 'APICODE', '@danh_muc|@Type=CUSTOMER', 2 FROM API_Definition WHERE ApiCode = '@goi_y_don_hang' UNION ALL
SELECT ApiID, '@TopN',     N'Số gợi ý',       'INT',      'number',          0,0,'10', NULL,'1','50', NULL, NULL, 3 FROM API_Definition WHERE ApiCode = '@goi_y_don_hang';

-- @upsell_goi_y → API_UpsellGoiY_AI(@Username, @ObjectID, @SearchKey, @TopN)
INSERT INTO API_Field (ApiID, FieldCode, FieldName, DataType, ControlType, IsRequired, IsSystemParam, DefaultValue, Placeholder, MinValue, MaxValue, DataSourceType, DataSourceValue, OrderIndex)
SELECT ApiID, '@Username',  N'Người dùng',          'VARCHAR','hidden',          1,1,NULL,  NULL,'','', NULL, NULL, 1 FROM API_Definition WHERE ApiCode = '@upsell_goi_y' UNION ALL
SELECT ApiID, '@ObjectID',  N'Mã khách hàng',       'VARCHAR','combobox',        0,0,NULL,  N'Nhập mã/tên KH','','', 'APICODE', '@danh_muc|@Type=CUSTOMER', 2 FROM API_Definition WHERE ApiCode = '@upsell_goi_y' UNION ALL
SELECT ApiID, '@SearchKey', N'Từ khóa/triệu chứng', 'VARCHAR','text',            0,0,NULL,  N'VD: ho, đau bụng, vitamin...','','', NULL, NULL, 3 FROM API_Definition WHERE ApiCode = '@upsell_goi_y' UNION ALL
SELECT ApiID, '@TopN',      N'Số sản phẩm',         'INT',    'number',          0,0,'10',  NULL,'1','50', NULL, NULL, 4 FROM API_Definition WHERE ApiCode = '@upsell_goi_y';

-- @goi_y_don_thuoc → API_GoiYDonThuoc_AI(@Keyword)
INSERT INTO API_Field (ApiID, FieldCode, FieldName, DataType, ControlType, IsRequired, IsSystemParam, DefaultValue, Placeholder, DataSourceType, DataSourceValue, OrderIndex)
SELECT ApiID, '@Keyword', N'Triệu chứng/Tên thuốc', 'VARCHAR', 'text', 1,0,NULL, N'VD: ho, sốt, Amoxicillin...', NULL, NULL, 1 FROM API_Definition WHERE ApiCode = '@goi_y_don_thuoc';

-- @tuyen_ban_hang → API_TuyenBanHang_AI(@Username, @ObjectID, @SoNgayVangMat, @TopN)
INSERT INTO API_Field (ApiID, FieldCode, FieldName, DataType, ControlType, IsRequired, IsSystemParam, DefaultValue, Placeholder, MinValue, MaxValue, DataSourceType, DataSourceValue, OrderIndex)
SELECT ApiID, '@Username',      N'Người dùng',               'VARCHAR','hidden',          1,1,NULL, NULL,'','', NULL, NULL, 1 FROM API_Definition WHERE ApiCode = '@tuyen_ban_hang' UNION ALL
SELECT ApiID, '@ObjectID',      N'Mã khách hàng',            'VARCHAR','combobox',        0,0,NULL, N'Để trống = toàn tuyến','','', 'APICODE', '@danh_muc|@Type=CUSTOMER', 2 FROM API_Definition WHERE ApiCode = '@tuyen_ban_hang' UNION ALL
SELECT ApiID, '@SoNgayVangMat', N'Vắng ít nhất (ngày)',      'INT',    'number',          0,0,'45', NULL,'1','365', NULL, NULL, 3 FROM API_Definition WHERE ApiCode = '@tuyen_ban_hang' UNION ALL
SELECT ApiID, '@TopN',          N'Số khách hàng',            'INT',    'number',          0,0,'8',  NULL,'1','50',  NULL, NULL, 4 FROM API_Definition WHERE ApiCode = '@tuyen_ban_hang';

-- @cham_diem_kh → API_ChamDiemKH_AI(@Username, @ObjectID, @NhomFilter)
INSERT INTO API_Field (ApiID, FieldCode, FieldName, DataType, ControlType, IsRequired, IsSystemParam, DefaultValue, Placeholder, OptionsJson, DataSourceType, DataSourceValue, OrderIndex)
SELECT ApiID, '@Username',   N'Người dùng',     'VARCHAR','hidden',          1,1,NULL,NULL,NULL, NULL, NULL, 1 FROM API_Definition WHERE ApiCode = '@cham_diem_kh' UNION ALL
SELECT ApiID, '@ObjectID',   N'Mã khách hàng',  'VARCHAR','combobox',        0,0,NULL,N'Để trống = tất cả',NULL, 'APICODE', '@danh_muc|@Type=CUSTOMER', 2 FROM API_Definition WHERE ApiCode = '@cham_diem_kh' UNION ALL
SELECT ApiID, '@NhomFilter', N'Nhóm KH',        'VARCHAR','select',          0,0,'',  NULL,
    N'[{"value":"","label":"Tất cả"},{"value":"A","label":"A - VIP (≥50tr)"},{"value":"B","label":"B - Ổn định (≥30tr)"},{"value":"C","label":"C - Nguy cơ rời bỏ"}]', NULL, NULL, 3 FROM API_Definition WHERE ApiCode = '@cham_diem_kh';

-- @tich_luy → API_TichLuy_AI(@Username, @ObjectID, @ProgramID, @FromDate, @ToDate, @ItemIDs)
INSERT INTO API_Field (ApiID, FieldCode, FieldName, DataType, ControlType, IsRequired, IsSystemParam, DefaultValue, Placeholder, DataSourceType, DataSourceValue, OrderIndex)
SELECT ApiID, '@Username',  N'Người dùng',      'VARCHAR',  'hidden',          1,1,NULL,               NULL,                                NULL, NULL, 1 FROM API_Definition WHERE ApiCode = '@tich_luy' UNION ALL
SELECT ApiID, '@ObjectID',  N'Mã khách hàng',   'VARCHAR',  'combobox',        0,0,NULL,               N'Để trống = tổng hợp',             'APICODE', '@danh_muc|@Type=CUSTOMER', 2 FROM API_Definition WHERE ApiCode = '@tich_luy' UNION ALL
SELECT ApiID, '@ProgramID', N'Mã chương trình', 'VARCHAR',  'text',            0,0,NULL,               N'Để trống = CT đang chạy',          NULL, NULL, 3 FROM API_Definition WHERE ApiCode = '@tich_luy' UNION ALL
SELECT ApiID, '@FromDate',  N'Từ ngày',          'DATETIME', 'date',            0,0,'THIS_MONTH_START', NULL,                                NULL, NULL, 4 FROM API_Definition WHERE ApiCode = '@tich_luy' UNION ALL
SELECT ApiID, '@ToDate',    N'Đến ngày',         'DATETIME', 'date',            0,0,'TODAY',            NULL,                                NULL, NULL, 5 FROM API_Definition WHERE ApiCode = '@tich_luy' UNION ALL
SELECT ApiID, '@ItemIDs',   N'Lọc sản phẩm',    'VARCHAR',  'text',            0,0,NULL,               N'VD: SP001,SP002 (để trống = tất cả)', NULL, NULL, 6 FROM API_Definition WHERE ApiCode = '@tich_luy';

-- @san_pham_trong_tam → API_SanPhamTrongTam_AI(@Username, @ObjectID, @TopN)
INSERT INTO API_Field (ApiID, FieldCode, FieldName, DataType, ControlType, IsRequired, IsSystemParam, DefaultValue, MinValue, MaxValue, DataSourceType, DataSourceValue, OrderIndex)
SELECT ApiID, '@Username', N'Người dùng',   'VARCHAR','hidden',          1,1,NULL, '','',  NULL, NULL, 1 FROM API_Definition WHERE ApiCode = '@san_pham_trong_tam' UNION ALL
SELECT ApiID, '@ObjectID', N'Mã khách hàng','VARCHAR','combobox',        0,0,NULL, '','',  'APICODE', '@danh_muc|@Type=CUSTOMER', 2 FROM API_Definition WHERE ApiCode = '@san_pham_trong_tam' UNION ALL
SELECT ApiID, '@TopN',     N'Số sản phẩm',  'INT',    'number',          0,0,'500','1','999', NULL, NULL, 3 FROM API_Definition WHERE ApiCode = '@san_pham_trong_tam';

-- @de_xuat_khuyen_mai → API_DeXuatKhuyenMai_AI(@Username)
INSERT INTO API_Field (ApiID, FieldCode, FieldName, DataType, ControlType, IsRequired, IsSystemParam, DefaultValue, DataSourceType, DataSourceValue, OrderIndex)
SELECT ApiID, '@Username', N'Người dùng', 'VARCHAR','hidden', 1,1,NULL, NULL, NULL, 1 FROM API_Definition WHERE ApiCode = '@de_xuat_khuyen_mai';

-- @import_trong_tam → API_SanPhamTrongTam_Import_AI(@DocumentID, @FromDate, @ToDate, @Memo, @JsonItems, @JsonRules)
INSERT INTO API_Field (ApiID, FieldCode, FieldName, DataType, ControlType, IsRequired, IsSystemParam, DefaultValue, Placeholder, DataSourceType, DataSourceValue, OrderIndex)
SELECT ApiID, '@DocumentID', N'Mã chương trình',   'VARCHAR',  'text',     1,0,NULL, N'VD: SPTT-2026-04',                                      NULL, NULL, 1 FROM API_Definition WHERE ApiCode = '@import_trong_tam' UNION ALL
SELECT ApiID, '@FromDate',   N'Từ ngày',             'DATETIME', 'date',     1,0,NULL, NULL,                                                    NULL, NULL, 2 FROM API_Definition WHERE ApiCode = '@import_trong_tam' UNION ALL
SELECT ApiID, '@ToDate',     N'Đến ngày',            'DATETIME', 'date',     1,0,NULL, NULL,                                                    NULL, NULL, 3 FROM API_Definition WHERE ApiCode = '@import_trong_tam' UNION ALL
SELECT ApiID, '@Memo',       N'Tên chương trình',    'VARCHAR',  'text',     1,0,NULL, N'VD: CT Tháng 04/2026',                                  NULL, NULL, 4 FROM API_Definition WHERE ApiCode = '@import_trong_tam' UNION ALL
SELECT ApiID, '@JsonItems',  N'DS sản phẩm (JSON)',  'JSON',     'textarea', 0,0,NULL, N'[{"ItemID":"SP001","Notes":"..."}]',                    NULL, NULL, 5 FROM API_Definition WHERE ApiCode = '@import_trong_tam' UNION ALL
SELECT ApiID, '@JsonRules',  N'Mốc thưởng (JSON)',   'JSON',     'textarea', 0,0,NULL, N'[{"TuDiem":10000000,"DenDiem":19999999,"QuaTang":"A"}]', NULL, NULL, 6 FROM API_Definition WHERE ApiCode = '@import_trong_tam';

-- @tra_cuu_san_pham → API_TraCuuSanPham_AI(@SearchKey, @TopN)
INSERT INTO API_Field (ApiID, FieldCode, FieldName, DataType, ControlType, IsRequired, IsSystemParam, DefaultValue, Placeholder, MinValue, MaxValue, DataSourceType, DataSourceValue, OrderIndex)
SELECT ApiID, '@SearchKey', N'Từ khóa tìm kiếm', 'VARCHAR','text',   0,0,NULL, N'Nhập tên hoặc mã SP...','','',   NULL, NULL, 1 FROM API_Definition WHERE ApiCode = '@tra_cuu_san_pham' UNION ALL
SELECT ApiID, '@TopN',      N'Số kết quả',        'INT',    'number', 0,0,'50', NULL,'1','500', NULL, NULL, 2 FROM API_Definition WHERE ApiCode = '@tra_cuu_san_pham';
GO

-- ═══════════════════════════════════════════════════════════════════════════
-- BƯỚC 5: API_Action_Field — Map field → action
-- ═══════════════════════════════════════════════════════════════════════════
INSERT INTO API_Action_Field (ActionID, FieldID, IsVisible, IsEditable, IsRequired)
SELECT A.ActionID, F.FieldID,
    CASE WHEN F.IsSystemParam = 1 THEN 0 ELSE 1 END,
    CASE WHEN F.IsSystemParam = 1 THEN 0 ELSE 1 END,
    F.IsRequired
FROM API_Action A
JOIN API_Field F ON A.ApiID = F.ApiID;
GO

-- ═══════════════════════════════════════════════════════════════════════════
-- BƯỚC 6: API_Filter
-- ═══════════════════════════════════════════════════════════════════════════

-- @goi_y_don_hang
INSERT INTO API_Filter (ApiID, FieldCode, FieldName, DataType, ControlType, Operator, DefaultValue, Placeholder, DataSourceType, DataSourceValue, OrderIndex)
SELECT ApiID, '@ObjectID', N'Mã/Tên KH',      'VARCHAR','combobox',       '=',  NULL, N'Nhập mã hoặc tên KH', 'APICODE', '@danh_muc|@Type=CUSTOMER', 1 FROM API_Definition WHERE ApiCode = '@goi_y_don_hang' UNION ALL
SELECT ApiID, '@TopN',     N'Top N sản phẩm',  'INT',    'number',         '=',  '10', NULL, NULL, NULL, 2 FROM API_Definition WHERE ApiCode = '@goi_y_don_hang';

-- @upsell_goi_y
INSERT INTO API_Filter (ApiID, FieldCode, FieldName, DataType, ControlType, Operator, DefaultValue, Placeholder, DataSourceType, DataSourceValue, OrderIndex)
SELECT ApiID, '@ObjectID',  N'Mã/Tên KH',            'VARCHAR','combobox',       '=',   NULL, N'Nhập mã hoặc tên KH',        'APICODE', '@danh_muc|@Type=CUSTOMER', 1 FROM API_Definition WHERE ApiCode = '@upsell_goi_y' UNION ALL
SELECT ApiID, '@SearchKey', N'Từ khóa/Triệu chứng',  'VARCHAR','text',           'LIKE',NULL, N'VD: ho, sốt, Amoxicillin...', NULL, NULL, 2 FROM API_Definition WHERE ApiCode = '@upsell_goi_y';

-- @tuyen_ban_hang
INSERT INTO API_Filter (ApiID, FieldCode, FieldName, DataType, ControlType, Operator, DefaultValue, Placeholder, DataSourceType, DataSourceValue, OrderIndex)
SELECT ApiID, '@ObjectID',      N'Mã khách hàng',       'VARCHAR','combobox',       '=', NULL, NULL, 'APICODE', '@danh_muc|@Type=CUSTOMER', 1 FROM API_Definition WHERE ApiCode = '@tuyen_ban_hang' UNION ALL
SELECT ApiID, '@SoNgayVangMat', N'Vắng ít nhất (ngày)', 'INT',    'number',         '>=','45',  NULL, NULL, NULL, 2 FROM API_Definition WHERE ApiCode = '@tuyen_ban_hang';

-- @cham_diem_kh
INSERT INTO API_Filter (ApiID, FieldCode, FieldName, DataType, ControlType, Operator, DefaultValue, OptionsJson, DataSourceType, DataSourceValue, OrderIndex)
SELECT ApiID, '@ObjectID',   N'Mã khách hàng',  'VARCHAR','combobox',       '=', NULL, NULL, 'APICODE', '@danh_muc|@Type=CUSTOMER', 1 FROM API_Definition WHERE ApiCode = '@cham_diem_kh' UNION ALL
SELECT ApiID, '@NhomFilter', N'Nhóm KH',        'VARCHAR','select',         '=', NULL,
    N'[{"value":"","label":"Tất cả"},{"value":"A","label":"A - VIP"},{"value":"B","label":"B - Ổn định"},{"value":"C","label":"C - Rời bỏ"}]',
    NULL, NULL, 2 FROM API_Definition WHERE ApiCode = '@cham_diem_kh';

-- @tich_luy
INSERT INTO API_Filter (ApiID, FieldCode, FieldName, DataType, ControlType, Operator, DefaultValue, Placeholder, DataSourceType, DataSourceValue, OrderIndex)
SELECT ApiID, '@ObjectID', N'Mã khách hàng', 'VARCHAR',  'combobox',       '=',  NULL,               N'Để trống = tổng hợp', 'APICODE', '@danh_muc|@Type=CUSTOMER', 1 FROM API_Definition WHERE ApiCode = '@tich_luy' UNION ALL
SELECT ApiID, '@FromDate', N'Từ ngày',        'DATETIME', 'date',           '>=', 'THIS_MONTH_START', NULL,                   NULL, NULL, 2 FROM API_Definition WHERE ApiCode = '@tich_luy' UNION ALL
SELECT ApiID, '@ToDate',   N'Đến ngày',       'DATETIME', 'date',           '<=', 'TODAY',            NULL,                   NULL, NULL, 3 FROM API_Definition WHERE ApiCode = '@tich_luy';

-- @tra_cuu_san_pham
INSERT INTO API_Filter (ApiID, FieldCode, FieldName, DataType, ControlType, Operator, DefaultValue, Placeholder, DataSourceType, DataSourceValue, OrderIndex)
SELECT ApiID, '@SearchKey', N'Tên/Mã sản phẩm', 'VARCHAR','text','LIKE',NULL, N'Nhập tên hoặc mã SP...', NULL, NULL, 1 FROM API_Definition WHERE ApiCode = '@tra_cuu_san_pham';

-- @import_trong_tam
INSERT INTO API_Bulk_Config (ApiID, AllowUpload, AllowMultiSelect, TemplateUrl, MaxRows)
SELECT ApiID, 1, 0, '/templates/import_trong_tam_template.xlsx', 500
FROM API_Definition WHERE ApiCode = '@import_trong_tam';
GO

-- ═══════════════════════════════════════════════════════════════════════════
-- BƯỚC 7: VIEW + HELPER SPs
-- ═══════════════════════════════════════════════════════════════════════════
IF OBJECT_ID('API_FullConfig_View','V') IS NOT NULL DROP VIEW API_FullConfig_View;
GO
CREATE VIEW API_FullConfig_View AS
SELECT
    D.ApiID, D.ApiCode, D.ApiName, D.StoredProcedure, D.Category, D.IconEmoji,
    A.ActionID, A.ActionCode, A.ExecutionType,
    F.FieldID, F.FieldCode, F.FieldName, F.DataType, F.ControlType,
    F.IsRequired, F.IsSystemParam, F.DefaultValue, F.Placeholder,
    F.MinValue, F.MaxValue, F.OptionsJson, F.OrderIndex AS FieldOrder,
    AAF.IsVisible, AAF.IsEditable
FROM API_Definition D
JOIN API_Action A      ON A.ApiID   = D.ApiID AND A.IsDefault = 1 AND A.IsActive = 1
JOIN API_Field F       ON F.ApiID   = D.ApiID
JOIN API_Action_Field AAF ON AAF.ActionID = A.ActionID AND AAF.FieldID = F.FieldID
WHERE D.IsActive = 1 AND AAF.IsVisible = 1;
GO

IF OBJECT_ID('API_GetConfig','P') IS NOT NULL DROP PROCEDURE API_GetConfig;
GO
CREATE PROCEDURE API_GetConfig @ApiCode VARCHAR(100) = ''
AS
BEGIN
    SET NOCOUNT ON;
    -- 1: API + Action info
    SELECT D.ApiID, D.ApiCode, D.ApiName, D.ApiDescription, D.StoredProcedure, D.Category, D.IconEmoji,
           A.ActionID, A.ActionCode, A.ExecutionType, A.IsConfirm
    FROM API_Definition D
    JOIN API_Action A ON A.ApiID = D.ApiID AND A.IsDefault = 1
    WHERE (@ApiCode = '' OR D.ApiCode = @ApiCode) AND D.IsActive = 1 AND A.IsActive = 1
    ORDER BY D.OrderIndex;
    -- 2: Fields
    SELECT F.FieldID, F.ApiID, F.FieldCode, F.FieldName, F.DataType, F.ControlType,
           F.IsRequired, F.IsSystemParam, F.DefaultValue, F.Placeholder,
           F.MinValue, F.MaxValue, F.OptionsJson,
           F.DataSourceType, F.DataSourceValue,
           F.OrderIndex
    FROM API_Field F JOIN API_Definition D ON D.ApiID = F.ApiID
    WHERE (@ApiCode = '' OR D.ApiCode = @ApiCode) AND D.IsActive = 1
    ORDER BY D.OrderIndex, F.OrderIndex;
    -- 3: Filters
    SELECT FL.FilterID, FL.ApiID, FL.FieldCode, FL.FieldName, FL.DataType, FL.ControlType,
           FL.Operator, FL.DefaultValue, FL.Placeholder, FL.OptionsJson, 
           FL.DataSourceType, FL.DataSourceValue,
           FL.IsRequired, FL.OrderIndex
    FROM API_Filter FL JOIN API_Definition D ON D.ApiID = FL.ApiID
    WHERE (@ApiCode = '' OR D.ApiCode = @ApiCode) AND D.IsActive = 1
    ORDER BY D.OrderIndex, FL.OrderIndex;
    -- 4: Bulk config
    SELECT BC.ApiID, BC.AllowUpload, BC.AllowMultiSelect, BC.TemplateUrl, BC.MaxRows
    FROM API_Bulk_Config BC JOIN API_Definition D ON D.ApiID = BC.ApiID
    WHERE (@ApiCode = '' OR D.ApiCode = @ApiCode);
END
GO

IF OBJECT_ID('API_ListActive','P') IS NOT NULL DROP PROCEDURE API_ListActive;
GO
CREATE PROCEDURE API_ListActive @SearchKey NVARCHAR(100) = ''
AS
BEGIN
    SET NOCOUNT ON;
    SELECT D.ApiCode,
           D.IconEmoji + N' ' + D.ApiName AS DisplayName,
           D.ApiDescription, D.Category, A.ExecutionType
    FROM API_Definition D
    JOIN API_Action A ON A.ApiID = D.ApiID AND A.IsDefault = 1
    WHERE D.IsActive = 1 AND A.IsActive = 1
      AND (@SearchKey = ''
           OR D.ApiCode  LIKE '%' + @SearchKey + '%'
           OR D.ApiName  COLLATE Vietnamese_CI_AS LIKE N'%' + @SearchKey + N'%'
           OR D.Category COLLATE Vietnamese_CI_AS LIKE N'%' + @SearchKey + N'%')
    ORDER BY D.Category, D.OrderIndex;
END
GO

-- ═══════════════════════════════════════════════════════════════════════════
-- KIỂM TRA
-- ═══════════════════════════════════════════════════════════════════════════
SELECT D.ApiCode, D.IconEmoji + N' ' + D.ApiName AS API,
    A.ExecutionType,
    CASE D.IsActive WHEN 1 THEN N'✅ Active' ELSE N'🔴 Disabled' END AS [Trạng thái],
    (SELECT COUNT(*) FROM API_Field  F  WHERE F.ApiID  = D.ApiID AND F.IsSystemParam = 0) AS [Field UI],
    (SELECT COUNT(*) FROM API_Filter FL WHERE FL.ApiID = D.ApiID) AS [Filter]
FROM API_Definition D
JOIN API_Action A ON A.ApiID = D.ApiID AND A.IsDefault = 1
ORDER BY D.OrderIndex;
GO

PRINT N'';
PRINT N'🎉 Schema_API_Metadata.sql hoàn tất!';
PRINT N'   ✅ 6 bảng schema';
PRINT N'   ✅ 10 APIs (Module 1→10)';
PRINT N'   🔴 Disabled: @import_trong_tam (chỉ Admin)';
PRINT N'   ▶️  Tiếp theo: chạy Schema_API_Metadata_Patch.sql để thêm Module Common';
GO

/* ── TEST ──────────────────────────────────────────────────────────
EXEC API_ListActive;
EXEC API_GetConfig '@goi_y_don_hang';
EXEC API_GetConfig '@tich_luy';
SELECT * FROM API_FullConfig_View WHERE ApiCode = '@cham_diem_kh';
─────────────────────────────────────────────────────────────────── */
