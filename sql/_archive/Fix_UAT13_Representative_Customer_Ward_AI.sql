USE medtest;
GO

/*
  BỔ SUNG PHƯỜNG/XÃ CHO KHÁCH ĐẠI DIỆN CỦA 13 TÀI KHOẢN UAT

  Phạm vi cố định: 7 mã khách trong config/uat/account-fixtures.v1.json.
  Chỉ hai mã đang thiếu XaPhuong được xử lý:
    - AG0020   -> Phường Mỹ Bình (khớp chuỗi địa chỉ; giá trị catalog legacy được dùng cho khách UAT)
    - SGNB0001 -> Xã Nhà Bè (khớp danh mục địa giới hiện hành)

  Script có backup + transaction + idempotent. Không ghi đè phường/xã đã có.
*/

SET NOCOUNT ON;
SET XACT_ABORT ON;

IF OBJECT_ID('dbo.AI_UAT13_CustomerWardBackup', 'U') IS NULL
BEGIN
    CREATE TABLE dbo.AI_UAT13_CustomerWardBackup (
        BackupID      BIGINT IDENTITY(1,1) NOT NULL PRIMARY KEY,
        BatchID       VARCHAR(50) NOT NULL,
        ObjectID      VARCHAR(50) NOT NULL,
        OldLocationID NVARCHAR(100) NULL,
        OldQuanHuyen  NVARCHAR(100) NULL,
        OldXaPhuong   NVARCHAR(100) NULL,
        NewXaPhuong   NVARCHAR(100) NOT NULL,
        ChangedAt     DATETIME2(0) NOT NULL DEFAULT SYSDATETIME()
    );
END;

DECLARE @BatchID VARCHAR(50) = 'UAT13_WARD_20260727_V1';

DECLARE @Fixes TABLE (
    ObjectID       VARCHAR(50) NOT NULL PRIMARY KEY,
    ExpectedProvince NVARCHAR(100) NOT NULL,
    NewXaPhuong    NVARCHAR(100) NOT NULL
);

INSERT INTO @Fixes (ObjectID, ExpectedProvince, NewXaPhuong)
VALUES
    ('AG0020',   N'An Giang',     N'Phường Mỹ Bình'),
    ('SGNB0001', N'Hồ Chí Minh', N'Xã Nhà Bè');

BEGIN TRY
    BEGIN TRANSACTION;

    IF EXISTS (
        SELECT 1
        FROM @Fixes F
        WHERE NOT EXISTS (
            SELECT 1
            FROM dbo.CF_ObjectTbl O WITH (UPDLOCK, HOLDLOCK)
            WHERE O.ObjectID = F.ObjectID
              AND O.LocationID COLLATE Latin1_General_CI_AI
                    = F.ExpectedProvince COLLATE Latin1_General_CI_AI
        )
    )
        THROW 51401, N'Khách UAT không tồn tại hoặc tỉnh hiện tại không khớp dữ liệu đã duyệt.', 1;

    IF NOT EXISTS (
        SELECT 1
        FROM dbo.CF_XaPhuongTbl P
        WHERE P.TinhThanh COLLATE Latin1_General_CI_AI = N'Hồ Chí Minh'
          AND P.XaPhuong COLLATE Latin1_General_CI_AI = N'Xã Nhà Bè'
    )
        THROW 51402, N'Xã Nhà Bè không còn tồn tại trong danh mục hiện hành.', 1;

    INSERT INTO dbo.AI_UAT13_CustomerWardBackup (
        BatchID, ObjectID, OldLocationID, OldQuanHuyen,
        OldXaPhuong, NewXaPhuong
    )
    SELECT
        @BatchID, O.ObjectID, O.LocationID, O.QuanHuyen,
        O.XaPhuong, F.NewXaPhuong
    FROM dbo.CF_ObjectTbl O
    INNER JOIN @Fixes F ON F.ObjectID = O.ObjectID
    WHERE NULLIF(LTRIM(RTRIM(O.XaPhuong)), '') IS NULL
      AND NOT EXISTS (
          SELECT 1
          FROM dbo.AI_UAT13_CustomerWardBackup B
          WHERE B.BatchID = @BatchID AND B.ObjectID = O.ObjectID
      );

    UPDATE O
    SET O.XaPhuong = F.NewXaPhuong
    FROM dbo.CF_ObjectTbl O
    INNER JOIN @Fixes F ON F.ObjectID = O.ObjectID
    WHERE NULLIF(LTRIM(RTRIM(O.XaPhuong)), '') IS NULL;

    COMMIT TRANSACTION;
END TRY
BEGIN CATCH
    IF @@TRANCOUNT > 0 ROLLBACK TRANSACTION;
    THROW;
END CATCH;

SELECT
    O.ObjectID,
    O.ObjectName,
    O.LocationID,
    O.QuanHuyen,
    O.XaPhuong,
    CASE
        WHEN O.XaPhuong COLLATE Latin1_General_CI_AI
             = F.NewXaPhuong COLLATE Latin1_General_CI_AI THEN 'PASS'
        ELSE 'FAIL'
    END AS VerificationStatus
FROM @Fixes F
INNER JOIN dbo.CF_ObjectTbl O ON O.ObjectID = F.ObjectID
ORDER BY O.ObjectID;
GO

/*
ROLLBACK THỦ CÔNG (chỉ chạy khi cần hoàn tác batch này):

BEGIN TRANSACTION;
UPDATE O
SET O.LocationID = B.OldLocationID,
    O.QuanHuyen = B.OldQuanHuyen,
    O.XaPhuong = B.OldXaPhuong
FROM dbo.CF_ObjectTbl O
INNER JOIN dbo.AI_UAT13_CustomerWardBackup B ON B.ObjectID = O.ObjectID
WHERE B.BatchID = 'UAT13_WARD_20260727_V1';
COMMIT TRANSACTION;
*/

