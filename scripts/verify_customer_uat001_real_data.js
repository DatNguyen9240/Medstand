'use strict';

/* CUSTOMER-UAT-001 — readiness bằng tài khoản có EmployeeID và khách do người dùng thật tạo.
 *
 * Script tạo một CTBH cấu hình có marker riêng qua live Gateway bằng tài khoản quản lý,
 * duyệt CTBH, thu ba manifest readiness (note-text / không CTBH / CTBH cấu hình), rồi
 * WITHDRAW và xóa đúng fixture trong finally. Raw manifest nằm dưới reports/uat và bị Git ignore.
 * Không tạo đơn và không ghi credential/token ra output.
 */

const assert = require('assert');
const fs = require('fs');
const http = require('http');
const path = require('path');
const { spawn, execFileSync } = require('child_process');
const sql = require('mssql');
const { getRequiredUatPassword } = require('./lib/uat-test-config');

const ROOT = path.resolve(__dirname, '..');
const PORT = Number(process.env.CUSTOMER_UAT001_PORT || (3500 + (process.pid % 1000)));
const RUN_TOKEN = new Date().toISOString().replace(/[-:.TZ]/g, '').slice(0, 14);
const MARKER = `CUSTOMER-UAT-001-${RUN_TOKEN}`;
const REPORT_DIR = path.join(ROOT, 'reports', 'uat', 'CUSTOMER-UAT-001', RUN_TOKEN);
const NOTE_ITEM = process.env.CUSTOMER_UAT001_NOTE_ITEM || 'A008';
const CONFIG_ITEM = process.env.CUSTOMER_UAT001_CONFIG_ITEM || 'B038';

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
        'x-request-id': requestId,
        ...(token ? { Authorization: `Bearer ${token}` } : {})
      }
    }, (response) => {
      let body = '';
      response.on('data', chunk => { body += chunk; });
      response.on('end', () => {
        try {
          const envelope = JSON.parse(body);
          const decoded = envelope.data ? JSON.parse(decrypt(envelope.data)) : envelope;
          resolve({ status: response.statusCode, requestId: response.headers['x-request-id'] || requestId, body: decoded });
        } catch (error) {
          reject(new Error(`Không giải mã được Gateway response HTTP ${response.statusCode}: ${error.message}`));
        }
      });
    });
    request.on('error', reject);
    request.end(raw);
  });
}

