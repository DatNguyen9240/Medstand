'use strict';

/* PRODUCT-DIAG-001 — live gateway regression cho identity của API_HangHoaList_AI.
 *
 * Trước đây phần "gateway" của task này chỉ là unit test dùng fetch/envelope giả
 * (xem verify_product_diag_001.js: HELPER_ACCEPTS_REAL_GATEWAY_ENVELOPE,
 * HTTP_PASSES_GATEWAY_DIAGNOSTIC_TO_HELPER — cả hai không chạm server thật).
 * Script này khởi động server.js thật trên cổng cô lập, đăng nhập bằng tài khoản UAT
 * thật, gửi Username giả qua giao thức /api/gateway mã hoá thật giống trình duyệt,
 * và chứng minh READ_IDENTITY_POLICY (order-status-guard.js) khoá identity theo token
 * cho endpoint /api/API_HangHoaList_AI — không tin trường Username trong query.
 *
 * Chỉ đọc: dùng mssql (TEST_DB_*) để lấy một ObjectID thật trong phạm vi tài khoản Sale
 * qua đúng hàm nghiệp vụ (AR_GetObjectByUserFnc), không mutation, không hard-code khách.
 */

const fs = require('fs');
const path = require('path');
const http = require('http');
const { spawn } = require('child_process');
const sql = require('mssql');

const ROOT = path.resolve(__dirname, '..');
const PORT = Number(process.env.PRODUCT_DIAG_GATEWAY_TEST_PORT || 3422);

