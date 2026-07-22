'use strict';

const assert = require('assert');
const fs = require('fs');
const http = require('http');
const path = require('path');
const { pathToFileURL } = require('url');
const { classifyNaturalMessage, getN8nRuntimeSource } = require('./natural_chat_classifier');
const { classifierCases, liveCases } = require('./natural_chat_test_catalog');

const ROOT = path.resolve(__dirname, '..');

function parseArgs(argv) {
  const args = { command: 'static' };
  for (let i = 0; i < argv.length; i += 1) {
    const part = argv[i];
    if (!part.startsWith('--') && i === 0) args.command = part;
    else if (part.startsWith('--')) {
      const [rawKey, inline] = part.slice(2).split('=', 2);
      const key = rawKey.replace(/-([a-z])/g, (_, letter) => letter.toUpperCase());
      if (inline !== undefined) args[key] = inline;
      else if (argv[i + 1] && !argv[i + 1].startsWith('--')) args[key] = argv[++i];
      else args[key] = true;
    }
  }
  return args;
}

function expectedAction(result, hasContext) {
  if (result.messageType === 'BUSINESS') {
    if (!result.intent || result.missingFields.length > 0) return 'ASK_FIELD';
    return 'EXECUTE';
  }
  if (result.messageType === 'FOLLOW_UP' && hasContext) return 'USE_CONTEXT';
  return 'NO_API';
}

function percentile(values, p) {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1)];
}

function extractApiCode(value) {
  const queue = [value];
  const visited = new Set();
  while (queue.length) {
    const current = queue.shift();
    if (!current || typeof current !== 'object' || visited.has(current)) continue;
    visited.add(current);
    for (const key of ['ApiCode', 'apiCode', 'intent']) {
      const candidate = current[key];
      if (typeof candidate === 'string' && candidate.startsWith('@')) return candidate.toLowerCase();
    }
    for (const key of ['metadata', 'meta', 'authorization', 'request', 'result']) {
      if (current[key] && typeof current[key] === 'object') queue.push(current[key]);
    }
    if (Array.isArray(current.data) && current.data.length) queue.push(current.data[0]);
  }
  return null;
}

function flattenText(value) {
  try { return JSON.stringify(value); } catch (_) { return String(value); }
}

function normalizeResponse(raw) {
  const value = Array.isArray(raw) && raw.length === 1 ? raw[0] : raw;
  const status = String(value?.status || value?.code || value?.errorCode || '').toUpperCase();
  const text = flattenText(value);
  return {
    value,
    status,
    text,
    apiCode: extractApiCode(value),
    auth001: /AUTH001/i.test(text),
    systemError: /SYSTEM_ERROR|HTTP_5\d\d|ECONN|TIMEOUT/i.test(text),
  };
}

function runStaticClassifier() {
  const failures = [];
  const byGroup = {};
  for (const test of classifierCases) {
    const result = classifyNaturalMessage(test.input, { hasContext: Boolean(test.hasContext) });
    const checks = [
      ['messageType', result.messageType, test.messageType],
      ['intent', result.intent, test.intent],
      ['action', expectedAction(result, Boolean(test.hasContext)), test.action],
    ];
    if (test.apiCode) checks.push(['apiCode', result.apiCode, test.apiCode]);
    if (test.missingField) checks.push(['missingField', result.missingFields.includes(test.missingField), true]);
    if (test.entity) {
      const expectedValue = test.entity[1] === null ? Boolean(result.entities[test.entity[0]]) : test.entity[1];
      const actualValue = test.entity[1] === null ? Boolean(result.entities[test.entity[0]]) : result.entities[test.entity[0]];
      checks.push([`entity.${test.entity[0]}`, actualValue, expectedValue]);
    }
    const mismatch = checks.filter(([, actual, expected]) => actual !== expected);
    byGroup[test.group] = byGroup[test.group] || { total: 0, passed: 0 };
    byGroup[test.group].total += 1;
    if (mismatch.length) {
      failures.push({ input: test.input, group: test.group, releaseGate: Boolean(test.releaseGate), mismatch, result });
    } else byGroup[test.group].passed += 1;
  }

  const runtimeSource = getN8nRuntimeSource();
  const workflowChecks = [];
  for (const relative of ['n8n/AI_Core/MAIN_ChatBot_V5.json', 'n8n/AI_Core/AI_Intent_Parser.json']) {
    const workflow = JSON.parse(fs.readFileSync(path.join(ROOT, relative), 'utf8'));
    const serialized = JSON.stringify(workflow);
    workflowChecks.push({
      file: relative,
      hasClassifierVersion: serialized.includes('NATURAL_CHAT_SCHEMA_VERSION'),
      hasDebtIntent: serialized.includes('CUSTOMER_DEBT_DETAIL'),
      hasDebtApi: serialized.includes('@cong_no_chi_tiet'),
      hasCurrentRuntimeSignature: runtimeSource.includes('classifyNaturalMessage'),
    });
  }

  const architectureWarnings = [];
  const main = JSON.parse(fs.readFileSync(path.join(ROOT, 'n8n/AI_Core/MAIN_ChatBot_V5.json'), 'utf8'));
  const confidence = main.nodes.find((node) => node.name === 'LIB ConfidenceDecision')?.parameters?.jsCode || '';
  if (confidence.includes('llmResult.meta?.permission')) {
    architectureWarnings.push('MAIN_ChatBot_V5 still performs a meta.permission authorization check before API_Execute.');
  }

  const summary = {
    suite: 'natural-chat-static',
    total: classifierCases.length,
    passed: classifierCases.length - failures.length,
    failed: failures.length,
    releaseGateFailures: failures.filter((item) => item.releaseGate).length,
    byGroup,
    workflowChecks,
    architectureWarnings,
    failures: failures.slice(0, 30),
  };
  return { ok: failures.length === 0, summary };
}

