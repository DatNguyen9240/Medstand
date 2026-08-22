'use strict';

/* PROMO-CFG-002 — live gateway regression for server-owned Promotion identity.
 * Starts an isolated local server, authenticates with UAT accounts, sends forged Username
 * values through the real encrypted /api/gateway protocol, and performs no DB mutation
 * (all write probes use Apply=0 and are expected to fail at the role gate). */

const fs = require('fs');
const path = require('path');
const http = require('http');
const { spawn } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const PORT = Number(process.env.PROMO_GATEWAY_TEST_PORT || 3421);

function readEnv(relativePath) {
  const values = {};
  const filePath = path.join(ROOT, relativePath);
  if (!fs.existsSync(filePath)) return values;
  for (const line of fs.readFileSync(filePath, 'utf8').replace(/^\uFEFF/, '').split(/\r?\n/)) {
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
          resolve({ status: response.statusCode, body: decoded });
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
    'req-promo-login-' + username
  );
  const token = response.body && (response.body.access_token || response.body.Token);
  if (!token) throw new Error(`Đăng nhập thất bại cho ${username}: HTTP ${response.status}`);
  return token;
}

function resultRow(response) {
  const body = response.body || {};
  const rows = Array.isArray(body) ? body : (body.records || []);
  if (rows[0]) return rows[0];
  return { Msg: body.msg, MsgType: body.code };
}

function isManagerBlocked(response) {
  const row = resultRow(response);
  return Number(row.MsgType) === 1 && /quản lý trở lên/i.test(String(row.Msg || ''));
}

