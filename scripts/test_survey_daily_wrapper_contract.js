const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const source = fs.readFileSync(path.join(root, 'sql', 'Module common - API_KiemTraKhaoSatNgay_AI.sql'), 'utf8');

assert.match(source, /CREATE OR ALTER PROCEDURE dbo\.API_KiemTraKhaoSatNgay_AI/i);
assert.match(source, /FROM dbo\.SY_User[\s\S]*?UserName = @Username[\s\S]*?ISNULL\(Disable, 0\) = 0/i);
assert.match(source, /SELECT N'User không tồn tại hoặc đã bị khóa' AS Msg, 1 AS MsgType/i);
assert.match(
  source,
  /EXEC dbo\.API_KiemTraKhaoSatNgay[\s\S]*?@User = @Username[\s\S]*?@Username = @Username[\s\S]*?@BranchID = ''[\s\S]*?@Ngay = @Ngay/i,
);
assert.doesNotMatch(source, /@User\s+VARCHAR|@BranchID\s+VARCHAR/i);

console.log('Survey daily wrapper contract: PASS');
