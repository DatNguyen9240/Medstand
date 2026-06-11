USE [medtest]
GO

-- 1. API BẮT ĐẦU (START)
-- FE gửi: User, DocumentID, Title, ThoiGianBatDau, ThoiGianLamBai, SoCauHoi
CREATE OR ALTER PROCEDURE [dbo].[API_BatDauBaiKhaoSat]
    @User VARCHAR(50),
    @DocumentID VARCHAR(50) = '',
    @Title NVARCHAR(200) = '',
    @ThoiGianBatDau DATETIME = NULL,
    @ThoiGianLamBai VARCHAR(20) = '',
    @SoCauHoi INT = 0,
    @BranchID VARCHAR(50) = '', -- Tham số dự phòng từ hệ thống
    @Ngay DATETIME = NULL       -- Tham số dự phòng từ hệ thống
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @NewID VARCHAR(50) = CASE WHEN ISNULL(@DocumentID,'') = '' THEN CAST(NEWID() AS VARCHAR(50)) ELSE @DocumentID END;
    
    IF NOT EXISTS (SELECT 1 FROM AR_DotKhaoSatTbl WHERE DocumentID = @NewID)
    BEGIN
        INSERT INTO dbo.AR_DotKhaoSatTbl (DocumentID, DocumentDate, UserName, Title, SoCauHoi, ThoiGianLamBai, DateCreate)
        VALUES (@NewID, GETDATE(), @User, @Title, @SoCauHoi, @ThoiGianLamBai, GETDATE());
    END

    SELECT @NewID AS DocumentID, @Title AS Title, @SoCauHoi AS SoCauHoi, @ThoiGianLamBai AS ThoiGianLamBai, 
           CONVERT(VARCHAR, DATEADD(DAY, 7, GETDATE()), 103) AS HanThi;
END
GO

-- 2. API LẤY CÂU HỎI (QUESTIONS)
-- FE gửi: User, DocumentID
CREATE OR ALTER PROCEDURE [dbo].[API_ChiTietBaiKhaoSat]
    @User VARCHAR(50) = '',
    @DocumentID VARCHAR(50) = '',
    @BranchID VARCHAR(50) = ''
AS
BEGIN
    SET NOCOUNT ON;
    
    WITH LatestQuestions AS (
        SELECT TOP 3 
            MaCauHoi, NoiDung, DapAn1, DapAn2, DapAn3, DapAn4, DapAnDung
        FROM dbo.CF_DanhSachCauHoiTbl
        WHERE ISNULL(isDisable, 0) = 0
        ORDER BY MaCauHoi DESC
    )
    SELECT * FROM LatestQuestions ORDER BY NEWID();
END
GO

-- 3. API NỘP BÀI (SUBMIT_QUIZ)
-- FE gửi: User, DocumentID
CREATE OR ALTER PROCEDURE [dbo].[API_NopBaiKhaoSat]
    @User VARCHAR(50),
    @DocumentID VARCHAR(50),
    @JsonKetQua NVARCHAR(MAX) = '',
    @BranchID VARCHAR(50) = ''
