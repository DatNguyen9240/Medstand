
GO
SET ANSI_NULLS ON
GO
SET QUOTED_IDENTIFIER ON
GO
CREATE OR ALTER PROCEDURE [dbo].[API_DonHangChiTiet_Insert_AI]
    @Username    VARCHAR(50)   = '',
    @DocumentID  VARCHAR(50)   = '',
    @ObjectID    VARCHAR(50)   = '',
    @ItemList    NVARCHAR(MAX) = ''
AS
SET NOCOUNT ON
SET XACT_ABORT ON
-- ═══ GUARD: dọn temp table còn sót lại từ request lỗi trước trên cùng connection ═══
IF OBJECT_ID('tempdb..#Items') IS NOT NULL DROP TABLE #Items;
-- ═══ 1. VALIDATION ═══
IF NOT EXISTS (SELECT 1 FROM SY_User WHERE UserName = @Username AND COALESCE(Disable, 0) = 0)
BEGIN
    SELECT N'ERR:User không tồn tại hoặc đã bị khóa' AS DocumentID, N'User không tồn tại hoặc đã bị khóa' AS Msg, 1 AS MsgType
    RETURN
END
IF COALESCE(@ItemList, '') = '' OR @ItemList = '[]'
BEGIN
    SELECT N'ERR:Danh sách sản phẩm trống' AS DocumentID, N'Danh sách sản phẩm trống' AS Msg, 1 AS MsgType
    RETURN
END
IF ISJSON(@ItemList) <> 1
BEGIN
    SELECT N'ERR:Danh sách sản phẩm không phải JSON hợp lệ' AS DocumentID, N'Danh sách sản phẩm không phải JSON hợp lệ' AS Msg, 1 AS MsgType
    RETURN
END
IF COALESCE(@ObjectID, '') = ''
BEGIN
    SELECT N'ERR:Chưa chọn khách hàng (ObjectID là bắt buộc)' AS DocumentID, N'Chưa chọn khách hàng (ObjectID là bắt buộc)' AS Msg, 1 AS MsgType
    RETURN
END
IF NOT EXISTS (SELECT 1 FROM CF_ObjectTbl WHERE ObjectID = @ObjectID)
BEGIN
    SELECT N'ERR:Mã khách hàng không tồn tại: ' + @ObjectID AS DocumentID, N'Mã khách hàng không tồn tại' AS Msg, 1 AS MsgType
    RETURN
END
IF NOT EXISTS (SELECT 1 FROM dbo.AR_GetObjectByUserFnc(@Username) WHERE ObjectID = @ObjectID)
BEGIN
    SELECT N'ERR:Không có quyền tạo đơn cho khách hàng này' AS DocumentID, N'Không có quyền tạo đơn cho khách hàng này' AS Msg, 1 AS MsgType
    RETURN
END

    -- CHẶN CHỦ ĐỘNG MÃ PHIẾU SAI ĐỊNH DẠNG (TRÁNH LỖI ÉP KIỂU HỆ THỐNG)
    IF COALESCE(@DocumentID, '') <> ''
    BEGIN
        -- 1. Yêu cầu bắt buộc phải có dấu gạch chéo /
        IF CHARINDEX('/', @DocumentID) = 0
        BEGIN
            SELECT N'ERR:Mã phiếu tự điền phải theo định dạng chuẩn (ví dụ: DMB0526/1)' AS DocumentID, N'Mã phiếu không hợp lệ' AS Msg, 1 AS MsgType
            RETURN
        END

        IF LEN(@DocumentID) > 30
        BEGIN
            SELECT N'ERR:Mã phiếu không được vượt quá 30 ký tự' AS DocumentID, N'Mã phiếu không hợp lệ' AS Msg, 1 AS MsgType
            RETURN
        END
        
        -- 2. Yêu cầu phần số thứ tự sau dấu gạch chéo phải là số nguyên
        DECLARE @Suffix VARCHAR(50) = SUBSTRING(@DocumentID, CHARINDEX('/', @DocumentID) + 1, LEN(@DocumentID))
        IF TRY_CAST(@Suffix AS INT) IS NULL
        BEGIN
            SELECT N'ERR:Mã phiếu không hợp lệ. Phần số thứ tự sau dấu gạch chéo phải là chữ số (ví dụ: DMB0526/12).' AS DocumentID, N'Mã phiếu không hợp lệ' AS Msg, 1 AS MsgType
            RETURN
        END
    END

    -- Đã bỏ kiểm tra đơn hàng không tồn tại để tự động khởi tạo nếu truyền mã mới chưa có trong hệ thống
