USE medtest;
GO

/* Tạm ẩn Dashboard Sinh nhật khỏi danh sách chatbot khi chức năng chưa có dữ liệu ổn định.
   Không xóa API/procedure; có thể bật lại bằng cách đổi IsActive = 1. */
UPDATE dbo.API_Definition
SET IsActive = 0
WHERE StoredProcedure = 'API_Dashboard_SinhNhat_AI'
   OR ApiCode IN ('@dashboard_sinhnhat', '@sinhnhat');
GO

SELECT ApiCode, StoredProcedure, ApiName, IsActive
FROM dbo.API_Definition
WHERE StoredProcedure = 'API_Dashboard_SinhNhat_AI'
   OR ApiCode IN ('@dashboard_sinhnhat', '@sinhnhat');
GO
