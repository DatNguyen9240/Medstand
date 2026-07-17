const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const core = fs.readFileSync(
  path.join(root, 'sql', 'Module common - API_DanhMuc_AI.sql'),
  'utf8',
);
const bootstrap = fs.readFileSync(
  path.join(root, 'sql', 'Bootstrap_API_Metadata_Auto_AI.sql'),
  'utf8',
);

function count(pattern, value) {
  return (value.match(pattern) || []).length;
}

assert.match(
  core,
  /IF NOT EXISTS\s*\([\s\S]*?FROM dbo\.SY_User[\s\S]*?UserName = @Username[\s\S]*?ISNULL\(Disable, 0\) = 0[\s\S]*?RETURN/i,
  'API_DanhMuc_Core_AI must fail closed for missing or disabled users.',
);
assert.ok(
  core.indexOf('IF NOT EXISTS (') < core.indexOf("IF ISNULL(@Type, '') = ''"),
  'Authentication must run before the category response.',
);
assert.match(core, /UserGroupID IN \('Admin', 'SADM', 'BGD', 'GD'\)/i);
assert.match(core, /DECLARE @AllowedObjects TABLE/i);
assert.match(core, /DECLARE @AllowedEmployees TABLE/i);
assert.match(core, /DECLARE @AllowedStores TABLE/i);
assert.match(core, /AR_GetObjectByUserFnc\(@Username\)/i);
assert.match(core, /SY_UserStoreHouseTbl/i);

assert.ok(
  count(/A\.EmployeeID IN \(SELECT EmployeeID FROM @AllowedEmployees\)/gi, core) >= 2,
  'Order ownership scope must protect both all and donhang branches.',
);
assert.ok(
  count(/ObjectID IN \(SELECT EmployeeID FROM @AllowedEmployees\)/gi, core) >= 2,
  'Employee scope must protect both all and nhanvien branches.',
);
assert.match(
  core,
  /StoreHouseID IN \(SELECT StoreHouseID FROM @AllowedStores\)/i,
  'Warehouse lookup must use the verified user store assignment.',
);

assert.doesNotMatch(core, /'API_DonHang_AI\|/i);
assert.doesNotMatch(core, /'API_DanhsachTonKho_AI\|/i);
assert.match(core, /'@danh_muc\|@Type=donhang'/i);
assert.match(core, /'@danh_muc\|@Type=khohang'/i);

assert.match(
  bootstrap,
  /ALTER PROCEDURE dbo\.API_DanhMuc_AI[\s\S]*?EXEC dbo\.API_DanhMuc_Core_AI\s+@Type = @Type, @timkiem = @timkiem, @Username = @Username;/i,
  'API_DanhMuc_AI must remain a stable pass-through wrapper.',
);

console.log('API_DanhMuc scope contract: PASS');
