-- ═══════════════════════════════════════════════════════════════════════════
-- Schema_API_Metadata_Patch.sql
-- PHẦN 2: Module Common APIs
-- Chạy SAU Schema_API_Metadata.sql
--
-- Bao gồm:
--   Module common - API_DonHangChiTiet_Insert_AI  → @tao_don_hang
--   Module common - API_DoanhSo_AI                → @xem_doanh_so    (🔴 Disabled mặc định)
--   Module common - API_DonHang_AI                → @xem_don_hang
--   Module common - API_HoaDon_AI                 → @xem_hoa_don
--   Module common - API_CongNoKhachHang_AI        → @cong_no_kh
--   Module common - API_CongNoChiTiet_AI          → @cong_no_chi_tiet
--   Module common - API_DanhMuc_AI                → @danh_muc
--   Module common - API_GetTonKho_List_AI         → @ton_kho_list
-- ═══════════════════════════════════════════════════════════════════════════
USE [medtest]
GO

-- ═══════════════════════════════════════════════════════════════════════════
-- BƯỚC 1: CÀI ĐẶT STORED PROCEDURES — Module Common
-- Bật sqlcmd mode: Query menu → SQLCMD Mode
-- ═══════════════════════════════════════════════════════════════════════════
PRINT N'📦 Đang install Stored Procedures Module Common...';
GO

:r "Module common - API_DonHangChiTiet_Insert_AI.sql"
:r "Module common - API_DoanhSo_AI.sql"
:r "Module common - API_DonHang_AI.sql"
:r "Module common - API_HoaDon_AI.sql"
:r "Module common - API_CongNoKhachHang_AI"
:r "Module common - API_CongNoChiTiet_AI"
:r "Module common - API_DanhMuc_AI"
:r "Module common - API_GetTonKho_List_AI"
:r "Module common - API_ThemKhachHang_AI.sql"

PRINT N'✅ Đã install SP Module Common';
GO

-- ═══════════════════════════════════════════════════════════════════════════
-- BƯỚC 2: METADATA — API_Definition (Module Common)
-- ═══════════════════════════════════════════════════════════════════════════
INSERT INTO API_Definition (ApiCode, ApiName, ApiDescription, StoredProcedure, Category, IconEmoji, IsActive, OrderIndex)
VALUES
-- Nhóm: Bán hàng    
('@tao_don_hang',       N'Tạo đơn hàng',            N'Tạo đơn hàng mới với danh sách sản phẩm tự chọn',                  'API_DonHangChiTiet_Insert_AI', N'Bán hàng', N'📝', 1,  20),
('@them_khach_hang',    N'Thêm khách hàng',         N'Tạo nhanh hồ sơ khách hàng mới vào hệ thống',                      'API_ThemKhachHang_AI',         N'Khách hàng', N'👤+', 1, 55),

-- Nhóm: Tra cứu
('@xem_hoa_don',        N'Xem hóa đơn',              N'Tra cứu DS hóa đơn theo ngày và khách hàng',                       'API_HoaDon_AI',                N'Tra cứu',  N'🧾', 1, 120),
('@xem_don_hang',       N'Xem đơn hàng',             N'Tra cứu DS đơn hàng theo trạng thái và ngày',                      'API_DonHang_AI',               N'Tra cứu',  N'📋', 1, 130),
('@xem_doanh_so',       N'Xem doanh số',             N'Báo cáo doanh số NV/KH/SP — chỉ Manager trở lên',                 'API_DoanhSo_AI',               N'Tra cứu',  N'📊', 0, 140),  -- 🔴 Disabled
('@cong_no_kh',         N'Công nợ khách hàng',       N'Xem tổng công nợ hoặc top 20 KH nợ cao nhất',                      'API_CongNoKhachHang_AI',       N'Tra cứu',  N'💳', 1, 150),
('@cong_no_chi_tiet',   N'Chi tiết công nợ',         N'Xem từng hóa đơn còn nợ — bắt buộc nhập mã KH',                  'API_CongNoChiTiet_AI',         N'Tra cứu',  N'🧾', 1, 160),
('@danh_muc',           N'Tra cứu danh mục',         N'Tìm nhanh: KH, sản phẩm, kho, đơn hàng, nhân viên',               'API_DanhMuc_AI',               N'Tra cứu',  N'📚', 1, 170),
('@ton_kho_list',       N'Tồn kho chi tiết',         N'Xem tồn kho theo lô, hạn dùng, kho hàng của từng sản phẩm',       'API_GetTonKho_List_AI',        N'Tra cứu',  N'🏭', 1, 180);
GO
PRINT N'✅ Đã insert API_Definition cho 8 module common';
GO

