-- ==============================================================================
-- DỰ ÁN: Medstand ERP AI Integration
-- MỤC ĐÍCH: Khởi tạo và đồng bộ 7 tài khoản Trình Dược Viên (TDV/Sale) để kiểm thử phân quyền
--           giúp Quản lý xem được toàn bộ dữ liệu nhóm, còn TDV chỉ xem được dữ liệu cá nhân.
-- PHIÊN BẢN: V38 · 05/2026
-- ==============================================================================

BEGIN TRANSACTION;
BEGIN TRY

    -- 1. Đảm bảo cấu trúc cột cơ bản của SY_User đã sẵn sàng
    -- (Các cột EmployeeID, ManagerID, BranchID, Manager, Disable đã được kiểm chứng qua các API)
    
    PRINT '----------------------------------------------------------------------';
    PRINT '⚙️ BƯỚC 1: KHỞI TẠO HOẶC CẬP NHẬT CÁC TÀI KHOẢN QUẢN LÝ (MANAGERS)';
    PRINT '----------------------------------------------------------------------';

    -- Đảm bảo các Quản lý được kích hoạt vai trò Manager (Manager = 1)
    -- Vùng Miền Bắc (MB)
    IF EXISTS (SELECT 1 FROM SY_User WHERE UserName = 'QLBH013.MED')
    BEGIN
        UPDATE SY_User SET Manager = 1, EmployeeID = 'MED0330', Disable = 0 WHERE UserName = 'QLBH013.MED';
        PRINT '✅ Cập nhật Quản lý Mai Anh Tuấn (QLBH013.MED)';
    END
    ELSE
    BEGIN
        INSERT INTO SY_User (UserName, HoTen, EmployeeID, Manager, Disable, BranchID)
        VALUES ('QLBH013.MED', N'Mai Anh Tuấn', 'MED0330', 1, 0, 'MB');
        PRINT '🆕 Thêm mới Quản lý Mai Anh Tuấn (QLBH013.MED)';
    END

    IF EXISTS (SELECT 1 FROM SY_User WHERE UserName = 'QLBH016.MED')
    BEGIN
        UPDATE SY_User SET Manager = 1, EmployeeID = 'MED0229', Disable = 0 WHERE UserName = 'QLBH016.MED';
        PRINT '✅ Cập nhật Quản lý Trần Văn Hướng (QLBH016.MED)';
    END
    ELSE
    BEGIN
        INSERT INTO SY_User (UserName, HoTen, EmployeeID, Manager, Disable, BranchID)
        VALUES ('QLBH016.MED', N'Trần Văn Hướng', 'MED0229', 1, 0, 'MB');
        PRINT '🆕 Thêm mới Quản lý Trần Văn Hướng (QLBH016.MED)';
    END

    -- Vùng Miền Trung (MT)
    IF EXISTS (SELECT 1 FROM SY_User WHERE UserName = 'QLBH005.MED')
    BEGIN
        UPDATE SY_User SET Manager = 1, EmployeeID = 'MED0185', Disable = 0 WHERE UserName = 'QLBH005.MED';
        PRINT '✅ Cập nhật Quản lý Nguyễn Thế Anh (QLBH005.MED)';
    END
    ELSE
    BEGIN
        INSERT INTO SY_User (UserName, HoTen, EmployeeID, Manager, Disable, BranchID)
        VALUES ('QLBH005.MED', N'Nguyễn Thế Anh', 'MED0185', 1, 0, 'MT');
        PRINT '🆕 Thêm mới Quản lý Nguyễn Thế Anh (QLBH005.MED)';
    END

    IF EXISTS (SELECT 1 FROM SY_User WHERE UserName = 'QLBH010.MED')
    BEGIN
        UPDATE SY_User SET Manager = 1, EmployeeID = 'MED0096', Disable = 0 WHERE UserName = 'QLBH010.MED';
        PRINT '✅ Cập nhật Quản lý Nguyễn Văn Việt Anh (QLBH010.MED)';
    END
    ELSE
    BEGIN
        INSERT INTO SY_User (UserName, HoTen, EmployeeID, Manager, Disable, BranchID)
        VALUES ('QLBH010.MED', N'Nguyễn Văn Việt Anh', 'MED0096', 1, 0, 'MT');
        PRINT '🆕 Thêm mới Quản lý Nguyễn Văn Việt Anh (QLBH010.MED)';
    END

    -- Vùng Miền Nam (MN)
    IF EXISTS (SELECT 1 FROM SY_User WHERE UserName = 'QLMN2')
    BEGIN
        UPDATE SY_User SET Manager = 1, EmployeeID = 'MED0134', Disable = 0 WHERE UserName = 'QLMN2';
        PRINT '✅ Cập nhật Quản lý Trần Văn Luân (QLMN2)';
    END
    ELSE
    BEGIN
        INSERT INTO SY_User (UserName, HoTen, EmployeeID, Manager, Disable, BranchID)
        VALUES ('QLMN2', N'Trần Văn Luân', 'MED0134', 1, 0, 'MN');
        PRINT '🆕 Thêm mới Quản lý Trần Văn Luân (QLMN2)';
    END

    IF EXISTS (SELECT 1 FROM SY_User WHERE UserName = 'QLMD1')
    BEGIN
        UPDATE SY_User SET Manager = 1, EmployeeID = 'QLMD1', Disable = 0 WHERE UserName = 'QLMD1';
        PRINT '✅ Cập nhật Quản lý Nguyễn Văn Thái (QLMD1)';
    END
    ELSE
    BEGIN
        INSERT INTO SY_User (UserName, HoTen, EmployeeID, Manager, Disable, BranchID)
        VALUES ('QLMD1', N'Nguyễn Văn Thái', 'QLMD1', 1, 0, 'MN');
        PRINT '🆕 Thêm mới Quản lý Nguyễn Văn Thái (QLMD1)';
    END

    IF EXISTS (SELECT 1 FROM SY_User WHERE UserName = 'QLBH024.MED')
    BEGIN
        UPDATE SY_User SET Manager = 1, EmployeeID = 'QLBH024', Disable = 0 WHERE UserName = 'QLBH024.MED';
        PRINT '✅ Cập nhật Quản lý Ngô Đức Hùng (QLBH024.MED)';
    END
    ELSE
    BEGIN
        INSERT INTO SY_User (UserName, HoTen, EmployeeID, Manager, Disable, BranchID)
        VALUES ('QLBH024.MED', N'Ngô Đức Hùng', 'QLBH024', 1, 0, 'MN');
        PRINT '🆕 Thêm mới Quản lý Ngô Đức Hùng (QLBH024.MED)';
    END


    PRINT '----------------------------------------------------------------------';
    PRINT '⚙️ BƯỚC 2: KHỞI TẠO VÀ LIÊN KẾT TÀI KHOẢN TRÌNH DƯỢC VIÊN (TDV/SALES)';
    PRINT '----------------------------------------------------------------------';

    -- Hàm/Lệnh đồng bộ thông tin TDV phụ thuộc vào Quản lý (BranchID, ManagerID, StoreHouseID,...)
    
    -- 1. TDV: NAMDINHB.MED (Sale dưới quyền QLBH013.MED - Mai Anh Tuấn)
    IF EXISTS (SELECT 1 FROM SY_User WHERE UserName = 'NAMDINHB.MED')
    BEGIN
        UPDATE SY_User 
        SET HoTen = N'Đoàn Văn Thế', Manager = 0, EmployeeID = 'MED0085', ManagerID = 'MED0330', BranchID = 'MB', Disable = 0
        WHERE UserName = 'NAMDINHB.MED';
        PRINT '✅ Liên kết TDV NAMDINHB.MED -> Manager QLBH013.MED (Mai Anh Tuấn)';
    END
    ELSE
    BEGIN
        INSERT INTO SY_User (UserName, HoTen, EmployeeID, Manager, ManagerID, BranchID, Disable)
        VALUES ('NAMDINHB.MED', N'Đoàn Văn Thế', 'MED0085', 0, 'MED0330', 'MB', 0);
        PRINT '🆕 Tạo mới & Liên kết TDV NAMDINHB.MED -> Manager QLBH013.MED (Mai Anh Tuấn)';
    END

    -- 2. TDV: BACNINHA.MED (Sale dưới quyền QLBH016.MED - Trần Văn Hướng)
    IF EXISTS (SELECT 1 FROM SY_User WHERE UserName = 'BACNINHA.MED')
    BEGIN
        UPDATE SY_User 
        SET Manager = 0, EmployeeID = 'TDV_BACNINHA', ManagerID = 'MED0229', BranchID = 'MB', Disable = 0
        WHERE UserName = 'BACNINHA.MED';
        PRINT '✅ Liên kết TDV BACNINHA.MED -> Manager QLBH016.MED (Trần Văn Hướng)';
    END
    ELSE
    BEGIN
        INSERT INTO SY_User (UserName, HoTen, EmployeeID, Manager, ManagerID, BranchID, Disable)
        VALUES ('BACNINHA.MED', N'TDV Bắc Ninh A', 'TDV_BACNINHA', 0, 'MED0229', 'MB', 0);
        PRINT '🆕 Tạo mới & Liên kết TDV BACNINHA.MED -> Manager QLBH016.MED (Trần Văn Hướng)';
    END

    -- 3. TDV: HUEB.MED (Sale dưới quyền QLBH005.MED - Nguyễn Thế Anh)
    IF EXISTS (SELECT 1 FROM SY_User WHERE UserName = 'HUEB.MED')
    BEGIN
        UPDATE SY_User 
        SET Manager = 0, EmployeeID = 'TDV_HUEB', ManagerID = 'MED0185', BranchID = 'MT', Disable = 0
        WHERE UserName = 'HUEB.MED';
        PRINT '✅ Liên kết TDV HUEB.MED -> Manager QLBH005.MED (Nguyễn Thế Anh)';
    END
    ELSE
    BEGIN
        INSERT INTO SY_User (UserName, HoTen, EmployeeID, Manager, ManagerID, BranchID, Disable)
        VALUES ('HUEB.MED', N'TDV Huế B', 'TDV_HUEB', 0, 'MED0185', 'MT', 0);
        PRINT '🆕 Tạo mới & Liên kết TDV HUEB.MED -> Manager QLBH005.MED (Nguyễn Thế Anh)';
    END

    -- 4. TDV: DANANGA.MED (Sale dưới quyền QLBH010.MED - Nguyễn Văn Việt Anh)
    IF EXISTS (SELECT 1 FROM SY_User WHERE UserName = 'DANANGA.MED')
    BEGIN
        UPDATE SY_User 
        SET Manager = 0, EmployeeID = 'TDV_DANANGA', ManagerID = 'MED0096', BranchID = 'MT', Disable = 0
        WHERE UserName = 'DANANGA.MED';
        PRINT '✅ Liên kết TDV DANANGA.MED -> Manager QLBH010.MED (Nguyễn Văn Việt Anh)';
    END
    ELSE
    BEGIN
        INSERT INTO SY_User (UserName, HoTen, EmployeeID, Manager, ManagerID, BranchID, Disable)
        VALUES ('DANANGA.MED', N'TDV Đà Nẵng A', 'TDV_DANANGA', 0, 'MED0096', 'MT', 0);
        PRINT '🆕 Tạo mới & Liên kết TDV DANANGA.MED -> Manager QLBH010.MED (Nguyễn Văn Việt Anh)';
    END

    -- 5. TDV: CanThoA (Sale dưới quyền QLMN2 - Trần Văn Luân)
    IF EXISTS (SELECT 1 FROM SY_User WHERE UserName = 'CanThoA')
    BEGIN
        UPDATE SY_User 
        SET Manager = 0, EmployeeID = 'TDV_CANTHOA', ManagerID = 'MED0134', BranchID = 'MN', Disable = 0
        WHERE UserName = 'CanThoA';
        PRINT '✅ Liên kết TDV CanThoA -> Manager QLMN2 (Trần Văn Luân)';
    END
    ELSE
    BEGIN
        INSERT INTO SY_User (UserName, HoTen, EmployeeID, Manager, ManagerID, BranchID, Disable)
        VALUES ('CanThoA', N'TDV Cần Thơ A', 'TDV_CANTHOA', 0, 'MED0134', 'MN', 0);
        PRINT '🆕 Tạo mới & Liên kết TDV CanThoA -> Manager QLMN2 (Trần Văn Luân)';
    END

    -- 6. TDV: BinhPhuocA (Sale dưới quyền QLMD1 - Nguyễn Văn Thái và QLBH024.MED - Ngô Đức Hùng)
    -- Ghi chú: Vì BinhPhuocA dưới quyền cả 2 quản lý, ta lấy mặc định QLMD1 làm Manager chính
    IF EXISTS (SELECT 1 FROM SY_User WHERE UserName = 'BinhPhuocA')
    BEGIN
        UPDATE SY_User 
        SET Manager = 0, EmployeeID = 'TDV_BINHPHUOCA', ManagerID = 'QLMD1', BranchID = 'MN', Disable = 0
        WHERE UserName = 'BinhPhuocA';
        PRINT '✅ Liên kết TDV BinhPhuocA -> Manager QLMD1 (Nguyễn Văn Thái)';
    END
    ELSE
    BEGIN
        INSERT INTO SY_User (UserName, HoTen, EmployeeID, Manager, ManagerID, BranchID, Disable)
        VALUES ('BinhPhuocA', N'TDV Bình Phước A', 'TDV_BINHPHUOCA', 0, 'QLMD1', 'MN', 0);
        PRINT '🆕 Tạo mới & Liên kết TDV BinhPhuocA -> Manager QLMD1 (Nguyễn Văn Thái)';
    END

    COMMIT TRANSACTION;
    PRINT '----------------------------------------------------------------------';
    PRINT '✅ ĐỒNG BỘ TÀI KHOẢN UAT TDV HOÀN TẤT THÀNH CÔNG!';
    PRINT '----------------------------------------------------------------------';

END TRY
BEGIN CATCH
    IF @@TRANCOUNT > 0 ROLLBACK TRANSACTION;
    DECLARE @ErrMsg NVARCHAR(500) = ERROR_MESSAGE();
    PRINT N'❌ LỖI KHI ĐỒNG BỘ: ' + @ErrMsg;
END CATCH;
