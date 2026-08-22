USE [medtest]
GO

/*
    Khao sat v2
    - Quan ly trang thai IN_PROGRESS / COMPLETED
    - Co dinh bo cau hoi theo DocumentID
    - Kiem tra quyen theo UserName
    Script co the chay lai nhieu lan.
*/

IF COL_LENGTH('dbo.AR_DotKhaoSatTbl', 'Status') IS NULL
    ALTER TABLE dbo.AR_DotKhaoSatTbl ADD Status VARCHAR(20) NULL;
IF COL_LENGTH('dbo.AR_DotKhaoSatTbl', 'StartedAt') IS NULL
    ALTER TABLE dbo.AR_DotKhaoSatTbl ADD StartedAt DATETIME NULL;
IF COL_LENGTH('dbo.AR_DotKhaoSatTbl', 'CompletedAt') IS NULL
    ALTER TABLE dbo.AR_DotKhaoSatTbl ADD CompletedAt DATETIME NULL;
IF COL_LENGTH('dbo.AR_DotKhaoSatTbl', 'ExpiredAt') IS NULL
    ALTER TABLE dbo.AR_DotKhaoSatTbl ADD ExpiredAt DATETIME NULL;
IF COL_LENGTH('dbo.AR_DotKhaoSatTbl', 'AssignedAt') IS NULL
    ALTER TABLE dbo.AR_DotKhaoSatTbl ADD AssignedAt DATETIME NULL;
IF COL_LENGTH('dbo.AR_DotKhaoSatTbl', 'ObjectID') IS NULL
    ALTER TABLE dbo.AR_DotKhaoSatTbl ADD ObjectID VARCHAR(50) NULL;
IF COL_LENGTH('dbo.AR_DotKhaoSatTbl', 'EmployeeID') IS NULL
    ALTER TABLE dbo.AR_DotKhaoSatTbl ADD EmployeeID VARCHAR(50) NULL;
IF COL_LENGTH('dbo.AR_DotKhaoSatTbl', 'BranchID') IS NULL
    ALTER TABLE dbo.AR_DotKhaoSatTbl ADD BranchID VARCHAR(50) NULL;
GO

UPDATE dbo.AR_DotKhaoSatTbl
SET Status = CASE WHEN ThoiGianKetThuc IS NULL THEN 'IN_PROGRESS' ELSE 'COMPLETED' END,
    StartedAt = ISNULL(StartedAt, ISNULL(DateCreate, DocumentDate)),
    CompletedAt = CASE WHEN ThoiGianKetThuc IS NULL THEN CompletedAt ELSE ISNULL(CompletedAt, ThoiGianKetThuc) END
WHERE Status IS NULL;
GO

IF OBJECT_ID('dbo.AR_DotKhaoSatQuestionTbl', 'U') IS NULL
BEGIN
    CREATE TABLE dbo.AR_DotKhaoSatQuestionTbl (
        DocumentID VARCHAR(50) NOT NULL,
        MaCauHoi VARCHAR(50) NOT NULL,
        QuestionOrder INT NOT NULL,
        NoiDung NVARCHAR(MAX) NULL,
        DapAn1 NVARCHAR(MAX) NULL,
        DapAn2 NVARCHAR(MAX) NULL,
        DapAn3 NVARCHAR(MAX) NULL,
        DapAn4 NVARCHAR(MAX) NULL,
        DapAnDung INT NULL,
        DateCreate DATETIME NOT NULL CONSTRAINT DF_AR_DotKhaoSatQuestion_DateCreate DEFAULT GETDATE(),
        CONSTRAINT PK_AR_DotKhaoSatQuestion PRIMARY KEY (DocumentID, MaCauHoi)
    );
END
GO

CREATE OR ALTER PROCEDURE dbo.API_BatDauBaiKhaoSat
    @User VARCHAR(50) = '',
    @Username VARCHAR(50) = '',
    @DocumentID VARCHAR(50) = '',
    @Title NVARCHAR(200) = '',
    @ThoiGianBatDau DATETIME = NULL,
    @ThoiGianLamBai VARCHAR(20) = '',
    @SoCauHoi INT = 3,
    @BranchID VARCHAR(50) = '',
    @Ngay DATETIME = NULL,
    @ObjectID VARCHAR(50) = '',
    @EmployeeID VARCHAR(50) = ''
