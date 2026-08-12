SET ANSI_NULLS ON;
GO
SET QUOTED_IDENTIFIER ON;
GO

IF COL_LENGTH(N'dbo.AI_RagDocumentTbl', N'ReviewNote') IS NULL
BEGIN
    ALTER TABLE dbo.AI_RagDocumentTbl
        ADD ReviewNote NVARCHAR(1000) NULL;
END;
GO

IF OBJECT_ID(N'dbo.AI_RagDocumentContentTbl', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.AI_RagDocumentContentTbl
    (
        DocumentContentID BIGINT IDENTITY(1,1) NOT NULL,
        DocumentID UNIQUEIDENTIFIER NOT NULL,
        ContentVersion INT NOT NULL CONSTRAINT DF_AI_RagDocumentContent_Version DEFAULT 1,
        ExtractedContent NVARCHAR(MAX) NULL,
        EditedContent NVARCHAR(MAX) NULL,
        ExtractionMethod VARCHAR(30) NOT NULL,
        ExtractionStatus VARCHAR(20) NOT NULL CONSTRAINT DF_AI_RagDocumentContent_Status DEFAULT 'PENDING',
        Confidence VARCHAR(20) NULL,
        ExtractedAt DATETIME2(0) NULL,
        EditedBy VARCHAR(100) NULL,
        EditedAt DATETIME2(0) NULL,
        EditRevision INT NOT NULL CONSTRAINT DF_AI_RagDocumentContent_Revision DEFAULT 1,
        ContentSha256Hex CHAR(64) NULL,
        UpdatedAt DATETIME2(0) NOT NULL CONSTRAINT DF_AI_RagDocumentContent_UpdatedAt DEFAULT SYSUTCDATETIME(),
        CONSTRAINT PK_AI_RagDocumentContent PRIMARY KEY (DocumentContentID),
        CONSTRAINT FK_AI_RagDocumentContent_Document FOREIGN KEY (DocumentID)
            REFERENCES dbo.AI_RagDocumentTbl (DocumentID),
        CONSTRAINT UQ_AI_RagDocumentContent_Version UNIQUE (DocumentID, ContentVersion),
        CONSTRAINT CK_AI_RagDocumentContent_Version CHECK (ContentVersion > 0),
        CONSTRAINT CK_AI_RagDocumentContent_Revision CHECK (EditRevision > 0),
        CONSTRAINT CK_AI_RagDocumentContent_Method CHECK
            (ExtractionMethod IN ('PDF_TEXT', 'XLSX_TEXT', 'VISION_OCR', 'MANUAL')),
        CONSTRAINT CK_AI_RagDocumentContent_Status CHECK
            (ExtractionStatus IN ('PENDING', 'READY', 'ERROR')),
        CONSTRAINT CK_AI_RagDocumentContent_Confidence CHECK
            (Confidence IS NULL OR Confidence IN ('HIGH', 'MEDIUM', 'LOW')),
        CONSTRAINT CK_AI_RagDocumentContent_Ready CHECK
        (
            ExtractionStatus <> 'READY'
            OR (ExtractedAt IS NOT NULL AND LEN(LTRIM(RTRIM(COALESCE(EditedContent, ExtractedContent, N'')))) > 0)
        ),
        CONSTRAINT CK_AI_RagDocumentContent_Editor CHECK
        (
            EditedContent IS NULL
            OR (EditedBy IS NOT NULL AND LEN(LTRIM(RTRIM(EditedBy))) > 0 AND EditedAt IS NOT NULL)
        ),
        CONSTRAINT CK_AI_RagDocumentContent_Hash CHECK
            (ContentSha256Hex IS NULL OR (ContentSha256Hex NOT LIKE '%[^0-9A-Fa-f]%' AND LEN(ContentSha256Hex) = 64))
    );

    CREATE INDEX IX_AI_RagDocumentContent_Latest
        ON dbo.AI_RagDocumentContentTbl (DocumentID, ContentVersion DESC)
        INCLUDE (ExtractionStatus, EditRevision, UpdatedAt);
END;
GO

IF OBJECT_ID(N'dbo.AI_RagDocumentReviewLogTbl', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.AI_RagDocumentReviewLogTbl
    (
        ReviewLogID BIGINT IDENTITY(1,1) NOT NULL,
        DocumentID UNIQUEIDENTIFIER NOT NULL,
        ContentVersion INT NOT NULL,
        Action VARCHAR(20) NOT NULL,
        Actor VARCHAR(100) NOT NULL,
        ActionAt DATETIME2(0) NOT NULL CONSTRAINT DF_AI_RagDocumentReviewLog_ActionAt DEFAULT SYSUTCDATETIME(),
        PreviousStatus VARCHAR(20) NOT NULL,
        NewStatus VARCHAR(20) NOT NULL,
        EditRevision INT NOT NULL,
        Reason NVARCHAR(1000) NULL,
        ContentSha256Hex CHAR(64) NULL,
        RequestID VARCHAR(100) NULL,
        CONSTRAINT PK_AI_RagDocumentReviewLog PRIMARY KEY (ReviewLogID),
        CONSTRAINT FK_AI_RagDocumentReviewLog_Document FOREIGN KEY (DocumentID)
            REFERENCES dbo.AI_RagDocumentTbl (DocumentID),
        CONSTRAINT CK_AI_RagDocumentReviewLog_Action CHECK (Action IN ('SAVE', 'APPROVE', 'REJECT')),
        CONSTRAINT CK_AI_RagDocumentReviewLog_Actor CHECK (LEN(LTRIM(RTRIM(Actor))) > 0),
        CONSTRAINT CK_AI_RagDocumentReviewLog_Revision CHECK (EditRevision > 0),
        CONSTRAINT CK_AI_RagDocumentReviewLog_Hash CHECK
            (ContentSha256Hex IS NULL OR (ContentSha256Hex NOT LIKE '%[^0-9A-Fa-f]%' AND LEN(ContentSha256Hex) = 64))
    );

    CREATE INDEX IX_AI_RagDocumentReviewLog_Document
        ON dbo.AI_RagDocumentReviewLogTbl (DocumentID, ActionAt DESC);
END;
GO

CREATE OR ALTER VIEW dbo.AI_ApprovedRagContentVw
AS
    SELECT
        D.DocumentID,
        C.DocumentContentID,
        C.ContentVersion,
        C.EditRevision,
        COALESCE(C.EditedContent, C.ExtractedContent) AS ApprovedContent,
        C.ExtractionMethod,
        C.Confidence,
        C.ContentSha256Hex,
        D.OriginalFileName,
        D.SafeFileName,
        D.FileExtension,
        D.DetectedMimeType,
        D.Title,
        D.SourceType,
        D.SourceReference,
        D.SourceChannel,
        D.UploadedBy,
        D.UploadedAt,
        D.MalwareScanner,
        D.MalwareScannedAt,
        D.ReviewedBy,
        D.ReviewedAt,
        D.EffectiveFrom,
        D.EffectiveTo,
        D.RequestID,
        D.UpdatedAt
    FROM dbo.AI_RagDocumentTbl AS D
    CROSS APPLY
    (
        SELECT TOP (1)
            Content.DocumentContentID,
            Content.ContentVersion,
            Content.EditRevision,
            Content.ExtractedContent,
            Content.EditedContent,
            Content.ExtractionMethod,
            Content.ExtractionStatus,
            Content.Confidence,
            Content.ContentSha256Hex
        FROM dbo.AI_RagDocumentContentTbl AS Content
        WHERE Content.DocumentID = D.DocumentID
        ORDER BY Content.ContentVersion DESC
    ) AS C
    WHERE D.MalwareScanStatus = 'CLEAN'
      AND D.ReviewStatus = 'APPROVED'
      AND D.ReviewedBy IS NOT NULL
      AND D.ReviewedAt IS NOT NULL
      AND C.ExtractionStatus = 'READY'
      AND LEN(LTRIM(RTRIM(COALESCE(C.EditedContent, C.ExtractedContent, N'')))) > 0
      AND (D.EffectiveFrom IS NULL OR D.EffectiveFrom <= SYSUTCDATETIME())
      AND (D.EffectiveTo IS NULL OR D.EffectiveTo > SYSUTCDATETIME());
GO