function firstRow(response) {
  const body = response && response.body || {};
  const rows = Array.isArray(body) ? body : (body.records || body.data || []);
  if (Array.isArray(rows) && rows[0]) return rows[0];
  return body;
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

async function login(username, password) {
  const response = await gateway(
    { method: 'POST', endpoint: '/api/login', body: { username, password } },
    '', `req-customer-uat001-login-${RUN_TOKEN}`
  );
  const token = response.body && (response.body.access_token || response.body.Token);
  assert.ok(token, `Đăng nhập UAT thất bại cho ${username}; HTTP ${response.status}.`);
  return token;
}

function chooseAccount(list, preferred) {
  const accounts = String(list || '').split(',').map(value => value.trim()).filter(Boolean);
  return accounts.find(value => value.toLowerCase() === preferred.toLowerCase()) || accounts[0] || '';
}

async function selectUatContext(pool, manager, sale) {
  const accounts = await pool.request()
    .input('Manager', sql.VarChar(50), manager)
    .input('Sale', sql.VarChar(50), sale)
    .query(`
      SELECT UserName, BranchID, EmployeeID, UserGroupID, Manager
      FROM dbo.SY_User
      WHERE UserName IN (@Manager, @Sale) AND COALESCE(Disable, 0)=0;
    `);
  assert.strictEqual(accounts.recordset.length, 2, 'Thiếu tài khoản Manager/Sale đang hoạt động.');
  for (const account of accounts.recordset) {
    assert.ok(String(account.BranchID || '').trim(), `${account.UserName} thiếu BranchID.`);
    assert.ok(String(account.EmployeeID || '').trim(), `${account.UserName} thiếu EmployeeID.`);
  }
  const managerRow = accounts.recordset.find(row => row.UserName.toLowerCase() === manager.toLowerCase());
  const saleRow = accounts.recordset.find(row => row.UserName.toLowerCase() === sale.toLowerCase());
  assert.strictEqual(managerRow.BranchID, saleRow.BranchID, 'Manager và Sale phải cùng chi nhánh.');

  const customer = await pool.request()
    .input('Manager', sql.VarChar(50), manager)
    .input('Sale', sql.VarChar(50), sale)
    .query(`
      SELECT TOP (1) O.ObjectID, O.UserCreate, O.DateCreate
      FROM dbo.CF_ObjectTbl O
      WHERE COALESCE(O.isCustomer, 0)=1
        AND COALESCE(O.isDisable, 0)=0
        AND COALESCE(O.Phone, '')<>''
        AND O.UserCreate=@Manager
        AND O.DateCreate >= '20260801'
        AND EXISTS (SELECT 1 FROM dbo.AR_GetObjectByUserFnc(@Manager) M WHERE M.ObjectID=O.ObjectID)
        AND EXISTS (SELECT 1 FROM dbo.AR_GetObjectByUserFnc(@Sale) S WHERE S.ObjectID=O.ObjectID)
      ORDER BY O.DateCreate DESC, O.ObjectID;
    `);
  assert.ok(customer.recordset[0], 'Không tìm thấy khách UAT mới do Manager thật tạo và cùng nằm trong scope Sale.');
  const outsideCustomer = await pool.request()
    .input('Sale', sql.VarChar(50), sale)
    .query(`
      SELECT TOP (1) O.ObjectID
      FROM dbo.CF_ObjectTbl O
      WHERE COALESCE(O.isCustomer, 0)=1
        AND COALESCE(O.isDisable, 0)=0
        AND NOT EXISTS (SELECT 1 FROM dbo.AR_GetObjectByUserFnc(@Sale) S WHERE S.ObjectID=O.ObjectID)
      ORDER BY O.ObjectID;
    `);
  assert.ok(outsideCustomer.recordset[0], 'Không tìm thấy khách ngoài scope để chạy ca âm.');
  return {
    branchId: saleRow.BranchID,
    customer: customer.recordset[0],
    outsideCustomerId: outsideCustomer.recordset[0].ObjectID
  };
}

function executeReadiness(args) {
  let lastError = null;
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    let stdout = '';
    try {
      stdout = execFileSync(process.execPath, [path.join(ROOT, 'scripts', 'uat_data_readiness.js')].concat(args), {
        cwd: ROOT, encoding: 'utf8', timeout: 180000, maxBuffer: 32 * 1024 * 1024
      });
    } catch (error) {
      lastError = error;
      if (error.stdout === undefined) {
        if (!/ECONNRESET|ETIMEOUT|socket hang up/i.test(String(error.message || '')) || attempt === 3) throw error;
        Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, attempt * 500);
        continue;
      }
      stdout = String(error.stdout || '');
    }
    let manifest;
    try { manifest = JSON.parse(stdout); } catch (error) {
      lastError = error;
      if (attempt === 3) throw error;
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, attempt * 500);
      continue;
    }
    if (manifest.Status === 'ERROR' && /ECONNRESET|ETIMEOUT|socket hang up/i.test(String(manifest.Error || ''))) {
      lastError = new Error(manifest.Error);
      if (attempt < 3) {
        Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, attempt * 500);
        continue;
      }
    }
    return manifest;
  }
  throw lastError || new Error('Readiness không trả kết quả sau 3 lần thử.');
}

function runReadiness({ sale, customer, item, createdBy, label }) {
  const manifest = executeReadiness([
    `--user=${sale}`, `--customer=${customer}`, `--item=${item}`,
    `--created-by=${createdBy}`, '--data-source=API', '--cleanup-plan=KEEP',
    `--out=${path.join(REPORT_DIR, `${label}.json`)}`
  ]);
  assert.strictEqual(manifest.Status, 'READINESS_PASS', `${label} không đạt READINESS_PASS: ${manifest.Status}`);
  assert.strictEqual(manifest.MissingTesterFields.length, 0, `${label} thiếu tester fields.`);
  return manifest;
}