AS
BEGIN
    SET NOCOUNT ON;
    IF ISNULL(@User, '') = '' SET @User = @Username;
    IF ISNULL(@User, '') = '' THROW 50001, N'Thiếu thông tin người thực hiện.', 1;
    IF ISNULL(@SoCauHoi, 0) <= 0 SET @SoCauHoi = 3;

    DECLARE @NewID VARCHAR(50) = NULLIF(LTRIM(RTRIM(@DocumentID)), '');
    IF @NewID IS NULL SET @NewID = CONVERT(VARCHAR(50), NEWID());

    IF EXISTS (SELECT 1 FROM dbo.AR_DotKhaoSatTbl WHERE DocumentID = @NewID AND UPPER(LTRIM(RTRIM(UserName))) <> UPPER(LTRIM(RTRIM(@User))))
        THROW 50002, N'Bạn không có quyền truy cập bài khảo sát này.', 1;

    IF NOT EXISTS (SELECT 1 FROM dbo.AR_DotKhaoSatTbl WHERE DocumentID = @NewID)
    BEGIN
        INSERT dbo.AR_DotKhaoSatTbl
            (DocumentID, DocumentDate, UserName, Title, SoCauHoi, ThoiGianLamBai, DateCreate,
             Status, StartedAt, ExpiredAt, ObjectID, EmployeeID, BranchID)
        VALUES
            (@NewID, GETDATE(), @User, NULLIF(@Title, ''), @SoCauHoi, @ThoiGianLamBai, GETDATE(),
             'IN_PROGRESS', ISNULL(@ThoiGianBatDau, GETDATE()), DATEADD(DAY, 7, GETDATE()),
             NULLIF(@ObjectID, ''), NULLIF(@EmployeeID, ''), NULLIF(@BranchID, ''));
    END
    ELSE
    BEGIN
        UPDATE dbo.AR_DotKhaoSatTbl
        SET Status = CASE WHEN Status = 'NOT_STARTED' THEN 'IN_PROGRESS' ELSE Status END,
            StartedAt = CASE WHEN Status = 'NOT_STARTED' THEN GETDATE() ELSE StartedAt END
        WHERE DocumentID = @NewID;
    END

    IF NOT EXISTS (SELECT 1 FROM dbo.AR_DotKhaoSatQuestionTbl WHERE DocumentID = @NewID)
    BEGIN
        ;WITH Chosen AS (
            SELECT TOP (@SoCauHoi)
                MaCauHoi, NoiDung, DapAn1, DapAn2, DapAn3, DapAn4,
                TRY_CONVERT(INT, DapAnDung) AS DapAnDung,
                ROW_NUMBER() OVER (ORDER BY NEWID()) AS QuestionOrder
            FROM dbo.CF_DanhSachCauHoiTbl
            WHERE ISNULL(isDisable, 0) = 0
            ORDER BY NEWID()
        )
        INSERT dbo.AR_DotKhaoSatQuestionTbl
            (DocumentID, MaCauHoi, QuestionOrder, NoiDung, DapAn1, DapAn2, DapAn3, DapAn4, DapAnDung)
        SELECT @NewID, MaCauHoi, QuestionOrder, NoiDung, DapAn1, DapAn2, DapAn3, DapAn4, DapAnDung
        FROM Chosen;
    END

    SELECT DocumentID, ISNULL(Title, N'Bài khảo sát') AS Title, SoCauHoi, ThoiGianLamBai,
           Status, CONVERT(VARCHAR(10), ExpiredAt, 103) AS HanThi, ObjectID, EmployeeID, BranchID
    FROM dbo.AR_DotKhaoSatTbl
    WHERE DocumentID = @NewID;
END
GO

CREATE OR ALTER PROCEDURE dbo.API_GiaoBaiKhaoSat
    @Username VARCHAR(50),
    @Title NVARCHAR(200),
    @ExpiredAt DATETIME = NULL,
    @SoCauHoi INT = 3,
    @ObjectID VARCHAR(50) = '',
    @EmployeeID VARCHAR(50) = '',
    @BranchID VARCHAR(50) = ''
