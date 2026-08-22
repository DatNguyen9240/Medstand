CREATE OR ALTER PROCEDURE dbo.API_Metadata_AutoBootstrap_AI
    @Apply BIT = 0,               -- 0 preview, 1 apply
    @UpdateExisting BIT = 1       -- 1 update record cu, 0 chi them moi
AS
BEGIN
    SET NOCOUNT ON;

    -- GUARD: don temp table con sot lai tu lan chay loi truoc tren cung connection
    IF OBJECT_ID('tempdb..#AI_META') IS NOT NULL DROP TABLE #AI_META;

    IF @Apply = 1
    BEGIN
        -- =========================================================================
        -- SELF HEALING PROXY: Tự động gom TẤT CẢ tham số trong hệ thống
        -- để gen ra chữ ký (signature) cho API_DanhMuc_AI nhằm chặn lỗi "Too many arguments"
        -- =========================================================================
        DECLARE @ProxyParams NVARCHAR(MAX) = '';
        
        ;WITH ParamCTE AS (
            SELECT 
                p.name, 
                t.name AS type_name, 
                p.max_length, 
                p.precision, 
                p.scale,
                ROW_NUMBER() OVER (PARTITION BY p.name ORDER BY p.max_length DESC) as rn
            FROM sys.parameters p
            JOIN sys.procedures pr ON p.object_id = pr.object_id
            JOIN sys.types t ON p.user_type_id = t.user_type_id
            WHERE pr.name LIKE 'API[_]%[_]AI' 
              AND pr.name NOT IN ('API_DanhMuc_Core_AI', 'API_DanhMuc_AI', 'API_Metadata_AutoBootstrap_AI')
              AND p.name NOT IN ('@Type', '@timkiem')
        )
        SELECT @ProxyParams = @ProxyParams + name + ' ' + UPPER(type_name) + 
               CASE 
                   WHEN type_name IN ('varchar', 'nvarchar', 'char', 'nchar') AND max_length <> -1 THEN '(' + CAST(max_length AS VARCHAR) + ')'
                   WHEN type_name IN ('varchar', 'nvarchar', 'char', 'nchar') AND max_length = -1 THEN '(MAX)'
                   WHEN type_name IN ('decimal', 'numeric') THEN '(' + CAST(precision AS VARCHAR) + ',' + CAST(scale AS VARCHAR) + ')'
                   ELSE '' 
               END + ' = NULL, '
        FROM ParamCTE
        WHERE rn = 1;

        IF OBJECT_ID('dbo.API_DanhMuc_AI', 'P') IS NULL EXEC('CREATE PROCEDURE dbo.API_DanhMuc_AI AS SELECT 1');

        DECLARE @ProxySQL NVARCHAR(MAX) = '
        ALTER PROCEDURE dbo.API_DanhMuc_AI
            @Type NVARCHAR(50) = NULL,
            @timkiem NVARCHAR(255) = '''',
            @Username VARCHAR(50) = ''''
        AS
        BEGIN
            EXEC dbo.API_DanhMuc_Core_AI @Type = @Type, @timkiem = @timkiem, @Username = @Username;
        END';
        
        EXEC sp_executesql @ProxySQL;
    END

    ;WITH SP_AI AS (
        SELECT
            p.object_id,
            p.name AS StoredProcedure,
            CASE WHEN p.name = 'API_DonHangChiTiet_Insert_AI' THEN '@lap_don_hang'
            ELSE
            '@' + LOWER(
                (
                        SELECT
                            CASE
                                WHEN n.Num > 1
                                     AND SUBSTRING(base.ApiNameRaw, n.Num, 1) COLLATE Latin1_General_BIN LIKE '[A-Z]'
                                     AND SUBSTRING(base.ApiNameRaw, n.Num - 1, 1) <> '_'
                                     AND SUBSTRING(base.ApiNameRaw, n.Num - 1, 1) COLLATE Latin1_General_BIN NOT LIKE '[A-Z]'
                                THEN '_'
                                ELSE ''
                            END
                            + SUBSTRING(base.ApiNameRaw, n.Num, 1)
                        FROM (
                            SELECT TOP (LEN(base.ApiNameRaw))
                                   ROW_NUMBER() OVER (ORDER BY (SELECT NULL)) AS Num
                            FROM sys.all_objects
                        ) n
                        ORDER BY n.Num
                        FOR XML PATH(''), TYPE
                    ).value('.', 'NVARCHAR(300)')
            ) 
            END AS ApiCode,
            base.ApiNameRaw
        FROM sys.procedures p
        CROSS APPLY (
            SELECT REPLACE(REPLACE(p.name, 'API_', ''), '_AI', '') AS ApiNameRaw
        ) base
        WHERE p.name LIKE 'API[_]%[_]AI'
          AND p.name <> 'API_DanhMuc_Core_AI'
    ),
    P AS (
        SELECT
            s.object_id,
            s.StoredProcedure,
            s.ApiCode,
            s.ApiNameRaw,
            prm.parameter_id,
            prm.name AS FieldCode,
            UPPER(t.name) AS DataType,
            prm.has_default_value
        FROM SP_AI s
        JOIN sys.parameters prm ON prm.object_id = s.object_id
        JOIN sys.types t ON t.user_type_id = prm.user_type_id
        WHERE prm.parameter_id > 0
    ),
    M AS (
        SELECT
            object_id,
            StoredProcedure,
            ApiCode,
            ApiNameRaw,
            parameter_id,
            FieldCode,
            CASE
                -- API Name Dictionary (Mapping SP to Vietnamese)
                WHEN StoredProcedure LIKE '%DonHangChiTiet%Insert%' THEN N'Thêm đơn hàng'
                WHEN StoredProcedure LIKE '%KhachHang%Insert%'     THEN N'Thêm khách hàng'
                WHEN StoredProcedure LIKE '%CongNoChiTiet%'       THEN N'Công nợ chi tiết'
                WHEN StoredProcedure LIKE '%CongNoKhachHang%'     THEN N'Công nợ khách hàng'
                WHEN StoredProcedure LIKE '%DanhMuc%'             THEN N'Danh mục'
                WHEN StoredProcedure LIKE '%DanhsachTonKho%'      THEN N'Danh sách tồn kho'
                WHEN StoredProcedure LIKE '%DoanhSo%'             THEN N'Doanh số'
                WHEN StoredProcedure LIKE '%GoiYDonHang%'         THEN N'Gợi ý đơn hàng'
                WHEN StoredProcedure LIKE '%DonHang%'             THEN N'Đơn hàng'
                WHEN StoredProcedure LIKE '%HoaDon%'              THEN N'Hóa đơn'
                WHEN StoredProcedure LIKE '%SanPhamTrongTam%'     THEN N'Sản phẩm trọng tâm'
                WHEN StoredProcedure LIKE '%TraCuuSanPham%'       THEN N'Tra cứu sản phẩm'
                WHEN StoredProcedure LIKE '%TichLuy%'             THEN N'Tích lũy điểm'
                WHEN StoredProcedure LIKE '%ChamDiemKH%'          THEN N'Chấm điểm khách hàng'
                WHEN StoredProcedure LIKE '%TuyenBanHang%'        THEN N'Tuyến bán hàng'
                WHEN StoredProcedure LIKE '%ThongBao%'            THEN N'Xem thông báo'
                WHEN StoredProcedure LIKE '%TimSanPhamTheoTrieuChung%' THEN N'Tìm thuốc theo triệu chứng'
                WHEN StoredProcedure LIKE '%KhaoSat360%'          THEN N'Khảo sát 360 khách hàng'
                WHEN StoredProcedure LIKE '%TraCuu%TongHop%'      THEN N'Tra cứu tổng hợp'
                WHEN StoredProcedure LIKE '%GoiYDonThuoc%'        THEN N'Gợi ý đơn thuốc'
                WHEN StoredProcedure LIKE '%UpsellGoiY%'          THEN N'Gợi ý bán kèm (Upsell)'
                WHEN StoredProcedure LIKE '%CapNhatKetQuaKhaoSat%' THEN N'Cập nhật kết quả khảo sát'
                WHEN StoredProcedure LIKE '%DanhSachCauHoiKhaoSat%' THEN N'Danh sách câu hỏi khảo sát'
                WHEN StoredProcedure LIKE '%KiemTraKhaoSatNgay%'  THEN N'Kiểm tra khảo sát ngày'
                WHEN StoredProcedure LIKE '%KiemTraKhaoSat%'      THEN N'Kiểm tra khảo sát'
                WHEN StoredProcedure LIKE '%LichSuKhaoSat%'       THEN N'Lịch sử khảo sát'
                WHEN StoredProcedure LIKE '%DeXuatKhuyenMai%'     THEN N'Đề xuất khuyến mãi'
                ELSE REPLACE(REPLACE(ApiNameRaw, 'API_', ''), '_', ' ')
            END AS ApiName,
            CASE
                WHEN FieldCode = '@Username'   THEN N'Người dùng'
                WHEN FieldCode = '@FilterUser' THEN N'Lọc người dùng'
                WHEN FieldCode = '@FilterAction' THEN N'Lọc hành động'
                WHEN FieldCode = '@timkiem'    THEN N'Tìm kiếm'
                WHEN FieldCode = '@Type'       THEN N'Loại danh mục'
                WHEN FieldCode = '@MaKhachHang'  THEN N'Khách hàng'
                WHEN FieldCode = '@ObjectID'   THEN N'Mã khách hàng'
                WHEN FieldCode = '@ItemID'     THEN N'Mã sản phẩm'
                WHEN FieldCode = '@DocumentID' AND ApiNameRaw LIKE '%HoaDon%' THEN N'Mã hóa đơn'
                WHEN FieldCode = '@DocumentID' THEN N'Mã đơn hàng'
                WHEN FieldCode = '@TenKhachHang' THEN N'Tên khách hàng'
                WHEN FieldCode = '@ObjectName' THEN N'Tên khách hàng'
                WHEN FieldCode = '@EmployeeID' THEN N'Mã nhân viên'
                WHEN FieldCode = '@RiskLevel' THEN N'Mức độ nguy cơ'
                WHEN FieldCode = '@Page' THEN N'Trang'
                WHEN FieldCode = '@PageSize' THEN N'Số dòng mỗi trang'
                WHEN FieldCode = '@TenNhanVien' THEN N'Tên nhân viên'
                WHEN FieldCode = '@TenSanPham' THEN N'Tên sản phẩm'
                WHEN FieldCode = '@SoDienThoai' OR FieldCode = '@DienThoai' THEN N'Số điện thoại'
                WHEN FieldCode = '@DiaChi'     THEN N'Địa chỉ'
                WHEN FieldCode = '@GhiChu' OR FieldCode = '@Notes' OR FieldCode = '@Memo' THEN N'Ghi chú'
                WHEN FieldCode = '@DienGiai'   THEN N'Diễn giải'
                WHEN FieldCode = '@LoaiBaoCao' THEN N'Loại báo cáo'
                WHEN FieldCode = '@NhomFilter' THEN N'Phân Loại Khách (VIP=A)'
                WHEN FieldCode = '@ObjectGroupID' THEN N'Nhóm khách hàng'
                WHEN FieldCode = '@SoNgayVangMat' THEN N'Số ngày vắng mặt'
                WHEN FieldCode = '@NgayBaoDong' THEN N'Ngày báo động'
                WHEN FieldCode = '@NgayTarget' THEN N'Ngày làm việc'
                WHEN FieldCode = '@TuNgay' THEN N'Từ ngày'
                WHEN FieldCode = '@DenNgay' THEN N'Đến ngày'
                WHEN FieldCode = '@NgayGiao'   THEN N'Ngày giao hàng'
                WHEN FieldCode LIKE '%Date'    THEN N'Ngày'
                WHEN FieldCode LIKE '@Top%'    THEN N'Số lượng'
                WHEN FieldCode LIKE '%ItemList%' OR FieldCode LIKE '%JsonItems%' OR FieldCode LIKE '%itemlist%' THEN N'Danh sách sản phẩm'
                ELSE REPLACE(REPLACE(FieldCode, '@', ''), '_', ' ')
            END AS FieldName,
            DataType,
            CASE
                WHEN FieldCode = '@Username'  THEN 'hidden'
                -- Datagrid: list JSON (NVARCHAR + tên dạng *List, *Items, *Rules)
                WHEN DataType = 'NVARCHAR' AND (
                    FieldCode LIKE '%ItemList'    OR FieldCode LIKE '%itemlist'
                    OR FieldCode LIKE '%JsonItems'  OR FieldCode LIKE '%jsonitems'
                    OR FieldCode LIKE '%JsonRules'  OR FieldCode LIKE '%jsonrules'
                    OR FieldCode LIKE '%ChiTietList' OR FieldCode LIKE '%DetailList'
                ) THEN 'datagrid'
                -- Textarea: các trường văn bản dài
                WHEN FieldCode IN ('@GhiChu', '@Notes', '@Memo', '@DienGiai')
                    OR FieldCode LIKE '%GhiChu' OR FieldCode LIKE '%Notes'
                    OR FieldCode LIKE '%Memo'   OR FieldCode LIKE '%DienGiai'
                THEN 'textarea'
                -- Tel: số điện thoại
                WHEN FieldCode IN ('@SoDienThoai', '@DienThoai', '@SDT', '@Phone', '@SĐT')
                    OR FieldCode LIKE '%SoDienThoai' OR FieldCode LIKE '%DienThoai'
                THEN 'tel'
                 WHEN FieldCode IN ('@MaKhachHang', '@ObjectID') OR FieldCode LIKE '%KhachHang%' OR FieldCode LIKE '%Customer%' OR FieldCode LIKE '%MaKH%' THEN 'combobox'
                 WHEN FieldCode IN ('@ItemID', '@TenSanPham') OR FieldCode LIKE '%ItemID%' OR FieldCode LIKE '%ItemName%' OR FieldCode LIKE '%MaSP%' OR FieldCode LIKE '%TenSP%' OR FieldCode LIKE '%MaSanPham%' OR FieldCode LIKE '%TenSanPham%' THEN 'combobox'
                 WHEN FieldCode = '@EmployeeID' THEN 'combobox'
                 WHEN FieldCode = '@Type' OR FieldCode = '@NhomFilter' OR FieldCode = '@LoaiBaoCao' OR FieldCode = '@RiskLevel' THEN 'combobox'
                WHEN FieldCode IN ('@TuNgay', '@DenNgay') THEN 'date'
                WHEN FieldCode LIKE '%Date'   OR FieldCode LIKE '%Ngay' THEN 'date'
                WHEN DataType IN ('INT','BIGINT','DECIMAL','NUMERIC','FLOAT','REAL','MONEY','SMALLMONEY') THEN 'number'
                ELSE 'text'
            END AS ControlType,
            0 AS IsRequired, -- Mặc định AI API là linh hoạt, SP sẽ tự handle giá trị default nội bộ
            CASE 
                WHEN FieldCode = '@Username' THEN 1 
                WHEN FieldCode = '@User' THEN 1
                WHEN FieldCode = '@BotType' THEN 1
                WHEN FieldCode LIKE '@SYS%' THEN 1
                WHEN StoredProcedure = 'API_DoanhSo_AI'
                     AND FieldCode IN ('@User', '@FromDate', '@ToDate', '@ManagerID', '@BranchID', '@CeoID') THEN 1
                WHEN StoredProcedure = 'API_DonHang_AI'
                     AND FieldCode IN ('@User', '@FromDate', '@ToDate', '@ObjectID', '@SearchText', '@BranchID', '@page', '@limit') THEN 1
                WHEN StoredProcedure = 'API_ChamDiemKH_AI'
                     AND FieldCode IN ('@BranchID', '@W_Recency', '@W_Frequency', '@W_Monetary', '@W_Consumption') THEN 1
                WHEN StoredProcedure = 'API_DanhMuc_AI' AND FieldCode NOT IN ('@Type', '@timkiem') THEN 1
                ELSE 0 
            END AS IsSystemParam,
            CASE
                WHEN FieldCode = '@Type'      THEN 'APICODE'
                WHEN FieldCode IN ('@MaKhachHang', '@ObjectID') OR FieldCode LIKE '%KhachHang%' OR FieldCode LIKE '%Customer%' OR FieldCode LIKE '%MaKH%' THEN 'APICODE'
                WHEN FieldCode IN ('@ItemID', '@TenSanPham') OR FieldCode LIKE '%ItemID%' OR FieldCode LIKE '%ItemName%' OR FieldCode LIKE '%MaSP%' OR FieldCode LIKE '%TenSP%' OR FieldCode LIKE '%MaSanPham%' OR FieldCode LIKE '%TenSanPham%' THEN 'APICODE'
                WHEN FieldCode IN ('@timkiem', '@searchkey', '@searchtext', '@tensanpham', '@TenSanPham') THEN 'APICODE'
                WHEN FieldCode LIKE '%ItemList%' OR FieldCode LIKE '%JsonItems%' OR FieldCode LIKE '%itemlist%' THEN 'APICODE'
                WHEN FieldCode = '@EmployeeID' THEN 'APICODE'
                WHEN FieldCode = '@NhomFilter' OR FieldCode = '@LoaiBaoCao' OR FieldCode = '@RiskLevel' THEN 'STATIC'
                ELSE NULL
            END AS DataSourceType,
            CASE
                WHEN FieldCode = '@MaKhachHang' OR FieldCode = '@ObjectID' OR FieldCode LIKE '%KhachHang%' OR FieldCode LIKE '%Customer%' OR FieldCode LIKE '%MaKH%' THEN '@danh_muc|@Type=khachhang|@timkiem={q}'
                WHEN FieldCode = '@ItemID' OR FieldCode = '@TenSanPham' OR FieldCode LIKE '%ItemID%' OR FieldCode LIKE '%ItemName%' OR FieldCode LIKE '%MaSP%' OR FieldCode LIKE '%TenSP%' OR FieldCode LIKE '%MaSanPham%' OR FieldCode LIKE '%TenSanPham%' THEN '@danh_muc|@Type=sanpham|@timkiem={q}'
                WHEN FieldCode = '@Type'      THEN '@danh_muc|@timkiem={q}'
                WHEN FieldCode = '@EmployeeID' THEN '@danh_muc|@Type=nhanvien|@timkiem={q}'
                WHEN FieldCode LIKE '%ItemList%' OR FieldCode LIKE '%JsonItems%' OR FieldCode LIKE '%itemlist%' THEN '@danh_muc|@Type=sanpham|@timkiem={q}'
                WHEN StoredProcedure LIKE '%GoiYDonThuoc%' AND FieldCode = '@timkiem' THEN '@danh_muc|@Type=sanpham|@timkiem={q}'
                WHEN FieldCode = '@NhomFilter' THEN N'[{"value":"A","label":"KHÁCH VIP"},{"value":"B","label":"ỔN ĐỊNH"},{"value":"C","label":"NGUY CƠ"}]'
                WHEN FieldCode = '@RiskLevel' THEN N'[{"value":"HIGH","label":"Nguy cơ cao"},{"value":"MEDIUM","label":"Nguy cơ trung bình"},{"value":"LOW","label":"Nguy cơ thấp"}]'
                WHEN FieldCode = '@LoaiBaoCao' THEN N'[{"value":"TatCa","label":"Tất cả"},{"value":"KhachHang","label":"Khách hàng"},{"value":"NhanVien","label":"Nhân viên"},{"value":"SanPham","label":"Sản phẩm"}]'
                ELSE NULL
            END AS DataSourceValue,
            CASE
                WHEN FieldCode = '@NhomFilter' THEN N'[{"value":"A","label":"Khách VIP"},{"value":"B","label":"Ổn định"},{"value":"C","label":"Nguy cơ"}]'
                WHEN FieldCode = '@RiskLevel' THEN N'[{"value":"HIGH","label":"Nguy cơ cao"},{"value":"MEDIUM","label":"Nguy cơ trung bình"},{"value":"LOW","label":"Nguy cơ thấp"}]'
                WHEN FieldCode = '@LoaiBaoCao' THEN N'[{"value":"TatCa","label":"Tất cả"},{"value":"KhachHang","label":"Khách hàng"},{"value":"NhanVien","label":"Nhân viên"},{"value":"SanPham","label":"Sản phẩm"}]'
                ELSE NULL
            END AS OptionsJson,
            CASE
                WHEN StoredProcedure LIKE '%CongNoChiTiet%' THEN 'CONG_NO'
                WHEN StoredProcedure LIKE '%SanPhamTrongTam%' AND StoredProcedure NOT LIKE '%Import%' THEN 'FOCUS_PRODUCTS'
                WHEN StoredProcedure LIKE '%TichLuy%'       THEN 'TICH_LUY'
                WHEN StoredProcedure LIKE '%DanhMuc%'       THEN 'CATALOG'
                WHEN StoredProcedure LIKE '%TonKho%'        THEN 'CATALOG'
                WHEN StoredProcedure LIKE '%TraCuuSanPham%' THEN 'CATALOG'
                -- SP chứa param datagrid (Insert/Update có list sản phẩm) → dùng SMART_FORM
                WHEN DataType = 'NVARCHAR' AND (
                    FieldCode LIKE '%ItemList%'    OR FieldCode LIKE '%itemlist%'
                    OR FieldCode LIKE '%JsonItems%'  OR FieldCode LIKE '%jsonitems'
                ) THEN 'SMART_FORM'
                WHEN StoredProcedure LIKE '%Insert%' OR StoredProcedure LIKE '%Import%'
                    OR StoredProcedure LIKE '%Update%' OR StoredProcedure LIKE '%Save%'
                    THEN 'SMART_FORM'
                ELSE 'DEFAULT'
            END AS UiTemplate
        FROM P
    ),
    FINAL_M AS (
        SELECT M.*,
        CASE
            WHEN StoredProcedure LIKE '%CongNo%'   THEN N'CÔNG NỢ'
            WHEN StoredProcedure LIKE '%DanhMuc%'  THEN N'DANH MỤC'
            WHEN StoredProcedure LIKE '%TichLuy%'  THEN N'TÍCH LŨY'
            WHEN StoredProcedure LIKE '%DoanhSo%'  THEN N'DOANH SỐ'
            WHEN StoredProcedure LIKE '%DonHang%'  THEN N'ĐƠN HÀNG'
            WHEN StoredProcedure LIKE '%HoaDon%'   THEN N'HÓA ĐƠN'
            WHEN StoredProcedure LIKE '%SanPham%'  THEN N'SẢN PHẨM'
            ELSE N'CHỨC NĂNG CHUNG'
        END AS ApiCategory
        FROM M
    )
    SELECT * INTO #AI_META FROM FINAL_M;

    IF @Apply = 0
    BEGIN
        SELECT DISTINCT ApiCode, ApiNameRaw AS ApiName, StoredProcedure
        FROM #AI_META
        ORDER BY ApiCode;

        SELECT ApiCode, FieldCode, FieldName, DataType, ControlType, IsRequired, IsSystemParam, DataSourceType, DataSourceValue, OptionsJson, parameter_id
        FROM #AI_META
        ORDER BY ApiCode, parameter_id;
        RETURN;
    END

    -- Neu rule tao ApiCode thay doi, dong bo lai theo StoredProcedure
    UPDATE d
    SET d.ApiCode = a.ApiCode
    FROM dbo.API_Definition d
    JOIN (SELECT DISTINCT StoredProcedure, ApiCode FROM #AI_META) a
      ON a.StoredProcedure = d.StoredProcedure
    WHERE d.ApiCode <> a.ApiCode
      AND NOT EXISTS (
            SELECT 1
            FROM dbo.API_Definition x
            WHERE x.ApiCode = a.ApiCode
              AND x.ApiID <> d.ApiID
      );

    -- Upsert API_Definition
    -- [SUA 21/08/2026 - ORDER-APPROVAL-005]
    -- Ban cu dung SELECT DISTINCT tren NHIEU cot. UiTemplate duoc tinh theo TUNG THAM SO:
    -- tham so ten *ItemList* kieu NVARCHAR -> 'SMART_FORM', cac tham so khac -> 'DEFAULT'
    -- (tru khi ten SP chua Insert/Update/Save/Import thi tat ca deu SMART_FORM).
    -- Mot SP vua co @ItemList vua KHONG co Insert/Update trong ten se sinh HAI dong DISTINCT
    -- cung ApiCode nhung khac UiTemplate -> vi pham UNIQUE tren API_Definition.ApiCode, lam
    -- HONG toan bo dong bo metadata, keo theo moi lan CREATE/ALTER PROCEDURE deu that bai.
    -- Gom ve dung MOT dong moi ApiCode; MAX(UiTemplate) uu tien 'SMART_FORM' hon 'DEFAULT'.
    INSERT INTO dbo.API_Definition (ApiCode, ApiName, ApiDescription, StoredProcedure, Category, UiTemplate, IconEmoji, IsActive, OrderIndex)
    SELECT
        a.ApiCode,
        MIN(a.ApiName),
        N'Auto metadata from SP: ' + MIN(a.StoredProcedure),
        MIN(a.StoredProcedure),
        MIN(a.ApiCategory),
        MAX(a.UiTemplate),
        N'AI',
        1,
        999
    FROM #AI_META a
    WHERE NOT EXISTS (SELECT 1 FROM dbo.API_Definition d WHERE d.ApiCode = a.ApiCode)
    GROUP BY a.ApiCode;

    IF @UpdateExisting = 1
    BEGIN
        UPDATE d
        SET d.StoredProcedure = a.StoredProcedure,
            d.ApiName = a.ApiName,
            d.Category = a.ApiCategory,
            d.UiTemplate = a.UiTemplate
        FROM dbo.API_Definition d
        JOIN (SELECT DISTINCT ApiCode, StoredProcedure, ApiName, ApiCategory, UiTemplate FROM #AI_META) a ON a.ApiCode = d.ApiCode;
    END

    -- Ensure default action với ExecutionType tự động theo tên SP
    INSERT INTO dbo.API_Action (ApiID, ActionCode, ActionName, ExecutionType, HttpMethod, IsConfirm, IsDefault, IsActive, OrderIndex)
    SELECT 
        d.ApiID,
        CASE
            WHEN m.StoredProcedure LIKE '%Insert%' OR m.StoredProcedure LIKE '%Import%'
              OR m.StoredProcedure LIKE '%Save%' THEN 'INSERT'
            WHEN m.StoredProcedure LIKE '%Update%' THEN 'UPDATE'
            WHEN m.StoredProcedure LIKE '%Delete%' OR m.StoredProcedure LIKE '%Remove%' THEN 'DELETE'
            ELSE 'VIEW'
        END AS ActionCode,
        CASE
            WHEN m.StoredProcedure LIKE '%Insert%' OR m.StoredProcedure LIKE '%Import%'
              OR m.StoredProcedure LIKE '%Save%' THEN N'Tạo mới'
            WHEN m.StoredProcedure LIKE '%Update%' THEN N'Cập nhật'
            WHEN m.StoredProcedure LIKE '%Delete%' OR m.StoredProcedure LIKE '%Remove%' THEN N'Xóa'
            ELSE N'Xem dữ liệu'
        END AS ActionName,
        CASE
            WHEN m.StoredProcedure LIKE '%Insert%' OR m.StoredProcedure LIKE '%Import%'
              OR m.StoredProcedure LIKE '%Save%' THEN 'INSERT'
            WHEN m.StoredProcedure LIKE '%Update%' THEN 'UPDATE'  -- Frontend sẽ pre-fill form
            WHEN m.StoredProcedure LIKE '%Delete%' OR m.StoredProcedure LIKE '%Remove%' THEN 'DELETE'
            ELSE 'QUERY'
        END AS ExecutionType,
        'POST',
        -- IsConfirm: yêu cầu xác nhận trước khi Update/Delete
        CASE
            WHEN m.StoredProcedure LIKE '%Update%' THEN 1
            WHEN m.StoredProcedure LIKE '%Delete%' OR m.StoredProcedure LIKE '%Remove%' THEN 1
            ELSE 0
        END AS IsConfirm,
        1, 1, 1
    FROM dbo.API_Definition d
    JOIN (SELECT DISTINCT ApiCode, StoredProcedure FROM #AI_META) m ON m.ApiCode = d.ApiCode
    WHERE d.ApiCode IN (SELECT DISTINCT ApiCode FROM #AI_META)
      AND NOT EXISTS (SELECT 1 FROM dbo.API_Action a WHERE a.ApiID = d.ApiID AND a.IsDefault = 1);

    -- Cập nhật ExecutionType và IsConfirm cho các action cũ bị sai
    IF @UpdateExisting = 1
    BEGIN
        UPDATE act
        SET
            act.ExecutionType =
                CASE
                    WHEN m.StoredProcedure LIKE '%Insert%' OR m.StoredProcedure LIKE '%Import%'
                      OR m.StoredProcedure LIKE '%Save%' THEN 'INSERT'
                    WHEN m.StoredProcedure LIKE '%Update%' THEN 'UPDATE'
                    WHEN m.StoredProcedure LIKE '%Delete%' OR m.StoredProcedure LIKE '%Remove%' THEN 'DELETE'
                    ELSE 'QUERY'
                END,
            act.IsConfirm =
                CASE
                    WHEN m.StoredProcedure LIKE '%Update%' THEN 1
                    WHEN m.StoredProcedure LIKE '%Delete%' OR m.StoredProcedure LIKE '%Remove%' THEN 1
                    ELSE 0
                END
        FROM dbo.API_Action act
        JOIN dbo.API_Definition d ON d.ApiID = act.ApiID
        JOIN (SELECT DISTINCT ApiCode, StoredProcedure FROM #AI_META) m ON m.ApiCode = d.ApiCode
        WHERE act.IsDefault = 1;
    END
    -- Xoá các tham số rác (Orphaned fields) nếu tham số bị xóa khỏi Stored Procedure
    IF @UpdateExisting = 1
    BEGIN
        DELETE af
        FROM dbo.API_Action_Field af
        JOIN dbo.API_Field f ON f.FieldID = af.FieldID
        JOIN dbo.API_Definition d ON d.ApiID = f.ApiID
        WHERE d.ApiCode IN (SELECT DISTINCT ApiCode FROM #AI_META)
          AND NOT EXISTS (SELECT 1 FROM #AI_META a WHERE a.ApiCode = d.ApiCode AND a.FieldCode = f.FieldCode);

        DELETE fl
        FROM dbo.API_Filter fl
        JOIN dbo.API_Definition d ON d.ApiID = fl.ApiID
        WHERE d.ApiCode IN (SELECT DISTINCT ApiCode FROM #AI_META)
          AND NOT EXISTS (SELECT 1 FROM #AI_META a WHERE a.ApiCode = d.ApiCode AND a.FieldCode = fl.FieldCode);

        DELETE f
        FROM dbo.API_Field f
        JOIN dbo.API_Definition d ON d.ApiID = f.ApiID
        WHERE d.ApiCode IN (SELECT DISTINCT ApiCode FROM #AI_META)
          AND NOT EXISTS (SELECT 1 FROM #AI_META a WHERE a.ApiCode = d.ApiCode AND a.FieldCode = f.FieldCode);
    END

    -- Upsert API_Field
    INSERT INTO dbo.API_Field
    (
        ApiID, FieldCode, FieldName, DataType, ControlType, IsRequired, IsSystemParam,
        DefaultValue, Placeholder, MinValue, MaxValue, OptionsJson, DataSourceType, DataSourceValue, OrderIndex
    )
    SELECT
        d.ApiID, a.FieldCode, a.FieldName, a.DataType, a.ControlType, a.IsRequired, a.IsSystemParam,
        NULL, NULL, NULL, NULL, a.OptionsJson, a.DataSourceType, a.DataSourceValue, a.parameter_id
    FROM #AI_META a
    JOIN dbo.API_Definition d ON d.ApiCode = a.ApiCode
    WHERE NOT EXISTS (
        SELECT 1 FROM dbo.API_Field f WHERE f.ApiID = d.ApiID AND f.FieldCode = a.FieldCode
    );

    IF @UpdateExisting = 1
    BEGIN
        UPDATE f
        SET
            f.FieldName = a.FieldName,
            f.DataType = a.DataType,
            f.ControlType = a.ControlType,
            f.IsRequired = a.IsRequired,
            f.IsSystemParam = a.IsSystemParam,
            f.OptionsJson = a.OptionsJson,
            f.DataSourceType = a.DataSourceType,
            f.DataSourceValue = a.DataSourceValue,
            f.OrderIndex = a.parameter_id
        FROM dbo.API_Field f
        JOIN dbo.API_Definition d ON d.ApiID = f.ApiID
        JOIN #AI_META a ON a.ApiCode = d.ApiCode AND a.FieldCode = f.FieldCode;

        UPDATE af
        SET af.IsVisible = CASE WHEN f.IsSystemParam = 1 THEN 0 ELSE af.IsVisible END,
            af.IsEditable = CASE WHEN f.IsSystemParam = 1 THEN 0 ELSE af.IsEditable END
        FROM dbo.API_Action_Field af
        JOIN dbo.API_Field f ON f.FieldID = af.FieldID
        JOIN dbo.API_Definition d ON d.ApiID = f.ApiID
        WHERE d.ApiCode IN (SELECT DISTINCT ApiCode FROM #AI_META);
    END

    -- Ensure API_Action_Field mapping
    INSERT INTO dbo.API_Action_Field (ActionID, FieldID, IsVisible, IsEditable, IsRequired)
    SELECT
        act.ActionID,
        fld.FieldID,
        CASE WHEN fld.IsSystemParam = 1 THEN 0 ELSE 1 END,
        CASE WHEN fld.IsSystemParam = 1 THEN 0 ELSE 1 END,
        fld.IsRequired
    FROM dbo.API_Definition d
    JOIN dbo.API_Action act ON act.ApiID = d.ApiID AND act.IsDefault = 1
    JOIN dbo.API_Field fld ON fld.ApiID = d.ApiID
    WHERE d.ApiCode IN (SELECT DISTINCT ApiCode FROM #AI_META)
      AND NOT EXISTS (
            SELECT 1 FROM dbo.API_Action_Field x
            WHERE x.ActionID = act.ActionID AND x.FieldID = fld.FieldID
      );

    -- Ensure API_Filter baseline (clone non-system fields)
    INSERT INTO dbo.API_Filter
    (
        ApiID, FieldCode, FieldName, DataType, ControlType, [Operator],
        DefaultValue, Placeholder, OptionsJson, DataSourceType, DataSourceValue, IsRequired, OrderIndex
    )
    SELECT
        fld.ApiID, fld.FieldCode, fld.FieldName, fld.DataType, fld.ControlType, '=',
        fld.DefaultValue, fld.Placeholder, fld.OptionsJson, fld.DataSourceType, fld.DataSourceValue, fld.IsRequired, fld.OrderIndex
    FROM dbo.API_Definition d
    JOIN dbo.API_Field fld ON fld.ApiID = d.ApiID
    WHERE d.ApiCode IN (SELECT DISTINCT ApiCode FROM #AI_META)
      AND fld.IsSystemParam = 0
      AND NOT EXISTS (
            SELECT 1 FROM dbo.API_Filter fl
            WHERE fl.ApiID = fld.ApiID AND fl.FieldCode = fld.FieldCode
      );

    /* =========================================================
       APPLY OVERRIDE (OPTIONAL)
       - Fill tables: API_Metadata_Override / API_Metadata_Field_Override /
                      API_Metadata_Bulk_Override to keep business config
       ========================================================= */
    UPDATE d
    SET
        d.ApiCode = COALESCE(o.ApiCode, d.ApiCode),
        d.ApiName = COALESCE(o.ApiName, d.ApiName),
        d.ApiDescription = COALESCE(o.ApiDescription, d.ApiDescription),
        d.Category = COALESCE(o.Category, d.Category),
        d.IconEmoji = COALESCE(o.IconEmoji, d.IconEmoji),
        d.IsActive = COALESCE(o.IsActive, d.IsActive),
        d.OrderIndex = COALESCE(o.OrderIndex, d.OrderIndex)
    FROM dbo.API_Definition d
    JOIN dbo.API_Metadata_Override o
      ON o.StoredProcedure = d.StoredProcedure;

    UPDATE a
    SET
        a.ActionCode = COALESCE(o.ActionCode, a.ActionCode),
        a.ActionName = COALESCE(o.ActionName, a.ActionName),
        a.ExecutionType = COALESCE(o.ExecutionType, a.ExecutionType),
        a.HttpMethod = COALESCE(o.HttpMethod, a.HttpMethod),
        a.IsConfirm = COALESCE(o.IsConfirm, a.IsConfirm)
    FROM dbo.API_Action a
    JOIN dbo.API_Definition d ON d.ApiID = a.ApiID
    JOIN dbo.API_Metadata_Override o ON o.StoredProcedure = d.StoredProcedure
    WHERE a.IsDefault = 1;

    UPDATE f
    SET
        f.FieldName = COALESCE(o.FieldName, f.FieldName),
        f.ControlType = COALESCE(o.ControlType, f.ControlType),
        f.IsRequired = COALESCE(o.IsRequired, f.IsRequired),
        f.IsSystemParam = COALESCE(o.IsSystemParam, f.IsSystemParam),
        f.DefaultValue = COALESCE(o.DefaultValue, f.DefaultValue),
        f.Placeholder = COALESCE(o.Placeholder, f.Placeholder),
        f.MinValue = COALESCE(o.MinValue, f.MinValue),
        f.MaxValue = COALESCE(o.MaxValue, f.MaxValue),
        f.OptionsJson = COALESCE(o.OptionsJson, f.OptionsJson),
        f.DataSourceType = COALESCE(o.DataSourceType, f.DataSourceType),
        f.DataSourceValue = COALESCE(o.DataSourceValue, f.DataSourceValue),
        f.SourceOfTruth = COALESCE(o.SourceOfTruth, f.SourceOfTruth),
        f.ValidationRule = COALESCE(o.ValidationRule, f.ValidationRule),
        f.OrderIndex = COALESCE(o.OrderIndex, f.OrderIndex)
    FROM dbo.API_Field f
    JOIN dbo.API_Definition d ON d.ApiID = f.ApiID
    JOIN dbo.API_Metadata_Field_Override o
      ON o.StoredProcedure = d.StoredProcedure
     AND o.FieldCode = f.FieldCode;

    UPDATE af
    SET
        af.IsVisible = COALESCE(o.IsVisible, af.IsVisible),
        af.IsEditable = COALESCE(o.IsEditable, af.IsEditable),
        af.IsRequired = COALESCE(o.IsRequired, af.IsRequired)
    FROM dbo.API_Action_Field af
    JOIN dbo.API_Action a ON a.ActionID = af.ActionID AND a.IsDefault = 1
    JOIN dbo.API_Field f ON f.FieldID = af.FieldID
    JOIN dbo.API_Definition d ON d.ApiID = a.ApiID AND d.ApiID = f.ApiID
    JOIN dbo.API_Metadata_Field_Override o
      ON o.StoredProcedure = d.StoredProcedure
     AND o.FieldCode = f.FieldCode;

    UPDATE fl
    SET
        fl.FieldName = COALESCE(o.FieldName, fl.FieldName),
        fl.ControlType = COALESCE(o.ControlType, fl.ControlType),
        fl.[Operator] = COALESCE(o.FilterOperator, fl.[Operator]),
        fl.DefaultValue = COALESCE(o.DefaultValue, fl.DefaultValue),
        fl.Placeholder = COALESCE(o.Placeholder, fl.Placeholder),
        fl.OptionsJson = COALESCE(o.OptionsJson, fl.OptionsJson),
        fl.DataSourceType = COALESCE(o.DataSourceType, fl.DataSourceType),
        fl.DataSourceValue = COALESCE(o.DataSourceValue, fl.DataSourceValue),
        fl.IsRequired = COALESCE(o.FilterIsRequired, fl.IsRequired),
        fl.OrderIndex = COALESCE(o.OrderIndex, fl.OrderIndex)
    FROM dbo.API_Filter fl
    JOIN dbo.API_Definition d ON d.ApiID = fl.ApiID
    JOIN dbo.API_Metadata_Field_Override o
      ON o.StoredProcedure = d.StoredProcedure
     AND o.FieldCode = fl.FieldCode;

    INSERT INTO dbo.API_Filter
    (
        ApiID, FieldCode, FieldName, DataType, ControlType, [Operator],
        DefaultValue, Placeholder, OptionsJson, DataSourceType, DataSourceValue, IsRequired, OrderIndex
    )
    SELECT
        d.ApiID,
        f.FieldCode,
        COALESCE(o.FieldName, f.FieldName),
        f.DataType,
        COALESCE(o.ControlType, f.ControlType),
        COALESCE(o.FilterOperator, '='),
        COALESCE(o.DefaultValue, f.DefaultValue),
        COALESCE(o.Placeholder, f.Placeholder),
        COALESCE(o.OptionsJson, f.OptionsJson),
        COALESCE(o.DataSourceType, f.DataSourceType),
        COALESCE(o.DataSourceValue, f.DataSourceValue),
        COALESCE(o.FilterIsRequired, f.IsRequired),
        COALESCE(o.OrderIndex, f.OrderIndex)
    FROM dbo.API_Definition d
    JOIN dbo.API_Field f ON f.ApiID = d.ApiID
    JOIN dbo.API_Metadata_Field_Override o
      ON o.StoredProcedure = d.StoredProcedure
     AND o.FieldCode = f.FieldCode
    WHERE COALESCE(o.IncludeAsFilter, CASE WHEN f.IsSystemParam = 1 THEN 0 ELSE 1 END) = 1
      AND NOT EXISTS (
          SELECT 1
          FROM dbo.API_Filter fl
          WHERE fl.ApiID = d.ApiID
            AND fl.FieldCode = f.FieldCode
      );

    MERGE dbo.API_Bulk_Config AS t
    USING
    (
        SELECT d.ApiID, b.AllowUpload, b.AllowMultiSelect, b.TemplateUrl, b.MaxRows
        FROM dbo.API_Metadata_Bulk_Override b
        JOIN dbo.API_Definition d ON d.StoredProcedure = b.StoredProcedure
    ) AS s
    ON t.ApiID = s.ApiID
    WHEN MATCHED THEN
        UPDATE SET
            t.AllowUpload = s.AllowUpload,
            t.AllowMultiSelect = s.AllowMultiSelect,
            t.TemplateUrl = s.TemplateUrl,
            t.MaxRows = s.MaxRows
    WHEN NOT MATCHED THEN
        INSERT (ApiID, AllowUpload, AllowMultiSelect, TemplateUrl, MaxRows)
        VALUES (s.ApiID, s.AllowUpload, s.AllowMultiSelect, s.TemplateUrl, s.MaxRows);

    SELECT N'Auto bootstrap applied' AS Msg, COUNT(DISTINCT ApiCode) AS ApiCount
    FROM #AI_META;
END

GO
