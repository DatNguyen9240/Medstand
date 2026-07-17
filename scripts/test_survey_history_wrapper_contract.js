const assert = require('assert');
const fs = require('fs');
const path = require('path');

const source = fs.readFileSync(
  path.resolve(__dirname, '..', 'sql', 'Module common - API_LichSuKhaoSat_AI.sql'),
  'utf8',
);

assert.match(source, /CREATE OR ALTER PROCEDURE dbo\.API_LichSuKhaoSat_AI/i);
assert.match(source, /FROM dbo\.SY_User[\s\S]*?UserName = @Username[\s\S]*?ISNULL\(Disable, 0\) = 0/i);
assert.match(source, /UPPER\(LTRIM\(RTRIM\(UserName\)\)\) = UPPER\(LTRIM\(RTRIM\(@Username\)\)\)/i);
assert.match(source, /@FromDate IS NULL OR DocumentDate >= CAST\(@FromDate AS DATE\)/i);
assert.match(source, /@ToDate IS NULL OR DocumentDate < DATEADD\(DAY, 1, CAST\(@ToDate AS DATE\)\)/i);
assert.doesNotMatch(source, /BranchID\s*=\s*@BranchID/i);
assert.match(source, /F\.IsSystemParam = 1[\s\S]*?F\.SourceOfTruth = 'VERIFIED_IDENTITY'/i);

console.log('Survey history wrapper contract: PASS');