AS
BEGIN
    SET NOCOUNT ON;
    IF ISNULL(@Username, '') = '' THROW 50007, N'Vui lòng chọn người nhận khảo sát.', 1;
    IF ISNULL(@SoCauHoi, 0) <= 0 SET @SoCauHoi = 3;

    DECLARE @DocumentID VARCHAR(50) = CONVERT(VARCHAR(50), NEWID());
    INSERT dbo.AR_DotKhaoSatTbl
        (DocumentID, DocumentDate, UserName, Title, SoCauHoi, ThoiGianLamBai, DateCreate,
         Status, AssignedAt, ExpiredAt, ObjectID, EmployeeID, BranchID)
    VALUES
        (@DocumentID, GETDATE(), @Username, @Title, @SoCauHoi, '5', GETDATE(),
         'NOT_STARTED', GETDATE(), ISNULL(@ExpiredAt, DATEADD(DAY, 7, GETDATE())),
         NULLIF(@ObjectID, ''), NULLIF(@EmployeeID, ''), NULLIF(@BranchID, ''));

    ;WITH Chosen AS (
        SELECT TOP (@SoCauHoi)
            MaCauHoi, NoiDung, DapAn1, DapAn2, DapAn3, DapAn4,
            TRY_CONVERT(INT, DapAnDung) AS DapAnDung,
            ROW_NUMBER() OVER (ORDER BY NEWID()) AS QuestionOrder
        FROM dbo.CF_DanhSachCauHoiTbl
        WHERE ISNULL(isDisable, 0) = 0
        ORDER BY NEWID()
    )
    INSERT dbo.AR_DotKhaoSatQuestionTbl
        (DocumentID, MaCauHoi, QuestionOrder, NoiDung, DapAn1, DapAn2, DapAn3, DapAn4, DapAnDung)
    SELECT @DocumentID, MaCauHoi, QuestionOrder, NoiDung, DapAn1, DapAn2, DapAn3, DapAn4, DapAnDung
    FROM Chosen;

    SELECT @DocumentID AS DocumentID, @Title AS Title, 'NOT_STARTED' AS Status,
           CONVERT(VARCHAR(10), ISNULL(@ExpiredAt, DATEADD(DAY, 7, GETDATE())), 103) AS HanThi;
END
GO

CREATE OR ALTER PROCEDURE dbo.API_ChiTietBaiKhaoSat
    @User VARCHAR(50) = '',
    @Username VARCHAR(50) = '',
    @DocumentID VARCHAR(50) = '',
    @BranchID VARCHAR(50) = ''
AS
BEGIN
    SET NOCOUNT ON;
    IF ISNULL(@User, '') = '' SET @User = @Username;
    IF NOT EXISTS (
        SELECT 1 FROM dbo.AR_DotKhaoSatTbl
        WHERE DocumentID = @DocumentID
          AND UPPER(LTRIM(RTRIM(UserName))) = UPPER(LTRIM(RTRIM(@User)))
    ) THROW 50003, N'Không tìm thấy bài khảo sát hoặc bạn không có quyền truy cập.', 1;

    SELECT MaCauHoi, NoiDung, DapAn1, DapAn2, DapAn3, DapAn4, DapAnDung, QuestionOrder
    FROM dbo.AR_DotKhaoSatQuestionTbl
    WHERE DocumentID = @DocumentID
    ORDER BY QuestionOrder;
END
GO

CREATE OR ALTER PROCEDURE dbo.API_NopBaiKhaoSat
    @User VARCHAR(50) = '',
    @Username VARCHAR(50) = '',
    @DocumentID VARCHAR(50) = '',
    @JsonKetQua NVARCHAR(MAX) = '',
    @BranchID VARCHAR(50) = ''
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;
    IF ISNULL(@User, '') = '' SET @User = @Username;

    IF NOT EXISTS (
        SELECT 1 FROM dbo.AR_DotKhaoSatTbl
        WHERE DocumentID = @DocumentID
          AND UPPER(LTRIM(RTRIM(UserName))) = UPPER(LTRIM(RTRIM(@User)))
    ) THROW 50004, N'Không tìm thấy bài khảo sát hoặc bạn không có quyền nộp bài.', 1;

    IF EXISTS (SELECT 1 FROM dbo.AR_DotKhaoSatTbl WHERE DocumentID = @DocumentID AND Status = 'COMPLETED')
        THROW 50005, N'Bài khảo sát đã hoàn thành và không thể nộp lại.', 1;

    IF ISJSON(@JsonKetQua) <> 1 THROW 50006, N'Dữ liệu câu trả lời không hợp lệ.', 1;

    BEGIN TRANSACTION;
    DELETE dbo.AR_DotKhaoSatDetailTbl WHERE DocumentID = @DocumentID;

    INSERT dbo.AR_DotKhaoSatDetailTbl (UserAutoID, DocumentID, MaCauHoi, DapAn, ThoiGianTraLoi)
    SELECT CONVERT(VARCHAR(50), NEWID()), @DocumentID,
           JSON_VALUE(J.value, '$.MaCauHoi'), TRY_CONVERT(INT, JSON_VALUE(J.value, '$.DapAn')), GETDATE()
    FROM OPENJSON(@JsonKetQua) J
    JOIN dbo.AR_DotKhaoSatQuestionTbl Q
      ON Q.DocumentID = @DocumentID
     AND Q.MaCauHoi = JSON_VALUE(J.value, '$.MaCauHoi');

    DECLARE @SoCauDung INT = 0, @SoCauSai INT = 0, @TongCau INT = 0;
    SELECT @TongCau = COUNT(*),
           @SoCauDung = SUM(CASE WHEN TRY_CONVERT(INT, D.DapAn) = Q.DapAnDung THEN 1 ELSE 0 END),
           @SoCauSai = SUM(CASE WHEN ISNULL(TRY_CONVERT(INT, D.DapAn), 0) <> Q.DapAnDung THEN 1 ELSE 0 END)
    FROM dbo.AR_DotKhaoSatQuestionTbl Q
    LEFT JOIN dbo.AR_DotKhaoSatDetailTbl D
      ON D.DocumentID = Q.DocumentID AND D.MaCauHoi = Q.MaCauHoi
    WHERE Q.DocumentID = @DocumentID;

    UPDATE dbo.AR_DotKhaoSatTbl
    SET ThoiGianKetThuc = GETDATE(), CompletedAt = GETDATE(), DocumentDate = GETDATE(),
        Status = 'COMPLETED', KetQuaDung = ISNULL(@SoCauDung, 0),
        KetQuaSai = ISNULL(@SoCauSai, 0), SoCauHoi = ISNULL(@TongCau, 0)
    WHERE DocumentID = @DocumentID;
    COMMIT TRANSACTION;

    SELECT N'Nộp bài thành công.' AS Msg, 'COMPLETED' AS Status;
