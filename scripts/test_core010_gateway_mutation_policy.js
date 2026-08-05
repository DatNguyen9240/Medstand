'use strict';

const assert = require('assert');
const http = require('http');
const path = require('path');
const { spawn } = require('child_process');

const ROOT = path.resolve(__dirname, '..');

function cipherEncrypt(value, key = 107) {
  const base64 = Buffer.from(value, 'utf8').toString('base64');
  let xor = '';
  for (let index = 0; index < base64.length; index += 1) xor += String.fromCharCode(base64.charCodeAt(index) ^ key);
  return Buffer.from(xor, 'utf8').toString('base64');
}

function cipherDecrypt(value, key = 107) {
  const xor = Buffer.from(value, 'base64').toString('utf8');
  let base64 = '';
  for (let index = 0; index < xor.length; index += 1) base64 += String.fromCharCode(xor.charCodeAt(index) ^ key);
  return Buffer.from(base64, 'base64').toString('utf8');
}

async function freePort() {
  return new Promise((resolve, reject) => {
    const server = http.createServer();
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const port = server.address().port;
      server.close(() => resolve(port));
    });
  });
}

async function readJson(req) {
  let raw = '';
  for await (const chunk of req) raw += chunk;
  return raw ? JSON.parse(raw) : {};
}

async function gatewayCall(port, endpoint, token, idempotencyKey, body) {
  const encrypted = cipherEncrypt(JSON.stringify({ method: 'POST', endpoint, body }));
  const response = await fetch(`http://127.0.0.1:${port}/api/gateway`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
      ...(idempotencyKey ? { 'Idempotency-Key': idempotencyKey } : {}),
    },
    body: JSON.stringify({ data: encrypted }),
  });
  const envelope = await response.json();
  const decoded = envelope.data ? JSON.parse(cipherDecrypt(envelope.data)) : envelope;
  return { status: response.status, body: decoded };
}

async function waitForServer(port) {
  const deadline = Date.now() + 10000;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(`http://127.0.0.1:${port}/healthz`);
      if (response.ok) return;
    } catch (_) { /* server is still starting */ }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error('Gateway test server did not start.');
}

