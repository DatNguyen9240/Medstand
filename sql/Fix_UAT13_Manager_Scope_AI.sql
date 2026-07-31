USE medtest;
GO

SET ANSI_NULLS ON;
GO
SET QUOTED_IDENTIFIER ON;
GO

/*
================================================================================
  Fix_UAT13_Manager_Scope_AI — vá phạm vi cho 2 tài khoản quản lý UAT
  Ngày: 31/07/2026
================================================================================

  ── VẤN ĐỀ ──
  Trong 13 tài khoản UAT, 11 tài khoản có phạm vi đúng (từ 9 đến 11.571 khách).
  Hai tài khoản QUẢN LÝ nhìn thấy TOÀN BỘ 49.559 khách của cả nước:

      QLMD1         49.559 / 49.559  (100%)
      QLBH024.MED   49.559 / 49.559  (100%)

  Đây KHÔNG phải quyền được cấp có chủ đích. Cả hai đều có SY_User.Manager = 1
  nhưng KHÔNG có dòng nào trong AR_OpListDetailTbl. Hàm AR_GetObjectByUserFnc
  gặp trường hợp "là quản lý nhưng không tìm thấy trong sơ đồ tổ chức" thì rẽ
  vào nhánh ban lãnh đạo và trả về tất cả. Nói cách khác hệ thống hiểu nhầm
  "chưa khai giới hạn nào" thành "không có giới hạn".

  So sánh với QLBH013.MED — tài khoản quản lý được cấu hình đúng chuẩn:
      SY_User.EmployeeID = 'MED0330' (mã nhân viên thật)
      AR_OpListDetailTbl : 1 dòng, OpID 45 (QLT06), ObjectGroupID = NULL
      AR_OpListEmployeeTbl: 10 dòng, mỗi dòng một (nhân viên, nhóm)
      -> nhìn thấy 1.886 khách
  File này dựng lại đúng khuôn mẫu đó cho hai tài khoản còn thiếu.

  ── VÌ SAO KHÔNG SỬA SY_User.EmployeeID ──
  Thoạt nhìn QLMD1 giống lỗi gõ nhầm: EmployeeID = 'QLMD1' không tồn tại trong
  danh mục nhân viên, trong khi CeoID = 'MED0127' là một quản lý có thật đã
  được cấu hình đầy đủ. Nhưng ĐỪNG đổi EmployeeID sang MED0127. Mã 'QLMD1' đang
  sống trong dữ liệu giao dịch thật:

      AR_OrderTbl.ManagerID        = 'QLMD1'   671 đơn   (01/2026 -> 20/07/2026)
      AR_InvoiceTbl.ManagerID      = 'QLMD1'   259 hoá đơn (01/2025 -> 19/07/2026)
      GJ_TransactionTbl.ManagerID  = 'QLMD1'   982 dòng
      SY_BalanceObjectTbl.ManagerID= 'QLMD1'   103 dòng
      SY_User.ManagerID            = 'QLMD1'   -> tài khoản BinhPhuocA

  QLMD1 và MED0127 là hai người khác nhau. Đổi mã sẽ vừa giao nhầm vùng của
  người khác, vừa cắt lìa lịch sử giao dịch đang mang mã cũ.

  ── MẮT XÍCH THỰC SỰ BỊ THIẾU ──
  TDV_BINHPHUOCA có 2 dòng trong AR_OpListDetailTbl (nhóm SGNB, SGQ07) nhưng
  KHÔNG có dòng nào trong AR_OpListEmployeeTbl — không ai quản lý anh ta. Đây là
  bản clone UAT bị nối dở: đã cấp nhóm riêng nhưng chưa bao giờ gắn vào quản lý.

  ── CÁCH VÁ ──
  QLMD1  -> nút OpID 26 'QLKV09' (Quản lý Khu vực Sài Gòn 02), là nút CHA của
            OpID 27 'SG02' nơi TDV_BINHPHUOCA đang đứng.
            Nhân viên dưới quyền: TDV_BINHPHUOCA, nhóm SGNB + SGQ07.
            Kết quả: 49.559 -> 347 khách. Khách đại diện SGNB0001 thuộc nhóm
            SGNB nên vẫn nhìn thấy.

  QLBH024-> nút OpID 30 'QLKV11' (Quản lý Khu vực Miền Tây 1), là nút CHA của
            OpID 31 'MT1' nơi MED0148 (An Giang A) đang đứng.
            Nhân viên dưới quyền: MED0148, nhóm AGA.
            Kết quả: 49.559 -> 449 khách. Khách đại diện AG0020 thuộc nhóm AGA
            nên vẫn nhìn thấy.

  Một nhân viên có nhiều quản lý là chuyện bình thường ở bảng này — MED0148
  hiện đã có 11 dòng quản lý (NVVP051, MED0134, MED0141, CEO...). Thêm QLBH024
  KHÔNG gỡ bỏ dòng nào của ai.

  Cả hai nút đích đều có LevelSub = 0, tức cấp quản lý. Bắt buộc phải vậy: nếu
  LevelSub = 1 thì hàm phân quyền sẽ coi họ là nhân viên bán hàng và lấy nhóm
  từ AR_OpListDetailTbl thay vì từ danh sách nhân viên dưới quyền.

  ── UserAutoID ──
  Khoá chính của cả hai bảng, varchar(50) NOT NULL. Dữ liệu cũ dùng GUID hoặc
  chuỗi số. File này dùng mã cố định dễ nhận ra dạng 'UAT13-...' để (1) chạy lại
  nhiều lần không sinh trùng, (2) gỡ bỏ chỉ bằng một câu DELETE. Xem mục HOÀN TÁC.

  ── CÁCH CHẠY ──
  Mặc định @Apply = 0: chỉ in ra bảng so sánh trước/sau, KHÔNG ghi gì.
  Xem xong thấy đúng thì sửa @Apply = 1 ở dòng đầu rồi chạy lại.
  Khi @Apply = 1, toàn bộ nằm trong một transaction và có bước tự kiểm tra:
  nếu sau khi ghi mà phạm vi không thu hẹp lại, hoặc khách đại diện biến mất,
  thì tự động ROLLBACK.

  ── HOÀN TÁC ──
      DELETE FROM dbo.AR_OpListEmployeeTbl WHERE UserAutoID LIKE 'UAT13-%';
      DELETE FROM dbo.AR_OpListDetailTbl   WHERE UserAutoID LIKE 'UAT13-%';

  ── PHẠM VI ──
  File này CHỈ đụng 2 tài khoản trên. Còn hai vấn đề đã phát hiện nhưng CỐ Ý
  KHÔNG xử ở đây vì nằm ngoài 13 tài khoản UAT và cần khách xác nhận:
    - TRUNGBM (NVVP003) cũng thấy đủ 49.559 khách, cùng lỗi, ở Miền Bắc.
    - Admin/CEO/CEO.MED/demo/GIANG_TPQT/Trung thấy tất cả — cái này ĐÚNG chủ ý
      vì họ không gắn mã nhân viên nào.

  Tham chiếu: docs/KE_HOACH_TEST_13_TAI_KHOAN.md
================================================================================
*/