END
GO

CREATE OR ALTER PROCEDURE dbo.API_KetQuaBaiKhaoSat
    @DocumentID VARCHAR(50),
    @User VARCHAR(50) = '',
    @Username VARCHAR(50) = ''
AS
BEGIN
    SET NOCOUNT ON;
    IF ISNULL(@User, '') = '' SET @User = @Username;
    SELECT DocumentID, ISNULL(KetQuaDung, 0) AS SoCauDung, ISNULL(KetQuaSai, 0) AS SoCauSai,
           ISNULL(SoCauHoi, 0) AS TongCau, ISNULL(KetQuaDung, 0) AS Diem,
           Status, CompletedAt, Title, ObjectID, EmployeeID, BranchID
    FROM dbo.AR_DotKhaoSatTbl
    WHERE DocumentID = @DocumentID
      AND UPPER(LTRIM(RTRIM(UserName))) = UPPER(LTRIM(RTRIM(@User)));
END
GO

CREATE OR ALTER PROCEDURE dbo.API_KiemTraKhaoSatNgay
    @User VARCHAR(50) = '', @Username VARCHAR(50) = '', @BranchID VARCHAR(50) = '', @Ngay DATETIME = NULL
AS
BEGIN
    SET NOCOUNT ON;
    IF ISNULL(@User, '') = '' SET @User = @Username;
    IF EXISTS (
        SELECT 1 FROM dbo.AR_DotKhaoSatTbl
        WHERE UPPER(LTRIM(RTRIM(UserName))) = UPPER(LTRIM(RTRIM(@User)))
          AND CAST(DocumentDate AS DATE) = CAST(ISNULL(@Ngay, GETDATE()) AS DATE)
          AND Status = 'COMPLETED'
    ) SELECT '0' AS KiemTra;
    ELSE SELECT '1' AS KiemTra;
END
GO

CREATE OR ALTER PROCEDURE dbo.API_LichSuBaiKhaoSat
    @User VARCHAR(50) = '', @Username VARCHAR(50) = ''
AS
BEGIN
    SET NOCOUNT ON;
    IF ISNULL(@User, '') = '' SET @User = @Username;
    SELECT DocumentID, ISNULL(Title, N'Bài khảo sát') AS Title,
           CONVERT(VARCHAR(10), DocumentDate, 103) + ' ' + LEFT(CONVERT(VARCHAR(8), DocumentDate, 108), 5) AS ThoiGian,
           CAST(ISNULL(KetQuaDung, 0) AS VARCHAR(10)) + '/' + CAST(ISNULL(SoCauHoi, 0) AS VARCHAR(10)) AS KetQua,
           ISNULL(Status, CASE WHEN ThoiGianKetThuc IS NULL THEN 'IN_PROGRESS' ELSE 'COMPLETED' END) AS Status,
           AssignedAt, StartedAt, CompletedAt, ExpiredAt, ObjectID, EmployeeID, BranchID
    FROM dbo.AR_DotKhaoSatTbl
    WHERE UPPER(LTRIM(RTRIM(UserName))) = UPPER(LTRIM(RTRIM(@User)))
    ORDER BY CASE WHEN Status = 'IN_PROGRESS' THEN 0 ELSE 1 END, DocumentDate DESC;
END
GO