async function main() {
  const env = { ...readEnv('.env'), ...readEnv('.env.uat.local'), ...process.env };
  const password = env.UAT_TEST_PASSWORD;
  const manager = String(env.UAT_MANAGER_USERS || '').split(',')[0].trim();
  const sale = String(env.UAT_TDV_USERS || '').split(',')[0].trim();
  if (!password || !manager || !sale) throw new Error('Thiếu UAT_TEST_PASSWORD/UAT_MANAGER_USERS/UAT_TDV_USERS.');

  const child = spawn(process.execPath, ['server.js'], {
    cwd: ROOT,
    env: { ...process.env, PORT: String(PORT) },
    stdio: ['ignore', 'pipe', 'pipe']
  });
  let serverLog = '';
  child.stdout.on('data', (data) => { serverLog += data.toString(); });
  child.stderr.on('data', (data) => { serverLog += data.toString(); });
  const results = [];

  try {
    await waitForServer(20000);
    const managerToken = await login(manager, password);
    const saleToken = await login(sale, password);

    const list = await gateway({
      method: 'GET',
      endpoint: '/api/API_PromotionProgram_List_AI?q=' + encodeURIComponent(JSON.stringify({
        Username: manager, username: manager, Status: '', SearchText: ''
      }))
    }, saleToken, 'req-promo-spoof-list');
    assert(isManagerBlocked(list), 'Sale giả manager qua List phải bị chặn theo identity thật.');
    results.push('LIST_FORGED_USERNAME_BLOCKED');

    const detail = await gateway({
      method: 'GET',
      endpoint: '/api/API_PromotionProgram_Detail_AI?q=' + encodeURIComponent(JSON.stringify({
        PromotionProgramID: 999999999, UserName: manager
      }))
    }, saleToken, 'req-promo-spoof-detail');
    assert(isManagerBlocked(detail), 'Sale giả manager qua Detail phải bị chặn theo identity thật.');
    results.push('DETAIL_FORGED_USERNAME_BLOCKED');

    const active = await gateway({
      method: 'GET',
      endpoint: '/api/API_PromotionActiveByItems_AI?q=' + encodeURIComponent(JSON.stringify({
        Username: 'ACCOUNT_DOES_NOT_EXIST', JsonItemIDs: '[]'
      }))
    }, saleToken, 'req-promo-spoof-active');
    const activeRow = resultRow(active);
    assert(!/tài khoản không hợp lệ/i.test(String(activeRow.Msg || '')),
      'ActiveByItems vẫn nhận Username giả thay vì identity từ token.');
    results.push('ACTIVE_ITEMS_FORGED_USERNAME_OVERRIDDEN');

    const upsert = await gateway({
      method: 'POST', endpoint: '/api/API_PromotionProgram_Upsert_AI', body: {
        PromotionProgramID: null,
        PromotionCode: 'IDENTITY_PREVIEW_' + Date.now(),
        PromotionName: 'Identity preview',
        ProgramType: 'EVENT',
        EffectiveFrom: new Date().toISOString(),
        EffectiveTo: new Date(Date.now() + 86400000).toISOString(),
        BranchScopeMode: 'ALL', JsonBranchIDs: '[]',
        UserGroupScopeMode: 'ALL', JsonUserGroupIDs: '[]',
        Priority: 100, SourceDocument: 'verify_promo_cfg002_gateway_identity.js',
        JsonRules: '[]', USERNAME: manager, Apply: 0
      }
    }, saleToken, 'req-promo-spoof-upsert');
    assert(isManagerBlocked(upsert), 'Sale giả manager qua Upsert phải bị chặn trước nhánh preview/ghi.');
    results.push('UPSERT_FORGED_USERNAME_BLOCKED');

    const approve = await gateway({
      method: 'POST', endpoint: '/api/API_PromotionProgram_Approve_AI', body: {
        PromotionProgramID: 999999999, Action: 'APPROVE', Username: manager, Apply: 0
      }
    }, saleToken, 'req-promo-spoof-approve');
    assert(isManagerBlocked(approve), 'Sale giả manager qua Approve phải bị chặn trước nhánh nghiệp vụ.');
    results.push('APPROVE_FORGED_USERNAME_BLOCKED');

    const managerList = await gateway({
      method: 'GET',
      endpoint: '/api/API_PromotionProgram_List_AI?q=' + encodeURIComponent(JSON.stringify({
        Username: sale, Status: '', SearchText: ''
      }))
    }, managerToken, 'req-promo-manager-spoofs-sale');
    assert(!isManagerBlocked(managerList), 'Manager thật không được bị hạ thành Sale bởi Username giả.');
    results.push('TOKEN_IDENTITY_WINS_BOTH_DIRECTIONS');

    const noToken = await gateway({
      method: 'GET', endpoint: '/api/API_PromotionProgram_List_AI?q=' + encodeURIComponent('{}')
    }, '', 'req-promo-no-token');
    assert(noToken.status === 401, 'Thiếu token phải bị chặn 401.');
    results.push('MISSING_TOKEN_BLOCKED');

    const badToken = await gateway({
      method: 'GET', endpoint: '/api/API_PromotionProgram_List_AI?q=' + encodeURIComponent('{}')
    }, 'invalid-token', 'req-promo-bad-token');
    assert(badToken.status === 401, 'Token không xác minh được phải bị chặn 401.');
    results.push('INVALID_TOKEN_BLOCKED');

    const shuffledPreview = await gateway({
      method: 'POST', endpoint: '/api/API_PromotionProgram_Upsert_AI', body: {
        Apply: 0,
        JsonRules: '[]',
        SourceDocument: 'verify_promo_cfg002_gateway_identity.js',
        Priority: 100,
        JsonUserGroupIDs: '[]',
        UserGroupScopeMode: 'ALL',
        JsonBranchIDs: '[]',
        BranchScopeMode: 'ALL',
        EffectiveTo: new Date(Date.now() + 86400000).toISOString(),
        EffectiveFrom: new Date().toISOString(),
        ProgramType: 'EVENT',
        PromotionName: 'Ordered allowlist preview',
        PromotionCode: 'ORDERED_PREVIEW_' + Date.now(),
        USERNAME: sale
      }
    }, managerToken, 'req-promo-shuffled-preview');
    const shuffledRow = resultRow(shuffledPreview);
    assert(shuffledRow && Number(shuffledRow.MsgType) === 0,
      'Payload Upsert đảo thứ tự phải được gateway dựng lại và tới nhánh preview hợp lệ.');
    results.push('SHUFFLED_UPSERT_REORDERED_TO_PROCEDURE_SIGNATURE');

    const approvePreview = await gateway({
      method: 'POST', endpoint: '/api/API_PromotionProgram_Approve_AI', body: {
        Reason: 'Kiểm tra thứ tự tham số', Apply: 0, Action: 'APPROVE',
        PromotionProgramID: 999999999, Username: sale
      }
    }, managerToken, 'req-promo-shuffled-approve-preview');
    const approveRow = resultRow(approvePreview);
    assert(approveRow && !/quản lý trở lên/i.test(String(approveRow.Msg || '')),
      'Payload Approve đảo thứ tự phải dùng identity quản lý thật và tới logic nghiệp vụ.');
    results.push('SHUFFLED_APPROVE_REORDERED_TO_PROCEDURE_SIGNATURE');

    const unknownField = await gateway({
      method: 'POST', endpoint: '/api/API_PromotionProgram_Approve_AI', body: {
        PromotionProgramID: 999999999, Action: 'APPROVE', Apply: 0, InjectedField: 'shift'
      }
    }, managerToken, 'req-promo-unknown-field');
    assert(unknownField.status === 400
      && unknownField.body && unknownField.body.code === 'INVALID_PROMOTION_MUTATION_PAYLOAD',
    'Field lạ có thể làm lệch positional binding phải bị gateway chặn 400.');
    results.push('UNKNOWN_MUTATION_FIELD_BLOCKED');

    const missingField = await gateway({
      method: 'POST', endpoint: '/api/API_PromotionProgram_Approve_AI', body: {
        PromotionProgramID: 999999999, Apply: 0
      }
    }, managerToken, 'req-promo-missing-field');
    assert(missingField.status === 400
      && missingField.body && missingField.body.code === 'INVALID_PROMOTION_MUTATION_PAYLOAD',
    'Thiếu field bắt buộc phải bị gateway chặn trước khi positional binding bị lệch.');
    results.push('MISSING_REQUIRED_MUTATION_FIELD_BLOCKED');

    for (const relativeFile of ['src/js/pages/promotion-admin.js', 'src/js/pages/create-order.js']) {
      const source = fs.readFileSync(path.join(ROOT, relativeFile), 'utf8');
      const promoCalls = source.match(/Http\.(?:get|post)\(API_CONFIG\.ENDPOINTS\.PROMOTION_ADMIN\.[\s\S]{0,700}?\n\s*\}\)?;/g) || [];
      assert(promoCalls.length > 0, 'Static verifier không tìm thấy Promotion API call trong ' + relativeFile + '.');
      assert(promoCalls.every((call) => !/\bUsername\s*:/i.test(call)),
        relativeFile + ' vẫn gửi Username trong lời gọi Promotion API.');
    }
    results.push('FRONTEND_PROMOTION_CALLS_DO_NOT_SEND_USERNAME');

    const httpSource = fs.readFileSync(path.join(ROOT, 'src/js/services/http.js'), 'utf8');
    const promotionAdminSource = fs.readFileSync(path.join(ROOT, 'src/js/pages/promotion-admin.js'), 'utf8');
    assert(httpSource.includes('return _handleResponse(res, options);'),
      'Http.post chưa chuyển options tới response handler.');
    assert((promotionAdminSource.match(/acceptApplicationError:\s*true/g) || []).length >= 2,
      'Upsert/Approve phải nhận response nghiệp vụ Msg/MsgType thay vì throw sớm theo envelope code.');
    results.push('PROMOTION_POST_HANDLES_APPLICATION_RESULT_ROWS');

    console.log(JSON.stringify({
      Task: 'VERIFY-PROMO-CFG-002-GATEWAY-IDENTITY',
      Status: 'PASS',
      Mutation: 'NONE (Apply=0 only)',
      Results: results
    }, null, 2));
  } catch (error) {
    throw new Error(error.message + (serverLog ? '\nServer log tail:\n' + serverLog.slice(-1500) : ''));
  } finally {
    child.kill();
  }
}

main().catch((error) => {
  console.error(JSON.stringify({
    Task: 'VERIFY-PROMO-CFG-002-GATEWAY-IDENTITY',
    Status: 'FAIL',
    Error: error.message
  }, null, 2));
  process.exitCode = 1;
});