SET NOCOUNT ON;
SET XACT_ABORT ON;

--------------------------------------------------------------------------------
--  ĐỔI THÀNH 1 ĐỂ GHI THẬT. Để 0 là chỉ xem trước.
--------------------------------------------------------------------------------
DECLARE @Apply BIT = 0;
--------------------------------------------------------------------------------

DECLARE @TongKhach INT = (SELECT COUNT(*) FROM dbo.CF_ObjectTbl);

/* Bảng kế hoạch: mỗi dòng là một (quản lý, nhân viên dưới quyền, nhóm). */
DECLARE @KeHoach TABLE (
    TaiKhoan     VARCHAR(50)  NOT NULL,
    QuanLyID     VARCHAR(50)  NOT NULL,
    OpID         INT          NOT NULL,
    OpCode       VARCHAR(50)  NOT NULL,
    NhanVienID   VARCHAR(50)  NOT NULL,
    NhomID       VARCHAR(50)  NOT NULL,
    KhachDaiDien VARCHAR(50)  NOT NULL
);

INSERT @KeHoach (TaiKhoan, QuanLyID, OpID, OpCode, NhanVienID, NhomID, KhachDaiDien)
VALUES
    ('QLMD1',       'QLMD1',   26, 'QLKV09', 'TDV_BINHPHUOCA', 'SGNB',  'SGNB0001'),
    ('QLMD1',       'QLMD1',   26, 'QLKV09', 'TDV_BINHPHUOCA', 'SGQ07', 'SGNB0001'),
    ('QLBH024.MED', 'QLBH024', 30, 'QLKV11', 'MED0148',        'AGA',   'AG0020');