async function main() {
  const backendPort = await freePort();
  const gatewayPort = await freePort();
  const mutationCalls = [];
  const backend = http.createServer(async (req, res) => {
    const authorization = String(req.headers.authorization || '');
    if (req.url === '/api/API_UserInfo') {
      if (authorization.includes('expired-token')) {
        res.writeHead(401, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ code: 2, msg: 'expired' }));
        return;
      }
      let record = { UserName: 'READONLY.USER', Disable: 0, capabilities: ['api.read'] };
      if (authorization.includes('order-token')) record = { UserName: 'VERIFIED.ORDER', Disable: 0, capabilities: ['orders.write'] };
      if (authorization.includes('customer-token')) record = { UserName: 'VERIFIED.CUSTOMER', Disable: 0, capabilities: '["customers.write"]' };
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ records: [record] }));
      return;
    }

    if (req.url === '/api/API_DonHangChiTiet_Insert_AI' || req.url === '/api/API_KhachHang_Insert_AI') {
      const body = await readJson(req);
      mutationCalls.push({ url: req.url, body });
      res.writeHead(200, { 'Content-Type': 'application/json' });
      if (req.url.includes('DonHang')) {
        res.end(JSON.stringify([{ MsgType: 1, Code: 'IDEMPOTENCY_CONFLICT', RequestID: body.RequestID }]));
      } else {
        res.end(JSON.stringify([{ MsgType: 5, Code: 'CREATED', ObjectID: 'C001', RequestID: body.RequestID }]));
      }
      return;
    }

    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ code: 'NOT_FOUND' }));
  });
  await new Promise((resolve) => backend.listen(backendPort, '127.0.0.1', resolve));

  const gateway = spawn(process.execPath, ['server.js'], {
    cwd: ROOT,
    env: {
      ...process.env,
      PORT: String(gatewayPort),
      API_BASE: `http://127.0.0.1:${backendPort}`,
      N8N_INTERNAL_URL: `http://127.0.0.1:${backendPort}`,
    },
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true,
  });
  let gatewayLogs = '';
  gateway.stdout.on('data', (chunk) => { gatewayLogs += chunk.toString(); });
  gateway.stderr.on('data', (chunk) => { gatewayLogs += chunk.toString(); });

  try {
    await waitForServer(gatewayPort);

    const deniedOrder = await gatewayCall(
      gatewayPort, '/api/API_DonHangChiTiet_Insert_AI', 'read-only-token', 'core010-order-denied', { Username: 'SPOOFED' }
    );
    assert.strictEqual(deniedOrder.status, 403);
    assert.strictEqual(deniedOrder.body.code, 'CAPABILITY_REQUIRED');
    assert.strictEqual(mutationCalls.length, 0);

    const deniedCustomer = await gatewayCall(
      gatewayPort, '/api/API_KhachHang_Insert_AI', 'read-only-token', 'core010-customer-denied', { User: 'SPOOFED' }
    );
    assert.strictEqual(deniedCustomer.status, 403);
    assert.strictEqual(deniedCustomer.body.code, 'CAPABILITY_REQUIRED');
    assert.strictEqual(mutationCalls.length, 0);

    const expired = await gatewayCall(
      gatewayPort, '/api/API_KhachHang_Insert_AI', 'expired-token', 'core010-customer-expired', { User: 'SPOOFED' }
    );
    assert.strictEqual(expired.status, 401);
    assert.strictEqual(expired.body.code, 'AUTH_IDENTITY_VERIFICATION_FAILED');
    assert.strictEqual(mutationCalls.length, 0);

    const orderConflict = await gatewayCall(
      gatewayPort, '/api/API_DonHangChiTiet_Insert_AI', 'order-token', 'core010-order-conflict', { Username: 'SPOOFED' }
    );
    assert.strictEqual(orderConflict.status, 409);
    assert.strictEqual(orderConflict.body[0].Code, 'IDEMPOTENCY_CONFLICT');
    assert.strictEqual(mutationCalls[0].body.Username, 'VERIFIED.ORDER');
    assert.strictEqual(mutationCalls[0].body.IdempotencyKey, 'core010-order-conflict');
    assert(/^req-/.test(mutationCalls[0].body.RequestID));

    const customerCreated = await gatewayCall(
      gatewayPort, '/api/API_KhachHang_Insert_AI', 'customer-token', 'core010-customer-created', { User: 'SPOOFED' }
    );
    assert.strictEqual(customerCreated.status, 200);
    assert.strictEqual(customerCreated.body[0].Code, 'CREATED');
    assert.strictEqual(mutationCalls[1].body.User, 'VERIFIED.CUSTOMER');
    assert.strictEqual(mutationCalls[1].body.IdempotencyKey, 'core010-customer-created');
    assert(/^req-/.test(mutationCalls[1].body.RequestID));

    console.log('CORE-010 gateway mutation policy: PASS 5/5');
    console.log('  ✓ orders.write negative guard prevents upstream mutation');
    console.log('  ✓ customers.write negative guard prevents upstream mutation');
    console.log('  ✓ expired identity prevents replay/upstream mutation');
    console.log('  ✓ verified order identity is overwritten and conflict maps to HTTP 409');
    console.log('  ✓ verified customer identity and mutation context are forwarded');
  } finally {
    gateway.kill();
    await new Promise((resolve) => backend.close(resolve));
    if (gateway.exitCode === null) await new Promise((resolve) => setTimeout(resolve, 100));
    if (gateway.exitCode === null) gateway.kill('SIGKILL');
  }
}

main().catch((error) => {
  console.error(JSON.stringify({ Status: 'FAIL', MutationExecuted: false, Error: error.message }, null, 2));
  process.exitCode = 1;
});
