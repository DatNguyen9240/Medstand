SET ANSI_NULLS ON;
GO
SET QUOTED_IDENTIFIER ON;
GO

IF COL_LENGTH(N'dbo.AI_RagDocumentTbl', N'RevokedBy') IS NULL
BEGIN
    ALTER TABLE dbo.AI_RagDocumentTbl ADD RevokedBy VARCHAR(100) NULL;
END;
GO

IF COL_LENGTH(N'dbo.AI_RagDocumentTbl', N'RevokedAt') IS NULL
BEGIN
    ALTER TABLE dbo.AI_RagDocumentTbl ADD RevokedAt DATETIME2(0) NULL;
END;
GO

IF COL_LENGTH(N'dbo.AI_RagDocumentTbl', N'RevocationReason') IS NULL
BEGIN
    ALTER TABLE dbo.AI_RagDocumentTbl ADD RevocationReason NVARCHAR(1000) NULL;
END;
GO

IF OBJECT_ID(N'dbo.CK_AI_RagDocument_Revocation', N'C') IS NULL
BEGIN
    ALTER TABLE dbo.AI_RagDocumentTbl WITH CHECK ADD CONSTRAINT CK_AI_RagDocument_Revocation CHECK
    (
        ReviewStatus <> 'WITHDRAWN'
        OR
        (
            RevokedBy IS NOT NULL
            AND LEN(LTRIM(RTRIM(RevokedBy))) > 0
            AND RevokedAt IS NOT NULL
            AND RevocationReason IS NOT NULL
            AND LEN(LTRIM(RTRIM(RevocationReason))) > 0
        )
    );
END;
GO