function readEnv(relativePath) {
  const values = {};
  const filePath = path.join(ROOT, relativePath);
  if (!fs.existsSync(filePath)) return values;
  for (const line of fs.readFileSync(filePath, 'utf8').replace(/^﻿/, '').split(/\r?\n/)) {
    const match = line.match(/^\s*([^#=]+)=(.*)$/);
    if (match) values[match[1].trim()] = match[2].trim().replace(/^['"]|['"]$/g, '');
  }
  return values;
}

function assert(condition, message) {
  if (!condition) throw new Error('ASSERTION_FAILED: ' + message);
}

function encrypt(value, key = 107) {
  const base64 = Buffer.from(value, 'utf8').toString('base64');
  let xor = '';
  for (let index = 0; index < base64.length; index += 1) {
    xor += String.fromCharCode(base64.charCodeAt(index) ^ key);
  }
  return Buffer.from(xor, 'latin1').toString('base64');
}

function decrypt(value, key = 107) {
  const xor = Buffer.from(String(value || ''), 'base64').toString('latin1');
  let base64 = '';
  for (let index = 0; index < xor.length; index += 1) {
    base64 += String.fromCharCode(xor.charCodeAt(index) ^ key);
  }
  return Buffer.from(base64, 'base64').toString('utf8');
}

function gateway(payload, token, requestId) {
  const raw = JSON.stringify({ data: encrypt(JSON.stringify(payload)) });
  return new Promise((resolve, reject) => {
    const request = http.request({
      hostname: '127.0.0.1',
      port: PORT,
      path: '/api/gateway',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(raw),
        'x-request-id': requestId,
        ...(token ? { Authorization: 'Bearer ' + token } : {})
      }
    }, (response) => {
      let body = '';
      response.on('data', (chunk) => { body += chunk; });
      response.on('end', () => {
        try {
          const envelope = JSON.parse(body);
          const decoded = envelope.data ? JSON.parse(decrypt(envelope.data)) : envelope;
          resolve({ status: response.statusCode, requestId, body: decoded });
        } catch (error) {
          reject(new Error(`Không giải mã được gateway response HTTP ${response.statusCode}: ${error.message}`));
        }
      });
    });
    request.on('error', reject);
    request.end(raw);
  });
}

async function waitForServer(timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      await new Promise((resolve, reject) => {
        const request = http.get({ hostname: '127.0.0.1', port: PORT, path: '/' }, (response) => {
          response.resume();
          resolve();
        });
        request.on('error', reject);
      });
      return;
    } catch (_) {
      await new Promise((resolve) => setTimeout(resolve, 250));
    }
  }
  throw new Error('Local gateway không sẵn sàng sau ' + timeoutMs + 'ms');
}

async function login(username, password) {
  const response = await gateway(
    { method: 'POST', endpoint: '/api/login', body: { username, password } },
    '',
    'req-diag001-login-' + username
  );
  const token = response.body && (response.body.access_token || response.body.Token);
  if (!token) throw new Error(`Đăng nhập thất bại cho ${username}: HTTP ${response.status}`);
  return token;
}

function firstRow(response) {
  const body = response.body || {};
  const rows = Array.isArray(body) ? body : (body.records || []);
  return rows[0] || {};
}

/* '_timestamp' đổi theo giây gọi, không phản ánh identity — loại trước khi so sánh
   để tránh flaky do đúng lúc chạy vắt qua ranh giới giây. */
function stableBody(body) {
  const clone = JSON.parse(JSON.stringify(body || {}));
  delete clone._timestamp;
  return JSON.stringify(clone);
}

async function fetchScopedObjectId(pool, username) {
  const result = await pool.request()
    .input('u', sql.VarChar(50), username)
    .query('SELECT TOP (1) ObjectID FROM dbo.AR_GetObjectByUserFnc(@u) ORDER BY ObjectID;');
  const row = result.recordset[0];
  if (!row || !row.ObjectID) throw new Error(`Không tìm được ObjectID nào trong phạm vi của ${username} để dựng ca kiểm thử.`);
  return row.ObjectID;
}

async function main() {
  const env = { ...readEnv('.env'), ...readEnv('.env.uat.local'), ...process.env };
  const password = env.UAT_TEST_PASSWORD;
  const manager = String(env.UAT_MANAGER_USERS || '').split(',')[0].trim();
  const sale = String(env.UAT_TDV_USERS || '').split(',')[0].trim();
  if (!password || !manager || !sale) throw new Error('Thiếu UAT_TEST_PASSWORD/UAT_MANAGER_USERS/UAT_TDV_USERS.');

  const pool = await sql.connect({
    server: env.TEST_DB_SERVER,
    port: Number(env.TEST_DB_PORT || 1433),
    database: env.TEST_DB_DATABASE,
    user: env.TEST_DB_USER,
    password: env.TEST_DB_PASSWORD,
    options: { encrypt: false, trustServerCertificate: true },
    connectionTimeout: 15000,
    requestTimeout: 60000,
    pool: { max: 1, min: 0, idleTimeoutMillis: 10000 }
  });

  const child = spawn(process.execPath, ['server.js'], {
    cwd: ROOT,
    env: { ...process.env, PORT: String(PORT) },
    stdio: ['ignore', 'pipe', 'pipe']
  });
  let serverLog = '';
  child.stdout.on('data', (data) => { serverLog += data.toString(); });
  child.stderr.on('data', (data) => { serverLog += data.toString(); });
  const results = [];
  const evidence = [];

  /* Bằng chứng mạnh nhất không phải suy luận từ response, mà là chính request server.js
     CHUYỂN TIẾP sang backend thật — server.js log mỗi lần "Forwarding GET" ra chuỗi query đã
     ghi đè. Đọc lại đúng URL đó (đã che domain nội bộ) để evidence tự chứng minh được, không
     cần tin lời assert của chính script này. */
  async function gatewayTracked(payload, token, requestId) {
    const before = serverLog.length;
    const result = await gateway(payload, token, requestId);
    const slice = serverLog.slice(before);
    const match = slice.match(/Forwarding GET to https?:\/\/[^/]+(\/api\/API_HangHoaList_AI\?q=[^\s]+)/);
    const forwardedQuery = match ? decodeURIComponent(match[1]) : null;
    let forwardedUsername = null;
    if (forwardedQuery) {
      try { forwardedUsername = JSON.parse(forwardedQuery.split('?q=')[1]).Username || null; } catch (_) { /* ignore */ }
    }
    return { ...result, forwardedUsername };
  }

  try {
    const dbName = (await pool.request().query('SELECT DB_NAME() AS D;')).recordset[0].D;
    if (dbName !== 'medtest') throw new Error(`Chỉ chạy trên medtest; hiện tại ${dbName}.`);

    const saleObjectId = await fetchScopedObjectId(pool, sale);

    await waitForServer(20000);
    const managerToken = await login(manager, password);
    const saleToken = await login(sale, password);

    // TEST 1 — Username giả không tồn tại trong query bị ghi đè bởi identity thật của token.
    // sql/Module_Common_API_HangHoaList_AI.sql:48-50 kiểm SY_User tồn tại/không khoá TRƯỚC
    // khi kiểm phạm vi khách hàng. Nếu gateway còn tin @Username do client gửi, tài khoản giả
    // này sẽ bị chặn ở đúng bước đó với message "Tài khoản không tồn tại hoặc đã bị khóa".
    const forgedGhost = 'ACCOUNT_DOES_NOT_EXIST_' + Date.now();
    const ghostCall = await gatewayTracked({
      method: 'GET',
      endpoint: '/api/API_HangHoaList_AI?q=' + encodeURIComponent(JSON.stringify({
        Username: forgedGhost, username: forgedGhost, UserName: forgedGhost,
        ObjectID: saleObjectId, ItemID: '', SearchText: ''
      }))
    }, saleToken, 'req-diag001-ghost-username');
    const ghostRow = firstRow(ghostCall);
    assert(!/Tài khoản không tồn tại|đã bị khóa/i.test(String(ghostRow.Msg || '')),
      `Username giả "${forgedGhost}" (không tồn tại) đã lọt qua kiểm tra định danh: ${ghostRow.Msg}`);
    assert(ghostCall.forwardedUsername === sale,
      `Server phải chuyển tiếp Username thật của token (${sale}) sang backend, không phải giá trị giả gửi lên (nhận được: ${ghostCall.forwardedUsername}).`);
    results.push('GHOST_USERNAME_OVERRIDDEN_BY_TOKEN_IDENTITY');
    evidence.push({
      case: 'GHOST_USERNAME_OVERRIDDEN_BY_TOKEN_IDENTITY',
      requestId: ghostCall.requestId, status: ghostCall.status,
      forgedUsernameSentByClient: forgedGhost,
      usernameActuallyForwardedToBackend: ghostCall.forwardedUsername
    });

    // TEST 2 — Kết quả không đổi dù trường Username trong query là identity thật của một
    // tài khoản KHÁC (manager) so với chủ token thật (sale). Nếu server còn đọc field này,
    // Sale sẽ nhận kết quả tính theo phạm vi của Manager thay vì phạm vi của chính mình.
    const asSelf = await gatewayTracked({
      method: 'GET',
      endpoint: '/api/API_HangHoaList_AI?q=' + encodeURIComponent(JSON.stringify({
        Username: sale, ObjectID: saleObjectId, ItemID: '', SearchText: ''
      }))
    }, saleToken, 'req-diag001-sale-as-self');
    const spoofedAsManager = await gatewayTracked({
      method: 'GET',
      endpoint: '/api/API_HangHoaList_AI?q=' + encodeURIComponent(JSON.stringify({
        Username: manager, username: manager, UserName: manager,
        ObjectID: saleObjectId, ItemID: '', SearchText: ''
      }))
    }, saleToken, 'req-diag001-sale-spoofs-manager');
    assert(asSelf.status === spoofedAsManager.status
      && stableBody(asSelf.body) === stableBody(spoofedAsManager.body),
      'Kết quả API_HangHoaList_AI đổi theo Username giả trong query — identity KHÔNG do token quyết định.');
    assert(spoofedAsManager.forwardedUsername === sale,
      `Sale giả Manager nhưng backend phải vẫn nhận Username=${sale} (nhận được: ${spoofedAsManager.forwardedUsername}).`);
    results.push('TOKEN_IDENTITY_WINS_REGARDLESS_OF_QUERY_USERNAME');
    evidence.push({
      case: 'TOKEN_IDENTITY_WINS_REGARDLESS_OF_QUERY_USERNAME',
      requestIdReal: asSelf.requestId, requestIdForged: spoofedAsManager.requestId,
      statusReal: asSelf.status, statusForged: spoofedAsManager.status,
      identical: stableBody(asSelf.body) === stableBody(spoofedAsManager.body),
      forgedUsernameSentByClient: manager,
      usernameActuallyForwardedToBackend: spoofedAsManager.forwardedUsername
    });

    // TEST 3 — Chiều ngược lại: Manager thật giả làm Sale qua query cũng không bị hạ quyền.
    const managerObjectId = await fetchScopedObjectId(pool, manager);
    const managerAsSelf = await gatewayTracked({
      method: 'GET',
      endpoint: '/api/API_HangHoaList_AI?q=' + encodeURIComponent(JSON.stringify({
        Username: manager, ObjectID: managerObjectId, ItemID: '', SearchText: ''
      }))
    }, managerToken, 'req-diag001-manager-as-self');
    const managerSpoofsSale = await gatewayTracked({
      method: 'GET',
      endpoint: '/api/API_HangHoaList_AI?q=' + encodeURIComponent(JSON.stringify({
        Username: sale, username: sale, ObjectID: managerObjectId, ItemID: '', SearchText: ''
      }))
    }, managerToken, 'req-diag001-manager-spoofs-sale');
    assert(managerAsSelf.status === managerSpoofsSale.status
      && stableBody(managerAsSelf.body) === stableBody(managerSpoofsSale.body),
      'Manager thật bị đổi kết quả khi giả Username thành Sale — identity KHÔNG do token quyết định.');
    assert(managerSpoofsSale.forwardedUsername === manager,
      `Manager giả Sale nhưng backend phải vẫn nhận Username=${manager} (nhận được: ${managerSpoofsSale.forwardedUsername}).`);
    results.push('TOKEN_IDENTITY_WINS_BOTH_DIRECTIONS');
    evidence.push({
      case: 'TOKEN_IDENTITY_WINS_BOTH_DIRECTIONS',
      requestIdReal: managerAsSelf.requestId, requestIdForged: managerSpoofsSale.requestId,
      statusReal: managerAsSelf.status, statusForged: managerSpoofsSale.status,
      identical: stableBody(managerAsSelf.body) === stableBody(managerSpoofsSale.body),
      forgedUsernameSentByClient: sale,
      usernameActuallyForwardedToBackend: managerSpoofsSale.forwardedUsername
    });

    // TEST 4 — Thiếu/sai token vẫn bị chặn 401 trước khi chạm identity policy.
    const noToken = await gateway({
      method: 'GET', endpoint: '/api/API_HangHoaList_AI?q=' + encodeURIComponent('{}')
    }, '', 'req-diag001-no-token');
    assert(noToken.status === 401, 'Thiếu token phải bị chặn 401.');
    results.push('MISSING_TOKEN_BLOCKED');

    const badToken = await gateway({
      method: 'GET', endpoint: '/api/API_HangHoaList_AI?q=' + encodeURIComponent('{}')
    }, 'invalid-token-' + Date.now(), 'req-diag001-bad-token');
    assert(badToken.status === 401, 'Token không xác minh được phải bị chặn 401.');
    results.push('INVALID_TOKEN_BLOCKED');

    console.log('PRODUCT-DIAG-001 gateway identity — TẤT CẢ PASS:', results.length + '/' + results.length);
    results.forEach((r) => console.log('  ✅', r));

    const reportDir = path.join(ROOT, 'reports', 'uat');
    fs.mkdirSync(reportDir, { recursive: true });
    fs.writeFileSync(
      path.join(reportDir, 'PRODUCT-DIAG-001_GATEWAY_IDENTITY_LIVE_EVIDENCE.json'),
      JSON.stringify({
        task: 'PRODUCT-DIAG-001',
        scope: 'live gateway HTTP proof — /api/API_HangHoaList_AI Username identity override',
        endpoint: '/api/API_HangHoaList_AI',
        policySource: 'src/server/order-status-guard.js READ_IDENTITY_POLICY',
        generatedAt: new Date().toISOString(),
        results,
        evidence
      }, null, 2) + '\n'
    );
    console.log('📄 Đã lưu reports/uat/PRODUCT-DIAG-001_GATEWAY_IDENTITY_LIVE_EVIDENCE.json');
  } catch (error) {
    console.error('\n❌ FAIL:', error.message);
    console.error('--- server.js log (tail) ---');
    console.error(serverLog.slice(-4000));
    process.exitCode = 1;
  } finally {
    child.kill();
    await pool.close();
  }
}

main();
