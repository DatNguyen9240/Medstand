const fs = require('fs');
const path = require('path');
const assert = require('assert');

const definitions = [
  ['API_Execute.json', 'Check Method Execute'],
  ['API_ListActive.json', 'Check Method ListActive'],
  ['API_GetConfig.json', 'Check Method GetConfig']
];
const root = path.resolve(__dirname, '..', 'n8n', 'API_Services');
const runN8n = fs.readFileSync(path.resolve(__dirname, '..', 'n8n-system', 'run_n8n.js'), 'utf8');
const startN8n = fs.readFileSync(path.resolve(__dirname, '..', 'n8n-system', 'start_n8n.bat'), 'utf8');
for (const source of [runN8n, startN8n]) {
  assert(!/N8N_CORS_ALLOWED_ORIGINS\s*=\s*["']?\*/.test(source));
  assert(source.includes('http://localhost:3000,http://127.0.0.1:3000,https://medtest.bms79.com'));
  assert(source.includes('POST,OPTIONS'));
  assert(source.includes('Content-Type,Authorization,x-api-key'));
}

for (const [file, checkName] of definitions) {
  const workflow = JSON.parse(fs.readFileSync(path.join(root, file), 'utf8'));
  const check = workflow.nodes.find((node) => node.name === checkName);
  assert(check, `Missing ${checkName}`);
  const webhooks = workflow.nodes.filter((node) => node.type === 'n8n-nodes-base.webhook');
  assert(webhooks.length >= 1, `${file} is missing a webhook`);
  for (const webhook of webhooks) {
    assert.strictEqual(
      webhook.parameters.options?.allowedOrigins,
      'http://localhost:3000,http://127.0.0.1:3000,https://medtest.bms79.com'
    );
  }
  const code = check.parameters.jsCode;
  for (const origin of [
    'http://localhost:3000', 'http://127.0.0.1:3000', 'https://medtest.bms79.com'
  ]) assert(code.includes(origin), `${file} does not allow ${origin}`);
  assert(code.includes("'https://cors.invalid'"));
  const runCheck = (origin) => new Function('$json', '$execution', code)({
    headers: origin ? { origin } : {},
    body: {},
    method: 'POST'
  }, { id: 'cors-contract' })[0].json;
  assert.strictEqual(runCheck('http://localhost:3000')._corsOrigin, 'http://localhost:3000');
  assert.strictEqual(runCheck('https://evil.example')._corsOrigin, 'https://cors.invalid');
  assert.strictEqual(runCheck('')._corsOrigin, 'https://cors.invalid');

  const responses = workflow.nodes.filter((node) => node.type === 'n8n-nodes-base.respondToWebhook');
  assert(responses.length >= 3, `${file} response coverage is incomplete`);
  for (const response of responses) {
    const headers = response.parameters.options?.responseHeaders?.entries || [];
    const byName = Object.fromEntries(headers.map((header) => [header.name.toLowerCase(), header.value]));
    assert.strictEqual(byName['access-control-allow-origin'], `={{ $('${checkName}').first().json._corsOrigin }}`);
    assert.strictEqual(byName['access-control-allow-methods'], 'POST, OPTIONS');
    assert.strictEqual(byName['access-control-allow-headers'], 'Content-Type, Authorization, x-api-key');
    assert.strictEqual(byName.vary, 'Origin');
    assert.notStrictEqual(byName['access-control-allow-origin'], '*');
  }

  const authErrors = responses.filter((node) => /Auth Error|Authorization Error/.test(node.name));
  assert(authErrors.length >= 1, `${file} is missing an auth error response`);
  for (const response of authErrors) {
    assert.strictEqual(response.parameters.respondWith, 'json');
    assert(response.parameters.responseBody.includes('requestId'));
  }
}

console.log('CORS baseline and authentication error contract tests passed.');
