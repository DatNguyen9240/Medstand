SET ANSI_NULLS ON;
GO
SET QUOTED_IDENTIFIER ON;
GO

IF OBJECT_ID(N'dbo.AI_ProductKnowledgeVersionTbl', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.AI_ProductKnowledgeVersionTbl
    (
        KnowledgeVersionID BIGINT IDENTITY(1,1) NOT NULL,
        ItemID VARCHAR(50) NOT NULL,
        ContentVersion INT NOT NULL,
        Ingredients NVARCHAR(1000) NULL,
        MainUses NVARCHAR(MAX) NULL,
        TargetPatients NVARCHAR(500) NULL,
        UsageInstructions NVARCHAR(1000) NULL,
        Contraindications NVARCHAR(1000) NULL,
        Warnings NVARCHAR(1000) NULL,
        SideEffects NVARCHAR(1000) NULL,
        Keywords NVARCHAR(1000) NULL,
        SourceDocument NVARCHAR(500) NOT NULL,
        SourcePage NVARCHAR(100) NULL,
        SourceReference NVARCHAR(1000) NULL,
        Status VARCHAR(20) NOT NULL CONSTRAINT DF_AI_ProductKnowledgeVersion_Status DEFAULT 'DRAFT',
        EffectiveFrom DATETIME2(0) NULL,
        EffectiveTo DATETIME2(0) NULL,
        CreatedBy VARCHAR(50) NOT NULL,
        CreatedAt DATETIME2(0) NOT NULL CONSTRAINT DF_AI_ProductKnowledgeVersion_CreatedAt DEFAULT SYSUTCDATETIME(),
        ApprovedBy VARCHAR(50) NULL,
        ApprovedAt DATETIME2(0) NULL,
        UpdatedAt DATETIME2(0) NOT NULL CONSTRAINT DF_AI_ProductKnowledgeVersion_UpdatedAt DEFAULT SYSUTCDATETIME(),
        CONSTRAINT PK_AI_ProductKnowledgeVersion PRIMARY KEY (KnowledgeVersionID),
        CONSTRAINT UQ_AI_ProductKnowledgeVersion_ItemVersion UNIQUE (ItemID, ContentVersion),
        CONSTRAINT CK_AI_ProductKnowledgeVersion_Version CHECK (ContentVersion > 0),
        CONSTRAINT CK_AI_ProductKnowledgeVersion_ItemID CHECK (LEN(LTRIM(RTRIM(ItemID))) > 0),
        CONSTRAINT CK_AI_ProductKnowledgeVersion_Source CHECK (LEN(LTRIM(RTRIM(SourceDocument))) > 0),
        CONSTRAINT CK_AI_ProductKnowledgeVersion_CreatedBy CHECK (LEN(LTRIM(RTRIM(CreatedBy))) > 0),
        CONSTRAINT CK_AI_ProductKnowledgeVersion_Status CHECK (Status IN ('DRAFT', 'APPROVED', 'REJECTED', 'EXPIRED', 'WITHDRAWN')),
        CONSTRAINT CK_AI_ProductKnowledgeVersion_EffectiveRange CHECK (EffectiveTo IS NULL OR EffectiveFrom IS NULL OR EffectiveTo > EffectiveFrom),
        CONSTRAINT CK_AI_ProductKnowledgeVersion_Approval CHECK
        (
            Status <> 'APPROVED'
            OR (ApprovedBy IS NOT NULL AND LEN(LTRIM(RTRIM(ApprovedBy))) > 0 AND ApprovedAt IS NOT NULL)
        )
    );

    CREATE INDEX IX_AI_ProductKnowledgeVersion_Published
        ON dbo.AI_ProductKnowledgeVersionTbl (ItemID, Status, EffectiveFrom, EffectiveTo, ContentVersion DESC);
END;
GO

CREATE OR ALTER VIEW dbo.AI_ApprovedProductKnowledgeVw
AS
WITH Published AS
(
    SELECT
        K.KnowledgeVersionID,
        K.ItemID,
        I.ItemName,
        K.ContentVersion,
        K.Ingredients,
        K.MainUses,
        K.TargetPatients,
        K.UsageInstructions,
        K.Contraindications,
        K.Warnings,
        K.SideEffects,
        K.Keywords,
        K.SourceDocument,
        K.SourcePage,
        K.SourceReference,
        K.EffectiveFrom,
        K.EffectiveTo,
        K.ApprovedBy,
        K.ApprovedAt,
        K.UpdatedAt,
        ROW_NUMBER() OVER (PARTITION BY K.ItemID ORDER BY K.ContentVersion DESC, K.KnowledgeVersionID DESC) AS PublishRank
    FROM dbo.AI_ProductKnowledgeVersionTbl K
    INNER JOIN dbo.CF_ItemTbl I ON I.ItemID = K.ItemID
    WHERE K.Status = 'APPROVED'
      AND K.ApprovedBy IS NOT NULL
      AND K.ApprovedAt IS NOT NULL
      AND (K.EffectiveFrom IS NULL OR K.EffectiveFrom <= SYSUTCDATETIME())
      AND (K.EffectiveTo IS NULL OR K.EffectiveTo > SYSUTCDATETIME())
      AND I.isDisable = 0
)
SELECT
    KnowledgeVersionID,
    ItemID,
    ItemName,
    ContentVersion,
    Ingredients,
    MainUses,
    TargetPatients,
    UsageInstructions,
    Contraindications,
    Warnings,
    SideEffects,
    Keywords,
    SourceDocument,
    SourcePage,
    SourceReference,
    EffectiveFrom,
    EffectiveTo,
    ApprovedBy,
    ApprovedAt,
    UpdatedAt
FROM Published
WHERE PublishRank = 1;
GO

CREATE OR ALTER PROCEDURE dbo.API_TriThucSanPham_AI
    @Username VARCHAR(50) = '',
    @ItemID VARCHAR(50) = '',
    @SearchText NVARCHAR(200) = '',
    @TopN INT = 20
AS
BEGIN
    SET NOCOUNT ON;

    SET @Username = LTRIM(RTRIM(COALESCE(@Username, '')));
    SET @ItemID = LTRIM(RTRIM(COALESCE(@ItemID, '')));
    SET @SearchText = LTRIM(RTRIM(COALESCE(@SearchText, '')));
    IF @TopN IS NULL OR @TopN < 1 SET @TopN = 20;
    IF @TopN > 50 SET @TopN = 50;

    IF NOT EXISTS
    (
        SELECT 1
        FROM dbo.SY_User
        WHERE UserName = @Username
          AND COALESCE(Disable, 0) = 0
    )
    BEGIN
        SELECT N'Tài khoản không tồn tại hoặc đã bị khóa.' AS Msg,
               1 AS MsgType,
               'OUT_OF_SCOPE' AS Severity;
        RETURN;
    END;

    SELECT TOP (@TopN)
        K.ItemID,
        K.ItemName,
        K.Ingredients,
        K.MainUses,
        K.TargetPatients,
        K.UsageInstructions,
        K.Contraindications,
        K.Warnings,
        K.SideEffects,
        K.Keywords,
        K.SourceDocument,
        K.SourcePage,
        K.SourceReference,
        K.ContentVersion,
        K.EffectiveFrom,
        K.EffectiveTo,
        K.ApprovedBy,
        K.ApprovedAt,
        K.UpdatedAt,
        'APPROVED' AS KnowledgeStatus,
        'API_TriThucSanPham_AI' AS DataSource
    FROM dbo.AI_ApprovedProductKnowledgeVw K
    WHERE (@ItemID = '' OR K.ItemID = @ItemID)
      AND
      (
          @SearchText = ''
          OR K.ItemID LIKE '%' + @SearchText + '%'
          OR K.ItemName LIKE N'%' + @SearchText + N'%'
          OR COALESCE(K.Ingredients, '') LIKE N'%' + @SearchText + N'%'
          OR COALESCE(K.MainUses, '') LIKE N'%' + @SearchText + N'%'
          OR COALESCE(K.Keywords, '') LIKE N'%' + @SearchText + N'%'
      )
    ORDER BY K.ItemName, K.ItemID;
END;
GO
