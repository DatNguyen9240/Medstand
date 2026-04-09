/*
Bootstrap_API_Metadata_Auto.sql
--------------------------------
Muc tieu:
- Chay 1 file duy nhat de khoi tao metadata API AI
- Khong can phu thuoc cac script metadata cu
- Tu dong doc SP co pattern API_*_AI de tao metadata

Quy trinh:
1) Ensure schema tables (CREATE IF NOT EXISTS)
2) Tao proc sync metadata tu sys.procedures + sys.parameters
3) Preview
4) Apply
*/

SET NOCOUNT ON;
GO

/* =========================================================
   1) ENSURE TABLES
   ========================================================= */
IF OBJECT_ID('dbo.API_Definition', 'U') IS NULL
BEGIN
    CREATE TABLE dbo.API_Definition (
        ApiID           INT            NOT NULL PRIMARY KEY IDENTITY(1,1),
        ApiCode         VARCHAR(100)   NOT NULL UNIQUE,
        ApiName         NVARCHAR(200)  NOT NULL,
        ApiDescription  NVARCHAR(500)  NULL,
        StoredProcedure VARCHAR(200)   NOT NULL,
        Category        NVARCHAR(100)  NULL,
        IconEmoji       NVARCHAR(20)   NULL,
        IsActive        BIT            NOT NULL DEFAULT 1,
        OrderIndex      INT            NOT NULL DEFAULT 0
    );
END
GO

IF OBJECT_ID('dbo.API_Action', 'U') IS NULL
BEGIN
    CREATE TABLE dbo.API_Action (
        ActionID      INT           NOT NULL PRIMARY KEY IDENTITY(1,1),
        ApiID         INT           NOT NULL REFERENCES dbo.API_Definition(ApiID),
        ActionCode    VARCHAR(50)   NOT NULL,
        ActionName    NVARCHAR(200) NOT NULL,
        ExecutionType VARCHAR(20)   NOT NULL DEFAULT 'QUERY',
        HttpMethod    VARCHAR(10)   NOT NULL DEFAULT 'POST',
        IsConfirm     BIT           NOT NULL DEFAULT 0,
        IsDefault     BIT           NOT NULL DEFAULT 1,
        IsActive      BIT           NOT NULL DEFAULT 1,
        OrderIndex    INT           NOT NULL DEFAULT 0
    );
END
GO

IF OBJECT_ID('dbo.API_Field', 'U') IS NULL
BEGIN
    CREATE TABLE dbo.API_Field (
        FieldID          INT            NOT NULL PRIMARY KEY IDENTITY(1,1),
        ApiID            INT            NOT NULL REFERENCES dbo.API_Definition(ApiID),
        FieldCode        VARCHAR(100)   NOT NULL,
        FieldName        NVARCHAR(200)  NOT NULL,
        DataType         VARCHAR(30)    NOT NULL,
        ControlType      VARCHAR(50)    NOT NULL,
        IsRequired       BIT            NOT NULL DEFAULT 0,
        IsSystemParam    BIT            NOT NULL DEFAULT 0,
        DefaultValue     NVARCHAR(500)  NULL,
        Placeholder      NVARCHAR(200)  NULL,
        MinValue         NVARCHAR(50)   NULL,
        MaxValue         NVARCHAR(50)   NULL,
        OptionsJson      NVARCHAR(MAX)  NULL,
        DataSourceType   VARCHAR(50)    NULL,
        DataSourceValue  NVARCHAR(MAX)  NULL,
        OrderIndex       INT            NOT NULL DEFAULT 0
    );
END
GO

IF OBJECT_ID('dbo.API_Action_Field', 'U') IS NULL
BEGIN
    CREATE TABLE dbo.API_Action_Field (
        ID         INT NOT NULL PRIMARY KEY IDENTITY(1,1),
        ActionID   INT NOT NULL REFERENCES dbo.API_Action(ActionID),
        FieldID    INT NOT NULL REFERENCES dbo.API_Field(FieldID),
        IsVisible  BIT NOT NULL DEFAULT 1,
        IsEditable BIT NOT NULL DEFAULT 1,
        IsRequired BIT NOT NULL DEFAULT 0
    );