function assertNegativeCase({ sale, customer, item, expectedCode, label }) {
  const manifest = executeReadiness([`--user=${sale}`, `--customer=${customer}`, `--item=${item}`]);
  assert.strictEqual(manifest.Status, 'READINESS_FAIL', `${label} phải trả READINESS_FAIL.`);
  assert.ok(manifest.BlockingCodes.includes(expectedCode),
    `${label} thiếu ${expectedCode}; nhận ${manifest.BlockingCodes.join(',')}.`);
  return expectedCode;
}

async function findProgramByMarker(pool) {
  const result = await pool.request()
    .input('Marker', sql.NVarChar(2000), MARKER)
    .query('SELECT PromotionProgramID, Status FROM dbo.AI_PromotionProgramTbl WHERE Description=@Marker;');
  assert.ok(result.recordset.length <= 1, 'Marker UAT trỏ tới nhiều CTBH; từ chối tiếp tục.');
  return result.recordset[0] || null;
}

async function programStatus(pool, programId) {
  const result = await pool.request()
    .input('PromotionProgramID', sql.BigInt, programId)
    .query('SELECT Status FROM dbo.AI_PromotionProgramTbl WHERE PromotionProgramID=@PromotionProgramID;');
  return result.recordset[0] && result.recordset[0].Status || null;
}

async function createAndApproveProgram(pool, token, branchId, serverLog) {
  const createPayload = {
    method: 'POST', endpoint: '/api/API_PromotionProgram_Upsert_AI', body: {
      PromotionProgramID: null,
      PromotionCode: `CUAT001_${RUN_TOKEN}`.slice(0, 50),
      PromotionName: 'CUSTOMER-UAT-001 temporary configured promotion',
      ProgramType: 'EVENT',
      Description: MARKER,
      EffectiveFrom: new Date(Date.now() - 60000).toISOString(),
      EffectiveTo: new Date(Date.now() + 3600000).toISOString(),
      BranchScopeMode: 'INCLUDE',
      JsonBranchIDs: JSON.stringify([branchId]),
      UserGroupScopeMode: 'ALL',
      JsonUserGroupIDs: '[]',
      Priority: 5000,
      SourceDocument: 'scripts/verify_customer_uat001_real_data.js',
      JsonRules: JSON.stringify([{
        RuleOrder: 1,
        ItemID: CONFIG_ITEM,
        RuleType: 'QUANTITY_GIFT',
        MinimumQuantity: 10,
        MaximumQuantity: 10,
        GiftItemID: CONFIG_ITEM,
        GiftQuantity: 1,
        BenefitDescription: 'UAT mua 10 tặng 1, vượt mức vẫn chỉ tặng 1'
      }]),
      Apply: 1
    }
  };
  let programId = '';
  let createRequestId = '';
  for (let attempt = 1; attempt <= 2 && !programId; attempt += 1) {
    createRequestId = `req-customer-uat001-create-${RUN_TOKEN}-${attempt}`;
    try {
      const create = await gateway(createPayload, token, createRequestId);
      const createRow = firstRow(create);
      assert.strictEqual(create.status, 200, `Upsert CTBH trả HTTP ${create.status}.`);
      assert.ok(createRow.PromotionProgramID && Number(createRow.MsgType) !== 1,
        `Không tạo được CTBH tạm: ${JSON.stringify(createRow)}`);
      programId = String(createRow.PromotionProgramID);
    } catch (error) {
      if (!/ECONNRESET|ETIMEOUT|socket hang up/i.test(String(error.message || ''))) throw error;
      const recovered = await findProgramByMarker(pool);
      if (recovered) programId = String(recovered.PromotionProgramID);
      else if (attempt === 2) throw error;
    }
  }
  assert.ok(programId, 'Không xác định được PromotionProgramID sau Upsert.');
  assert.ok(serverLog().includes(`requestId=${createRequestId};`), 'Request ID Upsert không có trong server log.');

  const approvePayload = {
    method: 'POST', endpoint: '/api/API_PromotionProgram_Approve_AI', body: {
      PromotionProgramID: programId,
      Action: 'APPROVE',
      Apply: 1,
      Reason: `${MARKER} readiness`
    }
  };
  let approved = false;
  let approveRequestId = '';
  for (let attempt = 1; attempt <= 2 && !approved; attempt += 1) {
    approveRequestId = `req-customer-uat001-approve-${RUN_TOKEN}-${attempt}`;
    try {
      const approve = await gateway(approvePayload, token, approveRequestId);
      const approveRow = firstRow(approve);
      assert.strictEqual(approve.status, 200, `Approve CTBH trả HTTP ${approve.status}.`);
      assert.ok(Number(approveRow.MsgType) !== 1, `Không duyệt được CTBH tạm: ${JSON.stringify(approveRow)}`);
      approved = true;
    } catch (error) {
      if (!/ECONNRESET|ETIMEOUT|socket hang up/i.test(String(error.message || ''))) throw error;
      const status = await programStatus(pool, programId);
      if (status === 'APPROVED') approved = true;
      else if (status !== 'DRAFT' || attempt === 2) throw error;
    }
  }
  assert.ok(approved, 'CTBH tạm chưa được duyệt.');
  assert.ok(serverLog().includes(`requestId=${approveRequestId};`), 'Request ID Approve không có trong server log.');
  return programId;
}

