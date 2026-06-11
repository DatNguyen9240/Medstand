-- ==============================================================================
-- DỰ ÁN: Medstand ERP AI Integration
-- MỤC ĐÍCH: Bổ sung dữ liệu UAT hoàn chỉnh cho 13 tài khoản (7 Quản lý, 6 TDV)
--           để đảm bảo không còn chỉ số nào bằng 0 hoặc bị trống.
-- PHIÊN BẢN: V38 · 05/2026
-- ==============================================================================

BEGIN TRANSACTION;
BEGIN TRY

    PRINT '----------------------------------------------------------------------';
    PRINT '⚙️ BƯỚC 1: DỌN DẸP DỮ LIỆU UAT CŨ ĐỂ ĐẢM BẢO IDEMPOTENT';
    PRINT '----------------------------------------------------------------------';

    -- Xóa dư nợ đầu kỳ cũ của UAT
    DELETE FROM SY_BalanceObjectTbl WHERE DocumentID LIKE 'DK_UAT_%';
    
    -- Xóa đơn hàng chờ duyệt cũ của UAT
    DELETE FROM AR_OrderTbl WHERE DocumentID = 'ORD_WAIT_UAT';

    PRINT '✅ Đã dọn dẹp dữ liệu UAT cũ thành công!';

    PRINT '----------------------------------------------------------------------';
    PRINT '⚙️ BƯỚC 2: CẬP NHẬT LỊCH TRÌNH ĐI TUYẾN PHỦ CẢ TUẦN CHO KHÁCH MỤC TIÊU';
    PRINT '----------------------------------------------------------------------';

    -- Cấu hình động theo ngày hiện tại trong tuần (nếu là Chủ nhật thì gán Thứ 2 để khớp Weekend Shift Guard)
    DECLARE @TodayThu NVARCHAR(10);
    SET DATEFIRST 7;
    SELECT @TodayThu = CASE DATEPART(dw, GETDATE())
        WHEN 1 THEN N'Thứ 2' -- Shift Chủ nhật sang Thứ 2
        WHEN 2 THEN N'Thứ 2'
        WHEN 3 THEN N'Thứ 3'
        WHEN 4 THEN N'Thứ 4'
        WHEN 5 THEN N'Thứ 5'
        WHEN 6 THEN N'Thứ 6'
        WHEN 7 THEN N'Thứ 7'
    END;

    UPDATE CF_ObjectTbl
    SET ThuTrongTuan = @TodayThu
    WHERE ObjectID IN ('HPA515', 'HPA117', 'HPA189', 'BNB161', 'BNB171', 'BNB020', 'HUEB111', 'HUEB105', 'HUEB016', 'QANA371', 'QANA321', 'QANA353', 'DL012', 'DL015', 'DL016', 'SGNB0018', 'SGQ70240', 'SGNB0070');

    PRINT '✅ Đã cập nhật ThuTrongTuan thành ' + @TodayThu + ' cho 18 khách hàng mục tiêu của 6 TDV!';

    PRINT '----------------------------------------------------------------------';
    PRINT '⚙️ BƯỚC 3: BƠM DƯ NỢ ĐẦU KỲ CHO KHÁCH HÀNG ĐỂ TẠO CÔNG NỢ THỰC TẾ';
    PRINT '----------------------------------------------------------------------';

    -- Lấy PeriodID hiện tại đang có hiệu lực trong DB để khớp với SY_GetDebitDocFnc
    DECLARE @ActivePeriodID VARCHAR(10);
    SELECT @ActivePeriodID = dbo.SY_GetBalancePeriodFnc(GETDATE());
    PRINT '⚙️ Active PeriodID for UAT balance: ' + COALESCE(@ActivePeriodID, 'NULL');

    -- Cặp 1: TDV_NAMDINHB (EmployeeID) dưới quyền QLBH013.MED (MED0330)
    INSERT INTO SY_BalanceObjectTbl (UserAutoID, AccountID, ObjectID, Amount, IsDebit, IsBalance, DocumentID, DocumentDate, EmployeeID, ManagerID, BranchID, Memo, PeriodID)
    VALUES 
    (NEWID(), '1311', 'HPA515', 45000000, 1, 1, 'DK_UAT_HPA515', '2016-01-01', 'TDV_NAMDINHB', 'MED0330', 'MB', N'Số dư nợ đầu kỳ UAT - TDV Nam Định B', @ActivePeriodID);

    -- Cặp 2: TDV_BACNINHA (EmployeeID) dưới quyền QLBH016.MED (MED0229)
    -- Giúp cả TDV và Quản lý Trần Văn Hướng (đang bị 0 khách nợ) đều thấy nợ!
    INSERT INTO SY_BalanceObjectTbl (UserAutoID, AccountID, ObjectID, Amount, IsDebit, IsBalance, DocumentID, DocumentDate, EmployeeID, ManagerID, BranchID, Memo, PeriodID)
    VALUES 
    (NEWID(), '1311', 'BNB161', 55000000, 1, 1, 'DK_UAT_BNB161', '2016-01-01', 'TDV_BACNINHA', 'MED0229', 'MB', N'Số dư nợ đầu kỳ UAT - TDV Bắc Ninh A', @ActivePeriodID);

    -- Cặp 3: TDV_HUEB (EmployeeID) dưới quyền QLBH005.MED (MED0185)
    INSERT INTO SY_BalanceObjectTbl (UserAutoID, AccountID, ObjectID, Amount, IsDebit, IsBalance, DocumentID, DocumentDate, EmployeeID, ManagerID, BranchID, Memo, PeriodID)
    VALUES 
    (NEWID(), '1311', 'HUEB111', 35000000, 1, 1, 'DK_UAT_HUEB111', '2016-01-01', 'TDV_HUEB', 'MED0185', 'MT', N'Số dư nợ đầu kỳ UAT - TDV Huế B', @ActivePeriodID);

    -- Cặp 4: TDV_DANANGA (EmployeeID) dưới quyền QLBH010.MED (MED0096)
    INSERT INTO SY_BalanceObjectTbl (UserAutoID, AccountID, ObjectID, Amount, IsDebit, IsBalance, DocumentID, DocumentDate, EmployeeID, ManagerID, BranchID, Memo, PeriodID)
    VALUES 
    (NEWID(), '1311', 'QANA371', 65000000, 1, 1, 'DK_UAT_QANA371', '2016-01-01', 'TDV_DANANGA', 'MED0096', 'MT', N'Số dư nợ đầu kỳ UAT - TDV Đà Nẵng A', @ActivePeriodID);

    -- Cặp 5: TDV_CANTHOA (EmployeeID) dưới quyền QLMN2 (MED0134)
    -- Giúp cả TDV và Quản lý Trần Văn Luân (đang bị 0 khách nợ) đều thấy nợ!
    INSERT INTO SY_BalanceObjectTbl (UserAutoID, AccountID, ObjectID, Amount, IsDebit, IsBalance, DocumentID, DocumentDate, EmployeeID, ManagerID, BranchID, Memo, PeriodID)
    VALUES 
    (NEWID(), '1311', 'DL012', 25000000, 1, 1, 'DK_UAT_DL012', '2016-01-01', 'TDV_CANTHOA', 'MED0134', 'MN', N'Số dư nợ đầu kỳ UAT - TDV Cần Thơ A', @ActivePeriodID);

    -- Cặp 6: TDV_BINHPHUOCA (EmployeeID) dưới quyền QLMD1 (QLMD1) và QLBH024.MED (QLBH024)
    INSERT INTO SY_BalanceObjectTbl (UserAutoID, AccountID, ObjectID, Amount, IsDebit, IsBalance, DocumentID, DocumentDate, EmployeeID, ManagerID, BranchID, Memo, PeriodID)
    VALUES 
    (NEWID(), '1311', 'SGNB0018', 75000000, 1, 1, 'DK_UAT_SGNB0018', '2016-01-01', 'TDV_BINHPHUOCA', 'QLMD1', 'MN', N'Số dư nợ đầu kỳ UAT - TDV Bình Phước A', @ActivePeriodID);

    PRINT '✅ Đã bơm dữ liệu công nợ đầu kỳ thành công cho 6 khách hàng đại diện!';

    PRINT '----------------------------------------------------------------------';
    PRINT '⚙️ BƯỚC 4: TẠO ĐƠN HÀNG CHỜ DUYỆT MẪU CHO QLMD1 / TDV_BINHPHUOCA';
    PRINT '----------------------------------------------------------------------';

    -- Đơn hàng chờ duyệt mẫu giúp QLMD1 kích hoạt chỉ số Đơn chờ duyệt > 0
    INSERT INTO AR_OrderTbl (DocumentID, DocumentDate, ObjectID, Memo, BaseTotal, StatusID, EmployeeID, ManagerID, Phone, BranchID)
    VALUES 
    ('ORD_WAIT_UAT', '2026-05-24', 'SGNB0018', N'Đơn hàng chờ duyệt UAT cho QLMD1', 15000000, 0, 'TDV_BINHPHUOCA', 'QLMD1', '0912345678', 'MN');

    PRINT '✅ Đã tạo đơn hàng chờ duyệt mẫu thành công!';

    COMMIT TRANSACTION;
    PRINT '----------------------------------------------------------------------';
    PRINT '🎉 CẬP NHẬT DỮ LIỆU UAT THÀNH CÔNG RỰC RỠ!';
    PRINT '----------------------------------------------------------------------';

END TRY
BEGIN CATCH
    IF @@TRANCOUNT > 0 ROLLBACK TRANSACTION;
    DECLARE @ErrMsg NVARCHAR(500) = ERROR_MESSAGE();
    PRINT N'❌ LỖI KHI CẬP NHẬT DỮ LIỆU: ' + @ErrMsg;
END CATCH;
