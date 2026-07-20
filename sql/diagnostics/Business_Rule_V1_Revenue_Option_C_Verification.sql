USE medtest;
GO

/*
    READ-ONLY reconciliation for Business Rule v1 revenue Option C.

    Proposed source contract:
      - Fulfilled sales: signed sum of StatusID 3, 6, 7, 8 and 99.
      - Collected revenue: signed sum of StatusID 8 and 99.
      - Monetary basis: AR_OrderAndReturnView.TotalAmount.

    Important: the status-99 aggregate in AR_OrderAndReturnView is expected to
    be signed negative already. Individual correction lines may have mixed
    signs; the checks below prove that the signed aggregate is summed once and
    is not negated a second time.

    This file only reads data and metadata. It does not write database state,
    procedure state, workflow state, or rule activation.
*/
SET NOCOUNT ON;

/* RESULT SET 1 - execution context. */
SELECT
    N'R01_CONTEXT' AS CheckCode,
    DB_NAME() AS DatabaseName,
    SUSER_SNAME() AS ExecutedBy,
    SYSUTCDATETIME() AS CheckedAtUtc,
    N'BR-SALES-V1-C-DRAFT' AS RuleVersion,
    N'AR_OrderAndReturnView.TotalAmount' AS RevenueBasis,
    N'FULFILLED=3,6,7,8;COLLECTED=8;RETURN=99' AS RevenueRecognition;

/* RESULT SET 2 - order and invoice status dictionaries. */
SELECT
    N'R02_STATUS_DICTIONARY' AS CheckCode,
    N'ORDER' AS DictionarySource,
    S.StatusID,
    S.StatusName,
    S.isCancelStatus,
    CAST(NULL AS BIT) AS isReceiptStatus,
    CASE
        WHEN S.StatusID IN (3, 6, 7, 8) THEN N'FULFILLED'
        WHEN S.StatusID = 10 THEN N'CANCELLED'
        ELSE N'EXCLUDED_FROM_OPTION_C'
    END AS OptionCClassification
FROM dbo.AR_OrderStatusTbl S WITH (NOLOCK)

UNION ALL

SELECT
    N'R02_STATUS_DICTIONARY',
    N'INVOICE',
    S.StatusID,
    S.StatusName,
    CAST(NULL AS BIT),
    S.isReceiptStatus,
    CASE
        WHEN S.StatusID = 8 AND S.isReceiptStatus = 1 THEN N'RECEIPT_STATUS_FLAG_ONLY'
        ELSE N'NOT_USED_FOR_COLLECTED_REVENUE'
    END
FROM dbo.AR_InvoiceStatusTbl S WITH (NOLOCK)
ORDER BY DictionarySource, StatusID;

/* RESULT SET 3 - sign and volume evidence by status. */
SELECT
    N'R03_STATUS_SIGN_EVIDENCE' AS CheckCode,
    V.StatusID,
    COUNT_BIG(*) AS TransactionLineCount,
    SUM(CASE WHEN ISNULL(V.TotalAmount, 0) > 0 THEN CONVERT(BIGINT, 1) ELSE 0 END) AS PositiveLineCount,
    SUM(CASE WHEN ISNULL(V.TotalAmount, 0) < 0 THEN CONVERT(BIGINT, 1) ELSE 0 END) AS NegativeLineCount,
    SUM(CASE WHEN ISNULL(V.TotalAmount, 0) = 0 THEN CONVERT(BIGINT, 1) ELSE 0 END) AS ZeroLineCount,
    MIN(ISNULL(V.TotalAmount, 0)) AS MinimumTotalAmount,
    MAX(ISNULL(V.TotalAmount, 0)) AS MaximumTotalAmount,
    SUM(ISNULL(V.Amount, 0)) AS LegacyAmountValue,
    SUM(ISNULL(V.TotalAmount, 0)) AS SignedTotalAmountValue,
    CASE
        WHEN V.StatusID = 99
         AND SUM(ISNULL(V.TotalAmount, 0)) < 0
         AND SUM(CASE WHEN ISNULL(V.TotalAmount, 0) > 0 THEN CONVERT(BIGINT, 1) ELSE 0 END) > 0
            THEN N'PASS_RETURN_AGGREGATE_NEGATIVE_MIXED_LINES'
        WHEN V.StatusID = 99
         AND SUM(ISNULL(V.TotalAmount, 0)) < 0
            THEN N'PASS_RETURN_AGGREGATE_NEGATIVE'
        WHEN V.StatusID IN (3, 6, 7, 8)
         AND SUM(ISNULL(V.TotalAmount, 0)) >= 0
         AND SUM(CASE WHEN ISNULL(V.TotalAmount, 0) < 0 THEN CONVERT(BIGINT, 1) ELSE 0 END) > 0
            THEN N'PASS_ORDER_AGGREGATE_NON_NEGATIVE_MIXED_LINES'
        WHEN V.StatusID IN (3, 6, 7, 8)
         AND SUM(ISNULL(V.TotalAmount, 0)) >= 0
            THEN N'PASS_ORDER_AGGREGATE_NON_NEGATIVE'
        ELSE N'REVIEW_SIGN_ANOMALY'
    END AS SignCheckStatus
