'use strict';

/* CUSTOMER-SEC-002 — live HTTP identity/permission verifier.
 *
 * Read-only: starts the local Gateway against medtest, signs in with configured UAT
 * accounts, probes EditContext, and proves that client-supplied Username/BranchID
 * cannot elevate a Sale or cross-branch manager. No order or policy row is changed.
 */

const assert = require('assert');
const fs = require('fs');
const http = require('http');
const net = require('net');
const path = require('path');
const { spawn } = require('child_process');
const sql = require('mssql');
const { getRequiredUatPassword } = require('./lib/uat-test-config');

const ROOT = path.resolve(__dirname, '..');
let PORT = Number(process.env.CUSTOMER_SEC002_HTTP_PORT || 0);
const RUN_TOKEN = new Date().toISOString().replace(/[-:.TZ]/g, '').slice(0, 14);
const REPORT_DIR = path.join(ROOT, 'reports', 'uat', 'CUSTOMER-SEC-002', RUN_TOKEN);

function readEnv(fileName) {
  const values = {};
  const filePath = path.join(ROOT, fileName);
  if (!fs.existsSync(filePath)) return values;
  for (const line of fs.readFileSync(filePath, 'utf8').replace(/^\uFEFF/, '').split(/\r?\n/)) {
    const match = line.match(/^\s*([^#=]+)=(.*)$/);
    if (match) values[match[1].trim()] = match[2].trim().replace(/^['"]|['"]$/g, '');
  }
  return values;
}

function configuredAccounts(value) {
  return String(value || '').split(',').map(item => item.trim().toLowerCase()).filter(Boolean);
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
      hostname: '127.0.0.1', port: PORT, path: '/api/gateway', method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(raw),
        'X-Request-ID': requestId,
        ...(token === undefined ? {} : { Authorization: `Bearer ${token}` })
      }
    }, response => {
      let body = '';
      response.on('data', chunk => { body += chunk; });
      response.on('end', () => {
        try {
          const envelope = JSON.parse(body);
          const decoded = envelope.data ? JSON.parse(decrypt(envelope.data)) : envelope;
          resolve({
            status: response.statusCode,
            requestId: response.headers['x-request-id'] || '',
            body: decoded
          });
        } catch (error) {
          reject(new Error(`Không giải mã được Gateway response ${requestId} HTTP ${response.statusCode}: ${error.message}; body=${body.slice(0, 80)}`));
        }
      });
    });
    request.on('error', reject);
    request.end(raw);
  });
}

function findAvailablePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      server.close(error => error ? reject(error) : resolve(address.port));
    });
  });
}

function firstRow(response) {
  const body = response && response.body || {};
  if (Array.isArray(body)) return body[0] || {};
  if (Array.isArray(body.records)) return body.records[0] || {};
  if (Array.isArray(body.data)) return body.data[0] || {};
  return body;
}

function isAllowed(value) {
  return value === true || value === 1 || value === '1';
}

async function waitForServer(timeoutMs = 20000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      await new Promise((resolve, reject) => {
        const request = http.get({ hostname: '127.0.0.1', port: PORT, path: '/' }, response => {
          response.resume();
          resolve();
        });
        request.on('error', reject);
      });
      return;
    } catch (_) {
      await new Promise(resolve => setTimeout(resolve, 250));
    }
  }
  throw new Error(`Local Gateway không sẵn sàng trên port ${PORT}.`);
}

async function stopServer(child) {
  if (!child || child.exitCode !== null) return;
  const exited = new Promise(resolve => child.once('exit', resolve));
  child.kill();
  await Promise.race([exited, new Promise(resolve => setTimeout(resolve, 3000))]);
}

async function login(username, password, label) {
  const response = await gateway(
    { method: 'POST', endpoint: '/api/login', body: { username, password } },
    undefined,
    `req-sec002-http-${RUN_TOKEN}-login-${label}`
  );
  const token = response.body && (response.body.access_token || response.body.Token);
  assert.ok(token, `Đăng nhập UAT thất bại cho actor ${label}; HTTP ${response.status}.`);
  return token;
}

function contextEndpoint(documentId, spoofUser) {
  const q = encodeURIComponent(JSON.stringify({
    DocumentID: documentId,
    Username: spoofUser,
    username: spoofUser,
    BranchID: 'SPOOF_BRANCH'
  }));
  return `/api/API_DonHang_EditContext_AI?Username=${encodeURIComponent(spoofUser)}&username=${encodeURIComponent(spoofUser)}&q=${q}`;
}