--------------------------------------------------------------------------------
--  RÀO CHẶN — thà không chạy còn hơn chạy sai vào dữ liệu tổ chức của ERP
--------------------------------------------------------------------------------

-- Rào 1: tài khoản phải tồn tại, còn hiệu lực, và EmployeeID phải khớp kế hoạch.
IF EXISTS (
    SELECT 1 FROM @KeHoach K
    WHERE NOT EXISTS (
        SELECT 1 FROM dbo.SY_User U
        WHERE U.UserName = K.TaiKhoan
          AND COALESCE(U.Disable, 0) = 0
          AND ISNULL(U.EmployeeID, '') = K.QuanLyID
    )
)
    THROW 51400, N'Rào 1: có tài khoản không tồn tại, đã bị khoá, hoặc EmployeeID không khớp kế hoạch. Dừng lại.', 1;

-- Rào 2: nút đích phải tồn tại và phải là cấp QUẢN LÝ (LevelSub = 0).
--        LevelSub = 1 sẽ khiến hàm phân quyền coi họ là nhân viên bán hàng.
IF EXISTS (
    SELECT 1 FROM @KeHoach K
    WHERE NOT EXISTS (
        SELECT 1 FROM dbo.AR_OpListTbl T
        WHERE T.OpID = K.OpID AND T.OpCode = K.OpCode AND COALESCE(T.LevelSub, 0) = 0
    )
)
    THROW 51401, N'Rào 2: nút tổ chức đích không tồn tại, sai OpCode, hoặc LevelSub = 1 (cấp nhân viên). Dừng lại.', 1;

-- Rào 3: nhân viên dưới quyền phải đang thực sự giữ nhóm đó trong sơ đồ.
--        Không tự bịa quyền sở hữu nhóm — chỉ phản chiếu cái đã có.
IF EXISTS (
    SELECT 1 FROM @KeHoach K
    WHERE NOT EXISTS (
        SELECT 1 FROM dbo.AR_OpListDetailTbl D
        WHERE D.EmployeeID = K.NhanVienID
          AND D.ObjectGroupID = K.NhomID
          AND COALESCE(D.isDisable, 0) = 0
    )
)
    THROW 51402, N'Rào 3: có nhân viên chưa được gán nhóm tương ứng trong AR_OpListDetailTbl. Dừng lại.', 1;

-- Rào 4: khách đại diện phải thuộc đúng nhóm sắp cấp, nếu không UAT sẽ gãy.
IF EXISTS (
    SELECT 1
    FROM (SELECT DISTINCT TaiKhoan, KhachDaiDien FROM @KeHoach) X
    WHERE NOT EXISTS (
        SELECT 1 FROM dbo.CF_ObjectTbl O
        JOIN @KeHoach K2 ON K2.TaiKhoan = X.TaiKhoan AND K2.NhomID = O.ObjectGroupID
        WHERE O.ObjectID = X.KhachDaiDien
    )
)
    THROW 51403, N'Rào 4: khách đại diện của UAT không nằm trong nhóm nào sắp được cấp. Sửa xong tài khoản sẽ không thấy khách test. Dừng lại.', 1;

-- Rào 5: chỉ vá tài khoản đang bị lỗi "thấy tất cả". Nếu ai đó đã sửa tay
--        trước rồi thì dừng để người chạy xem lại, tránh chồng lấn.
IF EXISTS (
    SELECT 1 FROM (SELECT DISTINCT QuanLyID FROM @KeHoach) X
    WHERE EXISTS (
        SELECT 1 FROM dbo.AR_OpListDetailTbl D
        WHERE D.EmployeeID = X.QuanLyID AND COALESCE(D.isDisable, 0) = 0
          AND D.UserAutoID NOT LIKE 'UAT13-%'
    )
)
    THROW 51404, N'Rào 5: một trong hai tài khoản đã có sẵn dòng trong sơ đồ tổ chức do người khác thêm. Kiểm tra lại trước khi chạy. Dừng lại.', 1;