FROM dbo.AR_OrderAndReturnView V WITH (NOLOCK)
WHERE V.StatusID IN (3, 6, 7, 8, 99)
GROUP BY V.StatusID
ORDER BY V.StatusID;

/* RESULT SET 4 - expected Option C totals; status 99 is directly summed once. */
SELECT
    N'R04_OPTION_C_TOTALS' AS CheckCode,
    SUM(CASE WHEN V.StatusID IN (3, 6, 7, 8) THEN ISNULL(V.TotalAmount, 0) ELSE 0 END) AS FulfilledOrderPositiveValue,
    SUM(CASE WHEN V.StatusID = 99 THEN ISNULL(V.TotalAmount, 0) ELSE 0 END) AS ReturnSignedValue,
    SUM(CASE WHEN V.StatusID IN (3, 6, 7, 8, 99) THEN ISNULL(V.TotalAmount, 0) ELSE 0 END) AS ExpectedFulfilledSales,
    SUM(CASE WHEN V.StatusID = 8 THEN ISNULL(V.TotalAmount, 0) ELSE 0 END) AS Status8OrderValue,
    SUM(CASE WHEN V.StatusID IN (8, 99) THEN ISNULL(V.TotalAmount, 0) ELSE 0 END) AS ExpectedCollectedRevenueByStatus,
    SUM(CASE WHEN V.StatusID IN (3, 6, 7, 8, 99) THEN ISNULL(V.Amount, 0) ELSE 0 END) AS LegacyAmountForComparison,
    SUM(CASE WHEN V.StatusID IN (3, 6, 7, 8, 99)
             THEN ISNULL(V.TotalAmount, 0) - ISNULL(V.Amount, 0)
             ELSE 0 END) AS TotalAmountMinusLegacyAmount,
    N'DIRECT_SIGNED_SUM_NO_SECOND_NEGATION' AS ReturnApplicationRule
FROM dbo.AR_OrderAndReturnView V WITH (NOLOCK);

/* RESULT SET 5 - return formula and view-sign reconciliation. */
WITH ReturnDetailEvidence AS
(
    SELECT
        COUNT_BIG(*) AS ReturnDetailCount,
        COUNT(D.TotalAmount) AS ReturnValuedDetailCount,
        SUM(CASE WHEN D.TotalAmount IS NULL THEN CONVERT(BIGINT, 1) ELSE 0 END) AS ReturnNullAmountDetailCount,
        SUM(ISNULL(D.Amount, 0)) AS ReturnAmount,
        SUM(ISNULL(D.DiscountAmount, 0)) AS ReturnDiscountAmount,
        SUM(ISNULL(D.DiscountAmount2, 0)) AS ReturnDiscountAmount2,
        SUM(ISNULL(D.VATAmount, 0)) AS ReturnVATAmount,
        SUM(ISNULL(D.TotalAmount, 0)) AS ReturnDetailTotalAmount,
        SUM(
            ISNULL(D.Amount, 0)
            - ISNULL(D.DiscountAmount, 0)
            - ISNULL(D.DiscountAmount2, 0)
            - ISNULL(D.TotalAmount, 0)
        ) AS NetFormulaDifference
    FROM dbo.AR_ReturnTbl R WITH (NOLOCK)
    JOIN dbo.AR_ReturnDetailTbl D WITH (NOLOCK)
        ON R.DocumentID = D.DocumentID
    WHERE R.Status = 1
      AND COALESCE(R.KhongTruDSWeb, 0) = 0
),
ReturnViewEvidence AS
(
    SELECT
        COUNT_BIG(*) AS ReturnViewLineCount,
        COUNT(V.TotalAmount) AS ReturnValuedViewLineCount,
        SUM(CASE WHEN V.TotalAmount IS NULL THEN CONVERT(BIGINT, 1) ELSE 0 END) AS ReturnNullAmountViewLineCount,
        SUM(ISNULL(V.TotalAmount, 0)) AS ReturnViewSignedTotalAmount
    FROM dbo.AR_OrderAndReturnView V WITH (NOLOCK)
    WHERE V.StatusID = 99
)
SELECT
    N'R05_RETURN_RECONCILIATION' AS CheckCode,
    D.ReturnDetailCount,
    V.ReturnViewLineCount,
    D.ReturnValuedDetailCount,
    V.ReturnValuedViewLineCount,
    D.ReturnNullAmountDetailCount,
    V.ReturnNullAmountViewLineCount,
    D.ReturnAmount,
    D.ReturnDiscountAmount,
    D.ReturnDiscountAmount2,
    D.ReturnVATAmount,
    D.ReturnDetailTotalAmount,
    V.ReturnViewSignedTotalAmount,
    D.NetFormulaDifference,
    D.ReturnDetailTotalAmount + V.ReturnViewSignedTotalAmount AS ReturnSignDifference,
    CASE
        WHEN D.ReturnValuedDetailCount = V.ReturnValuedViewLineCount
         AND D.NetFormulaDifference = 0
         AND D.ReturnDetailTotalAmount + V.ReturnViewSignedTotalAmount = 0
            THEN N'PASS_RETURN_SIGNED_ONCE'
        ELSE N'REVIEW_RETURN_RECONCILIATION'
    END AS ReturnReconciliationStatus
