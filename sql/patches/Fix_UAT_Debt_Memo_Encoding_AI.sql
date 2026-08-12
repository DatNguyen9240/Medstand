/*
  Fix mojibake in the six opening-debt UAT fixture memos.
  Scope: medtest only; no amount, customer, ownership or production data changes.
  Save/import this file as UTF-8 and execute through a Unicode-capable driver.
*/
SET NOCOUNT ON;
SET XACT_ABORT ON;

IF DB_NAME() NOT LIKE '%medtest%'
    THROW 51280, N'Refusing to update UAT fixture outside medtest.', 1;

BEGIN TRY
    BEGIN TRANSACTION;

    IF (
        SELECT COUNT(*)
        FROM dbo.SY_BalanceObjectTbl
        WHERE DocumentID IN (
            'DK_UAT_HPA515', 'DK_UAT_BNB161', 'DK_UAT_HUEB111',
            'DK_UAT_QANA371', 'DK_UAT_DL012', 'DK_UAT_SGNB0018'
        )
    ) <> 6
        THROW 51281, N'Expected exactly six UAT opening-debt fixtures.', 1;

    UPDATE balance
    SET Memo = expected.Memo
    FROM dbo.SY_BalanceObjectTbl AS balance
    JOIN (VALUES
        ('DK_UAT_HPA515',  N'Số dư nợ đầu kỳ UAT - TDV Nam Định B'),
        ('DK_UAT_BNB161',  N'Số dư nợ đầu kỳ UAT - TDV Bắc Ninh A'),
        ('DK_UAT_HUEB111', N'Số dư nợ đầu kỳ UAT - TDV Huế B'),
        ('DK_UAT_QANA371', N'Số dư nợ đầu kỳ UAT - TDV Đà Nẵng A'),
        ('DK_UAT_DL012',   N'Số dư nợ đầu kỳ UAT - TDV Cần Thơ A'),
        ('DK_UAT_SGNB0018',N'Số dư nợ đầu kỳ UAT - TDV Bình Phước A')
    ) AS expected(DocumentID, Memo)
      ON expected.DocumentID = balance.DocumentID;

    IF EXISTS (
        SELECT 1
        FROM dbo.SY_BalanceObjectTbl
        WHERE DocumentID IN (
            'DK_UAT_HPA515', 'DK_UAT_BNB161', 'DK_UAT_HUEB111',
            'DK_UAT_QANA371', 'DK_UAT_DL012', 'DK_UAT_SGNB0018'
        )
          AND Memo LIKE N'%»%'
    )
        THROW 51282, N'UAT fixture memo still contains mojibake markers.', 1;

    COMMIT TRANSACTION;

    SELECT DocumentID, ObjectID, Memo
    FROM dbo.SY_BalanceObjectTbl
    WHERE DocumentID IN (
        'DK_UAT_HPA515', 'DK_UAT_BNB161', 'DK_UAT_HUEB111',
        'DK_UAT_QANA371', 'DK_UAT_DL012', 'DK_UAT_SGNB0018'
    )
    ORDER BY DocumentID;
END TRY
BEGIN CATCH
    IF @@TRANCOUNT > 0 ROLLBACK TRANSACTION;
    THROW;
END CATCH;
