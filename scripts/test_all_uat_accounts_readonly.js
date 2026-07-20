'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { loadLocalEnv } = require('./lib/load-local-env');

const root = path.resolve(__dirname, '..');
loadLocalEnv(root);

const allAccounts = [
  { region: 'MB', role: 'manager', username: 'QLBH013.MED', pairedWith: 'NAMDINHB.MED' },
  { region: 'MB', role: 'tdv', username: 'NAMDINHB.MED', pairedWith: 'QLBH013.MED' },
  { region: 'MB', role: 'manager', username: 'QLBH016.MED', pairedWith: 'BACNINHA.MED' },
  { region: 'MB', role: 'tdv', username: 'BACNINHA.MED', pairedWith: 'QLBH016.MED' },
  { region: 'MT', role: 'manager', username: 'QLBH005.MED', pairedWith: 'HUEB.MED' },
  { region: 'MT', role: 'tdv', username: 'HUEB.MED', pairedWith: 'QLBH005.MED' },
  { region: 'MT', role: 'manager', username: 'QLBH010.MED', pairedWith: 'DANANGA.MED' },
  { region: 'MT', role: 'tdv', username: 'DANANGA.MED', pairedWith: 'QLBH010.MED' },
  { region: 'MN', role: 'manager', username: 'QLMN2', pairedWith: 'CanThoA' },
  { region: 'MN', role: 'tdv', username: 'CanThoA', pairedWith: 'QLMN2' },
  { region: 'MN', role: 'manager', username: 'QLMD1', pairedWith: 'BinhPhuocA' },
  { region: 'MN', role: 'manager', username: 'QLBH024.MED', pairedWith: 'BinhPhuocA' },
  { region: 'MN', role: 'tdv', username: 'BinhPhuocA', pairedWith: 'QLMD1,QLBH024.MED' },
];

const safeParams = {
  // Không truyền khách để kiểm tra danh sách Tier/Risk theo đúng scope tài khoản.
  '@cham_diem_kh': {},
  '@cong_no_chi_tiet': { '@MaKhachHang': '__UAT_NO_DATA__', '@DenNgay': '2000-01-01' },
  '@cong_no_khach_hang': { '@MaKhachHang': '__UAT_NO_DATA__', '@DenNgay': '2000-01-01' },
  '@danh_muc': { '@Type': 'khachhang', '@timkiem': '__UAT_NO_DATA__' },
  '@danh_sach_cau_hoi_khao_sat': { '@MaKhachHang': '__UAT_NO_DATA__' },
  '@danh_sach_tonkho': { '@timkiem': '__UAT_NO_DATA__' },
  '@de_xuat_khuyen_mai': {},
  '@doanh_so': { '@TuNgay': '2000-01-01', '@DenNgay': '2000-01-01', '@MaKhachHang': '__UAT_NO_DATA__' },
  '@don_hang': { '@timkiem': '__UAT_NO_DATA__', '@TopN': 1 },
  '@goi_ydon_hang': { '@MaKhachHang': '__UAT_NO_DATA__', '@TopN': 1 },
  '@goi_ydon_thuoc': { '@timkiem': '__UAT_NO_DATA__' },
  '@hoa_don': { '@TuNgay': '2000-01-01', '@DenNgay': '2000-01-01', '@timkiem': '__UAT_NO_DATA__' },
  '@hoa_don_chi_tiet': { '@DocumentID': '__UAT_NO_DATA__' },
  '@khao_sat360': { '@ObjectID': '__UAT_NO_DATA__', '@FromDate': '2000-01-01', '@ToDate': '2000-01-01' },
  '@kiem_tra_khao_sat': { '@Ngay': '2000-01-01' },
  '@kiem_tra_khao_sat_ngay': { '@Ngay': '2000-01-01' },
  '@lich_su_khao_sat': { '@FromDate': '2000-01-01', '@ToDate': '2000-01-01' },
  '@san_pham_trong_tam': { '@MaKhachHang': '__UAT_NO_DATA__', '@TopN': 1 },
  '@thong_bao': {},
  '@tich_luy': { '@MaKhachHang': '__UAT_NO_DATA__' },
  '@tim_san_pham_theo_trieu_chung': { '@Keyword': '__UAT_NO_DATA__' },
  '@tra_cuu_san_pham': { '@timkiem': '__UAT_NO_DATA__', '@TopN': 1 },
  '@tuyen_ban_hang': { '@TopN': 8 },
  '@upsell_goi_y': { '@MaKhachHang': '__UAT_NO_DATA__', '@timkiem': '__UAT_NO_DATA__', '@TopN': 1 },
};

