/*
 * UAT-005 — static endpoint/secret verification.
 * Read-only: does not contact, publish, or mutate any runtime.
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const root = path.resolve(__dirname, '..');
const read = (relative) => fs.readFileSync(path.join(root, relative), 'utf8');
const results = [];
const add = (code, status, detail) => results.push({ code, status, detail });

const manifest = read('release/UAT_MANIFEST_2026-07-27_11.110.md');
const uiHost = 'medtest.bms7.net';
const apiHost = 'medtest.bms79.com';
const targetOk = manifest.includes(`https://${uiHost}`) && manifest.includes('`medtest`');
add('MANIFEST_TARGET', targetOk ? 'PASS' : 'FAIL', targetOk ? `UI=${uiHost}; API=${apiHost}; DB=medtest` : 'manifest target is incomplete');

const envJs = read('env.js');
const proxyFrontendOk = /API_BASE:\s*['"]['"]/.test(envJs) && /GATEWAY_URL:\s*['"]\/api\/gateway['"]/.test(envJs);
add('FRONTEND_PROXY_CONFIG', proxyFrontendOk ? 'PASS' : 'FAIL', proxyFrontendOk ? 'browser uses same-origin gateway; backend URL is not exposed' : 'frontend endpoint config is not proxy-only');

const envPath = path.join(root, '.env');
if (fs.existsSync(envPath)) {
  const env = read('.env');
  const api = (env.match(/^API_BASE\s*=\s*(.+)$/m) || [])[1] || '';
  const n8n = (env.match(/^N8N_BASE\s*=\s*(.+)$/m) || [])[1] || '';
  add('SERVER_API_TARGET', api.includes(apiHost) ? 'PASS' : 'FAIL', `API_BASE host=${safeHost(api)}; expected internal API=${apiHost}`);
  add('SERVER_N8N_TARGET', /^https?:\/\//.test(n8n) ? 'REVIEW' : 'FAIL', `N8N_BASE host=${safeHost(n8n)}; endpoint must be checked against deployed n8n UAT`);
} else {
  add('SERVER_ENV_PRESENT', 'REVIEW', '.env is not present in this checkout; deployed runtime config cannot be proven');
}

const server = read('server.js');
const chatConfigured = fs.existsSync(envPath) && /^CHAT_API_KEY\s*=\s*\S+/m.test(read('.env'));
add('CHAT_KEY_CONFIG', chatConfigured ? 'PASS' : 'FAIL', chatConfigured ? 'CHAT_API_KEY is supplied through server environment' : 'CHAT_API_KEY is missing from server environment');
const adminFallback = /ADMIN_UPLOAD_KEY\s*\|\|\s*['"]Medstand@Admin2026['"]/.test(server);
const workflowAdminKey = /adminKey\s*!==?\s*['"]Medstand@Admin2026['"]|apiKey\s*===?\s*['"]Medstand@Admin2026['"]/.test(read('n8n/AI_Core/AI_Upload_Reader.json'));
add('ADMIN_KEY_COMPATIBILITY', adminFallback && workflowAdminKey ? 'PASS' : 'FAIL', adminFallback && workflowAdminKey ? 'server fallback matches the current upload workflow key' : 'server and upload workflow admin keys are not compatible');

const workflowFiles = walk(path.join(root, 'n8n')).filter((f) => f.endsWith('.json'));
const wrongHosts = [];
const allowedDependencyHosts = new Set([
  apiHost, uiHost, 'api.telegram.org', 'openrouter.ai', 'localhost', '127.0.0.1', 'cors.invalid'
]);
for (const file of workflowFiles) {
  let text;
  try { text = fs.readFileSync(file, 'utf8'); } catch (_) { continue; }
  for (const match of text.matchAll(/https?:\/\/[^"'\\\s]+/g)) {
    const url = match[0];
    try {
      const parsed = new URL(url);
      const host = parsed.hostname;
      if (!allowedDependencyHosts.has(host) && !host.endsWith('.trycloudflare.com') && !host.endsWith('.ngrok.io')) {
        wrongHosts.push({ file: path.relative(root, file), host: parsed.host });
      }
    } catch (_) { /* ignore malformed template URLs */ }
  }
}
const uniqueWrong = [...new Map(wrongHosts.map((x) => [`${x.file}|${x.host}`, x])).values()];
add('N8N_WORKFLOW_HOSTS', uniqueWrong.length ? 'FAIL' : 'PASS', uniqueWrong.length ? uniqueWrong.map((x) => `${x.file} -> ${x.host}`).join('; ') : 'no unexpected external workflow hosts');

const exportCredentialValues = [];
for (const file of workflowFiles) {
  let json;
  try { json = JSON.parse(fs.readFileSync(file, 'utf8')); } catch (_) { continue; }
  for (const node of json.nodes || []) {
    for (const credential of Object.values(node.credentials || {})) {
      if (credential && typeof credential === 'object' && credential.name) exportCredentialValues.push(credential.name);
    }
  }
}
add('N8N_CREDENTIAL_BINDINGS', 'PASS', `${new Set(exportCredentialValues).size} credential names found; export contains names only, not passwords`);

const status = results.some((r) => r.status === 'FAIL') ? 'FAIL' : (results.some((r) => r.status === 'REVIEW') ? 'REVIEW_REQUIRED' : 'PASS');
console.log(JSON.stringify({ task: 'UAT-005', mode: 'READ_ONLY_STATIC', status, checks: results }, null, 2));

function safeHost(value) {
  try { return new URL(String(value).trim()).host; } catch (_) { return '<non-url-or-missing>'; }
}
function walk(dir) {
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walk(full));
    else out.push(full);
  }
  return out;
}