-- ═══════════════════════════════════════════════════════════════════════════
-- BƯỚC 3: API_Action
-- ═══════════════════════════════════════════════════════════════════════════
INSERT INTO API_Action (ApiID, ActionCode, ActionName, ExecutionType, IsConfirm, IsDefault, IsActive, OrderIndex)
SELECT ApiID, 'CREATE', N'Tạo đơn hàng mới',       'CART',  1, 1, 1, 1 FROM API_Definition WHERE ApiCode = '@tao_don_hang'      UNION ALL
SELECT ApiID, 'INSERT', N'Thêm khách hàng',         'QUERY', 1, 1, 1, 1 FROM API_Definition WHERE ApiCode = '@them_khach_hang'     UNION ALL
SELECT ApiID, 'VIEW',   N'Tra cứu hóa đơn',         'QUERY', 0, 1, 1, 1 FROM API_Definition WHERE ApiCode = '@xem_hoa_don'       UNION ALL
SELECT ApiID, 'VIEW',   N'Tra cứu đơn hàng',        'QUERY', 0, 1, 1, 1 FROM API_Definition WHERE ApiCode = '@xem_don_hang'      UNION ALL
SELECT ApiID, 'VIEW',   N'Xem báo cáo doanh số',    'QUERY', 0, 1, 1, 1 FROM API_Definition WHERE ApiCode = '@xem_doanh_so'      UNION ALL
SELECT ApiID, 'VIEW',   N'Xem công nợ KH',          'QUERY', 0, 1, 1, 1 FROM API_Definition WHERE ApiCode = '@cong_no_kh'        UNION ALL
SELECT ApiID, 'VIEW',   N'Xem chi tiết công nợ',    'QUERY', 0, 1, 1, 1 FROM API_Definition WHERE ApiCode = '@cong_no_chi_tiet'  UNION ALL
SELECT ApiID, 'VIEW',   N'Tìm kiếm danh mục',       'QUERY', 0, 1, 1, 1 FROM API_Definition WHERE ApiCode = '@danh_muc'          UNION ALL
SELECT ApiID, 'VIEW',   N'Xem tồn kho chi tiết',    'QUERY', 0, 1, 1, 1 FROM API_Definition WHERE ApiCode = '@ton_kho_list';
GO

-- ═══════════════════════════════════════════════════════════════════════════
-- BƯỚC 4: API_Field
-- ═══════════════════════════════════════════════════════════════════════════

-- @tao_don_hang → API_DonHangChiTiet_Insert_AI(@Username, @DocumentID, @ObjectID, @ItemList)
INSERT INTO API_Field (ApiID, FieldCode, FieldName, DataType, ControlType, IsRequired, IsSystemParam, DefaultValue, Placeholder, DataSourceType, DataSourceValue, OrderIndex)
SELECT ApiID, '@Username',   N'Người dùng',         'VARCHAR', 'hidden',          1,1,NULL, NULL,                      NULL, NULL, 1 FROM API_Definition WHERE ApiCode = '@tao_don_hang' UNION ALL
SELECT ApiID, '@ObjectID',   N'Khách hàng',          'VARCHAR', 'combobox',        1,0,NULL, N'Nhập mã/tên KH',         'APICODE', '@danh_muc|@Type=CUSTOMER', 2 FROM API_Definition WHERE ApiCode = '@tao_don_hang' UNION ALL
SELECT ApiID, '@DocumentID', N'Mã đơn hàng',         'VARCHAR', 'text',            0,0,NULL, N'Tự sinh nếu để trống',   NULL, NULL, 3 FROM API_Definition WHERE ApiCode = '@tao_don_hang' UNION ALL
SELECT ApiID, '@ItemList',   N'Danh sách sản phẩm',  'JSON',    'cart_items',      1,0,'[]', NULL,                      NULL, NULL, 4 FROM API_Definition WHERE ApiCode = '@tao_don_hang';

