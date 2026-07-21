USE medtest;
GO

-- =========================================================================
-- NẠP TOẠ ĐỘ MẪU TẠI LONG XUYÊN, AN GIANG CHO 4 KHÁCH HÀNG TRÊN TUYẾN:
-- =========================================================================

-- AG0020 (Nhà Thuốc Hiếu Nghĩa)
IF NOT EXISTS (SELECT 1 FROM dbo.CF_ObjectMapTbl WHERE ObjectID = 'AG0020')
    INSERT INTO dbo.CF_ObjectMapTbl (UserAutoID, ObjectID, Latitude, Longitude, MapDate)
    VALUES (CAST(NEWID() AS VARCHAR(50)), 'AG0020', 10.3758, 105.4312, GETDATE());
ELSE
    UPDATE dbo.CF_ObjectMapTbl SET Latitude = 10.3758, Longitude = 105.4312 WHERE ObjectID = 'AG0020';

-- AG0021 (Nhà Thuốc Ung Văn Khương)
IF NOT EXISTS (SELECT 1 FROM dbo.CF_ObjectMapTbl WHERE ObjectID = 'AG0021')
    INSERT INTO dbo.CF_ObjectMapTbl (UserAutoID, ObjectID, Latitude, Longitude, MapDate)
    VALUES (CAST(NEWID() AS VARCHAR(50)), 'AG0021', 10.3728, 105.4342, GETDATE());
ELSE
    UPDATE dbo.CF_ObjectMapTbl SET Latitude = 10.3728, Longitude = 105.4342 WHERE ObjectID = 'AG0021';

-- AG0022 (Nhà Thuốc Hồng Hà)
IF NOT EXISTS (SELECT 1 FROM dbo.CF_ObjectMapTbl WHERE ObjectID = 'AG0022')
    INSERT INTO dbo.CF_ObjectMapTbl (UserAutoID, ObjectID, Latitude, Longitude, MapDate)
    VALUES (CAST(NEWID() AS VARCHAR(50)), 'AG0022', 10.3708, 105.4282, GETDATE());
ELSE
    UPDATE dbo.CF_ObjectMapTbl SET Latitude = 10.3708, Longitude = 105.4282 WHERE ObjectID = 'AG0022';

-- AG0023 (Nhà Thuốc Lê Lợi)
IF NOT EXISTS (SELECT 1 FROM dbo.CF_ObjectMapTbl WHERE ObjectID = 'AG0023')
    INSERT INTO dbo.CF_ObjectMapTbl (UserAutoID, ObjectID, Latitude, Longitude, MapDate)
    VALUES (CAST(NEWID() AS VARCHAR(50)), 'AG0023', 10.3748, 105.4352, GETDATE());
ELSE
    UPDATE dbo.CF_ObjectMapTbl SET Latitude = 10.3748, Longitude = 105.4352 WHERE ObjectID = 'AG0023';
GO