AS
BEGIN
    SET NOCOUNT ON;
    
    IF ISNULL(@JsonKetQua, '') <> ''
    BEGIN
        DELETE FROM AR_DotKhaoSatDetailTbl WHERE DocumentID = @DocumentID;

        INSERT INTO AR_DotKhaoSatDetailTbl (UserAutoID, DocumentID, MaCauHoi, DapAn, ThoiGianTraLoi)
        SELECT 
            CAST(NEWID() AS VARCHAR(50)),
            @DocumentID,
            JSON_VALUE(value, '$.MaCauHoi'),
            CAST(JSON_VALUE(value, '$.DapAn') AS INT),
            GETDATE()
        FROM OPENJSON(@JsonKetQua);
    END

    DECLARE @SoCauDung INT, @SoCauSai INT, @TongCau INT;
    
    SELECT 
        @TongCau = COUNT(D.UserAutoID),
        @SoCauDung = SUM(CASE WHEN CAST(LTRIM(RTRIM(D.DapAn)) AS INT) = CAST(LTRIM(RTRIM(Q.DapAnDung)) AS INT) THEN 1 ELSE 0 END),
        @SoCauSai = SUM(CASE WHEN CAST(LTRIM(RTRIM(D.DapAn)) AS INT) <> CAST(LTRIM(RTRIM(Q.DapAnDung)) AS INT) THEN 1 ELSE 0 END)
    FROM AR_DotKhaoSatDetailTbl D
    JOIN CF_DanhSachCauHoiTbl Q ON LTRIM(RTRIM(D.MaCauHoi)) = LTRIM(RTRIM(Q.MaCauHoi))
    WHERE D.DocumentID = @DocumentID;

    UPDATE dbo.AR_DotKhaoSatTbl 
    SET ThoiGianKetThuc = GETDATE(),
        DocumentDate = GETDATE(),
        UserName = @User,
        KetQuaDung = ISNULL(@SoCauDung, 0),
        KetQuaSai = ISNULL(@SoCauSai, 0),
        SoCauHoi = ISNULL(@TongCau, 3)
    WHERE DocumentID = @DocumentID;

    SELECT N'Bạn có đồng ý nộp bài?' AS Msg;
END
GO

-- 4. API KẾT QUẢ (RESULTS)
-- FE gửi: DocumentID
CREATE OR ALTER PROCEDURE [dbo].[API_KetQuaBaiKhaoSat]
    @DocumentID VARCHAR(50),
    @User VARCHAR(50) = ''
AS
BEGIN
    SET NOCOUNT ON;
    SELECT 
        ISNULL(KetQuaDung, 0) AS SoCauDung, 
        ISNULL(KetQuaSai, 0) AS SoCauSai, 
        ISNULL(SoCauHoi, 0) AS TongCau,
        ISNULL(KetQuaDung, 0) AS Diem
    FROM dbo.AR_DotKhaoSatTbl
    WHERE DocumentID = @DocumentID;
END
GO

-- 5. API KIỂM TRA NGÀY (CHECK_DAILY)
CREATE OR ALTER PROCEDURE [dbo].[API_KiemTraKhaoSatNgay]
    @User VARCHAR(50),
    @BranchID VARCHAR(50) = '',
    @Ngay DATETIME = NULL
AS
BEGIN
    SET NOCOUNT ON;
    IF EXISTS (
        SELECT 1 
        FROM AR_DotKhaoSatTbl 
        WHERE UPPER(LTRIM(RTRIM(UserName))) = UPPER(LTRIM(RTRIM(@User)))
          AND CAST(DocumentDate AS DATE) = CAST(GETDATE() AS DATE)
          AND ISNULL(KetQuaDung, 0) = 3
    )
        SELECT '0' AS KiemTra;
    ELSE
        SELECT '1' AS KiemTra;
END
GO

-- 6. API LỊCH SỬ BÀI KHẢO SÁT (HISTORY)
-- FE gửi: User
CREATE OR ALTER PROCEDURE [dbo].[API_LichSuBaiKhaoSat]
    @User VARCHAR(50) = ''
AS
BEGIN
    SET NOCOUNT ON;
    SELECT 
        DocumentID,
        ISNULL(Title, N'Bài khảo sát') AS Title,
        CONVERT(VARCHAR, DocumentDate, 103) + ' ' + LEFT(CONVERT(VARCHAR, DocumentDate, 108), 5) AS ThoiGian,
        CAST(ISNULL(KetQuaDung, 0) AS VARCHAR) + '/' + CAST(ISNULL(SoCauHoi, 3) AS VARCHAR) AS KetQua
    FROM dbo.AR_DotKhaoSatTbl
    WHERE UPPER(LTRIM(RTRIM(UserName))) = UPPER(LTRIM(RTRIM(@User)))
    ORDER BY DocumentDate DESC;
END
GO