END
GO

IF OBJECT_ID('dbo.API_Filter', 'U') IS NULL
BEGIN
    CREATE TABLE dbo.API_Filter (
        FilterID        INT            NOT NULL PRIMARY KEY IDENTITY(1,1),
        ApiID           INT            NOT NULL REFERENCES dbo.API_Definition(ApiID),
        FieldCode       VARCHAR(100)   NOT NULL,
        FieldName       NVARCHAR(200)  NOT NULL,
        DataType        VARCHAR(30)    NOT NULL DEFAULT 'VARCHAR',
        ControlType     VARCHAR(50)    NOT NULL,
        [Operator]      VARCHAR(20)    NOT NULL DEFAULT '=',
        DefaultValue    NVARCHAR(500)  NULL,
        Placeholder     NVARCHAR(200)  NULL,
        OptionsJson     NVARCHAR(MAX)  NULL,
        DataSourceType  VARCHAR(50)    NULL,
        DataSourceValue NVARCHAR(MAX)  NULL,
        IsRequired      BIT            NOT NULL DEFAULT 0,
        OrderIndex      INT            NOT NULL DEFAULT 0
    );
END
GO

IF OBJECT_ID('dbo.API_Bulk_Config', 'U') IS NULL
BEGIN
    CREATE TABLE dbo.API_Bulk_Config (
        ApiID            INT          NOT NULL PRIMARY KEY REFERENCES dbo.API_Definition(ApiID),
        AllowUpload      BIT          NOT NULL DEFAULT 0,
        AllowMultiSelect BIT          NOT NULL DEFAULT 0,
        TemplateUrl      VARCHAR(500) NULL,
        MaxRows          INT          NULL DEFAULT 500
    );
END
GO

IF OBJECT_ID('dbo.API_Metadata_Override', 'U') IS NULL
BEGIN
    CREATE TABLE dbo.API_Metadata_Override (
        OverrideID         INT IDENTITY(1,1) PRIMARY KEY,
        StoredProcedure    VARCHAR(200) NOT NULL UNIQUE,
        ApiCode            VARCHAR(100) NULL,
        ApiName            NVARCHAR(200) NULL,
        ApiDescription     NVARCHAR(500) NULL,
        Category           NVARCHAR(100) NULL,
        IconEmoji          NVARCHAR(20) NULL,
        IsActive           BIT NULL,
        OrderIndex         INT NULL,
        ActionCode         VARCHAR(50) NULL,
        ActionName         NVARCHAR(200) NULL,
        ExecutionType      VARCHAR(20) NULL,
        HttpMethod         VARCHAR(10) NULL,
        IsConfirm          BIT NULL
    );
END
GO

IF OBJECT_ID('dbo.API_Metadata_Field_Override', 'U') IS NULL
BEGIN
    CREATE TABLE dbo.API_Metadata_Field_Override (
        OverrideFieldID    INT IDENTITY(1,1) PRIMARY KEY,
        StoredProcedure    VARCHAR(200) NOT NULL,
        FieldCode          VARCHAR(100) NOT NULL,
        FieldName          NVARCHAR(200) NULL,
        ControlType        VARCHAR(50) NULL,
        IsRequired         BIT NULL,
        IsSystemParam      BIT NULL,
        DefaultValue       NVARCHAR(500) NULL,
        Placeholder        NVARCHAR(200) NULL,
        MinValue           NVARCHAR(50) NULL,
        MaxValue           NVARCHAR(50) NULL,
        OptionsJson        NVARCHAR(MAX) NULL,
        DataSourceType     VARCHAR(50) NULL,
        DataSourceValue    NVARCHAR(MAX) NULL,
        OrderIndex         INT NULL,
        IsVisible          BIT NULL,
        IsEditable         BIT NULL,
        FilterOperator     VARCHAR(20) NULL,
        FilterIsRequired   BIT NULL,
        IncludeAsFilter    BIT NULL
    );

    CREATE UNIQUE INDEX UX_API_Metadata_Field_Override
        ON dbo.API_Metadata_Field_Override (StoredProcedure, FieldCode);