const deniedMutations = [
  { apiCode: '@cap_nhat_ket_qua_khao_sat', code: 'API_NOT_ALLOWLISTED' },
  { apiCode: '@khach_hang_insert', code: 'PILOT_READ_ONLY' },
  { apiCode: '@san_pham_trong_tam_import', code: 'PILOT_READ_ONLY' },
];

const password = process.env.UAT_TEST_PASSWORD || '';
const gatewayBase = (process.env.UAT_GATEWAY_BASE_URL || 'http://127.0.0.1:3000').replace(/\/$/, '');
const n8nBase = (process.env.E2E_N8N_URL || 'http://127.0.0.1:5678').replace(/\/$/, '');
const loginOnly = process.argv.includes('--login-only');
const previewOnly = process.argv.includes('--preview-only');
const resume = process.argv.includes('--resume');
const accountArgIndex = process.argv.indexOf('--account');
const accountFilter = accountArgIndex >= 0 ? String(process.argv[accountArgIndex + 1] || '').trim() : '';
const apiArgIndex = process.argv.indexOf('--api');
const apiFilter = apiArgIndex >= 0 ? String(process.argv[apiArgIndex + 1] || '').trim().toLowerCase() : '';
const tierArgIndex = process.argv.indexOf('--tier');
const tierFilter = tierArgIndex >= 0 ? String(process.argv[tierArgIndex + 1] || '').trim().toUpperCase() : '';
const pageArgIndex = process.argv.indexOf('--page');
const pageFilter = pageArgIndex >= 0 ? Math.max(1, Number(process.argv[pageArgIndex + 1] || 1)) : 1;
const dateArgIndex = process.argv.indexOf('--date');
const dateFilter = dateArgIndex >= 0 ? String(process.argv[dateArgIndex + 1] || '').trim() : '';
assert(!tierFilter || ['A', 'B', 'C'].includes(tierFilter), `Invalid tier filter: ${tierFilter}`);
if (apiFilter === '@cham_diem_kh') {
  safeParams['@cham_diem_kh'] = {
    ...(tierFilter ? { '@NhomFilter': tierFilter } : {}),
    '@Page': pageFilter,
    '@PageSize': 50,
  };
}
if (apiFilter === '@tuyen_ban_hang' && dateFilter) {
  safeParams['@tuyen_ban_hang'] = { '@TopN': 8, '@NgayTarget': dateFilter };
}
const reportPath = path.join(root, 'reports', accountFilter
  ? `uat-${previewOnly ? 'preview' : 'readonly'}-${accountFilter.replace(/[^a-z0-9._-]/gi, '_')}${apiFilter ? '-' + apiFilter.replace(/[^a-z0-9._-]/gi, '_') : ''}${tierFilter ? '-tier-' + tierFilter : ''}${pageFilter > 1 ? '-page-' + pageFilter : ''}${dateFilter ? '-date-' + dateFilter.replace(/[^0-9-]/g, '') : ''}.json`
  : 'uat-all-accounts-readonly.json');
const accounts = accountFilter
  ? allAccounts.filter(account => account.username.toLowerCase() === accountFilter.toLowerCase())
  : allAccounts;
assert(accounts.length > 0, `Unknown UAT account: ${accountFilter}`);

function protectGatewayPayload(payload) {
  const base64 = Buffer.from(JSON.stringify(payload), 'utf8').toString('base64');
  const input = Buffer.from(base64, 'utf8');
  const output = Buffer.alloc(input.length);
  for (let index = 0; index < input.length; index += 1) output[index] = input[index] ^ 107;
  return output.toString('base64');
}

function unprotectGatewayPayload(value) {
  const input = Buffer.from(value, 'base64');
  const output = Buffer.alloc(input.length);
  for (let index = 0; index < input.length; index += 1) output[index] = input[index] ^ 107;
  return Buffer.from(output.toString('utf8'), 'base64').toString('utf8');
}

async function readJson(response) {
  const text = await response.text();
  if (!text) return {};
  try { return JSON.parse(text); } catch (_) { return { raw: text.slice(0, 160) }; }
}

async function gateway(endpoint, body, token = '') {
  const response = await fetch(`${gatewayBase}/api/gateway`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify({ data: protectGatewayPayload({ method: 'POST', endpoint, body }) }),
    signal: AbortSignal.timeout(45_000),
  });
  const envelope = await readJson(response);
  if (!response.ok || !envelope.data) throw new Error(`gateway HTTP ${response.status}`);
  return JSON.parse(unprotectGatewayPayload(envelope.data));
}