async function importNetworkModuleForTest(timeoutMs = 120, maxRetries = 2) {
  const sourcePath = path.join(ROOT, 'chatbot-widget/js/core/network.js');
  let source = fs.readFileSync(sourcePath, 'utf8');
  source = source
    .replace(/^import .*;\r?\n/gm, '')
    .replace('const MAX_RETRIES = 3;', `const MAX_RETRIES = ${maxRetries};`)
    .replace('const TIMEOUT_MS = 30000;', `const TIMEOUT_MS = ${timeoutMs};`)
    .replace(/export const /g, 'const ')
    .concat('\nexport { NetworkService, getHeaders };\n');

  global.window = { MS_CHAT_DEBUG: false };
  global.document = { cookie: '' };
  global.API_CONFIG = { CHAT_API_KEY: '' };
  global.emit = () => {};
  global.EVENTS = { NETWORK_REQUEST: 'request', NETWORK_SUCCESS: 'success', NETWORK_ERROR: 'error' };
  global.logger = { debug() {}, info() {}, warn() {}, error() {} };
  source = source.replace("import { emit, EVENTS } from './event-bus.js';", '').replace("import { logger } from '../utils/logger.js';", '');
  const dataUrl = `data:text/javascript;base64,${Buffer.from(source).toString('base64')}`;
  return import(dataUrl);
}

async function withMockServer(handler, callback) {
  const server = http.createServer(handler);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  try { return await callback(`http://127.0.0.1:${address.port}`); }
  finally { await new Promise((resolve) => server.close(resolve)); }
}