END
GO

IF OBJECT_ID('dbo.API_Metadata_Bulk_Override', 'U') IS NULL
BEGIN
    CREATE TABLE dbo.API_Metadata_Bulk_Override (
        StoredProcedure    VARCHAR(200) NOT NULL PRIMARY KEY,
        AllowUpload        BIT NOT NULL DEFAULT 0,
        AllowMultiSelect   BIT NOT NULL DEFAULT 0,
        TemplateUrl        VARCHAR(500) NULL,
        MaxRows            INT NULL
    );
END
GO

/* =========================================================
   2) CREATE/REPLACE AUTOSYNC PROCEDURE
   ========================================================= */
IF EXISTS (SELECT 1 FROM sys.triggers WHERE name = 'trg_API_Metadata_AutoSync_OnSPDDL' AND parent_class_desc = 'DATABASE')
    DISABLE TRIGGER trg_API_Metadata_AutoSync_OnSPDDL ON DATABASE;
GO

IF OBJECT_ID('dbo.API_Metadata_AutoBootstrap_AI', 'P') IS NOT NULL
    DROP PROCEDURE dbo.API_Metadata_AutoBootstrap_AI;
GO

CREATE PROCEDURE dbo.API_Metadata_AutoBootstrap_AI
    @Apply BIT = 0,               -- 0 preview, 1 apply
    @UpdateExisting BIT = 1       -- 1 update record cu, 0 chi them moi
