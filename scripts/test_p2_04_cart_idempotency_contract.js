const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = path.resolve(__dirname, '..');
const http = fs.readFileSync(path.join(root, 'src', 'js', 'services', 'http.js'), 'utf8');
const order = fs.readFileSync(path.join(root, 'src', 'js', 'pages', 'create-order.js'), 'utf8');
const server = fs.readFileSync(path.join(root, 'server.js'), 'utf8');

assert(http.includes('const _inflightMutations = new Map()'));
assert(http.includes("_inflightMutations.has(idempotencyKey)"));
assert(http.includes("'Idempotency-Key': idempotencyKey"));
assert(server.includes("req.headers['idempotency-key']"));
assert(server.includes("'Idempotency-Key': req.headers['idempotency-key']"));
assert(order.includes("newIdempotencyKey('order-create')"));
assert(order.includes("newIdempotencyKey('order-draft')"));
assert(order.includes('{ idempotencyKey: submitKey }'));
assert(order.includes('{ idempotencyKey: draftKey }'));

function memoryStorage() {
  const values = new Map();
  return {
    get length() { return values.size; },
    key(index) { return [...values.keys()][index] || null; },
    getItem(key) { return values.has(key) ? values.get(key) : null; },
    setItem(key, value) { values.set(key, String(value)); },
    removeItem(key) { values.delete(key); },
  };
}

function encrypt(value, key = 107) {
  const base64 = Buffer.from(value, 'utf8').toString('base64');
  let xor = '';
  for (let index = 0; index < base64.length; index++) xor += String.fromCharCode(base64.charCodeAt(index) ^ key);
  return Buffer.from(xor, 'binary').toString('base64');
}

async function main() {
  const calls = [];
  const context = vm.createContext({
    API_CONFIG: { BASE_URL: 'https://backend.test', GATEWAY_URL: '/api/gateway' },
    AbortController,
    Alert: undefined,
    Buffer,
    FormData,
    Map,
    Response,
    URLSearchParams,
    atob: (value) => Buffer.from(value, 'base64').toString('binary'),
    btoa: (value) => Buffer.from(value, 'binary').toString('base64'),
    clearTimeout,
    console: { log() {}, warn() {}, error() {} },
    decodeURIComponent,
    document: { cookie: '' },
    encodeURIComponent,
    escape,
    fetch: async (url, options) => {
      calls.push({ url, options });
      await new Promise((resolve) => setTimeout(resolve, 20));
      return new Response(JSON.stringify({ data: encrypt(JSON.stringify({ code: 0, records: [] })) }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    },
    hideGlobalSpinner() {},
    localStorage: memoryStorage(),
    sessionStorage: memoryStorage(),
    setTimeout,
    showGlobalSpinner() {},
    unescape,
    window: { location: {}, __isLoggingOut: false },
  });

  vm.runInContext(http, context);
  const client = vm.runInContext('Http', context);
  const key = 'order-create-p2-04-double-click';
  const first = client.post('/api/API_DonHang_Insert', { DocumentID: 'AUTO_GEN' }, { idempotencyKey: key });
  const second = client.post('/api/API_DonHang_Insert', { DocumentID: 'AUTO_GEN' }, { idempotencyKey: key });

  assert.strictEqual(first, second, 'Concurrent submit must reuse the same promise.');
  await Promise.all([first, second]);
  assert.strictEqual(calls.length, 1, 'Double-click must issue exactly one network request.');
  assert.strictEqual(calls[0].url, '/api/gateway');
  assert.strictEqual(calls[0].options.headers['Idempotency-Key'], key);

  console.log('P2-04 CART idempotency runtime: PASS (2 submits, 1 fetch, header forwarded)');
}

main().catch((error) => {
  console.error(error.stack || error.message);
  process.exitCode = 1;
});
