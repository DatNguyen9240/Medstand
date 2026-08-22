USE medtest;
GO

/*
  Secure customer update used by /api/API_KhachHang_Update.
  - Identity is verified by the gateway and revalidated against SY_User.
  - Official customers are authorized by AR_GetObjectByUserFnc.
  - Pending customers use creator/employee/object-group ownership.
  - Idempotency ledger, business update, map and audit commit atomically.
*/
CREATE OR ALTER PROCEDURE dbo.API_KhachHang_Update
    @User               VARCHAR(50),
    @OldKeyID           VARCHAR(50),
    @ObjectName         NVARCHAR(150),
    @Address            NVARCHAR(250),
    @LocationID         NVARCHAR(50),
    @QuanHuyen          NVARCHAR(50),
    @XaPhuong           NVARCHAR(50),
    @Phone              VARCHAR(50),
    @TaxCode            VARCHAR(50),
    @Birthday           DATETIME,
    @LoaiKhachHang      NVARCHAR(50),
    @KenhBan            VARCHAR(50),
    @ThuDiTuyen         NVARCHAR(10),
    @Latitude           FLOAT,
    @Longitude          FLOAT,
    @IdempotencyKey     VARCHAR(128) = '',
    @RequestID          VARCHAR(100) = ''
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;

    DECLARE @ApiCode VARCHAR(100) = 'API_KhachHang_Update',
            @ResultCode VARCHAR(60) = 'UPDATE_CUSTOMER_FAILED',
            @ResultMsg NVARCHAR(500) = N'Không thể cập nhật khách hàng.',
            @InternalError NVARCHAR(2048) = N'',
            @AuditInfo NVARCHAR(MAX) = N'',
            @UserGroupID VARCHAR(50) = '',
            @EffectiveEmployeeID VARCHAR(50) = '',
            @SourceType VARCHAR(20) = '',
            @IdempotencyKeyHash CHAR(64) = NULL,
            @VerifiedUserHash CHAR(64) = NULL,
            @RequestFingerprintHash CHAR(64) = NULL,
            @StoredStatus VARCHAR(20) = NULL,
            @StoredFingerprintHash CHAR(64) = NULL,
            @StoredObjectID VARCHAR(100) = NULL,
            @StoredMsg NVARCHAR(500) = NULL,
            @RowsUpdated INT = 0;

    SELECT @User = LTRIM(RTRIM(COALESCE(@User, ''))),
           @OldKeyID = LTRIM(RTRIM(COALESCE(@OldKeyID, ''))),
           @ObjectName = LTRIM(RTRIM(COALESCE(@ObjectName, N''))),
           @Address = LTRIM(RTRIM(COALESCE(@Address, N''))),
           @LocationID = LTRIM(RTRIM(COALESCE(@LocationID, N''))),
           @QuanHuyen = LTRIM(RTRIM(COALESCE(@QuanHuyen, N''))),
           @XaPhuong = LTRIM(RTRIM(COALESCE(@XaPhuong, N''))),
           @Phone = LTRIM(RTRIM(COALESCE(@Phone, ''))),
           @TaxCode = LTRIM(RTRIM(COALESCE(@TaxCode, ''))),
           @LoaiKhachHang = LTRIM(RTRIM(COALESCE(@LoaiKhachHang, N''))),
           @KenhBan = LTRIM(RTRIM(COALESCE(@KenhBan, ''))),
           @ThuDiTuyen = LTRIM(RTRIM(COALESCE(@ThuDiTuyen, N''))),
           @IdempotencyKey = LTRIM(RTRIM(COALESCE(@IdempotencyKey, ''))),
           @RequestID = LTRIM(RTRIM(COALESCE(@RequestID, '')));

    IF LEN(@IdempotencyKey) < 8 OR LEN(@IdempotencyKey) > 128
       OR @IdempotencyKey LIKE '%[^A-Za-z0-9._:-]%'
    BEGIN
        SET @ResultCode = 'INVALID_IDEMPOTENCY_KEY';
        SET @ResultMsg = N'Khóa chống gửi lặp không hợp lệ.';
        GOTO ReturnFailure;
    END;

    IF LEN(@RequestID) < 8 OR LEN(@RequestID) > 100
       OR @RequestID LIKE '%[^A-Za-z0-9._:-]%'
    BEGIN
        SET @ResultCode = 'INVALID_REQUEST_ID';
        SET @ResultMsg = N'Mã đối soát không hợp lệ.';
        GOTO ReturnFailure;
    END;

    IF OBJECT_ID('dbo.AI_API_MutationIdempotency', 'U') IS NULL
    BEGIN
        SET @ResultCode = 'IDEMPOTENCY_UNAVAILABLE';
        SET @ResultMsg = N'Hệ thống chống gửi lặp chưa sẵn sàng. Mã đối soát: ' + @RequestID;
        GOTO ReturnFailure;
    END;

    IF OBJECT_ID('dbo.AI_WriteAuditLog', 'P') IS NULL
    BEGIN
        SET @ResultCode = 'AUDIT_UNAVAILABLE';
        SET @ResultMsg = N'Hệ thống audit chưa sẵn sàng. Không cập nhật khách hàng. Mã đối soát: ' + @RequestID;
        GOTO ReturnFailure;
    END;

    SELECT TOP (1)
           @UserGroupID = COALESCE(UserGroupID, ''),
           @EffectiveEmployeeID = COALESCE(NULLIF(EmployeeID, ''), NULLIF(ManagerID, ''), NULLIF(CeoID, ''), '')
    FROM dbo.SY_User
    WHERE UserName = @User AND COALESCE(Disable, 0) = 0;

    IF @EffectiveEmployeeID = '' AND UPPER(@UserGroupID) <> 'ADMIN'
    BEGIN
        SET @ResultCode = 'INVALID_USER';
        SET @ResultMsg = N'Tài khoản không hợp lệ hoặc chưa được gán nhân viên.';
        GOTO ReturnFailure;
    END;

    IF @OldKeyID = ''
    BEGIN
        SET @ResultCode = 'CUSTOMER_ID_REQUIRED';
        SET @ResultMsg = N'Bạn chưa chọn khách hàng cần cập nhật.';
        GOTO ReturnFailure;
    END;

    IF EXISTS (SELECT 1 FROM dbo.CF_ObjectTbl WHERE ObjectID = @OldKeyID)
        SET @SourceType = 'OFFICIAL';
    ELSE IF EXISTS (SELECT 1 FROM dbo.AR_ObjectNewRequireTbl WHERE ObjectID = @OldKeyID AND COALESCE(StatusID, 0) <> 6)
        SET @SourceType = 'PENDING';
    ELSE
    BEGIN
        SET @ResultCode = 'CUSTOMER_NOT_FOUND';
        SET @ResultMsg = N'Không tìm thấy khách hàng cần cập nhật.';
        GOTO ReturnFailure;
    END;

    IF @SourceType = 'OFFICIAL'
       AND NOT EXISTS (SELECT 1 FROM dbo.AR_GetObjectByUserFnc(@User) WHERE ObjectID = @OldKeyID)
    BEGIN
        SET @ResultCode = 'FORBIDDEN';
        SET @ResultMsg = N'Tài khoản không có quyền cập nhật khách hàng này.';
        GOTO ReturnFailure;
    END;

    IF @SourceType = 'PENDING' AND UPPER(@UserGroupID) <> 'ADMIN'
       AND NOT EXISTS (
           SELECT 1
           FROM dbo.AR_ObjectNewRequireTbl P
           WHERE P.ObjectID = @OldKeyID
             AND (
                 LOWER(COALESCE(P.UserCreate, '')) = LOWER(@User)
                 OR P.EmployeeID = @EffectiveEmployeeID
                 OR EXISTS (
                     SELECT 1 FROM dbo.AR_OpListDetailTbl D
                     WHERE D.EmployeeID = @EffectiveEmployeeID
                       AND D.ObjectGroupID = P.ObjectGroupID
                       AND COALESCE(D.isDisable, 0) = 0
                 )
                 OR EXISTS (
                     SELECT 1 FROM dbo.AR_OpListEmployeeTbl E
                     WHERE E.ManagerID = @EffectiveEmployeeID
                       AND E.ObjectGroupID = P.ObjectGroupID
                       AND COALESCE(E.isDisable, 0) = 0
                 )
             )
       )
    BEGIN
        SET @ResultCode = 'FORBIDDEN';
        SET @ResultMsg = N'Tài khoản không có quyền cập nhật yêu cầu khách hàng này.';
        GOTO ReturnFailure;
    END;

    IF @ObjectName = '' OR @Address = ''
    BEGIN
        SET @ResultCode = 'REQUIRED_FIELDS_MISSING';
        SET @ResultMsg = N'Tên và địa chỉ khách hàng không được để trống.';
        GOTO ReturnFailure;
    END;

    IF @Birthday IS NULL SET @Birthday = CONVERT(DATETIME, '19000101', 112);
    IF @Birthday > GETDATE()
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

    IF @TaxCode <> '' AND (@TaxCode LIKE '%[^0-9]%' OR LEN(@TaxCode) NOT BETWEEN 10 AND 13)
    BEGIN
        SET @ResultCode = 'INVALID_TAX_CODE';
        SET @ResultMsg = N'Mã số thuế phải gồm 10–13 chữ số.';
        GOTO ReturnFailure;
    END;

    IF NOT EXISTS (SELECT 1 FROM dbo.CF_LocationTbl WHERE LocationID = @LocationID)
    BEGIN
        SET @ResultCode = 'INVALID_LOCATION';
        SET @ResultMsg = N'Tỉnh/thành không hợp lệ.';
        GOTO ReturnFailure;
    END;

    IF OBJECT_ID('dbo.AI_GetTinhThanhByUserFnc', 'IF') IS NULL
       OR NOT EXISTS (SELECT 1 FROM dbo.AI_GetTinhThanhByUserFnc(@User) WHERE LocationID = @LocationID)
    BEGIN
        SET @ResultCode = 'LOCATION_OUT_OF_SCOPE';
        SET @ResultMsg = N'Tỉnh/thành không thuộc phạm vi của tài khoản.';
        GOTO ReturnFailure;
    END;

    IF NOT EXISTS (
        SELECT 1
        FROM dbo.CF_XaPhuongTbl W
        WHERE W.TinhThanh = @LocationID
          AND W.XaPhuong = @XaPhuong
          AND (
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
        LOWER(@User), '|', @OldKeyID, '|', @ObjectName, '|', @Address, '|', @Phone, '|', @TaxCode, '|',
        CONVERT(CHAR(10), CAST(@Birthday AS DATE), 23), '|', @LoaiKhachHang, '|', @KenhBan, '|',
        @LocationID, '|', @QuanHuyen, '|', @XaPhuong, '|', @ThuDiTuyen, '|',
        CONVERT(VARCHAR(64), COALESCE(@Latitude, 0), 2), '|', CONVERT(VARCHAR(64), COALESCE(@Longitude, 0), 2), '|', @SourceType
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
                  AND VerifiedUserHash = @VerifiedUserHash AND ApiCode = @ApiCode;

                SET @AuditInfo = N'{"requestId":"' + STRING_ESCAPE(@RequestID, 'json')
                    + N'","idempotencyKeyHash":"' + @IdempotencyKeyHash
                    + N'","source":"' + @SourceType
                    + N'","resultCode":"IDEMPOTENCY_CONFLICT","outcome":"REJECTED"}';
                EXEC dbo.AI_WriteAuditLog @Username=@User, @ActionType='IDEMPOTENCY_CONFLICT_CUSTOMER_UPDATE',
                     @TargetEntity=@ApiCode, @TargetID=@OldKeyID, @TargetName=@ObjectName, @ExtraInfo=@AuditInfo;
                COMMIT TRANSACTION;

                SELECT @OldKeyID AS ObjectID, N'Khóa gửi lặp đã được dùng cho nội dung cập nhật khác.' AS Msg,
                       1 AS MsgType, @RequestID AS RequestID, 'IDEMPOTENCY_CONFLICT' AS Code, CAST(0 AS BIT) AS IsReplay;
                RETURN;
            END;

            IF @StoredStatus = 'COMPLETED' AND @StoredObjectID = @OldKeyID
            BEGIN
                UPDATE dbo.AI_API_MutationIdempotency
                SET LastRequestID = @RequestID, UpdatedAt = SYSUTCDATETIME()
                WHERE IdempotencyKeyHash = @IdempotencyKeyHash
                  AND VerifiedUserHash = @VerifiedUserHash AND ApiCode = @ApiCode;

                SET @AuditInfo = N'{"requestId":"' + STRING_ESCAPE(@RequestID, 'json')
                    + N'","idempotencyKeyHash":"' + @IdempotencyKeyHash
                    + N'","source":"' + @SourceType
                    + N'","resultCode":"IDEMPOTENCY_REPLAY","outcome":"REPLAY"}';
                EXEC dbo.AI_WriteAuditLog @Username=@User, @ActionType='REPLAY_CUSTOMER_UPDATE',
                     @TargetEntity=@ApiCode, @TargetID=@OldKeyID, @TargetName=@ObjectName, @ExtraInfo=@AuditInfo;
                COMMIT TRANSACTION;

                SELECT @OldKeyID AS ObjectID, COALESCE(NULLIF(@StoredMsg, N''), N'Khách hàng đã được cập nhật trước đó.') AS Msg,
                       5 AS MsgType, @RequestID AS RequestID, 'IDEMPOTENCY_REPLAY' AS Code, CAST(1 AS BIT) AS IsReplay;
                RETURN;
            END;

            SET @ResultCode = 'IDEMPOTENCY_IN_PROGRESS';
            SET @ResultMsg = N'Yêu cầu trùng đang được xử lý.';
            THROW 51201, @ResultMsg, 1;
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
            WHERE Phone = @Phone AND ObjectID <> @OldKeyID
            UNION ALL
            SELECT 1 FROM dbo.AR_ObjectNewRequireTbl WITH (UPDLOCK, HOLDLOCK)
            WHERE Phone = @Phone AND ObjectID <> @OldKeyID
        )
        BEGIN
            SET @ResultCode = 'DUPLICATE_PHONE';
            SET @ResultMsg = N'Số điện thoại này đã tồn tại.';
            THROW 51202, @ResultMsg, 1;
        END;

        IF @SourceType = 'OFFICIAL'
        BEGIN
            UPDATE dbo.CF_ObjectTbl
            SET ObjectName = @ObjectName, Address = @Address,
                LocationID = @LocationID, QuanHuyen = @QuanHuyen, XaPhuong = @XaPhuong,
                Phone = @Phone, TaxCode = @TaxCode, Birthday = @Birthday,
                LoaiHopDong = @LoaiKhachHang, PhanLoaiKhach = @KenhBan,
                ThuTrongTuan = @ThuDiTuyen, UserUpdate = @User, DateUpdate = GETDATE()
            WHERE ObjectID = @OldKeyID;
            SET @RowsUpdated = @@ROWCOUNT;

            DELETE FROM dbo.CF_ObjectMapTbl WHERE ObjectID = @OldKeyID;
            IF COALESCE(@Latitude, 0) <> 0 OR COALESCE(@Longitude, 0) <> 0
                INSERT dbo.CF_ObjectMapTbl (UserAutoID, ObjectID, Latitude, Longitude, MapDate)
                VALUES (CONVERT(VARCHAR(50), NEWID()), @OldKeyID, @Latitude, @Longitude, GETDATE());
        END
        ELSE
        BEGIN
            UPDATE dbo.AR_ObjectNewRequireTbl
            SET ObjectName = @ObjectName, Address = @Address,
                LocationID = @LocationID, QuanHuyen = @QuanHuyen, XaPhuong = @XaPhuong,
                Phone = @Phone, TaxCode = @TaxCode, Birthday = @Birthday,
                LoaiHopDong = @LoaiKhachHang, PhanLoaiKhach = @KenhBan,
                ThuTrongTuan = @ThuDiTuyen, UserUpdate = @User, DateUpdate = GETDATE()
            WHERE ObjectID = @OldKeyID AND COALESCE(StatusID, 0) <> 6;
            SET @RowsUpdated = @@ROWCOUNT;

            DELETE FROM dbo.AR_ObjectNewRequireMapTbl WHERE ObjectID = @OldKeyID;
            IF COALESCE(@Latitude, 0) <> 0 OR COALESCE(@Longitude, 0) <> 0
                INSERT dbo.AR_ObjectNewRequireMapTbl (UserAutoID, ObjectID, Latitude, Longitude, MapDate)
                VALUES (CONVERT(VARCHAR(50), NEWID()), @OldKeyID, @Latitude, @Longitude, GETDATE());
        END;

        IF @RowsUpdated <> 1
        BEGIN
            SET @ResultCode = 'CUSTOMER_UPDATE_NOT_APPLIED';
            SET @ResultMsg = N'Không có bản ghi khách hàng nào được cập nhật.';
            THROW 51203, @ResultMsg, 1;
        END;

        UPDATE dbo.AI_API_MutationIdempotency
        SET Status = 'COMPLETED', ResultEntityID = @OldKeyID,
            ResultMsg = N'Cập nhật khách hàng thành công.', ResultMsgType = 5,
            LastRequestID = @RequestID, UpdatedAt = SYSUTCDATETIME(), CompletedAt = SYSUTCDATETIME()
        WHERE IdempotencyKeyHash = @IdempotencyKeyHash
          AND VerifiedUserHash = @VerifiedUserHash AND ApiCode = @ApiCode;

        SET @AuditInfo = N'{"requestId":"' + STRING_ESCAPE(@RequestID, 'json')
            + N'","idempotencyKeyHash":"' + @IdempotencyKeyHash
            + N'","source":"' + @SourceType
            + N'","resultCode":"UPDATED","rowsUpdated":1,"outcome":"UPDATED"}';
        EXEC dbo.AI_WriteAuditLog @Username=@User, @ActionType='UPDATE_CUSTOMER',
             @TargetEntity=@ApiCode, @TargetID=@OldKeyID, @TargetName=@ObjectName, @ExtraInfo=@AuditInfo;

        COMMIT TRANSACTION;

        SELECT @OldKeyID AS ObjectID, N'Cập nhật khách hàng thành công.' AS Msg,
               5 AS MsgType, @RequestID AS RequestID, 'UPDATED' AS Code, CAST(0 AS BIT) AS IsReplay;
        RETURN;
    END TRY
    BEGIN CATCH
        SET @InternalError = ERROR_MESSAGE();
        IF XACT_STATE() <> 0 ROLLBACK TRANSACTION;
        IF @ResultCode = 'UPDATE_CUSTOMER_FAILED'
        BEGIN
            SET @ResultCode = 'UPDATE_CUSTOMER_ERROR';
            SET @ResultMsg = N'Không thể cập nhật khách hàng. Mã đối soát: ' + @RequestID;
        END;

        BEGIN TRY
            SET @AuditInfo = N'{"requestId":"' + STRING_ESCAPE(COALESCE(@RequestID, ''), 'json')
                + N'","idempotencyKeyHash":' + CASE WHEN @IdempotencyKeyHash IS NULL THEN N'null' ELSE N'"' + @IdempotencyKeyHash + N'"' END
                + N',"source":"' + STRING_ESCAPE(COALESCE(@SourceType, ''), 'json')
                + N'","resultCode":"' + STRING_ESCAPE(@ResultCode, 'json')
                + N'","outcome":"FAILED","error":"' + STRING_ESCAPE(LEFT(@InternalError, 500), 'json') + N'"}';
            EXEC dbo.AI_WriteAuditLog @Username=@User, @ActionType='UPDATE_CUSTOMER_FAILED',
                 @TargetEntity=@ApiCode, @TargetID=@OldKeyID, @TargetName=@ObjectName, @ExtraInfo=@AuditInfo;
        END TRY
        BEGIN CATCH
            SET @ResultCode = 'AUDIT_WRITE_FAILED';
            SET @ResultMsg = N'Không thể ghi audit mutation. Không có dữ liệu khách hàng nào được commit. Mã đối soát: ' + COALESCE(@RequestID, '');
        END CATCH;

        SELECT @OldKeyID AS ObjectID, @ResultMsg AS Msg, 1 AS MsgType,
               NULLIF(@RequestID, '') AS RequestID, @ResultCode AS Code, CAST(0 AS BIT) AS IsReplay;
        RETURN;
    END CATCH;

ReturnFailure:
    IF OBJECT_ID('dbo.AI_WriteAuditLog', 'P') IS NOT NULL AND @User <> '' AND @RequestID LIKE 'req-%'
    BEGIN TRY
        SET @AuditInfo = N'{"requestId":"' + STRING_ESCAPE(@RequestID, 'json')
            + N'","source":"' + STRING_ESCAPE(COALESCE(@SourceType, ''), 'json')
            + N'","resultCode":"' + STRING_ESCAPE(@ResultCode, 'json') + N'","outcome":"REJECTED"}';
        EXEC dbo.AI_WriteAuditLog @Username=@User, @ActionType='UPDATE_CUSTOMER_REJECTED',
             @TargetEntity=@ApiCode, @TargetID=@OldKeyID, @TargetName=@ObjectName, @ExtraInfo=@AuditInfo;
    END TRY
    BEGIN CATCH
        SET @ResultCode = 'AUDIT_WRITE_FAILED';
        SET @ResultMsg = N'Không thể ghi audit mutation. Không có dữ liệu khách hàng nào được cập nhật. Mã đối soát: ' + COALESCE(@RequestID, '');
    END CATCH;

    SELECT NULLIF(@OldKeyID, '') AS ObjectID, @ResultMsg AS Msg, 1 AS MsgType,
           NULLIF(@RequestID, '') AS RequestID, @ResultCode AS Code, CAST(0 AS BIT) AS IsReplay;
END;
GO