AS
BEGIN
    SET NOCOUNT ON;

    ;WITH SP_AI AS (
        SELECT
            p.object_id,
            p.name AS StoredProcedure,
            '@' + LOWER(
                (
                    SELECT
                        CASE
                            WHEN n.Num > 1
                                 AND SUBSTRING(base.ApiNameRaw, n.Num, 1) COLLATE Latin1_General_BIN LIKE '[A-Z]'
                                 AND SUBSTRING(base.ApiNameRaw, n.Num - 1, 1) <> '_'
                                 AND SUBSTRING(base.ApiNameRaw, n.Num - 1, 1) COLLATE Latin1_General_BIN NOT LIKE '[A-Z]'
                            THEN '_'
                            ELSE ''
                        END
                        + SUBSTRING(base.ApiNameRaw, n.Num, 1)
                    FROM (
                        SELECT TOP (LEN(base.ApiNameRaw))
                               ROW_NUMBER() OVER (ORDER BY (SELECT NULL)) AS Num
                        FROM sys.all_objects
                    ) n
                    ORDER BY n.Num
                    FOR XML PATH(''), TYPE
                ).value('.', 'NVARCHAR(300)')
            ) AS ApiCode,
            base.ApiNameRaw
        FROM sys.procedures p
        CROSS APPLY (
            SELECT REPLACE(REPLACE(p.name, 'API_', ''), '_AI', '') AS ApiNameRaw
        ) base
        WHERE p.name LIKE 'API[_]%[_]AI'
    ),
    P AS (
        SELECT
            s.object_id,
            s.StoredProcedure,
            s.ApiCode,
            s.ApiNameRaw,
            prm.parameter_id,
            prm.name AS FieldCode,
            UPPER(t.name) AS DataType,
            prm.has_default_value
        FROM SP_AI s
        JOIN sys.parameters prm ON prm.object_id = s.object_id
        JOIN sys.types t ON t.user_type_id = prm.user_type_id
        WHERE prm.parameter_id > 0
    ),
    M AS (
        SELECT
            object_id,
            StoredProcedure,
            ApiCode,
            ApiNameRaw,
            parameter_id,
            FieldCode,
            CASE
                WHEN FieldCode = '@Username' THEN N'Nguoi dung'
                WHEN FieldCode = '@ObjectID' THEN N'Ma khach hang'
                WHEN FieldCode = '@ItemID' THEN N'Ma san pham'
                WHEN FieldCode LIKE '%Date' THEN N'Ngay'
                WHEN FieldCode LIKE '@Top%' THEN N'So luong'
                ELSE REPLACE(REPLACE(FieldCode, '@', ''), '_', ' ')
            END AS FieldName,
            DataType,
            CASE
                WHEN FieldCode = '@Username' THEN 'hidden'
                WHEN FieldCode LIKE '%Date' THEN 'date'
                WHEN DataType IN ('INT','BIGINT','DECIMAL','NUMERIC','FLOAT','REAL','MONEY','SMALLMONEY') THEN 'number'
                ELSE 'text'
            END AS ControlType,
            CASE WHEN has_default_value = 0 THEN 1 ELSE 0 END AS IsRequired,
            CASE WHEN FieldCode = '@Username' THEN 1 ELSE 0 END AS IsSystemParam,
            CASE
                WHEN FieldCode = '@ObjectID' THEN 'APICODE'
                WHEN FieldCode = '@ItemID' THEN 'APICODE'
                ELSE NULL
            END AS DataSourceType,
            CASE
                WHEN FieldCode = '@ObjectID' THEN '@danh_muc|@Type=khachhang'
                WHEN FieldCode = '@ItemID' THEN '@tra_cuu_san_pham|@TopN=50'
                ELSE NULL
            END AS DataSourceValue
        FROM P
    )
    SELECT * INTO #AI_META FROM M;

    IF @Apply = 0
    BEGIN
        SELECT DISTINCT ApiCode, ApiNameRaw AS ApiName, StoredProcedure
        FROM #AI_META
        ORDER BY ApiCode;

        SELECT ApiCode, FieldCode, FieldName, DataType, ControlType, IsRequired, IsSystemParam, DataSourceType, DataSourceValue, parameter_id
        FROM #AI_META
        ORDER BY ApiCode, parameter_id;
        RETURN;
    END

    -- Neu rule tao ApiCode thay doi, dong bo lai theo StoredProcedure
    UPDATE d
    SET d.ApiCode = a.ApiCode
    FROM dbo.API_Definition d
    JOIN (SELECT DISTINCT StoredProcedure, ApiCode FROM #AI_META) a
      ON a.StoredProcedure = d.StoredProcedure
    WHERE d.ApiCode <> a.ApiCode
      AND NOT EXISTS (
            SELECT 1
            FROM dbo.API_Definition x
            WHERE x.ApiCode = a.ApiCode
              AND x.ApiID <> d.ApiID
      );

    -- Upsert API_Definition
    INSERT INTO dbo.API_Definition (ApiCode, ApiName, ApiDescription, StoredProcedure, Category, IconEmoji, IsActive, OrderIndex)
    SELECT DISTINCT
        a.ApiCode,
        a.ApiNameRaw,
        N'Auto metadata from SP: ' + a.StoredProcedure,
        a.StoredProcedure,
        N'AutoSync',
        N'AI',
        1,
        999
    FROM #AI_META a
    WHERE NOT EXISTS (SELECT 1 FROM dbo.API_Definition d WHERE d.ApiCode = a.ApiCode);

    IF @UpdateExisting = 1
    BEGIN
        UPDATE d
        SET d.StoredProcedure = a.StoredProcedure
        FROM dbo.API_Definition d
        JOIN (SELECT DISTINCT ApiCode, StoredProcedure FROM #AI_META) a ON a.ApiCode = d.ApiCode;
    END

    -- Ensure default action
    INSERT INTO dbo.API_Action (ApiID, ActionCode, ActionName, ExecutionType, HttpMethod, IsConfirm, IsDefault, IsActive, OrderIndex)
    SELECT d.ApiID, 'VIEW', N'Xem du lieu', 'QUERY', 'POST', 0, 1, 1, 1
    FROM dbo.API_Definition d
    WHERE d.ApiCode IN (SELECT DISTINCT ApiCode FROM #AI_META)
      AND NOT EXISTS (SELECT 1 FROM dbo.API_Action a WHERE a.ApiID = d.ApiID AND a.IsDefault = 1);

    -- Upsert API_Field
    INSERT INTO dbo.API_Field
    (
        ApiID, FieldCode, FieldName, DataType, ControlType, IsRequired, IsSystemParam,
        DefaultValue, Placeholder, MinValue, MaxValue, OptionsJson, DataSourceType, DataSourceValue, OrderIndex
    )
    SELECT
        d.ApiID, a.FieldCode, a.FieldName, a.DataType, a.ControlType, a.IsRequired, a.IsSystemParam,
        NULL, NULL, NULL, NULL, NULL, a.DataSourceType, a.DataSourceValue, a.parameter_id
    FROM #AI_META a
    JOIN dbo.API_Definition d ON d.ApiCode = a.ApiCode
    WHERE NOT EXISTS (
        SELECT 1 FROM dbo.API_Field f WHERE f.ApiID = d.ApiID AND f.FieldCode = a.FieldCode
    );

    IF @UpdateExisting = 1
    BEGIN
        UPDATE f
        SET
            f.FieldName = a.FieldName,
            f.DataType = a.DataType,
            f.ControlType = a.ControlType,
            f.IsRequired = a.IsRequired,
            f.IsSystemParam = a.IsSystemParam,
            f.DataSourceType = a.DataSourceType,
            f.DataSourceValue = a.DataSourceValue,
            f.OrderIndex = a.parameter_id
        FROM dbo.API_Field f
        JOIN dbo.API_Definition d ON d.ApiID = f.ApiID
        JOIN #AI_META a ON a.ApiCode = d.ApiCode AND a.FieldCode = f.FieldCode;
    END

    -- Ensure API_Action_Field mapping
    INSERT INTO dbo.API_Action_Field (ActionID, FieldID, IsVisible, IsEditable, IsRequired)
    SELECT
        act.ActionID,
        fld.FieldID,
        CASE WHEN fld.IsSystemParam = 1 THEN 0 ELSE 1 END,
        CASE WHEN fld.IsSystemParam = 1 THEN 0 ELSE 1 END,
        fld.IsRequired
    FROM dbo.API_Definition d
    JOIN dbo.API_Action act ON act.ApiID = d.ApiID AND act.IsDefault = 1
    JOIN dbo.API_Field fld ON fld.ApiID = d.ApiID
    WHERE d.ApiCode IN (SELECT DISTINCT ApiCode FROM #AI_META)
      AND NOT EXISTS (
            SELECT 1 FROM dbo.API_Action_Field x
            WHERE x.ActionID = act.ActionID AND x.FieldID = fld.FieldID
      );

    -- Ensure API_Filter baseline (clone non-system fields)
    INSERT INTO dbo.API_Filter
    (
        ApiID, FieldCode, FieldName, DataType, ControlType, [Operator],
        DefaultValue, Placeholder, OptionsJson, DataSourceType, DataSourceValue, IsRequired, OrderIndex
    )
    SELECT
        fld.ApiID, fld.FieldCode, fld.FieldName, fld.DataType, fld.ControlType, '=',
        fld.DefaultValue, fld.Placeholder, fld.OptionsJson, fld.DataSourceType, fld.DataSourceValue, fld.IsRequired, fld.OrderIndex
    FROM dbo.API_Definition d
    JOIN dbo.API_Field fld ON fld.ApiID = d.ApiID
    WHERE d.ApiCode IN (SELECT DISTINCT ApiCode FROM #AI_META)
      AND fld.IsSystemParam = 0
      AND NOT EXISTS (
            SELECT 1 FROM dbo.API_Filter fl
            WHERE fl.ApiID = fld.ApiID AND fl.FieldCode = fld.FieldCode
      );

    /* =========================================================
       APPLY OVERRIDE (OPTIONAL)
       - Fill tables: API_Metadata_Override / API_Metadata_Field_Override /
                      API_Metadata_Bulk_Override to keep business config
       ========================================================= */
    UPDATE d
    SET
        d.ApiCode = COALESCE(o.ApiCode, d.ApiCode),
        d.ApiName = COALESCE(o.ApiName, d.ApiName),
        d.ApiDescription = COALESCE(o.ApiDescription, d.ApiDescription),
        d.Category = COALESCE(o.Category, d.Category),
        d.IconEmoji = COALESCE(o.IconEmoji, d.IconEmoji),
        d.IsActive = COALESCE(o.IsActive, d.IsActive),
        d.OrderIndex = COALESCE(o.OrderIndex, d.OrderIndex)
    FROM dbo.API_Definition d
    JOIN dbo.API_Metadata_Override o
      ON o.StoredProcedure = d.StoredProcedure;

    UPDATE a
    SET
        a.ActionCode = COALESCE(o.ActionCode, a.ActionCode),
        a.ActionName = COALESCE(o.ActionName, a.ActionName),
        a.ExecutionType = COALESCE(o.ExecutionType, a.ExecutionType),
        a.HttpMethod = COALESCE(o.HttpMethod, a.HttpMethod),
        a.IsConfirm = COALESCE(o.IsConfirm, a.IsConfirm)
    FROM dbo.API_Action a
    JOIN dbo.API_Definition d ON d.ApiID = a.ApiID
    JOIN dbo.API_Metadata_Override o ON o.StoredProcedure = d.StoredProcedure
    WHERE a.IsDefault = 1;

    UPDATE f
    SET
        f.FieldName = COALESCE(o.FieldName, f.FieldName),
        f.ControlType = COALESCE(o.ControlType, f.ControlType),
        f.IsRequired = COALESCE(o.IsRequired, f.IsRequired),
        f.IsSystemParam = COALESCE(o.IsSystemParam, f.IsSystemParam),
        f.DefaultValue = COALESCE(o.DefaultValue, f.DefaultValue),
        f.Placeholder = COALESCE(o.Placeholder, f.Placeholder),
        f.MinValue = COALESCE(o.MinValue, f.MinValue),
        f.MaxValue = COALESCE(o.MaxValue, f.MaxValue),
        f.OptionsJson = COALESCE(o.OptionsJson, f.OptionsJson),
        f.DataSourceType = COALESCE(o.DataSourceType, f.DataSourceType),
        f.DataSourceValue = COALESCE(o.DataSourceValue, f.DataSourceValue),
        f.OrderIndex = COALESCE(o.OrderIndex, f.OrderIndex)
    FROM dbo.API_Field f
    JOIN dbo.API_Definition d ON d.ApiID = f.ApiID
    JOIN dbo.API_Metadata_Field_Override o
      ON o.StoredProcedure = d.StoredProcedure
     AND o.FieldCode = f.FieldCode;

    UPDATE af
    SET
        af.IsVisible = COALESCE(o.IsVisible, af.IsVisible),
        af.IsEditable = COALESCE(o.IsEditable, af.IsEditable),
        af.IsRequired = COALESCE(o.IsRequired, af.IsRequired)
    FROM dbo.API_Action_Field af
    JOIN dbo.API_Action a ON a.ActionID = af.ActionID AND a.IsDefault = 1
    JOIN dbo.API_Field f ON f.FieldID = af.FieldID
    JOIN dbo.API_Definition d ON d.ApiID = a.ApiID AND d.ApiID = f.ApiID
    JOIN dbo.API_Metadata_Field_Override o
      ON o.StoredProcedure = d.StoredProcedure
     AND o.FieldCode = f.FieldCode;

    UPDATE fl
    SET
        fl.FieldName = COALESCE(o.FieldName, fl.FieldName),
        fl.ControlType = COALESCE(o.ControlType, fl.ControlType),
        fl.[Operator] = COALESCE(o.FilterOperator, fl.[Operator]),
        fl.DefaultValue = COALESCE(o.DefaultValue, fl.DefaultValue),
        fl.Placeholder = COALESCE(o.Placeholder, fl.Placeholder),
        fl.OptionsJson = COALESCE(o.OptionsJson, fl.OptionsJson),
        fl.DataSourceType = COALESCE(o.DataSourceType, fl.DataSourceType),
        fl.DataSourceValue = COALESCE(o.DataSourceValue, fl.DataSourceValue),
        fl.IsRequired = COALESCE(o.FilterIsRequired, fl.IsRequired),
        fl.OrderIndex = COALESCE(o.OrderIndex, fl.OrderIndex)
    FROM dbo.API_Filter fl
    JOIN dbo.API_Definition d ON d.ApiID = fl.ApiID
    JOIN dbo.API_Metadata_Field_Override o
      ON o.StoredProcedure = d.StoredProcedure
     AND o.FieldCode = fl.FieldCode;

    INSERT INTO dbo.API_Filter
    (
        ApiID, FieldCode, FieldName, DataType, ControlType, [Operator],
        DefaultValue, Placeholder, OptionsJson, DataSourceType, DataSourceValue, IsRequired, OrderIndex
    )
    SELECT
        d.ApiID,
        f.FieldCode,
        COALESCE(o.FieldName, f.FieldName),
        f.DataType,
        COALESCE(o.ControlType, f.ControlType),
        COALESCE(o.FilterOperator, '='),
        COALESCE(o.DefaultValue, f.DefaultValue),
        COALESCE(o.Placeholder, f.Placeholder),
        COALESCE(o.OptionsJson, f.OptionsJson),
        COALESCE(o.DataSourceType, f.DataSourceType),
        COALESCE(o.DataSourceValue, f.DataSourceValue),
        COALESCE(o.FilterIsRequired, f.IsRequired),
        COALESCE(o.OrderIndex, f.OrderIndex)
    FROM dbo.API_Definition d
    JOIN dbo.API_Field f ON f.ApiID = d.ApiID
    JOIN dbo.API_Metadata_Field_Override o
      ON o.StoredProcedure = d.StoredProcedure
     AND o.FieldCode = f.FieldCode
    WHERE COALESCE(o.IncludeAsFilter, CASE WHEN f.IsSystemParam = 1 THEN 0 ELSE 1 END) = 1
      AND NOT EXISTS (
          SELECT 1
          FROM dbo.API_Filter fl
          WHERE fl.ApiID = d.ApiID
            AND fl.FieldCode = f.FieldCode
      );

    MERGE dbo.API_Bulk_Config AS t
    USING
    (
        SELECT d.ApiID, b.AllowUpload, b.AllowMultiSelect, b.TemplateUrl, b.MaxRows
        FROM dbo.API_Metadata_Bulk_Override b
        JOIN dbo.API_Definition d ON d.StoredProcedure = b.StoredProcedure
    ) AS s
    ON t.ApiID = s.ApiID
    WHEN MATCHED THEN
        UPDATE SET
            t.AllowUpload = s.AllowUpload,
            t.AllowMultiSelect = s.AllowMultiSelect,
            t.TemplateUrl = s.TemplateUrl,
            t.MaxRows = s.MaxRows
    WHEN NOT MATCHED THEN
        INSERT (ApiID, AllowUpload, AllowMultiSelect, TemplateUrl, MaxRows)
        VALUES (s.ApiID, s.AllowUpload, s.AllowMultiSelect, s.TemplateUrl, s.MaxRows);

    SELECT N'Auto bootstrap applied' AS Msg, COUNT(DISTINCT ApiCode) AS ApiCount
    FROM #AI_META;
END
GO

/* =========================================================
   3) CREATE DDL TRIGGER (AUTO SYNC WHEN SP CHANGES)
   ========================================================= */
IF OBJECT_ID('dbo.API_Metadata_DDL_Log', 'U') IS NULL
BEGIN
    CREATE TABLE dbo.API_Metadata_DDL_Log (
        LogID            BIGINT IDENTITY(1,1) PRIMARY KEY,
        EventTime        DATETIME2(0) NOT NULL DEFAULT SYSDATETIME(),
        EventType        NVARCHAR(100) NOT NULL,
        SchemaName       SYSNAME NULL,
        ObjectName       SYSNAME NULL,
        CommandText      NVARCHAR(MAX) NULL,
        IsApplied        BIT NOT NULL DEFAULT 0,
        ErrorMessage     NVARCHAR(2000) NULL
    );
END
GO

IF EXISTS (SELECT 1 FROM sys.triggers WHERE name = 'trg_API_Metadata_AutoSync_OnSPDDL' AND parent_class_desc = 'DATABASE')
    DROP TRIGGER trg_API_Metadata_AutoSync_OnSPDDL ON DATABASE;
GO

CREATE TRIGGER trg_API_Metadata_AutoSync_OnSPDDL
ON DATABASE
AFTER CREATE_PROCEDURE, ALTER_PROCEDURE, DROP_PROCEDURE
AS
BEGIN
    SET NOCOUNT ON;

    DECLARE @E XML = EVENTDATA();
    DECLARE @EventType NVARCHAR(100) = @E.value('(/EVENT_INSTANCE/EventType)[1]', 'NVARCHAR(100)');
    DECLARE @SchemaName SYSNAME = @E.value('(/EVENT_INSTANCE/SchemaName)[1]', 'SYSNAME');
    DECLARE @ObjectName SYSNAME = @E.value('(/EVENT_INSTANCE/ObjectName)[1]', 'SYSNAME');
    DECLARE @CommandText NVARCHAR(MAX) = @E.value('(/EVENT_INSTANCE/TSQLCommand/CommandText)[1]', 'NVARCHAR(MAX)');

    -- Chi xu ly SP theo pattern API_*_AI
    IF @ObjectName IS NULL OR @ObjectName NOT LIKE 'API[_]%[_]AI'
        RETURN;

    -- Bo qua proc he thong bootstrap de tranh loop/transaction conflict
    IF @ObjectName = 'API_Metadata_AutoBootstrap_AI'
        RETURN;

    BEGIN TRY
        IF XACT_STATE() = 1
        BEGIN
            INSERT INTO dbo.API_Metadata_DDL_Log (EventType, SchemaName, ObjectName, CommandText, IsApplied)
            VALUES (@EventType, @SchemaName, @ObjectName, @CommandText, 0);
        END

        -- Re-sync metadata ngay sau khi DDL thanh cong
        IF OBJECT_ID('dbo.API_Metadata_AutoBootstrap_AI', 'P') IS NOT NULL
            EXEC dbo.API_Metadata_AutoBootstrap_AI @Apply = 1, @UpdateExisting = 1;

        IF XACT_STATE() = 1
        BEGIN
            UPDATE dbo.API_Metadata_DDL_Log
            SET IsApplied = 1
            WHERE LogID = (
                SELECT MAX(LogID)
                FROM dbo.API_Metadata_DDL_Log
                WHERE ObjectName = @ObjectName
                  AND EventType = @EventType
                  AND IsApplied = 0
            );
        END
    END TRY
    BEGIN CATCH
        IF XACT_STATE() = 1
        BEGIN
            INSERT INTO dbo.API_Metadata_DDL_Log (EventType, SchemaName, ObjectName, CommandText, IsApplied, ErrorMessage)
            VALUES (@EventType, @SchemaName, @ObjectName, @CommandText, 0, ERROR_MESSAGE());
        END
    END CATCH
END
GO

/* =========================================================
   4) HOW TO RUN
   ========================================================= */
-- Preview:
-- EXEC dbo.API_Metadata_AutoBootstrap_AI @Apply = 0, @UpdateExisting = 1;

-- Apply:
-- EXEC dbo.API_Metadata_AutoBootstrap_AI @Apply = 1, @UpdateExisting = 1;

-- Trigger log:
-- SELECT TOP 100 * FROM dbo.API_Metadata_DDL_Log ORDER BY LogID DESC;