async function withdrawProgram(pool, token, programId, serverLog) {
  const payload = {
    method: 'POST', endpoint: '/api/API_PromotionProgram_Approve_AI', body: {
      PromotionProgramID: programId,
      Action: 'WITHDRAW',
      Apply: 1,
      Reason: `${MARKER} cleanup`
    }
  };
  let withdrawn = false;
  let requestId = '';
  for (let attempt = 1; attempt <= 2 && !withdrawn; attempt += 1) {
    requestId = `req-customer-uat001-withdraw-${RUN_TOKEN}-${attempt}`;
    try {
      const response = await gateway(payload, token, requestId);
      const row = firstRow(response);
      assert.strictEqual(response.status, 200, `WITHDRAW trả HTTP ${response.status}.`);
      assert.ok(Number(row.MsgType) !== 1, `Không thu hồi được CTBH tạm: ${JSON.stringify(row)}`);
      withdrawn = true;
    } catch (error) {
      if (!/ECONNRESET|ETIMEOUT|socket hang up/i.test(String(error.message || ''))) throw error;
      const status = await programStatus(pool, programId);
      if (status === 'WITHDRAWN') withdrawn = true;
      else if (status !== 'APPROVED' || attempt === 2) throw error;
    }
  }
  assert.ok(withdrawn, 'CTBH tạm chưa được WITHDRAW.');
  assert.ok(serverLog().includes(`requestId=${requestId};`), 'Request ID WITHDRAW không có trong server log.');
}

async function deleteMarkedProgram(pool, programId) {
  if (!programId) return;
  const transaction = new sql.Transaction(pool);
  await transaction.begin();
  try {
    const locked = await new sql.Request(transaction)
      .input('PromotionProgramID', sql.BigInt, programId)
      .input('Marker', sql.NVarChar(2000), MARKER)
      .query(`
        SELECT PromotionProgramID, Description
        FROM dbo.AI_PromotionProgramTbl WITH (UPDLOCK, HOLDLOCK)
        WHERE PromotionProgramID=@PromotionProgramID;
      `);
    if (!locked.recordset.length) {
      await transaction.commit();
      return;
    }
    assert.strictEqual(locked.recordset[0].Description, MARKER, 'Từ chối xóa CTBH không đúng marker UAT.');
    const deleted = await new sql.Request(transaction)
      .input('PromotionProgramID', sql.BigInt, programId)
      .query('DELETE dbo.AI_PromotionProgramTbl WHERE PromotionProgramID=@PromotionProgramID;');
    assert.strictEqual(deleted.rowsAffected[0], 1, 'Không xóa đúng một CTBH fixture sau khi WITHDRAW.');
    await transaction.commit();
  } catch (error) {
    await transaction.rollback();
    throw error;
  }
}

