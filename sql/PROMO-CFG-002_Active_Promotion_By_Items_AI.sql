SET ANSI_NULLS ON;
GO
SET QUOTED_IDENTIFIER ON;
GO

/*
  PROMO-CFG-002 — API mỏng bọc dbo.AI_ActivePromotionByUserFnc (đã có sẵn từ PROMO-002) cho
  nhiều ItemID cùng lúc, để frontend Lập đơn/Sửa đơn xem trước CTBH cấu hình đang áp dụng
  trước khi tạo đơn thật. Chỉ đọc, không ghi. Không giới hạn theo cấp quản lý — Sale cần thấy
  đúng CTBH đang áp dụng cho sản phẩm mình bán, giống cách xem giá/tồn.

  Việc tính "rule nào thắng" (ưu tiên theo Priority, rồi tới mốc số lượng/giá trị cao nhất còn
  thoả mãn) do CLIENT tự làm dựa trên toàn bộ rule trả về ở đây — đúng logic mà
  API_DonHangChiTiet_Insert_AI đã dùng để tính giá thật phía server (xem PROMO-CFG-001).
  Đây chỉ là xem trước; server vẫn luôn tính lại và là nguồn sự thật cuối cùng khi tạo đơn.
*/
CREATE OR ALTER PROCEDURE dbo.API_PromotionActiveByItems_AI
    @Username     VARCHAR(50) = '',
    @JsonItemIDs  NVARCHAR(MAX) = '[]'
AS
BEGIN
    SET NOCOUNT ON;

    IF NOT EXISTS (SELECT 1 FROM dbo.SY_User WHERE UserName = @Username AND COALESCE(Disable, 0) = 0)
    BEGIN
        SELECT N'Tài khoản không hợp lệ hoặc đã bị khóa.' AS Msg, 1 AS MsgType;
        RETURN;
    END
    IF ISJSON(@JsonItemIDs) <> 1
    BEGIN
        SELECT N'Danh sách sản phẩm không hợp lệ.' AS Msg, 1 AS MsgType;
        RETURN;
    END
    IF OBJECT_ID(N'dbo.AI_ActivePromotionByUserFnc', N'IF') IS NULL RETURN;

    SELECT CAST('PROMOTION_BENEFIT_V2' AS VARCHAR(40)) AS PromotionBenefitContractVersion, F.*
    FROM OPENJSON(@JsonItemIDs) WITH (ItemID VARCHAR(50) '$') J
    CROSS APPLY dbo.AI_ActivePromotionByUserFnc(@Username, J.ItemID, SYSUTCDATETIME()) F
    ORDER BY F.ItemID, F.Priority ASC, F.PromotionItemRuleID ASC;
END
GO
