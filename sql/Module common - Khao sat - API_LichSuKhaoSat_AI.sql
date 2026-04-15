USE [medtest]
GO

SET ANSI_NULLS ON
GO
SET QUOTED_IDENTIFIER ON
GO

CREATE OR ALTER PROCEDURE [dbo].[API_LichSuKhaoSat_AI]
    @Username   VARCHAR(50),
    @FromDate   DATETIME = NULL,
    @ToDate     DATETIME = NULL,
    @BranchID   VARCHAR(50) = ''
AS
BEGIN
    SET NOCOUNT ON;
    
    -- 1. MẶC ĐỊNH KHOẢNG THỜI GIAN (Tháng hiện tại nếu NULL)
    IF @FromDate IS NULL SET @FromDate = DATEADD(MONTH, DATEDIFF(MONTH, 0, GETDATE()), 0);
    IF @ToDate IS NULL SET @ToDate = GETDATE();

    -- 2. KIỂM TRA QUYỀN TRUY CẬP
    IF NOT EXISTS (SELECT 1 FROM SY_User WHERE UserName = @Username AND COALESCE(Disable, 0) = 0)
    BEGIN
        SELECT N'❌ Lỗi: Tài khoản không hợp lệ hoặc đã bị khóa.' AS [message], 'chat' AS [action];
        RETURN;
    END

    -- 3. TRUY VẤN LỊCH SỬ KHẢO SÁT
    SELECT 
        U.BranchID,  
        (SELECT TOP 1 ManagerName FROM vEmployeeSales O WHERE O.EmployeeID = Max(U.EmployeeID)) AS ManagerName,  
        U.HoTen,   
        CAST(A.DocumentDate AS DATE) AS NgayTruyCap, 
        COUNT(*) AS SoLanKS
    FROM dbo.AR_DotKhaoSatTbl A
    LEFT JOIN SY_User U ON U.UserName = A.UserName
    WHERE CAST(A.DocumentDate AS DATE) BETWEEN @FromDate AND @ToDate
      AND (@BranchID = '' OR COALESCE(U.BranchID, '') = @BranchID)
    GROUP BY U.BranchID, U.HoTen, CAST(A.DocumentDate AS DATE)
    ORDER BY U.HoTen, CAST(A.DocumentDate AS DATE) DESC;
END
GO
