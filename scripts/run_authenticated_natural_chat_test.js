'use strict';

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const ACCOUNT_FIXTURES = JSON.parse(fs.readFileSync(
  path.join(ROOT, 'config', 'uat', 'account-fixtures.v1.json'),
  'utf8',
)).accounts;

function readEnvFile(filePath) {
  if (!fs.existsSync(filePath)) return {};
  const result = {};
  for (const line of fs.readFileSync(filePath, 'utf8').split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const separator = trimmed.indexOf('=');
    if (separator < 1) continue;
    const key = trimmed.slice(0, separator).trim();
    let value = trimmed.slice(separator + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    result[key] = value;
  }
  return result;
}

function parseArgs(argv) {
  const options = { command: 'smoke', role: 'manager', forward: [] };
  for (let index = 0; index < argv.length; index += 1) {
    const part = argv[index];
    if (!part.startsWith('--') && index === 0) {
      options.command = part;
      continue;
    }
    const match = part.match(/^--(role|user|env-file)(?:=(.*))?$/);
    if (!match) {
      options.forward.push(part);
      continue;
    }
    const value = match[2] !== undefined ? match[2] : argv[++index];
    const key = match[1].replace(/-([a-z])/g, (_, letter) => letter.toUpperCase());
    options[key] = value;
  }
  return options;
}

function cipherEncrypt(value, key = 107) {
  const base64 = Buffer.from(String(value), 'utf8').toString('base64');
  let xor = '';
  for (let index = 0; index < base64.length; index += 1) xor += String.fromCharCode(base64.charCodeAt(index) ^ key);
  return Buffer.from(xor, 'utf8').toString('base64');
}

function cipherDecrypt(value, key = 107) {
  const xor = Buffer.from(String(value), 'base64').toString('utf8');
  let base64 = '';
  for (let index = 0; index < xor.length; index += 1) base64 += String.fromCharCode(xor.charCodeAt(index) ^ key);
  return Buffer.from(base64, 'base64').toString('utf8');
}

function findAccessToken(value) {
  if (!value || typeof value !== 'object') return '';
  for (const key of ['access_token', 'accessToken', 'AccessToken', 'token']) {
    if (typeof value[key] === 'string' && value[key].trim()) return value[key].trim();
  }
  for (const child of Object.values(value)) {
    const token = findAccessToken(child);
    if (token) return token;
  }
  return '';
}

async function login(gatewayUrl, username, password) {
  const request = {
    method: 'POST',
    endpoint: '/api/login',
    body: { username, password },
  };
  const response = await fetch(gatewayUrl, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ data: cipherEncrypt(JSON.stringify(request)) }),
    signal: AbortSignal.timeout(15000),
  });
  const outer = await response.json();
  const body = outer && typeof outer.data === 'string' ? JSON.parse(cipherDecrypt(outer.data)) : outer;
  const token = findAccessToken(body);
  if (!response.ok || !token) throw new Error(`Login failed for ${username} (HTTP ${response.status}).`);
  return token;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const envPath = path.resolve(ROOT, args.envFile || '.env.uat.local');
  const fileEnv = readEnvFile(envPath);
  const role = String(args.role || 'manager').toLowerCase();
  const userListKeyByRole = {
    admin: 'UAT_ADMIN_USERS',
    manager: 'UAT_MANAGER_USERS',
    tdv: 'UAT_TDV_USERS',
    sale: 'UAT_TDV_USERS',
  };
  const userListKey = userListKeyByRole[role];
  if (!userListKey) throw new Error(`Unsupported test role: ${role}.`);
  const username = args.user || process.env.MEDSTAND_TEST_LOGIN_USER
    || String(fileEnv[userListKey] || '').split(',').map((value) => value.trim()).filter(Boolean)[0];
  const password = process.env.UAT_TEST_PASSWORD || fileEnv.UAT_TEST_PASSWORD;
  if (!username || !password) {
    throw new Error(`Missing ${userListKey} or UAT_TEST_PASSWORD in ${path.basename(envPath)}. Refusing to substitute another role.`);
  }

  const gatewayUrl = process.env.MEDSTAND_GATEWAY_URL || 'http://localhost:3000/api/gateway';
  const token = await login(gatewayUrl, username, password);
  const fixtureKey = Object.keys(ACCOUNT_FIXTURES).find((key) => key.toLowerCase() === username.toLowerCase());
  const fixture = fixtureKey ? ACCOUNT_FIXTURES[fixtureKey] : null;
  const hasCustomerOverride = args.forward.some((value) => /^--customer(?:=|$)/.test(value));
  const fixtureArgs = fixture && !hasCustomerOverride ? [`--customer=${fixture.customerId}`] : [];
  console.log(JSON.stringify({
    loginSuccess: true,
    account: username,
    role,
    fixtureCustomer: fixture?.customerId || null,
    fixtureRegion: fixture?.region || null,
    tokenPresent: true,
  }));

  const child = spawnSync(process.execPath, [
    path.join('scripts', 'test_natural_chat_system.js'),
    args.command,
    '--transport=gateway',
    `--endpoint=${gatewayUrl}`,
    ...fixtureArgs,
    ...args.forward,
  ], {
    cwd: ROOT,
    env: { ...process.env, MEDSTAND_AUTH_TOKEN: token },
    stdio: 'inherit',
  });
  process.exitCode = child.status === null ? 1 : child.status;
}

main().catch((error) => {
  console.error(JSON.stringify({ status: 'AUTHENTICATED_TEST_ERROR', message: error.message }));
  process.exitCode = 1;
});
