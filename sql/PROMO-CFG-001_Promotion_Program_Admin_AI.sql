SET ANSI_NULLS ON;
GO
SET QUOTED_IDENTIFIER ON;
GO

/*
  PROMO-CFG-001 — API quản lý CTBH (CRUD + duyệt) cho schema PROMO-001/002 đã có sẵn
  (dbo.AI_PromotionProgramTbl / dbo.AI_PromotionItemRuleTbl). Schema đó đã DONE và đã
  có version/hiệu lực/trạng thái duyệt; các proc dưới đây chỉ mở lối CRUD + duyệt cho
  quản lý, KHÔNG đụng tới luồng lập đơn/tính tiền đang chạy bằng ghi chú sản phẩm.

  Quyền: chỉ cấp quản lý trở lên, theo đúng pattern đã dùng ở
  API_SanPhamTrongTam_Import_AI / API_DeXuatKhuyenMai_AI.
*/

-- ═══════════════════════════════════════════════════════════════════════
-- API_PromotionProgram_List_AI — liệt kê chương trình (bản mới nhất mỗi mã)
-- ═══════════════════════════════════════════════════════════════════════
CREATE OR ALTER PROCEDURE dbo.API_PromotionProgram_List_AI
    @Username    VARCHAR(50) = '',
    @Status      VARCHAR(20) = '',   -- '' = tất cả trạng thái
    @SearchText  NVARCHAR(100) = ''
AS
BEGIN
    SET NOCOUNT ON;

    DECLARE @CanView BIT = 0, @ViewScope VARCHAR(20) = 'OWN_BRANCH', @ActorBranchID VARCHAR(50) = '';
    SELECT @CanView = IsAllowed, @ViewScope = ScopeMode, @ActorBranchID = COALESCE(ActorBranchID, '')
    FROM dbo.AI_PromotionPermissionFnc(@Username, 'VIEW');
    IF @CanView = 0
    BEGIN
        SELECT N'Tài khoản không có quyền xem cấu hình CTKM.' AS Msg, 1 AS MsgType;
        RETURN;
    END

    ;WITH Latest AS (
        SELECT P.*,
               ROW_NUMBER() OVER (PARTITION BY P.PromotionCode ORDER BY P.ProgramVersion DESC) AS VersionRank
        FROM dbo.AI_PromotionProgramTbl P
    )
    SELECT
        L.PromotionProgramID, L.PromotionCode, L.ProgramVersion, L.PromotionName, L.ProgramType,
        L.Description, L.EffectiveFrom, L.EffectiveTo, L.BranchScopeMode, L.UserGroupScopeMode,
        L.Priority, L.Status, L.SourceDocument, L.CreatedBy, L.CreatedAt, L.ApprovedBy, L.ApprovedAt, L.UpdatedAt,
        (SELECT COUNT(*) FROM dbo.AI_PromotionItemRuleTbl R WHERE R.PromotionProgramID = L.PromotionProgramID) AS RuleCount
    FROM Latest L
    WHERE L.VersionRank = 1
      AND (ISNULL(@Status, '') = '' OR L.Status = @Status)
      AND (
          ISNULL(@SearchText, '') = ''
          OR L.PromotionCode LIKE '%' + @SearchText + '%'
          OR L.PromotionName LIKE '%' + @SearchText + '%'
      )
      AND
      (
          @ViewScope = 'ALL'
          OR L.BranchScopeMode = 'ALL'
          OR EXISTS (SELECT 1 FROM dbo.AI_PromotionBranchScopeTbl B WHERE B.PromotionProgramID=L.PromotionProgramID AND B.BranchID=@ActorBranchID)
      )
    ORDER BY L.UpdatedAt DESC;
END
GO

-- ═══════════════════════════════════════════════════════════════════════
-- API_PromotionProgram_Detail_AI — chi tiết 1 chương trình + toàn bộ rule
-- ═══════════════════════════════════════════════════════════════════════
CREATE OR ALTER PROCEDURE dbo.API_PromotionProgram_Detail_AI
    @PromotionProgramID BIGINT,
    @Username            VARCHAR(50) = ''