FROM ReturnDetailEvidence D
CROSS JOIN ReturnViewEvidence V;

/*
   RESULT SET 6 - status 8 is a receipt-status signal, not proof of the amount
   actually collected. A payment ledger must be reconciled before the label
   "collected revenue" can be promoted from draft to approved.
*/
SELECT
    N'R06_STATUS8_PAYMENT_GATE' AS CheckCode,
    S.StatusID,
    S.StatusName,
    S.OrderStatusID,
    S.StockStatusID,
    S.isReceiptStatus,
    CASE
        WHEN S.StatusID = 8 AND S.isReceiptStatus = 1
            THEN N'PAYMENT_LEDGER_RECONCILIATION_REQUIRED'
        ELSE N'STATUS8_DICTIONARY_MISMATCH'
    END AS PaymentEvidenceStatus,
    N'Status alone does not prove full or partial collected amount.' AS RequiredAction
FROM dbo.AR_InvoiceStatusTbl S WITH (NOLOCK)
WHERE S.StatusID = 8;

/* RESULT SET 7 - candidate payment-ledger tables/columns for the next query. */
SELECT
    N'R07_PAYMENT_SOURCE_DISCOVERY' AS CheckCode,
    SC.name AS SchemaName,
    T.name AS TableName,
    C.column_id,
    C.name AS ColumnName,
    TY.name AS DataType,
    C.max_length,
    C.is_nullable
FROM sys.tables T
JOIN sys.schemas SC ON SC.schema_id = T.schema_id
JOIN sys.columns C ON C.object_id = T.object_id
JOIN sys.types TY ON TY.user_type_id = C.user_type_id
WHERE
    (
        T.name LIKE '%Receipt%'
        OR T.name LIKE '%Payment%'
        OR T.name LIKE '%ThuTien%'
        OR T.name LIKE '%InvoiceAcc%'
    )
    AND
    (
        C.name LIKE '%Document%'
        OR C.name LIKE '%Invoice%'
        OR C.name LIKE '%Object%'
        OR C.name LIKE '%Amount%'
        OR C.name LIKE '%Total%'
        OR C.name LIKE '%Paid%'
        OR C.name LIKE '%Payment%'
        OR C.name LIKE '%Receipt%'
        OR C.name LIKE '%Status%'
        OR C.name LIKE '%Date%'
    )
ORDER BY SC.name, T.name, C.column_id;

