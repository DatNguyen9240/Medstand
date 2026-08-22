'use strict';

// Read-only gateway probe. It prints the edit-context response shape, never credentials/tokens.
const http = require('http');
const fs = require('fs');
const path = require('path');

const BASE_PORT = Number(process.env.ORDER_UI_PORT || 3103);
const USERNAME = process.env.ORDER_UI_SALE_USER || 'NAMDINHB.MED';
const PASSWORD = process.env.ORDER_UI_SALE_PASSWORD || process.env.ORDER_UI_PASSWORD || process.env.APP_PASSWORD || '';
const DOCUMENT_ID = process.argv[2] || process.env.ORDER_UI_EXISTING_SUBMIT_ORDER;

function encrypt(value, key = 107) {
  const base64 = Buffer.from(value, 'utf8').toString('base64');
  let xor = '';
  for (let index = 0; index < base64.length; index += 1) xor += String.fromCharCode(base64.charCodeAt(index) ^ key);
  return Buffer.from(xor, 'utf8').toString('base64');
}

function decrypt(value, key = 107) {
  const xor = Buffer.from(value, 'base64').toString('utf8');
  let base64 = '';
  for (let index = 0; index < xor.length; index += 1) base64 += String.fromCharCode(xor.charCodeAt(index) ^ key);
  return Buffer.from(base64, 'base64').toString('utf8');
}

function gateway(payload, token, requestId) {
  const body = JSON.stringify({ data: encrypt(JSON.stringify(payload)) });
  return new Promise((resolve, reject) => {
    const request = http.request({
      hostname: '127.0.0.1', port: BASE_PORT, path: '/api/gateway', method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(body),
        'x-request-id': requestId,
        ...(token ? { Authorization: `Bearer ${token}` } : {})
      }
    }, response => {
      let raw = '';
      response.on('data', chunk => { raw += chunk; });
      response.on('end', () => {
        try {
          const envelope = JSON.parse(raw);
          resolve({ status: response.statusCode, body: envelope.data ? JSON.parse(decrypt(envelope.data)) : envelope });
        } catch (error) {
          reject(new Error(`Cannot decode gateway response: ${error.message}`));
        }
      });
    });
    request.on('error', reject);
    request.end(body);
  });
}

async function main() {
  if (!DOCUMENT_ID) throw new Error('Provide DocumentID.');
  if (!PASSWORD) throw new Error('Supply the UAT password through an environment variable.');
  const login = await gateway({ method: 'POST', endpoint: '/api/login', body: { username: USERNAME, password: PASSWORD } }, '', 'req-ui-edit-probe-login');
  const token = login.body && (login.body.access_token || login.body.Token);
  if (!token) throw new Error(`UAT login failed with HTTP ${login.status}.`);
  const endpoint = '/api/API_DonHang_EditContext_AI?q=' + encodeURIComponent(JSON.stringify({ DocumentID: DOCUMENT_ID }));
  const context = await gateway({ method: 'GET', endpoint }, token, 'req-ui-edit-probe-context');
  const unread = await gateway(
    { method: 'GET', endpoint: '/api/API_ThongBao_UnreadCount_AI' },
    token,
    'req-ui-edit-probe-unread-count'
  );
  const evidence = {
    requestId: 'req-ui-edit-probe-context',
    httpStatus: context.status,
    documentId: DOCUMENT_ID,
    username: USERNAME,
    response: context.body,
    pageBackgroundUnreadCount: {
      requestId: 'req-ui-edit-probe-unread-count',
      httpStatus: unread.status,
      response: unread.body
    }
  };
  const reportDir = path.resolve(__dirname, '..', 'reports', 'uat', 'ORDER-APPROVAL-005-006');
  fs.mkdirSync(reportDir, { recursive: true });
  fs.writeFileSync(path.join(reportDir, 'EDIT_CONTEXT_GATEWAY_PROBE.json'), JSON.stringify(evidence, null, 2));
  console.log(JSON.stringify(evidence, null, 2));
}

main().catch(error => {
  console.error(JSON.stringify({ status: 'FAIL', error: error.message }, null, 2));
  process.exitCode = 1;
});
