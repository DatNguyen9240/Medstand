USE medtest;
GO

SET XACT_ABORT ON;
GO

/*
  Cấu hình SELF_ASSIGN cho tài khoản mẫu.
  - Không hard-code username trong procedure/frontend.
  - Không tạo nhân viên dưới quyền hay sửa sơ đồ tổ chức ERP.
  - Khách do demo tạo luôn bị ép vào nhóm DEMO_KH và SaleID kỹ thuật DEMO.
  - Chỉ seed một tài khoản demo; muốn mở cho tài khoản khác phải thêm cấu hình rõ ràng.
*/
BEGIN TRY
    BEGIN TRANSACTION;

    IF DB_NAME() <> N'medtest'
        THROW 51520, N'Migration SELF_ASSIGN chỉ được chạy trên medtest.', 1;

    IF NOT EXISTS
    (
        SELECT 1
        FROM dbo.SY_User
        WHERE UserName = 'demo'
          AND COALESCE(Disable, 0) = 0
          AND COALESCE(ObjectID, '') = ''
    )
        THROW 51521, N'Tài khoản demo không tồn tại, đã bị khóa hoặc là tài khoản khách hàng.', 1;

    IF NOT EXISTS (SELECT 1 FROM dbo.CF_TinhThanhTbl WHERE TinhThanh = N'Hà Nội')
        THROW 51522, N'Không tìm thấy tỉnh/thành Hà Nội để giới hạn dữ liệu demo.', 1;

    IF OBJECT_ID(N'dbo.AI_CustomerSelfAssignConfig', N'U') IS NULL
    BEGIN
        CREATE TABLE dbo.AI_CustomerSelfAssignConfig
        (
            Username      VARCHAR(50)   NOT NULL,
            EmployeeID    VARCHAR(50)   NOT NULL,
            ObjectGroupID VARCHAR(50)   NOT NULL,
            LocationID    NVARCHAR(100) NOT NULL,
            DisplayName   NVARCHAR(150) NOT NULL,
            IsActive      BIT           NOT NULL
                CONSTRAINT DF_AI_CustomerSelfAssignConfig_IsActive DEFAULT (1),
            CreatedAt     DATETIME2(3)  NOT NULL
                CONSTRAINT DF_AI_CustomerSelfAssignConfig_CreatedAt DEFAULT SYSUTCDATETIME(),
            UpdatedAt     DATETIME2(3)  NOT NULL
                CONSTRAINT DF_AI_CustomerSelfAssignConfig_UpdatedAt DEFAULT SYSUTCDATETIME(),
            CONSTRAINT PK_AI_CustomerSelfAssignConfig PRIMARY KEY (Username)
        );
    END;

    IF NOT EXISTS (SELECT 1 FROM dbo.CF_ObjectGroupTbl WHERE ObjectGroupID = 'DEMO_KH')
    BEGIN
        INSERT dbo.CF_ObjectGroupTbl
        (
            ObjectGroupID, ObjectGroupName, BranchID, LocationID,
            isCustomer, isVendor, isEmployee, isManager, isDefault,
            UserCreate, DateCreate
        )
        VALUES
        (
            'DEMO_KH', N'Khách hàng Demo', 'MB', N'Hà Nội',
            1, 0, 0, 0, 0,
            'Codex', GETDATE()
        );
    END
    ELSE IF EXISTS
    (
        SELECT 1
        FROM dbo.CF_ObjectGroupTbl
        WHERE ObjectGroupID = 'DEMO_KH'
          AND
          (
              COALESCE(BranchID, '') <> 'MB'
              OR COALESCE(LocationID, N'') <> N'Hà Nội'
              OR COALESCE(isCustomer, 0) <> 1
          )
    )
        THROW 51523, N'Nhóm DEMO_KH đã tồn tại nhưng không đúng phạm vi demo dự kiến.', 1;

    UPDATE dbo.AI_CustomerSelfAssignConfig
    SET EmployeeID = 'DEMO',
        ObjectGroupID = 'DEMO_KH',
        LocationID = N'Hà Nội',
        DisplayName = N'Demo (tự phụ trách)',
        IsActive = 1,
        UpdatedAt = SYSUTCDATETIME()
    WHERE Username = 'demo';

    IF @@ROWCOUNT = 0
    BEGIN
        INSERT dbo.AI_CustomerSelfAssignConfig
        (
            Username, EmployeeID, ObjectGroupID, LocationID, DisplayName, IsActive
        )
        VALUES
        (
            'demo', 'DEMO', 'DEMO_KH', N'Hà Nội', N'Demo (tự phụ trách)', 1
        );
    END;

    COMMIT TRANSACTION;
END TRY
BEGIN CATCH
    IF XACT_STATE() <> 0 ROLLBACK TRANSACTION;
    THROW;
END CATCH;
GO

SELECT Username, EmployeeID, ObjectGroupID, LocationID, DisplayName, IsActive
FROM dbo.AI_CustomerSelfAssignConfig
WHERE Username = 'demo';
GO