async function runResilience() {
  const results = [];

  let attempts = 0;
  await withMockServer((req, res) => {
    attempts += 1;
    if (attempts < 3) { res.writeHead(503); res.end('temporary'); return; }
    res.setHeader('content-type', 'application/json'); res.end(JSON.stringify({ status: 'SUCCESS' }));
  }, async (url) => {
    const { NetworkService } = await importNetworkModuleForTest(500, 2);
    global.API_CONFIG = { N8N_BASE: url, CHAT_WEBHOOK: '/', CHAT_API_KEY: '' };
    const data = await NetworkService.sendChat({ action: 'chat', text: 'retry', session_id: 'retry-1' }, true);
    results.push({ test: 'retry-5xx-then-success', pass: data.status === 'SUCCESS' && attempts === 3, attempts });
  });

  attempts = 0;
  await withMockServer((req, res) => { attempts += 1; res.writeHead(400); res.end('bad request'); }, async (url) => {
    const { NetworkService } = await importNetworkModuleForTest(500, 2);
    global.API_CONFIG = { N8N_BASE: url, CHAT_WEBHOOK: '/', CHAT_API_KEY: '' };
    let message = '';
    try { await NetworkService.sendChat({ action: 'chat', text: 'client-error', session_id: 'client-1' }, true); }
    catch (error) { message = error.message; }
    results.push({ test: 'do-not-retry-4xx', pass: attempts === 1 && /Client Error/.test(message), attempts, message });
  });

  await withMockServer((req, res) => { setTimeout(() => { res.end('{}'); }, 300); }, async (url) => {
    const { NetworkService } = await importNetworkModuleForTest(80, 0);
    global.API_CONFIG = { N8N_BASE: url, CHAT_WEBHOOK: '/', CHAT_API_KEY: '' };
    let message = '';
    try { await NetworkService.sendChat({ action: 'chat', text: 'timeout', session_id: 'timeout-1' }, true); }
    catch (error) { message = error.message; }
    results.push({ test: 'timeout-aborts-request', pass: /Time Out|Aborted/.test(message), message });
  });

  await withMockServer((req, res) => { res.end('not-json'); }, async (url) => {
    const { NetworkService } = await importNetworkModuleForTest(500, 0);
    global.API_CONFIG = { N8N_BASE: url, CHAT_WEBHOOK: '/', CHAT_API_KEY: '' };
    let message = '';
    try { await NetworkService.sendChat({ action: 'chat', text: 'json', session_id: 'json-1' }, true); }
    catch (error) { message = error.message; }
    results.push({ test: 'reject-invalid-json', pass: /Invalid JSON/.test(message), message });
  });

  await withMockServer((req, res) => { setTimeout(() => { res.end('{"status":"SUCCESS"}'); }, 80); }, async (url) => {
    const { NetworkService } = await importNetworkModuleForTest(500, 0);
    global.API_CONFIG = { N8N_BASE: url, CHAT_WEBHOOK: '/', CHAT_API_KEY: '' };
    const payload = { action: 'chat', text: 'same', session_id: 'dedupe-1' };
    const settled = await Promise.allSettled([
      NetworkService.sendChat(payload, true), NetworkService.sendChat(payload, true),
    ]);
    results.push({
      test: 'deduplicate-in-flight-request',
      pass: settled.filter((item) => item.status === 'fulfilled').length === 1
        && settled.filter((item) => item.status === 'rejected' && item.reason?.message === 'RequestSpam').length === 1,
    });
  });

  return {
    ok: results.every((item) => item.pass),
    summary: { suite: 'network-resilience', total: results.length, passed: results.filter((item) => item.pass).length, results },
  };
}

function substitute(text, args) {
  return text
    .replaceAll('{{CUSTOMER_ID}}', args.customer || process.env.MEDSTAND_TEST_CUSTOMER || 'AG0031')
    .replaceAll('{{PRODUCT_ID}}', args.product || process.env.MEDSTAND_TEST_PRODUCT || 'A003')
    .replaceAll('{{DOCUMENT_ID}}', args.document || process.env.MEDSTAND_TEST_DOCUMENT || 'U13S1_MB13_4');
}

function isLocalEndpoint(endpoint) {
  try { return ['localhost', '127.0.0.1', '::1'].includes(new URL(endpoint).hostname); }
  catch (_) { return false; }
}

function cipherEncrypt(value, key = 107) {
  const base64 = Buffer.from(String(value), 'utf8').toString('base64');
  let xor = '';
  for (let index = 0; index < base64.length; index += 1) {
    xor += String.fromCharCode(base64.charCodeAt(index) ^ key);
  }
  return Buffer.from(xor, 'utf8').toString('base64');
}

function cipherDecrypt(value, key = 107) {
  const xor = Buffer.from(String(value), 'base64').toString('utf8');
  let base64 = '';
  for (let index = 0; index < xor.length; index += 1) {
    base64 += String.fromCharCode(xor.charCodeAt(index) ^ key);
  }
  return Buffer.from(base64, 'base64').toString('utf8');
}

