USE medtest;
GO

/*
  Read-only reconciliation fixture.
  Locked initial fixture: AG0031 at the inclusive 2026-07-17 cut-off.
  This script reads raw sources only. It does not execute the draft procedures.
*/
SET NOCOUNT ON;

IF DB_NAME() <> N'medtest'
    THROW 51000, 'Debt diagnostics are restricted to the medtest database.', 1;

DECLARE @CustomerID NVARCHAR(100) = N'AG0031';
DECLARE @AsOfDate DATE = '2026-07-17';

IF NULLIF(LTRIM(RTRIM(@CustomerID)), N'') IS NULL
    THROW 51001, 'An approved DB-test @CustomerID is required.', 1;

IF @AsOfDate IS NULL
    THROW 51002, 'An approved DB-test @AsOfDate is required.', 1;

SELECT
    N'RECON_CONTEXT' AS EvidenceCode,
    DB_NAME() AS DatabaseName,
    SUSER_SNAME() AS ExecutedBy,
    SYSUTCDATETIME() AS CheckedAtUtc,
    @CustomerID AS CustomerID,
    @AsOfDate AS AsOfDate,
    N'RAW_SOURCE_ONLY' AS SourceMode;

SELECT
    N'LIST_SOURCE' AS EvidenceCode,
    V.ObjectID,
    COUNT_BIG(*) AS RowCountValue,
    SUM(ISNULL(V.Amount, 0)) AS ListDebtValue,
    MIN(V.DocumentDate) AS FirstDocumentDate,
    MAX(V.DocumentDate) AS LastDocumentDate
FROM dbo.vCongNoBanHang V
WHERE V.ObjectID = @CustomerID
  AND V.DocumentDate < DATEADD(DAY, 1, CAST(@AsOfDate AS DATETIME))
GROUP BY V.ObjectID;

SELECT
    N'LIST_RAW' AS EvidenceCode,
    V.*
FROM dbo.vCongNoBanHang V
WHERE V.ObjectID = @CustomerID
  AND V.DocumentDate < DATEADD(DAY, 1, CAST(@AsOfDate AS DATETIME))
ORDER BY V.DocumentDate, V.ObjectID;

SELECT
    N'DETAIL_SOURCE' AS EvidenceCode,
    D.ObjectID,
    COUNT_BIG(*) AS RowCountValue,
    SUM(ISNULL(D.DebitAmount, 0)) AS DebitValue,
    SUM(ISNULL(D.CreditAmount, 0)) AS CreditValue,
    SUM(ISNULL(D.DebitAmount, 0) - ISNULL(D.CreditAmount, 0)) AS DetailRemainingValue,
    MIN(D.DocumentDate) AS FirstDocumentDate,
    MAX(D.DocumentDate) AS LastDocumentDate
FROM dbo.SY_GetDebitDocFnc(CAST(@AsOfDate AS DATETIME), @CustomerID, '131', '') D
GROUP BY D.ObjectID;

SELECT
    N'DETAIL_RAW' AS EvidenceCode,
    D.*
FROM dbo.SY_GetDebitDocFnc(CAST(@AsOfDate AS DATETIME), @CustomerID, '131', '') D
ORDER BY D.DocumentDate, D.DocumentID;

WITH ListAggregate AS
(
    SELECT
        COUNT_BIG(*) AS ListRowCount,
        SUM(ISNULL(V.Amount, 0)) AS ListDebtValue
    FROM dbo.vCongNoBanHang V
    WHERE V.ObjectID = @CustomerID
      AND V.DocumentDate < DATEADD(DAY, 1, CAST(@AsOfDate AS DATETIME))
),
DetailAggregate AS
(
    SELECT
        COUNT_BIG(*) AS DetailRowCount,
        SUM(ISNULL(D.DebitAmount, 0)) AS DebitValue,
        SUM(ISNULL(D.CreditAmount, 0)) AS CreditValue,
        SUM(ISNULL(D.DebitAmount, 0) - ISNULL(D.CreditAmount, 0)) AS DetailRemainingValue
    FROM dbo.SY_GetDebitDocFnc(CAST(@AsOfDate AS DATETIME), @CustomerID, '131', '') D
)
SELECT
    N'LIST_DETAIL_RECONCILIATION' AS EvidenceCode,
    L.ListRowCount,
    D.DetailRowCount,
    L.ListDebtValue,
    D.DebitValue,
    D.CreditValue,
    D.DetailRemainingValue,
    L.ListDebtValue - D.DetailRemainingValue AS DifferenceValue,
    CASE
        WHEN L.ListDebtValue = D.DetailRemainingValue THEN N'PASS_TOTAL_MATCH'
        ELSE N'REVIEW_TOTAL_DIFFERENCE'
    END AS ReconciliationStatus
FROM ListAggregate L
CROSS JOIN DetailAggregate D;

SELECT
    N'OBJECT_TYPE' AS EvidenceCode,
    O.ObjectID,
    O.ObjectName,
    O.isCustomer,
    O.isEmployee,
    O.BranchID,
    O.Phone,
    CASE
        WHEN ISNULL(O.isCustomer, 0) = 1 AND ISNULL(O.isEmployee, 0) = 0 THEN N'CUSTOMER'
        WHEN ISNULL(O.isCustomer, 0) = 0 AND ISNULL(O.isEmployee, 0) = 1 THEN N'EMPLOYEE'
        WHEN ISNULL(O.isCustomer, 0) = 1 AND ISNULL(O.isEmployee, 0) = 1 THEN N'CUSTOMER_AND_EMPLOYEE'
        ELSE N'UNKNOWN'
    END AS ResolvedObjectType
FROM dbo.CF_ObjectTbl O
WHERE O.ObjectID = @CustomerID;

SELECT
    N'INVOICE_DUE_DATE' AS EvidenceCode,
    I.DocumentID,
    I.ObjectID,
    I.DocumentDate,
    I.DueDate,
    I.BaseTotal,
    I.StatusID
FROM dbo.AR_InvoiceTbl I
WHERE I.ObjectID = @CustomerID
  AND I.DocumentDate < DATEADD(DAY, 1, CAST(@AsOfDate AS DATETIME))
ORDER BY I.DocumentDate DESC;

SELECT
    N'DETAIL_INVOICE_JOIN' AS EvidenceCode,
    D.DocumentID,
    D.ObjectID,
    D.DocumentDate AS LedgerDocumentDate,
    D.DebitAmount,
    D.CreditAmount,
    D.DebitAmount - D.CreditAmount AS RemainingAmount,
    I.DocumentDate AS InvoiceDocumentDate,
    I.DueDate,
    I.BaseTotal,
    I.StatusID,
    CASE WHEN I.DocumentID IS NULL THEN N'NO_INVOICE_MATCH' ELSE N'INVOICE_MATCHED' END AS InvoiceJoinStatus
FROM dbo.SY_GetDebitDocFnc(CAST(@AsOfDate AS DATETIME), @CustomerID, '131', '') D
LEFT JOIN dbo.AR_InvoiceTbl I
    ON I.DocumentID = D.DocumentID
   AND I.ObjectID = D.ObjectID
ORDER BY D.DocumentDate DESC, D.DocumentID;