IF OBJECT_ID(N'dbo.AI_RagDocumentLifecycleLogTbl', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.AI_RagDocumentLifecycleLogTbl
    (
        LifecycleLogID BIGINT IDENTITY(1,1) NOT NULL,
        DocumentID UNIQUEIDENTIFIER NOT NULL,
        Action VARCHAR(20) NOT NULL,
        Actor VARCHAR(100) NOT NULL,
        ActionAt DATETIME2(0) NOT NULL CONSTRAINT DF_AI_RagDocumentLifecycleLog_ActionAt DEFAULT SYSUTCDATETIME(),
        PreviousStatus VARCHAR(20) NOT NULL,
        NewStatus VARCHAR(20) NOT NULL,
        EffectiveFrom DATETIME2(0) NULL,
        EffectiveTo DATETIME2(0) NULL,
        Reason NVARCHAR(1000) NULL,
        RequestID VARCHAR(100) NULL,
        CONSTRAINT PK_AI_RagDocumentLifecycleLog PRIMARY KEY (LifecycleLogID),
        CONSTRAINT FK_AI_RagDocumentLifecycleLog_Document FOREIGN KEY (DocumentID)
            REFERENCES dbo.AI_RagDocumentTbl (DocumentID),
        CONSTRAINT CK_AI_RagDocumentLifecycleLog_Action CHECK (Action IN ('WITHDRAW')),
        CONSTRAINT CK_AI_RagDocumentLifecycleLog_Actor CHECK (LEN(LTRIM(RTRIM(Actor))) > 0),
        CONSTRAINT CK_AI_RagDocumentLifecycleLog_Range CHECK
            (EffectiveTo IS NULL OR EffectiveFrom IS NULL OR EffectiveTo > EffectiveFrom)
    );

    CREATE INDEX IX_AI_RagDocumentLifecycleLog_Document
        ON dbo.AI_RagDocumentLifecycleLogTbl (DocumentID, ActionAt DESC);
END;
GO

IF NOT EXISTS
(
    SELECT 1
    FROM sys.indexes
    WHERE object_id = OBJECT_ID(N'dbo.AI_RagDocumentTbl')
      AND name = N'IX_AI_RagDocument_ActiveWindow'
)
BEGIN
    CREATE INDEX IX_AI_RagDocument_ActiveWindow
        ON dbo.AI_RagDocumentTbl (ReviewStatus, MalwareScanStatus, EffectiveFrom, EffectiveTo)
        INCLUDE (Title, SourceType, SourceReference, UpdatedAt);
END;
GO

CREATE OR ALTER VIEW dbo.AI_RagDocumentLifecycleVw
AS
    SELECT
        D.DocumentID,
        D.Title,
        D.OriginalFileName,
        D.SourceType,
        D.SourceReference,
        D.ReviewStatus,
        D.MalwareScanStatus,
        D.EffectiveFrom,
        D.EffectiveTo,
        D.RevokedBy,
        D.RevokedAt,
        D.RevocationReason,
        D.ReviewedBy,
        D.ReviewedAt,
        D.UpdatedAt,
        CASE
            WHEN D.ReviewStatus = 'WITHDRAWN' THEN 'WITHDRAWN'
            WHEN D.ReviewStatus <> 'APPROVED' THEN D.ReviewStatus
            WHEN D.MalwareScanStatus <> 'CLEAN' THEN 'BLOCKED'
            WHEN D.EffectiveFrom IS NOT NULL AND D.EffectiveFrom > SYSUTCDATETIME() THEN 'SCHEDULED'
            WHEN D.EffectiveTo IS NOT NULL AND D.EffectiveTo <= SYSUTCDATETIME() THEN 'EXPIRED'
            ELSE 'ACTIVE'
        END AS LifecycleStatus
    FROM dbo.AI_RagDocumentTbl AS D;
GO

CREATE OR ALTER PROCEDURE dbo.API_RagDocumentLifecycle_AI
    @Operation VARCHAR(30),
    @DocumentID UNIQUEIDENTIFIER = NULL,
    @Actor VARCHAR(100) = NULL,
    @Reason NVARCHAR(1000) = NULL,
    @RequestID VARCHAR(100) = NULL
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;

    SET @Operation = UPPER(LTRIM(RTRIM(COALESCE(@Operation, ''))));
    SET @Actor = NULLIF(LTRIM(RTRIM(@Actor)), '');
    SET @Reason = NULLIF(LTRIM(RTRIM(@Reason)), N'');

    IF @Operation = 'LIST_LIFECYCLE'
    BEGIN
        SELECT
            'success' AS status,
            'LIFECYCLE_LIST' AS code,
            CONVERT(VARCHAR(36), DocumentID) AS documentID,
            Title AS title,
            OriginalFileName AS originalFileName,
            SourceType AS sourceType,
            SourceReference AS sourceReference,
            ReviewStatus AS reviewStatus,
            MalwareScanStatus AS malwareScanStatus,
            LifecycleStatus AS lifecycleStatus,
            CONVERT(VARCHAR(33), EffectiveFrom, 126) + CASE WHEN EffectiveFrom IS NULL THEN '' ELSE 'Z' END AS effectiveFrom,
            CONVERT(VARCHAR(10), DATEADD(DAY, -1, EffectiveTo), 23) AS effectiveToDate,
            CONVERT(VARCHAR(33), EffectiveTo, 126) + CASE WHEN EffectiveTo IS NULL THEN '' ELSE 'Z' END AS effectiveToExclusive,
            RevokedBy AS revokedBy,
            CONVERT(VARCHAR(33), RevokedAt, 126) + CASE WHEN RevokedAt IS NULL THEN '' ELSE 'Z' END AS revokedAt,
            RevocationReason AS revocationReason,
            CONVERT(VARCHAR(33), UpdatedAt, 126) + 'Z' AS updatedAt
        FROM dbo.AI_RagDocumentLifecycleVw
        WHERE ReviewStatus IN ('APPROVED', 'WITHDRAWN')
        ORDER BY
            CASE LifecycleStatus WHEN 'ACTIVE' THEN 0 WHEN 'SCHEDULED' THEN 1 WHEN 'EXPIRED' THEN 2 ELSE 3 END,
            UpdatedAt DESC;
        RETURN;
    END;

    IF @Operation <> 'WITHDRAW_DOCUMENT'
    BEGIN
        SELECT 'error' AS status, 'INVALID_OPERATION' AS code, N'Thao tác vòng đời không hợp lệ.' AS message;
        RETURN;
    END;

    IF @DocumentID IS NULL
    BEGIN
        SELECT 'error' AS status, 'INVALID_DOCUMENT_ID' AS code, N'Mã tài liệu không hợp lệ.' AS message;
        RETURN;
    END;

    IF @Actor IS NULL
    BEGIN
        SELECT 'error' AS status, 'ACTOR_REQUIRED' AS code, N'Không xác định được người thu hồi.' AS message;
        RETURN;
    END;

    IF @Reason IS NULL OR LEN(@Reason) > 1000
    BEGIN
        SELECT 'error' AS status, 'WITHDRAW_REASON_REQUIRED' AS code, N'Vui lòng nhập lý do thu hồi tối đa 1.000 ký tự.' AS message;
        RETURN;
    END;

    DECLARE @CurrentStatus VARCHAR(20), @EffectiveFrom DATETIME2(0), @EffectiveTo DATETIME2(0);
    BEGIN TRANSACTION;

    SELECT
        @CurrentStatus = ReviewStatus,
        @EffectiveFrom = EffectiveFrom,
        @EffectiveTo = EffectiveTo
    FROM dbo.AI_RagDocumentTbl WITH (UPDLOCK, HOLDLOCK)
    WHERE DocumentID = @DocumentID;

    IF @CurrentStatus IS NULL
    BEGIN
        ROLLBACK TRANSACTION;
        SELECT 'error' AS status, 'DOCUMENT_NOT_FOUND' AS code, N'Không tìm thấy tài liệu.' AS message;
        RETURN;
    END;

    IF @CurrentStatus <> 'APPROVED'
    BEGIN
        ROLLBACK TRANSACTION;
        SELECT 'error' AS status, 'DOCUMENT_NOT_APPROVED' AS code, N'Chỉ tài liệu đã phê duyệt mới được thu hồi.' AS message;
        RETURN;
    END;

    UPDATE dbo.AI_RagDocumentTbl
    SET
        ReviewStatus = 'WITHDRAWN',
        RevokedBy = @Actor,
        RevokedAt = SYSUTCDATETIME(),
        RevocationReason = @Reason,
        UpdatedAt = SYSUTCDATETIME()
    WHERE DocumentID = @DocumentID;

    INSERT dbo.AI_RagDocumentLifecycleLogTbl
        (DocumentID, Action, Actor, PreviousStatus, NewStatus, EffectiveFrom, EffectiveTo, Reason, RequestID)
    VALUES
        (@DocumentID, 'WITHDRAW', @Actor, @CurrentStatus, 'WITHDRAWN', @EffectiveFrom, @EffectiveTo, @Reason, @RequestID);

    COMMIT TRANSACTION;

    SELECT
        'success' AS status,
        'WITHDRAW_DOCUMENT' AS code,
        N'Đã thu hồi tài liệu.' AS message,
        CONVERT(VARCHAR(36), @DocumentID) AS documentID,
        'WITHDRAWN' AS lifecycleStatus,
        CAST(0 AS BIT) AS usableByChatbot;
END;
GO
