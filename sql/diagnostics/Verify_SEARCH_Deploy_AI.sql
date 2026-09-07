/*
  Verify_SEARCH_Deploy_AI.sql
  Chạy trên DB backend để xác nhận đã đưa các file SQL của bộ SEARCH lên chưa.
  Chỉ đọc (không tạo/sửa gì). Chạy toàn bộ, xem 3 bảng kết quả.

  Kỳ vọng khi ĐÃ deploy đủ:
    - Bảng 1: tất cả dòng Status = 'OK ...'
    - Bảng 2: cả @customer_search và @product_search Status = 'OK'
    - Bảng 3: 7 proc có ScopePatch = 'OK', ChamDiemKH = 'n/a', tất cả Search005 = 'OK'
*/
USE medtest;
GO
SET NOCOUNT ON;

-------------------------------------------------------------------------------
-- BẢNG 1 — Object mới của SEARCH-001..004
-------------------------------------------------------------------------------
SELECT
    v.Feature,
    v.ObjectLabel,
    CASE
        WHEN OBJECT_ID('dbo.' + v.ObjectName) IS NULL
            THEN 'MISSING — CHUA CHAY FILE ' + v.Feature
        ELSE 'OK  (sua lan cuoi: '
             + CONVERT(VARCHAR(19),
                       (SELECT modify_date FROM sys.objects WHERE object_id = OBJECT_ID('dbo.' + v.ObjectName)),
                       120)
             + ')'
    END AS Status
FROM (VALUES
    ('SEARCH-001', 'TABLE  dbo.AI_SelectionToken',             'AI_SelectionToken'),
    ('SEARCH-001', 'PROC   dbo.API_SelectionToken_Issue_AI',   'API_SelectionToken_Issue_AI'),
    ('SEARCH-001', 'PROC   dbo.API_SelectionToken_Consume_AI', 'API_SelectionToken_Consume_AI'),
    ('SEARCH-002', 'FUNC   dbo.AI_ScopeGuardFnc',              'AI_ScopeGuardFnc'),
    ('SEARCH-003', 'PROC   dbo.API_CustomerSearch_AI',         'API_CustomerSearch_AI'),
    ('SEARCH-004', 'PROC   dbo.API_ProductSearch_AI',          'API_ProductSearch_AI')
) v(Feature, ObjectLabel, ObjectName)
ORDER BY v.Feature, v.ObjectLabel;

-------------------------------------------------------------------------------
-- BẢNG 2 — Metadata API_Definition cho 2 API tìm kiếm (do SEARCH-003/004 tự MERGE)
-------------------------------------------------------------------------------
IF OBJECT_ID('dbo.API_Definition', 'U') IS NULL
BEGIN
    SELECT 'API_Definition khong ton tai — bo qua kiem tra metadata' AS Note;
END
ELSE
BEGIN
    SELECT
        x.ApiCode,
        d.StoredProcedure,
        CASE WHEN d.ApiCode IS NULL THEN 'MISSING — SEARCH-003/004 chua chay'
             ELSE 'OK' END AS Status
    FROM (VALUES ('@customer_search'), ('@product_search')) x(ApiCode)
    LEFT JOIN dbo.API_Definition d ON d.ApiCode = x.ApiCode;
END

-------------------------------------------------------------------------------
-- BẢNG 3 — 8 proc module: đã có luồng SEARCH-005 chưa + đã có 2 bản vá bảo mật chưa
-------------------------------------------------------------------------------
SELECT
    m.ObjectName,
    CASE
        WHEN OBJECT_ID('dbo.' + m.ObjectName) IS NULL
            THEN 'PROC MISSING'
        WHEN OBJECT_DEFINITION(OBJECT_ID('dbo.' + m.ObjectName)) LIKE '%NEEDS_SELECTION%'
            THEN 'OK — co SEARCH-005'
        ELSE 'CU — chua co SEARCH-005 (ban moi chua chay)'
    END AS Search005,
    CASE
        WHEN m.ObjectName = 'API_ChamDiemKH_AI'
            THEN 'n/a (da scoped san bang #AllowedObjects)'
        WHEN OBJECT_ID('dbo.' + m.ObjectName) IS NULL
            THEN 'PROC MISSING'
        WHEN OBJECT_DEFINITION(OBJECT_ID('dbo.' + m.ObjectName)) LIKE '%SEARCH-005-SCOPE-GUARD%'
            THEN 'OK — co ban va scope + guard'
        WHEN OBJECT_DEFINITION(OBJECT_ID('dbo.' + m.ObjectName)) LIKE '%SEARCH-005-SCOPE%'
            THEN 'MOT NUA — co scope, THIEU guard rong'
        ELSE 'THIEU — chua co ban va bao mat CandidateJson'
    END AS ScopePatch,
    CONVERT(VARCHAR(19),
            (SELECT modify_date FROM sys.objects WHERE object_id = OBJECT_ID('dbo.' + m.ObjectName)),
            120) AS LastModified
FROM (VALUES
    ('API_DoanhSo_AI'),
    ('API_CongNoKhachHang_AI'),
    ('API_CongNoChiTiet_AI'),
    ('API_DonHang_AI'),
    ('API_HoaDon_AI'),
    ('API_TichLuy_AI'),
    ('API_GoiYDonHang_AI'),
    ('API_ChamDiemKH_AI')
) m(ObjectName)
ORDER BY m.ObjectName;
GO