-- @them_khach_hang → API_ThemKhachHang_AI(@Username, @TenKhachHang, @SoDienThoai, @DiaChi, @ObjectGroupID)
INSERT INTO API_Field (ApiID, FieldCode, FieldName, DataType, ControlType, IsRequired, IsSystemParam, DefaultValue, Placeholder, DataSourceType, DataSourceValue, OrderIndex)
SELECT ApiID, '@Username',      N'Người dùng',     'VARCHAR', 'hidden',          1,1,NULL, NULL,                      NULL, NULL, 1 FROM API_Definition WHERE ApiCode = '@them_khach_hang' UNION ALL
SELECT ApiID, '@TenKhachHang',  N'Tên khách hàng', 'NVARCHAR', 'text',            1,0,NULL, N'Nhập tên đầy đủ...',     NULL, NULL, 2 FROM API_Definition WHERE ApiCode = '@them_khach_hang' UNION ALL
SELECT ApiID, '@SoDienThoai',   N'Số điện thoại',  'VARCHAR',  'text',            1,0,NULL, N'Nhập số điện thoại...',  NULL, NULL, 3 FROM API_Definition WHERE ApiCode = '@them_khach_hang' UNION ALL
SELECT ApiID, '@DiaChi',        N'Địa chỉ',       'NVARCHAR', 'text',            0,0,NULL, N'Nhập địa chỉ...',        NULL, NULL, 4 FROM API_Definition WHERE ApiCode = '@them_khach_hang' UNION ALL
SELECT ApiID, '@ObjectGroupID', N'Nhóm khách hàng','VARCHAR',  'select',          0,0,'KH', NULL,                      'STATIC', N'[{"value":"KH","label":"Khách hàng"},{"value":"DAILY","label":"Đại lý"}]', 5 FROM API_Definition WHERE ApiCode = '@them_khach_hang';

-- @xem_hoa_don → API_HoaDon_AI(@Username, @FromDate, @ToDate, @SearchText)
INSERT INTO API_Field (ApiID, FieldCode, FieldName, DataType, ControlType, IsRequired, IsSystemParam, DefaultValue, Placeholder, DataSourceType, DataSourceValue, OrderIndex)
SELECT ApiID, '@Username',   N'Người dùng', 'VARCHAR',  'hidden', 1,1,NULL,           NULL,                   NULL, NULL, 1 FROM API_Definition WHERE ApiCode = '@xem_hoa_don' UNION ALL
SELECT ApiID, '@FromDate',   N'Từ ngày',    'DATETIME', 'date',   0,0,'LAST_10_DAYS', NULL,                   NULL, NULL, 2 FROM API_Definition WHERE ApiCode = '@xem_hoa_don' UNION ALL
SELECT ApiID, '@ToDate',     N'Đến ngày',   'DATETIME', 'date',   0,0,'TODAY',        NULL,                   NULL, NULL, 3 FROM API_Definition WHERE ApiCode = '@xem_hoa_don' UNION ALL
SELECT ApiID, '@SearchText', N'Tìm kiếm',   'VARCHAR',  'text',   0,0,NULL,           N'Tên/SĐT/địa chỉ KH',  NULL, NULL, 4 FROM API_Definition WHERE ApiCode = '@xem_hoa_don';

