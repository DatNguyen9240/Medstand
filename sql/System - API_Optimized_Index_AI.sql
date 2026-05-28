-- ==============================================================================
-- CÔNG CỤ TẠO CHỈ MỤC TỐI ƯU HÓA TRUY VẤN DOANH SỐ DASHBOARD
-- Dự án: Medstand ERP AI Integration
-- Mục đích: Tạo các chỉ mục phi cụm (Non-Clustered Index) để tối ưu hóa triệt để
--           tốc độ truy xuất và tính toán doanh số của Dashboard AI từ hàng chục giây
--           xuống còn dưới 1 giây.
-- Cột sử dụng: Khớp chính xác 100% cột vật lý BaseTotal của hệ thống.
-- ==============================================================================

USE medtest;
GO

PRINT '⚙️ ĐANG KHỞI TẠO CÁC CHỈ MỤC TỐI ƯU HIỆU NĂNG...';
GO

-- 1. Tạo Index cho bảng Hóa đơn bán lẻ (AR_InvoiceTbl)
IF EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_AR_InvoiceTbl_DocumentDate_BranchID')
BEGIN
    DROP INDEX IX_AR_InvoiceTbl_DocumentDate_BranchID ON dbo.AR_InvoiceTbl;
END
GO

CREATE NONCLUSTERED INDEX IX_AR_InvoiceTbl_DocumentDate_BranchID
ON dbo.AR_InvoiceTbl (DocumentDate, BranchID)
INCLUDE (ObjectID, EmployeeID, StatusID, BaseTotal);
GO
PRINT '✅ Đã tạo thành công chi mục: IX_AR_InvoiceTbl_DocumentDate_BranchID';
GO

-- 2. Tạo Index cho bảng Đơn hàng (AR_OrderTbl)
IF EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_AR_OrderTbl_DocumentDate_BranchID')
BEGIN
    DROP INDEX IX_AR_OrderTbl_DocumentDate_BranchID ON dbo.AR_OrderTbl;
END
GO

CREATE NONCLUSTERED INDEX IX_AR_OrderTbl_DocumentDate_BranchID
ON dbo.AR_OrderTbl (DocumentDate, BranchID)
INCLUDE (ObjectID, EmployeeID, StatusID, BaseTotal);
GO
PRINT '✅ Đã tạo thành công chi mục: IX_AR_OrderTbl_DocumentDate_BranchID';
GO

PRINT '======================================================================';
PRINT '🎉 QUÁ TRÌNH TẠO CHỈ MỤC TỐI ƯU HOÀN TẤT THÀNH CÔNG!';
PRINT '======================================================================';
GO