/*
   RESULT SET 8 - product reconciliation using the same non-promotion rule as
   API_DoanhSo_AI. Product aggregation uses GROUP BY on ItemID, not DISTINCT.
*/
WITH PromotionMarker AS
(
    SELECT
        D.DocumentID,
        D.ItemID,
        MAX(CASE WHEN ISNULL(D.isKM, 0) = 0 THEN 1 ELSE 0 END) AS HasRegularSaleLine
    FROM dbo.AR_OrderDetailTbl D WITH (NOLOCK)
    GROUP BY D.DocumentID, D.ItemID
),
BaseRevenue AS
(
    SELECT
        V.StatusID,
        V.DocumentID,
        V.ItemID,
        ISNULL(V.TotalAmount, 0) AS TotalAmount,
        P.HasRegularSaleLine,
        CASE WHEN I.ItemID IS NULL THEN 0 ELSE 1 END AS HasItemMaster
    FROM dbo.AR_OrderAndReturnView V WITH (NOLOCK)
    LEFT JOIN PromotionMarker P
        ON V.StatusID <> 99
       AND V.DocumentID = P.DocumentID
       AND V.ItemID = P.ItemID
    LEFT JOIN dbo.CF_ItemTbl I WITH (NOLOCK)
        ON V.ItemID = I.ItemID
    WHERE V.StatusID IN (3, 6, 7, 8, 99)
),
ProductRevenue AS
(
    SELECT
        B.ItemID,
        SUM(CASE WHEN B.StatusID IN (3, 6, 7, 8, 99) THEN B.TotalAmount ELSE 0 END) AS FulfilledSales,
        SUM(CASE WHEN B.StatusID IN (8, 99) THEN B.TotalAmount ELSE 0 END) AS CollectedRevenueByStatus
    FROM BaseRevenue B
    WHERE B.HasItemMaster = 1
      AND (B.StatusID = 99 OR B.HasRegularSaleLine = 1)
    GROUP BY B.ItemID
),
OverallRevenue AS
(
    SELECT
        SUM(CASE WHEN B.StatusID IN (3, 6, 7, 8, 99) THEN B.TotalAmount ELSE 0 END) AS OverallFulfilledSales,
        SUM(CASE WHEN B.StatusID IN (8, 99) THEN B.TotalAmount ELSE 0 END) AS OverallCollectedRevenueByStatus,
        SUM(CASE WHEN B.HasItemMaster = 1 AND (B.StatusID = 99 OR B.HasRegularSaleLine = 1)
                 THEN B.TotalAmount ELSE 0 END) AS ProductEligibleFulfilledSales,
        SUM(CASE WHEN B.HasItemMaster = 1 AND (B.StatusID = 99 OR B.HasRegularSaleLine = 1)
                       AND B.StatusID IN (8, 99)
                 THEN B.TotalAmount ELSE 0 END) AS ProductEligibleCollectedRevenueByStatus
    FROM BaseRevenue B
),
ProductSum AS
(
    SELECT
        SUM(P.FulfilledSales) AS ProductAggregateFulfilledSales,
        SUM(P.CollectedRevenueByStatus) AS ProductAggregateCollectedRevenueByStatus
    FROM ProductRevenue P
)
SELECT
    N'R08_PRODUCT_RECONCILIATION' AS CheckCode,
    O.OverallFulfilledSales,
    O.ProductEligibleFulfilledSales,
    P.ProductAggregateFulfilledSales,
    O.OverallFulfilledSales - O.ProductEligibleFulfilledSales AS ProductExcludedValue,
    O.ProductEligibleFulfilledSales - P.ProductAggregateFulfilledSales AS ProductAggregationDifference,
    O.OverallCollectedRevenueByStatus,
    O.ProductEligibleCollectedRevenueByStatus,
    P.ProductAggregateCollectedRevenueByStatus,
    O.ProductEligibleCollectedRevenueByStatus - P.ProductAggregateCollectedRevenueByStatus AS ProductCollectedAggregationDifference,
    CASE
        WHEN O.ProductEligibleFulfilledSales - P.ProductAggregateFulfilledSales = 0
         AND O.ProductEligibleCollectedRevenueByStatus - P.ProductAggregateCollectedRevenueByStatus = 0
            THEN N'PASS_NO_PRODUCT_ROW_MULTIPLICATION'
        ELSE N'REVIEW_PRODUCT_AGGREGATION'
    END AS ProductAggregationStatus,
    CASE
        WHEN O.OverallFulfilledSales - O.ProductEligibleFulfilledSales = 0
            THEN N'PASS_PRODUCT_TOTAL_MATCHES_OVERALL'
        ELSE N'REVIEW_EXCLUDED_PROMOTION_OR_MISSING_ITEM'
    END AS ProductOverallStatus
FROM OverallRevenue O
CROSS JOIN ProductSum P;

/* RESULT SET 9 - reconciliation totals by branch/manager/employee/date scope. */
WITH ScopedRevenue AS
(
    SELECT
        V.BranchID,
        V.ManagerID,
        V.EmployeeID,
        CAST(V.DocumentDate AS DATE) AS RevenueDate,
        SUM(CASE WHEN V.StatusID IN (3, 6, 7, 8, 99) THEN ISNULL(V.TotalAmount, 0) ELSE 0 END) AS FulfilledSales,
        SUM(CASE WHEN V.StatusID IN (8, 99) THEN ISNULL(V.TotalAmount, 0) ELSE 0 END) AS CollectedRevenueByStatus
    FROM dbo.AR_OrderAndReturnView V WITH (NOLOCK)
    WHERE V.StatusID IN (3, 6, 7, 8, 99)
    GROUP BY V.BranchID, V.ManagerID, V.EmployeeID, CAST(V.DocumentDate AS DATE)
)
SELECT
    N'R09_SCOPE_FIXTURE' AS CheckCode,
    S.BranchID,
    S.ManagerID,
    S.EmployeeID,
    S.RevenueDate,
    S.FulfilledSales,
    S.CollectedRevenueByStatus
FROM ScopedRevenue S
ORDER BY S.RevenueDate DESC, S.BranchID, S.ManagerID, S.EmployeeID;
GO