-- @xem_don_hang → API_DonHang_AI(@Username, @FromDate, @ToDate, @StatusID, @StatusName, @EmployeeID, @ObjectID, @SearchText, @TopN)
INSERT INTO API_Field (ApiID, FieldCode, FieldName, DataType, ControlType, IsRequired, IsSystemParam, DefaultValue, Placeholder, OptionsJson, DataSourceType, DataSourceValue, OrderIndex)
SELECT ApiID, '@Username',   N'Người dùng',   'VARCHAR',  'hidden',          1,1,NULL,           NULL,                 NULL, NULL, NULL, 1 FROM API_Definition WHERE ApiCode = '@xem_don_hang' UNION ALL
SELECT ApiID, '@FromDate',   N'Từ ngày',       'DATETIME', 'date',            0,0,'LAST_30_DAYS', NULL,                 NULL, NULL, NULL, 2 FROM API_Definition WHERE ApiCode = '@xem_don_hang' UNION ALL
SELECT ApiID, '@ToDate',     N'Đến ngày',      'DATETIME', 'date',            0,0,'TODAY',        NULL,                 NULL, NULL, NULL, 3 FROM API_Definition WHERE ApiCode = '@xem_don_hang' UNION ALL
SELECT ApiID, '@ObjectID',   N'Mã khách hàng', 'VARCHAR',  'combobox',        0,0,NULL,           N'Để trống = tất cả', NULL, 'APICODE', '@danh_muc|@Type=CUSTOMER', 4 FROM API_Definition WHERE ApiCode = '@xem_don_hang' UNION ALL
SELECT ApiID, '@StatusName', N'Trạng thái',    'VARCHAR',  'select',          0,0,NULL,           NULL,
    N'[{"value":"","label":"Tất cả"},{"value":"Chờ duyệt","label":"Chờ duyệt"},{"value":"Đã duyệt","label":"Đã duyệt"},{"value":"Đang giao","label":"Đang giao"},{"value":"Hoàn thành","label":"Hoàn thành"},{"value":"Hủy","label":"Đã hủy"}]', NULL, NULL,
    5 FROM API_Definition WHERE ApiCode = '@xem_don_hang' UNION ALL
SELECT ApiID, '@TopN',       N'Số đơn hàng',   'INT',      'number',          0,0,'10',           NULL,                 NULL, NULL, NULL, 6 FROM API_Definition WHERE ApiCode = '@xem_don_hang';

-- @xem_doanh_so → API_DoanhSo_AI(@Username, @ObjectID, @ObjectName, @EmployeeID, @EmployeeName, @ItemName, @FromDate, @ToDate, @TopN)
INSERT INTO API_Field (ApiID, FieldCode, FieldName, DataType, ControlType, IsRequired, IsSystemParam, DefaultValue, Placeholder, MinValue, MaxValue, DataSourceType, DataSourceValue, OrderIndex)
SELECT ApiID, '@Username',     N'Người dùng',    'VARCHAR',  'hidden',          1,1,NULL,           NULL,                    '','',    NULL, NULL, 1 FROM API_Definition WHERE ApiCode = '@xem_doanh_so' UNION ALL
SELECT ApiID, '@FromDate',     N'Từ ngày',        'DATETIME', 'date',            0,0,'LAST_30_DAYS', NULL,                    '','',    NULL, NULL, 2 FROM API_Definition WHERE ApiCode = '@xem_doanh_so' UNION ALL
SELECT ApiID, '@ToDate',       N'Đến ngày',       'DATETIME', 'date',            0,0,'TODAY',        NULL,                    '','',    NULL, NULL, 3 FROM API_Definition WHERE ApiCode = '@xem_doanh_so' UNION ALL
SELECT ApiID, '@ObjectID',     N'Mã khách hàng',  'VARCHAR',  'combobox',        0,0,NULL,           N'Để trống = tất cả',    '','',    'APICODE', '@danh_muc|@Type=CUSTOMER', 4 FROM API_Definition WHERE ApiCode = '@xem_doanh_so' UNION ALL
SELECT ApiID, '@ObjectName',   N'Tên KH',         'VARCHAR',  'text',            0,0,NULL,           N'Tìm theo tên...',      '','',    NULL, NULL, 5 FROM API_Definition WHERE ApiCode = '@xem_doanh_so' UNION ALL
SELECT ApiID, '@EmployeeID',   N'Mã nhân viên',   'VARCHAR',  'text',            0,0,NULL,           N'Mã NV...',             '','',    NULL, NULL, 6 FROM API_Definition WHERE ApiCode = '@xem_doanh_so' UNION ALL
SELECT ApiID, '@EmployeeName', N'Tên nhân viên',  'VARCHAR',  'text',            0,0,NULL,           N'Tìm theo tên...',      '','',    NULL, NULL, 7 FROM API_Definition WHERE ApiCode = '@xem_doanh_so' UNION ALL
SELECT ApiID, '@ItemName',     N'Sản phẩm',       'VARCHAR',  'text',            0,0,NULL,           N'Lọc theo sản phẩm...', '','',    NULL, NULL, 8 FROM API_Definition WHERE ApiCode = '@xem_doanh_so' UNION ALL
SELECT ApiID, '@TopN',         N'Số kết quả',     'INT',      'number',          0,0,'10',           NULL,                    '1','100', NULL, NULL, 9 FROM API_Definition WHERE ApiCode = '@xem_doanh_so';

