USE medtest;
GO

SET ANSI_NULLS ON;
GO
SET QUOTED_IDENTIFIER ON;
GO

/*
  API_Capability_AutoGrant_AI — tự động cấp quyền READ cho các API chỉ đọc
  đang bị kẹt ở trạng thái DENY.

  ══════════════════════════════════════════════════════════════════════════
  VẤN ĐỀ NÓ GIẢI QUYẾT
  ══════════════════════════════════════════════════════════════════════════
  API_Metadata_AutoBootstrap_AI tự sinh dòng đăng ký cho procedure mới, nhưng
  KHÔNG biết gì về phân quyền. Migrate_API_Capability_Metadata_AI.sql sau đó
  đặt mọi dòng chưa có OperationType về DENY, rồi nâng lên READ theo một danh
  sách trắng VIẾT TAY.

  Hệ quả: mỗi API chỉ-đọc mới sinh ra đều im lặng bị chặn ở cổng n8n cho tới
  khi có người nhớ ra phải thêm tên nó vào danh sách trắng. Đó đúng là chuyện
  đã xảy ra với @hang_hoa_list ngày 2026-07-31. Procedure này thay việc "nhớ"
  bằng việc "chứng minh".

  ══════════════════════════════════════════════════════════════════════════
  CÁCH NÓ QUYẾT ĐỊNH — VÌ SAO KHÔNG DÒ TỪ KHOÁ TRONG MÃ NGUỒN
  ══════════════════════════════════════════════════════════════════════════
  Cách hiển nhiên là quét chữ INSERT/UPDATE/DELETE trong OBJECT_DEFINITION.
  Đã thử trên chính registry này ngày 2026-07-31: nó gắn cờ "có ghi" cho
  21 trên 28 API đang là READ — tỉ lệ báo động giả 75%. Nguyên nhân là hầu hết
  procedure báo cáo đều dùng bảng tạm (INSERT INTO #tmp, DROP TABLE #tmp);
  chúng chỉ đọc dữ liệu thật nhưng vẫn chứa đủ từ khoá ghi. Một bộ lọc như vậy
  vô dụng vì không bao giờ cấp được cho ai.

  Thay vào đó hỏi thẳng SQL Server bằng sys.dm_sql_referenced_entities: DMV
  này liệt kê từng đối tượng CÓ THẬT mà procedure tham chiếu, kèm cờ is_updated
  cho biết đối tượng đó bị ghi hay không. Bảng tạm không phải đối tượng
  persistent nên không xuất hiện. Kết quả đối chiếu trên medtest 2026-07-31:

      28/28 API đang READ    -> ghi vào 0 bảng          (không báo động giả)
      3/3  API đang MUTATION -> ghi đúng bảng nghiệp vụ (không bỏ sót)

  ══════════════════════════════════════════════════════════════════════════
  BA CỬA CHẶN — MỌI CỬA ĐỀU PHẢI QUA MỚI ĐƯỢC CẤP
  ══════════════════════════════════════════════════════════════════════════
  1. KHÔNG GHI DỮ LIỆU. Không có tham chiếu nào is_updated = 1.

  2. KHÔNG CÓ SQL ĐỘNG VÀ KHÔNG GỌI PROCEDURE KHÁC.
     Đây là vùng mù của DMV, và là lý do cửa này tồn tại. DMV phân tích cây cú
     pháp tĩnh nên không nhìn được vào trong chuỗi của sp_executesql — một
     procedure chạy EXEC('DELETE FROM ...') vẫn báo cáo 0 bảng bị ghi. Tương
     tự, procedure A gọi EXEC dbo.B thì DMV chỉ ghi nhận "A tham chiếu B", chứ
     không truy ngược xem B ghi cái gì. Cả hai trường hợp đều KHÔNG THỂ chứng
     minh là an toàn, nên xếp vào diện người phải tự xem. Hiện có 10 API dùng
     SQL động, trong đó @lap_don_hang và @metadata_auto_bootstrap ghi dữ liệu
     thật — đúng loại mà cửa này giữ lại.

  3. CÓ THAM SỐ PHÂN QUYỀN. Phải tồn tại ít nhất một API_Field với
     IsSystemParam = 1 (@User hoặc @Username). Tham số hệ thống do server điền
     từ phiên đăng nhập, client không khai tay được. Thiếu nó thì procedure
     chẳng có gì để giới hạn phạm vi: cấp READ đồng nghĩa cho trợ lý đọc dữ
     liệu của mọi người, dù bản thân procedure không hề ghi gì.

  ── GIỚI HẠN ĐÃ BIẾT CỦA CỬA 3 — ĐỌC KỸ TRƯỚC KHI @Apply = 1 ──
  Cửa 3 chỉ chứng minh được tham số phân quyền TỒN TẠI, chứ không chứng minh
  được procedure THỰC SỰ DÙNG nó để lọc. Một procedure nhận @Username rồi lờ
  đi vẫn qua được cửa này. Máy không kiểm tra hộ chuyện đó — đó chính là lý do
  @Apply mặc định bằng 0 và vì sao phải có người đọc bảng phán quyết trước khi
  cấp thật. Ngày 2026-07-31 đã kiểm tra tay hai ứng viên đầu tiên:
  API_AuditLog_AI chặn theo UserGroupID = 'ADMIN', API_ReadRequestAudit_AI
  chặn theo ADMIN/SECURITY/QA — cả hai đều dùng @Username thật.

  Trượt bất kỳ cửa nào thì GIỮ NGUYÊN DENY và ghi rõ lý do để người quyết định.
  Procedure này chỉ biết nâng DENY -> READ. Nó không bao giờ hạ cấp, không bao
  giờ đụng vào dòng đã là READ hay MUTATION, và không bao giờ tự cấp MUTATION.

  ── Một tính chất đáng chú ý ──
  Chính procedure này ghi vào API_Definition, nên nếu có ai đăng ký nó thành
  API thì cửa 1 sẽ tự xếp nó vào diện "có ghi" và vĩnh viễn không cấp quyền cho
  nó. Nó không thể tự mở khoá cho mình.

  ══════════════════════════════════════════════════════════════════════════
  THAM SỐ
  ══════════════════════════════════════════════════════════════════════════
  @Apply    BIT          Mặc định 0 = chỉ xem trước, không sửa gì.
                         1 = thực sự cập nhật những dòng ĐỦ ĐIỀU KIỆN.
  @ApiCode  VARCHAR(100) Mặc định NULL = xét toàn bộ. Truyền vào để xét một API.

  Luôn trả về bảng phán quyết đầy đủ, dù @Apply bằng mấy. Khi @Apply = 1, mỗi
  dòng được cấp sẽ có thêm một bản ghi trong API_Metadata_DDL_Log.

  ══════════════════════════════════════════════════════════════════════════
  CÁCH DÙNG
  ══════════════════════════════════════════════════════════════════════════
      EXEC dbo.API_Capability_AutoGrant_AI;              -- xem trước
      EXEC dbo.API_Capability_AutoGrant_AI @Apply = 1;   -- cấp thật

  Nên chạy sau mỗi lần API_Metadata_AutoBootstrap_AI sinh procedure mới.
  Xem lại danh sách phán quyết trước khi @Apply = 1: "không ghi dữ liệu" không
  đồng nghĩa với "ai đọc cũng được". Ví dụ @audit_log và @read_request_audit
  qua đủ ba cửa nhưng chúng đọc nhật ký thao tác của người dùng — có nên để trợ
  lý đọc hay không là quyết định nghiệp vụ, không phải quyết định kỹ thuật.

  Tham chiếu: sql/Migrate_API_Capability_Metadata_AI.sql (danh sách trắng tay)
*/
CREATE OR ALTER PROCEDURE [dbo].[API_Capability_AutoGrant_AI]
    @Apply   BIT          = 0,
    @ApiCode VARCHAR(100) = NULL
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;

    IF OBJECT_ID('dbo.API_Definition', 'U') IS NULL
        THROW 51300, N'Không tìm thấy bảng dbo.API_Definition.', 1;

    DECLARE @KetQua TABLE (
        ApiCode         VARCHAR(100)  NOT NULL,
        StoredProcedure VARCHAR(200)  NOT NULL,
        IsActive        BIT           NOT NULL,
        PhanQuyet       VARCHAR(40)   NOT NULL,
        LyDo            NVARCHAR(1000) NULL,
        BangBiGhi       NVARCHAR(1000) NULL,
        ThamSoHeThong   NVARCHAR(500)  NULL
    );

    DECLARE @c VARCHAR(100), @sp VARCHAR(200), @act BIT, @apiid INT;

    /* Chỉ xét những dòng đang bị chặn. Dòng đã READ/MUTATION là quyết định của
       con người, không đụng vào. */
    DECLARE cur CURSOR LOCAL FAST_FORWARD FOR
        SELECT ApiID, ApiCode, StoredProcedure, IsActive
        FROM dbo.API_Definition
        WHERE (OperationType IS NULL OR OperationType = 'DENY')
          AND (@ApiCode IS NULL OR ApiCode = @ApiCode)
        ORDER BY ApiCode;

    OPEN cur;
    FETCH NEXT FROM cur INTO @apiid, @c, @sp, @act;

    WHILE @@FETCH_STATUS = 0
    BEGIN
        DECLARE @def       NVARCHAR(MAX),
                @soBangGhi INT,
                @bangGhi   NVARCHAR(1000),
                @sysParam  NVARCHAR(500),
                @phan      VARCHAR(40),
                @lyDo      NVARCHAR(1000);

        SET @soBangGhi = NULL; SET @bangGhi = NULL;
        SET @phan = NULL;      SET @lyDo = NULL;

        SELECT @sysParam = STUFF((
            SELECT ', ' + F.FieldCode
            FROM dbo.API_Field F
            WHERE F.ApiID = @apiid AND F.IsSystemParam = 1
            ORDER BY F.FieldCode
            FOR XML PATH('')), 1, 2, '');

        SET @def = OBJECT_DEFINITION(OBJECT_ID('dbo.' + @sp, 'P'));

        IF OBJECT_ID('dbo.' + @sp, 'P') IS NULL
        BEGIN
            SET @phan = 'THIEU_PROCEDURE';
            SET @lyDo = N'Đăng ký trỏ tới dbo.' + @sp + N' nhưng procedure này không tồn tại. Dòng đăng ký mồ côi — nên xoá hoặc sửa tên.';
        END
        ELSE IF @def IS NULL
        BEGIN
            /* WITH ENCRYPTION, hoặc tài khoản đang chạy không có quyền VIEW DEFINITION. */
            SET @phan = 'KHONG_DOC_DUOC';
            SET @lyDo = N'Không đọc được định nghĩa procedure (mã hoá hoặc thiếu quyền VIEW DEFINITION). Không thể chứng minh là chỉ đọc.';
        END
        ELSE
        BEGIN
            /* Cửa 1 — DMV có thể ném lỗi nếu procedure tham chiếu đối tượng
               không phân giải được; khi đó coi như không chứng minh được. */
            BEGIN TRY
                SELECT @soBangGhi = COUNT(DISTINCT referenced_entity_name)
                FROM sys.dm_sql_referenced_entities('dbo.' + @sp, 'OBJECT')
                WHERE is_updated = 1;

                SELECT @bangGhi = STUFF((
                    SELECT DISTINCT ', ' + referenced_entity_name
                    FROM sys.dm_sql_referenced_entities('dbo.' + @sp, 'OBJECT')
                    WHERE is_updated = 1
                    FOR XML PATH('')), 1, 2, '');
            END TRY
            BEGIN CATCH
                SET @soBangGhi = -1;
                SET @lyDo = N'Không phân tích được tham chiếu: ' + LEFT(ERROR_MESSAGE(), 400);
            END CATCH

            DECLARE @defU NVARCHAR(MAX) =
                N' ' + UPPER(REPLACE(REPLACE(@def, CHAR(13), N' '), CHAR(10), N' ')) + N' ';

            DECLARE @coSqlDong BIT =
                CASE WHEN @defU LIKE N'%SP[_]EXECUTESQL%'
                       OR @defU LIKE N'%[^A-Z0-9_@#]EXEC[^A-Z0-9_]%'
                       OR @defU LIKE N'%[^A-Z0-9_@#]EXECUTE[^A-Z0-9_]%'
                     THEN 1 ELSE 0 END;

            IF @soBangGhi = -1
                SET @phan = 'KHONG_PHAN_TICH_DUOC';
            ELSE IF @soBangGhi > 0
            BEGIN
                SET @phan = 'GHI_DU_LIEU';
                SET @lyDo = N'Ghi vào ' + CAST(@soBangGhi AS NVARCHAR(10))
                          + N' bảng thật. Đây là API thay đổi dữ liệu — phải do người quyết định đặt thành MUTATION kèm capability riêng, không tự cấp.';
            END
            ELSE IF @coSqlDong = 1
            BEGIN
                SET @phan = 'SQL_DONG';
                SET @lyDo = N'Có EXEC hoặc sp_executesql. Không nhìn được vào trong chuỗi SQL động, cũng không truy được procedure được gọi lồng, nên không chứng minh được là chỉ đọc. Cần người đọc mã.';
            END
            ELSE IF @sysParam IS NULL
            BEGIN
                SET @phan = 'THIEU_THAM_SO_PHAN_QUYEN';
                SET @lyDo = N'Không có API_Field nào IsSystemParam = 1. Procedure không nhận danh tính người dùng từ server nên không giới hạn được phạm vi; cấp READ là cho đọc dữ liệu của mọi người.';
            END
            ELSE
            BEGIN
                SET @phan = 'DU_DIEU_KIEN';
                SET @lyDo = N'Không ghi bảng nào, không có SQL động, có tham số phân quyền ' + @sysParam + N'.';
            END
        END

        INSERT @KetQua (ApiCode, StoredProcedure, IsActive, PhanQuyet, LyDo, BangBiGhi, ThamSoHeThong)
        VALUES (@c, @sp, @act, @phan, @lyDo, @bangGhi, @sysParam);

        FETCH NEXT FROM cur INTO @apiid, @c, @sp, @act;
    END

    CLOSE cur;
    DEALLOCATE cur;

    DECLARE @soDuDieuKien INT = (SELECT COUNT(*) FROM @KetQua WHERE PhanQuyet = 'DU_DIEU_KIEN');

    IF @Apply = 1 AND @soDuDieuKien > 0
    BEGIN
        BEGIN TRY
            BEGIN TRANSACTION;

            UPDATE D
            SET OperationType      = 'READ',
                RequiredCapability  = 'api.read',
                AllowedCapabilities = N'["api.read"]',
                ScopeResolver       = 'VERIFIED_USER_HIERARCHY',
                OwnershipRule       = 'TDV_OWN_OR_MANAGER_BRANCH',
                ContractUpdatedAt   = SYSUTCDATETIME(),
                ContractUpdatedBy   = 'API_Capability_AutoGrant_AI'
            FROM dbo.API_Definition D
                INNER JOIN @KetQua K ON K.ApiCode = D.ApiCode
            WHERE K.PhanQuyet = 'DU_DIEU_KIEN'
              AND (D.OperationType IS NULL OR D.OperationType = 'DENY');

            IF OBJECT_ID('dbo.API_Metadata_DDL_Log', 'U') IS NOT NULL
                INSERT dbo.API_Metadata_DDL_Log (EventTime, EventType, SchemaName, ObjectName, CommandText, IsApplied, ErrorMessage)
                SELECT SYSUTCDATETIME(), N'AUTO_GRANT_READ', N'dbo', K.StoredProcedure,
                       N'ApiCode=' + K.ApiCode + N'; DENY -> READ; ' + ISNULL(K.LyDo, N''),
                       1, NULL
                FROM @KetQua K
                WHERE K.PhanQuyet = 'DU_DIEU_KIEN';

            COMMIT TRANSACTION;
        END TRY
        BEGIN CATCH
            IF @@TRANCOUNT > 0 ROLLBACK TRANSACTION;
            THROW;
        END CATCH
    END

    /* Bảng phán quyết. Xếp đơn vị cần chú ý lên trên. */
    SELECT
        CASE WHEN @Apply = 1 AND K.PhanQuyet = 'DU_DIEU_KIEN' THEN N'ĐÃ CẤP READ'
             WHEN K.PhanQuyet = 'DU_DIEU_KIEN'                THEN N'sẽ cấp (đang xem trước)'
             ELSE                                                  N'giữ DENY'
        END                    AS KetQua,
        K.ApiCode,
        K.StoredProcedure,
        K.IsActive,
        K.PhanQuyet,
        K.ThamSoHeThong,
        K.BangBiGhi,
        K.LyDo
    FROM @KetQua K
    ORDER BY CASE K.PhanQuyet
                WHEN 'DU_DIEU_KIEN'             THEN 1
                WHEN 'SQL_DONG'                 THEN 2
                WHEN 'THIEU_THAM_SO_PHAN_QUYEN' THEN 3
                WHEN 'KHONG_PHAN_TICH_DUOC'     THEN 4
                WHEN 'KHONG_DOC_DUOC'           THEN 5
                WHEN 'THIEU_PROCEDURE'          THEN 6
                ELSE 7 END,
             K.ApiCode;

    /* Dòng tổng kết, để người chạy không phải tự đếm. */
    SELECT
        (SELECT COUNT(*) FROM @KetQua)                                        AS TongDongXet,
        @soDuDieuKien                                                          AS DuDieuKien,
        (SELECT COUNT(*) FROM @KetQua WHERE PhanQuyet = 'GHI_DU_LIEU')         AS GiuDeny_GhiDuLieu,
        (SELECT COUNT(*) FROM @KetQua WHERE PhanQuyet = 'SQL_DONG')            AS GiuDeny_SqlDong,
        (SELECT COUNT(*) FROM @KetQua WHERE PhanQuyet = 'THIEU_THAM_SO_PHAN_QUYEN') AS GiuDeny_ThieuThamSo,
        (SELECT COUNT(*) FROM @KetQua WHERE PhanQuyet IN ('THIEU_PROCEDURE','KHONG_DOC_DUOC','KHONG_PHAN_TICH_DUOC')) AS CanKiemTraTay,
        CASE WHEN @Apply = 1 THEN N'ĐÃ ÁP DỤNG' ELSE N'XEM TRƯỚC — chưa sửa gì' END AS CheDo;
