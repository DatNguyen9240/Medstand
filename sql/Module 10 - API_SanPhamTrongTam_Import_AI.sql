IF OBJECT_ID('API_SanPhamTrongTam_Import_AI', 'P') IS NOT NULL DROP PROCEDURE API_SanPhamTrongTam_Import_AI;
GO

CREATE PROCEDURE API_SanPhamTrongTam_Import_AI
    @DocumentID VARCHAR(50),
    @TuNgay   DATETIME,
    @DenNgay     DATETIME,
    @Memo       NVARCHAR(200),
    @JsonItems  NVARCHAR(MAX) = '', -- Để trống sẽ giữ nguyên SP cũ
    @JsonRules  NVARCHAR(MAX) = ''  -- Để trống sẽ giữ nguyên mốc cũ
AS
BEGIN
    SET NOCOUNT ON;
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
            VALUES (@DocumentID, @TuNgay, @DenNgay, @Memo, 0, 'AI_IMPORT', GETDATE());
        END

        -- FIX LỖI FOREIGN KEY cho bảng Promotion
        IF NOT EXISTS (SELECT 1 FROM AR_PromotionTbl WHERE DocumentID = @DocumentID)
            INSERT INTO AR_PromotionTbl (DocumentID, FromDate, ToDate, TenChuongTrinh, isDisable, UserCreate, DateCreate)
            VALUES (@DocumentID, @TuNgay, @DenNgay, @Memo, 0, 'AI_IMPORT', GETDATE());

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