-- @cong_no_kh → API_CongNoKhachHang_AI(@Username, @ObjectID, @ToDate)
INSERT INTO API_Field (ApiID, FieldCode, FieldName, DataType, ControlType, IsRequired, IsSystemParam, DefaultValue, Placeholder, DataSourceType, DataSourceValue, OrderIndex)
SELECT ApiID, '@Username', N'Người dùng',    'VARCHAR',  'hidden',          1,1,NULL,    NULL,                  NULL, NULL, 1 FROM API_Definition WHERE ApiCode = '@cong_no_kh' UNION ALL
SELECT ApiID, '@ObjectID', N'Mã khách hàng', 'VARCHAR',  'combobox',        0,0,NULL,    N'Để trống = top 20',  'APICODE', '@danh_muc|@Type=CUSTOMER', 2 FROM API_Definition WHERE ApiCode = '@cong_no_kh' UNION ALL
SELECT ApiID, '@ToDate',   N'Đến ngày',      'DATETIME', 'date',            0,0,'TODAY', NULL,                  NULL, NULL, 3 FROM API_Definition WHERE ApiCode = '@cong_no_kh';

-- @cong_no_chi_tiet → API_CongNoChiTiet_AI(@Username, @ObjectID required, @ToDate)
INSERT INTO API_Field (ApiID, FieldCode, FieldName, DataType, ControlType, IsRequired, IsSystemParam, DefaultValue, Placeholder, DataSourceType, DataSourceValue, OrderIndex)
SELECT ApiID, '@Username', N'Người dùng',    'VARCHAR',  'hidden',          1,1,NULL,    NULL,                   NULL, NULL, 1 FROM API_Definition WHERE ApiCode = '@cong_no_chi_tiet' UNION ALL
SELECT ApiID, '@ObjectID', N'Mã khách hàng', 'VARCHAR',  'combobox',        1,0,NULL,    N'Bắt buộc nhập mã KH',  'APICODE', '@danh_muc|@Type=CUSTOMER', 2 FROM API_Definition WHERE ApiCode = '@cong_no_chi_tiet' UNION ALL
SELECT ApiID, '@ToDate',   N'Đến ngày',      'DATETIME', 'date',            0,0,'TODAY', NULL,                   NULL, NULL, 3 FROM API_Definition WHERE ApiCode = '@cong_no_chi_tiet';

-- @danh_muc → API_DanhMuc_AI(@Type required, @SearchText) — KHÔNG có @Username
INSERT INTO API_Field (ApiID, FieldCode, FieldName, DataType, ControlType, IsRequired, IsSystemParam, DefaultValue, Placeholder, OptionsJson, DataSourceType, DataSourceValue, OrderIndex)
SELECT ApiID, '@Type', N'Loại danh mục', 'VARCHAR', 'select', 1,0,'sanpham', NULL,
    N'[{"value":"sanpham","label":"💊 Sản phẩm"},{"value":"khachhang","label":"👤 Khách hàng"},{"value":"donhang","label":"📋 Đơn hàng"},{"value":"khohang","label":"🏭 Kho hàng"},{"value":"nhanvien","label":"👨‍💼 Nhân viên"},{"value":"categories","label":"📂 Danh sách loại"}]',
    NULL, NULL, 1 FROM API_Definition WHERE ApiCode = '@danh_muc'