END
GO

/* ────────────────────────────────────────────────────────────────────────────
   DỌN DẸP BẮT BUỘC — chạy ngay sau khi tạo procedure ở trên.

   Trên medtest có DDL trigger tự đăng ký mọi procedure mới vào API_Definition.
   Nó vừa biến chính API_Capability_AutoGrant_AI thành một API gọi được từ chat
   với mã @capability_auto_grant và OperationType = NULL. Kiểm chứng bằng chính
   lần chạy khô đầu tiên ngày 2026-07-31: dòng này xuất hiện trong bảng phán
   quyết với kết luận GHI_DU_LIEU (ghi API_Definition, API_Metadata_DDL_Log).

   Cổng n8n chặn theo capability nên NULL đã là fail-closed, nhưng để mặc một
   dòng NULL nằm đó là dựa vào may mắn. Đây là công cụ quản trị phân quyền —
   không đời nào được phép gọi qua trợ lý. Đặt DENY và tắt hẳn.
   ──────────────────────────────────────────────────────────────────────────── */
UPDATE dbo.API_Definition
SET OperationType       = 'DENY',
    RequiredCapability  = NULL,
    AllowedCapabilities = N'[]',
    ScopeResolver       = 'NONE',
    OwnershipRule       = 'DENY',
    IsActive            = 0,
    ContractUpdatedAt   = SYSUTCDATETIME(),
    ContractUpdatedBy   = 'System_API_Capability_AutoGrant_AI.sql'
WHERE StoredProcedure = 'API_Capability_AutoGrant_AI';
GO
