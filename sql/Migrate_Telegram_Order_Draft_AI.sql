/*
  TELEGRAM-ORDER-DRAFT-001
  Guided Telegram order capture. This surface can only create StatusID = -1 drafts.
  Final submission, approval and edits remain on the Medstand web application.
*/
SET ANSI_NULLS ON;
GO
SET QUOTED_IDENTIFIER ON;
GO

IF OBJECT_ID(N'dbo.AI_TelegramOrderDraftSession', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.AI_TelegramOrderDraftSession
    (
        DraftToken CHAR(32) NOT NULL,
        TelegramUserID VARCHAR(20) NOT NULL,
        UserName VARCHAR(50) NOT NULL,
        ObjectID VARCHAR(50) NOT NULL,
        ItemList NVARCHAR(MAX) NOT NULL,
        CreatedAtUtc DATETIME2(3) NOT NULL CONSTRAINT DF_AI_TelegramOrderDraftSession_Created DEFAULT SYSUTCDATETIME(),
        ExpiresAtUtc DATETIME2(3) NOT NULL,
        CancelledAtUtc DATETIME2(3) NULL,
        LastSaveAttemptUtc DATETIME2(3) NULL,
        CONSTRAINT PK_AI_TelegramOrderDraftSession PRIMARY KEY (DraftToken),
        CONSTRAINT CK_AI_TelegramOrderDraftSession_Token CHECK (DraftToken NOT LIKE '%[^0-9a-f]%'),
        CONSTRAINT CK_AI_TelegramOrderDraftSession_ItemList CHECK (ISJSON(ItemList) = 1)
    );

    CREATE INDEX IX_AI_TelegramOrderDraftSession_Owner
        ON dbo.AI_TelegramOrderDraftSession (TelegramUserID, UserName, ExpiresAtUtc);
END;
GO

CREATE OR ALTER PROCEDURE dbo.API_TelegramOrderDraft_Preview_AI
    @TelegramUserID VARCHAR(20),
    @Username VARCHAR(50),
    @ObjectID VARCHAR(50),
    @RequestedItemsJson NVARCHAR(MAX)
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;

    SET @TelegramUserID = LTRIM(RTRIM(COALESCE(@TelegramUserID, '')));
    SET @Username = LTRIM(RTRIM(COALESCE(@Username, '')));
    SET @ObjectID = LTRIM(RTRIM(COALESCE(@ObjectID, '')));

    IF NOT EXISTS
    (
        SELECT 1
        FROM dbo.AI_TelegramAccountLink L
        JOIN dbo.AI_TelegramPilotAllowedAccount A ON A.UserName = L.UserName AND A.IsEnabled = 1
        JOIN dbo.SY_User U ON U.UserName = L.UserName AND COALESCE(U.Disable, 0) = 0
        WHERE L.TelegramUserID = @TelegramUserID
          AND L.TelegramChatID = @TelegramUserID
          AND L.UserName = @Username
          AND L.IsActive = 1
    )
    BEGIN
        SELECT Code='AUTHORIZATION_REQUIRED', Msg=N'Tài khoản Telegram không còn được cấp quyền.', MsgType=1;
        RETURN;
    END;

    IF @ObjectID = '' OR NOT EXISTS
    (
        SELECT 1 FROM dbo.AR_GetObjectByUserFnc(@Username) WHERE ObjectID = @ObjectID
    )
    BEGIN
        SELECT Code='CUSTOMER_OUT_OF_SCOPE', Msg=N'Mã khách hàng không tồn tại hoặc không thuộc tuyến/phạm vi của bạn.', MsgType=1;
        RETURN;
    END;

    IF ISJSON(@RequestedItemsJson) <> 1
    BEGIN
        SELECT Code='INVALID_ITEMS', Msg=N'Danh sách sản phẩm không hợp lệ.', MsgType=1;
        RETURN;
    END;

    CREATE TABLE #Requested
    (
        ItemID VARCHAR(50) NOT NULL PRIMARY KEY,
        Quantity INT NOT NULL
    );

    BEGIN TRY
        INSERT #Requested (ItemID, Quantity)
        SELECT LTRIM(RTRIM(ItemID)), Quantity
        FROM OPENJSON(@RequestedItemsJson)
        WITH (ItemID VARCHAR(50) '$.ItemID', Quantity INT '$.Quantity');
    END TRY
    BEGIN CATCH
        SELECT Code='INVALID_ITEMS', Msg=N'Mỗi mã sản phẩm chỉ được nhập một lần.', MsgType=1;
        RETURN;
    END CATCH;

    IF NOT EXISTS (SELECT 1 FROM #Requested)
       OR (SELECT COUNT(*) FROM #Requested) > 10
       OR EXISTS (SELECT 1 FROM #Requested WHERE ItemID='' OR Quantity < 1 OR Quantity > 999)
    BEGIN
        SELECT Code='INVALID_ITEMS', Msg=N'Đơn nháp cần từ 1 đến 10 sản phẩm; số lượng mỗi sản phẩm từ 1 đến 999.', MsgType=1;
        RETURN;
    END;

    DECLARE @BranchID VARCHAR(50) = '';
    DECLARE @StockAsOfUtc DATETIME2(0) = SYSUTCDATETIME();
    SELECT @BranchID = COALESCE(BranchID, '') FROM dbo.SY_User WHERE UserName=@Username;

    CREATE TABLE #Items
    (
        ItemID VARCHAR(50) NOT NULL PRIMARY KEY,
        ItemName NVARCHAR(500) NOT NULL,
        Unit NVARCHAR(50) NULL,
        Quantity INT NOT NULL,
        UnitPrice DECIMAL(18,4) NOT NULL,
        PromotionNote NVARCHAR(MAX) NULL,
        AvailableStock DECIMAL(18,2) NOT NULL,
        ExpectedGiftQuantity DECIMAL(18,2) NOT NULL DEFAULT 0,
        ExpectedDiscountPercent DECIMAL(18,2) NOT NULL DEFAULT 0,
        HasConfigRule BIT NOT NULL DEFAULT 0
    );

    INSERT #Items (ItemID, ItemName, Unit, Quantity, UnitPrice, PromotionNote, AvailableStock)
    SELECT R.ItemID, I.ItemName, I.Unit, R.Quantity, P.UnitPrice, P.GhiChu, S.AvailableStock
    FROM #Requested R
    JOIN dbo.CF_ItemTbl I ON I.ItemID=R.ItemID
    OUTER APPLY
    (
        SELECT TOP (1) UnitPrice, GhiChu
        FROM dbo.AR_LayGiaSanPhamFnc(CAST(GETDATE() AS DATE), @ObjectID, R.ItemID)
    ) P
    OUTER APPLY
    (
        SELECT TOP (1) AvailableStock
        FROM dbo.AI_StockAvailableByUserFnc(@Username, R.ItemID, @StockAsOfUtc)
        WHERE AvailableStock > 0 AND StockDataStatus=N'AVAILABLE_FOR_SALE'
        ORDER BY AvailableStock DESC, StoreHouseID
    ) S
    WHERE P.UnitPrice IS NOT NULL
      AND S.AvailableStock IS NOT NULL
      AND EXISTS
      (
          SELECT 1
          FROM dbo.AI_BusinessRuleConfigTbl C
          CROSS APPLY STRING_SPLIT(C.ConfigValue, ',') V
          WHERE C.RuleCode='BR-STOCK-001'
            AND C.ConfigKey='SellableItemGroupIDs'
            AND LTRIM(RTRIM(V.value))=I.ItemGroupID
            AND C.Status='APPROVED'
      )
      AND CASE WHEN @BranchID='MB' THEN COALESCE(I.IsDisableMB,0)
               WHEN @BranchID='MN' THEN COALESCE(I.IsDisableMN,0)
               WHEN @BranchID='MT' THEN COALESCE(I.IsDisableMT,0)
               ELSE COALESCE(I.IsDisable,0) END=0;

    IF (SELECT COUNT(*) FROM #Items) <> (SELECT COUNT(*) FROM #Requested)
    BEGIN
        SELECT Code='PRODUCT_NOT_ORDERABLE', Msg=N'Có sản phẩm không bán được, không có giá hoặc không có tồn trong kho được cấp quyền.', MsgType=1;
        RETURN;
    END;

    IF OBJECT_ID(N'dbo.AI_ActivePromotionByUserFnc', N'IF') IS NOT NULL
    BEGIN
        UPDATE T SET HasConfigRule=1
        FROM #Items T
        WHERE EXISTS
        (
            SELECT 1 FROM dbo.AI_ActivePromotionByUserFnc(@Username,T.ItemID,@StockAsOfUtc) F
            WHERE F.RuleType IN ('QUANTITY_DISCOUNT','QUANTITY_GIFT','AMOUNT_DISCOUNT','AMOUNT_GIFT','INFORMATION')
        );

        ;WITH Candidate AS
        (
            SELECT T.ItemID, F.RuleType, F.MinimumQuantity, F.MaximumQuantity,
                   F.MinimumOrderAmount, F.MaximumOrderAmount, F.DiscountPercent,
                   F.GiftQuantity, F.Priority, F.PromotionItemRuleID,
                   ROW_NUMBER() OVER
                   (
                       PARTITION BY T.ItemID
                       ORDER BY F.Priority ASC,
                                COALESCE(F.MinimumOrderAmount,F.MinimumQuantity) DESC,
                                F.PromotionItemRuleID ASC
                   ) TierRank
            FROM #Items T
            CROSS APPLY dbo.AI_ActivePromotionByUserFnc(@Username,T.ItemID,@StockAsOfUtc) F
            WHERE (F.RuleType='QUANTITY_DISCOUNT' AND F.MinimumQuantity IS NOT NULL
                   AND T.Quantity>=F.MinimumQuantity
                   AND (F.MaximumQuantity IS NULL OR T.Quantity<=F.MaximumQuantity))
               OR (F.RuleType='QUANTITY_GIFT' AND F.MinimumQuantity>0 AND COALESCE(F.GiftQuantity,0)>0
                   AND FLOOR((CASE WHEN F.MaximumQuantity IS NOT NULL AND T.Quantity>F.MaximumQuantity
                                   THEN F.MaximumQuantity ELSE T.Quantity END)
                             * COALESCE(F.GiftQuantity,0)/NULLIF(F.MinimumQuantity,0))>=1)
               OR (F.RuleType IN ('AMOUNT_DISCOUNT','AMOUNT_GIFT') AND F.MinimumOrderAmount IS NOT NULL
                   AND T.Quantity*T.UnitPrice>=F.MinimumOrderAmount
                   AND (F.MaximumOrderAmount IS NULL OR T.Quantity*T.UnitPrice<=F.MaximumOrderAmount))
        )
        UPDATE T
        SET ExpectedGiftQuantity=CASE
                WHEN C.RuleType='QUANTITY_GIFT' THEN FLOOR((CASE WHEN C.MaximumQuantity IS NOT NULL AND T.Quantity>C.MaximumQuantity
                                                                THEN C.MaximumQuantity ELSE T.Quantity END)
                                                          * COALESCE(C.GiftQuantity,0)/NULLIF(C.MinimumQuantity,0))
                WHEN C.RuleType='AMOUNT_GIFT' THEN COALESCE(C.GiftQuantity,0) ELSE 0 END,
            ExpectedDiscountPercent=CASE WHEN C.RuleType IN ('QUANTITY_DISCOUNT','AMOUNT_DISCOUNT')
                                         THEN COALESCE(C.DiscountPercent,0) ELSE 0 END
        FROM #Items T JOIN Candidate C ON C.ItemID=T.ItemID AND C.TierRank=1;
    END;

    /* Legacy price-note promotions, kept in parity with API_DonHangChiTiet_Insert_AI. */
    DECLARE @PromoItemID VARCHAR(50), @PromoQuantity INT, @PromoNote NVARCHAR(MAX);
    DECLARE @PromoText NVARCHAR(MAX), @PromoUpper NVARCHAR(MAX), @Scan INT, @PlusPos INT;
    DECLARE @LeftPos INT, @LeftEnd INT, @RightPos INT, @RightEnd INT;
    DECLARE @BuyQty INT, @GiftQty INT, @BestBuyQty INT, @BestGiftQty INT;
    DECLARE @KhhdPos1 INT, @KhhdPos2 INT, @KhhdPos INT;
    DECLARE @LtPos INT, @ThresholdStart INT, @ThresholdEnd INT, @ThresholdQty INT;
    DECLARE @CkPos INT, @CkLength INT, @PercentPos INT, @DiscountText NVARCHAR(100), @ExpectedDiscount DECIMAL(18,2);

    DECLARE PromotionCursor CURSOR LOCAL FAST_FORWARD FOR
        SELECT ItemID, Quantity, COALESCE(PromotionNote,N'') FROM #Items WHERE HasConfigRule=0;
    OPEN PromotionCursor;
    FETCH NEXT FROM PromotionCursor INTO @PromoItemID,@PromoQuantity,@PromoNote;
    WHILE @@FETCH_STATUS=0
    BEGIN
        SET @PromoText=LTRIM(RTRIM(COALESCE(@PromoNote,N'')));
        SET @PromoUpper=UPPER(@PromoText);
        SET @KhhdPos1=CHARINDEX(N'KHHĐ',@PromoUpper);
        SET @KhhdPos2=CHARINDEX(N'KHHD',@PromoUpper);
        SET @KhhdPos=CASE WHEN @KhhdPos1>0 AND @KhhdPos2>0 THEN IIF(@KhhdPos1<@KhhdPos2,@KhhdPos1,@KhhdPos2)
                          WHEN @KhhdPos1>0 THEN @KhhdPos1 ELSE @KhhdPos2 END;
        IF @KhhdPos>0 SET @PromoText=LEFT(@PromoText,@KhhdPos-1);
        SET @PromoUpper=UPPER(@PromoText);
        SET @BestBuyQty=0; SET @BestGiftQty=0;

        IF @PromoUpper NOT LIKE N'%NGUYÊN GIÁ%'
        BEGIN
            SET @Scan=1; SET @PlusPos=CHARINDEX('+',@PromoText,@Scan);
            WHILE @PlusPos>0
            BEGIN
                SET @LeftPos=@PlusPos-1;
                WHILE @LeftPos>0 AND SUBSTRING(@PromoText,@LeftPos,1)=' ' SET @LeftPos-=1;
                SET @LeftEnd=@LeftPos;
                WHILE @LeftPos>0 AND SUBSTRING(@PromoText,@LeftPos,1) LIKE '[0-9]' SET @LeftPos-=1;
                SET @LeftPos+=1;
                SET @RightPos=@PlusPos+1;
                WHILE @RightPos<=LEN(@PromoText) AND SUBSTRING(@PromoText,@RightPos,1)=' ' SET @RightPos+=1;
                SET @RightEnd=@RightPos;
                WHILE @RightEnd<=LEN(@PromoText) AND SUBSTRING(@PromoText,@RightEnd,1) LIKE '[0-9]' SET @RightEnd+=1;
                SET @BuyQty=TRY_CONVERT(INT,SUBSTRING(@PromoText,@LeftPos,@LeftEnd-@LeftPos+1));
                SET @GiftQty=TRY_CONVERT(INT,SUBSTRING(@PromoText,@RightPos,@RightEnd-@RightPos));
                IF COALESCE(@BuyQty,0)>0 AND COALESCE(@GiftQty,0)>0 AND @PromoQuantity>=@BuyQty AND @BuyQty>@BestBuyQty
                BEGIN SET @BestBuyQty=@BuyQty; SET @BestGiftQty=@GiftQty; END;
                SET @Scan=@PlusPos+1; SET @PlusPos=CHARINDEX('+',@PromoText,@Scan);
            END;
        END;

        IF @BestBuyQty>0
            UPDATE #Items SET ExpectedGiftQuantity=FLOOR(@PromoQuantity*1.0/@BestBuyQty)*@BestGiftQty,
                              ExpectedDiscountPercent=0 WHERE ItemID=@PromoItemID;
        ELSE IF @PromoUpper NOT LIKE N'%NGUYÊN GIÁ%'
        BEGIN
            SET @LtPos=CHARINDEX('<',@PromoText); SET @ThresholdQty=NULL; SET @ExpectedDiscount=NULL;
            IF @LtPos>0
            BEGIN
                SET @ThresholdStart=@LtPos+1;
                WHILE @ThresholdStart<=LEN(@PromoText) AND SUBSTRING(@PromoText,@ThresholdStart,1)=' ' SET @ThresholdStart+=1;
                SET @ThresholdEnd=@ThresholdStart;
                WHILE @ThresholdEnd<=LEN(@PromoText) AND SUBSTRING(@PromoText,@ThresholdEnd,1) LIKE '[0-9]' SET @ThresholdEnd+=1;
                SET @ThresholdQty=TRY_CONVERT(INT,SUBSTRING(@PromoText,@ThresholdStart,@ThresholdEnd-@ThresholdStart));
                SET @CkPos=CHARINDEX('CK',@PromoUpper,@ThresholdEnd); SET @CkLength=2;
                IF @CkPos=0 BEGIN SET @CkPos=CHARINDEX(N'CHIẾT KHẤU',@PromoUpper,@ThresholdEnd); SET @CkLength=LEN(N'CHIẾT KHẤU'); END;
                SET @PercentPos=CASE WHEN @CkPos>0 THEN CHARINDEX('%',@PromoText,@CkPos+@CkLength) ELSE 0 END;
                IF @CkPos>0 AND @PercentPos>@CkPos
                BEGIN
                    SET @DiscountText=SUBSTRING(@PromoText,@CkPos+@CkLength,@PercentPos-@CkPos-@CkLength);
                    SET @DiscountText=REPLACE(REPLACE(REPLACE(REPLACE(UPPER(@DiscountText),N'BẰNG',''),'=',''),' ',''),',','.');
                    SET @ExpectedDiscount=TRY_CONVERT(DECIMAL(18,2),@DiscountText);
                END;
            END;
            IF COALESCE(@ThresholdQty,0)>0 AND @PromoQuantity<@ThresholdQty AND @ExpectedDiscount IS NOT NULL
                UPDATE #Items SET ExpectedDiscountPercent=@ExpectedDiscount WHERE ItemID=@PromoItemID;
        END;
        FETCH NEXT FROM PromotionCursor INTO @PromoItemID,@PromoQuantity,@PromoNote;
    END;
    CLOSE PromotionCursor; DEALLOCATE PromotionCursor;

    IF EXISTS (SELECT 1 FROM #Items WHERE Quantity+ExpectedGiftQuantity>AvailableStock)
    BEGIN
        SELECT Code='INSUFFICIENT_STOCK', Msg=N'Số lượng đặt và hàng tặng vượt tồn có thể bán.', MsgType=1;
        RETURN;
    END;

    DECLARE @ItemList NVARCHAR(MAX) =
    (
        SELECT ItemID, Quantity, ExpectedGiftQuantity AS SoLuongTang,
               UnitPrice, ExpectedDiscountPercent AS DiscountPercent
        FROM #Items ORDER BY ItemID FOR JSON PATH
    );
    DECLARE @DraftToken CHAR(32)=LOWER(CONVERT(CHAR(32),CRYPT_GEN_RANDOM(16),2));

    BEGIN TRANSACTION;
    DELETE TOP (500) dbo.AI_TelegramOrderDraftSession
      WHERE ExpiresAtUtc<DATEADD(DAY,-1,SYSUTCDATETIME());
    INSERT dbo.AI_TelegramOrderDraftSession
        (DraftToken,TelegramUserID,UserName,ObjectID,ItemList,ExpiresAtUtc)
    VALUES
        (@DraftToken,@TelegramUserID,@Username,@ObjectID,@ItemList,DATEADD(MINUTE,15,SYSUTCDATETIME()));
    COMMIT TRANSACTION;

    SELECT Code='PREVIEW_READY', Msg=N'Bản xem trước đã sẵn sàng.', MsgType=0,
           DraftToken=@DraftToken, O.ObjectID, O.ObjectName,
           T.ItemID, T.ItemName, T.Unit, T.Quantity, T.UnitPrice,
           T.ExpectedGiftQuantity AS GiftQuantity,
           T.ExpectedDiscountPercent AS DiscountPercent,
           CAST(ROUND(T.Quantity*T.UnitPrice*(1-T.ExpectedDiscountPercent/100.0),0) AS DECIMAL(18,0)) AS LineTotal,
           T.AvailableStock, ExpiresInMinutes=15
    FROM #Items T CROSS JOIN dbo.CF_ObjectTbl O
    WHERE O.ObjectID=@ObjectID
    ORDER BY T.ItemID;
END;
GO

CREATE OR ALTER PROCEDURE dbo.API_TelegramOrderDraft_Save_AI
    @TelegramUserID VARCHAR(20),
    @Username VARCHAR(50),
    @DraftToken CHAR(32),
    @RequestID VARCHAR(100)
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;
    SET @DraftToken=LOWER(LTRIM(RTRIM(COALESCE(@DraftToken,''))));

    IF LEN(@DraftToken)<>32 OR @DraftToken LIKE '%[^0-9a-f]%'
    BEGIN SELECT NULL DocumentID,N'Mã xác nhận đơn nháp không hợp lệ.' Msg,1 MsgType,@RequestID RequestID,'INVALID_DRAFT_TOKEN' Code; RETURN; END;

    IF NOT EXISTS
    (
        SELECT 1 FROM dbo.AI_TelegramAccountLink L
        JOIN dbo.AI_TelegramPilotAllowedAccount A ON A.UserName=L.UserName AND A.IsEnabled=1
        JOIN dbo.SY_User U ON U.UserName=L.UserName AND COALESCE(U.Disable,0)=0
        WHERE L.TelegramUserID=@TelegramUserID AND L.TelegramChatID=@TelegramUserID
          AND L.UserName=@Username AND L.IsActive=1
    )
    BEGIN SELECT NULL DocumentID,N'Tài khoản Telegram không còn được cấp quyền.' Msg,1 MsgType,@RequestID RequestID,'AUTHORIZATION_REQUIRED' Code; RETURN; END;

    DECLARE @ObjectID VARCHAR(50), @ItemList NVARCHAR(MAX);
    SELECT @ObjectID=ObjectID,@ItemList=ItemList
    FROM dbo.AI_TelegramOrderDraftSession
    WHERE DraftToken=@DraftToken AND TelegramUserID=@TelegramUserID AND UserName=@Username
      AND CancelledAtUtc IS NULL AND ExpiresAtUtc>SYSUTCDATETIME();

    IF COALESCE(@ObjectID,'')=''
    BEGIN SELECT NULL DocumentID,N'Bản xem trước đã hết hạn, đã hủy hoặc không thuộc tài khoản này.' Msg,1 MsgType,@RequestID RequestID,'DRAFT_NOT_AVAILABLE' Code; RETURN; END;

    UPDATE dbo.AI_TelegramOrderDraftSession SET LastSaveAttemptUtc=SYSUTCDATETIME()
    WHERE DraftToken=@DraftToken AND TelegramUserID=@TelegramUserID AND UserName=@Username;

    DECLARE @IdempotencyKey VARCHAR(128)='tg-draft-' + @DraftToken;
    EXEC dbo.API_DonHangChiTiet_Insert_AI
        @Username=@Username,
        @DocumentID='AUTO_GEN',
        @DocumentDate=NULL,
        @BranchID='',
        @ObjectID=@ObjectID,
        @Memo=N'Tạo từ Telegram - chỉ lưu nháp',
        @Notes=N'Kênh Telegram demo',
        @XaPhuong='',
        @ThuDiTuyen='',
        @ItemList=@ItemList,
        @IdempotencyKey=@IdempotencyKey,
        @RequestID=@RequestID,
        @SaveAsDraft=1;
END;
GO

CREATE OR ALTER PROCEDURE dbo.API_TelegramOrderDraft_Cancel_AI
    @TelegramUserID VARCHAR(20),
    @Username VARCHAR(50),
    @DraftToken CHAR(32)
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;
    SET @DraftToken=LOWER(LTRIM(RTRIM(COALESCE(@DraftToken,''))));

    DECLARE @IdempotencyKey VARCHAR(128)='tg-draft-' + @DraftToken;
    DECLARE @KeyHash CHAR(64)=LOWER(CONVERT(CHAR(64),HASHBYTES('SHA2_256',CONVERT(VARBINARY(MAX),@IdempotencyKey)),2));
    DECLARE @UserHash CHAR(64)=LOWER(CONVERT(CHAR(64),HASHBYTES('SHA2_256',CONVERT(VARBINARY(MAX),LOWER(@Username))),2));
    DECLARE @ExistingDocumentID VARCHAR(100);
    SELECT @ExistingDocumentID=ResultEntityID FROM dbo.AI_API_MutationIdempotency
    WHERE IdempotencyKeyHash=@KeyHash AND VerifiedUserHash=@UserHash
      AND ApiCode='API_DonHangChiTiet_Insert_AI' AND Status='COMPLETED';

    IF COALESCE(@ExistingDocumentID,'')<>''
    BEGIN SELECT Code='ALREADY_SAVED',Msg=N'Đơn này đã được lưu nháp trước đó.',MsgType=0,DocumentID=@ExistingDocumentID; RETURN; END;

    UPDATE dbo.AI_TelegramOrderDraftSession SET CancelledAtUtc=SYSUTCDATETIME()
    WHERE DraftToken=@DraftToken AND TelegramUserID=@TelegramUserID AND UserName=@Username
      AND CancelledAtUtc IS NULL AND ExpiresAtUtc>SYSUTCDATETIME();

    IF @@ROWCOUNT=0
        SELECT Code='DRAFT_NOT_AVAILABLE',Msg=N'Bản xem trước đã hết hạn, đã hủy hoặc không thuộc tài khoản này.',MsgType=1;
    ELSE
        SELECT Code='DRAFT_CANCELLED',Msg=N'Đã hủy bản xem trước. Không có đơn hàng nào được tạo.',MsgType=0;
END;
GO

DENY SELECT,INSERT,UPDATE,DELETE ON dbo.AI_TelegramOrderDraftSession TO public;

SELECT Migration='TELEGRAM-ORDER-DRAFT-001', Status='READY';
GO
