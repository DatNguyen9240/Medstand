USE medtest;
GO

SET ANSI_NULLS ON;
GO
SET QUOTED_IDENTIFIER ON;
GO

/*
  CORE-010 hardened customer mutation.
  - Identity is verified and overwritten by the gateway before this procedure is called.
  - Idempotency key + canonical payload fingerprint are committed atomically with the customer.
  - Success/replay/conflict audits are mandatory and share the ledger transaction.
  - A missing audit dependency fails closed before business data can be committed.
*/
CREATE OR ALTER PROCEDURE dbo.API_KhachHang_Insert_AI
    @User               VARCHAR(50)   = '',
    @ObjectID           VARCHAR(50)   = '',
    @ObjectName         NVARCHAR(150) = '',
    @Address            NVARCHAR(250) = '',
    @Phone              VARCHAR(50)   = '',
    @TaxCode            VARCHAR(50)   = '',
    @Birthday           DATETIME      = NULL,
    @LoaiKhachHang      NVARCHAR(50)  = '',
    @KenhBan            VARCHAR(50)   = '',
    @AccountNoHD        VARCHAR(50)   = '',
    @AccountNameHD      NVARCHAR(150) = '',
    @ChuTaiKhoan        NVARCHAR(100) = '',
    @BranchID           VARCHAR(50)   = '',
    @ObjectGroupID      VARCHAR(50)   = '',
    @LocationID         NVARCHAR(50)  = '',
    @QuanHuyen          NVARCHAR(50)  = '',
    @XaPhuong           NVARCHAR(50)  = '',
    @ThuDiTuyen         NVARCHAR(10)  = '',
    @Latitude           FLOAT         = 0,
    @Longitude          FLOAT         = 0,
    @AssignedEmployeeID VARCHAR(50)   = '',
    @IdempotencyKey     VARCHAR(128)  = '',
    @RequestID          VARCHAR(100)  = ''
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;

    DECLARE @ApiCode VARCHAR(100) = 'API_KhachHang_Insert_AI',
            @RequiredCapability VARCHAR(100) = 'customers.write',
            @ResultCode VARCHAR(60) = '',
            @ResultMsg NVARCHAR(500) = N'',
            @InternalError NVARCHAR(2000) = N'',
            @AuditInfo NVARCHAR(MAX) = N'',
            @EmployeeID VARCHAR(50) = '',
            @ManagerID VARCHAR(50) = '',
            @CeoID VARCHAR(50) = '',
            @UserObjectID VARCHAR(50) = '',
            @UserBranchID VARCHAR(50) = '',
            @UserGroupID VARCHAR(50) = '',
            @EffectiveEmployeeID VARCHAR(50) = '',
            @SaleEmployeeID VARCHAR(50) = '',
            @LevelSub BIT = NULL,
            @IdempotencyKeyHash CHAR(64) = NULL,
            @VerifiedUserHash CHAR(64) = NULL,
            @RequestFingerprintHash CHAR(64) = NULL,
            @StoredStatus VARCHAR(20) = NULL,
            @StoredFingerprintHash CHAR(64) = NULL,
            @StoredObjectID VARCHAR(100) = NULL,
            @StoredMsg NVARCHAR(500) = NULL;

    SET @User = LTRIM(RTRIM(COALESCE(@User, '')));
    SET @ObjectID = LTRIM(RTRIM(COALESCE(@ObjectID, '')));
    SET @ObjectName = LTRIM(RTRIM(COALESCE(@ObjectName, N'')));
    SET @Address = LTRIM(RTRIM(COALESCE(@Address, N'')));
    SET @Phone = LTRIM(RTRIM(COALESCE(@Phone, '')));
    SET @TaxCode = LTRIM(RTRIM(COALESCE(@TaxCode, '')));
    SET @ObjectGroupID = LTRIM(RTRIM(COALESCE(@ObjectGroupID, '')));
    SET @LocationID = LTRIM(RTRIM(COALESCE(@LocationID, N'')));
    SET @QuanHuyen = LTRIM(RTRIM(COALESCE(@QuanHuyen, N'')));
    SET @XaPhuong = LTRIM(RTRIM(COALESCE(@XaPhuong, N'')));
    SET @AssignedEmployeeID = LTRIM(RTRIM(COALESCE(@AssignedEmployeeID, '')));
    SET @IdempotencyKey = LTRIM(RTRIM(COALESCE(@IdempotencyKey, '')));
    SET @RequestID = LTRIM(RTRIM(COALESCE(@RequestID, '')));

    IF LEN(@IdempotencyKey) < 8 OR LEN(@IdempotencyKey) > 128
       OR @IdempotencyKey LIKE '%[^A-Za-z0-9._:-]%'
    BEGIN
        SET @ResultCode = 'IDEMPOTENCY_KEY_REQUIRED';
        SET @ResultMsg = N'Yêu cầu tạo khách thiếu khóa chống gửi lặp hợp lệ.';
        GOTO ReturnFailure;
    END;

    IF LEN(@RequestID) < 8 OR LEN(@RequestID) > 100
       OR @RequestID LIKE '%[^A-Za-z0-9._:-]%'
    BEGIN
        SET @ResultCode = 'REQUEST_ID_REQUIRED';
        SET @ResultMsg = N'Yêu cầu tạo khách thiếu mã request hợp lệ.';
        GOTO ReturnFailure;
    END;

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
        SET @ResultCode = 'INVALID_USER';
        SET @ResultMsg = N'Tài khoản không hợp lệ hoặc đã bị khóa.';
        GOTO ReturnFailure;
    END;

    IF @UserObjectID <> ''
    BEGIN
        SET @ResultCode = 'CUSTOMER_ACCOUNT_FORBIDDEN';
        SET @ResultMsg = N'Tài khoản này không có quyền tạo khách hàng.';
        GOTO ReturnFailure;
    END;

    IF OBJECT_ID('dbo.AI_API_MutationIdempotency', 'U') IS NULL
    BEGIN
        SET @ResultCode = 'IDEMPOTENCY_LEDGER_UNAVAILABLE';
        SET @ResultMsg = N'Hệ thống chống gửi lặp chưa sẵn sàng. Mã đối soát: ' + @RequestID;
        GOTO ReturnFailure;
    END;

    IF OBJECT_ID('dbo.AI_WriteAuditLog', 'P') IS NULL
    BEGIN
        SET @ResultCode = 'AUDIT_UNAVAILABLE';
        SET @ResultMsg = N'Hệ thống audit chưa sẵn sàng. Không tạo khách hàng. Mã đối soát: ' + @RequestID;
        GOTO ReturnFailure;
    END;

    SET @EffectiveEmployeeID = @EmployeeID;
    IF @EffectiveEmployeeID = '' AND @ManagerID = '' SET @EffectiveEmployeeID = @CeoID;
    IF @EffectiveEmployeeID = '' AND @CeoID = '' SET @EffectiveEmployeeID = @ManagerID;
    SET @SaleEmployeeID = @EffectiveEmployeeID;

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
            SET @ResultCode = 'ASSIGNEE_OUT_OF_SCOPE';
            SET @ResultMsg = N'Bạn không có quyền giao khách hàng cho nhân viên này.';
            GOTO ReturnFailure;
        END;
        SET @SaleEmployeeID = @AssignedEmployeeID;
    END;

    IF @UserBranchID <> '' SET @BranchID = @UserBranchID;
    IF COALESCE(@BranchID, '') = ''
    BEGIN
        SET @ResultCode = 'BRANCH_REQUIRED';
        SET @ResultMsg = N'Tài khoản chưa được gán chi nhánh.';
        GOTO ReturnFailure;
    END;

    IF @ObjectName = ''
    BEGIN
        SET @ResultCode = 'CUSTOMER_NAME_REQUIRED';
        SET @ResultMsg = N'Bạn chưa nhập tên khách hàng.';
        GOTO ReturnFailure;
    END;

    IF @Address = ''
    BEGIN
        SET @ResultCode = 'CUSTOMER_ADDRESS_REQUIRED';
        SET @ResultMsg = N'Bạn chưa nhập địa chỉ khách hàng.';
        GOTO ReturnFailure;
    END;

    IF @Birthday IS NULL OR @Birthday > GETDATE()
    BEGIN
        SET @ResultCode = 'INVALID_BIRTHDAY';
        SET @ResultMsg = N'Ngày sinh không hợp lệ.';
        GOTO ReturnFailure;
    END;

    SET @Phone = REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(@Phone, '.', ''), ' ', ''), '-', ''), '_', ''), ',', '');
    IF LEN(@Phone) < 8 OR @Phone LIKE '%[^0-9]%'
    BEGIN
        SET @ResultCode = 'INVALID_PHONE';
        SET @ResultMsg = N'Số điện thoại phải có ít nhất 8 chữ số và không được có chữ.';
        GOTO ReturnFailure;
    END;

    IF @TaxCode = '' OR @TaxCode LIKE '%[^0-9]%' OR LEN(@TaxCode) NOT BETWEEN 10 AND 13
    BEGIN
        SET @ResultCode = 'INVALID_TAX_CODE';
        SET @ResultMsg = N'Mã số thuế phải gồm 10–13 chữ số.';
        GOTO ReturnFailure;
    END;

    IF NOT EXISTS (SELECT 1 FROM dbo.CF_ObjectGroupTbl WHERE ObjectGroupID = @ObjectGroupID)
    BEGIN
        SET @ResultCode = 'INVALID_OBJECT_GROUP';
        SET @ResultMsg = N'Nhóm khách hàng không hợp lệ: ' + COALESCE(@ObjectGroupID, '');
        GOTO ReturnFailure;
    END;

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
                SELECT 1 FROM dbo.AR_OpListEmployeeTbl
                WHERE ManagerID = @EffectiveEmployeeID
                  AND EmployeeID = @SaleEmployeeID
                  AND ObjectGroupID = @ObjectGroupID
                  AND COALESCE(isDisable, 0) = 0
            )
            BEGIN
                SET @ResultCode = 'OBJECT_GROUP_OUT_OF_SCOPE';
                SET @ResultMsg = N'Nhóm khách hàng không thuộc nhân viên được giao.';
                GOTO ReturnFailure;
            END;
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
                SET @ResultCode = 'OBJECT_GROUP_OUT_OF_SCOPE';
                SET @ResultMsg = N'Bạn không có quyền tạo khách hàng trong nhóm này.';
                GOTO ReturnFailure;
            END;
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
                SET @ResultCode = 'OBJECT_GROUP_OUT_OF_SCOPE';
                SET @ResultMsg = N'Bạn không có quyền tạo khách hàng trong nhóm này.';
                GOTO ReturnFailure;
            END;
        END
        ELSE
        BEGIN
            SET @ResultCode = 'OBJECT_GROUP_SCOPE_REQUIRED';
            SET @ResultMsg = N'Tài khoản chưa được gán nhóm đối tượng.';
            GOTO ReturnFailure;
        END;
    END;

    IF NOT EXISTS (SELECT 1 FROM dbo.CF_LocationTbl WHERE LocationID = @LocationID)
    BEGIN
        SET @ResultCode = 'INVALID_LOCATION';
        SET @ResultMsg = N'Tỉnh thành không hợp lệ: ' + COALESCE(@LocationID, '');
        GOTO ReturnFailure;
    END;

    IF OBJECT_ID('dbo.AI_GetTinhThanhByUserFnc', 'IF') IS NULL
    BEGIN
        SET @ResultCode = 'LOCATION_SCOPE_UNAVAILABLE';
        SET @ResultMsg = N'Hệ thống kiểm tra phạm vi tỉnh/thành chưa sẵn sàng.';
        GOTO ReturnFailure;
    END;

    IF NOT EXISTS
    (
        SELECT 1
        FROM dbo.AI_GetTinhThanhByUserFnc(@User)
        WHERE LocationID = @LocationID
    )
    BEGIN
        SET @ResultCode = 'LOCATION_OUT_OF_SCOPE';
        SET @ResultMsg = N'Tỉnh/thành không thuộc phạm vi nhóm khách hàng của tài khoản.';
        GOTO ReturnFailure;
    END;

    /*
      Dùng cùng nguồn địa giới hiện hành với dropdown. Sau thay đổi địa giới,
      nhiều tỉnh dùng mô hình hai cấp nên QuanHuyen của phường/xã để NULL;
      Hà Nội vẫn còn dữ liệu ba cấp. Không ép các tỉnh hai cấp chọn một huyện
      legacy không liên quan và luôn kiểm tra phường/xã thuộc đúng tỉnh.
    */
    IF NOT EXISTS
    (
        SELECT 1
        FROM dbo.CF_XaPhuongTbl W
        WHERE W.TinhThanh = @LocationID
          AND W.XaPhuong = @XaPhuong
          AND
          (
              (NULLIF(LTRIM(RTRIM(COALESCE(W.QuanHuyen, N''))), N'') IS NULL AND @QuanHuyen = N'')
              OR W.QuanHuyen = @QuanHuyen
          )
    )
    BEGIN
        SET @ResultCode = 'INVALID_ADMIN_AREA';
        SET @ResultMsg = N'Tỉnh/thành, quận/huyện và phường/xã không cùng một địa giới hợp lệ.';
        GOTO ReturnFailure;
    END;

    SET @IdempotencyKeyHash = LOWER(CONVERT(CHAR(64), HASHBYTES('SHA2_256', CONVERT(VARBINARY(MAX), @IdempotencyKey)), 2));
    SET @VerifiedUserHash = LOWER(CONVERT(CHAR(64), HASHBYTES('SHA2_256', CONVERT(VARBINARY(MAX), LOWER(@User))), 2));
    SET @RequestFingerprintHash = LOWER(CONVERT(CHAR(64), HASHBYTES('SHA2_256', CONVERT(VARBINARY(MAX), CONCAT(
        LOWER(@User), '|', CASE WHEN @ObjectID = '' THEN 'AUTO_GEN' ELSE @ObjectID END, '|',
        @ObjectName, '|', @Address, '|', @Phone, '|', @TaxCode, '|', CONVERT(CHAR(10), CAST(@Birthday AS DATE), 23), '|',
        COALESCE(@LoaiKhachHang, N''), '|', COALESCE(@KenhBan, ''), '|', COALESCE(@AccountNoHD, ''), '|',
        COALESCE(@AccountNameHD, N''), '|', COALESCE(@ChuTaiKhoan, N''), '|', @BranchID, '|', @ObjectGroupID, '|',
        @LocationID, '|', @QuanHuyen, '|', @XaPhuong, '|', COALESCE(@ThuDiTuyen, N''), '|',
        CONVERT(VARCHAR(64), COALESCE(@Latitude, 0), 2), '|', CONVERT(VARCHAR(64), COALESCE(@Longitude, 0), 2), '|', @SaleEmployeeID
    ))), 2));

    BEGIN TRY
        BEGIN TRANSACTION;

        SELECT @StoredStatus = Status,
               @StoredFingerprintHash = RequestFingerprintHash,
               @StoredObjectID = ResultEntityID,
               @StoredMsg = ResultMsg
        FROM dbo.AI_API_MutationIdempotency WITH (UPDLOCK, HOLDLOCK)
        WHERE IdempotencyKeyHash = @IdempotencyKeyHash
          AND VerifiedUserHash = @VerifiedUserHash
          AND ApiCode = @ApiCode;

        IF @StoredStatus IS NOT NULL
        BEGIN
            IF @StoredFingerprintHash IS NULL OR @StoredFingerprintHash <> @RequestFingerprintHash
            BEGIN
                UPDATE dbo.AI_API_MutationIdempotency
                SET LastRequestID = @RequestID, UpdatedAt = SYSUTCDATETIME()
                WHERE IdempotencyKeyHash = @IdempotencyKeyHash
                  AND VerifiedUserHash = @VerifiedUserHash
                  AND ApiCode = @ApiCode;

                SET @AuditInfo = N'{"requestId":"' + STRING_ESCAPE(@RequestID, 'json')
                    + N'","idempotencyKeyHash":"' + @IdempotencyKeyHash
                    + N'","payloadFingerprint":"' + @RequestFingerprintHash
                    + N'","capability":"' + @RequiredCapability
                    + N'","branchId":"' + STRING_ESCAPE(@BranchID, 'json')
                    + N'","resultCode":"IDEMPOTENCY_CONFLICT","outcome":"REJECTED"}';
                EXEC dbo.AI_WriteAuditLog @Username=@User, @ActionType='IDEMPOTENCY_CONFLICT_CUSTOMER',
                     @TargetEntity=@ApiCode, @TargetID=@StoredObjectID, @ExtraInfo=@AuditInfo;
                COMMIT TRANSACTION;

                SELECT NULL AS ObjectID,
                       N'Khóa gửi lặp đã được dùng cho nội dung tạo khách khác.' AS Msg,
                       1 AS MsgType,
                       @RequestID AS RequestID,
                       'IDEMPOTENCY_CONFLICT' AS Code,
                       CAST(0 AS BIT) AS IsReplay;
                RETURN;
            END;

            IF @StoredStatus = 'COMPLETED' AND COALESCE(@StoredObjectID, '') <> ''
            BEGIN
                UPDATE dbo.AI_API_MutationIdempotency
                SET LastRequestID = @RequestID, UpdatedAt = SYSUTCDATETIME()
                WHERE IdempotencyKeyHash = @IdempotencyKeyHash
                  AND VerifiedUserHash = @VerifiedUserHash
                  AND ApiCode = @ApiCode;

                SET @AuditInfo = N'{"requestId":"' + STRING_ESCAPE(@RequestID, 'json')
                    + N'","idempotencyKeyHash":"' + @IdempotencyKeyHash
                    + N'","payloadFingerprint":"' + @RequestFingerprintHash
                    + N'","capability":"' + @RequiredCapability
                    + N'","branchId":"' + STRING_ESCAPE(@BranchID, 'json')
                    + N'","resultCode":"IDEMPOTENCY_REPLAY","outcome":"REPLAY"}';
                EXEC dbo.AI_WriteAuditLog @Username=@User, @ActionType='REPLAY_CUSTOMER',
                     @TargetEntity=@ApiCode, @TargetID=@StoredObjectID, @ExtraInfo=@AuditInfo;
                COMMIT TRANSACTION;

                SELECT @StoredObjectID AS ObjectID,
                       COALESCE(NULLIF(@StoredMsg, N''), N'Khách hàng đã được tạo trước đó.') AS Msg,
                       5 AS MsgType,
                       @RequestID AS RequestID,
                       'IDEMPOTENCY_REPLAY' AS Code,
                       CAST(1 AS BIT) AS IsReplay;
                RETURN;
            END;

            SET @ResultCode = 'IDEMPOTENCY_IN_PROGRESS';
            SET @ResultMsg = N'Yêu cầu trùng đang được xử lý.';
            THROW 51101, @ResultMsg, 1;
        END;

        INSERT dbo.AI_API_MutationIdempotency (
            IdempotencyKeyHash, VerifiedUserHash, ApiCode, RequestFingerprintHash,
            Status, FirstRequestID, LastRequestID
        ) VALUES (
            @IdempotencyKeyHash, @VerifiedUserHash, @ApiCode, @RequestFingerprintHash,
            'PENDING', @RequestID, @RequestID
        );

        IF EXISTS (
            SELECT 1 FROM dbo.CF_ObjectTbl WITH (UPDLOCK, HOLDLOCK)
            WHERE Phone = @Phone AND ObjectID <> COALESCE(@ObjectID, '')
            UNION ALL
            SELECT 1 FROM dbo.AR_ObjectNewRequireTbl WITH (UPDLOCK, HOLDLOCK)
            WHERE Phone = @Phone AND ObjectID <> COALESCE(@ObjectID, '')
        )
        BEGIN
            SET @ResultCode = 'DUPLICATE_PHONE';
            SET @ResultMsg = N'Số điện thoại này đã tồn tại.';
            THROW 51102, @ResultMsg, 1;
        END;

        IF @ObjectID = '' SET @ObjectID = CONVERT(VARCHAR(50), NEWID());

        IF EXISTS (SELECT 1 FROM dbo.CF_ObjectTbl WITH (UPDLOCK, HOLDLOCK) WHERE ObjectID = @ObjectID)
        BEGIN
            SET @ResultCode = 'DUPLICATE_OBJECT_ID';
            SET @ResultMsg = N'Mã khách hàng đã tồn tại.';
            THROW 51103, @ResultMsg, 1;
        END;

        INSERT INTO dbo.CF_ObjectTbl (
            ObjectID, BranchID, ObjectName, Address, TaxCode, Phone,
            ObjectGroupID, LocationID, QuanHuyen, XaPhuong, Birthday,
            LoaiHopDong, PhanLoaiKhach, ThuTrongTuan,
            AccountNoHD, AccountNameHD, ChuTaiKhoan,
            RevAccID, PayAccID,
            isCustomer, isEmployee, isManager, isVendor, isAgency, isDefault, isDisable,
            CongNoDonHang, IsForeign, SaleID, UserCreate, DateCreate
        ) VALUES (
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
        END;

        UPDATE dbo.AI_API_MutationIdempotency
        SET Status = 'COMPLETED',
            ResultEntityID = @ObjectID,
            ResultMsg = N'Thêm khách hàng thành công.',
            ResultMsgType = 5,
            LastRequestID = @RequestID,
            UpdatedAt = SYSUTCDATETIME(),
            CompletedAt = SYSUTCDATETIME()
        WHERE IdempotencyKeyHash = @IdempotencyKeyHash
          AND VerifiedUserHash = @VerifiedUserHash
          AND ApiCode = @ApiCode;

        SET @AuditInfo = N'{"requestId":"' + STRING_ESCAPE(@RequestID, 'json')
            + N'","idempotencyKeyHash":"' + @IdempotencyKeyHash
            + N'","payloadFingerprint":"' + @RequestFingerprintHash
            + N'","capability":"' + @RequiredCapability
            + N'","branchId":"' + STRING_ESCAPE(@BranchID, 'json')
            + N'","resultCode":"CREATED","outcome":"CREATED"}';
        EXEC dbo.AI_WriteAuditLog @Username=@User, @ActionType='CREATE_CUSTOMER',
             @TargetEntity=@ApiCode, @TargetID=@ObjectID, @TargetName=@ObjectName, @ExtraInfo=@AuditInfo;

        COMMIT TRANSACTION;

        SELECT @ObjectID AS ObjectID,
               N'Thêm khách hàng thành công.' AS Msg,
               5 AS MsgType,
               @RequestID AS RequestID,
               'CREATED' AS Code,
               CAST(0 AS BIT) AS IsReplay;
        RETURN;
    END TRY
    BEGIN CATCH
        SET @InternalError = ERROR_MESSAGE();
        IF XACT_STATE() <> 0 ROLLBACK TRANSACTION;
        IF @ResultCode = '' SET @ResultCode = 'SYSTEM_ERROR';
        IF @ResultMsg = '' SET @ResultMsg = N'Hệ thống chưa thể tạo khách hàng. Mã đối soát: ' + @RequestID;
    END CATCH;

ReturnFailure:
    IF @ResultCode <> 'AUDIT_UNAVAILABLE'
       AND @User <> ''
       AND @RequestID LIKE 'req-%'
    BEGIN
        BEGIN TRY
            SET @AuditInfo = N'{"requestId":"' + STRING_ESCAPE(@RequestID, 'json')
                + N'","idempotencyKeyHash":' + CASE WHEN @IdempotencyKeyHash IS NULL THEN N'null' ELSE N'"' + @IdempotencyKeyHash + N'"' END
                + N',"payloadFingerprint":' + CASE WHEN @RequestFingerprintHash IS NULL THEN N'null' ELSE N'"' + @RequestFingerprintHash + N'"' END
                + N',"capability":"' + @RequiredCapability
                + N'","branchId":"' + STRING_ESCAPE(COALESCE(@BranchID, ''), 'json')
                + N'","resultCode":"' + STRING_ESCAPE(COALESCE(NULLIF(@ResultCode, ''), 'UNKNOWN'), 'json')
                + N'","outcome":"FAILED"}';
            EXEC dbo.AI_WriteAuditLog @Username=@User, @ActionType='CREATE_CUSTOMER_FAILED',
                 @TargetEntity=@ApiCode, @TargetID=NULL, @ExtraInfo=@AuditInfo;
        END TRY
        BEGIN CATCH
            SET @ResultCode = 'AUDIT_WRITE_FAILED';
            SET @ResultMsg = N'Không thể ghi audit mutation. Không có dữ liệu khách hàng nào được commit. Mã đối soát: ' + @RequestID;
        END CATCH;
    END;

    SELECT NULL AS ObjectID,
           @ResultMsg AS Msg,
           1 AS MsgType,
           NULLIF(@RequestID, '') AS RequestID,
           COALESCE(NULLIF(@ResultCode, ''), 'SYSTEM_ERROR') AS Code,
           CAST(0 AS BIT) AS IsReplay;
END;
GO
