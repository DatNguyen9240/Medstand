USE medtest;
GO

/*
  KIỂM KÊ PHƯỜNG/XÃ KHÁCH HÀNG TRONG PHẠM VI 13 TÀI KHOẢN UAT

  - Chỉ đọc, không UPDATE dữ liệu.
  - Gộp khách trùng theo ObjectID nhưng vẫn ghi rõ các account nhìn thấy.
  - Chỉ đề xuất tự động khi có đúng một phường/xã trong danh mục khớp
    với chuỗi địa chỉ. Các trường hợp khác phải duyệt thủ công.

  Result set 1: tổng hợp theo account.
  Result set 2: danh sách khách hàng cần làm sạch.
*/

SET NOCOUNT ON;

DECLARE @Accounts TABLE (
    UserName VARCHAR(50) NOT NULL PRIMARY KEY,
    RoleName VARCHAR(20) NOT NULL,
    RegionID VARCHAR(10) NOT NULL
);

INSERT INTO @Accounts (UserName, RoleName, RegionID)
VALUES
    ('QLBH013.MED',  'MANAGER', 'MB'),
    ('NAMDINHB.MED', 'SALE',    'MB'),
    ('QLBH016.MED',  'MANAGER', 'MB'),
    ('BACNINHA.MED', 'SALE',    'MB'),
    ('QLBH005.MED',  'MANAGER', 'MT'),
    ('HUEB.MED',     'SALE',    'MT'),
    ('QLBH010.MED',  'MANAGER', 'MT'),
    ('DANANGA.MED',  'SALE',    'MT'),
    ('QLMN2',        'MANAGER', 'MN'),
    ('CanThoA',      'SALE',    'MN'),
    ('QLMD1',        'MANAGER', 'MN'),
    ('BinhPhuocA',   'SALE',    'MN'),
    ('QLBH024.MED',  'MANAGER', 'MN');

SELECT
    A.UserName,
    A.RoleName,
    A.RegionID,
    C.ObjectID
INTO #AccountCustomerScope
FROM @Accounts A
CROSS APPLY dbo.AR_GetObjectByUserFnc(A.UserName) C;

SELECT
    S.UserName,
    S.RoleName,
    S.RegionID,
    COUNT(DISTINCT S.ObjectID) AS ScopedCustomers,
    COUNT(DISTINCT CASE
        WHEN NULLIF(LTRIM(RTRIM(K.XaPhuong)), '') IS NULL THEN S.ObjectID
    END) AS MissingWardCustomers
FROM #AccountCustomerScope S
LEFT JOIN dbo.vKhachHangList K ON K.ObjectID = S.ObjectID
GROUP BY S.UserName, S.RoleName, S.RegionID
ORDER BY S.RegionID, S.RoleName, S.UserName;

;WITH CustomerRows AS (
    SELECT
        K.*,
        ROW_NUMBER() OVER (
            PARTITION BY UPPER(LTRIM(RTRIM(K.ObjectID)))
            ORDER BY K.StatusID DESC, K.ObjectID
        ) AS CustomerRowNo
    FROM dbo.vKhachHangList K
), ScopedCustomers AS (
    SELECT
        K.ObjectID,
        K.ObjectName,
        K.BranchID,
        K.Address,
        K.LocationID,
        K.QuanHuyen,
        K.XaPhuong
    FROM CustomerRows K
    WHERE K.CustomerRowNo = 1
      AND NULLIF(LTRIM(RTRIM(K.XaPhuong)), '') IS NULL
      AND EXISTS (
          SELECT 1
          FROM #AccountCustomerScope S
          WHERE UPPER(LTRIM(RTRIM(S.ObjectID)))
              = UPPER(LTRIM(RTRIM(K.ObjectID)))
      )
), AccountLists AS (
    SELECT
        D.ObjectID,
        STRING_AGG(CONVERT(NVARCHAR(MAX), D.UserName), ', ')
            WITHIN GROUP (ORDER BY D.UserName) AS VisibleToAccounts
    FROM (
        SELECT DISTINCT
            UPPER(LTRIM(RTRIM(S.ObjectID))) AS ObjectID,
            S.UserName
        FROM #AccountCustomerScope S
    ) D
    GROUP BY D.ObjectID
), MissingWard AS (
    SELECT
        K.ObjectID,
        K.ObjectName,
        K.BranchID,
        K.Address,
        K.LocationID,
        K.QuanHuyen,
        K.XaPhuong,
        A.VisibleToAccounts
    FROM ScopedCustomers K
    INNER JOIN AccountLists A
        ON A.ObjectID = UPPER(LTRIM(RTRIM(K.ObjectID)))
), SuggestedWard AS (
    SELECT
        M.*,
        X.MatchCount,
        X.SuggestedWard
    FROM MissingWard M
    OUTER APPLY (
        SELECT
            COUNT(*) AS MatchCount,
            MIN(P.XaPhuong) AS SuggestedWard
        FROM dbo.CF_XaPhuongTbl P
        WHERE NULLIF(LTRIM(RTRIM(M.Address)), '') IS NOT NULL
          AND M.Address COLLATE Latin1_General_CI_AI
              LIKE '%' + P.XaPhuong COLLATE Latin1_General_CI_AI + '%'
          AND (
              NULLIF(LTRIM(RTRIM(M.LocationID)), '') IS NULL
              OR P.TinhThanh COLLATE Latin1_General_CI_AI
                    = M.LocationID COLLATE Latin1_General_CI_AI
          )
    ) X
)
SELECT
    ObjectID,
    ObjectName,
    BranchID,
    Address,
    LocationID AS CurrentProvince,
    QuanHuyen AS CurrentDistrict,
    XaPhuong AS CurrentWard,
    CASE WHEN MatchCount = 1 THEN SuggestedWard ELSE NULL END AS SuggestedWard,
    CASE
        WHEN MatchCount = 1 THEN 'READY_FOR_REVIEW'
        WHEN MatchCount > 1 THEN 'AMBIGUOUS_ADDRESS'
        WHEN NULLIF(LTRIM(RTRIM(Address)), '') IS NULL THEN 'MISSING_ADDRESS'
        ELSE 'NO_CATALOG_MATCH'
    END AS ReviewStatus,
    ISNULL(MatchCount, 0) AS CatalogMatchCount,
    VisibleToAccounts
FROM SuggestedWard
ORDER BY
    CASE
        WHEN MatchCount = 1 THEN 1
        WHEN MatchCount > 1 THEN 2
        WHEN NULLIF(LTRIM(RTRIM(Address)), '') IS NULL THEN 4
        ELSE 3
    END,
    BranchID,
    ObjectID;

DROP TABLE #AccountCustomerScope;
GO
