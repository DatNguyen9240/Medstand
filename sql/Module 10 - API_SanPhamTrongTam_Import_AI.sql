/*
  API_SanPhamTrongTam_Import_AI — nạp/sửa chương trình sản phẩm trọng tâm.

  ── PHÂN VAI, chốt ngày 31/07/2026 ──
    @de_xuat_khuyen_mai        gợi ý hàng nên đẩy, CHƯA duyệt  -> chỉ quản lý xem
    API_SanPhamTrongTam_AI     chương trình ĐÃ công ty duyệt   -> ai cũng xem
    API_SanPhamTrongTam_Import chính là file này               -> quản lý trở lên,
                                                                  và CHỈ XEM

  ── HAI THỨ ĐƯỢC THÊM NGÀY 31/07/2026 ──

  1. Guard cấp quản lý. Trước đó procedure này CHỈ kiểm tra "tài khoản tồn tại
     và chưa bị khoá", không hề kiểm vai trò — nghĩa là bất kỳ tài khoản nhân
     viên bán hàng nào gọi thẳng được vào đây đều ghi đè được chương trình sản
     phẩm trọng tâm và bậc quà tặng của toàn công ty.

     Cổng n8n hiện đã chặn sẵn: trong API_Execute có
     enabledMutationApis = new Set(['@khach_hang_insert_ai']) và
     '@san_pham_trong_tam_import' KHÔNG nằm trong tập đó. Nhưng đó là lớp bảo vệ
     ở tầng khác; procedure phải tự đứng vững nếu có ai gọi trực tiếp vào SQL.

  2. @Apply mặc định 0 = chỉ xem trước. Procedure chạy hết mọi bước kiểm tra rồi
     báo cáo SẼ thay đổi những gì, nhưng KHÔNG ghi. Muốn ghi thật phải truyền
     @Apply = 1 một cách có chủ đích.

     Khớp với điều kiện của Pilot trong docs/KE_HOACH_TEST_13_TAI_KHOAN.md:
     "Chế độ: Read-only và preview mutation" và "Không tạo đơn, khách hoặc
     chương trình thật trong Pilot".

     An toàn cho hệ thống đang chạy: đã rà toàn bộ repo, không workflow nào gọi
     procedure này (AI_Upload_Reader.json: 0 tham chiếu), nên đổi mặc định sang
     xem trước không làm gãy luồng nào đang hoạt động.
*/
CREATE OR ALTER PROCEDURE API_SanPhamTrongTam_Import_AI
    @DocumentID VARCHAR(50),
    @TuNgay   DATETIME,
    @DenNgay     DATETIME,
    @Memo       NVARCHAR(200),
    @JsonItems  NVARCHAR(MAX) = '', -- Để trống sẽ giữ nguyên SP cũ
    @JsonRules  NVARCHAR(MAX) = '', -- Để trống sẽ giữ nguyên mốc cũ
    @Username   VARCHAR(50) = '',
    @Apply      BIT = 0             -- 0 = chỉ xem trước (mặc định), 1 = ghi thật
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;

    DECLARE @IsManager BIT = 0, @IsGlobal BIT = 0, @Found BIT = 0;

    SELECT @Found = 1,
           @IsManager = CASE WHEN COALESCE(Manager, 0) = 1
                               OR UPPER(COALESCE(UserGroupID, '')) IN ('QL', 'QLMN')
                             THEN 1 ELSE 0 END,
           @IsGlobal  = CASE WHEN UPPER(COALESCE(UserGroupID, '')) IN ('ADMIN', 'SADM', 'BGD', 'GD')
                             THEN 1 ELSE 0 END
    FROM SY_User
    WHERE UserName = @Username AND COALESCE(Disable, 0) = 0;

    IF @Found = 0
    BEGIN
        SELECT N'Không có quyền import: tài khoản không tồn tại hoặc đã bị khóa.' AS Msg, 1 AS MsgType;
        RETURN;
    END

    -- Guard vai trò: nhân viên bán hàng không được sửa chương trình của công ty.
    IF @IsManager = 0 AND @IsGlobal = 0
    BEGIN
        SELECT N'Chỉ cấp quản lý trở lên mới được xem và nạp chương trình sản phẩm trọng tâm. '
             + N'Bạn vẫn xem được các chương trình đang áp dụng ở mục Sản phẩm trọng tâm.' AS Msg,
               1 AS MsgType;
        RETURN;
    END
    IF COALESCE(@DocumentID, '') = '' OR LEN(@DocumentID) > 30
    BEGIN
        SELECT N'DocumentID bắt buộc và không được vượt quá 30 ký tự.' AS Msg, 1 AS MsgType;
        RETURN;
    END
    IF @TuNgay IS NULL OR @DenNgay IS NULL OR @TuNgay > @DenNgay
    BEGIN
        SELECT N'Khoảng ngày không hợp lệ.' AS Msg, 1 AS MsgType;
        RETURN;
    END
    IF (COALESCE(@JsonItems, '') NOT IN ('', '[]') AND ISJSON(@JsonItems) <> 1)
       OR (COALESCE(@JsonRules, '') NOT IN ('', '[]') AND ISJSON(@JsonRules) <> 1)
    BEGIN
        SELECT N'Dữ liệu JSON không hợp lệ.' AS Msg, 1 AS MsgType;
        RETURN;
    END
    IF COALESCE(@JsonItems, '') NOT IN ('', '[]')
       AND EXISTS (
           SELECT 1
           FROM OPENJSON(@JsonItems) WITH (ItemID VARCHAR(50) '$.ItemID') J
           WHERE COALESCE(J.ItemID, '') = '' OR NOT EXISTS (SELECT 1 FROM CF_ItemTbl I WHERE I.ItemID = J.ItemID)
       )
    BEGIN
        SELECT N'Danh sách có sản phẩm không tồn tại.' AS Msg, 1 AS MsgType;
        RETURN;
    END

    /* CHẶN GHI — mặc định. Mọi bước kiểm tra ở trên đã chạy xong, nên người dùng
       vẫn biết dữ liệu của mình hợp lệ hay không; chỉ khác là không ghi xuống.
       Báo rõ SẼ thay đổi những gì để người xem đối chiếu trước khi quyết định. */
    IF @Apply = 0
    BEGIN
        SELECT
            @DocumentID AS DocumentID,
            CASE WHEN EXISTS (SELECT 1 FROM AR_SanPhamTrongTamTbl WHERE DocumentID = @DocumentID)
                 THEN N'CAP_NHAT_CHUONG_TRINH_DA_CO' ELSE N'TAO_CHUONG_TRINH_MOI' END AS ThaoTacDuKien,
            @TuNgay AS TuNgay,
            @DenNgay AS DenNgay,
            CASE WHEN COALESCE(@JsonItems, '') IN ('', '[]') THEN 0
                 ELSE (SELECT COUNT(*) FROM OPENJSON(@JsonItems)) END AS SoSanPhamSeNap,
            CASE WHEN COALESCE(@JsonRules, '') IN ('', '[]') THEN 0
                 ELSE (SELECT COUNT(*) FROM OPENJSON(@JsonRules)) END AS SoMocThuongSeNap,
            (SELECT COUNT(*) FROM AR_SanPhamTrongTamDetailTbl WHERE DocumentID = @DocumentID) AS SoSanPhamHienTai,
            (SELECT COUNT(*) FROM AR_PromotionGiftTbl WHERE DocumentID = @DocumentID) AS SoMocThuongHienTai,
            N'XEM_TRUOC_KHONG_GHI' AS ActionStatus,
            N'Dữ liệu hợp lệ. Đây là chế độ xem trước — hệ thống CHƯA ghi gì. '
          + N'Trong giai đoạn Pilot, chương trình sản phẩm trọng tâm không được tạo/sửa thật.' AS Msg,
            0 AS MsgType;
        RETURN;
    END

    BEGIN TRY
        BEGIN TRANSACTION;

        -- 1. Cập nhật Header
        IF EXISTS (SELECT 1 FROM AR_SanPhamTrongTamTbl WHERE DocumentID = @DocumentID)
        BEGIN
            UPDATE AR_SanPhamTrongTamTbl SET FromDate = @TuNgay, ToDate = @DenNgay, Memo = @Memo WHERE DocumentID = @DocumentID;
        END
        ELSE
        BEGIN
            INSERT INTO AR_SanPhamTrongTamTbl (DocumentID, FromDate, ToDate, Memo, isLock, UserCreate, DateCreate)
            VALUES (@DocumentID, @TuNgay, @DenNgay, @Memo, 0, @Username, GETDATE());
        END

        -- FIX LỖI FOREIGN KEY cho bảng Promotion
        IF NOT EXISTS (SELECT 1 FROM AR_PromotionTbl WHERE DocumentID = @DocumentID)
            INSERT INTO AR_PromotionTbl (DocumentID, FromDate, ToDate, TenChuongTrinh, isDisable, UserCreate, DateCreate)
            VALUES (@DocumentID, @TuNgay, @DenNgay, @Memo, 0, @Username, GETDATE());

        -- 2. Chỉ cập nhật Sản phẩm nếu JSON có dữ liệu
        IF @JsonItems IS NOT NULL AND @JsonItems <> '' AND @JsonItems <> '[]'
        BEGIN
            DELETE FROM AR_SanPhamTrongTamDetailTbl WHERE DocumentID = @DocumentID;
            INSERT INTO AR_SanPhamTrongTamDetailTbl (UserAutoID, DocumentID, ItemID, Notes)
            SELECT NEWID(), @DocumentID, ItemID, Notes FROM OPENJSON(@JsonItems)
            WITH (ItemID VARCHAR(50) '$.ItemID', Notes NVARCHAR(500) '$.Notes');
        END

        -- 3. Chỉ cập nhật Mốc thưởng nếu JSON có dữ liệu
        IF @JsonRules IS NOT NULL AND @JsonRules <> '' AND @JsonRules <> '[]'
        BEGIN
            DELETE FROM AR_PromotionGiftTbl WHERE DocumentID = @DocumentID;
            INSERT INTO AR_PromotionGiftTbl (UserAutoID, DocumentID, TuDiem, DenDiem, QuaTang, Notes)
            SELECT NEWID(), @DocumentID, TuDiem, DenDiem, QuaTang, N'Nạp từ n8n' FROM OPENJSON(@JsonRules)
            WITH (TuDiem DECIMAL(18,2) '$.TuDiem', DenDiem DECIMAL(18,2) '$.DenDiem', QuaTang NVARCHAR(500) '$.QuaTang');
        END

        COMMIT TRANSACTION;
        SELECT @DocumentID AS DocumentID, N'Thành công: Đã cập nhật dữ liệu.' AS Msg, 0 AS MsgType;
    END TRY
    BEGIN CATCH
        IF @@TRANCOUNT > 0 ROLLBACK TRANSACTION;
        SELECT ERROR_MESSAGE() AS Msg, 1 AS MsgType;
    END CATCH
END
GO

UPDATE f
SET IsSystemParam = 1,
    SourceOfTruth = 'VERIFIED_IDENTITY'
FROM dbo.API_Field f
JOIN dbo.API_Definition d ON d.ApiID = f.ApiID
WHERE d.ApiCode = '@san_pham_trong_tam_import'
  AND f.FieldCode = '@Username';
GO