UNION ALL
SELECT ApiID, '@SearchText', N'Từ khóa', 'VARCHAR', 'text', 0,0,NULL, N'Nhập để lọc nhanh...', NULL,
    NULL, NULL, 2 FROM API_Definition WHERE ApiCode = '@danh_muc';

-- @ton_kho_list → API_GetTonKho_List_AI(@Username, @ItemID, @ItemName)
INSERT INTO API_Field (ApiID, FieldCode, FieldName, DataType, ControlType, IsRequired, IsSystemParam, DefaultValue, Placeholder, DataSourceType, DataSourceValue, OrderIndex)
SELECT ApiID, '@Username', N'Người dùng',    'VARCHAR', 'hidden', 1,1,NULL, NULL,                          NULL, NULL, 1 FROM API_Definition WHERE ApiCode = '@ton_kho_list' UNION ALL
SELECT ApiID, '@ItemID',   N'Mã sản phẩm',  'VARCHAR', 'text',   0,0,NULL, N'VD: SP001',                  NULL, NULL, 2 FROM API_Definition WHERE ApiCode = '@ton_kho_list' UNION ALL
SELECT ApiID, '@ItemName', N'Tên sản phẩm', 'VARCHAR', 'text',   0,0,NULL, N'Tìm theo tên sản phẩm...',  NULL, NULL, 3 FROM API_Definition WHERE ApiCode = '@ton_kho_list';
GO

-- ═══════════════════════════════════════════════════════════════════════════
-- BƯỚC 5: API_Action_Field
-- ═══════════════════════════════════════════════════════════════════════════
INSERT INTO API_Action_Field (ActionID, FieldID, IsVisible, IsEditable, IsRequired)
SELECT A.ActionID, F.FieldID,
    CASE WHEN F.IsSystemParam = 1 THEN 0 ELSE 1 END,
    CASE WHEN F.IsSystemParam = 1 THEN 0 ELSE 1 END,
    F.IsRequired
FROM API_Action A
JOIN API_Field F ON A.ApiID = F.ApiID
WHERE A.ApiID IN (
    SELECT ApiID FROM API_Definition WHERE ApiCode IN (
        '@tao_don_hang','@them_khach_hang','@xem_hoa_don','@xem_don_hang','@xem_doanh_so',
        '@cong_no_kh','@cong_no_chi_tiet','@danh_muc','@ton_kho_list'
    )
)
AND NOT EXISTS (
    SELECT 1 FROM API_Action_Field AAF
    WHERE AAF.ActionID = A.ActionID AND AAF.FieldID = F.FieldID
);
GO

-- ═══════════════════════════════════════════════════════════════════════════
-- BƯỚC 6: API_Filter
-- ═══════════════════════════════════════════════════════════════════════════

-- @xem_hoa_don
INSERT INTO API_Filter (ApiID, FieldCode, FieldName, DataType, ControlType, Operator, DefaultValue, Placeholder, DataSourceType, DataSourceValue, OrderIndex)
SELECT ApiID, '@FromDate',   N'Từ ngày',  'DATETIME','date', '>=','LAST_10_DAYS',NULL,           NULL, NULL, 1 FROM API_Definition WHERE ApiCode = '@xem_hoa_don' UNION ALL
SELECT ApiID, '@ToDate',     N'Đến ngày', 'DATETIME','date', '<=','TODAY',        NULL,           NULL, NULL, 2 FROM API_Definition WHERE ApiCode = '@xem_hoa_don' UNION ALL
SELECT ApiID, '@SearchText', N'Tìm kiếm', 'VARCHAR', 'text', 'LIKE',NULL,         N'Tên/SĐT KH', NULL, NULL, 3 FROM API_Definition WHERE ApiCode = '@xem_hoa_don';

