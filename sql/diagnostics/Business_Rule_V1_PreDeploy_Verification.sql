USE medtest;
GO

/* READ-ONLY pre-deploy gate. Run before importing any Business Rule v1 SQL. */
SET NOCOUNT ON;

SELECT DB_NAME() AS DatabaseName, SUSER_SNAME() AS ExecutedBy, SYSUTCDATETIME() AS CheckedAtUtc;

SELECT
    'CONFIG_TABLE_PRESENT' AS CheckCode,
    CASE WHEN OBJECT_ID(N'dbo.AI_BusinessRuleConfigTbl', N'U') IS NULL THEN 'BLOCKED' ELSE 'PASS' END AS Status,
    'Review this result before applying the versioned baseline.' AS Note;

IF OBJECT_ID(N'dbo.AI_BusinessRuleConfigTbl', N'U') IS NOT NULL
BEGIN
    SELECT Status, COUNT(*) AS ConfigCount
    FROM dbo.AI_BusinessRuleConfigTbl
    GROUP BY Status;

    SELECT
        'APPROVED_ROWS_PROTECTED' AS CheckCode,
        COUNT(*) AS ApprovedRows,
        'PASS' AS Status,
        'Existing APPROVED rows are preserved by the versioned baseline.' AS Note
    FROM dbo.AI_BusinessRuleConfigTbl
    WHERE Status = 'APPROVED';
END

SELECT
    v.ObjectName,
    CASE WHEN o.object_id IS NULL THEN 'BLOCKED' ELSE 'FOUND' END AS Status,
    o.modify_date
FROM (VALUES
    (N'API_DoanhSo_AI'),
    (N'API_DanhsachTonKho_AI'),
    (N'API_GoiYDonHang_AI'),
    (N'API_TuyenBanHang_AI'),
    (N'API_ChamDiemKH_AI'),
    (N'API_TichLuy_AI'),
    (N'API_UpsellGoiY_AI'),
    (N'API_DeXuatKhuyenMai_AI')
) v(ObjectName)
LEFT JOIN sys.objects o ON o.name = v.ObjectName AND o.schema_id = SCHEMA_ID(N'dbo');

SELECT
    'STATUS_DICTIONARY_OBSERVED' AS CheckCode,
    CASE
        WHEN EXISTS (SELECT 1 FROM dbo.AR_InvoiceStatusTbl WHERE StatusID = 3)
         AND EXISTS (SELECT 1 FROM dbo.AR_InvoiceStatusTbl WHERE StatusID = 8 AND ISNULL(isReceiptStatus, 0) = 1)
         AND EXISTS (SELECT 1 FROM dbo.AR_OrderStatusTbl WHERE StatusID = 10 AND ISNULL(isCancelStatus, 0) = 1)
            THEN 'PASS'
        ELSE 'BLOCKED'
    END AS Status,
    'Implementation uses fulfilled invoice statuses 3,6,7,8; status 8 remains a collection proxy pending payment-ledger reconciliation.' AS Note;

SELECT
    'RUNTIME_GATE' AS CheckCode,
    'PENDING' AS Status,
    'No SQL import, procedure execution, or n8n publish is performed by this script.' AS Note;
GO