AS
BEGIN
    SET NOCOUNT ON;

    DECLARE @CanView BIT = 0, @ViewScope VARCHAR(20) = 'OWN_BRANCH', @ActorBranchID VARCHAR(50) = '';
    SELECT @CanView = IsAllowed, @ViewScope = ScopeMode, @ActorBranchID = COALESCE(ActorBranchID, '')
    FROM dbo.AI_PromotionPermissionFnc(@Username, 'VIEW');
    IF @CanView = 0
    BEGIN
        SELECT N'Tài khoản không có quyền xem cấu hình CTKM.' AS Msg, 1 AS MsgType;
        RETURN;
    END
    IF NOT EXISTS (SELECT 1 FROM dbo.AI_PromotionProgramTbl WHERE PromotionProgramID = @PromotionProgramID)
    BEGIN
        SELECT N'Không tìm thấy chương trình CTBH.' AS Msg, 1 AS MsgType;
        RETURN;
    END
    IF @ViewScope = 'OWN_BRANCH' AND NOT EXISTS
    (
        SELECT 1 FROM dbo.AI_PromotionProgramTbl P
        WHERE P.PromotionProgramID=@PromotionProgramID
          AND (P.BranchScopeMode='ALL' OR EXISTS
              (SELECT 1 FROM dbo.AI_PromotionBranchScopeTbl B WHERE B.PromotionProgramID=P.PromotionProgramID AND B.BranchID=@ActorBranchID))
    )
    BEGIN
        SELECT N'CTKM nằm ngoài phạm vi chi nhánh.' AS Msg, 1 AS MsgType;
        RETURN;
    END

    SELECT
        P.PromotionProgramID, P.PromotionCode, P.ProgramVersion, P.PromotionName, P.ProgramType,
        P.Description, P.EffectiveFrom, P.EffectiveTo, P.BranchScopeMode, P.UserGroupScopeMode,
        P.Priority, P.Status, P.SourceDocument, P.CreatedBy, P.CreatedAt, P.ApprovedBy, P.ApprovedAt, P.UpdatedAt,
        R.PromotionItemRuleID, R.RuleOrder, R.ItemID, I.ItemName, R.RuleType,
        R.MinimumQuantity, R.MaximumQuantity, R.MinimumOrderAmount, R.MaximumOrderAmount,
        R.DiscountPercent, R.GiftItemID, GI.ItemName AS GiftItemName, R.GiftQuantity, R.BenefitDescription,
        BS.BranchIDs, US.UserGroupIDs
    FROM dbo.AI_PromotionProgramTbl P
    LEFT JOIN dbo.AI_PromotionItemRuleTbl R ON R.PromotionProgramID = P.PromotionProgramID
    LEFT JOIN dbo.CF_ItemTbl I ON I.ItemID = R.ItemID
    LEFT JOIN dbo.CF_ItemTbl GI ON GI.ItemID = R.GiftItemID
    OUTER APPLY (
        SELECT STRING_AGG(B.BranchID, ',') AS BranchIDs
        FROM dbo.AI_PromotionBranchScopeTbl B WHERE B.PromotionProgramID = P.PromotionProgramID
    ) BS
    OUTER APPLY (
        SELECT STRING_AGG(G.UserGroupID, ',') AS UserGroupIDs
        FROM dbo.AI_PromotionUserGroupScopeTbl G WHERE G.PromotionProgramID = P.PromotionProgramID
    ) US
    WHERE P.PromotionProgramID = @PromotionProgramID
    ORDER BY R.RuleOrder;
END
GO

