'use strict';

/* Browser UAT for CORE-007/008/009. Read-only: never confirms or creates an order. */
const fs = require('fs');
const path = require('path');
const net = require('net');
const { spawn } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const OUTPUT_DIR = path.join(ROOT, 'reports', 'phase1-browser-uat-2026-08-09');
const BASE_URL = process.env.MEDSTAND_UI_URL || 'https://medtest.bms7.net';
const CHROME_PATHS = [
  process.env.CHROME_PATH,
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
].filter(Boolean);

function readEnv(relativePath) {
  const values = {};
  const filePath = path.join(ROOT, relativePath);
  if (!fs.existsSync(filePath)) return values;
  for (const line of fs.readFileSync(filePath, 'utf8').split(/\r?\n/)) {
    const match = line.match(/^\s*([^#=]+)=(.*)$/);
    if (match) values[match[1].trim()] = match[2].trim().replace(/^['"]|['"]$/g, '');
  }
  return values;
}

function decrypt(value, key = 107) {
  const xor = Buffer.from(String(value), 'base64').toString('utf8');
  let base64 = '';
  for (const character of xor) base64 += String.fromCharCode(character.charCodeAt(0) ^ key);
  return Buffer.from(base64, 'base64').toString('utf8');
}

function encrypt(value, key = 107) {
  const base64 = Buffer.from(String(value), 'utf8').toString('base64');
  let xor = '';
  for (const character of base64) xor += String.fromCharCode(character.charCodeAt(0) ^ key);
  return Buffer.from(xor, 'utf8').toString('base64');
}

function findToken(value) {
  if (!value || typeof value !== 'object') return '';
  for (const key of ['access_token', 'accessToken', 'AccessToken', 'token']) {
    if (typeof value[key] === 'string' && value[key].trim()) return value[key].trim();
  }
  for (const child of Object.values(value)) {
    const token = findToken(child);
    if (token) return token;
  }
  return '';
}

async function gatewayLogin(username, password) {
  const response = await fetch(`${BASE_URL}/api/gateway`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ data: encrypt(JSON.stringify({ method: 'POST', endpoint: '/api/login', body: { username, password } })) }),
    signal: AbortSignal.timeout(30000),
  });
  let payload = JSON.parse(await response.text());
  if (payload && typeof payload.data === 'string') payload = JSON.parse(decrypt(payload.data));
  const token = findToken(payload);
  if (!response.ok || !token) throw new Error(`Gateway login failed for ${username} (HTTP ${response.status}).`);
  return { token, payload };
}

function decodeGatewayBody(raw) {
  try {
    const outer = JSON.parse(raw || '{}');
    return outer && typeof outer.data === 'string' ? JSON.parse(decrypt(outer.data)) : outer;
  } catch (_) {
    return null;
  }
}

function freePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const port = server.address().port;
      server.close(() => resolve(port));
    });
  });
}

async function waitFor(fn, timeoutMs, message) {
  const deadline = Date.now() + timeoutMs;
  let lastError;
  while (Date.now() < deadline) {
    try {
      const value = await fn();
      if (value) return value;
    } catch (error) {
      lastError = error;
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error(`${message}${lastError ? `: ${lastError.message}` : ''}`);
}

class CdpClient {
  constructor(url) {
    this.url = url;
    this.nextId = 1;
    this.pending = new Map();
  }

  async connect() {
    await new Promise((resolve, reject) => {
      this.socket = new WebSocket(this.url);
      this.socket.onopen = resolve;
      this.socket.onerror = () => reject(new Error('Unable to connect to Chrome DevTools.'));
      this.socket.onmessage = (event) => {
        const message = JSON.parse(event.data);
        if (!message.id) return;
        const pending = this.pending.get(message.id);
        if (!pending) return;
        this.pending.delete(message.id);
        if (message.error) pending.reject(new Error(message.error.message));
        else pending.resolve(message.result || {});
      };
    });
  }

  send(method, params = {}) {
    const id = this.nextId++;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.socket.send(JSON.stringify({ id, method, params }));
    });
  }

  close() {
    if (this.socket) this.socket.close();
  }
}