async function selectContext(pool, env) {
  const managerUsers = configuredAccounts(env.UAT_MANAGER_USERS);
  const saleUsers = configuredAccounts(env.UAT_TDV_USERS);
  assert.ok(managerUsers.length >= 2, 'Cần ít nhất hai UAT manager trong UAT_MANAGER_USERS.');
  assert.ok(saleUsers.length >= 1, 'Thiếu UAT_TDV_USERS.');

  const rows = (await pool.request().query(`
    SELECT UserName, BranchID, EmployeeID, UserGroupID, COALESCE(Disable,0) AS Disable
    FROM dbo.SY_User
    WHERE COALESCE(Disable,0)=0 AND COALESCE(BranchID,'')<>'' AND COALESCE(EmployeeID,'')<>'';
  `)).recordset;
  const manager = rows.find(row => managerUsers.includes(String(row.UserName).toLowerCase())
    && ['QL', 'QLMN'].includes(String(row.UserGroupID).toUpperCase()));
  assert.ok(manager, 'Không tìm thấy UAT manager hợp lệ thuộc QL/QLMN.');
  const otherManager = rows.find(row => managerUsers.includes(String(row.UserName).toLowerCase())
    && ['QL', 'QLMN'].includes(String(row.UserGroupID).toUpperCase())
    && row.BranchID !== manager.BranchID);
  assert.ok(otherManager, 'Không tìm thấy UAT manager ở chi nhánh khác.');
  const sale = rows.find(row => saleUsers.includes(String(row.UserName).toLowerCase())
    && !['QL', 'QLMN'].includes(String(row.UserGroupID).toUpperCase()));
  assert.ok(sale, 'Không tìm thấy UAT Sale hợp lệ.');

  const order = (await pool.request()
    .input('BranchID', sql.VarChar(50), manager.BranchID)
    .input('Manager', sql.VarChar(50), manager.UserName)
    .query(`
      SELECT TOP (1) O.DocumentID, O.StatusID, O.BranchID, O.UserCreate
      FROM dbo.AR_OrderTbl O
      WHERE O.StatusID=0 AND O.BranchID=@BranchID
        AND UPPER(COALESCE(O.UserCreate,''))<>UPPER(@Manager)
        AND EXISTS (SELECT 1 FROM dbo.AR_OrderDetailTbl D WHERE D.DocumentID=O.DocumentID)
      ORDER BY O.DateCreate DESC, O.DocumentID;
    `)).recordset[0];
  assert.ok(order, 'Không có đơn Chờ duyệt cùng chi nhánh làm fixture read-only.');
  return { manager, otherManager, sale, order };
}

