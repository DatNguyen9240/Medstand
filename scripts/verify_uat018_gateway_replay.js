'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const sql = require('mssql');
const promotion = require('../src/js/utils/promotion.js');

const ROOT = path.resolve(__dirname, '..');
const GATEWAY = process.env.MEDSTAND_GATEWAY_URL || 'http://127.0.0.1:3000/api/gateway';

function readEnv(relativePath) {
  const values = {};
  const filePath = path.join(ROOT, relativePath);
  if (!fs.existsSync(filePath)) return values;
  for (const line of fs.readFileSync(filePath, 'utf8').split(/\r?\n/)) {
    const match = line.match(/^\s*([^#=]+)=(.*)$/);
    if (match) values[match[1].trim()] = match[2].trim().replace(/^['"]|['"]$/g, '');
  }
  return values;
}

function encrypt(value, key = 107) {
  const base64 = Buffer.from(String(value), 'utf8').toString('base64');
  let xor = '';
  for (const character of base64) xor += String.fromCharCode(character.charCodeAt(0) ^ key);
  return Buffer.from(xor, 'utf8').toString('base64');
}

function decrypt(value, key = 107) {
  const xor = Buffer.from(String(value), 'base64').toString('utf8');
  let base64 = '';
  for (const character of xor) base64 += String.fromCharCode(character.charCodeAt(0) ^ key);
  return Buffer.from(base64, 'base64').toString('utf8');
}

function findToken(value) {
  if (!value || typeof value !== 'object') return '';
  for (const key of ['access_token', 'accessToken', 'AccessToken', 'token']) {
    if (typeof value[key] === 'string' && value[key].trim()) return value[key].trim();
  }
  for (const child of Object.values(value)) {
    const token = findToken(child);
    if (token) return token;
  }
  return '';
}

function firstRecord(payload) {
  if (Array.isArray(payload)) return payload[0] || null;
  if (payload && Array.isArray(payload.records)) return payload.records[0] || null;
  if (payload && Array.isArray(payload.data)) return payload.data[0] || null;
  return payload || null;
}

async function gatewayCall(endpoint, body, token = '', idempotencyKey = '') {
  const response = await fetch(GATEWAY, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      ...(token ? { authorization: `Bearer ${token}` } : {}),
      ...(idempotencyKey ? { 'Idempotency-Key': idempotencyKey } : {}),
    },
    body: JSON.stringify({ data: encrypt(JSON.stringify({ method: 'POST', endpoint, body })) }),
    signal: AbortSignal.timeout(120000),
  });
  let payload = JSON.parse(await response.text());
  if (payload && typeof payload.data === 'string') payload = JSON.parse(decrypt(payload.data));
  return { httpStatus: response.status, payload, record: firstRecord(payload) };
}

async function login(username, password) {
  const response = await gatewayCall('/api/login', { username, password });
  const token = findToken(response.payload);
  if (response.httpStatus !== 200 || !token) throw new Error(`Login failed for ${username}.`);
  return token;
}

async function findCandidate(pool, username) {
  const user = (await pool.request()
    .input('Username', sql.VarChar(50), username)
    .query(`SELECT TOP (1) UserName, BranchID FROM dbo.SY_User
            WHERE UserName=@Username AND COALESCE(Disable,0)=0;`)).recordset[0];
  if (!user || !user.BranchID) throw new Error('UAT actor is inactive or has no BranchID.');

  const customers = (await pool.request()
    .input('Username', sql.VarChar(50), username)
    .query(`SELECT TOP (10) F.ObjectID, O.XaPhuong
            FROM dbo.AR_GetObjectByUserFnc(@Username) F
            JOIN dbo.CF_ObjectTbl O ON O.ObjectID=F.ObjectID
            WHERE COALESCE(O.Phone,'')<>'' ORDER BY F.ObjectID;`)).recordset;

  for (const customer of customers) {
    const productResult = await pool.request()
      .input('Username', sql.VarChar(50), username)
      .input('ObjectID', sql.VarChar(50), customer.ObjectID)
      .input('ItemID', sql.VarChar(50), '')
      .input('SearchText', sql.NVarChar(50), '')
      .input('SeachText', sql.NVarChar(50), '')
      .input('DocumentDate', sql.DateTime, new Date())
      .execute('dbo.API_HangHoaList_AI');
    for (const item of productResult.recordset || []) {
      if (!(Number(item.UnitPrice) > 0) || !item.StoreHouseID) continue;
      const rule = promotion.parse(item.GhiChu || '');
      const tier = rule.buyTiers.slice().sort((left, right) => left.minimumQuantity - right.minimumQuantity)[0];
      const quantity = tier ? tier.minimumQuantity : 1;
      const promo = promotion.calculate(rule, quantity);
      if (Number(item.QuantityinStock) < quantity + promo.giftQuantity) continue;
      return { user, customer, item, quantity, promo };
    }
  }
  throw new Error('No safe order candidate with price and sellable stock was found.');
}

async function verifyEvidence(pool, documentId, requestIds) {
  const request = pool.request();
  request.input('DocumentID', sql.VarChar(50), documentId);
  request.input('RequestA', sql.VarChar(100), requestIds[0]);
  request.input('RequestB', sql.VarChar(100), requestIds[1]);
  const result = await request.query(`
IF DB_NAME() <> N'medtest' THROW 51418, N'UAT-018 chỉ được chạy trên medtest.', 1;
SELECT
  (SELECT COUNT_BIG(*) FROM dbo.AR_OrderTbl WITH (NOLOCK) WHERE DocumentID=@DocumentID) AS HeaderCount,
  (SELECT COUNT_BIG(*) FROM dbo.AR_OrderDetailTbl WITH (NOLOCK) WHERE DocumentID=@DocumentID) AS DetailCount,
  (SELECT CAST(COALESCE(BaseTotal,0) AS DECIMAL(18,2)) FROM dbo.AR_OrderTbl WITH (NOLOCK) WHERE DocumentID=@DocumentID) AS HeaderTotal,
  (SELECT CAST(COALESCE(SUM(TotalAmount),0) AS DECIMAL(18,2)) FROM dbo.AR_OrderDetailTbl WITH (NOLOCK) WHERE DocumentID=@DocumentID) AS DetailTotal;
SELECT LogTime,ActionType,TargetID,
       JSON_VALUE(ExtraInfo,'$.requestId') AS RequestID,
       JSON_VALUE(ExtraInfo,'$.outcome') AS Outcome,
       JSON_VALUE(ExtraInfo,'$.capability') AS Capability
FROM dbo.AI_AuditLog WITH (NOLOCK)
WHERE TargetID=@DocumentID
  AND JSON_VALUE(ExtraInfo,'$.requestId') IN (@RequestA,@RequestB)
ORDER BY LogTime;`);
  return { order: result.recordsets[0][0], audit: result.recordsets[1] };
}

async function main() {
  const env = { ...readEnv('.env'), ...readEnv('.env.uat.local'), ...process.env };
  if (!env.UAT_TEST_PASSWORD) throw new Error('Missing UAT_TEST_PASSWORD.');
  const username = process.env.UAT018_USERNAME || 'QLBH013.MED';
  const token = await login(username, env.UAT_TEST_PASSWORD);
  const pool = await sql.connect({
    server: env.TEST_DB_SERVER,
    port: Number(env.TEST_DB_PORT || 1433),
    database: env.TEST_DB_DATABASE,
    user: env.TEST_DB_USER,
    password: env.TEST_DB_PASSWORD,
    options: { encrypt: false, trustServerCertificate: true },
    connectionTimeout: 15000,
    requestTimeout: 120000,
    pool: { max: 2, min: 0, idleTimeoutMillis: 10000 },
  });

  try {
    const candidate = await findCandidate(pool, username);
    const suffix = crypto.randomUUID();
    const idempotencyKey = `uat018-order-${suffix}`;
    const itemList = JSON.stringify([{
      ItemID: candidate.item.ItemID,
      Quantity: candidate.quantity,
      SoLuongTang: candidate.promo.giftQuantity,
      UnitPrice: Number(candidate.item.UnitPrice),
      DiscountPercent: candidate.promo.discountPercent,
    }]);
    const payload = {
      Username: 'IGNORED_BY_GATEWAY',
      DocumentID: 'AUTO_GEN',
      DocumentDate: new Date().toISOString().slice(0, 10),
      BranchID: candidate.user.BranchID,
      ObjectID: candidate.customer.ObjectID,
      Memo: `UAT018 gateway replay ${suffix.slice(0, 8)}`,
      Notes: 'UAT-018 controlled gateway replay test',
      XaPhuong: candidate.customer.XaPhuong || '',
      ThuDiTuyen: '',
      ItemList: itemList,
    };

    const firstResponse = await gatewayCall('/api/API_DonHangChiTiet_Insert_AI', payload, token, idempotencyKey);
    const secondResponse = firstResponse.httpStatus === 200
      ? await gatewayCall('/api/API_DonHangChiTiet_Insert_AI', payload, token, idempotencyKey)
      : null;
    const responses = [firstResponse, secondResponse].filter(Boolean);
    const records = responses.map((response) => response.record || {});
    const documentIds = records.map((record) => String(record.DocumentID || '').trim()).filter(Boolean);
    if (responses.length !== 2 || responses.some((response) => response.httpStatus !== 200)) {
      throw new Error(`Unexpected HTTP statuses: ${responses.map((response) => response.httpStatus).join(',')}`);
    }
    if (documentIds.length !== 2 || documentIds[0] !== documentIds[1]) throw new Error(`Concurrent responses did not return one DocumentID: ${JSON.stringify(records)}`);
    if (records.some((record) => Number(record.MsgType) !== 5)) throw new Error(`Concurrent response failed: ${JSON.stringify(records)}`);

    const requestIds = records.map((record) => String(record.RequestID || '').trim());
    const evidence = await verifyEvidence(pool, documentIds[0], requestIds);
    const actionTypes = new Set(evidence.audit.map((event) => event.ActionType));
    const pass = Number(evidence.order.HeaderCount) === 1
      && Number(evidence.order.DetailCount) > 0
      && Number(evidence.order.HeaderTotal) === Number(evidence.order.DetailTotal)
      && actionTypes.has('CREATE_DONHANG')
      && actionTypes.has('REPLAY_DONHANG');

    console.log(JSON.stringify({
      Task: 'UAT-018',
      Status: pass ? 'PASS' : 'FAIL',
      MutationExecuted: true,
      Username: username,
      DocumentID: documentIds[0],
      IdempotencyKey: idempotencyKey,
      Responses: responses.map((response) => ({ HttpStatus: response.httpStatus, Record: response.record })),
      Evidence: evidence,
      RetryReplayProven: pass,
      ConcurrencyProven: false,
    }, null, 2));
    if (!pass) process.exitCode = 2;
  } finally {
    await pool.close();
  }
}

main().catch((error) => {
  console.error(JSON.stringify({ Task: 'UAT-018', Status: 'ERROR', MutationExecuted: false, Error: error.message }, null, 2));
  process.exitCode = 1;
});
