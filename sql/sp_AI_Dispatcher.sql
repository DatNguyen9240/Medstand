-- ═══════════════════════════════════════════════════════════════════════════
-- sp_AI_Dispatcher.sql
-- Dispatcher trung tâm cho n8n AI Chatbot
-- Nhận: @ApiCode (VD: @ton_kho_list), @Params (JSON), @isConfirm (0/1)
-- Tra bảng API_Definition → lấy StoredProcedure → EXEC động
-- ═══════════════════════════════════════════════════════════════════════════
USE [medtest]
GO

CREATE OR ALTER PROCEDURE sp_AI_Dispatcher
    @ApiCode   VARCHAR(100),
    @Params    NVARCHAR(MAX) = '{}',
    @isConfirm INT           = 0
AS
BEGIN
    SET NOCOUNT ON;

    -- ── 1. Lấy tên StoredProcedure từ metadata ────────────────────────────
    DECLARE @ProcName VARCHAR(200);

    SELECT TOP 1 @ProcName = d.StoredProcedure
    FROM API_Definition d
    WHERE d.ApiCode  = @ApiCode
      AND d.IsActive = 1;

    IF @ProcName IS NULL
    BEGIN
        SELECT
            N'ERROR'                                                   AS [status],
            N'ApiCode [' + @ApiCode + N'] không tìm thấy hoặc bị tắt.' AS [message];
        RETURN;
    END

    -- ── 2. Validate JSON params ────────────────────────────────────────────
    IF @Params IS NULL OR LTRIM(RTRIM(@Params)) = ''
        SET @Params = N'{}';

    IF ISJSON(@Params) = 0
    BEGIN
        SELECT
            N'ERROR'                                     AS [status],
            N'@Params không phải JSON hợp lệ: ' + @Params AS [message];
        RETURN;
    END

    -- ── 3. Build dynamic EXEC ──────────────────────────────────────────────
    --  Chỉ truyền params có trong API_Field của ApiCode đó (an toàn)
    DECLARE @ApiID     INT;
    DECLARE @paramParts NVARCHAR(MAX) = N'';

    SELECT TOP 1 @ApiID = ApiID
    FROM API_Definition
    WHERE ApiCode = @ApiCode;

    -- Ghép từng param khớp với API_Field definition
    SELECT @paramParts = @paramParts + N', ' + j.[key] + N' = ' +
        CASE
            WHEN f.DataType IN ('INT','BIGINT','FLOAT','DECIMAL','NUMERIC','BIT')
                THEN ISNULL(j.[value], N'NULL')
            WHEN j.[value] IS NULL
                THEN N'NULL'
            ELSE N'N''' + REPLACE(ISNULL(j.[value], N''), N'''', N'''''') + N''''
        END
    FROM OPENJSON(@Params) AS j
    INNER JOIN API_Field f
        ON  f.ApiID     = @ApiID
        AND f.FieldCode = j.[key]    -- chỉ lấy param có trong định nghĩa
        AND f.IsSystemParam = 0      -- bỏ system params (inject bên trong proc)
    ORDER BY f.OrderIndex;

    -- Thêm @isConfirm nếu proc cần (kiểm tra API_Action)
    DECLARE @needConfirm BIT = 0;
    SELECT TOP 1 @needConfirm = IsConfirm
    FROM API_Action
    WHERE ApiID = @ApiID AND IsDefault = 1 AND IsActive = 1;

    IF @needConfirm = 1
        SET @paramParts = @paramParts + N', @isConfirm = ' + CAST(@isConfirm AS NVARCHAR(5));

    -- Ghép câu EXEC
    DECLARE @sql NVARCHAR(MAX) = N'EXEC ' + @ProcName;
    IF LEN(@paramParts) > 2
        SET @sql = @sql + N' ' + SUBSTRING(@paramParts, 3, LEN(@paramParts));

    -- ── 4. Thực thi ────────────────────────────────────────────────────────
    BEGIN TRY
        EXEC sp_executesql @sql;
    END TRY
    BEGIN CATCH
        SELECT
            N'ERROR'                                                       AS [status],
            N'Lỗi khi gọi [' + @ProcName + N']: ' + ERROR_MESSAGE()       AS [message],
            @sql                                                           AS [debug_sql];
    END CATCH
END
GO

PRINT N'✅ sp_AI_Dispatcher đã tạo thành công!';
GO

/* ── TEST ─────────────────────────────────────────────────────────────────
-- Test tra cứu tồn kho
EXEC sp_AI_Dispatcher
    @ApiCode   = '@ton_kho_list',
    @Params    = N'{"@ItemName": "Amoxicillin", "@Username": "ADMIN"}',
    @isConfirm = 0;

-- Test tìm kiếm khách hàng
EXEC sp_AI_Dispatcher
    @ApiCode   = '@danh_muc',
    @Params    = N'{"@Type": "khachhang", "@SearchText": "Lan"}',
    @isConfirm = 0;

-- Test gợi ý đơn hàng
EXEC sp_AI_Dispatcher
    @ApiCode   = '@goi_y_don_hang',
    @Params    = N'{"@ObjectID": "KH001", "@Username": "ADMIN", "@TopN": "10"}',
    @isConfirm = 0;

-- Test ApiCode không tồn tại
EXEC sp_AI_Dispatcher
    @ApiCode   = '@khong_co',
    @Params    = N'{}',
    @isConfirm = 0;
─────────────────────────────────────────────────────────────────────────── */