-- ═══ 2. PARSE JSON + LẤY GIÁ ═══
SELECT 
    J.ItemID, 
    SUM(J.Quantity) AS Quantity, 
    MAX(I.ItemName) AS ItemName, 
    COALESCE(J.UnitPrice, J.Price, MAX(P.UnitPrice)) AS UnitPrice, 
    MAX(P.DiemSanPham) AS DiemSanPham,
    MAX(J.DiscountPercent) AS DiscountPercent
INTO #Items
FROM OPENJSON(@ItemList)
WITH (
    ItemID          VARCHAR(50)   '$.ItemID',
    Quantity        DECIMAL(18,2) '$.Quantity',
    Price           DECIMAL(18,2) '$.Price',
    UnitPrice       DECIMAL(18,2) '$.UnitPrice',
    DiscountPercent DECIMAL(18,2) '$.DiscountPercent'
) J
LEFT JOIN CF_ItemTbl I ON I.ItemID = J.ItemID
OUTER APPLY (
    SELECT TOP 1 UnitPrice, DiemSanPham
    FROM AR_PriceView
    WHERE ItemID = J.ItemID
      AND isDisable = 0
    ORDER BY 
      CASE WHEN GETDATE() BETWEEN FromDate AND ToDate THEN 1 ELSE 2 END,
      FromDate DESC
) P
GROUP BY J.ItemID, J.UnitPrice, J.Price

    -- HẠNG MỤC BẢO MẬT BACKEND (SAFEGUARD): Chặn tự ý đưa hàng khuyến mãi 0đ vào đơn nếu không có sản phẩm chính tương ứng
    IF EXISTS (
        SELECT 1 
        FROM #Items I1
        WHERE I1.UnitPrice = 0
          AND NOT EXISTS (
              SELECT 1 
              FROM #Items I2 
              WHERE I2.ItemID = I1.ItemID 
                AND I2.UnitPrice > 0
          )
    )
    BEGIN
        DROP TABLE #Items
        SELECT N'ERR:Sản phẩm khuyến mãi 0đ không hợp lệ (phải có sản phẩm mua chính đi kèm trong đơn hàng)' AS DocumentID, N'Sản phẩm khuyến mãi không hợp lệ' AS Msg, 1 AS MsgType
        RETURN
    END

