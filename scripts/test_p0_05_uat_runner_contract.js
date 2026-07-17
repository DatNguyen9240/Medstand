'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const example = fs.readFileSync(path.join(root, '.env.uat.example'), 'utf8');
const runner = fs.readFileSync(path.join(root, 'scripts', 'run_p0_05_uat.ps1'), 'utf8');
const liveRunner = fs.readFileSync(path.join(root, 'scripts', 'test_chatbot_api_auth_regression.js'), 'utf8');
const capture = fs.readFileSync(path.join(root, 'scripts', 'capture_uat_identity_token.ps1'), 'utf8');
const gitignore = fs.readFileSync(path.join(root, '.gitignore'), 'utf8');
const values = {};

for (const line of example.split(/\r?\n/)) {
  const match = line.match(/^([A-Z0-9_]+)=(.*)$/);
  if (match) values[match[1]] = match[2];
}

for (const name of ['EXECUTE', 'LIST', 'CONFIG']) {
  const value = values[`UAT_API_${name}_URL`];
  assert(value, `Missing UAT_API_${name}_URL.`);
  const url = new URL(value);
  assert(['localhost', '127.0.0.1'].includes(url.hostname), `${name} URL must stay local.`);
  assert(url.pathname.startsWith('/webhook/uat-p005-'), `${name} URL must use dedicated P0-05 path.`);
}
for (const tokenName of ['UAT_MANAGER_TOKEN', 'UAT_TDV_TOKEN', 'UAT_UNMAPPED_TOKEN', 'UAT_NO_SCOPE_TOKEN']) {
  assert(Object.prototype.hasOwnProperty.call(values, tokenName), `Missing ${tokenName} placeholder.`);
}
assert(runner.includes('/webhook/uat-p005-'), 'Runner must allow only dedicated published UAT paths.');
assert(runner.includes('/webhook-test/uat-p005-'), 'Runner must allow dedicated test UAT paths.');
assert(runner.includes('$isLocal -and $isDedicatedUatWebhook'), 'Runner must combine local-host and path guards.');
assert(runner.includes('[switch]$FullNegativeIdentityGate'), 'Runner must make live negative identities explicitly opt-in.');
assert(runner.includes('--role-only'), 'Default UAT must use the approved Manager/TDV role-only mode.');
assert(liveRunner.includes("['localhost', '127.0.0.1'].includes(url.hostname)"), 'Node runner must also enforce localhost.');
assert(liveRunner.includes("url.pathname.startsWith('/webhook/uat-p005-')"), 'Node runner must enforce dedicated P0-05 paths.');
assert(liveRunner.includes('/^Bearer\\s+/i.test(token)'), 'Node runner must normalize Bearer tokens.');
assert(liveRunner.includes("process.argv.includes('--role-only')"), 'Node runner must support role-only UAT.');
assert(liveRunner.includes("'chatbot-api-auth-regression-contract'"), 'Contract-only runs must not overwrite live UAT evidence.');
assert(capture.includes('$Identity -eq "no-scope" -and $capabilities.Count -ne 0'), 'Capture must reject a no-scope identity that has capabilities.');
assert(capture.includes('$Identity -in @("manager", "tdv") -and $capabilities.Count -eq 0'), 'Capture must reject mapped identities without capabilities.');
assert(gitignore.split(/\r?\n/).includes('.env.uat.local'), 'Local token file must remain ignored by Git.');

console.log('P0-05 UAT runner contract checks passed.');
