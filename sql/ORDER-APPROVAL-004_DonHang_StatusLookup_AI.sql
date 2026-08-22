SET ANSI_NULLS ON;
GO
SET QUOTED_IDENTIFIER ON;
GO

/*
  ORDER-APPROVAL-002 (điểm "Khóa sửa đơn") — API đọc thuần, dùng NỘI BỘ bởi gateway
  (src/server/order-edit-lock-guard.js qua server.js) để biết StatusID thật của 1 đơn TRƯỚC
  khi quyết định có cho forward 1 request sửa/xoá dòng sản phẩm hay không. server.js không có
  kết nối DB trực tiếp (đã xác nhận đọc toàn bộ file — chỉ là HTTP proxy), nên gate khóa sửa
  đơn phải gọi qua đúng 1 lệnh gọi HTTP nội bộ tới proc này, giống hệt cách
  resolveVerifiedGatewayIdentity() đã gọi API_UserInfo.

  Không có @Username/phạm vi: cả 2 khoá tra cứu (DocumentID, UserAutoID) đều là giá trị chính
  caller (gateway) đã nhận từ body của request đang xử lý — proc này không mở thêm đường dò
  dữ liệu nào ngoài những gì client đã tự cung cấp. KHÔNG expose endpoint này ra frontend.
*/
CREATE OR ALTER PROCEDURE dbo.API_DonHang_StatusLookup_AI
    @DocumentID  VARCHAR(50) = '',
    @UserAutoID  VARCHAR(50) = ''
AS
BEGIN
    SET NOCOUNT ON;

    SET @DocumentID = LTRIM(RTRIM(COALESCE(@DocumentID, '')));
    SET @UserAutoID = LTRIM(RTRIM(COALESCE(@UserAutoID, '')));

    IF @DocumentID = '' AND @UserAutoID <> ''
        SELECT TOP (1) @DocumentID = DocumentID FROM dbo.AR_OrderDetailTbl WHERE UserAutoID = @UserAutoID;

    SELECT DocumentID, StatusID
    FROM dbo.AR_OrderTbl
    WHERE DocumentID = @DocumentID;
END;
GO
