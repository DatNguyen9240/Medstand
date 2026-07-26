CREATE OR ALTER PROCEDURE [dbo].[API_CongNoChiTiet_AI]
   @MaKhachHang  NVARCHAR(100),
   @Username   VARCHAR(50),
   @DenNgay     DATETIME = NULL
AS
BEGIN
   SET NOCOUNT ON
    
    DECLARE @SYS_BranchID   VARCHAR(50) = ''
    DECLARE @SYSUserGroupID VARCHAR(50) = ''

    SELECT 
        @SYS_BranchID   = COALESCE(BranchID, ''),
        @SYSUserGroupID = COALESCE(UserGroupID, '')
    FROM dbo.SY_User WITH (NOLOCK)
    WHERE UserName = @Username AND COALESCE(Disable, 0) = 0
   IF @DenNgay IS NULL SET @DenNgay = GETDATE()
   ELSE SET @DenNgay = DATEADD(SECOND, -1, DATEADD(DAY, 1, CAST(CAST(@DenNgay AS DATE) AS DATETIME)))
   -- CLEAN AI EXTRACTED BRACKETS
   IF @MaKhachHang LIKE '%\[%\]%' ESCAPE '\'
   BEGIN
       SET @MaKhachHang = SUBSTRING(@MaKhachHang, CHARINDEX('[', @MaKhachHang) + 1, CHARINDEX(']', @MaKhachHang) - CHARINDEX('[', @MaKhachHang) - 1)
   END

    -- SMART CUSTOMER RESOLUTION (NAME TO ID)
     IF @MaKhachHang <> '' AND NOT EXISTS (SELECT 1 FROM dbo.CF_ObjectTbl WHERE ObjectID = @MaKhachHang)
     BEGIN
         DECLARE @ResolvedID VARCHAR(50) = ''
         DECLARE @CleanSearch NVARCHAR(100) = dbo.ufn_clean_customer_name(@MaKhachHang)

         -- 1. Fast Path: Match by ObjectID or ObjectName directly without scalar function scan
         SELECT TOP 1 @ResolvedID = ObjectID 
         FROM dbo.CF_ObjectTbl 
         WHERE (ObjectID LIKE '%' + @CleanSearch + '%'
            OR ObjectName LIKE '%' + @CleanSearch + '%') AND (@SYS_BranchID = '' OR BranchID = @SYS_BranchID)
         ORDER BY 
             CASE WHEN ObjectID = @CleanSearch THEN 1
                  WHEN ObjectName = @CleanSearch THEN 2
                  WHEN ObjectName LIKE @CleanSearch + '%' THEN 3
                  ELSE 4
             END,
             COALESCE((SELECT MAX(DocumentDate) FROM AR_InvoiceTbl WHERE ObjectID = CF_ObjectTbl.ObjectID), '1900-01-01') DESC,
             LEN(ObjectName) ASC;

         -- 2. Slow Path: Fallback to heavy clean function scan only if Fast Path found nothing
         IF @ResolvedID = ''
         BEGIN
             SELECT TOP 1 @ResolvedID = ObjectID 
             FROM dbo.CF_ObjectTbl 
             WHERE (dbo.ufn_clean_customer_name(ObjectName) LIKE '%' + @CleanSearch + '%'
                OR ObjectID LIKE '%' + @CleanSearch + '%') AND (@SYS_BranchID = '' OR BranchID = @SYS_BranchID)
             ORDER BY 
                 CASE WHEN ObjectID = @CleanSearch THEN 1
                      WHEN dbo.ufn_clean_customer_name(ObjectName) = @CleanSearch THEN 2
                      WHEN dbo.ufn_clean_customer_name(ObjectName) LIKE @CleanSearch + '%' THEN 3
                      ELSE 4
                 END,
                 COALESCE((SELECT MAX(DocumentDate) FROM AR_InvoiceTbl WHERE ObjectID = CF_ObjectTbl.ObjectID), '1900-01-01') DESC,
                 LEN(ObjectName) ASC;
         END

         IF @ResolvedID <> ''
         BEGIN
             SET @MaKhachHang = @ResolvedID
         END
     END

    IF @MaKhachHang = ''
    BEGIN
        SELECT N'Vui lòng cung cấp mã khách hàng để xem chi tiết.' AS [Msg], 1 AS [MsgType]
        RETURN
    END

    IF NOT EXISTS (
        SELECT 1
        FROM dbo.CF_ObjectTbl WITH (NOLOCK)
        WHERE ObjectID = @MaKhachHang
          AND ISNULL(isCustomer, 0) = 1
          AND ISNULL(isDisable, 0) = 0
    )
    BEGIN
        SELECT N'Mã khách hàng không hợp lệ hoặc không tồn tại.' AS [Msg], 1 AS [MsgType]
        RETURN
    END
     

     IF UPPER(@SYSUserGroupID) <> 'ADMIN'
     BEGIN
         -- Đảm bảo khách hàng thuộc chi nhánh và có trong danh sách phân quyền của user
         IF NOT EXISTS (
             SELECT 1 FROM dbo.CF_ObjectTbl O WITH (NOLOCK)
             WHERE O.ObjectID = @MaKhachHang
               AND (ISNULL(@SYS_BranchID, '') = '' OR O.BranchID = @SYS_BranchID)
               AND EXISTS
               (
                   SELECT 1
                   FROM AR_GetObjectByUserFnc(@Username) P
                   WHERE P.ObjectID = O.ObjectID
               )
         )
         BEGIN
             SELECT N'Bạn không có quyền xem công nợ khách hàng này.' AS [Msg], 1 AS [MsgType]
             RETURN
         END
     END
    SELECT TOP 20
        N'CUSTOMER' AS [ObjectType],
        @MaKhachHang AS [CustomerID],
        O.ObjectName AS [CustomerName],
        O.Phone AS [Phone],
        @DenNgay AS [AsOfDate],
        I.DocumentID AS [MaHD],
        COALESCE(
            X.CleanDocumentID,
            CASE WHEN U.CandidateCount = 1 THEN U.DocumentID END
        ) AS [MaChungTu],
        CONVERT(CHAR(10), COALESCE(I.DocumentDate, E.DocumentDate, U.DocumentDate, A.DocumentDate), 103) AS [Ngay],
        I.DocumentDate AS [NgayHoaDon],
        COALESCE(I.DocumentDate, E.DocumentDate, U.DocumentDate, A.DocumentDate) AS [NgayKhoanCongNo],
        I.DueDate AS [NgayDenHan],
        I.DocumentID AS [InvoiceID],
        I.DocumentID AS [InvoiceNumber],
        I.DocumentDate AS [InvoiceDate],
        COALESCE(I.DocumentDate, E.DocumentDate, U.DocumentDate, A.DocumentDate) AS [DebtDate],
        I.DueDate AS [DueDate],
        CASE
            WHEN I.DocumentID IS NOT NULL THEN 'INVOICE'
            WHEN UPPER(ISNULL(A.SourceID, '')) = 'BL' THEN 'OPENING_BALANCE'
            ELSE 'OTHER_RECEIVABLE'
        END AS [LoaiKhoanCongNo],
        CASE
            WHEN I.DocumentID IS NOT NULL THEN 'INVOICE'
            WHEN UPPER(ISNULL(A.SourceID, '')) = 'BL' THEN 'OPENING_BALANCE'
            ELSE 'OTHER_RECEIVABLE'
        END AS [DocumentType],
        CASE
            WHEN I.DocumentID IS NOT NULL THEN 'EXACT_INVOICE_MATCH'
            WHEN X.CleanDocumentID IS NOT NULL THEN 'NON_INVOICE_DOCUMENT'
            WHEN U.CandidateCount = 1 THEN 'UNIQUE_RAW_SOURCE_MATCH'
            ELSE 'UNRESOLVED_DOCUMENT'
        END AS [DocumentMatchStatus],
        A.DebitAmount AS [GiaTriBanDau],
        A.CreditAmount AS [DaThanhToanTra],
        (A.DebitAmount - A.CreditAmount) AS [SoTien],
        A.DebitAmount AS [DebitAmount],
        A.CreditAmount AS [CreditAmount],
        (A.DebitAmount - A.CreditAmount) AS [RemainingAmount],
        CASE
            WHEN (A.DebitAmount - A.CreditAmount) <= 0 THEN N'Đã thanh toán'
            WHEN A.CreditAmount > 0 THEN N'Thanh toán một phần'
            ELSE N'Chưa thanh toán'
        END AS [TrangThaiThanhToan],
        CASE
            WHEN (A.DebitAmount - A.CreditAmount) <= 0 THEN 'PAID'
            WHEN A.CreditAmount > 0 THEN 'PARTIALLY_PAID'
            ELSE 'UNPAID'
        END AS [CollectionStatus],
        CASE
            WHEN (A.DebitAmount - A.CreditAmount) <= 0 THEN N'Đã thanh toán'
            WHEN I.DueDate IS NULL THEN N'Chưa xác định hạn'
            WHEN CAST(I.DueDate AS DATE) < CAST(@DenNgay AS DATE) THEN N'Đã quá hạn'
            ELSE N'Chưa đến hạn'
        END AS [TrangThaiCongNo],
        CASE
            WHEN (A.DebitAmount - A.CreditAmount) <= 0 THEN 'PAID'
            WHEN I.DueDate IS NULL THEN 'DUE_DATE_UNKNOWN'
            WHEN CAST(I.DueDate AS DATE) < CAST(@DenNgay AS DATE) THEN 'OVERDUE'
            ELSE 'NOT_DUE'
        END AS [PaymentStatus],
        CASE
            WHEN (A.DebitAmount - A.CreditAmount) > 0
             AND I.DueDate IS NOT NULL
             AND CAST(I.DueDate AS DATE) < CAST(@DenNgay AS DATE)
                THEN DATEDIFF(DAY, CAST(I.DueDate AS DATE), CAST(@DenNgay AS DATE))
            ELSE 0
        END AS [SoNgayQuaHan],
        CASE
            WHEN (A.DebitAmount - A.CreditAmount) > 0
             AND I.DueDate IS NOT NULL
             AND CAST(I.DueDate AS DATE) < CAST(@DenNgay AS DATE)
                THEN DATEDIFF(DAY, CAST(I.DueDate AS DATE), CAST(@DenNgay AS DATE))
            ELSE 0
        END AS [OverdueDays],
        A.Memo AS [DienGiai],
        A.Memo AS [Description],
        SUM(CASE WHEN I.DocumentID IS NOT NULL THEN 1 ELSE 0 END) OVER() AS [TongSoHoaDon],
        COUNT(*) OVER() AS [TongSoKhoanCongNo],
        SUM(A.DebitAmount) OVER() AS [TongGiaTriBanDau],
        SUM(A.CreditAmount) OVER() AS [TongDaThanhToanTra],
        SUM(A.DebitAmount - A.CreditAmount) OVER() AS [TongTienNoThucTe],
        SUM(CASE WHEN I.DocumentID IS NOT NULL THEN 1 ELSE 0 END) OVER() AS [InvoiceCount],
        COUNT(*) OVER() AS [DebtItemCount],
        SUM(A.DebitAmount) OVER() AS [TotalDebitAmount],
        SUM(A.CreditAmount) OVER() AS [TotalCreditAmount],
        SUM(A.DebitAmount - A.CreditAmount) OVER() AS [TotalOutstanding],
        N'SY_GetDebitDocFnc' AS [DataSource],
        @DenNgay AS [NgayChot],
        @MaKhachHang AS [ObjectID],
        O.ObjectName AS [TenKH],
        O.Phone AS [SoDienThoai]
    FROM SY_GetDebitDocFnc(@DenNgay, @MaKhachHang, '131', '') A
    CROSS APPLY
    (
        VALUES
        (
            NULLIF(LTRIM(RTRIM(A.DocumentID)), ''),
            ISNULL(A.DebitAmount - A.CreditAmount, 0)
        )
    ) X (CleanDocumentID, RemainingAmount)
    -- Fast path: a debt row that already has a document ID only needs one
    -- indexed invoice lookup. The previous implementation searched the
    -- vCongNoBanHang UNION view here, forcing a scan of the full accounting
    -- ledger even when the debt row already had its document ID.
    OUTER APPLY
    (
        SELECT TOP 1
            I2.DocumentID,
            I2.DocumentDate
        FROM dbo.AR_InvoiceTbl I2 WITH (NOLOCK)
        WHERE I2.ObjectID = A.ObjectID
          AND X.CleanDocumentID IS NOT NULL
          AND I2.DocumentID = X.CleanDocumentID
          AND I2.DocumentDate <= @DenNgay
        ORDER BY I2.DocumentDate DESC
    ) E
    -- Slow fallback is only evaluated for legacy debt rows without a document ID.
    OUTER APPLY
    (
        SELECT
            MIN(V.DocumentID) AS DocumentID,
            MIN(V.DocumentDate) AS DocumentDate,
            COUNT_BIG(*) AS CandidateCount
        FROM dbo.vCongNoBanHang V
        WHERE V.ObjectID = A.ObjectID
          AND V.AccountID = A.AccountID
          AND V.DocumentDate <= @DenNgay
          AND X.CleanDocumentID IS NULL
          -- Only invoice-tracked accounts can resolve a legacy debt row to an
          -- invoice. Opening/other-receivable rows otherwise trigger an
          -- unnecessary scan of vCongNoBanHang for every row.
          AND EXISTS
          (
              SELECT 1
              FROM dbo.CF_ChartAccTbl C WITH (NOLOCK)
              WHERE C.AccountID = A.AccountID
                AND ISNULL(C.IsInvoice, 0) = 1
          )
          AND ISNULL(V.Amount, 0) > X.RemainingAmount - 0.01
          AND ISNULL(V.Amount, 0) < X.RemainingAmount + 0.01
    ) U
    LEFT JOIN dbo.AR_InvoiceTbl I WITH (NOLOCK)
        ON I.DocumentID = COALESCE(
            X.CleanDocumentID,
            CASE WHEN U.CandidateCount = 1 THEN U.DocumentID END
        )
       AND I.ObjectID = A.ObjectID
    LEFT JOIN dbo.CF_ObjectTbl O WITH (NOLOCK)
        ON O.ObjectID = A.ObjectID
    WHERE (A.DebitAmount - A.CreditAmount) <> 0
    ORDER BY COALESCE(I.DocumentDate, E.DocumentDate, U.DocumentDate, A.DocumentDate) DESC
END


