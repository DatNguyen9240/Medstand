'use strict';

const assert = require('assert');
const http = require('http');
const path = require('path');
const { spawn } = require('child_process');

const ROOT = path.resolve(__dirname, '..');

function encrypt(value, key = 107) {
  const base64 = Buffer.from(value, 'utf8').toString('base64');
  let xor = '';
  for (const character of base64) xor += String.fromCharCode(character.charCodeAt(0) ^ key);
  return Buffer.from(xor, 'utf8').toString('base64');
}

function decrypt(value, key = 107) {
  const xor = Buffer.from(value, 'base64').toString('utf8');
  let base64 = '';
  for (const character of xor) base64 += String.fromCharCode(character.charCodeAt(0) ^ key);
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

async function gatewayCall(port) {
  const data = encrypt(JSON.stringify({
    method: 'POST',
    endpoint: '/webhook/admin-upload',
    body: { title: 'test' },
  }));
  const response = await fetch(`http://127.0.0.1:${port}/api/gateway`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer test-token' },
    body: JSON.stringify({ data }),
  });
  const envelope = await response.json();
  return {
    status: response.status,
    body: envelope.data ? JSON.parse(decrypt(envelope.data)) : envelope,
  };
}

async function runGateway(adminKey, backendPort, assertion) {
  const gatewayPort = await freePort();
  const env = {
    ...process.env,
    PORT: String(gatewayPort),
    API_BASE: `http://127.0.0.1:${backendPort}`,
    N8N_INTERNAL_URL: `http://127.0.0.1:${backendPort}`,
    MEDSTAND_SKIP_LOCAL_ENV: '1',
  };
  if (adminKey) env.ADMIN_UPLOAD_KEY = adminKey;
  else delete env.ADMIN_UPLOAD_KEY;

  const gateway = spawn(process.execPath, ['server.js'], {
    cwd: ROOT,
    env,
    stdio: ['ignore', 'ignore', 'ignore'],
    windowsHide: true,
  });
  try {
    await waitForServer(gatewayPort);
    await assertion(await gatewayCall(gatewayPort));
  } finally {
    gateway.kill();
  }
}

async function main() {
  const backendPort = await freePort();
  let receivedAdminKey = '';
  const backend = http.createServer((req, res) => {
    receivedAdminKey = String(req.headers['x-admin-key'] || '');
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ success: true }));
  });
  await new Promise((resolve) => backend.listen(backendPort, '127.0.0.1', resolve));

  try {
    await runGateway('', backendPort, async (result) => {
      assert.strictEqual(result.status, 503);
      assert.strictEqual(result.body.code, 'MISSING_ADMIN_UPLOAD_KEY');
    });
    await runGateway('test-admin-key-only', backendPort, async (result) => {
      assert.strictEqual(result.status, 200);
      assert.strictEqual(receivedAdminKey, 'test-admin-key-only');
    });
    console.log('UAT-005 admin key: PASS 2/2');
  } finally {
    await new Promise((resolve) => backend.close(resolve));
  }
}

main().catch((error) => {
  console.error(JSON.stringify({ Status: 'FAIL', Error: error.message }, null, 2));
  process.exitCode = 1;
});