async function main() {
  const env = { ...readEnv('.env'), ...readEnv('.env.uat.local'), ...process.env };
  assert.strictEqual(String(env.TEST_DB_DATABASE || '').toLowerCase(), 'medtest', 'Chỉ chạy trên medtest.');
  const password = getRequiredUatPassword(['CUSTOMER_SEC002_PASSWORD']);
  if (!PORT) PORT = await findAvailablePort();
  const pool = await sql.connect({
    server: env.TEST_DB_SERVER,
    port: Number(env.TEST_DB_PORT || 1433),
    database: env.TEST_DB_DATABASE,
    user: env.TEST_DB_USER,
    password: env.TEST_DB_PASSWORD,
    options: { encrypt: false, trustServerCertificate: true },
    connectionTimeout: 15000,
    requestTimeout: 60000,
    pool: { max: 2, min: 0, idleTimeoutMillis: 10000 }
  });
  const server = spawn(process.execPath, ['server.js'], {
    cwd: ROOT,
    env: { ...process.env, PORT: String(PORT) },
    stdio: ['ignore', 'pipe', 'pipe']
  });
  let serverLog = '';
  server.stdout.on('data', data => { serverLog += data.toString(); });
  server.stderr.on('data', data => { serverLog += data.toString(); });
  const results = [];
  try {
    const context = await selectContext(pool, env);
    const before = { StatusID: Number(context.order.StatusID), BranchID: context.order.BranchID, UserCreate: context.order.UserCreate };
    await waitForServer();
    const [managerToken, otherManagerToken, saleToken] = await Promise.all([
      login(context.manager.UserName, password, 'manager'),
      login(context.otherManager.UserName, password, 'other-manager'),
      login(context.sale.UserName, password, 'sale')
    ]);

    const missingId = `req-sec002-http-${RUN_TOKEN}-missing-token`;
    const missing = await gateway({ method: 'GET', endpoint: contextEndpoint(context.order.DocumentID, context.manager.UserName) }, undefined, missingId);
    assert.strictEqual(missing.status, 401, `Thiếu token phải HTTP 401, thực tế ${missing.status}.`);
    results.push(['MISSING_TOKEN_FAILS_CLOSED', true]);

    const invalidId = `req-sec002-http-${RUN_TOKEN}-invalid-token`;
    const invalid = await gateway({ method: 'GET', endpoint: contextEndpoint(context.order.DocumentID, context.manager.UserName) }, 'invalid.token.value', invalidId);
    assert.strictEqual(invalid.status, 401, `Token hỏng phải HTTP 401, thực tế ${invalid.status}.`);
    results.push(['INVALID_TOKEN_FAILS_CLOSED', true]);

    const managerId = `req-sec002-http-${RUN_TOKEN}-manager`;
    const managerResponse = await gateway({ method: 'GET', endpoint: contextEndpoint(context.order.DocumentID, context.sale.UserName) }, managerToken, managerId);
    const managerRow = firstRow(managerResponse);
    assert.strictEqual(managerResponse.status, 200, `Manager context HTTP ${managerResponse.status}.`);
    assert.ok(isAllowed(managerRow.CanEdit), `Manager cùng chi nhánh phải CanEdit=1: ${JSON.stringify(managerRow)}.`);
    results.push(['MANAGER_TOKEN_OVERRIDES_SPOOFED_SALE_IDENTITY', true]);

    const saleId = `req-sec002-http-${RUN_TOKEN}-sale-spoof`;
    const saleResponse = await gateway({ method: 'GET', endpoint: contextEndpoint(context.order.DocumentID, context.manager.UserName) }, saleToken, saleId);
    const saleRow = firstRow(saleResponse);
    assert.strictEqual(saleResponse.status, 200, `Sale context HTTP ${saleResponse.status}.`);
    assert.ok(!isAllowed(saleRow.CanEdit), `Sale giả Username manager vẫn không được CanEdit: ${JSON.stringify(saleRow)}.`);
    results.push(['SALE_CANNOT_ESCALATE_WITH_QUERY_IDENTITY', true]);

    const otherId = `req-sec002-http-${RUN_TOKEN}-other-branch`;
    const otherResponse = await gateway({ method: 'GET', endpoint: contextEndpoint(context.order.DocumentID, context.manager.UserName) }, otherManagerToken, otherId);
    const otherRow = firstRow(otherResponse);
    assert.strictEqual(otherResponse.status, 200, `Other-manager context HTTP ${otherResponse.status}.`);
    assert.ok(!isAllowed(otherRow.CanEdit), `Manager khác chi nhánh giả identity vẫn không được CanEdit: ${JSON.stringify(otherRow)}.`);
    assert.strictEqual(String(otherRow.BlockCode || ''), 'ORDER_OUT_OF_BRANCH_SCOPE', 'Sai block code chi nhánh khác.');
    results.push(['OTHER_BRANCH_MANAGER_CANNOT_ESCALATE_WITH_QUERY_IDENTITY', true]);

    for (const [label, response, expected] of [
      ['missing-token', missing, missingId], ['invalid-token', invalid, invalidId],
      ['manager', managerResponse, managerId], ['sale', saleResponse, saleId], ['other-manager', otherResponse, otherId]
    ]) {
      assert.strictEqual(response.requestId, expected, `${label} không echo X-Request-ID.`);
    }
    results.push(['REQUEST_ID_ECHOED_ON_SUCCESS_AND_FAILURE', true]);

    const afterOrder = (await pool.request().input('DocumentID', sql.VarChar(50), context.order.DocumentID)
      .query('SELECT StatusID, BranchID, UserCreate FROM dbo.AR_OrderTbl WHERE DocumentID=@DocumentID;')).recordset[0];
    const after = { StatusID: Number(afterOrder.StatusID), BranchID: afterOrder.BranchID, UserCreate: afterOrder.UserCreate };
    assert.deepStrictEqual(after, before, 'Read-only HTTP verifier làm thay đổi đơn fixture.');
    results.push(['READ_ONLY_NO_ORDER_MUTATION', true]);

    // Response-header echo is the authoritative trace for requests rejected before proxy
    // logging. Independently ensure diagnostic logs never contain credentials or tokens.
    for (const secret of [password, managerToken, otherManagerToken, saleToken]) {
      assert.ok(!serverLog.includes(secret), 'Server log làm lộ credential hoặc bearer token.');
    }
    results.push(['SERVER_LOG_DOES_NOT_CONTAIN_CREDENTIALS', true]);

    const evidence = {
      Task: 'CUSTOMER-SEC-002-GATEWAY-E2E',
      Status: 'PASS',
      Summary: `${results.length} PASS / 0 FAIL`,
      Database: 'medtest',
      Fixture: { StatusID: before.StatusID, BranchMatched: true },
      ActorGroups: {
        Manager: context.manager.UserGroupID,
        OtherBranchManager: context.otherManager.UserGroupID,
        Sale: context.sale.UserGroupID
      },
      Results: results,
      RequestIds: [missingId, invalidId, managerId, saleId, otherId],
      Mutation: 'NONE'
    };
    fs.mkdirSync(REPORT_DIR, { recursive: true });
    fs.writeFileSync(path.join(REPORT_DIR, 'CUSTOMER-SEC-002_GATEWAY_E2E.json'), JSON.stringify(evidence, null, 2));
    console.log(JSON.stringify(evidence, null, 2));
  } finally {
    await stopServer(server);
    await pool.close();
  }
}

main().catch(error => {
  console.error(JSON.stringify({ Task: 'CUSTOMER-SEC-002-GATEWAY-E2E', Status: 'FAIL', Error: error.message }, null, 2));
  process.exitCode = 1;
});
