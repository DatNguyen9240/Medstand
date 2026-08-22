/* TASK-P0-02
   Adds authorization metadata without changing stored-procedure data logic.
   Run in UAT first. The transaction rolls back automatically on any error.

   [2026-07-31] Danh sách trắng dưới đây VIẾT TAY, nên mọi API chỉ-đọc mới sinh
   ra đều im lặng kẹt ở DENY cho tới khi có người thêm tên nó vào. Đã có
   sql/System_API_Capability_AutoGrant_AI.sql để tự tìm và cấp cho những API
   như vậy: nó chứng minh procedure không ghi bảng nào bằng
   sys.dm_sql_referenced_entities, không có SQL động, và có tham số phân quyền
   do server điền. Chạy nó SAU script này mỗi lần bootstrap sinh procedure mới.
   Script này vẫn là nơi chốt các quyết định của con người (đặc biệt là nhóm
   MUTATION, thứ auto-grant không bao giờ tự cấp). */
SET XACT_ABORT ON;
BEGIN TRY
    BEGIN TRANSACTION;

    IF OBJECT_ID('dbo.API_Definition', 'U') IS NULL
        THROW 51200, N'dbo.API_Definition does not exist.', 1;

    IF COL_LENGTH('dbo.API_Definition', 'OperationType') IS NULL
        ALTER TABLE dbo.API_Definition ADD OperationType VARCHAR(20) NULL;
    IF COL_LENGTH('dbo.API_Definition', 'RequiredCapability') IS NULL
        ALTER TABLE dbo.API_Definition ADD RequiredCapability VARCHAR(100) NULL;
    IF COL_LENGTH('dbo.API_Definition', 'AllowedCapabilities') IS NULL
        ALTER TABLE dbo.API_Definition ADD AllowedCapabilities NVARCHAR(1000) NULL;
    IF COL_LENGTH('dbo.API_Definition', 'ScopeResolver') IS NULL
        ALTER TABLE dbo.API_Definition ADD ScopeResolver VARCHAR(50) NULL;
    IF COL_LENGTH('dbo.API_Definition', 'OwnershipRule') IS NULL
        ALTER TABLE dbo.API_Definition ADD OwnershipRule VARCHAR(100) NULL;

    /* Dynamic SQL avoids compile-time references to columns added in this transaction. */
    EXEC sys.sp_executesql N'
        UPDATE dbo.API_Definition
        SET OperationType = ''DENY'',
            RequiredCapability = NULL,
            AllowedCapabilities = N''[]'',
            ScopeResolver = ''NONE'',
            OwnershipRule = ''DENY''
        WHERE OperationType IS NULL;

        UPDATE dbo.API_Definition
        SET OperationType = ''READ'',
            RequiredCapability = ''api.read'',
            AllowedCapabilities = N''["api.read"]'',
            ScopeResolver = ''VERIFIED_USER_HIERARCHY'',
            OwnershipRule = ''TDV_OWN_OR_MANAGER_BRANCH''
        WHERE ApiCode IN (
            ''@doanh_so'', ''@hoa_don'', ''@hoa_don_chi_tiet'', ''@don_hang'',
            ''@cham_diem_kh'', ''@cong_no_khach_hang'', ''@cong_no_chi_tiet'',
            ''@tich_luy'', ''@tuyen_ban_hang'', ''@goi_ydon_hang'', ''@upsell_goi_y'',
            ''@goi_ydon_thuoc'', ''@danh_sach_tonkho'', ''@tra_cuu_san_pham'',
            ''@san_pham_trong_tam'', ''@de_xuat_khuyen_mai'', ''@danh_muc'',
            ''@khao_sat360'',
            ''@danh_sach_cau_hoi_khao_sat'', ''@kiem_tra_khao_sat'',
            ''@kiem_tra_khao_sat_ngay'', ''@lich_su_khao_sat'', ''@thong_bao'',
            ''@tim_san_pham_theo_trieu_chung'',
            /* CORE-001 (2026-07-29): hai API tra cứu phục vụ khung tạo khách hàng
               trong chat.

               [Sửa 2026-07-31] Bản ghi chú trước ở đây nói rằng thiếu tên trong
               danh sách này thì mỗi lần chạy lại script sẽ đẩy chúng về DENY.
               Điều đó SAI: nhánh mặc định phía trên chỉ chạm vào dòng có
               OperationType IS NULL, nên dòng đã là READ giữ nguyên qua mọi lần
               chạy lại. Rủi ro thật nằm ở chỗ khác — API MỚI do
               API_Metadata_AutoBootstrap_AI sinh ra vào đây với OperationType
               NULL, bị hạ xuống DENY, rồi KẸT Ở ĐÓ VĨNH VIỄN cho tới khi có
               người nhớ ra phải gõ tên nó vào danh sách này. Đó chính là chuyện
               đã xảy ra với @hang_hoa_list. */
            ''@object_group_by_user'', ''@employee_by_manager'',
            /* Danh mục hàng hóa dành riêng cho luồng lập đơn qua chat, tạo
               2026-07-31. Chỉ đọc, và tự chặn phạm vi ngay đầu procedure bằng
               AR_GetObjectByUserFnc(@Username) nên khách ngoài quyền không tra
               được. @Username đã là IsSystemParam nên client không khai tay được. */
            ''@hang_hoa_list''
        );

        UPDATE dbo.API_Definition
        SET OperationType = ''MUTATION'',
            RequiredCapability = CASE ApiCode
                WHEN ''@lap_don_hang'' THEN ''orders.write''
                WHEN ''@khach_hang_insert_ai'' THEN ''customers.write''
                WHEN ''@san_pham_trong_tam_import'' THEN ''products.import''
            END,
            AllowedCapabilities = CASE ApiCode
                WHEN ''@lap_don_hang'' THEN N''["orders.write"]''
                WHEN ''@khach_hang_insert_ai'' THEN N''["customers.write"]''
                WHEN ''@san_pham_trong_tam_import'' THEN N''["products.import"]''
            END,
            ScopeResolver = ''VERIFIED_USER_HIERARCHY'',
            OwnershipRule = ''SERVER_VERIFIED_SCOPE_ONLY''
        WHERE ApiCode IN (''@lap_don_hang'', ''@khach_hang_insert_ai'', ''@san_pham_trong_tam_import'');

        IF EXISTS (
            SELECT 1 FROM dbo.API_Definition
            WHERE OperationType <> ''DENY''
              AND (RequiredCapability IS NULL OR ScopeResolver IS NULL OR OwnershipRule IS NULL)
        )
            THROW 51201, N''An allowlisted API is missing authorization metadata.'', 1;
    ';

    COMMIT TRANSACTION;
END TRY
BEGIN CATCH
    IF @@TRANCOUNT > 0 ROLLBACK TRANSACTION;
    THROW;
END CATCH;
GO

SELECT ApiCode, StoredProcedure, OperationType, RequiredCapability,
       AllowedCapabilities, ScopeResolver, OwnershipRule, IsActive
FROM dbo.API_Definition
ORDER BY CASE OperationType WHEN 'MUTATION' THEN 1 WHEN 'READ' THEN 2 ELSE 3 END,
         ApiCode;
GO