async function webhook(pathname, token, body, extraHeaders = {}) {
  const response = await fetch(`${n8nBase}/webhook/${pathname}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      Origin: 'https://medtest.bms79.com',
      ...extraHeaders,
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(60_000),
  });
  return { status: response.status, body: await readJson(response) };
}

function responseList(body) {
  if (Array.isArray(body)) return body;
  for (const value of [body?.records, body?.data, body?.result]) if (Array.isArray(value)) return value;
  return [];
}

function publicEvidence(result) {
  return {
    status: result.status,
    code: result.body?.code || null,
    count: Number.isInteger(result.body?.count) ? result.body.count : null,
    requestId: result.body?.requestId || null,
  };
}

function writeReport(results, startedAt) {
  fs.mkdirSync(path.dirname(reportPath), { recursive: true });
  fs.writeFileSync(reportPath, JSON.stringify({
    startedAt,
    updatedAt: new Date().toISOString(),
    mode: loginOnly ? 'login-only' : 'read-only-full',
    accountCount: accounts.length,
    results,
  }, null, 2));
}

async function testAccount(account) {
  const startedAt = new Date().toISOString();
  console.log(`[${account.username}] login (${account.role})`);
  const loginFresh = async () => {
    const login = await gateway('/api/login', { username: account.username, password });
    assert.strictEqual(login.code, 0, login.msg || 'login failed');
    assert(login.access_token, 'login did not return access_token');
    return String(login.access_token);
  };
  let token = await loginFresh();
  console.log(`[${account.username}] login PASS; loading profile`);
  const profile = await gateway('/api/API_UserInfo', {}, token);
  const record = Array.isArray(profile.records) ? profile.records[0] : null;
  assert(record, 'API_UserInfo did not return a mapped identity');

  const actualUsername = String(record.username || record.UserName || '');
  assert.strictEqual(actualUsername.toLowerCase(), account.username.toLowerCase(), 'profile username mismatch');
  const managerMarker = record.Manager ?? record.IsManager;
  const actualRole = Number(managerMarker) === 1 ? 'manager' : 'tdv';
  assert.strictEqual(actualRole, account.role, `expected ${account.role}, got ${actualRole}`);

  const result = {
    ...account,
    startedAt,
    identity: {
      username: actualUsername,
      role: actualRole,
      hasEmployeeId: Boolean(record.EmployeeID || record.employeeId),
      hasBranchId: Boolean(record.BranchID || record.branchId),
      hasManagerId: Boolean(record.ManagerID || record.managerId),
    },
    login: 'PASS',
    catalog: null,
    commands: [],
    mutations: [],
    previews: [],
    result: loginOnly ? 'PASS' : 'RUNNING',
  };
  if (loginOnly) return result;

  console.log(`[${account.username}] profile PASS; loading API catalog`);
  let catalogResponse = await webhook('api-list-active', token, {});
  if (catalogResponse.status === 401) {
    token = await loginFresh();
    catalogResponse = await webhook('api-list-active', token, {});
  }
  const catalog = responseList(catalogResponse.body);
  assert.strictEqual(catalogResponse.status, 200, `catalog HTTP ${catalogResponse.status}`);
  assert.strictEqual(catalog.length, 24, `expected 24 commands, got ${catalog.length}`);
  result.catalog = { ...publicEvidence(catalogResponse), count: catalog.length };

  const commandsToRun = apiFilter
    ? catalog.filter(item => String(item.ApiCode || '').toLowerCase() === apiFilter)
    : catalog;
  assert(!apiFilter || commandsToRun.length === 1, `API not found in authorized catalog: ${apiFilter}`);
  for (let index = 0; !previewOnly && index < commandsToRun.length; index += 1) {
    const apiCode = String(commandsToRun[index].ApiCode || '');
    const apiStartedAt = Date.now();
    console.log(`[${account.username}] executing ${apiCode}`);
    let response = await webhook('api-execute', token, { ApiCode: apiCode, params: safeParams[apiCode] || {} });
    let authRetry = false;
    if (response.status === 401) {
      token = await loginFresh();
      response = await webhook('api-execute', token, { ApiCode: apiCode, params: safeParams[apiCode] || {} });
      authRetry = true;
    }
    const evidence = { apiCode, authRetry, ...publicEvidence(response) };
    const envelopeOk = /^req-/.test(String(evidence.requestId || ''))
      && typeof response.body?.success === 'boolean'
      && typeof response.body?.code === 'string'
      && Array.isArray(response.body?.data)
      && Number.isInteger(response.body?.count)
      && response.body.count === response.body.data.length;
    evidence.result = [200, 422].includes(response.status) && envelopeOk ? 'PASS' : 'FAIL';
    if (apiCode === '@cham_diem_kh') {
      evidence.result = response.status === 200 && response.body?.success === true && envelopeOk ? 'PASS' : 'FAIL';
      const tierCounts = {};
      for (const row of response.body?.data || []) {
        const tier = String(row.Nhom || row.ValueSegment || 'UNKNOWN').toUpperCase();
        tierCounts[tier] = (tierCounts[tier] || 0) + 1;
      }
      evidence.tierCounts = tierCounts;
      evidence.totalRows = Number(response.body?.data?.[0]?.TotalRows || response.body?.data?.[0]?.totalRows || 0) || null;
    }
    if (apiCode === '@tuyen_ban_hang') {
      const routeRows = response.body?.data || [];
      evidence.lastVisitStatuses = [...new Set(routeRows.map(row => String(row.LastVisitStatus || '')).filter(Boolean))];
      evidence.lastPurchaseSources = [...new Set(routeRows.map(row => String(row.LastPurchaseSource || '')).filter(Boolean))];
      evidence.ruleVersions = [...new Set(routeRows.map(row => String(row.RuleVersion || '')).filter(Boolean))];
      evidence.result = response.status === 200
        && response.body?.success === true
        && envelopeOk
        && routeRows.length <= 8
        && routeRows.every(row => row.LastVisitStatus === 'CHECKIN_SOURCE_UNAVAILABLE')
        && routeRows.every(row => row.LastPurchaseSource === 'AR_InvoiceTbl')
        ? 'PASS' : 'FAIL';
    }
    result.commands.push(evidence);
    console.log(`[${account.username}] ${apiCode} HTTP ${response.status} in ${Date.now() - apiStartedAt}ms`);
    if (evidence.result === 'FAIL') console.error(`[${account.username}] ${apiCode}: FAIL`);
  }

  for (const mutation of (previewOnly || apiFilter) ? [] : deniedMutations) {
    const response = await webhook('api-execute', token, { ApiCode: mutation.apiCode, params: {} }, {
      'Idempotency-Key': `uat-all-${account.username}-${Date.now()}-${mutation.apiCode.slice(1)}`,
    });
    const evidence = { apiCode: mutation.apiCode, ...publicEvidence(response) };
    evidence.result = response.status === 403 && evidence.code === mutation.code ? 'PASS' : 'FAIL';
    result.mutations.push(evidence);
  }

  if (!apiFilter) {
  const cartPreview = await webhook('api-execute', token, {
    ApiCode: '@lap_don_hang',
    params: { '@MaKhachHang': '__UAT_PREVIEW_ONLY__', '@ItemList': '[]' },
  });
  const previewEvidence = { apiCode: '@lap_don_hang', ...publicEvidence(cartPreview) };
  previewEvidence.uiTemplate = cartPreview.body?.uiTemplate || null;
  previewEvidence.message = String(cartPreview.body?.message || '').slice(0, 160);
  previewEvidence.dataKeys = Object.keys(cartPreview.body?.data?.[0] || {});
  previewEvidence.result = cartPreview.status === 200
    && cartPreview.body?.success === true
    && cartPreview.body?.uiTemplate === 'CART' ? 'PASS' : 'FAIL';
  result.previews.push(previewEvidence);
  }

  result.result = result.commands.every(item => item.result === 'PASS')
    && result.mutations.every(item => item.result === 'PASS')
    && result.previews.every(item => item.result === 'PASS') ? 'PASS' : 'FAIL';
  return result;
}

async function main() {
  assert(password, 'UAT_TEST_PASSWORD is missing from local environment');
  const startedAt = new Date().toISOString();
  let results = [];
  if (resume && fs.existsSync(reportPath)) {
    const previous = JSON.parse(fs.readFileSync(reportPath, 'utf8'));
    if (previous.mode === (loginOnly ? 'login-only' : 'read-only-full') && Array.isArray(previous.results)) {
      results = previous.results.filter(item => item.result === 'PASS');
    }
  }
  const completed = new Set(results.map(item => String(item.username).toLowerCase()));
  const pendingAccounts = accounts.filter(account => !completed.has(account.username.toLowerCase()));
  console.log(`UAT pending accounts: ${pendingAccounts.length}/${accounts.length}`);
  for (const account of pendingAccounts) {
    try {
      results.push(await testAccount(account));
    } catch (error) {
      results.push({ ...account, result: 'FAIL', error: String(error.message || error).slice(0, 240) });
      console.error(`[${account.username}] FAIL: ${error.message || error}`);
    }
    writeReport(results, startedAt);
    console.log(`[${account.username}] completed: ${results[results.length - 1].result}`);
  }
  const passed = results.filter(item => item.result === 'PASS').length;
  console.log(`UAT all accounts: ${passed}/${accounts.length} PASS`);
  if (passed !== accounts.length) process.exitCode = 1;
}

main().catch(error => {
  console.error(error.message || error);
  process.exitCode = 1;
});