-- @xem_don_hang
INSERT INTO API_Filter (ApiID, FieldCode, FieldName, DataType, ControlType, Operator, DefaultValue, Placeholder, OptionsJson, DataSourceType, DataSourceValue, OrderIndex)
SELECT ApiID, '@FromDate',   N'Từ ngày',    'DATETIME','date',            '>=','LAST_30_DAYS',NULL,                 NULL, NULL, NULL, 1 FROM API_Definition WHERE ApiCode = '@xem_don_hang' UNION ALL
SELECT ApiID, '@ToDate',     N'Đến ngày',   'DATETIME','date',            '<=','TODAY',        NULL,                 NULL, NULL, NULL, 2 FROM API_Definition WHERE ApiCode = '@xem_don_hang' UNION ALL
SELECT ApiID, '@ObjectID',   N'Khách hàng', 'VARCHAR', 'combobox',       '=', NULL,           N'Để trống = tất cả', NULL, 'APICODE', '@danh_muc|@Type=CUSTOMER', 3 FROM API_Definition WHERE ApiCode = '@xem_don_hang' UNION ALL
SELECT ApiID, '@StatusName', N'Trạng thái', 'VARCHAR', 'select',          '=', NULL,           NULL,
    N'[{"value":"","label":"Tất cả"},{"value":"Chờ duyệt","label":"Chờ duyệt"},{"value":"Đã duyệt","label":"Đã duyệt"},{"value":"Đang giao","label":"Đang giao"},{"value":"Hoàn thành","label":"Hoàn thành"},{"value":"Hủy","label":"Đã hủy"}]', NULL, NULL,
    4 FROM API_Definition WHERE ApiCode = '@xem_don_hang';

-- @xem_doanh_so
INSERT INTO API_Filter (ApiID, FieldCode, FieldName, DataType, ControlType, Operator, DefaultValue, Placeholder, DataSourceType, DataSourceValue, OrderIndex)
SELECT ApiID, '@FromDate',     N'Từ ngày',  'DATETIME','date',            '>=','LAST_30_DAYS',NULL,                   NULL, NULL, 1 FROM API_Definition WHERE ApiCode = '@xem_doanh_so' UNION ALL
SELECT ApiID, '@ToDate',       N'Đến ngày', 'DATETIME','date',            '<=','TODAY',        NULL,                   NULL, NULL, 2 FROM API_Definition WHERE ApiCode = '@xem_doanh_so' UNION ALL
SELECT ApiID, '@ObjectID',     N'Khách hàng','VARCHAR','combobox',       '=', NULL,           N'Lọc theo KH',         'APICODE', '@danh_muc|@Type=CUSTOMER', 3 FROM API_Definition WHERE ApiCode = '@xem_doanh_so' UNION ALL
SELECT ApiID, '@EmployeeName', N'Nhân viên', 'VARCHAR','text',            'LIKE',NULL,         N'Tìm theo tên NV...',  NULL, NULL, 4 FROM API_Definition WHERE ApiCode = '@xem_doanh_so' UNION ALL
SELECT ApiID, '@ItemName',     N'Sản phẩm',  'VARCHAR','text',            'LIKE',NULL,         N'Lọc theo sản phẩm...', NULL, NULL, 5 FROM API_Definition WHERE ApiCode = '@xem_doanh_so';

-- @cong_no_kh
INSERT INTO API_Filter (ApiID, FieldCode, FieldName, DataType, ControlType, Operator, DefaultValue, Placeholder, DataSourceType, DataSourceValue, OrderIndex)
SELECT ApiID, '@ObjectID', N'Mã/Tên KH', 'VARCHAR',  'combobox',       '=',  NULL,    N'Để trống = top 20 nợ cao', 'APICODE', '@danh_muc|@Type=CUSTOMER', 1 FROM API_Definition WHERE ApiCode = '@cong_no_kh' UNION ALL
SELECT ApiID, '@ToDate',   N'Đến ngày',  'DATETIME', 'date',           '<=', 'TODAY', NULL,                         NULL, NULL, 2 FROM API_Definition WHERE ApiCode = '@cong_no_kh';

