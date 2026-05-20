-- =========================================================================
-- KỊCH BẢN KIỂM TRA 4 BẢNG DỮ LIỆU CỐT LÕI (CHỈ ĐỌC - KHÔNG XÓA SỬA)
-- V2: Sửa tên cột chuẩn
-- =========================================================================
SET NOCOUNT ON;

PRINT N'--- 1. BÁO CÁO SỐ LƯỢNG DÒNG (RECORDS) TRONG 4 BẢNG ---';
SELECT '1. AR_OrderTbl (Bảng Đơn Hàng)' AS [Tên Bảng], COUNT(*) AS [Tổng Số Dòng] FROM AR_OrderTbl
UNION ALL
SELECT '2. AR_OrderDetailTbl (Bảng Chi tiết Đơn hàng)', COUNT(*) FROM AR_OrderDetailTbl
UNION ALL
SELECT '3. AR_InvoiceTbl (Bảng Hóa Đơn Đã Chốt)', COUNT(*) FROM AR_InvoiceTbl
UNION ALL
SELECT '4. AR_InvoiceDetailTbl (Bảng Chi tiết Hóa đơn)', COUNT(*) FROM AR_InvoiceDetailTbl;

PRINT N' ';
PRINT N'--- 2. XEM 5 ĐƠN HÀNG (ORDER) GẦN NHẤT ---';
SELECT TOP 5 
    DocumentID AS [Mã Đơn Order], 
    FORMAT(DocumentDate, 'dd/MM/yyyy HH:mm') AS [Ngày Lập], 
    ISNULL(EmployeeID, '') AS [Người Lập], 
    ISNULL(ManagerID, '') AS [Quản Lý], 
    ISNULL(ObjectID, '') AS [Mã Khách Hàng], 
    ISNULL(FORMAT(BaseTotal, '#,##0'), '0') AS [Tổng Tiền (VND)]
FROM AR_OrderTbl 
ORDER BY DocumentDate DESC;

PRINT N' ';
PRINT N'--- 3. XEM 5 HÓA ĐƠN (INVOICE) GẦN NHẤT ---';
SELECT TOP 5 
    DocumentID AS [Mã Hóa Đơn], 
    FORMAT(DocumentDate, 'dd/MM/yyyy HH:mm') AS [Ngày Lập], 
    ISNULL(EmployeeID, '') AS [Người Lập], 
    ISNULL(ManagerID, '') AS [Quản Lý], 
    ISNULL(ObjectID, '') AS [Mã Khách Hàng], 
    ISNULL(FORMAT(BaseTotal, '#,##0'), '0') AS [Tổng Tiền (VND)]
FROM AR_InvoiceTbl 
ORDER BY DocumentDate DESC;