async function evaluate(cdp, expression, awaitPromise = false) {
  const result = await cdp.send('Runtime.evaluate', {
    expression,
    awaitPromise,
    returnByValue: true,
    userGesture: true,
  });
  if (result.exceptionDetails) throw new Error(result.exceptionDetails.text || 'Browser evaluation failed.');
  return result.result ? result.result.value : undefined;
}

async function waitForSelector(cdp, selector, timeoutMs = 45000) {
  return waitFor(async () => evaluate(cdp, `Boolean(document.querySelector(${JSON.stringify(selector)}))`), timeoutMs, `Selector not found: ${selector}`);
}

async function waitForReady(cdp) {
  await waitFor(async () => evaluate(cdp, 'document.readyState === "complete"'), 45000, 'Page did not finish loading');
}

async function navigate(cdp, url) {
  await cdp.send('Page.navigate', { url });
  await waitForReady(cdp);
}

async function screenshot(cdp, fileName) {
  const result = await cdp.send('Page.captureScreenshot', {
    format: 'png',
    captureBeyondViewport: true,
    fromSurface: true,
  });
  fs.writeFileSync(path.join(OUTPUT_DIR, fileName), Buffer.from(result.data, 'base64'));
}

async function sendChat(cdp, text) {
  await waitForSelector(cdp, '#chat-input');
  await evaluate(cdp, `(() => {
    const input = document.querySelector('#chat-input');
    input.value = ${JSON.stringify(text)};
    input.dispatchEvent(new Event('input', { bubbles: true }));
    document.querySelector('#btn-send').click();
    return true;
  })()`);
}

function normalizeEvidence(items) {
  const normalized = [];
  for (const item of items || []) {
    const requestOuter = decodeGatewayBody(item.requestBody);
    const request = requestOuter && requestOuter.endpoint ? requestOuter : null;
    const response = decodeGatewayBody(item.responseBody);
    if (!request || !response) continue;
    normalized.push({
      endpoint: request.endpoint || null,
      apiCode: request.body?.ApiCode || response.ApiCode || null,
      requestId: response.requestId || response.RequestID || null,
      status: response.status || response.code || null,
      rowCount: Array.isArray(response.data) ? response.data.length : null,
      data: Array.isArray(response.data) ? response.data : [],
    });
  }
  return normalized;
}

async function pullEvidence(cdp) {
  const raw = await evaluate(cdp, 'window.__phase1FetchEvidence.splice(0)');
  return normalizeEvidence(raw);
}

async function waitForApiEvidence(cdp, apiCode, timeoutMs = 60000) {
  const collected = [];
  return waitFor(async () => {
    collected.push(...await pullEvidence(cdp));
    const match = [...collected].reverse().find((item) => String(item.apiCode).toLowerCase() === apiCode.toLowerCase());
    return match || null;
  }, timeoutMs, `No browser response evidence for ${apiCode}`);
}

