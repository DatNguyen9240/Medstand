'use strict';

const BASE_URL = 'http://127.0.0.1:3000';

function encrypt(value, key = 107) {
  const base64 = Buffer.from(value, 'utf8').toString('base64');
  let xor = '';
  for (let index = 0; index < base64.length; index += 1) {
    xor += String.fromCharCode(base64.charCodeAt(index) ^ key);
  }
  return Buffer.from(xor, 'utf8').toString('base64');
}

function decrypt(value, key = 107) {
  const xor = Buffer.from(value, 'base64').toString('utf8');
  let base64 = '';
  for (let index = 0; index < xor.length; index += 1) {
    base64 += String.fromCharCode(xor.charCodeAt(index) ^ key);
  }
  return Buffer.from(base64, 'base64').toString('utf8');
}

async function main() {
  const home = await fetch(`${BASE_URL}/`, { signal: AbortSignal.timeout(10000) });
  const html = await home.text();
  if (!home.ok || !html.includes("appVersion = '11.124'")) {
    throw new Error(`Frontend local chưa phục vụ bundle 11.124 (HTTP ${home.status}).`);
  }

  const payload = encrypt(JSON.stringify({
    method: 'POST',
    endpoint: '/api/API_DonHangChiTiet_Insert_AI',
    body: { DocumentID: 'AUTO_GEN' },
  }));
  const response = await fetch(`${BASE_URL}/api/gateway`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: 'Bearer smoke-invalid-token',
    },
    body: JSON.stringify({ data: payload }),
    signal: AbortSignal.timeout(10000),
  });
  const envelope = await response.json();
  const decoded = envelope && envelope.data ? JSON.parse(decrypt(envelope.data)) : null;
  if (response.status !== 422 || !decoded || decoded.code !== 'IDEMPOTENCY_KEY_REQUIRED') {
    throw new Error(`Gateway chưa nạp order guard mới: HTTP ${response.status}; body=${JSON.stringify(decoded)}`);
  }

  process.stdout.write(`${JSON.stringify({
    Status: 'PASS',
    BaseUrl: BASE_URL,
    FrontendVersion: '11.124',
    OrderGuard: decoded.code,
    MutationExecuted: false,
  }, null, 2)}\n`);
}

main().catch((error) => {
  console.error(JSON.stringify({ Status: 'FAIL', MutationExecuted: false, Error: error.message }, null, 2));
  process.exitCode = 1;
});