async function postChat(endpoint, text, options = {}) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), options.timeoutMs);
  const conversationId = options.conversationId || `uat-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
  const payload = { action: 'chat', text, session_id: conversationId, conversationId, resetConversationId: '', files: [], history: '' };
  const gatewayTransport = options.transport === 'gateway';
  const requestBody = gatewayTransport
    ? {
        data: cipherEncrypt(JSON.stringify({
          method: 'POST',
          endpoint: options.webhookPath || '/webhook/hook-ai-dainao',
          body: payload,
        })),
      }
    : payload;
  const started = Date.now();
  try {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        ...(options.token ? { authorization: `Bearer ${options.token}` } : {}),
        ...(options.apiKey ? { 'x-api-key': options.apiKey } : {}),
      },
      body: JSON.stringify(requestBody), signal: controller.signal,
    });
    const bodyText = await response.text();
    let body = null;
    let jsonError = null;
    try {
      body = bodyText ? JSON.parse(bodyText) : null;
      if (gatewayTransport && body && typeof body.data === 'string') {
        body = JSON.parse(cipherDecrypt(body.data));
      }
    }
    catch (error) { jsonError = error.message; }
    return { httpStatus: response.status, latencyMs: Date.now() - started, body, bodyText, jsonError };
  } catch (error) {
    return { httpStatus: 0, latencyMs: Date.now() - started, error: error.name === 'AbortError' ? 'TIMEOUT' : error.message };
  } finally { clearTimeout(timeout); }
}

function evaluateLiveResult(test, response) {
  if (response.error) return { pass: false, reason: response.error };
  if (response.httpStatus < 200 || response.httpStatus >= 300) return { pass: false, reason: `HTTP_${response.httpStatus}` };
  if (response.jsonError || !response.body) return { pass: false, reason: 'INVALID_OR_EMPTY_JSON' };
  const normalized = normalizeResponse(response.body);
  if (normalized.auth001) return { pass: false, reason: 'AUTH001' };
  if (normalized.systemError) return { pass: false, reason: 'SYSTEM_ERROR' };
  if (test.expectedApi && normalized.apiCode && normalized.apiCode !== test.expectedApi.toLowerCase()) {
    return { pass: false, reason: `WRONG_API:${normalized.apiCode}` };
  }
  if (!test.allowClarification && /ASK_CLARIFICATION|VALIDATION_ERROR/.test(normalized.status)) {
    return { pass: false, reason: normalized.status || 'UNEXPECTED_CLARIFICATION' };
  }
  return { pass: true, reason: normalized.apiCode ? `API:${normalized.apiCode}` : (normalized.status || 'JSON_OK') };
}

async function runLive(args, profile = 'functional') {
  const transport = args.transport || process.env.MEDSTAND_CHAT_TRANSPORT || 'proxy';
  const endpoint = args.endpoint || process.env.MEDSTAND_CHAT_ENDPOINT
    || (transport === 'gateway' ? 'http://localhost:3000/api/gateway' : 'http://localhost:3000/api/chat');
  const token = args.token || process.env.MEDSTAND_AUTH_TOKEN || '';
  if (!token && !args.allowUnauthenticated) {
    throw new Error('Authenticated live test requires MEDSTAND_AUTH_TOKEN or --token. Use auth-gate to test anonymous access.');
  }
  const apiKey = args.apiKey || process.env.MEDSTAND_CHAT_API_KEY || '';
  const timeoutMs = Number(args.timeout || process.env.MEDSTAND_TEST_TIMEOUT_MS || 15000);
  const selected = liveCases.filter((test) => profile !== 'smoke' || test.smoke);
  const results = [];
  for (const test of selected) {
    const text = substitute(test.text, args);
    const response = await postChat(endpoint, text, {
      token,
      apiKey,
      timeoutMs,
      transport,
      webhookPath: args.webhook || '/webhook/hook-ai-dainao',
    });
    results.push({ id: test.id, text, expectedApi: test.expectedApi, ...response, ...evaluateLiveResult(test, response) });
    if (Number(args.delay || 100) > 0) await new Promise((resolve) => setTimeout(resolve, Number(args.delay || 100)));
  }
  const latencies = results.filter((item) => item.httpStatus > 0).map((item) => item.latencyMs);
  const passed = results.filter((item) => item.pass).length;
  return {
    ok: passed === results.length,
    summary: {
      suite: `live-${profile}`, endpoint, transport, authenticated: Boolean(token), total: results.length, passed,
      failed: results.length - passed, p50Ms: percentile(latencies, 50), p95Ms: percentile(latencies, 95),
      maxMs: latencies.length ? Math.max(...latencies) : 0,
      failures: results.filter((item) => !item.pass).map(({ body, bodyText, ...item }) => item),
    },
  };
}

async function runLoad(args) {
  const transport = args.transport || process.env.MEDSTAND_CHAT_TRANSPORT || 'proxy';
  const endpoint = args.endpoint || process.env.MEDSTAND_CHAT_ENDPOINT
    || (transport === 'gateway' ? 'http://localhost:3000/api/gateway' : 'http://localhost:3000/api/chat');
  const remote = !isLocalEndpoint(endpoint);
  if (remote && !args.allowRemoteLoad) throw new Error('Remote load test is locked. Add --allow-remote-load after receiving server-owner approval.');
  const concurrency = Math.max(1, Math.min(Number(args.concurrency || 4), args.allowHighLoad ? 50 : 10));
  const total = Math.max(1, Math.min(Number(args.requests || 40), args.allowHighLoad ? 5000 : 200));
  const timeoutMs = Number(args.timeout || 15000);
  const token = args.token || process.env.MEDSTAND_AUTH_TOKEN || '';
  if (!token && !args.allowUnauthenticated) {
    throw new Error('Authenticated chat load requires MEDSTAND_AUTH_TOKEN or --token.');
  }
  const apiKey = args.apiKey || process.env.MEDSTAND_CHAT_API_KEY || '';
  const workload = liveCases.filter((item) => item.smoke && item.id !== 'missing-customer');
  const results = new Array(total);
  let cursor = 0;
  async function worker(workerId) {
    while (true) {
      const index = cursor++;
      if (index >= total) return;
      const test = workload[index % workload.length];
      const text = substitute(test.text, args);
      const response = await postChat(endpoint, text, {
        token,
        apiKey,
        timeoutMs,
        transport,
        webhookPath: args.webhook || '/webhook/hook-ai-dainao',
        conversationId: `load-${Date.now()}-${workerId}-${index}`,
      });
      results[index] = { ...response, ...evaluateLiveResult(test, response) };
    }
  }
  const started = Date.now();
  await Promise.all(Array.from({ length: concurrency }, (_, index) => worker(index + 1)));
  const durationMs = Date.now() - started;
  const latencies = results.map((item) => item.latencyMs);
  const passed = results.filter((item) => item.pass).length;
  const successRate = (passed / total) * 100;
  const p95Ms = percentile(latencies, 95);
  const minSuccessRate = Number(args.minSuccessRate || 99);
  const maxP95Ms = Number(args.maxP95 || 5000);
  const failureReasons = {};
  for (const item of results.filter((entry) => !entry.pass)) failureReasons[item.reason] = (failureReasons[item.reason] || 0) + 1;
  return {
    ok: successRate >= minSuccessRate && p95Ms <= maxP95Ms,
    summary: {
      suite: 'controlled-load', endpoint, transport, remote, total, concurrency, durationMs,
      throughputRps: Number((total / (durationMs / 1000)).toFixed(2)), successRate: Number(successRate.toFixed(2)),
      p50Ms: percentile(latencies, 50), p95Ms, p99Ms: percentile(latencies, 99), maxMs: Math.max(...latencies),
      thresholds: { minSuccessRate, maxP95Ms }, failureReasons,
    },
  };
}

async function runInfraLoad(args) {
  const targets = [
    args.web || process.env.MEDSTAND_WEB_URL || 'http://localhost:3000/',
    args.n8nHealth || process.env.MEDSTAND_N8N_HEALTH_URL || 'http://localhost:5678/healthz',
  ];
  const remote = targets.some((url) => !isLocalEndpoint(url));
  if (remote && !args.allowRemoteLoad) {
    throw new Error('Remote infrastructure load test is locked. Add --allow-remote-load after receiving server-owner approval.');
  }
  const concurrency = Math.max(1, Math.min(Number(args.concurrency || 10), args.allowHighLoad ? 100 : 20));
  const requestsPerTarget = Math.max(1, Math.min(Number(args.requests || 100), args.allowHighLoad ? 10000 : 500));
  const timeoutMs = Number(args.timeout || 5000);
  const results = [];

  for (const url of targets) {
    const samples = new Array(requestsPerTarget);
    let cursor = 0;
    async function worker() {
      while (true) {
        const index = cursor++;
        if (index >= requestsPerTarget) return;
        const started = Date.now();
        try {
          const response = await fetch(url, { signal: AbortSignal.timeout(timeoutMs) });
          await response.arrayBuffer();
          samples[index] = { pass: response.ok, status: response.status, latencyMs: Date.now() - started };
        } catch (error) {
          samples[index] = { pass: false, status: 0, latencyMs: Date.now() - started, error: error.message };
        }
      }
    }

    const started = Date.now();
    await Promise.all(Array.from({ length: concurrency }, () => worker()));
    const durationMs = Date.now() - started;
    const latencies = samples.map((item) => item.latencyMs);
    const passed = samples.filter((item) => item.pass).length;
    const statusCounts = {};
    for (const item of samples) statusCounts[item.status] = (statusCounts[item.status] || 0) + 1;
    results.push({
      url,
      requests: requestsPerTarget,
      concurrency,
      passed,
      failed: requestsPerTarget - passed,
      successRate: Number(((passed / requestsPerTarget) * 100).toFixed(2)),
      durationMs,
      throughputRps: Number((requestsPerTarget / Math.max(durationMs / 1000, 0.001)).toFixed(2)),
      p50Ms: percentile(latencies, 50),
      p95Ms: percentile(latencies, 95),
      p99Ms: percentile(latencies, 99),
      maxMs: Math.max(...latencies),
      statusCounts,
    });
  }

  const minSuccessRate = Number(args.minSuccessRate || 99.9);
  const maxP95Ms = Number(args.maxP95 || 1000);
  return {
    ok: results.every((item) => item.successRate >= minSuccessRate && item.p95Ms <= maxP95Ms),
    summary: {
      suite: 'infrastructure-load',
      remote,
      thresholds: { minSuccessRate, maxP95Ms },
      results,
      note: 'This checks HTTP availability only; authenticated chat load must use the load command.',
    },
  };
}

async function runHealth(args) {
  const targets = [
    args.web || process.env.MEDSTAND_WEB_URL || 'http://localhost:3000/',
    args.n8nHealth || process.env.MEDSTAND_N8N_HEALTH_URL || 'http://localhost:5678/healthz',
  ];
  const results = [];
  for (const url of targets) {
    const started = Date.now();
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(Number(args.timeout || 5000)) });
      results.push({ url, status: response.status, latencyMs: Date.now() - started, pass: response.ok });
    } catch (error) { results.push({ url, status: 0, latencyMs: Date.now() - started, pass: false, error: error.message }); }
  }
  return { ok: results.every((item) => item.pass), summary: { suite: 'health', total: results.length, results } };
}

async function runAuthGate(args) {
  const transport = args.transport || process.env.MEDSTAND_CHAT_TRANSPORT || 'proxy';
  const endpoint = args.endpoint || process.env.MEDSTAND_CHAT_ENDPOINT
    || (transport === 'gateway' ? 'http://localhost:3000/api/gateway' : 'http://localhost:3000/api/chat');
  const response = await postChat(endpoint, 'doanh số hôm nay', {
    timeoutMs: Number(args.timeout || 15000),
    transport,
    webhookPath: args.webhook || '/webhook/hook-ai-dainao',
  });
  const normalized = normalizeResponse(response.body);
  const rejectedByHttp = [401, 403].includes(response.httpStatus);
  const rejectedByContract = /AUTH|UNAUTHORIZED|FORBIDDEN|OUT_OF_SCOPE/i.test(
    `${normalized.status} ${normalized.text}`,
  );
  const pass = rejectedByHttp || rejectedByContract;
  return {
    ok: pass,
    summary: {
      suite: 'anonymous-auth-gate',
      endpoint,
      transport,
      pass,
      httpStatus: response.httpStatus,
      latencyMs: response.latencyMs,
      observedCode: normalized.status || null,
      expected: 'HTTP 401/403 or an authentication/authorization error contract',
      risk: pass ? null : 'Anonymous request reached a successful chatbot response.',
    },
  };
}

function printResult(result) {
  console.log(JSON.stringify(result.summary, null, 2));
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.command === 'list') {
    console.log(JSON.stringify({ classifierCases: classifierCases.length, liveCases }, null, 2));
    return;
  }
  const runners = {
    static: () => Promise.resolve(runStaticClassifier()),
    resilience: () => runResilience(),
    health: () => runHealth(args),
    'auth-gate': () => runAuthGate(args),
    smoke: () => runLive(args, 'smoke'),
    live: () => runLive(args, 'functional'),
    load: () => runLoad(args),
    'infra-load': () => runInfraLoad(args),
  };
  let result;
  if (args.command === 'all') {
    const parts = [];
    for (const name of ['static', 'resilience', 'health', 'auth-gate']) parts.push(await runners[name]());
    if (args.includeLive) parts.push(await runners.live());
    if (args.includeLoad) parts.push(await runners.load());
    result = { ok: parts.every((item) => item.ok), summary: { suite: 'all', parts: parts.map((item) => item.summary) } };
  } else {
    if (!runners[args.command]) throw new Error(`Unknown command: ${args.command}`);
    result = await runners[args.command]();
  }
  printResult(result);
  if (args.report) {
    const reportPath = path.resolve(ROOT, args.report);
    fs.mkdirSync(path.dirname(reportPath), { recursive: true });
    fs.writeFileSync(reportPath, `${JSON.stringify(result.summary, null, 2)}\n`, 'utf8');
  }
  if (!result.ok) process.exitCode = 1;
}

main().catch((error) => {
  console.error(JSON.stringify({ status: 'TEST_RUNNER_ERROR', message: error.message }, null, 2));
  process.exitCode = 1;
});