-- ═══════════════════════════════════════════════════════════════════════
-- API_PromotionProgram_Upsert_AI — tạo chương trình mới / sửa DRAFT hiện có
-- ═══════════════════════════════════════════════════════════════════════
CREATE OR ALTER PROCEDURE dbo.API_PromotionProgram_Upsert_AI
    @PromotionProgramID BIGINT = NULL,      -- NULL/0 = tạo mới; có giá trị = sửa DRAFT đang có
    @PromotionCode       VARCHAR(50),
    @PromotionName       NVARCHAR(300),
    @ProgramType         VARCHAR(20),        -- MONTHLY / EVENT
    @Description         NVARCHAR(2000) = NULL,
    @EffectiveFrom        DATETIME2(0),
    @EffectiveTo          DATETIME2(0),
    @BranchScopeMode      VARCHAR(10) = 'ALL',
    @JsonBranchIDs        NVARCHAR(MAX) = '[]',
    @UserGroupScopeMode   VARCHAR(10) = 'ALL',
    @JsonUserGroupIDs     NVARCHAR(MAX) = '[]',
    @Priority             INT = 100,
    @SourceDocument       NVARCHAR(500),
    @JsonRules            NVARCHAR(MAX) = '[]',
    @Username             VARCHAR(50) = '',
    @Apply                BIT = 0            -- 0 = xem trước, 1 = ghi thật
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;

    DECLARE @MutationAction VARCHAR(20) = CASE WHEN COALESCE(@PromotionProgramID,0)>0 THEN 'EDIT' ELSE 'CREATE' END;
    DECLARE @CanMutate BIT = 0, @MutationScope VARCHAR(20) = 'OWN_BRANCH', @ActorBranchID VARCHAR(50) = '';
    SELECT @CanMutate = IsAllowed, @MutationScope = ScopeMode, @ActorBranchID = COALESCE(ActorBranchID, '')
    FROM dbo.AI_PromotionPermissionFnc(@Username, @MutationAction);
    IF @CanMutate = 0
    BEGIN
        SELECT N'Tài khoản không có quyền ' + CASE WHEN @MutationAction='CREATE' THEN N'tạo' ELSE N'sửa' END + N' CTKM.' AS Msg, 1 AS MsgType;
        RETURN;
    END
    IF @MutationScope='OWN_BRANCH'
       AND
       (
           @ActorBranchID=''
           OR @BranchScopeMode<>'INCLUDE'
           OR NOT EXISTS (SELECT 1 FROM OPENJSON(CASE WHEN ISJSON(@JsonBranchIDs)=1 THEN @JsonBranchIDs ELSE N'[]' END) WHERE CONVERT(VARCHAR(50),value)=@ActorBranchID)
           OR EXISTS (SELECT 1 FROM OPENJSON(CASE WHEN ISJSON(@JsonBranchIDs)=1 THEN @JsonBranchIDs ELSE N'[]' END) WHERE CONVERT(VARCHAR(50),value)<>@ActorBranchID)
       )
    BEGIN
        SELECT N'Quản lý chỉ được khai báo CTKM cho đúng chi nhánh của mình.' AS Msg, 1 AS MsgType;
        RETURN;
    END
    IF COALESCE(@PromotionCode, '') = '' OR COALESCE(@PromotionName, '') = '' OR COALESCE(@SourceDocument, '') = ''
    BEGIN
        SELECT N'Mã CTBH, tên chương trình và nguồn tài liệu là bắt buộc.' AS Msg, 1 AS MsgType;
        RETURN;
    END
    IF @EffectiveFrom IS NULL OR @EffectiveTo IS NULL OR @EffectiveTo <= @EffectiveFrom
    BEGIN
        SELECT N'Thời gian hiệu lực không hợp lệ (EffectiveTo phải sau EffectiveFrom).' AS Msg, 1 AS MsgType;
        RETURN;
    END
    IF ISJSON(@JsonRules) <> 1 OR ISJSON(@JsonBranchIDs) <> 1 OR ISJSON(@JsonUserGroupIDs) <> 1
    BEGIN
        SELECT N'Dữ liệu JSON không hợp lệ.' AS Msg, 1 AS MsgType;
        RETURN;
    END
    IF EXISTS (
        SELECT 1 FROM OPENJSON(@JsonRules) WITH (ItemID VARCHAR(50) '$.ItemID') J
        WHERE COALESCE(J.ItemID, '') = '' OR NOT EXISTS (SELECT 1 FROM dbo.CF_ItemTbl I WHERE I.ItemID = J.ItemID)
    )
    BEGIN
        SELECT N'Danh sách rule có sản phẩm không tồn tại.' AS Msg, 1 AS MsgType;
        RETURN;
    END
    -- Rule *_GIFT phải trỏ đúng sản phẩm tặng có thật; nếu không, AI_ApprovedPromotionItemRuleVw
    -- sẽ âm thầm loại bỏ rule này khỏi kết quả (LEFT JOIN CF_ItemTbl không khớp), khiến CTBH
    -- hiển thị "Đã duyệt" nhưng không bao giờ có hiệu lực thật — chặn ngay từ lúc lưu.
    IF EXISTS (
        SELECT 1 FROM OPENJSON(@JsonRules) WITH (RuleType VARCHAR(30) '$.RuleType', GiftItemID VARCHAR(50) '$.GiftItemID') J
        WHERE J.RuleType IN ('QUANTITY_GIFT', 'AMOUNT_GIFT')
          AND COALESCE(J.GiftItemID, '') <> ''
          AND NOT EXISTS (SELECT 1 FROM dbo.CF_ItemTbl GI WHERE GI.ItemID = J.GiftItemID)
    )
    BEGIN
        SELECT N'Danh sách rule có sản phẩm quà tặng (GiftItemID) không tồn tại.' AS Msg, 1 AS MsgType;
        RETURN;
    END
    -- CHƯA HỖ TRỢ quà tặng khác SKU: toàn bộ pipeline tạo đơn (payload FE, guard "mọi dòng giá 0
    -- phải khớp ItemID một dòng đã mua" tại API_DonHangChiTiet_Insert_AI) chỉ ghi nhận quà tặng
    -- CÙNG ItemID với sản phẩm mua. Nếu cho phép cấu hình GiftItemID khác ItemID ở đây, hệ thống
    -- sẽ hiển thị "tặng sản phẩm B" nhưng đơn hàng thật lại ghi "tặng thêm sản phẩm A" — sai lệch
    -- âm thầm. Chặn tại nguồn cho tới khi nào pipeline tạo đơn được nâng cấp hỗ trợ thật.
    IF EXISTS (
        SELECT 1 FROM OPENJSON(@JsonRules) WITH (ItemID VARCHAR(50) '$.ItemID', RuleType VARCHAR(30) '$.RuleType', GiftItemID VARCHAR(50) '$.GiftItemID') J
        WHERE J.RuleType IN ('QUANTITY_GIFT', 'AMOUNT_GIFT')
          AND COALESCE(J.GiftItemID, '') <> ''
          AND J.GiftItemID <> J.ItemID
    )
    BEGIN
        SELECT N'Chưa hỗ trợ quà tặng khác sản phẩm mua (GiftItemID phải trùng ItemID hoặc để trống). Đơn hàng tạo ra sẽ ghi sai hàng tặng nếu khác.' AS Msg, 1 AS MsgType;
        RETURN;
    END

    DECLARE @TargetID BIGINT = NULL;
    DECLARE @NextVersion INT = 1;
    DECLARE @IsNewVersion BIT = 1;

    IF COALESCE(@PromotionProgramID, 0) > 0
    BEGIN
        SELECT @TargetID = PromotionProgramID
        FROM dbo.AI_PromotionProgramTbl
        WHERE PromotionProgramID = @PromotionProgramID AND Status = 'DRAFT';

        IF @TargetID IS NULL
        BEGIN
            SELECT N'Chỉ được sửa trực tiếp bản DRAFT. Bản đã duyệt/hết hạn phải tạo version mới.' AS Msg, 1 AS MsgType;
            RETURN;
        END
        IF @MutationScope='OWN_BRANCH'
           AND
           (
               NOT EXISTS (SELECT 1 FROM dbo.AI_PromotionBranchScopeTbl B WHERE B.PromotionProgramID=@TargetID AND B.BranchID=@ActorBranchID)
               OR EXISTS (SELECT 1 FROM dbo.AI_PromotionProgramTbl P WHERE P.PromotionProgramID=@TargetID AND P.CreatedBy<>@Username)
           )
        BEGIN
            SELECT N'Chỉ người tạo mới được sửa bản nháp CTKM trong chi nhánh của mình.' AS Msg, 1 AS MsgType;
            RETURN;
        END
        SET @IsNewVersion = 0;
    END
    ELSE
    BEGIN
        SELECT @NextVersion = ISNULL(MAX(ProgramVersion), 0) + 1
        FROM dbo.AI_PromotionProgramTbl
        WHERE PromotionCode = @PromotionCode;
    END

    IF @Apply = 0
    BEGIN
        SELECT
            @PromotionCode AS PromotionCode,
            CASE WHEN @IsNewVersion = 1 THEN @NextVersion ELSE (SELECT ProgramVersion FROM dbo.AI_PromotionProgramTbl WHERE PromotionProgramID = @TargetID) END AS ProgramVersion,
            CASE WHEN @IsNewVersion = 1 THEN N'TAO_VERSION_MOI' ELSE N'CAP_NHAT_DRAFT_HIEN_CO' END AS ThaoTacDuKien,
            (SELECT COUNT(*) FROM OPENJSON(@JsonRules)) AS SoRuleSeGhi,
            N'Dữ liệu hợp lệ. Đây là chế độ xem trước — hệ thống CHƯA ghi gì.' AS Msg,
            0 AS MsgType;
        RETURN;
    END

    -- PROMO-CFG-002: audit là bắt buộc cho mutation cấu hình CTBH, không phải tuỳ chọn.
    -- Fail-closed: nếu hạ tầng audit chưa sẵn sàng thì KHÔNG ghi gì, kể cả nghiệp vụ chính,
    -- để tránh CTBH bị đổi mà không có dấu vết ai/khi nào/lý do gì.
    IF OBJECT_ID(N'dbo.AI_WriteAuditLog', N'P') IS NULL
    BEGIN
        SELECT N'AUDIT_UNAVAILABLE: Hạ tầng ghi audit chưa sẵn sàng trên máy chủ này. Không thể lưu cấu hình CTBH khi chưa ghi được audit.' AS Msg, 1 AS MsgType;
        RETURN;
    END

    DECLARE @AuditBeforeJson NVARCHAR(MAX) = NULL;
    DECLARE @AuditAfterJson NVARCHAR(MAX) = NULL;

    BEGIN TRY
        BEGIN TRANSACTION;

        IF @IsNewVersion = 1
        BEGIN
            INSERT INTO dbo.AI_PromotionProgramTbl
                (PromotionCode, ProgramVersion, PromotionName, ProgramType, Description,
                 EffectiveFrom, EffectiveTo, BranchScopeMode, UserGroupScopeMode, Priority,
                 Status, SourceDocument, CreatedBy)
            VALUES
                (@PromotionCode, @NextVersion, @PromotionName, @ProgramType, @Description,
                 @EffectiveFrom, @EffectiveTo, @BranchScopeMode, @UserGroupScopeMode, @Priority,
                 'DRAFT', @SourceDocument, @Username);
            SET @TargetID = SCOPE_IDENTITY();
        END
        ELSE
        BEGIN
            SET @AuditBeforeJson = (
                SELECT PromotionName, ProgramType, Description, EffectiveFrom, EffectiveTo,
                       BranchScopeMode, UserGroupScopeMode, Priority, SourceDocument, Status,
                       (SELECT STRING_AGG(BranchID, ',') FROM dbo.AI_PromotionBranchScopeTbl WHERE PromotionProgramID = @TargetID) AS BranchIDs,
                       (SELECT STRING_AGG(UserGroupID, ',') FROM dbo.AI_PromotionUserGroupScopeTbl WHERE PromotionProgramID = @TargetID) AS UserGroupIDs,
                       (SELECT COUNT(*) FROM dbo.AI_PromotionItemRuleTbl WHERE PromotionProgramID = @TargetID) AS RuleCount,
                       JSON_QUERY((
                           SELECT RuleOrder, ItemID, RuleType, MinimumQuantity, MaximumQuantity,
                                  MinimumOrderAmount, MaximumOrderAmount, DiscountPercent,
                                  GiftItemID, GiftQuantity, BenefitDescription
                           FROM dbo.AI_PromotionItemRuleTbl WHERE PromotionProgramID = @TargetID
                           ORDER BY RuleOrder, PromotionItemRuleID
                           FOR JSON PATH
                       )) AS Rules
                FROM dbo.AI_PromotionProgramTbl WHERE PromotionProgramID = @TargetID
                FOR JSON PATH, WITHOUT_ARRAY_WRAPPER
            );

            UPDATE dbo.AI_PromotionProgramTbl
            SET PromotionName = @PromotionName, ProgramType = @ProgramType, Description = @Description,
                EffectiveFrom = @EffectiveFrom, EffectiveTo = @EffectiveTo,
                BranchScopeMode = @BranchScopeMode, UserGroupScopeMode = @UserGroupScopeMode,
                Priority = @Priority, SourceDocument = @SourceDocument, UpdatedAt = SYSUTCDATETIME()
            WHERE PromotionProgramID = @TargetID;

            DELETE FROM dbo.AI_PromotionBranchScopeTbl WHERE PromotionProgramID = @TargetID;
            DELETE FROM dbo.AI_PromotionUserGroupScopeTbl WHERE PromotionProgramID = @TargetID;
            DELETE FROM dbo.AI_PromotionItemRuleTbl WHERE PromotionProgramID = @TargetID;
        END

        IF @BranchScopeMode = 'INCLUDE'
        BEGIN
            INSERT INTO dbo.AI_PromotionBranchScopeTbl (PromotionProgramID, BranchID)
            SELECT @TargetID, value FROM OPENJSON(@JsonBranchIDs);
        END
        IF @UserGroupScopeMode = 'INCLUDE'
        BEGIN
            INSERT INTO dbo.AI_PromotionUserGroupScopeTbl (PromotionProgramID, UserGroupID)
            SELECT @TargetID, value FROM OPENJSON(@JsonUserGroupIDs);
        END

        INSERT INTO dbo.AI_PromotionItemRuleTbl
            (PromotionProgramID, RuleOrder, ItemID, RuleType, MinimumQuantity, MaximumQuantity,
             MinimumOrderAmount, MaximumOrderAmount, DiscountPercent, GiftItemID, GiftQuantity, BenefitDescription)
        SELECT
            @TargetID, J.RuleOrder, J.ItemID, J.RuleType,
            J.MinimumQuantity, J.MaximumQuantity, J.MinimumOrderAmount, J.MaximumOrderAmount,
            J.DiscountPercent, NULLIF(J.GiftItemID, ''), J.GiftQuantity, J.BenefitDescription
        FROM OPENJSON(@JsonRules) WITH (
            RuleOrder INT '$.RuleOrder',
            ItemID VARCHAR(50) '$.ItemID',
            RuleType VARCHAR(30) '$.RuleType',
            MinimumQuantity DECIMAL(18,2) '$.MinimumQuantity',
            MaximumQuantity DECIMAL(18,2) '$.MaximumQuantity',
            MinimumOrderAmount DECIMAL(18,2) '$.MinimumOrderAmount',
            MaximumOrderAmount DECIMAL(18,2) '$.MaximumOrderAmount',
            DiscountPercent DECIMAL(5,2) '$.DiscountPercent',
            GiftItemID VARCHAR(50) '$.GiftItemID',
            GiftQuantity DECIMAL(18,2) '$.GiftQuantity',
            BenefitDescription NVARCHAR(1000) '$.BenefitDescription'
        ) J;

        -- PROMO-CFG-002: audit trước/sau cho mọi lần tạo version mới hoặc sửa DRAFT — bao gồm
        -- CẢ nội dung rule (không chỉ RuleCount), vì đổi DiscountPercent/MinimumQuantity... mà
        -- giữ nguyên số rule vẫn phải thấy được trong audit.
        -- @AuditBeforeJson được chụp TRƯỚC UPDATE/DELETE rule ở nhánh sửa DRAFT phía trên; NULL khi tạo mới.
        SET @AuditAfterJson = (
            SELECT PromotionName, ProgramType, Description, EffectiveFrom, EffectiveTo,
                   BranchScopeMode, UserGroupScopeMode, Priority, SourceDocument, Status,
                   (SELECT STRING_AGG(BranchID, ',') FROM dbo.AI_PromotionBranchScopeTbl WHERE PromotionProgramID = @TargetID) AS BranchIDs,
                   (SELECT STRING_AGG(UserGroupID, ',') FROM dbo.AI_PromotionUserGroupScopeTbl WHERE PromotionProgramID = @TargetID) AS UserGroupIDs,
                   (SELECT COUNT(*) FROM dbo.AI_PromotionItemRuleTbl WHERE PromotionProgramID = @TargetID) AS RuleCount,
                   JSON_QUERY((
                       SELECT RuleOrder, ItemID, RuleType, MinimumQuantity, MaximumQuantity,
                              MinimumOrderAmount, MaximumOrderAmount, DiscountPercent,
                              GiftItemID, GiftQuantity, BenefitDescription
                       FROM dbo.AI_PromotionItemRuleTbl WHERE PromotionProgramID = @TargetID
                       ORDER BY RuleOrder, PromotionItemRuleID
                       FOR JSON PATH
                   )) AS Rules
            FROM dbo.AI_PromotionProgramTbl WHERE PromotionProgramID = @TargetID
            FOR JSON PATH, WITHOUT_ARRAY_WRAPPER
        );
        DECLARE @UpsertAuditExtraInfo NVARCHAR(MAX) = (
            SELECT JSON_QUERY(@AuditBeforeJson) AS [Before], JSON_QUERY(@AuditAfterJson) AS [After]
            FOR JSON PATH, WITHOUT_ARRAY_WRAPPER
        );
        DECLARE @UpsertAuditActionType VARCHAR(100) = CASE WHEN @IsNewVersion = 1 THEN 'PROMOTION_CREATE_VERSION' ELSE 'PROMOTION_UPDATE_DRAFT' END;
        DECLARE @UpsertAuditTargetID VARCHAR(30) = CONVERT(VARCHAR(30), @TargetID);
        EXEC dbo.AI_WriteAuditLog
            @Username     = @Username,
            @ActionType   = @UpsertAuditActionType,
            @TargetEntity = 'API_PromotionProgram_Upsert_AI',
            @TargetID     = @UpsertAuditTargetID,
            @TargetName   = @PromotionName,
            @ExtraInfo    = @UpsertAuditExtraInfo;

        COMMIT TRANSACTION;
        SELECT @TargetID AS PromotionProgramID, N'Đã lưu DRAFT thành công.' AS Msg, 0 AS MsgType;
    END TRY
    BEGIN CATCH
        IF @@TRANCOUNT > 0 ROLLBACK TRANSACTION;
        SELECT ERROR_MESSAGE() AS Msg, 1 AS MsgType;
    END CATCH
END
GO

-- ═══════════════════════════════════════════════════════════════════════
-- API_PromotionProgram_Approve_AI — duyệt / từ chối / thu hồi
-- ═══════════════════════════════════════════════════════════════════════
CREATE OR ALTER PROCEDURE dbo.API_PromotionProgram_Approve_AI
    @PromotionProgramID BIGINT,
    @Action              VARCHAR(20),    -- APPROVE / REJECT / WITHDRAW
    @Username             VARCHAR(50) = '',
    @Apply                BIT = 0,
    -- Tham số mới phải nằm cuối: ERP gateway bind JSON theo vị trí, không theo tên.
    @Reason               NVARCHAR(500) = NULL  -- bắt buộc khi REJECT/WITHDRAW
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;

    DECLARE @PermissionAction VARCHAR(20) = UPPER(COALESCE(@Action,''));
    DECLARE @CanAction BIT = 0, @ActionScope VARCHAR(20) = 'OWN_BRANCH', @ActorBranchID VARCHAR(50) = '';
    SELECT @CanAction=IsAllowed,@ActionScope=ScopeMode,@ActorBranchID=COALESCE(ActorBranchID,'')
    FROM dbo.AI_PromotionPermissionFnc(@Username,@PermissionAction);
    IF @CanAction = 0
    BEGIN
        SELECT N'Tài khoản không có quyền thực hiện hành động này trên CTKM.' AS Msg, 1 AS MsgType;
        RETURN;
    END
    IF @Action NOT IN ('APPROVE', 'REJECT', 'WITHDRAW')
    BEGIN
        SELECT N'Hành động không hợp lệ.' AS Msg, 1 AS MsgType;
        RETURN;
    END
    IF @Action IN ('REJECT', 'WITHDRAW') AND COALESCE(LTRIM(RTRIM(@Reason)), '') = ''
    BEGIN
        SELECT N'Phải nhập lý do khi từ chối hoặc thu hồi CTBH.' AS Msg, 1 AS MsgType;
        RETURN;
    END

    DECLARE @CurrentStatus VARCHAR(20);
    SELECT @CurrentStatus = Status FROM dbo.AI_PromotionProgramTbl WHERE PromotionProgramID = @PromotionProgramID;

    IF @CurrentStatus IS NULL
    BEGIN
        SELECT N'Không tìm thấy chương trình CTBH.' AS Msg, 1 AS MsgType;
        RETURN;
    END
    IF @ActionScope='OWN_BRANCH' AND NOT EXISTS
    (
        SELECT 1 FROM dbo.AI_PromotionProgramTbl P
        WHERE P.PromotionProgramID=@PromotionProgramID
          AND (P.BranchScopeMode='ALL' OR EXISTS
              (SELECT 1 FROM dbo.AI_PromotionBranchScopeTbl B WHERE B.PromotionProgramID=P.PromotionProgramID AND B.BranchID=@ActorBranchID))
    )
    BEGIN
        SELECT N'CTKM nằm ngoài phạm vi chi nhánh.' AS Msg, 1 AS MsgType;
        RETURN;
    END
    IF @Action IN ('APPROVE','REJECT') AND EXISTS
       (SELECT 1 FROM dbo.AI_PromotionProgramTbl WHERE PromotionProgramID=@PromotionProgramID AND CreatedBy=@Username)
    BEGIN
        SELECT N'Người tạo CTKM không được tự duyệt hoặc tự từ chối chương trình của mình.' AS Msg, 1 AS MsgType;
        RETURN;
    END
    IF (@Action IN ('APPROVE', 'REJECT') AND @CurrentStatus <> 'DRAFT')
       OR (@Action = 'WITHDRAW' AND @CurrentStatus <> 'APPROVED')
    BEGIN
        SELECT N'Trạng thái hiện tại (' + @CurrentStatus + N') không cho phép hành động này.' AS Msg, 1 AS MsgType;
        RETURN;
    END

    DECLARE @NewStatus VARCHAR(20) = CASE @Action WHEN 'APPROVE' THEN 'APPROVED' WHEN 'REJECT' THEN 'REJECTED' ELSE 'WITHDRAWN' END;

    IF @Apply = 0
    BEGIN
        SELECT @PromotionProgramID AS PromotionProgramID, @CurrentStatus AS CurrentStatus, @NewStatus AS NewStatus,
               N'Xem trước — hệ thống CHƯA ghi gì.' AS Msg, 0 AS MsgType;
        RETURN;
    END

    -- PROMO-CFG-002: fail-closed — không đổi trạng thái CTBH nếu không ghi được audit.
    IF OBJECT_ID(N'dbo.AI_WriteAuditLog', N'P') IS NULL
    BEGIN
        SELECT N'AUDIT_UNAVAILABLE: Hạ tầng ghi audit chưa sẵn sàng trên máy chủ này. Không thể duyệt/từ chối/thu hồi CTBH khi chưa ghi được audit.' AS Msg, 1 AS MsgType;
        RETURN;
    END

    BEGIN TRY
        BEGIN TRANSACTION;
        UPDATE dbo.AI_PromotionProgramTbl
        SET Status = @NewStatus,
            ApprovedBy = CASE WHEN @Action = 'APPROVE' THEN @Username ELSE ApprovedBy END,
            ApprovedAt = CASE WHEN @Action = 'APPROVE' THEN SYSUTCDATETIME() ELSE ApprovedAt END,
            UpdatedAt = SYSUTCDATETIME()
        WHERE PromotionProgramID = @PromotionProgramID;

        -- PROMO-CFG-002: audit trước/sau + lý do cho mọi lần duyệt/từ chối/thu hồi.
        -- Hạ tầng audit đã được xác nhận tồn tại ở bước fail-closed phía trên trong cùng lần gọi.
        DECLARE @ApprovalTargetName NVARCHAR(300) = (
            SELECT PromotionName FROM dbo.AI_PromotionProgramTbl WHERE PromotionProgramID = @PromotionProgramID
        );
        DECLARE @ApproveAuditExtraInfo NVARCHAR(MAX) = (
            SELECT @CurrentStatus AS FromStatus, @NewStatus AS ToStatus, @Reason AS Reason
            FOR JSON PATH, WITHOUT_ARRAY_WRAPPER
        );
        DECLARE @ApproveAuditActionType VARCHAR(100) = 'PROMOTION_' + @Action;
        DECLARE @ApproveAuditTargetID VARCHAR(30) = CONVERT(VARCHAR(30), @PromotionProgramID);
        EXEC dbo.AI_WriteAuditLog
            @Username     = @Username,
            @ActionType   = @ApproveAuditActionType,
            @TargetEntity = 'API_PromotionProgram_Approve_AI',
            @TargetID     = @ApproveAuditTargetID,
            @TargetName   = @ApprovalTargetName,
            @ExtraInfo    = @ApproveAuditExtraInfo;

        COMMIT TRANSACTION;
        SELECT @PromotionProgramID AS PromotionProgramID, @NewStatus AS Status, N'Đã cập nhật trạng thái.' AS Msg, 0 AS MsgType;
    END TRY
    BEGIN CATCH
        IF @@TRANCOUNT > 0 ROLLBACK TRANSACTION;
        SELECT ERROR_MESSAGE() AS Msg, 1 AS MsgType;
    END CATCH
END
GO