--------------------------------------------------------------------------------
--  BẢNG XEM TRƯỚC
--------------------------------------------------------------------------------
SELECT
    N'TRƯỚC KHI SỬA'                        AS GiaiDoan,
    K.TaiKhoan,
    K.QuanLyID                              AS EmployeeID,
    (SELECT COUNT(*) FROM dbo.AR_GetObjectByUserFnc(K.TaiKhoan)) AS SoKhachThay,
    @TongKhach                              AS TongHeThong,
    CASE WHEN (SELECT COUNT(*) FROM dbo.AR_GetObjectByUserFnc(K.TaiKhoan)) = @TongKhach
         THEN N'*** THẤY TẤT CẢ — LỖI ***' ELSE N'' END AS GhiChu
FROM (SELECT DISTINCT TaiKhoan, QuanLyID FROM @KeHoach) K
ORDER BY K.TaiKhoan;

SELECT
    N'SẼ THÊM' AS ThaoTac,
    K.TaiKhoan,
    K.OpCode + N' (OpID ' + CAST(K.OpID AS NVARCHAR(10)) + N')' AS GanVaoNut,
    K.NhanVienID                            AS NhanVienDuoiQuyen,
    K.NhomID,
    (SELECT COUNT(*) FROM dbo.CF_ObjectTbl O WHERE O.ObjectGroupID = K.NhomID) AS SoKhachCuaNhom,
    K.KhachDaiDien
FROM @KeHoach K
ORDER BY K.TaiKhoan, K.NhomID;

SELECT
    N'DỰ KIẾN SAU KHI SỬA' AS GiaiDoan,
    K.TaiKhoan,
    COUNT(DISTINCT K.NhomID)                AS SoNhom,
    (SELECT COUNT(*) FROM dbo.CF_ObjectTbl O
      WHERE O.ObjectGroupID IN (SELECT NhomID FROM @KeHoach K2 WHERE K2.TaiKhoan = K.TaiKhoan)) AS SoKhachDuKien
FROM @KeHoach K
GROUP BY K.TaiKhoan
ORDER BY K.TaiKhoan;

