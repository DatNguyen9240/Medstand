USE medtest;
GO

SET ANSI_NULLS ON;
GO
SET QUOTED_IDENTIFIER ON;
GO

/*
  API_KhachHang_Insert_AI

  UAT temporary rule (2026-07-29): create the customer directly in
  CF_ObjectTbl.  The approval step through AR_ObjectNewRequireTbl is deferred,
  but the ERP input contract remains intact: active user, branch/group scope,
  address catalogues, normalized phone, duplicate check, and audit fields.
*/
CREATE OR ALTER PROCEDURE dbo.API_KhachHang_Insert_AI
    @User              VARCHAR(50)   = '',
    @ObjectID          VARCHAR(50)   = '',
    @ObjectName        NVARCHAR(150) = '',
    @Address           NVARCHAR(250) = '',
    @Phone             VARCHAR(50)   = '',
    @TaxCode           VARCHAR(50)   = '',
    @Birthday          DATETIME      = NULL,
    @LoaiKhachHang     NVARCHAR(50)  = '',
    @KenhBan           VARCHAR(50)   = '',
    @AccountNoHD       VARCHAR(50)   = '',
    @AccountNameHD     NVARCHAR(150) = '',
    @ChuTaiKhoan       NVARCHAR(100) = '',
    @BranchID          VARCHAR(50)   = '',
    @ObjectGroupID     VARCHAR(50)   = '',
    @LocationID        NVARCHAR(50)  = '',
    @QuanHuyen         NVARCHAR(50)  = '',
    @XaPhuong          NVARCHAR(50)  = '',
    @ThuDiTuyen        NVARCHAR(10)  = '',
    @Latitude          FLOAT         = 0,
    @Longitude         FLOAT         = 0,
    @AssignedEmployeeID VARCHAR(50) = ''
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;

    DECLARE @EmployeeID VARCHAR(50) = '',
            @ManagerID VARCHAR(50) = '',
            @CeoID VARCHAR(50) = '',
            @UserObjectID VARCHAR(50) = '',
            @UserBranchID VARCHAR(50) = '',
            @UserGroupID VARCHAR(50) = '',
            @EffectiveEmployeeID VARCHAR(50) = '',
            @SaleEmployeeID VARCHAR(50) = '',
            @LevelSub BIT = NULL;

    SELECT @EmployeeID = COALESCE(EmployeeID, ''),
           @ManagerID = COALESCE(ManagerID, ''),
           @CeoID = COALESCE(CeoID, ''),
           @UserObjectID = COALESCE(ObjectID, ''),
           @UserBranchID = COALESCE(BranchID, ''),
           @UserGroupID = COALESCE(UserGroupID, '')
    FROM dbo.SY_User
    WHERE UserName = @User
      AND COALESCE(Disable, 0) = 0;

    IF @@ROWCOUNT = 0
    BEGIN
        SELECT N'Tài khoản không hợp lệ hoặc đã bị khóa.' AS Msg, 1 AS MsgType;
        RETURN;
    END

    IF @UserObjectID <> ''
    BEGIN
        SELECT N'Tài khoản này không có quyền tạo khách hàng.' AS Msg, 1 AS MsgType;
        RETURN;
    END

    -- Sale mặc định là người tạo. Chỉ người quản lý trực tiếp trong sơ đồ
    -- bán hàng mới được giao khách cho một sale khác.
    SET @EffectiveEmployeeID = @EmployeeID;
    IF @EffectiveEmployeeID = '' AND @ManagerID = '' SET @EffectiveEmployeeID = @CeoID;
    IF @EffectiveEmployeeID = '' AND @CeoID = '' SET @EffectiveEmployeeID = @ManagerID;
    SET @SaleEmployeeID = @EffectiveEmployeeID;

    SET @AssignedEmployeeID = LTRIM(RTRIM(COALESCE(@AssignedEmployeeID, '')));
    IF @AssignedEmployeeID <> '' AND @AssignedEmployeeID <> @EffectiveEmployeeID
    BEGIN
        IF NOT EXISTS (
            SELECT 1
            FROM dbo.AR_OpListEmployeeTbl
            WHERE ManagerID = @EffectiveEmployeeID
              AND EmployeeID = @AssignedEmployeeID
              AND COALESCE(isDisable, 0) = 0
        )
        BEGIN
            SELECT N'Bạn không có quyền giao khách hàng cho nhân viên này.' AS Msg, 1 AS MsgType;
            RETURN;
        END
        SET @SaleEmployeeID = @AssignedEmployeeID;
    END

    -- Chi nhánh của sale luôn lấy từ tài khoản đã đăng nhập. Admin không có
    -- chi nhánh riêng có thể dùng chi nhánh đã chọn trên form.
    IF @UserBranchID <> '' SET @BranchID = @UserBranchID;
    IF COALESCE(@BranchID, '') = ''
    BEGIN
        SELECT N'Tài khoản chưa được gán chi nhánh.' AS Msg, 1 AS MsgType;
        RETURN;
    END

    SET @ObjectName = LTRIM(RTRIM(COALESCE(@ObjectName, '')));
    SET @Address = LTRIM(RTRIM(COALESCE(@Address, '')));
    SET @TaxCode = LTRIM(RTRIM(COALESCE(@TaxCode, '')));
    SET @Phone = LTRIM(RTRIM(COALESCE(@Phone, '')));

    IF @ObjectName = ''
    BEGIN
        SELECT N'Bạn chưa nhập tên khách hàng.' AS Msg, 1 AS MsgType;
        RETURN;
    END

    IF @Address = ''
    BEGIN
        SELECT N'Bạn chưa nhập địa chỉ khách hàng.' AS Msg, 1 AS MsgType;
        RETURN;
    END

    IF @Birthday IS NULL OR @Birthday > GETDATE()
    BEGIN
        SELECT N'Ngày sinh không hợp lệ.' AS Msg, 1 AS MsgType;
        RETURN;
    END

    -- Giữ cách chuẩn hóa của ERP, sau đó chỉ chấp nhận chữ số.
    SET @Phone = REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(@Phone, '.', ''), ' ', ''), '-', ''), '_', ''), ',', '');
    IF LEN(@Phone) < 8 OR @Phone LIKE '%[^0-9]%'
    BEGIN
        SELECT N'Số điện thoại phải có ít nhất 8 chữ số và không được có chữ.' AS Msg, 1 AS MsgType;
        RETURN;
    END

    IF @TaxCode = '' OR @TaxCode LIKE '%[^0-9]%' OR LEN(@TaxCode) NOT BETWEEN 10 AND 13
    BEGIN
        SELECT N'Mã số thuế phải gồm 10–13 chữ số.' AS Msg, 1 AS MsgType;
        RETURN;
    END

    IF NOT EXISTS (SELECT 1 FROM dbo.CF_ObjectGroupTbl WHERE ObjectGroupID = @ObjectGroupID)
    BEGIN
        SELECT N'Nhóm khách hàng không hợp lệ: ' + COALESCE(@ObjectGroupID, '') AS Msg, 1 AS MsgType;
        RETURN;
    END

    -- ObjectGroupID quyết định phạm vi nhìn thấy khách. Ngoài Admin, chỉ cho
    -- phép chọn nhóm mà tài khoản hiện tại thực sự quản lý.
    IF UPPER(@UserGroupID) <> 'ADMIN'
    BEGIN
        SELECT TOP 1 @LevelSub = O.LevelSub
        FROM dbo.AR_OpListDetailTbl D
        INNER JOIN dbo.AR_OpListTbl O ON O.OpID = D.OpID
        WHERE D.EmployeeID = @EffectiveEmployeeID
          AND COALESCE(D.isDisable, 0) = 0
        ORDER BY O.LevelCount;

        IF @SaleEmployeeID <> @EffectiveEmployeeID
        BEGIN
            IF NOT EXISTS (
                SELECT 1
                FROM dbo.AR_OpListEmployeeTbl
                WHERE ManagerID = @EffectiveEmployeeID
                  AND EmployeeID = @SaleEmployeeID
                  AND ObjectGroupID = @ObjectGroupID
                  AND COALESCE(isDisable, 0) = 0
            )
            BEGIN
                SELECT N'Nhóm khách hàng không thuộc nhân viên được giao.' AS Msg, 1 AS MsgType;
                RETURN;
            END
        END
        ELSE IF @LevelSub = 1
        BEGIN
            IF NOT EXISTS (
                SELECT 1 FROM dbo.AR_OpListDetailTbl
                WHERE EmployeeID = @EffectiveEmployeeID
                  AND ObjectGroupID = @ObjectGroupID
                  AND COALESCE(isDisable, 0) = 0
            )
            BEGIN
                SELECT N'Bạn không có quyền tạo khách hàng trong nhóm này.' AS Msg, 1 AS MsgType;
                RETURN;
            END
        END
        ELSE IF @LevelSub IS NOT NULL
        BEGIN
            IF NOT EXISTS (
                SELECT 1 FROM dbo.AR_OpListEmployeeTbl
                WHERE ManagerID = @EffectiveEmployeeID
                  AND ObjectGroupID = @ObjectGroupID
                  AND COALESCE(isDisable, 0) = 0
            )
            BEGIN
                SELECT N'Bạn không có quyền tạo khách hàng trong nhóm này.' AS Msg, 1 AS MsgType;
                RETURN;
            END
        END
        ELSE
        BEGIN
            SELECT N'Tài khoản chưa được gán nhóm đối tượng.' AS Msg, 1 AS MsgType;
            RETURN;
        END
    END

    IF NOT EXISTS (SELECT 1 FROM dbo.CF_LocationTbl WHERE LocationID = @LocationID)
    BEGIN
        SELECT N'Tỉnh thành không hợp lệ: ' + COALESCE(@LocationID, '') AS Msg, 1 AS MsgType;
        RETURN;
    END

    IF NOT EXISTS (SELECT 1 FROM dbo.CF_LocationDetailTbl WHERE QuanHuyen = @QuanHuyen)
    BEGIN
        SELECT N'Quận huyện không hợp lệ: ' + COALESCE(@QuanHuyen, '') AS Msg, 1 AS MsgType;
        RETURN;
    END

    IF NOT EXISTS (SELECT 1 FROM dbo.CF_LocationDetail2Tbl WHERE XaPhuong = @XaPhuong)
    BEGIN
        SELECT N'Xã phường không hợp lệ: ' + COALESCE(@XaPhuong, '') AS Msg, 1 AS MsgType;
        RETURN;
    END

    BEGIN TRY
        BEGIN TRANSACTION;

        -- Vẫn quét cả yêu cầu cũ đang chờ duyệt để không tạo trùng số.
        IF EXISTS (
            SELECT 1 FROM dbo.CF_ObjectTbl WITH (UPDLOCK, HOLDLOCK)
            WHERE Phone = @Phone AND ObjectID <> COALESCE(@ObjectID, '')
            UNION ALL
            SELECT 1 FROM dbo.AR_ObjectNewRequireTbl WITH (UPDLOCK, HOLDLOCK)
            WHERE Phone = @Phone AND ObjectID <> COALESCE(@ObjectID, '')
        )
        BEGIN
            ROLLBACK TRANSACTION;
            SELECT N'Số điện thoại này đã tồn tại.' AS Msg, 1 AS MsgType;
            RETURN;
        END

        IF COALESCE(@ObjectID, '') = ''
            SET @ObjectID = CONVERT(VARCHAR(50), NEWID());

        IF EXISTS (SELECT 1 FROM dbo.CF_ObjectTbl WITH (UPDLOCK, HOLDLOCK) WHERE ObjectID = @ObjectID)
        BEGIN
            ROLLBACK TRANSACTION;
            SELECT N'Mã khách hàng đã tồn tại.' AS Msg, 1 AS MsgType;
            RETURN;
        END

        INSERT INTO dbo.CF_ObjectTbl (
            ObjectID, BranchID, ObjectName, Address, TaxCode, Phone,
            ObjectGroupID, LocationID, QuanHuyen, XaPhuong, Birthday,
            LoaiHopDong, PhanLoaiKhach, ThuTrongTuan,
            AccountNoHD, AccountNameHD, ChuTaiKhoan,
            RevAccID, PayAccID,
            isCustomer, isEmployee, isManager, isVendor, isAgency, isDefault, isDisable,
            CongNoDonHang, IsForeign, SaleID, UserCreate, DateCreate
        )
        VALUES (
            @ObjectID, @BranchID, @ObjectName, @Address, @TaxCode, @Phone,
            @ObjectGroupID, @LocationID, @QuanHuyen, @XaPhuong, @Birthday,
            @LoaiKhachHang, @KenhBan, @ThuDiTuyen,
            @AccountNoHD, @AccountNameHD, @ChuTaiKhoan,
            '1311', '3311',
            1, 0, 0, 0, 0, 0, 0,
            0, 0, @SaleEmployeeID, @User, GETDATE()
        );

        IF COALESCE(@Longitude, 0) <> 0 OR COALESCE(@Latitude, 0) <> 0
        BEGIN
            INSERT INTO dbo.CF_ObjectMapTbl (UserAutoID, ObjectID, Latitude, Longitude, MapDate)
            VALUES (NEWID(), @ObjectID, @Latitude, @Longitude, GETDATE());
        END

        COMMIT TRANSACTION;

        SELECT N'Thêm khách hàng thành công.' AS Msg,
               5 AS MsgType,
               @ObjectID AS ObjectID;
    END TRY
    BEGIN CATCH
        IF XACT_STATE() <> 0 ROLLBACK TRANSACTION;
        SELECT N'Hệ thống chưa thể tạo khách hàng. Vui lòng thử lại.' AS Msg,
               1 AS MsgType;
    END CATCH
END
GO
