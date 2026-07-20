/* TASK-P0-02
   Adds authorization metadata without changing stored-procedure data logic.
   Run in UAT first. The transaction rolls back automatically on any error. */
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
            ''@tim_san_pham_theo_trieu_chung''
        );

        UPDATE dbo.API_Definition
        SET OperationType = ''MUTATION'',
            RequiredCapability = CASE ApiCode
                WHEN ''@lap_don_hang'' THEN ''orders.write''
                WHEN ''@khach_hang_insert'' THEN ''customers.write''
                WHEN ''@san_pham_trong_tam_import'' THEN ''products.import''
            END,
            AllowedCapabilities = CASE ApiCode
                WHEN ''@lap_don_hang'' THEN N''["orders.write"]''
                WHEN ''@khach_hang_insert'' THEN N''["customers.write"]''
                WHEN ''@san_pham_trong_tam_import'' THEN N''["products.import"]''
            END,
            ScopeResolver = ''VERIFIED_USER_HIERARCHY'',
            OwnershipRule = ''SERVER_VERIFIED_SCOPE_ONLY''
        WHERE ApiCode IN (''@lap_don_hang'', ''@khach_hang_insert'', ''@san_pham_trong_tam_import'');

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
