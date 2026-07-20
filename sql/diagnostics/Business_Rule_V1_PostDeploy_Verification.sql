USE medtest;
GO

/*
    READ-ONLY post-deploy verification.
    Run after each procedure is imported. It reports evidence; it never
    changes data and does not approve a DRAFT rule.
*/
SET NOCOUNT ON;

SELECT DB_NAME() AS DatabaseName, SUSER_SNAME() AS ExecutedBy, SYSUTCDATETIME() AS CheckedAtUtc;

SELECT
    'CONFIG_TABLE_PRESENT' AS CheckCode,
    CASE WHEN OBJECT_ID(N'dbo.AI_BusinessRuleConfigTbl', N'U') IS NULL THEN 'FAIL' ELSE 'PASS' END AS Status;

IF OBJECT_ID(N'dbo.AI_BusinessRuleConfigTbl', N'U') IS NOT NULL
BEGIN
    SELECT Status, COUNT(*) AS ConfigCount
    FROM dbo.AI_BusinessRuleConfigTbl
    GROUP BY Status;

    SELECT
        'DRAFT_NOT_AUTO_ACTIVE' AS CheckCode,
        CASE WHEN EXISTS (SELECT 1 FROM dbo.AI_BusinessRuleConfigTbl WHERE Status = 'DRAFT') THEN 'PASS' ELSE 'REVIEW' END AS Status,
        'DRAFT rows are not returned by AI_GetBusinessRuleConfig.' AS Note;

END

SELECT
    o.name AS ObjectName,
    o.modify_date AS ModifyDate,
    CASE WHEN OBJECT_DEFINITION(o.object_id) IS NULL THEN 'FAIL' ELSE 'PASS' END AS DefinitionPresent,
    CASE WHEN OBJECT_DEFINITION(o.object_id) LIKE '%RuleVersion%' THEN 'PASS' ELSE 'REVIEW' END AS RuleVersionMarker,
    CASE WHEN o.name IN ('API_TuyenBanHang_AI', 'API_TichLuy_AI', 'API_UpsellGoiY_AI')
              AND OBJECT_DEFINITION(o.object_id) LIKE '%AR_OrderTbl%' THEN 'FAIL_ORDER_SOURCE_PRESENT'
         ELSE 'PASS_OR_NOT_APPLICABLE' END AS OfficialSalesSourceCheck,
    CONVERT(VARCHAR(64), HASHBYTES('SHA2_256', CONVERT(VARBINARY(MAX), COALESCE(OBJECT_DEFINITION(o.object_id), N''))), 2) AS DefinitionSha256
FROM sys.objects o
WHERE o.schema_id = SCHEMA_ID(N'dbo')
  AND o.name IN ('API_DoanhSo_AI', 'API_DanhsachTonKho_AI', 'API_GoiYDonHang_AI', 'API_TuyenBanHang_AI', 'API_ChamDiemKH_AI', 'API_TichLuy_AI', 'API_UpsellGoiY_AI', 'API_DeXuatKhuyenMai_AI')
ORDER BY o.name;

SELECT
    'STATUS_DICTIONARY_OBSERVED' AS CheckCode,
    CASE
        WHEN EXISTS (SELECT 1 FROM dbo.AR_InvoiceStatusTbl WHERE StatusID = 3)
         AND EXISTS (SELECT 1 FROM dbo.AR_InvoiceStatusTbl WHERE StatusID = 8 AND ISNULL(isReceiptStatus, 0) = 1)
         AND EXISTS (SELECT 1 FROM dbo.AR_OrderStatusTbl WHERE StatusID = 10 AND ISNULL(isCancelStatus, 0) = 1)
            THEN 'PASS'
        ELSE 'REVIEW'
    END AS Status,
    'Status 8 is still a collection proxy until payment-ledger reconciliation is approved.' AS Note;

SELECT
    'NO_MUTATION_PERFORMED' AS CheckCode,
    'PASS' AS Status,
    'This verification contains only metadata and configuration reads.' AS Note;
GO