-- @cong_no_chi_tiet
INSERT INTO API_Filter (ApiID, FieldCode, FieldName, DataType, ControlType, Operator, DefaultValue, Placeholder, IsRequired, DataSourceType, DataSourceValue, OrderIndex)
SELECT ApiID, '@ObjectID', N'Mã khách hàng', 'VARCHAR',  'combobox',       '=',  NULL,    N'Bắt buộc nhập', 1, 'APICODE', '@danh_muc|@Type=CUSTOMER', 1 FROM API_Definition WHERE ApiCode = '@cong_no_chi_tiet' UNION ALL
SELECT ApiID, '@ToDate',   N'Đến ngày',      'DATETIME', 'date',           '<=', 'TODAY', NULL,              0, NULL, NULL, 2 FROM API_Definition WHERE ApiCode = '@cong_no_chi_tiet';

-- @danh_muc
INSERT INTO API_Filter (ApiID, FieldCode, FieldName, DataType, ControlType, Operator, DefaultValue, Placeholder, OptionsJson, IsRequired, DataSourceType, DataSourceValue, OrderIndex)
SELECT ApiID, '@Type', N'Loại danh mục', 'VARCHAR','select','=','sanpham',NULL,
    N'[{"value":"sanpham","label":"💊 Sản phẩm"},{"value":"khachhang","label":"👤 Khách hàng"},{"value":"donhang","label":"📋 Đơn hàng"},{"value":"khohang","label":"🏭 Kho hàng"},{"value":"nhanvien","label":"👨‍💼 Nhân viên"}]',
    1, NULL, NULL, 1 FROM API_Definition WHERE ApiCode = '@danh_muc'
UNION ALL
SELECT ApiID, '@SearchText', N'Từ khóa', 'VARCHAR','text','LIKE',NULL, N'Nhập để lọc nhanh...', NULL, 0, NULL, NULL, 2 FROM API_Definition WHERE ApiCode = '@danh_muc';

-- @ton_kho_list
INSERT INTO API_Filter (ApiID, FieldCode, FieldName, DataType, ControlType, Operator, DefaultValue, Placeholder, DataSourceType, DataSourceValue, OrderIndex)
SELECT ApiID, '@ItemID',   N'Mã sản phẩm',  'VARCHAR','text','=',    NULL, N'Tìm chính xác theo mã...', NULL, NULL, 1 FROM API_Definition WHERE ApiCode = '@ton_kho_list' UNION ALL
SELECT ApiID, '@ItemName', N'Tên sản phẩm', 'VARCHAR','text','LIKE', NULL, N'Tìm theo tên...',           NULL, NULL, 2 FROM API_Definition WHERE ApiCode = '@ton_kho_list';
GO
GO

-- ═══════════════════════════════════════════════════════════════════════════
-- KIỂM TRA TỔNG HỢP
-- ═══════════════════════════════════════════════════════════════════════════
SELECT D.ApiCode, D.IconEmoji + N' ' + D.ApiName AS API,
    D.Category, A.ExecutionType,
    CASE D.IsActive WHEN 1 THEN N'✅ Active' ELSE N'🔴 Disabled' END AS [Trạng thái],
    (SELECT COUNT(*) FROM API_Field  F  WHERE F.ApiID  = D.ApiID AND F.IsSystemParam = 0) AS [Field UI],
    (SELECT COUNT(*) FROM API_Filter FL WHERE FL.ApiID = D.ApiID) AS [Filter]
FROM API_Definition D
JOIN API_Action A ON A.ApiID = D.ApiID AND A.IsDefault = 1
ORDER BY D.OrderIndex;
GO

PRINT N'';
PRINT N'🎉 Schema_API_Metadata_Patch.sql hoàn tất!';
PRINT N'   ✅ 8 Module Common APIs đã thêm';
PRINT N'   🔴 Disabled: @xem_doanh_so (chỉ Manager)';
PRINT N'   📊 Tổng: 19 APIs — 17 Active, 2 Disabled';
GO

/* ── TEST ──────────────────────────────────────────────────────────
EXEC API_ListActive;                          -- Hiện 16 API active
EXEC API_GetConfig '@tao_don_hang';           -- Config tạo đơn (CART)
EXEC API_GetConfig '@cong_no_chi_tiet';       -- Config công nợ
EXEC API_GetConfig '@danh_muc';               -- Config danh mục
EXEC API_GetConfig '@xem_doanh_so';           -- Config doanh số (disabled)
─────────────────────────────────────────────────────────────────── */
