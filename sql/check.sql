USE [medtest];
GO
SELECT ApiCode, ApiName, StoredProcedure 
FROM dbo.API_Definition 
WHERE ApiCode = '@lich_su_khao_sat';
GO