IF EXISTS (SELECT 1 FROM #Items WHERE ItemName IS NULL)
BEGIN
    DECLARE @BadItems NVARCHAR(500)
    SELECT @BadItems = STRING_AGG(ItemID, ', ') FROM #Items WHERE ItemName IS NULL
    DROP TABLE #Items
    SELECT N'ERR:Sản phẩm không tồn tại: ' + @BadItems AS DocumentID, N'Sản phẩm không tồn tại: ' + @BadItems AS Msg, 1 AS MsgType
    RETURN
END
IF EXISTS (SELECT 1 FROM #Items WHERE COALESCE(Quantity, 0) <= 0)
BEGIN
    DROP TABLE #Items
    SELECT N'ERR:Số lượng phải lớn hơn 0' AS DocumentID, N'Số lượng phải lớn hơn 0' AS Msg, 1 AS MsgType
    RETURN
END
IF EXISTS (SELECT 1 FROM #Items WHERE UnitPrice IS NULL)
BEGIN
    DECLARE @NoPrice NVARCHAR(500)
    SELECT @NoPrice = STRING_AGG(ItemID, ', ') FROM #Items WHERE UnitPrice IS NULL
    DROP TABLE #Items
    SELECT N'ERR:Sản phẩm chưa có giá: ' + @NoPrice AS DocumentID, N'Sản phẩm chưa có giá: ' + @NoPrice AS Msg, 1 AS MsgType
    RETURN
END
-- ═══ 3. TẠO ĐƠN + CHI TIẾT ═══
BEGIN TRANSACTION
BEGIN TRY
    IF COALESCE(@DocumentID, '') = '' OR NOT EXISTS (SELECT 1 FROM AR_OrderTbl WHERE DocumentID = @DocumentID)
    BEGIN
        IF COALESCE(@DocumentID, '') = ''
        BEGIN
            -- 1. Lấy mã chi nhánh của tài khoản đang đăng nhập (mặc định là 'MB' nếu trống)
            DECLARE @UserBranch VARCHAR(10) = 'MB'
            SELECT @UserBranch = COALESCE(BranchID, 'MB') 
            FROM SY_User 
            WHERE UserName = @Username
            
            -- 2. Ghép động tiền tố: 'D' + 'MB' = 'DMB', 'D' + 'MN' = 'DMN'
            DECLARE @Prefix VARCHAR(10) = 'D' + @UserBranch 
                                               + RIGHT('0' + CAST(MONTH(GETDATE()) AS VARCHAR), 2)
                                               + RIGHT(CAST(YEAR(GETDATE()) AS VARCHAR), 2)
            DECLARE @MaxNum INT
            SELECT @MaxNum = ISNULL(MAX(TRY_CAST(
                SUBSTRING(DocumentID, CHARINDEX('/', DocumentID) + 1, LEN(DocumentID)) AS INT
            )), 0)
            FROM AR_OrderTbl WITH (UPDLOCK, HOLDLOCK)
            WHERE DocumentID LIKE @Prefix + '/%'
            SET @DocumentID = @Prefix + '/' + CAST(@MaxNum + 1 AS VARCHAR)
        END

        INSERT INTO AR_OrderTbl (
            DocumentID, DocumentDate, EmployeeID, ManagerID, CeoID,
            ObjectID, BranchID, UserCreate, DateCreate, StatusID
        )
        SELECT @DocumentID, GETDATE(),
               COALESCE(EmployeeID, ''),
               COALESCE(ManagerID, ''),
               COALESCE(CeoID, ''),
               @ObjectID,
               COALESCE(BranchID, ''),
               @Username, GETDATE(), 0
        FROM SY_User WHERE UserName = @Username
    END
    INSERT INTO AR_OrderDetailTbl (
        UserAutoID, DocumentID, ItemID, UnitPrice, Quantity, SoLuongTang,
        Amount, DiscountPercent, DiscountAmount, TotalAmount,
        DiemSanPham, DiemTichLuy, Notes
    )
    SELECT 
        NEWID(), @DocumentID, ItemID,
        COALESCE(UnitPrice, 0), Quantity, 0,
        COALESCE(Quantity, 0) * COALESCE(UnitPrice, 0),
        COALESCE(DiscountPercent, 0),
        COALESCE(Quantity, 0) * COALESCE(UnitPrice, 0) * (COALESCE(DiscountPercent, 0) / 100.0),
        COALESCE(Quantity, 0) * COALESCE(UnitPrice, 0) * (1.0 - COALESCE(DiscountPercent, 0) / 100.0),
        COALESCE(DiemSanPham, 0),
        COALESCE(Quantity, 0) * COALESCE(DiemSanPham, 0),
        ''
    FROM #Items

    -- Tính toán lại tổng tiền/kho (nếu có các Stp bổ trợ)
    EXEC AR_Order_AfterSaveStp @DocumentID

    -- FALLBACK UPDATE TỔNG TIỀN (PHÒNG THỦ KHI AR_Order_AfterSaveStp CHƯA CẬP NHẬT HOẶC KHÔNG TỒN TẠI TRÊN MÔI TRƯỜNG TEST)
    UPDATE AR_OrderTbl
    SET BaseTotal = COALESCE((SELECT SUM(TotalAmount) FROM AR_OrderDetailTbl WHERE DocumentID = @DocumentID), 0)
    WHERE DocumentID = @DocumentID

    COMMIT TRANSACTION
END TRY
BEGIN CATCH
    IF @@TRANCOUNT > 0 ROLLBACK TRANSACTION
    DECLARE @ErrMsg NVARCHAR(500) = ERROR_MESSAGE()
    DROP TABLE IF EXISTS #Items
    SELECT N'ERR:' + @ErrMsg AS DocumentID, N'Hệ thống chưa thể tạo đơn hàng.' AS Msg, 1 AS MsgType
    RETURN
END CATCH
DROP TABLE IF EXISTS #Items
-- ═══ 4. THÀNH CÔNG → trả DocumentID thật ═══
SELECT @DocumentID AS DocumentID
GO



