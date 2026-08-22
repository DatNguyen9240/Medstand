CREATE OR ALTER PROCEDURE dbo.API_LichSuKhaoSat_AI
    @Username VARCHAR(50),
    @FromDate DATETIME = NULL,
    @ToDate DATETIME = NULL,
    @BranchID VARCHAR(50) = ''
AS
BEGIN
    SET NOCOUNT ON;

    IF NOT EXISTS (
        SELECT 1
        FROM dbo.SY_User WITH (NOLOCK)
        WHERE UserName = @Username
          AND ISNULL(Disable, 0) = 0
    )
    BEGIN
        SELECT N'User không tồn tại hoặc đã bị khóa' AS Msg, 1 AS MsgType;
        RETURN;
    END;

    -- @BranchID is accepted for backward metadata compatibility but never
    -- trusted for authorization. Survey history is scoped to verified username.
    SELECT
        DocumentID,
        ISNULL(Title, N'Bài khảo sát') AS Title,
        CONVERT(VARCHAR(10), DocumentDate, 103) + ' '
            + LEFT(CONVERT(VARCHAR(8), DocumentDate, 108), 5) AS ThoiGian,
        CAST(ISNULL(KetQuaDung, 0) AS VARCHAR(10)) + '/'
            + CAST(ISNULL(SoCauHoi, 0) AS VARCHAR(10)) AS KetQua,
        ISNULL(Status, CASE WHEN ThoiGianKetThuc IS NULL THEN 'IN_PROGRESS' ELSE 'COMPLETED' END) AS Status,
        AssignedAt,
        StartedAt,
        CompletedAt,
        ExpiredAt,
        ObjectID,
        EmployeeID,
        BranchID
    FROM dbo.AR_DotKhaoSatTbl WITH (NOLOCK)
    WHERE UPPER(LTRIM(RTRIM(UserName))) = UPPER(LTRIM(RTRIM(@Username)))
      AND (@FromDate IS NULL OR DocumentDate >= CAST(@FromDate AS DATE))
      AND (@ToDate IS NULL OR DocumentDate < DATEADD(DAY, 1, CAST(@ToDate AS DATE)))
    ORDER BY CASE WHEN Status = 'IN_PROGRESS' THEN 0 ELSE 1 END, DocumentDate DESC;
END;
GO

UPDATE F
SET F.IsSystemParam = 1,
    F.SourceOfTruth = 'VERIFIED_IDENTITY'
FROM dbo.API_Field F
INNER JOIN dbo.API_Definition D ON D.ApiID = F.ApiID
WHERE D.ApiCode = '@lich_su_khao_sat'
  AND F.FieldCode = '@BranchID';
GO