--------------------------------------------------------------------------------
--  GHI THẬT
--------------------------------------------------------------------------------
IF @Apply = 1
BEGIN
    BEGIN TRY
        BEGIN TRANSACTION;

        /* 1. Đặt quản lý vào nút tổ chức. ObjectGroupID để NULL đúng như khuôn
              mẫu của MED0330: quản lý không sở hữu nhóm trực tiếp, phạm vi của
              họ đến từ nhân viên dưới quyền. */
        INSERT dbo.AR_OpListDetailTbl (UserAutoID, OpID, EmployeeID, ObjectGroupID, ViTriHoTro, BranchID, Notes, isDisable)
        SELECT DISTINCT
            'UAT13-D-' + K.QuanLyID,
            K.OpID,
            K.QuanLyID,
            NULL,
            0,
            NULL,
            NULL,
            0
        FROM @KeHoach K
        WHERE NOT EXISTS (
            SELECT 1 FROM dbo.AR_OpListDetailTbl D
            WHERE D.UserAutoID = 'UAT13-D-' + K.QuanLyID
        );

        /* 2. Gắn nhân viên dưới quyền kèm nhóm. LevelCount và Notes lấy theo
              nút cha, khớp khuôn mẫu MED0330 (LevelCount 4, Notes 'QLT06'). */
        INSERT dbo.AR_OpListEmployeeTbl (UserAutoID, OpID, ManagerID, EmployeeID, ObjectGroupID, BranchID, ViTriHoTro, isDirect, LevelCount, Notes, isDisable)
        SELECT
            'UAT13-E-' + K.QuanLyID + '-' + K.NhomID,
            K.OpID,
            K.QuanLyID,
            K.NhanVienID,
            K.NhomID,
            NULL,
            0,
            0,
            T.LevelCount,
            K.OpCode,
            0
        FROM @KeHoach K
            INNER JOIN dbo.AR_OpListTbl T ON T.OpID = K.OpID
        WHERE NOT EXISTS (
            SELECT 1 FROM dbo.AR_OpListEmployeeTbl E
            WHERE E.UserAutoID = 'UAT13-E-' + K.QuanLyID + '-' + K.NhomID
        );

        /* 3. Tự kiểm tra NGAY TRONG transaction. Sai thì cuộn lại toàn bộ. */

        -- Kiểm 1: không tài khoản nào còn thấy toàn bộ hệ thống.
        IF EXISTS (
            SELECT 1 FROM (SELECT DISTINCT TaiKhoan FROM @KeHoach) X
            WHERE (SELECT COUNT(*) FROM dbo.AR_GetObjectByUserFnc(X.TaiKhoan)) >= @TongKhach
        )
            THROW 51410, N'Tự kiểm tra thất bại: sau khi ghi vẫn có tài khoản nhìn thấy toàn bộ khách hàng. Đã cuộn lại.', 1;

        -- Kiểm 2: mỗi tài khoản phải vẫn nhìn thấy khách đại diện của UAT.
        IF EXISTS (
            SELECT 1 FROM (SELECT DISTINCT TaiKhoan, KhachDaiDien FROM @KeHoach) X
            WHERE NOT EXISTS (
                SELECT 1 FROM dbo.AR_GetObjectByUserFnc(X.TaiKhoan) F
                WHERE F.ObjectID = X.KhachDaiDien
            )
        )
            THROW 51411, N'Tự kiểm tra thất bại: có tài khoản không còn nhìn thấy khách đại diện của UAT. Đã cuộn lại.', 1;

        -- Kiểm 3: phạm vi phải khớp đúng số khách của các nhóm đã cấp.
        IF EXISTS (
            SELECT 1 FROM (SELECT DISTINCT TaiKhoan FROM @KeHoach) X
            WHERE (SELECT COUNT(*) FROM dbo.AR_GetObjectByUserFnc(X.TaiKhoan))
                <> (SELECT COUNT(*) FROM dbo.CF_ObjectTbl O
                    WHERE O.ObjectGroupID IN (SELECT NhomID FROM @KeHoach K WHERE K.TaiKhoan = X.TaiKhoan))
        )
            THROW 51412, N'Tự kiểm tra thất bại: phạm vi thực tế không khớp số khách của các nhóm đã cấp. Đã cuộn lại.', 1;

        COMMIT TRANSACTION;
        PRINT N'>>> ĐÃ ÁP DỤNG và qua cả 3 bước tự kiểm tra.';
    END TRY
    BEGIN CATCH
        IF @@TRANCOUNT > 0 ROLLBACK TRANSACTION;
        THROW;
    END CATCH
END
ELSE
    PRINT N'>>> CHẾ ĐỘ XEM TRƯỚC — chưa ghi gì. Sửa @Apply = 1 rồi chạy lại để ghi thật.';

--------------------------------------------------------------------------------
--  KẾT QUẢ CUỐI — chạy ở cả hai chế độ để đối chiếu
--------------------------------------------------------------------------------
SELECT
    N'KIỂM TRA LẠI 13 TÀI KHOẢN UAT' AS BaoCao,
    U.UserName                       AS TaiKhoan,
    (SELECT COUNT(*) FROM dbo.AR_GetObjectByUserFnc(U.UserName)) AS SoKhachThay,
    CAST(ROUND((SELECT COUNT(*) FROM dbo.AR_GetObjectByUserFnc(U.UserName)) * 100.0 / @TongKhach, 1) AS DECIMAL(5,1)) AS PhanTram,
    CASE WHEN (SELECT COUNT(*) FROM dbo.AR_GetObjectByUserFnc(U.UserName)) >= @TongKhach
         THEN N'*** THẤY TẤT CẢ ***' ELSE N'OK' END AS KetLuan
FROM dbo.SY_User U
WHERE U.UserName IN ('QLBH013.MED','NAMDINHB.MED','QLBH016.MED','BACNINHA.MED',
                     'QLBH005.MED','HUEB.MED','QLBH010.MED','DANANGA.MED',
                     'QLMN2','CanThoA','QLMD1','BinhPhuocA','QLBH024.MED')
ORDER BY SoKhachThay DESC;
GO
