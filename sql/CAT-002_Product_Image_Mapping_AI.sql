SET ANSI_NULLS ON;
GO
SET QUOTED_IDENTIFIER ON;
GO

IF OBJECT_ID(N'dbo.AI_ProductImageMapTbl', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.AI_ProductImageMapTbl
    (
        ProductImageID BIGINT IDENTITY(1,1) NOT NULL,
        ItemID VARCHAR(50) NOT NULL,
        ImageRole VARCHAR(20) NOT NULL CONSTRAINT DF_AI_ProductImageMap_Role DEFAULT 'PRIMARY',
        DisplayOrder INT NOT NULL CONSTRAINT DF_AI_ProductImageMap_Order DEFAULT 1,
        ImagePath NVARCHAR(500) NOT NULL,
        MediaType VARCHAR(50) NOT NULL,
        FileSizeBytes BIGINT NOT NULL,
        ContentSha256 CHAR(64) NOT NULL,
        AltText NVARCHAR(300) NULL,
        SourceDocument NVARCHAR(500) NOT NULL,
        Status VARCHAR(20) NOT NULL CONSTRAINT DF_AI_ProductImageMap_Status DEFAULT 'DRAFT',
        EffectiveFrom DATETIME2(0) NULL,
        EffectiveTo DATETIME2(0) NULL,
        CreatedBy VARCHAR(50) NOT NULL,
        CreatedAt DATETIME2(0) NOT NULL CONSTRAINT DF_AI_ProductImageMap_CreatedAt DEFAULT SYSUTCDATETIME(),
        ApprovedBy VARCHAR(50) NULL,
        ApprovedAt DATETIME2(0) NULL,
        UpdatedAt DATETIME2(0) NOT NULL CONSTRAINT DF_AI_ProductImageMap_UpdatedAt DEFAULT SYSUTCDATETIME(),
        CONSTRAINT PK_AI_ProductImageMap PRIMARY KEY (ProductImageID),
        CONSTRAINT UQ_AI_ProductImageMap_ItemRoleOrder UNIQUE (ItemID, ImageRole, DisplayOrder),
        CONSTRAINT CK_AI_ProductImageMap_ItemID CHECK (LEN(LTRIM(RTRIM(ItemID))) > 0),
        CONSTRAINT CK_AI_ProductImageMap_Role CHECK (ImageRole IN ('PRIMARY', 'GALLERY')),
        CONSTRAINT CK_AI_ProductImageMap_Order CHECK (DisplayOrder > 0),
        CONSTRAINT CK_AI_ProductImageMap_Path CHECK
        (
            ImagePath LIKE N'images/product-catalog/%'
            AND ImagePath NOT LIKE N'%..%'
            AND ImagePath NOT LIKE N'%?%'
            AND ImagePath NOT LIKE N'%#%'
        ),
        CONSTRAINT CK_AI_ProductImageMap_MediaType CHECK (MediaType IN ('image/png', 'image/jpeg', 'image/webp')),
        CONSTRAINT CK_AI_ProductImageMap_Size CHECK (FileSizeBytes BETWEEN 1 AND 2097152),
        CONSTRAINT CK_AI_ProductImageMap_Hash CHECK
        (
            LEN(ContentSha256) = 64
            AND ContentSha256 NOT LIKE '%[^0-9a-f]%'
        ),
        CONSTRAINT CK_AI_ProductImageMap_Source CHECK (LEN(LTRIM(RTRIM(SourceDocument))) > 0),
        CONSTRAINT CK_AI_ProductImageMap_CreatedBy CHECK (LEN(LTRIM(RTRIM(CreatedBy))) > 0),
        CONSTRAINT CK_AI_ProductImageMap_Status CHECK (Status IN ('DRAFT', 'APPROVED', 'REJECTED', 'EXPIRED', 'WITHDRAWN')),
        CONSTRAINT CK_AI_ProductImageMap_EffectiveRange CHECK (EffectiveTo IS NULL OR EffectiveFrom IS NULL OR EffectiveTo > EffectiveFrom),
        CONSTRAINT CK_AI_ProductImageMap_Approval CHECK
        (
            Status <> 'APPROVED'
            OR (ApprovedBy IS NOT NULL AND LEN(LTRIM(RTRIM(ApprovedBy))) > 0 AND ApprovedAt IS NOT NULL)
        )
    );

    CREATE INDEX IX_AI_ProductImageMap_Published
        ON dbo.AI_ProductImageMapTbl (ItemID, ImageRole, Status, EffectiveFrom, EffectiveTo, DisplayOrder);
END;
GO

CREATE OR ALTER VIEW dbo.AI_ApprovedProductImageVw
AS
WITH Published AS
(
    SELECT
        M.ProductImageID,
        M.ItemID,
        I.ItemName,
        M.ImageRole,
        M.DisplayOrder,
        M.ImagePath,
        M.MediaType,
        M.FileSizeBytes,
        M.ContentSha256,
        M.AltText,
        M.SourceDocument,
        M.EffectiveFrom,
        M.EffectiveTo,
        M.ApprovedBy,
        M.ApprovedAt,
        M.UpdatedAt,
        ROW_NUMBER() OVER
        (
            PARTITION BY M.ItemID, M.ImageRole
            ORDER BY M.DisplayOrder, M.ProductImageID DESC
        ) AS ImageRank
    FROM dbo.AI_ProductImageMapTbl M
    INNER JOIN dbo.CF_ItemTbl I ON I.ItemID = M.ItemID
    WHERE M.Status = 'APPROVED'
      AND M.ApprovedBy IS NOT NULL
      AND M.ApprovedAt IS NOT NULL
      AND M.FileSizeBytes BETWEEN 1 AND 2097152
      AND M.MediaType IN ('image/png', 'image/jpeg', 'image/webp')
      AND (M.EffectiveFrom IS NULL OR M.EffectiveFrom <= SYSUTCDATETIME())
      AND (M.EffectiveTo IS NULL OR M.EffectiveTo > SYSUTCDATETIME())
      AND I.isDisable = 0
)
SELECT
    ProductImageID,
    ItemID,
    ItemName,
    ImageRole,
    DisplayOrder,
    ImagePath,
    MediaType,
    FileSizeBytes,
    ContentSha256,
    AltText,
    SourceDocument,
    EffectiveFrom,
    EffectiveTo,
    ApprovedBy,
    ApprovedAt,
    UpdatedAt
FROM Published
WHERE ImageRole <> 'PRIMARY' OR ImageRank = 1;
GO

CREATE OR ALTER PROCEDURE dbo.API_AnhSanPham_AI
    @Username VARCHAR(50) = '',
    @ItemID VARCHAR(50) = ''
AS
BEGIN
    SET NOCOUNT ON;

    SET @Username = LTRIM(RTRIM(COALESCE(@Username, '')));
    SET @ItemID = LTRIM(RTRIM(COALESCE(@ItemID, '')));

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

    IF @ItemID = '' OR NOT EXISTS
    (
        SELECT 1
        FROM dbo.CF_ItemTbl
        WHERE ItemID = @ItemID
          AND isDisable = 0
    )
    BEGIN
        SELECT N'Sản phẩm không tồn tại hoặc đã ngừng hoạt động.' AS Msg,
               1 AS MsgType,
               'VALIDATION_ERROR' AS Severity;
        RETURN;
    END;

    SELECT TOP (1)
        I.ItemID,
        I.ItemName,
        COALESCE(M.ImagePath, N'images/product-catalog/default-product.svg') AS ImagePath,
        COALESCE(M.MediaType, 'image/svg+xml') AS MediaType,
        M.FileSizeBytes,
        M.ContentSha256,
        COALESCE(M.AltText, N'Chưa có ảnh sản phẩm được duyệt') AS AltText,
        M.SourceDocument,
        M.ApprovedBy,
        M.ApprovedAt,
        CAST(CASE WHEN M.ProductImageID IS NULL THEN 1 ELSE 0 END AS BIT) AS IsDefaultImage,
        CASE WHEN M.ProductImageID IS NULL THEN 'DEFAULT' ELSE 'APPROVED' END AS ImageStatus,
        'API_AnhSanPham_AI' AS DataSource
    FROM dbo.CF_ItemTbl I
    LEFT JOIN dbo.AI_ApprovedProductImageVw M
        ON M.ItemID = I.ItemID
       AND M.ImageRole = 'PRIMARY'
    WHERE I.ItemID = @ItemID
      AND I.isDisable = 0
    ORDER BY M.DisplayOrder, M.ProductImageID DESC;
END;
GO