async function assertAudit(pool, programId, manager) {
  const result = await pool.request()
    .input('TargetID', sql.VarChar(100), programId)
    .query(`
      SELECT ActionType, Username
      FROM dbo.AI_AuditLog
      WHERE TargetEntity='API_PromotionProgram_Approve_AI'
        AND TargetID=@TargetID
        AND ActionType IN ('PROMOTION_APPROVE', 'PROMOTION_WITHDRAW');
    `);
  const actions = new Set(result.recordset.map(row => row.ActionType));
  assert.ok(actions.has('PROMOTION_APPROVE') && actions.has('PROMOTION_WITHDRAW'), 'Thiếu audit APPROVE/WITHDRAW.');
  assert.ok(result.recordset.every(row => row.Username.toLowerCase() === manager.toLowerCase()), 'Audit actor không khớp Manager token.');
}

async function main() {
  const env = { ...readEnv('.env'), ...readEnv('.env.uat.local'), ...process.env };
  assert.strictEqual(String(env.TEST_DB_DATABASE || '').toLowerCase(), 'medtest', 'Chỉ chạy trên medtest.');
  const residueOnly = process.argv.includes('--check-residue');
  const manager = chooseAccount(env.UAT_MANAGER_USERS, 'QLBH013.MED');
  const sale = chooseAccount(env.UAT_TDV_USERS, 'NAMDINHB.MED');
  assert.ok(manager && sale, 'Thiếu UAT_MANAGER_USERS hoặc UAT_TDV_USERS.');
  const password = residueOnly ? '' : getRequiredUatPassword(['CUSTOMER_UAT001_PASSWORD']);

  const pool = await sql.connect({
    server: env.TEST_DB_SERVER,
    port: Number(env.TEST_DB_PORT || 1433),
    database: env.TEST_DB_DATABASE,
    user: env.TEST_DB_USER,
    password: env.TEST_DB_PASSWORD,
    options: { encrypt: false, trustServerCertificate: true },
    connectionTimeout: 15000,
    requestTimeout: 120000,
    pool: { max: 2, min: 0, idleTimeoutMillis: 10000 }
  });
  if (residueOnly) {
    try {
      const residue = await pool.request()
        .input('MarkerPrefix', sql.NVarChar(2000), 'CUSTOMER-UAT-001-%')
        .query('SELECT COUNT(*) AS ResidueCount FROM dbo.AI_PromotionProgramTbl WHERE Description LIKE @MarkerPrefix;');
      const count = Number(residue.recordset[0].ResidueCount);
      console.log(JSON.stringify({ Task: 'CUSTOMER-UAT-001-RESIDUE-CHECK', Status: count === 0 ? 'PASS' : 'FAIL', ResidueCount: count }, null, 2));
      if (count !== 0) process.exitCode = 1;
    } finally {
      await pool.close();
    }
    return;
  }
  const server = spawn(process.execPath, ['server.js'], {
    cwd: ROOT,
    env: { ...process.env, PORT: String(PORT) },
    stdio: ['ignore', 'pipe', 'pipe']
  });
  let log = '';
  server.stdout.on('data', data => { log += data.toString(); });
  server.stderr.on('data', data => { log += data.toString(); });
  let token = '';
  let programId = '';
  let context;
  let cleanupError = null;
  let stage = 'INITIALIZE';
  fs.mkdirSync(REPORT_DIR, { recursive: true });

  try {
    stage = 'VERIFY_DATABASE';
    const dbName = (await pool.request().query('SELECT DB_NAME() AS DatabaseName;')).recordset[0].DatabaseName;
    assert.strictEqual(dbName, 'medtest', `Sai database: ${dbName}.`);
    stage = 'SELECT_UAT_CONTEXT';
    context = await selectUatContext(pool, manager, sale);
    stage = 'WAIT_FOR_GATEWAY';
    await waitForServer();
    stage = 'LOGIN_MANAGER';
    token = await login(manager, password);

    stage = 'READINESS_NOTE_TEXT';
    const note = runReadiness({
      sale, customer: context.customer.ObjectID, item: NOTE_ITEM,
      createdBy: context.customer.UserCreate, label: '01_NOTE_TEXT'
    });
    assert.strictEqual(note.Layers.find(layer => layer.Layer === 'PROMOTION').Code,
      'PROMOTION_NOTE_TEXT_ONLY', 'Sai nhánh CTBH note-text.');

    stage = 'READINESS_NO_PROMOTION';
    const none = runReadiness({
      sale, customer: context.customer.ObjectID, item: CONFIG_ITEM,
      createdBy: context.customer.UserCreate, label: '02_NO_PROMOTION'
    });
    assert.strictEqual(none.Layers.find(layer => layer.Layer === 'PROMOTION').Code,
      'NO_PROMOTION', 'Sản phẩm chuẩn bị cho CTBH cấu hình không còn ở nhánh NO_PROMOTION trước khi tạo fixture.');

    stage = 'CREATE_AND_APPROVE_PROMOTION';
    programId = await createAndApproveProgram(pool, token, context.branchId, () => log);
    stage = 'READINESS_CONFIGURED_PROMOTION';
    const configured = runReadiness({
      sale, customer: context.customer.ObjectID, item: CONFIG_ITEM,
      createdBy: context.customer.UserCreate, label: '03_CONFIGURED_PROMOTION'
    });
    assert.strictEqual(configured.Layers.find(layer => layer.Layer === 'PROMOTION').Code,
      'PROMOTION_CONFIG_AVAILABLE', 'CTBH đã duyệt không được readiness nhận diện.');

    stage = 'READINESS_NEGATIVE_CASES';
    const negativeCodes = [
      assertNegativeCase({
        sale, customer: context.customer.ObjectID, item: 'B043',
        expectedCode: 'PRICE_NOT_FOUND', label: 'MISSING_PRICE_AND_STOCK'
      }),
      assertNegativeCase({
        sale, customer: context.customer.ObjectID, item: 'A003',
        expectedCode: 'ITEM_GROUP_NOT_SELLABLE', label: 'ITEM_NOT_SELLABLE'
      }),
      assertNegativeCase({
        sale, customer: context.customer.ObjectID, item: 'ZZZ999',
        expectedCode: 'ITEM_NOT_FOUND', label: 'ITEM_NOT_FOUND'
      }),
      assertNegativeCase({
        sale, customer: context.outsideCustomerId, item: NOTE_ITEM,
        expectedCode: 'CUSTOMER_OUT_OF_SCOPE', label: 'CUSTOMER_OUT_OF_SCOPE'
      })
    ];

    stage = 'WITHDRAW_PROMOTION';
    await withdrawProgram(pool, token, programId, () => log);
    stage = 'VERIFY_PROMOTION_AUDIT';
    await assertAudit(pool, programId, manager);

    console.log(JSON.stringify({
      Task: 'CUSTOMER-UAT-001-REAL-DATA',
      Status: 'PASS',
      Account: { Manager: manager, Sale: sale, BranchID: context.branchId, EmployeeIDPresent: true },
      Customer: { CreatedBy: context.customer.UserCreate, CreatedAt: context.customer.DateCreate },
      PromotionBranches: ['PROMOTION_NOTE_TEXT_ONLY', 'NO_PROMOTION', 'PROMOTION_CONFIG_AVAILABLE'],
      NegativeCodesVerified: negativeCodes,
      GatewayRequestIdsMatchedServerLog: 3,
      AuditActorMatchedManagerToken: true,
      RawManifestDirectory: path.relative(ROOT, REPORT_DIR),
      TestPromotionCleanup: 'WITHDRAW_THEN_MARKER_GUARDED_DELETE'
    }, null, 2));
  } catch (error) {
    throw new Error(`${stage}: ${error.message}`);
  } finally {
    if (programId) {
      if (token) {
        try {
          const status = await pool.request()
            .input('PromotionProgramID', sql.BigInt, programId)
            .query('SELECT Status FROM dbo.AI_PromotionProgramTbl WHERE PromotionProgramID=@PromotionProgramID;');
          if (status.recordset[0] && status.recordset[0].Status === 'APPROVED') {
            await withdrawProgram(pool, token, programId, () => log);
          }
        } catch (error) {
          cleanupError = cleanupError || error;
        }
      }
      try { await deleteMarkedProgram(pool, programId); } catch (error) { cleanupError = cleanupError || error; }
    }
    await stopServer(server);
    await pool.close();
    if (cleanupError) throw cleanupError;
  }
}

main().catch(error => {
  console.error(JSON.stringify({
    Task: 'CUSTOMER-UAT-001-REAL-DATA',
    Status: 'FAIL',
    Error: error.message
  }, null, 2));
  process.exitCode = 1;
});
