SET ANSI_NULLS ON;
GO
SET QUOTED_IDENTIFIER ON;
GO

IF OBJECT_ID(N'dbo.AI_RagDocumentTbl', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.AI_RagDocumentTbl
    (
        DocumentID UNIQUEIDENTIFIER NOT NULL,
        OriginalFileName NVARCHAR(260) NOT NULL,
        SafeFileName VARCHAR(80) NOT NULL,
        FileExtension VARCHAR(10) NOT NULL,
        DeclaredMimeType VARCHAR(150) NOT NULL,
        DetectedMimeType VARCHAR(150) NOT NULL,
        FileSizeBytes BIGINT NOT NULL,
        Sha256Hex CHAR(64) NOT NULL,
        Title NVARCHAR(300) NOT NULL,
        SourceType VARCHAR(30) NOT NULL,
        SourceReference NVARCHAR(500) NOT NULL,
        SourceChannel VARCHAR(30) NOT NULL CONSTRAINT DF_AI_RagDocument_SourceChannel DEFAULT 'RAG_ADMIN',
        UploadedBy VARCHAR(100) NOT NULL,
        UploadedAt DATETIME2(0) NOT NULL CONSTRAINT DF_AI_RagDocument_UploadedAt DEFAULT SYSUTCDATETIME(),
        MalwareScanStatus VARCHAR(20) NOT NULL CONSTRAINT DF_AI_RagDocument_Malware DEFAULT 'PENDING',
        MalwareScanner NVARCHAR(100) NULL,
        MalwareScannedAt DATETIME2(0) NULL,
        ReviewStatus VARCHAR(20) NOT NULL CONSTRAINT DF_AI_RagDocument_Review DEFAULT 'PENDING_REVIEW',
        ReviewedBy VARCHAR(100) NULL,
        ReviewedAt DATETIME2(0) NULL,
        EffectiveFrom DATETIME2(0) NULL,
        EffectiveTo DATETIME2(0) NULL,
        RequestID VARCHAR(100) NULL,
        UpdatedAt DATETIME2(0) NOT NULL CONSTRAINT DF_AI_RagDocument_UpdatedAt DEFAULT SYSUTCDATETIME(),
        CONSTRAINT PK_AI_RagDocument PRIMARY KEY (DocumentID),
        CONSTRAINT UQ_AI_RagDocument_SafeFile UNIQUE (SafeFileName),
        CONSTRAINT CK_AI_RagDocument_OriginalName CHECK
            (LEN(LTRIM(RTRIM(OriginalFileName))) > 0 AND OriginalFileName NOT LIKE N'%/%' AND OriginalFileName NOT LIKE N'%\%'),
        CONSTRAINT CK_AI_RagDocument_Extension CHECK (FileExtension IN ('pdf', 'xlsx', 'png', 'jpg', 'jpeg')),
        CONSTRAINT CK_AI_RagDocument_Size CHECK (FileSizeBytes BETWEEN 1 AND 10485760),
        CONSTRAINT CK_AI_RagDocument_Hash CHECK (Sha256Hex NOT LIKE '%[^0-9A-Fa-f]%' AND LEN(Sha256Hex) = 64),
        CONSTRAINT CK_AI_RagDocument_Title CHECK (LEN(LTRIM(RTRIM(Title))) > 0),
        CONSTRAINT CK_AI_RagDocument_SourceType CHECK (SourceType IN ('POLICY', 'CATALOG', 'PROMOTION', 'INTERNAL_RULE', 'OTHER')),
        CONSTRAINT CK_AI_RagDocument_SourceReference CHECK (LEN(LTRIM(RTRIM(SourceReference))) > 0),
        CONSTRAINT CK_AI_RagDocument_SourceChannel CHECK (SourceChannel IN ('RAG_ADMIN', 'API_IMPORT')),
        CONSTRAINT CK_AI_RagDocument_Uploader CHECK (LEN(LTRIM(RTRIM(UploadedBy))) > 0),
        CONSTRAINT CK_AI_RagDocument_Malware CHECK (MalwareScanStatus IN ('PENDING', 'CLEAN', 'INFECTED', 'SCAN_ERROR')),
        CONSTRAINT CK_AI_RagDocument_Review CHECK (ReviewStatus IN ('PENDING_REVIEW', 'APPROVED', 'REJECTED', 'WITHDRAWN')),
        CONSTRAINT CK_AI_RagDocument_ScanEvidence CHECK
        (
            MalwareScanStatus = 'PENDING'
            OR (MalwareScanner IS NOT NULL AND LEN(LTRIM(RTRIM(MalwareScanner))) > 0 AND MalwareScannedAt IS NOT NULL)
        ),
        CONSTRAINT CK_AI_RagDocument_Approval CHECK
        (
            ReviewStatus <> 'APPROVED'
            OR (MalwareScanStatus = 'CLEAN' AND ReviewedBy IS NOT NULL AND LEN(LTRIM(RTRIM(ReviewedBy))) > 0 AND ReviewedAt IS NOT NULL)
        ),
        CONSTRAINT CK_AI_RagDocument_EffectiveRange CHECK (EffectiveTo IS NULL OR EffectiveFrom IS NULL OR EffectiveTo > EffectiveFrom)
    );

    CREATE INDEX IX_AI_RagDocument_ReviewQueue
        ON dbo.AI_RagDocumentTbl (ReviewStatus, MalwareScanStatus, UploadedAt DESC);
END;
GO

CREATE OR ALTER VIEW dbo.AI_ApprovedRagDocumentVw
AS
    SELECT
        DocumentID,
        OriginalFileName,
        SafeFileName,
        FileExtension,
        DetectedMimeType,
        FileSizeBytes,
        Sha256Hex,
        Title,
        SourceType,
        SourceReference,
        SourceChannel,
        UploadedBy,
        UploadedAt,
        MalwareScanner,
        MalwareScannedAt,
        ReviewedBy,
        ReviewedAt,
        EffectiveFrom,
        EffectiveTo,
        RequestID,
        UpdatedAt
    FROM dbo.AI_RagDocumentTbl
    WHERE MalwareScanStatus = 'CLEAN'
      AND ReviewStatus = 'APPROVED'
      AND ReviewedBy IS NOT NULL
      AND ReviewedAt IS NOT NULL
      AND (EffectiveFrom IS NULL OR EffectiveFrom <= SYSUTCDATETIME())
      AND (EffectiveTo IS NULL OR EffectiveTo > SYSUTCDATETIME());
GO