async function main() {
  const env = { ...readEnv('.env.uat.local'), ...process.env };
  const username = env.PHASE1_BROWSER_USER || 'QLBH013.MED';
  if (!env.UAT_TEST_PASSWORD) throw new Error('Missing UAT_TEST_PASSWORD in .env.uat.local.');
  const chromePath = CHROME_PATHS.find((candidate) => fs.existsSync(candidate));
  if (!chromePath) throw new Error('Google Chrome executable was not found.');

  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  const port = await freePort();
  const profile = path.join(ROOT, '.runtime-backups', `phase1-browser-${Date.now()}`);
  fs.mkdirSync(profile, { recursive: true });
  const chrome = spawn(chromePath, [
    '--headless=new',
    '--disable-gpu',
    '--disable-background-networking',
    '--no-first-run',
    '--no-default-browser-check',
    '--ignore-certificate-errors',
    `--remote-debugging-port=${port}`,
    `--user-data-dir=${profile}`,
    '--window-size=1440,1100',
    'about:blank',
  ], { stdio: 'ignore', windowsHide: true });

  let cdp;
  try {
    const target = await waitFor(async () => {
      const response = await fetch(`http://127.0.0.1:${port}/json/list`);
      const targets = await response.json();
      return targets.find((item) => item.type === 'page' && item.webSocketDebuggerUrl) || null;
    }, 15000, 'Chrome DevTools endpoint did not start');

    cdp = new CdpClient(target.webSocketDebuggerUrl);
    await cdp.connect();
    await cdp.send('Page.enable');
    await cdp.send('Runtime.enable');
    await cdp.send('Log.enable');
    await cdp.send('Security.setIgnoreCertificateErrors', { ignore: true });
    await cdp.send('Emulation.setDeviceMetricsOverride', {
      width: 1440,
      height: 1100,
      deviceScaleFactor: 1,
      mobile: false,
    });

    const login = await gatewayLogin(username, env.UAT_TEST_PASSWORD);
    await navigate(cdp, `${BASE_URL}/pages/login.html`);
    const userInfo = login.payload?.records?.[0] || {
      UserName: login.payload?.UserName || username,
      DisplayName: login.payload?.DisplayName || username,
    };
    await evaluate(cdp, `(() => {
      document.cookie = 'auth_token=' + encodeURIComponent(${JSON.stringify(login.token)}) + ';path=/;SameSite=Strict;Secure';
      localStorage.setItem('auth_user', ${JSON.stringify(JSON.stringify(userInfo))});
      return true;
    })()`);
    await cdp.send('Page.navigate', { url: `${BASE_URL}/index.html#/home` });
    await waitForReady(cdp);
    await waitFor(async () => evaluate(cdp, 'location.hash.includes("/home") && Boolean(document.cookie.match(/auth_token=/))'), 45000, 'Browser session injection did not complete');

    await navigate(cdp, `${BASE_URL}/#/chatbot`);
    try {
      await waitForSelector(cdp, '#chat-input', 60000);
    } catch (error) {
      const routeState = await evaluate(cdp, `({
        url: location.href,
        title: document.title,
        cookieNames: document.cookie.split(';').map((part) => part.split('=')[0].trim()).filter(Boolean),
        bodyPage: document.body.getAttribute('data-page'),
        appText: document.querySelector('#app-content')?.innerText?.slice(0, 1200) || '',
        appHtml: document.querySelector('#app-content')?.innerHTML?.slice(0, 1200) || ''
      })`);
      await screenshot(cdp, 'CHATBOT-ROUTE-ERROR.png');
      throw new Error(`${error.message}: ${JSON.stringify(routeState)}`);
    }
    try {
      await waitFor(async () => evaluate(cdp, 'Boolean(window.ApiEngine)'), 60000, 'Chatbot API runtime did not initialize');
    } catch (error) {
      const chatbotState = await evaluate(cdp, `({
        url: location.href,
        title: document.title,
        apiEngineType: typeof window.ApiEngine,
        orderDraftType: typeof window.MedstandOrderDraft,
        bodyPage: document.body.getAttribute('data-page'),
        bodyText: document.body.innerText.slice(0, 1200),
        scripts: Array.from(document.scripts).map((script) => script.src).filter(Boolean),
        resources: performance.getEntriesByType('resource').filter((entry) => entry.name.includes('chatbot')).map((entry) => ({ name: entry.name, duration: entry.duration, transferSize: entry.transferSize }))
      })`);
      await screenshot(cdp, 'CHATBOT-RUNTIME-ERROR.png');
      throw new Error(`${error.message}: ${JSON.stringify(chatbotState)}`);
    }
    await evaluate(cdp, `(() => {
      window.__phase1FetchEvidence = [];
      const originalFetch = window.fetch.bind(window);
      window.fetch = async function(input, init) {
        const response = await originalFetch(input, init);
        const copy = response.clone();
        copy.text().then((responseBody) => {
          window.__phase1FetchEvidence.push({
            url: typeof input === 'string' ? input : input.url,
            requestBody: init && typeof init.body === 'string' ? init.body : '',
            responseBody
          });
        }).catch(() => {});
        return response;
      };
      return true;
    })()`);

    const runtimeState = await evaluate(cdp, `({
      apiEngineType: typeof window.ApiEngine,
      orderDraftType: typeof window.MedstandOrderDraft,
      scripts: Array.from(document.scripts).map((script) => script.src).filter(Boolean)
    })`);
    const deployedVersions = [...new Set(runtimeState.scripts
      .map((src) => src.match(/[?&]v=([^&]+)/)?.[1])
      .filter(Boolean))];
    const result = {
      task: 'PHASE1-BROWSER-UAT',
      mode: 'HEADLESS_CHROME_READ_ONLY',
      uiUrl: BASE_URL,
      username,
      mutationExecuted: false,
      runtime: { ...runtimeState, deployedVersions },
      core007: [],
      core007Status: null,
      core008: [],
      core008Status: null,
      core009: null,
    };

    await sendChat(cdp, 'chấm điểm khách hàng');
    const initialScoringEvidence = await waitForApiEvidence(cdp, '@cham_diem_kh');
    try {
      await waitForSelector(cdp, '[data-tier-filter="tier"]', 15000);
      for (const tier of ['A', 'B', 'C', 'UNRATED']) {
        await evaluate(cdp, `(() => {
          const select = document.querySelector('[data-tier-filter="tier"]');
          select.value = ${JSON.stringify(tier)};
          select.dispatchEvent(new Event('change', { bubbles: true }));
          return true;
        })()`);
        const evidence = await waitForApiEvidence(cdp, '@cham_diem_kh');
        const foreignRows = evidence.data.filter((row) => String(row.Nhom || row.ValueSegment).toUpperCase() !== tier).length;
        if (!evidence.requestId || !evidence.data.length || foreignRows) throw new Error(`CORE-007 browser filter ${tier} failed.`);
        await screenshot(cdp, `CORE-007-${tier}.png`);
        result.core007.push({ tier, requestId: evidence.requestId, rowCount: evidence.data.length, foreignRows, screenshot: `CORE-007-${tier}.png` });
      }
      result.core007Status = 'PASS';
    } catch (error) {
      await screenshot(cdp, 'CORE-007-BLOCKED.png');
      result.core007Status = {
        status: 'BLOCKED_DEPLOYMENT',
        reason: error.message,
        requestId: initialScoringEvidence.requestId,
        deployedVersions,
        screenshot: 'CORE-007-BLOCKED.png',
      };
    }

    await sendChat(cdp, 'gợi ý đơn hàng cho UATV2_NDB_A');
    let recommendationEvidence = null;
    let recommendationError = '';
    try {
      recommendationEvidence = await waitForApiEvidence(cdp, '@goi_ydon_hang');
    } catch (error) {
      recommendationError = error.message;
    }
    const browserText = await evaluate(cdp, 'document.querySelector("#chat-messages").innerText');
    const visualFields = ['Lần mua cuối', 'Chu kỳ', 'Ngày dự kiến', 'Lý do', 'Nguồn'].filter((label) => browserText.includes(label));
    const recommendationButton = await evaluate(cdp, 'Boolean(document.querySelector(".ai-order-draft-add-btn"))');
    await screenshot(cdp, recommendationEvidence && recommendationButton && visualFields.length >= 4 ? 'CORE-008-recommendation.png' : 'CORE-008-BLOCKED.png');
    if (recommendationEvidence && recommendationEvidence.requestId && recommendationButton && visualFields.length >= 4) {
      result.core008.push({
        case: 'ORDER_RECOMMENDATION',
        requestId: recommendationEvidence.requestId,
        rowCount: recommendationEvidence.data.length,
        visualFields,
        screenshot: 'CORE-008-recommendation.png',
      });
      result.core008Status = 'PASS';
    } else {
      result.core008Status = {
        status: 'BLOCKED_DEPLOYMENT',
        reason: recommendationError || `Recommendation UI is incomplete; addButton=${recommendationButton}, fields=${visualFields.join(', ')}`,
        requestId: recommendationEvidence?.requestId || null,
        deployedVersions,
        screenshot: 'CORE-008-BLOCKED.png',
      };
    }

    if (runtimeState.orderDraftType === 'undefined') {
      result.core009 = {
        status: 'BLOCKED_DEPLOYMENT',
        reason: 'window.MedstandOrderDraft is unavailable in the deployed frontend.',
        deployedVersions,
      };
      result.status = 'BLOCKED_DEPLOYMENT';
      fs.writeFileSync(path.join(OUTPUT_DIR, 'summary.json'), `${JSON.stringify(result, null, 2)}\n`);
      console.log(JSON.stringify(result, null, 2));
      process.exitCode = 2;
      return;
    }

    const mutationCountBefore = (await evaluate(cdp, 'window.__phase1FetchEvidence.length')) || 0;
    await evaluate(cdp, `(() => {
      const button = document.querySelector('.ai-order-draft-add-btn');
      button.click();
      return true;
    })()`);
    await waitFor(async () => evaluate(cdp, 'Boolean(window.MedstandOrderDraft.getDraft && window.MedstandOrderDraft.getDraft())'), 10000, 'CORE-009 draft was not created');
    await sendChat(cdp, 'Đổi sản phẩm 1 thành 2');
    await new Promise((resolve) => setTimeout(resolve, 750));
    await sendChat(cdp, 'Xem lại đơn');
    await waitFor(async () => evaluate(cdp, 'Boolean(document.querySelector(".ae-panel, .api-engine-panel, [data-api-code=\\"@lap_don_hang\\"]")) || document.body.innerText.includes("Xem trước đơn hàng")'), 30000, 'CORE-009 preview did not open');
    const draft = await evaluate(cdp, 'window.MedstandOrderDraft.getDraft ? window.MedstandOrderDraft.getDraft() : null');
    const laterEvidence = await pullEvidence(cdp);
    const mutationCalls = laterEvidence.filter((item) => item.endpoint === '/api/API_DonHangChiTiet_Insert_AI');
    if (!draft || !draft.items || !draft.items.length || mutationCalls.length) throw new Error('CORE-009 browser draft/preview safety check failed.');
    await screenshot(cdp, 'CORE-009-draft-preview.png');
    result.core009 = {
      requestId: draft.requestId || recommendationEvidence.requestId,
      draftId: draft.draftId,
      draftVersion: draft.draftVersion,
      itemCount: draft.items.length,
      mutationCalls: mutationCalls.length,
      fetchEvidenceCountBeforePreview: mutationCountBefore,
      screenshot: 'CORE-009-draft-preview.png',
    };

    result.status = result.core007.length === 4
      && result.core008.length === 1
      && result.core009.mutationCalls === 0 ? 'PASS' : 'FAIL';
    fs.writeFileSync(path.join(OUTPUT_DIR, 'summary.json'), `${JSON.stringify(result, null, 2)}\n`);
    console.log(JSON.stringify(result, null, 2));
    if (result.status !== 'PASS') process.exitCode = 1;
  } finally {
    if (cdp) cdp.close();
    chrome.kill();
    await new Promise((resolve) => setTimeout(resolve, 500));
    if (chrome.exitCode === null) chrome.kill('SIGKILL');
    fs.rmSync(profile, { recursive: true, force: true });
  }
}

main().catch((error) => {
  console.error(JSON.stringify({
    task: 'PHASE1-BROWSER-UAT',
    status: 'ERROR',
    mutationExecuted: false,
    error: error.message,
  }, null, 2));
  process.exitCode = 1;
});
