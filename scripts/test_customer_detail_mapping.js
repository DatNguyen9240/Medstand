'use strict';

const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const sql = fs.readFileSync(path.join(root, 'sql/Module common - API_KhachHangList_AI.sql'), 'utf8');
const ui = fs.readFileSync(path.join(root, 'src/js/pages/customer-management.js'), 'utf8');

const checks = [
  ['SQL keeps ERP scope', /AR_GetObjectByUserFnc\(@User\)/.test(sql)],
  ['SQL returns customer profile', ['A.TaxCode', 'A.Birthday', 'A.LoaiKhachHang', 'A.KenhBan', 'A.QuanHuyen', 'A.ThuDiTuyen'].every((v) => sql.includes(v))],
  ['SQL returns group and status', /CF_ObjectGroupTbl/.test(sql) && /G\.ObjectGroupName/.test(sql) && /A\.StatusName/.test(sql)],
  ['SQL returns bank fields', ['A.AccountNoHD', 'A.AccountNameHD', 'A.ChuTaiKhoan'].every((v) => sql.includes(v))],
  ['UI carries full detail', ['data-objectgroupid', 'data-objectgroupname', 'data-bankacc', 'data-bankowner', 'data-branchid'].every((v) => ui.includes(v))],
  ['UI maps group and bank', ["setListValue('group'", "setValue('bankAcc'", "setValue('bankOwner'", "setValue('bank'"].every((v) => ui.includes(v))],
  ['Unsupported edit fields are locked', ["setLocked('group', true)", "setLocked('bankAcc', true)", "setLocked('bankOwner', true)", "setLocked('bank', true)"].every((v) => ui.includes(v))],
  ['Birthday is user-readable', /function displayDate\(/.test(ui)],
];

const failed = checks.filter(([, pass]) => !pass);
console.log(JSON.stringify({
  Task: 'CUSTOMER-DETAIL-MAPPING-STATIC',
  Status: failed.length ? 'FAIL' : 'PASS',
  Passed: checks.length - failed.length,
  Total: checks.length,
  Checks: checks.map(([name, pass]) => ({ name, pass })),
}, null, 2));

if (failed.length) process.exitCode = 1;
